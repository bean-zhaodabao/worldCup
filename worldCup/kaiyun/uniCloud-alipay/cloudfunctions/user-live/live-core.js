'use strict'
/**
 * live-core — 斗球直播源解析 / 匹配纯逻辑（无 uniCloud 依赖，可单元测试）
 *
 * 数据来源: https://www.dnymrhz.com/live 的 Next.js SSR __NEXT_DATA__
 *   - liveAnchorList.records[]: 正在直播的直播间(含 roomId / matchId / 标题 / playAddr)
 *   - liveMatchList[]:          赛程池(含 matchId / 开赛时间 / 主客队标准名)
 *
 * 匹配规则(参考《斗球直播源对接说明.md》3.3/3.4):
 *   队名归一化后比较 + 开赛时间窗 + 联赛加分，总分 >= 0.80 且唯一最高分才自动匹配
 */

// 有官方开赛时间时的匹配窗口(毫秒)
const TIME_WINDOW_MS = 3 * 60 * 60 * 1000
// 直播间没有官方时间时(标题里只有队名): 只允许匹配临近开赛/进行中的赛事
const LIVE_PRE_GAME_WINDOW_MS = 6 * 60 * 60 * 1000
const MIN_SCORE = 0.8
// 最高分与第二高分太接近时视为歧义，宁可不出直播入口也不匹配错
const AMBIGUITY_GAP = 0.1

const QUALITY_KEYS = ['ori', 'ud', 'hd', 'sd', 'ld']
const PLAY_ADDR_FIELDS = {
  ori: 'ori_m3u8',
  ud: 'ud_m3u8',
  hd: 'hd_m3u8',
  sd: 'sd_m3u8',
  ld: 'ld_m3u8'
}

const SPORT_NAMES = { 1: '足球', 2: '篮球', 3: '棒球', 4: '其他', 5: '网球', 7: '电竞' }

/**
 * 从 SSR HTML 中取出 pageProps
 * 站点改版时这里会抛错，调用方需记录日志并告警
 */
function parseNextData(html) {
  const m = String(html || '').match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) throw new Error('未找到 __NEXT_DATA__，斗球站点可能已改版')
  let json
  try {
    json = JSON.parse(m[1])
  } catch (e) {
    throw new Error('__NEXT_DATA__ JSON 解析失败，斗球站点可能已改版')
  }
  if (!json || !json.props || !json.props.pageProps) throw new Error('__NEXT_DATA__ 结构异常')
  return json.props.pageProps
}

/**
 * 解析直播间标题，兼容三种已知格式：
 *   "NBA    新奥尔良鹈鹕 - 萨克拉门托国王"
 *   "巴甲 格雷米奥 - 巴拉纳竞技"
 *   "S16全球总决赛\t\tTES\t-\tBLG"
 *   "NBA 亚特兰大老鹰-克利夫兰骑士"（无空格）
 * 返回 { league, host, guest }，解析失败返回 null
 */
function parseTitle(raw) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim()
  if (!t) return null

  let seg = t.split(/\s+-\s+/)
  if (seg.length < 2) {
    // 没有 " - " 时按最后一个短横拆（兼容 "老鹰-骑士"）
    const i = t.lastIndexOf('-')
    if (i <= 0 || i >= t.length - 1) return null
    seg = [t.slice(0, i).trim(), t.slice(i + 1).trim()]
  }
  if (seg.length < 2) return null

  const guest = seg.pop().trim()
  const left = seg.join(' - ').trim()
  // 左边 = "联赛 主队"，联赛名不含空格，主队名允许含空格
  const m = left.match(/^(\S+)\s+(.+)$/)
  if (!m) return null
  return { league: m[1], host: m[2].trim(), guest }
}

/** 队名归一化：去空格/括号备注/间隔号/无关字样，统一小写 */
function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[（(【\[][^）)】\]]*[）)】\]]/g, '')
    .replace(/[·・．.]/g, '')
    .replace(/[斗球\/\\站]/g, '')
}

