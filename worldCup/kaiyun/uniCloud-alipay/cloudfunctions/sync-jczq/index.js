'use strict'
/**
 * sync-jczq — 竞彩足球数据同步云函数
 *
 * 数据源: vipc.cn（接口清单.js 三接口）
 *  1. 赛事列表  GET /i/live/jczq/date/{today|YYYY-MM-DD}/next?_=ts
 *  2. 竞彩赔率  GET /i/match/jczq/sporttery/{matchId}
 *  3. 盘口      GET /i/match/football/{matchId}/odds/pankou/
 *
 * 职责:
 *  1. 同步赛事(matches upsert by sourceMatchId, 状态单调推进, 比分/半场比分)
 *  2. 同步7组玩法(胜平负/让球胜平负/比分/总进球区间/半全场/让球盘/大小球)
 *     - 竞彩官方玩法直接映射; 总进球区间(0-1/2-3/4+)由官方t0..t7派生
 *     - 亚盘/大小球取 companyId 8/12/14 合并(同盘口去重保留低水位)
 *     - 水位为香港盘: 赢=本金×(1+水位), 内部统一存十进制 odds=1+水位
 *  3. 赔率变化 -> matches.oddsVersion++ (移动端2s轮询自动刷新)
 *  4. 自动结算: 完场赛事按90分钟赛果判定玩法结果, 结算订单并入账钱包
 *     (走盘退本金/半赢半输/取消退款), 无需人工设定
 *
 * 定时: config.json 每5分钟触发; 也可由管理端"立即同步"直接调用本函数
 * 注意: 需在 uniCloud 控制台将本函数超时时间调大(建议60s)、内存512MB
 */
const https = require('https')
const db = uniCloud.database()
const cmd = db.command
const {
  round2, parsePankou, mergePankou, combineOdds, lastOf,
  buildSportteryPlays, buildPankouPlays,
  computeResult, resultMultiplier, regularScore
} = require('./odds-core')

const UA = 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)'
const BASE = 'https://www.vipc.cn'
const PANKOU_COMPANIES = [8, 12, 14]
const ODDS_SYNC_CONCURRENCY = 10
const STALE_MS = 10 * 60 * 1000 // 数据超过10分钟未更新则移动端暂停投注
const ZOMBIE_GRACE_MS = 6 * 60 * 60 * 1000 // 开赛后 6 小时仍停留在"未开始"的赛事视为僵尸场次

// ==================== HTTP 工具 ====================

function fetchJson(url, referer, retries) {
  retries = retries === undefined ? 3 : retries
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      const req = https.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: referer || 'https://www.vipc.cn/live'
        }
      }, (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          if (left > 0 && (res.statusCode === 403 || res.statusCode >= 500)) {
            return setTimeout(() => attempt(left - 1), 1000 * (4 - left))
          }
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
        if (left > 0) return setTimeout(() => attempt(left - 1), 1000 * (4 - left))
        reject(e)
      })
    }
    attempt(retries)
  })
}

