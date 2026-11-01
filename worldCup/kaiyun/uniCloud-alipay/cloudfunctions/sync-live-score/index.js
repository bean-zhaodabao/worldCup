'use strict'
/**
 * sync-live-score — 进行中赛事实时比分增量同步
 *
 * 数据源: https://www.vipc.cn/i/live/jczq/status
 *   - 只返回进行中赛事 + 最近完场赛事(轻量), 不返回完整赛程
 *   - 只更新系统中已存在的 matches(按 sourceMatchId 匹配), 不创建新赛事
 *   - 只更新比分/半场比分/比赛分钟/状态, 不碰玩法赔率与下注
 *   - status 接口漏掉的进行中赛事, 每分钟兜底拉一次 /i/match/football/{id}/live
 *
 * 定时: package.json cloudfunction-config 每 15 秒触发 (uniCloud 只认 package.json/控制台配置,
 *       只写 config.json 不会生效)
 * 注意: 当日志出现大量 "赛事不存在" 时检查 sync-jczq 是否正常运行
 */
const https = require('https')
const db = uniCloud.database()
const cmd = db.command

const BASE = 'https://www.vipc.cn'
const UA = 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)'
const STATUS_RANK = { upcoming: 0, live: 1, finished: 2, settled: 3, cancelled: 4 }
// status 接口未覆盖的进行中赛事, 用单场详情接口兜底(每个赛事最多 60 秒拉一次)
const DETAIL_TTL_MS = 60 * 1000
const LIVE_LOOKBACK_MS = 6 * 60 * 60 * 1000
const detailFetchedAt = {}

function fetchJson(url, retries) {
  const left = retries === undefined ? 2 : retries
  return new Promise((resolve, reject) => {
    const attempt = (remain) => {
      const req = https.get(url, {
        timeout: 8000,
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: 'https://www.vipc.cn/live/jczq'
        }
      }, (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          if (remain > 0) return setTimeout(() => attempt(remain - 1), 800)
          return reject(new Error('HTTP ' + res.statusCode + ' for ' + url))
        }
        let body = ''
        res.setEncoding('utf-8')
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {
          try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('JSON解析失败: ' + url)) }
        })
      })
      req.on('timeout', () => { req.destroy(new Error('请求超时: ' + url)) })
      req.on('error', (e) => {
        if (remain > 0) return setTimeout(() => attempt(remain - 1), 800)
        reject(e)
      })
    }
    attempt(left)
  })
}

/** 与 sync-jczq 的状态推进规则保持一致; status 接口通常给 matchState */
function mapStatus(model) {
  const ds = model.displayState || ''
  if (ds.indexOf('取消') >= 0) return 'cancelled'
  const state = model.matchState !== undefined && model.matchState !== null ? model.matchState : model.status
  if (state === -1 || ds.indexOf('完场') >= 0) return 'finished'
  if (state === 0 || ds.indexOf('未开始') >= 0) return 'upcoming'
  return 'live'
}

function pick(v, fallback) {
  return v === undefined || v === null ? fallback : v
}

/** 解析比赛分钟: "12'" -> 12, "45+2'" -> 45.02; 无法解析返回 null */
function parseMinute(value) {
  const m = String(value || '').match(/(\d+)(?:\s*\+\s*(\d+))?/)
  if (!m) return null
  const base = Number(m[1])
  const extra = m[2] ? Number(m[2]) : 0
  return base + Math.min(extra, 99) / 100
}

/** 中场休息时展示/存储的比赛分钟: 固定 45', 不跟随补时继续走 */
const HALF_TIME_MINUTE = "45'"

/** 是否中场休息(displayState 可能是 "中场" / "中场休息") */
function isHalfTime(displayState) {
  return /中场|半场休息/.test(String(displayState || ''))
}