// 常见简称/全称映射（仅做精确名的双向扩展，避免 "巴黎FC" 误匹配 "巴黎圣日耳曼"）
const TEAM_ALIASES = [
  ['马竞', '马德里竞技'],
  ['皇马', '皇家马德里'],
  ['巴萨', '巴塞罗那'],
  ['曼城', '曼彻斯特城'],
  ['曼联', '曼彻斯特联'],
  ['国米', '国际米兰'],
  ['拜仁', '拜仁慕尼黑'],
  ['多特', '多特蒙德'],
  ['巴黎', '巴黎圣日耳曼'],
  ['拉科', '拉科鲁尼亚'],
  ['萨迪纳摩', '萨格勒布迪纳摩'],
  ['费内巴切', '费内巴赫切'],
  ['布鲁日', '布鲁日俱乐部'],
  ['哥本哈根', '哥本哈根足球俱乐部'],
  ['奥林匹亚科斯', '奥林匹亚科斯比雷埃夫斯']
]

const LEAGUE_ALIASES = [
  ['巴西甲', '巴甲'],
  ['美职业', '美职联'],
  ['欧冠杯', '欧冠'],
  ['解放者杯', '南美解放者杯'],
  ['韩K联', '韩国K联赛'],
  ['英冠', '英格兰冠军联赛'],
  ['芬超', '芬兰超级联赛'],
  ['瑞典超', '瑞典超级联赛'],
  ['挪超', '挪威超级联赛'],
  ['葡超', '葡萄牙超级联赛'],
  ['西甲', '西班牙甲级联赛'],
  ['德甲', '德国甲级联赛'],
  ['意甲', '意大利甲级联赛'],
  ['法甲', '法国甲级联赛'],
  ['英超', '英格兰超级联赛'],
  ['俄超', '俄罗斯超级联赛'],
  ['土超', '土耳其超级联赛'],
  ['日职联', '日本职业联赛'],
  ['丹麦超', '丹麦超级联赛'],
  ['墨西甲秋季', '墨西哥秋季联赛']
]

function expandAliases(norm, pairs) {
  const out = norm ? [norm] : []
  for (const pair of pairs) {
    if (norm === pair[0] && out.indexOf(pair[1]) < 0) out.push(pair[1])
    if (norm === pair[1] && out.indexOf(pair[0]) < 0) out.push(pair[0])
  }
  return out
}

// 别名简称（巴黎/曼联/曼城…）只允许精确命中，不做包含匹配，
// 避免 "巴黎" 误命中 "巴黎FC"、"曼联" 误命中 "曼联青年队"
const TEAM_ALIAS_TERMS = {}
for (const pair of TEAM_ALIASES) {
  TEAM_ALIAS_TERMS[normName(pair[0])] = true
  TEAM_ALIAS_TERMS[normName(pair[1])] = true
}

/**
 * 队名相似度：完全相同 0.40；一方包含另一方 0.35；无关 0
 * 精确名会通过别名表扩展，如 "马竞" -> "马德里竞技"
 */
function nameScore(a, b) {
  const va = expandAliases(normName(a), TEAM_ALIASES)
  const vb = expandAliases(normName(b), TEAM_ALIASES)
  if (!va.length || !vb.length) return 0
  let best = 0
  for (const x of va) {
    for (const y of vb) {
      if (x === y) return 0.4
      if (TEAM_ALIAS_TERMS[x] || TEAM_ALIAS_TERMS[y]) continue
      if (x.length >= 2 && y.length >= 2 && (x.indexOf(y) >= 0 || y.indexOf(x) >= 0)) best = 0.35
    }
  }
  return best
}

/** 联赛一致给 0.05 加分（不参与硬门槛） */
function leagueScore(a, b) {
  const va = expandAliases(normName(a), LEAGUE_ALIASES)
  const vb = expandAliases(normName(b), LEAGUE_ALIASES)
  for (const x of va) {
    for (const y of vb) {
      if (!x || !y) continue
      if (x === y) return 0.05
      if (x.length >= 2 && y.length >= 2 && (x.indexOf(y) >= 0 || y.indexOf(x) >= 0)) return 0.05
    }
  }
  return 0
}