/** 并发池: 顺序保留结果, 单个失败不中断整体 */
async function runPool(items, size, worker) {
  const results = new Array(items.length)
  let idx = 0
  const runner = async () => {
    while (idx < items.length) {
      const i = idx++
      try { results[i] = await worker(items[i], i) } catch (e) { results[i] = { error: e && e.message || 'error' } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, runner))
  return results
}

// ==================== DB upsert ====================

const STATUS_RANK = { upcoming: 0, live: 1, finished: 2, settled: 3, cancelled: 4 }

function mapStatus(model) {
  const ds = model.displayState || ''
  if (ds.indexOf('取消') >= 0) return 'cancelled'
  if (model.status === -1 || ds.indexOf('完场') >= 0) return 'finished'
  if (model.status === 0 || ds.indexOf('未开始') >= 0) return 'upcoming'
  return 'live'
}

/** 赛事 upsert: 返回 { _id, statusChangedToFinished, cancelled } */
async function upsertMatch(model, stats) {
  const exist = await db.collection('matches').where({ sourceMatchId: String(model.matchId) }).limit(1).get()
  const newStatus = mapStatus(model)
  const common = {
    name: model.league || model.leagueName,
    teamA: model.home, teamB: model.guest,
    teamAFlag: model.homeLogo || '', teamBFlag: model.guestLogo || '',
    startTime: new Date(String(model.matchTime).replace(' ', 'T') + '+08:00'),
    jingcaiId: model.jingcaiId || '', ccId: (model.league || '').split(' ')[0] || '',
    leagueName: model.leagueName || '', leagueId: model.leagueId || null,
    homeRank: model.homeRank || '', guestRank: model.guestRank || '',
    season: model.season || '', round: model.round || '',
    homeScore: model.homeScore, guestScore: model.guestScore,
    homeHalfScore: model.homeHalfScore, guestHalfScore: model.guestHalfScore,
    homeOtScore: model.homeOtScore || 0, guestOtScore: model.guestOtScore || 0,
    homeOtPenalty: model.homeOtPenalty || 0, guestOtPenalty: model.guestOtPenalty || 0,
    displayState: model.displayState || '', time: model.time || '',
    description: model.description || '',
    syncedAt: new Date(),
    updateTime: new Date()
  }

  if (exist.data && exist.data.length) {
    const doc = exist.data[0]
    if (doc.deleted) return { _id: doc._id, skip: true } // 管理端已删除, 同步不再复活

    const update = Object.assign({}, common)
    // 状态单调推进(不因接口波动回退), cancelled 始终允许
    const oldStatus = doc.status || 'upcoming'
    if (newStatus === 'cancelled' || STATUS_RANK[newStatus] > STATUS_RANK[oldStatus]) {
      update.status = newStatus
    }
    await db.collection('matches').doc(doc._id).update(update)
    stats.matchesUpdated++
    return { _id: doc._id, statusChangedToFinished: (newStatus === 'finished' && oldStatus !== 'finished' && oldStatus !== 'settled'), cancelled: newStatus === 'cancelled', settledAlready: oldStatus === 'settled' }
  }

  const add = Object.assign({
    sourceMatchId: String(model.matchId),
    status: newStatus,
    online: true, // 自动上架
    deleted: false,
    oddsVersion: 0,
    createTime: new Date()
  }, common)
  const res = await db.collection('matches').add(add)
  stats.matchesAdded++
  return { _id: res.id, statusChangedToFinished: false, cancelled: newStatus === 'cancelled', settledAlready: false }
}

/** 去掉 undefined 字段, 避免 DB 写入报错 */
function cleanObj(obj) {
  const out = {}
  for (const k of Object.keys(obj)) {
    if (obj[k] !== undefined) out[k] = obj[k]
  }
  return out
}

/** 玩法 upsert by (matchId, sourceKey): 返回是否赔率变化 */
async function upsertPlay(matchId, catIds, play) {
  const categoryId = catIds[play.categoryName]
  if (!categoryId) return { error: '分类不存在: ' + play.categoryName }
  delete play.categoryName

  const exist = await db.collection('plays').where({ matchId, sourceKey: play.sourceKey }).limit(1).get()
  if (exist.data && exist.data.length) {
    const old = exist.data[0]
    // 管理端人工覆盖赔率时(manualOdds=true)只更新原始赔率, 不覆盖展示赔率; 人工停售(manualStop)同理
    const update = cleanObj({
      oddsSource: play.oddsSource, oddsFirst: play.oddsFirst, oddsStat: play.oddsStat,
      handicap: play.handicap, side: play.side || null, water: play.water || null,
      name: play.name, sort: play.sort,
      deleted: false, updateTime: new Date()
    })
    if (!old.manualStop) update.stop = play.stop === true
    if (!old.manualOdds) update.odds = play.odds
    await db.collection('plays').doc(old._id).update(update)
    const changed = (old.odds !== play.odds && !old.manualOdds) ||
      (old.stop || false) !== (play.stop === true) ||
      old.deleted === true ||
      old.oddsSource !== play.oddsSource
    return { changed: !!changed, added: false }
  }

  await db.collection('plays').add(cleanObj(Object.assign({
    matchId, categoryId,
    isSource: true, manualOdds: false, isWin: false, deleted: false,
    createTime: new Date(), updateTime: new Date()
  }, play)))
  return { changed: true, added: true }
}

// ==================== 结算引擎(纯判定在 odds-core.js) ====================

async function writeWalletLog(entry) {
  await db.collection('wallet-logs').add(Object.assign({ createTime: new Date() }, entry))
}

/**
 * 结算单个订单(所有腿的玩法已算出result)
 * 返回 { status, winAmount }
 */
async function settleOrder(order, items) {
  let multiplier = 1
  for (const item of items) {
    const m = resultMultiplier(item.result, item.oddsSnapshot)
    if (m === 0) return { status: 'settled', winAmount: 0, result: 'lost' }
    multiplier *= m
  }
  const winAmount = round2(order.betAmount * multiplier)
  let result = 'won'
  if (winAmount < order.betAmount && winAmount > 0) result = 'partial'
  return { status: 'settled', winAmount, result }
}

// 计算某场90分钟比分/结算判定的纯函数已移至 odds-core.js (regularScore/computeResult/resultMultiplier)

/**
 * 结算一场已完场赛事:
 * 1. 按赛果计算该场所有同步玩法的 result
 * 2. 结算涉及该场的订单(串关等所有腿完场后由最后一场触发)
 * 3. 中奖金额入账钱包(散户/收单一致, 收单允许负数)
 */
async function settleFinishedMatch(match, stats) {
  const { home, guest } = regularScore(match)
  const halfHome = match.homeHalfScore
  const halfGuest = match.guestHalfScore

  const playsRes = await db.collection('plays').where({ matchId: match._id, isSource: true, deleted: false }).get()
  const plays = playsRes.data || []
  if (plays.length === 0) {
    // 无同步玩法(如纯盘口场次从未同步过), 直接标记已结算
    await db.collection('matches').doc(match._id).update({ status: 'settled', settledAt: new Date(), updateTime: new Date() })
    return
  }

  // 1. 计算玩法结果 (半全场需要半场比分, 缺失则挂起)
  let pending = false
  for (const play of plays) {
    let result = null
    if (play.sourceKey && String(play.sourceKey).indexOf('bqc:') === 0 && (halfHome === null || halfHome === undefined || halfGuest === null || halfGuest === undefined)) {
      pending = true
      continue
    }
    if (play.sourceKey) result = computeResult(play, home, guest, halfHome, halfGuest)
    if (!result) { pending = true; continue }
    await db.collection('plays').doc(play._id).update({
      result,
      isWin: (result === 'win' || result === 'half_win'),
      updateTime: new Date()
    })
    play.result = result
  }

  // 2. 标记赛事已结算(即使部分玩法挂起也不阻塞, 挂起玩法result为空)
  await db.collection('matches').doc(match._id).update({ status: 'settled', settledAt: new Date(), updateTime: new Date() })

  // 3. 结算订单
  const resultMap = {}
  for (const p of plays) resultMap[p._id] = p.result

  const ordersRes = await db.collection('orders')
    .where({ matchIds: cmd.in([match._id]), status: cmd.neq('settled').and(cmd.neq('refunded')) })
    .get()
  for (const order of ordersRes.data || []) {
    // 所有腿必须都已结算, 未结算腿的场次状态
    const matchIds = order.matchIds || (order.matchId ? [order.matchId] : [])
    const matchesRes = await db.collection('matches').where({ _id: cmd.in(matchIds) }).get()
    const matchMap = {}
    for (const m of matchesRes.data || []) matchMap[m._id] = m

    let refund = false
    let ready = true
    for (const mid of matchIds) {
      const m = matchMap[mid]
      if (!m) { ready = false; break }
      if (m.status === 'cancelled') { refund = true; break }
      if (m.status !== 'settled') { ready = false; break }
    }
    if (!ready) continue

    if (refund) {
      // 赛事取消: 整单退本金
      await db.collection('orders').doc(order._id).update({ status: 'refunded', winAmount: 0, settleTime: new Date() })
      await db.collection('users').doc(order.userId).update({ balance: cmd.inc(order.betAmount) })
      await writeWalletLog({ userId: order.userId, type: 'refund', amount: order.betAmount, orderId: order._id, orderNo: order.orderNo, remark: '赛事取消退款' })
      stats.refunded++
      continue
    }

    const itemsRes = await db.collection('order-items').where({ orderId: order._id }).get()
    const items = itemsRes.data || []
    // 逐腿取玩法结算结果: 本场直接用本轮算出的 resultMap; 其他场查 plays.result(该场结算时已写入)
    const withResult = []
    let allReady = true
    for (const it of items) {
      let r = null
      if (it.matchId === match._id) {
        r = resultMap[it.playId]
      } else {
        const playRes = await db.collection('plays').doc(it.playId).get()
        const p = playRes.data && playRes.data[0]
        r = p ? p.result : null
      }
      if (r === null || r === undefined) { allReady = false; break }
      withResult.push(Object.assign({}, it, { result: r }))
    }
    if (!allReady) continue // 有腿结果未算出, 等下一轮

    const settled = await settleOrder(order, withResult)
    await db.collection('orders').doc(order._id).update({
      status: settled.status, winAmount: settled.winAmount, result: settled.result, settleTime: new Date()
    })
    if (settled.winAmount > 0) {
      await db.collection('users').doc(order.userId).update({ balance: cmd.inc(settled.winAmount) })
      await writeWalletLog({ userId: order.userId, type: 'win', amount: settled.winAmount, orderId: order._id, orderNo: order.orderNo, remark: '中奖入账(含本金)' })
    }
    stats.settledOrders++
  }

  if (pending) stats.pendingPlays++

  // 4. 操作日志
  await db.collection('operation-logs').add({
    adminId: 'system', adminName: 'system',
    action: 'auto_settle', targetType: 'matches', targetId: match._id,
    detail: '自动结算: ' + (match.teamA || '') + ' vs ' + (match.teamB || '') + ' ' + home + ':' + guest,
    createTime: new Date()
  })
}

// ==================== 玩法分类自动初始化 ====================

const BIG_CATS = [
  { name: '胜平负', sort: 1 },
  { name: '进球', sort: 2 },
  { name: '比分', sort: 3 },
  { name: '半全场', sort: 4 },
  { name: '盘口', sort: 5 }
]
const SMALL_CATS = [
  { name: '胜平负', parent: '胜平负', sort: 1 },
  { name: '让球胜平负', parent: '胜平负', sort: 2 },
  { name: '总进球数区间', parent: '进球', sort: 1 },
  { name: '大小球', parent: '进球', sort: 2 },
  { name: '正确比分', parent: '比分', sort: 1 },
  { name: '半全场胜平负', parent: '半全场', sort: 1 },
  { name: '让球盘', parent: '盘口', sort: 1 }
]

/**
 * 确保标准 5 大类 + 7 小类存在(缺失自动创建, 误删自动恢复)
 * 返回 { 小类名: categoryId }
 */
async function ensureCategories() {
  const bigIds = {}
  for (const cat of BIG_CATS) {
    const exist = await db.collection('play-categories').where({ name: cat.name, parentId: null }).limit(1).get()
    if (exist.data && exist.data.length) {
      const doc = exist.data[0]
      bigIds[cat.name] = doc._id
      if (doc.deleted || doc.sort !== cat.sort) {
        await db.collection('play-categories').doc(doc._id).update({ deleted: false, sort: cat.sort })
      }
    } else {
      const res = await db.collection('play-categories').add({
        name: cat.name, parentId: null, sort: cat.sort, deleted: false, createTime: new Date()
      })
      bigIds[cat.name] = res.id
    }
  }

  const catIds = {}
  for (const cat of SMALL_CATS) {
    const exist = await db.collection('play-categories').where({ name: cat.name, parentId: bigIds[cat.parent] }).limit(1).get()
    if (exist.data && exist.data.length) {
      const doc = exist.data[0]
      catIds[cat.name] = doc._id
      if (doc.deleted || doc.sort !== cat.sort) {
        await db.collection('play-categories').doc(doc._id).update({ deleted: false, sort: cat.sort })
      }
    } else {
      const res = await db.collection('play-categories').add({
        name: cat.name, parentId: bigIds[cat.parent], sort: cat.sort, deleted: false, createTime: new Date()
      })
      catIds[cat.name] = res.id
    }
  }

  // 清理旧版小类(准确进球数/上半场准确进球数等不在标准7组内的), 保持分类与玩法一致
  const stdNames = SMALL_CATS.map(c => c.name)
  const allSmall = await db.collection('play-categories').where({ parentId: db.command.neq(null) }).get()
  for (const c of allSmall.data || []) {
    if (!stdNames.includes(c.name) && !c.deleted) {
      await db.collection('play-categories').doc(c._id).update({ deleted: true })
    }
  }
  return catIds
}

// ==================== 同步锁与状态 ====================

async function acquireLock() {
  try {
    const res = await db.collection('sync-status').doc('main').get()
    const doc = res.data && res.data[0]
    if (doc && doc.running && doc.lockAt && (Date.now() - new Date(doc.lockAt).getTime() < 2 * 60 * 1000)) {
      return false // 上一轮还在跑
    }
    await db.collection('sync-status').doc('main').set({ running: true, lockAt: new Date() })
    return true
  } catch (e) {
    return true // 首次运行无文档
  }
}

async function releaseLock(result) {
  try {
    await db.collection('sync-status').doc('main').set({
      running: false,
      lastRunAt: new Date(),
      lastSuccessAt: result.error ? null : new Date(),
      stats: result.stats || null,
      error: result.error || null
    })
  } catch (e) {
    console.error('releaseLock error:', e)
  }
}

// ==================== 主流程 ====================

async function doSync() {
  const stats = {
    matchesAdded: 0, matchesUpdated: 0, playsAdded: 0, playsUpdated: 0,
    oddsChangedMatches: 0, settledOrders: 0, refunded: 0, pendingPlays: 0,
    expiredMatches: 0,
    errors: []
  }
  const oddsChangedMatchIds = new Set()
  const settledMatchIds = new Set()

  // 1. 分类映射(缺失自动创建)
  const catIds = await ensureCategories()

  // 2. 拉赛事列表(today/next ≈ 昨天~后天+2)
  const listUrl = BASE + '/i/live/jczq/date/today/next?_=' + Date.now()
  const list = await fetchJson(listUrl)
  const models = []
  for (const item of list.items || []) {
    for (const m of item.matches || []) {
      if (m.type === 'football' && m.model && m.model.matchId) models.push(m.model)
    }
  }

  // 3. upsert 赛事
  const matchMap = {} // sourceMatchId -> { _id }
  for (const model of models) {
    try {
      const r = await upsertMatch(model, stats)
      if (r.skip) continue
      matchMap[String(model.matchId)] = r
    } catch (e) {
      stats.errors.push('赛事同步失败 ' + model.matchId + ': ' + e.message)
    }
  }

  // 4. 对未开赛场次并发拉取赔率+盘口
  const needOdds = models.filter(m => mapStatus(m) === 'upcoming' && matchMap[String(m.matchId)])
  await runPool(needOdds, ODDS_SYNC_CONCURRENCY, async (model) => {
    const mid = String(model.matchId)
    const internalId = matchMap[mid]._id
    const ref = BASE + '/live/football/' + mid
    const errors = []

    // 竞彩官方赔率
    try {
      const st = await fetchJson(BASE + '/i/match/jczq/sporttery/' + mid, ref)
      if (st && st.code === 0 && st.data) {
        const plays = buildSportteryPlays(st.data)
        let changed = false
        for (const p of plays) {
          const r = await upsertPlay(internalId, catIds, p)
          if (r.error) errors.push(r.error)
          else { if (r.added) stats.playsAdded++; else stats.playsUpdated++; if (r.changed) changed = true }
        }
        if (changed) oddsChangedMatchIds.add(internalId)
      }
    } catch (e) {
      errors.push('竞彩赔率失败 ' + mid + ': ' + e.message)
    }

    // 盘口(亚盘+大小球)
    try {
      const pk = await fetchJson(BASE + '/i/match/football/' + mid + '/odds/pankou/', ref)
      if (pk && (pk.asia || pk.dxq)) {
        let changed = false
        const asiaPlays = buildPankouPlays(mergePankou(pk.asia || [], PANKOU_COMPANIES), 'asia')
        const dxqPlays = buildPankouPlays(mergePankou(pk.dxq || [], PANKOU_COMPANIES), 'dxq')
        for (const p of asiaPlays.concat(dxqPlays)) {
          const r = await upsertPlay(internalId, catIds, p)
          if (r.error) errors.push(r.error)
          else { if (r.added) stats.playsAdded++; else stats.playsUpdated++; if (r.changed) changed = true }
        }
        if (changed) oddsChangedMatchIds.add(internalId)
      }
    } catch (e) {
      errors.push('盘口失败 ' + mid + ': ' + e.message)
    }

    if (errors.length) stats.errors.push(mid + ': ' + errors.join('; '))
    return null
  })

  // 5. oddsVersion++ (移动端轮询据此刷新)
  for (const mid of oddsChangedMatchIds) {
    await db.collection('matches').doc(mid).update({ oddsVersion: cmd.inc(1) })
    stats.oddsChangedMatches++
  }

  // 6. 自动结算完场赛事
  const finishedRes = await db.collection('matches')
    .where({ status: cmd.in(['finished', 'cancelled']), settledAt: null })
    .limit(200)
    .get()
  for (const m of finishedRes.data || []) {
    try {
      if (m.status === 'cancelled') {
        // 取消赛事: 涉及订单退本金
        const ordersRes = await db.collection('orders')
          .where({ matchIds: cmd.in([m._id]), status: cmd.neq('refunded') })
          .get()
        for (const order of ordersRes.data || []) {
          if (order.status === 'refunded') continue
          await db.collection('orders').doc(order._id).update({ status: 'refunded', winAmount: 0, settleTime: new Date() })
          await db.collection('users').doc(order.userId).update({ balance: cmd.inc(order.betAmount) })
          await writeWalletLog({ userId: order.userId, type: 'refund', amount: order.betAmount, orderId: order._id, orderNo: order.orderNo, remark: '赛事取消退款' })
          stats.refunded++
        }
        await db.collection('matches').doc(m._id).update({ settledAt: new Date(), updateTime: new Date() })
        continue
      }
      await settleFinishedMatch(m, stats)
      settledMatchIds.add(m._id)
    } catch (e) {
      stats.errors.push('结算失败 ' + m._id + ': ' + e.message)
    }
  }

  // 7. 清理僵尸赛事: 开赛时间已过很久仍停留在 upcoming 的场次
  //    列表接口只拉 today/next 窗口, 赛事滑出窗口后不会再被更新, 否则会永久显示"未开始"
  //    注意: 必须标成 expired 而不是 finished —— 这些场次没有比分, regularScore 会把
  //    undefined 当 0:0, 标 finished 会被自动结算引擎按假比分结算所有订单
  const zombieRes = await db.collection('matches')
    .where({ status: 'upcoming', deleted: cmd.neq(true), startTime: cmd.lt(new Date(Date.now() - ZOMBIE_GRACE_MS)) })
    .limit(200)
    .get()
  for (const m of zombieRes.data || []) {
    try {
      // 串关存 matchIds 数组, 单关历史上存过 matchId, 两个都查
      const byArr = await db.collection('orders').where({ matchIds: cmd.in([m._id]) }).count()
      const bySingle = await db.collection('orders').where({ matchId: m._id }).count()
      const orderCount = byArr.total + bySingle.total
      await db.collection('matches').doc(m._id).update({ status: 'expired', updateTime: new Date() })
      stats.expiredMatches++
      if (orderCount > 0) {
        // 有过期场次仍挂着订单 -> 需要人工核对比分后处理, 单独告警
        stats.errors.push('赛事已过期但存在 ' + orderCount + ' 笔订单, 需人工处理: ' + (m.teamA || '') + ' vs ' + (m.teamB || '') + ' (' + m._id + ')')
        await db.collection('operation-logs').add({
          adminId: 'system', adminName: 'system',
          action: 'match_expired', targetType: 'matches', targetId: m._id,
          detail: '赛事已过期(未同步到赛果)且存在 ' + orderCount + ' 笔订单, 待人工核对: ' + (m.teamA || '') + ' vs ' + (m.teamB || ''),
          createTime: new Date()
        })
      }
    } catch (e) {
      stats.errors.push('过期赛事处理失败 ' + m._id + ': ' + e.message)
    }
  }

  return { stats, settledMatchIds: Array.from(settledMatchIds) }
}

exports.main = async (event, context) => {
  // 定时触发与手动触发共用入口; 手动触发时 event 可能含任意参数, 忽略
  if (!(await acquireLock())) {
    return { code: -1, message: '上一轮同步仍在运行, 跳过本次' }
  }
  const startedAt = Date.now()
  try {
    const result = await doSync()
    const cost = ((Date.now() - startedAt) / 1000).toFixed(1) + 's'
    await releaseLock({ stats: result.stats, error: null })
    console.log('sync-jczq done in ' + cost, JSON.stringify(result.stats))
    return { code: 0, message: '同步完成, 耗时 ' + cost, data: result.stats }
  } catch (e) {
    await releaseLock({ stats: null, error: e.message || String(e) })
    console.error('sync-jczq error:', e)
    return { code: -1, message: '同步失败: ' + (e.message || String(e)) }
  }
}
