'use strict'
/**
 * user-live — 移动端直播云函数
 *
 * 数据源: https://www.dnymrhz.com（斗球）
 *   GET /live            -> SSR __NEXT_DATA__：直播间列表 + 赛程池
 *   GET /live/{roomId}   -> SSR __NEXT_DATA__：该房间最新 m3u8 播放链
 *
 * 接口(前端 uniCloud.callFunction):
 *   { action: 'list', matchIds: [] }  -> 我方赛事中可看直播的场次
 *   { action: 'live' }                -> 当前正在直播的足球场次(列表页顶部)
 *   { action: 'play', matchId?, roomId? } -> 实时获取最新播放链
 *
 * 说明:
 *   - auth_info 签名的 m3u8 会过期，所以 play 每次都实时抓房间页，不缓存 playUrl
 *   - /live 列表缓存 2 分钟；抓取失败时最多回退使用 10 分钟内的旧缓存
 *   - 站点改版/字段缺失会抛错并打日志，不会静默返回空数据
 */
const https = require('https')
const db = uniCloud.database()
const cmd = db.command
const { success, fail, verifyToken } = require('./utils')
const {
  TIME_WINDOW_MS,
  LIVE_PRE_GAME_WINDOW_MS,
  parseNextData,
  buildLiveEntries,
  matchMatches,
  filterMatchedEntries,
  extractRoomDetail,
  pickDefaultQuality
} = require('./live-core')

const BASE = 'https://www.dnymrhz.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36'
const LIST_TTL_MS = 2 * 60 * 1000
const STALE_MAX_MS = 10 * 60 * 1000
const MAX_MATCH_IDS = 200
const MAX_LIVE_GROUPS = 12

let liveCache = null
let liveInflight = null

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ==================== HTTP ====================

function requestText(url, depth) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: 6000,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }
    }, (res) => {
      const code = res.statusCode
      if (code >= 300 && code < 400 && res.headers.location && depth > 0) {
        res.resume()
        const loc = res.headers.location
        let next = loc
        if (/^https?:\/\//i.test(loc)) next = loc
        else if (loc.indexOf('//') === 0) next = 'https:' + loc
        else next = BASE + (loc.charAt(0) === '/' ? loc : '/' + loc)
        return resolve(requestText(next, depth - 1))
      }
      if (code !== 200) {
        res.resume()
        const err = new Error('HTTP ' + code + ' ' + url)
        err.statusCode = code
        return reject(err)
      }
      let body = ''
      res.setEncoding('utf-8')
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve(body))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('请求超时: ' + url)))
    req.on('error', reject)
  })
}

/** 403/5xx/网络错误最多请求 3 次(失败间隔 1s/3s)，其它 4xx 直接失败 */
async function fetchWithRetry(url) {
  let lastErr = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await requestText(url, 2)
    } catch (e) {
      lastErr = e
      const code = e && e.statusCode
      const retryable = !code || code === 403 || code >= 500
      if (!retryable || attempt === 2) break
      await sleep(attempt === 0 ? 1000 : 3000)
    }
  }
  throw lastErr || new Error('请求失败: ' + url)
}

// ==================== 缓存 ====================

/**
 * 获取 /live 的直播场次
 * @param {boolean} force 忽略缓存强制刷新
 */
async function getLiveData(force) {
  const now = Date.now()
  if (!force && liveCache && now - liveCache.fetchedAt < LIST_TTL_MS) return liveCache
  if (liveInflight) return liveInflight

  liveInflight = (async () => {
    try {
      const html = await fetchWithRetry(BASE + '/live')
      const pageProps = parseNextData(html)
      const entries = buildLiveEntries(pageProps)
      if (!entries.length) {
        console.warn('[user-live] /live 未解析到任何直播场次，斗球站点可能已改版')
      }
      liveCache = { fetchedAt: Date.now(), entries }
      return liveCache
    } catch (e) {
      if (liveCache && Date.now() - liveCache.fetchedAt < STALE_MAX_MS) {
        console.warn('[user-live] /live 拉取失败，使用旧缓存:', e.message)
        return liveCache
      }
      throw e
    }
  })()

  try {
    const result = await liveInflight
    liveInflight = null
    return result
  } catch (e) {
    liveInflight = null
    throw e
  }
}

async function fetchRoomDetail(roomId) {
  const html = await fetchWithRetry(BASE + '/live/' + encodeURIComponent(roomId))
  return extractRoomDetail(parseNextData(html))
}