/**
 * 把 /live 的 SSR 数据整理成以 "斗球 matchId" 为单位的直播场次
 * 同一场比赛可能有多个主播间，合并到同一个 entry.rooms 里
 */
function buildLiveEntries(pageProps) {
  const rooms = (pageProps && pageProps.liveAnchorList && pageProps.liveAnchorList.records) || []
  const schedule = (pageProps && pageProps.liveMatchList) || []

  const scheduleMap = {}
  for (const m of schedule) {
    if (m && m.matchId !== undefined && m.matchId !== null) scheduleMap[String(m.matchId)] = m
  }

  const byMatch = {}
  for (const room of rooms) {
    if (!room) continue
    const matchId = room.matchId !== undefined && room.matchId !== null ? String(room.matchId) : ''
    if (!matchId) continue

    const official = scheduleMap[matchId]
    const parsed = parseTitle(room.title)

    let host = ''
    let guest = ''
    let leagueName = ''
    let matchTime = null
    let liveTypeName = String(room.liveTypeName || '').trim()

    if (official) {
      host = official.hostTeamName || ''
      guest = official.guestTeamName || ''
      leagueName = official.leagueName || ''
      matchTime = official.matchTime || null
      if (SPORT_NAMES[official.sportType]) liveTypeName = SPORT_NAMES[official.sportType]
    } else if (parsed) {
      host = parsed.host
      guest = parsed.guest
      leagueName = parsed.league
    } else {
      // 既没有官方赛程，标题也解析不出来，跳过并留日志由外层汇总
      continue
    }

    if (!byMatch[matchId]) {
      byMatch[matchId] = {
        matchId,
        hostTeamName: host,
        guestTeamName: guest,
        leagueName,
        matchTime,
        liveTypeName,
        isLive: false,
        hot: 0,
        rooms: []
      }
    }

    const roomId = room.roomId !== undefined && room.roomId !== null
      ? String(room.roomId)
      : (room.anchorId !== undefined && room.anchorId !== null ? String(room.anchorId) : '')
    if (!roomId) continue

    const preview = room.previewInfo || {}
    const playAddr = preview.playAddr || {}
    const hasPlayAddr = !!(playAddr.hd_m3u8 || playAddr.sd_m3u8 || playAddr.ori_m3u8 || playAddr.ld_m3u8 || playAddr.ud_m3u8)
    if (byMatch[matchId].rooms.some(r => r.roomId === roomId)) continue

    byMatch[matchId].rooms.push({
      roomId,
      title: room.title || '',
      nickName: room.nickName || '',
      hot: Number(room.anchorHot) || 0,
      status: preview.status !== undefined && preview.status !== null ? Number(preview.status) : 0,
      hasPlayAddr
    })
  }

  const entries = Object.keys(byMatch).map(k => byMatch[k])
  for (const e of entries) {
    // 直播中的房间排前面，其次按人气
    e.rooms.sort((a, b) => {
      const liveDiff = (b.status === 1 ? 1 : 0) - (a.status === 1 ? 1 : 0)
      return liveDiff || b.hot - a.hot
    })
    e.isLive = e.rooms.some(r => r.status === 1)
    e.hot = e.rooms.length ? e.rooms[0].hot : 0
  }
  entries.sort((a, b) => {
    const liveDiff = (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0)
    return liveDiff || b.hot - a.hot
  })
  return entries
}