/**
 * 多数据源混用时, 判断 status 数据是否比数据库现有数据旧
 * 防止 status 比单场详情慢 1 分钟时把比分/分钟改回去。
 * 中场休息是特例: 源站会把分钟从 45+X 重置为 45, 不能当成回退拦截,
 * 否则页面会一直停留在上半场补时分钟, 中场状态也永远不更新。
 */
function shouldKeepLiveData(doc, model) {
  const oldDs = String((doc && doc.displayState) || '')
  const newDs = String((model && model.displayState) || '')
  // 进入中场: 允许更新(分钟重置属正常), 由 resolveLiveTime 把分钟固定为 45'
  // 但已进入下半场/加时/完场后, 再收到中场数据视为源站滞后, 不能退回中场
  if (isHalfTime(newDs)) {
    if (/下半场|加时|点球|完场/.test(oldDs)) return true
    const oldMin = parseMinute(doc && doc.time)
    if (oldMin !== null && oldMin >= 46) return true
    return false
  }
  // 已在中场, 又收到上半场滞后数据时不允许退回去
  if (isHalfTime(oldDs)) {
    const newMin = parseMinute(model && model.time)
    if (newDs.indexOf('上半场') >= 0) return true
    if (newMin !== null && newMin < 45) return true
  }

  const oldMin = parseMinute(doc && doc.time)
  const newMin = parseMinute(model && model.time)
  if (oldMin === null || newMin === null) return false
  if (newMin < oldMin) return true
  if (newMin === oldMin) {
    const oldTotal = (Number(doc.homeScore) || 0) + (Number(doc.guestScore) || 0)
    const newTotal = (Number(model.homeScore) || 0) + (Number(model.guestScore) || 0)
    if (newTotal < oldTotal) return true
  }
  return false
}

/** 中场休息固定展示 45', 其余情况沿用源站分钟 */
function resolveLiveTime(doc, model) {
  if (isHalfTime(model && model.displayState)) return HALF_TIME_MINUTE
  const t = model && model.time
  if (t === undefined || t === null) return (doc && doc.time) || ''
  return String(t)
}

/** 生成变更字段; 无变化返回 null, 避免每 15 秒空写数据库 */
function buildPatch(doc, model) {
  const newStatus = mapStatus(model)
  const oldStatus = doc.status || 'upcoming'
  const statusAdvanced = newStatus !== oldStatus &&
    (newStatus === 'cancelled' || STATUS_RANK[newStatus] > STATUS_RANK[oldStatus])

  // 已结算不再改比分; 已完场/进行中赛事不接受滞后数据回退
  if (oldStatus === 'settled') return null
  if (oldStatus === 'live' && newStatus === 'upcoming') return null
  if (oldStatus === 'live' && newStatus === 'live' && shouldKeepLiveData(doc, model)) return null
  if (oldStatus === 'finished' && newStatus !== 'cancelled' &&
    String(model.displayState || '').indexOf('完场') < 0) return null

  const homeScore = pick(model.homeScore, doc.homeScore)
  const guestScore = pick(model.guestScore, doc.guestScore)
  const homeHalfScore = pick(model.homeHalfScore, doc.homeHalfScore)
  const guestHalfScore = pick(model.guestHalfScore, doc.guestHalfScore)
  const displayState = pick(model.displayState, doc.displayState) || ''
  // 中场休息固定 45', 避免源站补时/下半场提前数据让休息期间的时间继续走
  const time = resolveLiveTime(doc, model)

  const scoreChanged = doc.homeScore !== homeScore ||
    doc.guestScore !== guestScore ||
    doc.homeHalfScore !== homeHalfScore ||
    doc.guestHalfScore !== guestHalfScore ||
    (doc.time || '') !== time ||
    (doc.displayState || '') !== displayState

  if (!statusAdvanced && !scoreChanged) return null

  const patch = {
    homeScore,
    guestScore,
    homeHalfScore,
    guestHalfScore,
    time,
    displayState,
    syncedAt: new Date(),
    updateTime: new Date(),
    // 让移动端 2 秒轮询感知比分变化并刷新列表/详情
    oddsVersion: cmd.inc(1)
  }
  if (statusAdvanced) patch.status = newStatus
  return patch
}