// ==================== 组装返回 ====================

function publicRooms(rooms) {
  return (rooms || []).slice(0, 8).map(r => ({
    roomId: r.roomId,
    nickName: r.nickName || '',
    hot: r.hot || 0,
    status: r.status || 0
  }))
}

function buildMatchInfo(entry, myMatch) {
  if (myMatch) {
    const start = new Date(myMatch.startTime).getTime()
    return {
      leagueName: myMatch.leagueName || myMatch.name || '',
      hostTeamName: myMatch.teamA || '',
      guestTeamName: myMatch.teamB || '',
      startTime: myMatch.startTime,
      matchTime: isFinite(start) ? start : null
    }
  }
  if (entry) {
    return {
      leagueName: entry.leagueName || '',
      hostTeamName: entry.hostTeamName || '',
      guestTeamName: entry.guestTeamName || '',
      matchTime: entry.matchTime || null
    }
  }
  return null
}

// ==================== 业务 ====================

/** 我方赛事列表 -> 可看直播的场次 */
async function actionList(event) {
  let ids = event.matchIds
  if (typeof ids === 'string') {
    try { ids = JSON.parse(ids) } catch (e) { ids = [] }
  }
  if (!Array.isArray(ids)) ids = []
  ids = ids.map(String).filter(Boolean).slice(0, MAX_MATCH_IDS)
  if (!ids.length) return success({ lives: [], updatedAt: Date.now() })

  const res = await db.collection('matches')
    .where({ _id: cmd.in(ids), deleted: cmd.neq(true) })
    .field({
      _id: 1,
      name: 1,
      teamA: 1,
      teamB: 1,
      startTime: 1,
      leagueName: 1,
      status: 1
    })
    .limit(MAX_MATCH_IDS)
    .get()
  const matches = res.data || []
  if (!matches.length) return success({ lives: [], updatedAt: Date.now() })

  const page = await getLiveData()
  const hits = matchMatches(matches, page.entries, Date.now())
  const lives = []
  for (const hit of hits) {
    const usableRooms = hit.entry.rooms.filter(r => r.status === 1 || r.hasPlayAddr)
    if (!usableRooms.length) continue
    lives.push({
      matchId: hit.matchId,
      score: hit.score,
      doveMatchId: hit.entry.matchId,
      leagueName: hit.entry.leagueName,
      hostTeamName: hit.entry.hostTeamName,
      guestTeamName: hit.entry.guestTeamName,
      matchTime: hit.entry.matchTime,
      isLive: hit.entry.isLive,
      hot: hit.entry.hot,
      rooms: publicRooms(usableRooms)
    })
  }
  return success({ lives, updatedAt: page.fetchedAt })
}

/**
 * 拉取与斗球直播场次时间窗重叠的我方赛事，用于判断直播源是否属于本系统赛事。
 * 无官方开赛时间的场次按 matchScore 规则使用 now ± 6 小时窗口。
 */
async function loadMyMatchesNearEntries(entries, nowMs) {
  let lower = nowMs - TIME_WINDOW_MS
  let upper = nowMs + TIME_WINDOW_MS
  for (const entry of entries) {
    if (!entry.matchTime) {
      lower = Math.min(lower, nowMs - LIVE_PRE_GAME_WINDOW_MS)
      upper = Math.max(upper, nowMs + LIVE_PRE_GAME_WINDOW_MS)
      continue
    }
    const t = typeof entry.matchTime === 'number' ? entry.matchTime : new Date(entry.matchTime).getTime()
    if (!isFinite(t)) continue
    lower = Math.min(lower, t - TIME_WINDOW_MS)
    upper = Math.max(upper, t + TIME_WINDOW_MS)
  }

  const res = await db.collection('matches')
    .where({
      deleted: cmd.neq(true),
      startTime: cmd.gte(new Date(lower)).and(cmd.lte(new Date(upper)))
    })
    .field({ _id: 1, name: 1, teamA: 1, teamB: 1, startTime: 1, leagueName: 1 })
    .limit(500)
    .get()
  return res.data || []
}