/** 单场赛事与单个斗球直播场次的得分 */
function matchScore(myMatch, entry, nowMs) {
  const hostScore = nameScore(myMatch.teamA, entry.hostTeamName)
  const guestScore = nameScore(myMatch.teamB, entry.guestTeamName)
  if (!hostScore || !guestScore) return 0

  const myStart = new Date(myMatch.startTime).getTime()
  if (!isFinite(myStart)) return 0

  let timeOk = false
  if (entry.matchTime) {
    const entryTime = typeof entry.matchTime === 'number'
      ? entry.matchTime
      : new Date(entry.matchTime).getTime()
    timeOk = isFinite(entryTime) && Math.abs(entryTime - myStart) <= TIME_WINDOW_MS
  } else if (nowMs) {
    // 直播间没有官方开赛时间：只在临近开赛/进行中窗口内匹配
    timeOk = Math.abs(myStart - nowMs) <= LIVE_PRE_GAME_WINDOW_MS
  }
  if (!timeOk) return 0

  let score = hostScore + guestScore + 0.15
  score += leagueScore(myMatch.leagueName || myMatch.name, entry.leagueName)
  return Math.round(score * 100) / 100
}

/**
 * 批量匹配：我方赛事 -> 斗球直播场次
 * 返回 [{ matchId, entry, score }]，歧义场次直接跳过（不展示直播入口）
 */
function matchMatches(myMatches, entries, nowMs) {
  const result = []
  for (const match of myMatches || []) {
    const cands = []
    for (const entry of entries || []) {
      const score = matchScore(match, entry, nowMs)
      if (score >= MIN_SCORE) cands.push({ entry, score })
    }
    if (!cands.length) continue
    cands.sort((a, b) => b.score - a.score || b.entry.hot - a.entry.hot)
    if (cands.length > 1 && cands[0].score - cands[1].score < AMBIGUITY_GAP) continue
    result.push({ matchId: match._id, entry: cands[0].entry, score: cands[0].score })
  }
  return result
}

/** 从 playAddr 中筛出 m3u8 直链（FLV/RTMP 移动端不用） */
function pickPlayUrls(playAddr) {
  const out = {}
  if (!playAddr || typeof playAddr !== 'object') return out
  for (const q of QUALITY_KEYS) {
    let url = playAddr[PLAY_ADDR_FIELDS[q]]
    if (typeof url !== 'string') continue
    url = url.trim()
    if (!url) continue
    if (url.indexOf('//') === 0) url = 'https:' + url
    if (/^https?:\/\//i.test(url)) out[q] = url
  }
  return out
}

/** 默认清晰度：高清优先，其次标清/流畅/原画/超清 */
function pickDefaultQuality(urls) {
  const order = ['hd', 'sd', 'ld', 'ori', 'ud']
  for (const q of order) {
    if (urls && urls[q]) return q
  }
  return ''
}

/** 从房间详情页 pageProps 提取播放信息 */
function extractRoomDetail(pageProps) {
  const detail = pageProps && pageProps.liveDetailProp
  if (!detail) throw new Error('直播间数据缺失，斗球站点可能已改版')
  const playUrls = pickPlayUrls(detail.playAddr)
  return {
    roomId: pageProps.anchorId !== undefined && pageProps.anchorId !== null ? String(pageProps.anchorId) : '',
    matchId: detail.matchId !== undefined && detail.matchId !== null ? String(detail.matchId) : '',
    title: detail.liveTitle || '',
    nickName: detail.nickName || '',
    status: detail.status !== undefined && detail.status !== null ? Number(detail.status) : 0,
    playUrls,
    defaultQuality: pickDefaultQuality(playUrls),
    pullDomainBakList: detail.pullDomainBakList || [],
    playerUrlBakList: (pageProps.serverConfig && pageProps.serverConfig.playerUrlBakList) || []
  }
}

module.exports = {
  TIME_WINDOW_MS,
  LIVE_PRE_GAME_WINDOW_MS,
  MIN_SCORE,
  QUALITY_KEYS,
  parseNextData,
  parseTitle,
  normName,
  nameScore,
  leagueScore,
  buildLiveEntries,
  matchScore,
  matchMatches,
  pickPlayUrls,
  pickDefaultQuality,
  extractRoomDetail
}