/**
 * status 接口漏掉某场进行中赛事时的兜底:
 * 拉单场详情 /i/match/football/{id}/live, 复用 buildPatch 更新比分/分钟/状态。
 * 每个赛事最多 60 秒请求一次, 避免高频打源站。
 */
async function syncDetailFallback(doc, stats) {
  const mid = String(doc.sourceMatchId || '')
  if (!mid) return
  const now = Date.now()
  if (now - (detailFetchedAt[mid] || 0) < DETAIL_TTL_MS) return
  detailFetchedAt[mid] = now
  try {
    const data = await fetchJson(
      BASE + '/i/match/football/' + mid + '/live?_=' + now,
      'https://www.vipc.cn/live/football/' + mid,
      0
    )
    const patch = buildPatch(doc, data)
    if (!patch) return
    await db.collection('matches').doc(doc._id).update(patch)
    stats.detailUpdated++
  } catch (e) {
    stats.errors.push('详情兜底失败 ' + mid + ': ' + e.message)
  }
}

exports.main = async (event, context) => {
  const startedAt = Date.now()
  const stats = { scanned: 0, updated: 0, missing: 0, detailUpdated: 0, errors: [] }
  try {
    // 1. status 接口(轻量, 每 15 秒)
    const models = []
    try {
      const data = await fetchJson(BASE + '/i/live/jczq/status?_=' + Date.now(), 1)
      for (const item of data.items || []) {
        for (const m of item.matches || []) {
          if (m.type === 'football' && m.model && m.model.matchId) models.push(m.model)
        }
      }
    } catch (e) {
      // status 接口异常不阻塞下面的单场兜底
      stats.errors.push('status 接口失败: ' + e.message)
      console.error('[sync-live-score] status 接口失败:', e.message)
    }
    stats.scanned = models.length

    const sourceIds = [...new Set(models.map(m => String(m.matchId)))]
    const statusIds = new Set(sourceIds)
    if (sourceIds.length) {
      const res = await db.collection('matches')
        .where({ sourceMatchId: cmd.in(sourceIds) })
        .limit(1000)
        .get()

      const matchMap = {}
      for (const doc of res.data || []) matchMap[String(doc.sourceMatchId)] = doc

      for (const model of models) {
        const doc = matchMap[String(model.matchId)]
        if (!doc) { stats.missing++; continue }
        const patch = buildPatch(doc, model)
        if (!patch) continue
        await db.collection('matches').doc(doc._id).update(patch)
        stats.updated++
      }
    }

    // 2. 兜底: 系统内进行中但不在 status 返回里的赛事, 拉单场详情更新
    const liveRes = await db.collection('matches')
      .where({
        status: 'live',
        deleted: cmd.neq(true),
        startTime: cmd.gt(new Date(Date.now() - LIVE_LOOKBACK_MS))
      })
      .limit(50)
      .get()
    const missingLive = (liveRes.data || [])
      .filter(doc => !statusIds.has(String(doc.sourceMatchId)))
      .slice(0, 10) // 单次最多 10 场, 避免拖慢 15 秒定时任务
    await Promise.all(missingLive.map(doc => syncDetailFallback(doc, stats)))

    return {
      code: 0,
      message: '比分同步完成',
      data: {
        scanned: stats.scanned,
        updated: stats.updated,
        missing: stats.missing,
        detailUpdated: stats.detailUpdated,
        errors: stats.errors,
        cost: ((Date.now() - startedAt) / 1000).toFixed(1) + 's'
      }
    }
  } catch (e) {
    console.error('sync-live-score error:', e)
    return { code: -1, message: e.message || '比分同步失败', data: stats }
  }
}