/** 当前正在直播的足球场次(用于赛事列表顶部)，只保留本系统赛事库里存在的场次 */
async function actionLive() {
  const page = await getLiveData()
  const footballEntries = page.entries.filter(e => e.liveTypeName === '足球')
  if (!footballEntries.length) return success({ groups: [], updatedAt: page.fetchedAt })

  const nowMs = Date.now()
  const myMatches = await loadMyMatchesNearEntries(footballEntries, nowMs)
  if (!myMatches.length) return success({ groups: [], updatedAt: page.fetchedAt })

  // 只有能匹配上我方赛事的直播源才展示，避免出现系统里没有的赛事
  const matchedEntries = filterMatchedEntries(myMatches, footballEntries, nowMs)

  const groups = []
  for (const entry of matchedEntries) {
    const liveRooms = entry.rooms.filter(r => r.status === 1 && r.hasPlayAddr)
    if (!liveRooms.length) continue
    groups.push({
      doveMatchId: entry.matchId,
      leagueName: entry.leagueName,
      hostTeamName: entry.hostTeamName,
      guestTeamName: entry.guestTeamName,
      matchTime: entry.matchTime,
      hot: entry.hot,
      rooms: publicRooms(liveRooms)
    })
    if (groups.length >= MAX_LIVE_GROUPS) break
  }
  return success({ groups, updatedAt: page.fetchedAt })
}

/** 实时获取播放链(每次观看都重新抓房间页) */
async function actionPlay(event) {
  const matchId = event.matchId ? String(event.matchId) : ''
  const reqRoomId = event.roomId ? String(event.roomId) : ''
  if (!matchId && !reqRoomId) return fail('缺少赛事或直播间参数')

  const page = await getLiveData()

  let myMatch = null
  if (matchId) {
    const res = await db.collection('matches')
      .where({ _id: matchId, deleted: cmd.neq(true) })
      .field({ _id: 1, name: 1, teamA: 1, teamB: 1, startTime: 1, leagueName: 1, status: 1 })
      .limit(1)
      .get()
    myMatch = res.data && res.data[0]
    if (!myMatch) return fail('赛事不存在或已下架', 404)
  }

  let entry = null
  if (myMatch) {
    const hits = matchMatches([myMatch], page.entries, Date.now())
    if (hits.length) entry = hits[0].entry
  }
  if (!entry && reqRoomId) {
    entry = page.entries.find(e => e.rooms.some(r => r.roomId === reqRoomId)) || null
  }

  let room = null
  if (entry) {
    if (reqRoomId) room = entry.rooms.find(r => r.roomId === reqRoomId) || null
    if (!room) {
      room = entry.rooms.find(r => r.status === 1 && r.hasPlayAddr) ||
        entry.rooms.find(r => r.hasPlayAddr) ||
        entry.rooms[0] ||
        null
    }
  }
  // 兜底: 缓存刚好刷新导致 roomId 找不到时，允许直接按数字房间号抓取
  if (!room && reqRoomId && /^\d+$/.test(reqRoomId)) {
    room = { roomId: reqRoomId, nickName: '', hot: 0, status: 0, hasPlayAddr: false, title: '' }
  }
  if (!room) return fail('未找到可用的直播间，请稍后再试', 404)

  let detail
  try {
    detail = await fetchRoomDetail(room.roomId)
  } catch (e) {
    console.error('[user-live] 房间页抓取失败 roomId=' + room.roomId, e)
    return fail('获取直播信号失败：' + (e.message || '网络异常'), 502)
  }

  const rooms = publicRooms(entry ? entry.rooms : [room])
  if (!rooms.some(r => r.roomId === room.roomId)) {
    rooms.unshift(publicRooms([room])[0])
  }

  return success({
    matchId: matchId || (entry ? entry.matchId : ''),
    roomId: room.roomId,
    rooms,
    title: detail.title || (entry ? (entry.hostTeamName + ' vs ' + entry.guestTeamName) : ''),
    matchInfo: buildMatchInfo(entry, myMatch),
    playAddr: detail.playUrls,
    defaultQuality: detail.defaultQuality || pickDefaultQuality(detail.playUrls),
    liveStatus: detail.status,
    message: Object.keys(detail.playUrls).length ? '' : '直播信号暂未开始或已结束，请稍后刷新'
  })
}

exports.main = async (event, context) => {
  event = event || {}
  const token = event.token || (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const user = await verifyToken(db, token)
  if (!user) return fail('未登录或登录已过期', 401)
  if (user.role !== 'user') return fail('无权限', 403)

  const action = event.action || 'list'
  try {
    if (action === 'play') return await actionPlay(event)
    if (action === 'live') return await actionLive()
    if (action === 'list') return await actionList(event)
    return fail('未知操作: ' + action)
  } catch (e) {
    console.error('[user-live] action=' + action + ' error:', e)
    return fail(e.message || '直播服务异常，请稍后再试')
  }
}
