'use strict'
/**
 * sync-live-score — 进行中赛事实时比分增量同步
 *
 * 数据源: https://www.vipc.cn/i/live/jczq/status
 *   - 只返回进行中赛事 + 最近完场赛事(轻量), 不返回完整赛程
 *   - 只更新系统中已存在的 matches(按 sourceMatchId 匹配), 不创建新赛事
 *   - 只更新比分/半场比分/比赛分钟/状态, 不碰玩法赔率与下注
 *
 * 定时: config.json 每 15 秒触发
 * 注意: 当日志出现大量 "赛事不存在" 时检查 sync-jczq 是否正常运行
 */
const https = require('https')
const db = uniCloud.database()
const cmd = db.command

const BASE = 'https://www.vipc.cn'
const UA = 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)'
const STATUS_RANK = { upcoming: 0, live: 1, finished: 2, settled: 3, cancelled: 4 }

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

/** 生成变更字段; 无变化返回 null, 避免每 15 秒空写数据库 */
function buildPatch(doc, model) {
  const newStatus = mapStatus(model)
  const oldStatus = doc.status || 'upcoming'
  const statusAdvanced = newStatus !== oldStatus &&
    (newStatus === 'cancelled' || STATUS_RANK[newStatus] > STATUS_RANK[oldStatus])

  const homeScore = pick(model.homeScore, doc.homeScore)
  const guestScore = pick(model.guestScore, doc.guestScore)
  const homeHalfScore = pick(model.homeHalfScore, doc.homeHalfScore)
  const guestHalfScore = pick(model.guestHalfScore, doc.guestHalfScore)
  const time = pick(model.time, doc.time) || ''
  const displayState = pick(model.displayState, doc.displayState) || ''

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

exports.main = async (event, context) => {
  const startedAt = Date.now()
  try {
    const data = await fetchJson(BASE + '/i/live/jczq/status?_=' + Date.now())
    const models = []
    for (const item of data.items || []) {
      for (const m of item.matches || []) {
        if (m.type === 'football' && m.model && m.model.matchId) models.push(m.model)
      }
    }
    if (models.length === 0) {
      return { code: 0, message: '暂无进行中赛事', data: { scanned: 0, updated: 0 } }
    }

    const sourceIds = [...new Set(models.map(m => String(m.matchId)))]
    const res = await db.collection('matches')
      .where({ sourceMatchId: cmd.in(sourceIds) })
      .limit(1000)
      .get()

    const matchMap = {}
    for (const doc of res.data || []) matchMap[String(doc.sourceMatchId)] = doc

    let updated = 0
    let missing = 0
    for (const model of models) {
      const doc = matchMap[String(model.matchId)]
      if (!doc) { missing++; continue }
      const patch = buildPatch(doc, model)
      if (!patch) continue
      await db.collection('matches').doc(doc._id).update(patch)
      updated++
    }

    return {
      code: 0,
      message: '比分同步完成',
      data: {
        scanned: models.length,
        updated,
        missing,
        cost: ((Date.now() - startedAt) / 1000).toFixed(1) + 's'
      }
    }
  } catch (e) {
    console.error('sync-live-score error:', e)
    return { code: -1, message: e.message || '比分同步失败' }
  }
}
