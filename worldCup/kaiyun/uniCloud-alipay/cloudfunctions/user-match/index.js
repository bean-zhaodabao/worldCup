'use strict'
// @url /user/matches
// 移动端赛事列表: 返回"今明2天"(天数可配)内已上架未开赛的赛事 + 当前进行中的赛事
// 详情/轮询: 传 matchId 可取单场(不受展示窗口限制)
// 未开赛含7组玩法; 进行中只返回比分/时间等实时数据, 不返回可下注玩法
const db = uniCloud.database()
const cmd = db.command
const { success, fail, verifyToken } = require('./utils')

// 北京时间(UTC+8)为界: 展示窗口上界 = "今天起第 days 天"的 00:00(毫秒), 用作开赛时间开区间
// 例: days=2 时上界为后天00:00, 即"今天+明天"两天
const CN_OFFSET_MS = 8 * 60 * 60 * 1000
const endOfWindow = (nowMs, days) => {
  const cn = new Date(nowMs + CN_OFFSET_MS)
  return new Date(Date.UTC(cn.getUTCFullYear(), cn.getUTCMonth(), cn.getUTCDate() + days) - CN_OFFSET_MS)
}
// 展示天数默认2(含今天和明天); 上限10, 防止误配置成超大窗口
const DEFAULT_MATCH_DAYS = 2
const MAX_MATCH_DAYS = 10
const LIVE_LOOKBACK_MS = 6 * 60 * 60 * 1000
const LIVE_SUB_CATEGORIES = ['让球盘', '大小球']
// vipc 盘口为赛前盘, 暂无实时滚球赔率源: 进行中赛事只展示比分, 不返回可下注玩法
const LIVE_BET_READY = false

exports.main = async (event, context) => {
  const token = event.token || (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const user = await verifyToken(db, token)
  if (!user) return fail('未登录或登录已过期', 401)
  if (user.role !== 'user') return fail('无权限', 403)

  try {
    // 0. 读取移动端赛事展示天数(后台 system-config.matchDays, 默认2天)
    let matchDays = DEFAULT_MATCH_DAYS
    try {
      const cfg = await db.collection('system-config').where({ key: 'matchDays' }).get()
      const v = parseInt(cfg.data && cfg.data[0] && cfg.data[0].value, 10)
      if (v >= 1) matchDays = Math.min(v, MAX_MATCH_DAYS)
    } catch (e) { /* 无配置或查询失败时用默认值 */ }

    const reqMatchId = event.matchId ? String(event.matchId) : ''

    // 1. 查赛事
    //   - 列表(matchId 为空): 当前进行中的滚球赛事 + 已上架未开赛且开赛时间在展示窗口内的赛事
    //   - 详情/轮询(matchId 有值): 按 id 取单场, 不看展示窗口, 保证已打开页面跨天/跨窗口后仍可用
    let matchesRes
    if (reqMatchId) {
      matchesRes = await db.collection('matches')
        .where({ _id: reqMatchId, online: cmd.neq(false), deleted: cmd.neq(true) })
        .limit(1)
        .get()
    } else {
      const now = new Date()
      const deadline = endOfWindow(now.getTime(), matchDays)
      const liveSince = new Date(now.getTime() - LIVE_LOOKBACK_MS)
      const [liveRes, upcomingRes] = await Promise.all([
        db.collection('matches')
          .where({
            online: cmd.neq(false),
            deleted: cmd.neq(true),
            status: 'live',
            startTime: cmd.gt(liveSince)
          })
          .orderBy('startTime', 'asc')
          .limit(50)
          .get(),
        db.collection('matches')
          .where({
            online: cmd.neq(false),
            deleted: cmd.neq(true),
            status: 'upcoming',
            startTime: cmd.gt(now).and(cmd.lt(deadline))
          })
          .orderBy('startTime', 'asc')
          .limit(200)
          .get()
      ])

      // 进行中排最前; 合并后最多 200 场, 与 check-odds-version 的单次上限保持一致
      const merged = []
      const seen = new Set()
      for (const m of (liveRes.data || []).concat(upcomingRes.data || [])) {
        if (seen.has(m._id)) continue
        seen.add(m._id)
        merged.push(m)
        if (merged.length >= 200) break
      }
      matchesRes = { data: merged }
    }

    const matches = matchesRes.data || []

    // 同步健康时间: 让移动端在列表为空时能区分"真的没赛事"和"数据同步停摆"
    let lastSyncAt = null
    try {
      const ss = await db.collection('sync-status').doc('main').get()
      const doc = ss.data && ss.data[0]
      if (doc) lastSyncAt = doc.lastSuccessAt || doc.lastRunAt || null
    } catch (e) { /* 首次运行无该文档 */ }

    if (matches.length === 0) return success({ matches: [], lastSyncAt })

    // 2. 一次取出所有玩法与分类, 避免逐场查询
    //    玩法总量可能超过单次 get 上限(阿里云默认100/最大1000), 分页取全
    const matchIds = matches.map(m => m._id)
    const playsWhere = { matchId: cmd.in(matchIds), deleted: cmd.neq(true), stop: cmd.neq(true) }
    const allPlays = []
    let playsPage = 0
    while (true) {
      const part = await db.collection('plays').where(playsWhere).skip(playsPage * 1000).limit(1000).get()
      const partData = part.data || []
      allPlays.push(...partData)
      if (partData.length < 1000) break
      playsPage++
    }
    const catsRes = await db.collection('play-categories').where({ deleted: cmd.neq(true) }).get()

    const catMap = {}
    for (const c of catsRes.data || []) catMap[c._id] = c

    const playsByMatch = {}
    for (const p of allPlays) {
      if (!playsByMatch[p.matchId]) playsByMatch[p.matchId] = []
      playsByMatch[p.matchId].push(p)
    }

    // 3. 组装: 大类(5个Tab) -> 小类 -> 玩法
    const result = []
    for (const match of matches) {
      const isLive = match.status === 'live'
      const plays = (playsByMatch[match._id] || []).sort((a, b) => (a.sort || 0) - (b.sort || 0))

      // 大类分组(按分类树的 sort 顺序)
      const bigMap = {}
      const bigOrder = []
      for (const play of plays) {
        const small = catMap[play.categoryId]
        if (!small) continue
        // 进行中赛事: 未接入实时滚球源时只展示比分, 不下发任何玩法
        if (isLive && !LIVE_BET_READY) continue
        // 接入滚球源后只开放接口滚球盘(让球盘/大小球), 竞彩玩法在开赛后停售
        if (isLive && (LIVE_SUB_CATEGORIES.indexOf(small.name) < 0 ||
          !/^(asia|dxq):/.test(String(play.sourceKey || '')))) continue
        const big = small.parentId ? catMap[small.parentId] : null
        const bigName = big ? big.name : (small.name || '其他')
        const bigSort = big ? (big.sort || 99) : 99
        if (!bigMap[bigName]) {
          bigMap[bigName] = { name: bigName, sort: bigSort, subs: {} }
          bigOrder.push(bigName)
        }
        const subName = small.name || ''
        if (!bigMap[bigName].subs[subName]) {
          bigMap[bigName].subs[subName] = { name: subName, sort: small.sort || 0, plays: [] }
        }
        bigMap[bigName].subs[subName].plays.push({
          _id: play._id,
          name: play.name,
          odds: play.odds,
          water: play.water || null,
          handicap: play.handicap,
          side: play.side || null,
          sourceKey: play.sourceKey,
          label: play.label || '',
          categoryName: subName,
          bigCategoryName: bigName
        })
      }

      const categoryPlays = bigOrder
        .sort((a, b) => bigMap[a].sort - bigMap[b].sort)
        .map(name => ({
          name,
          subCategories: Object.values(bigMap[name].subs)
            .sort((a, b) => a.sort - b.sort)
            .map(s => {
              // 盘口小类内按盘口行再分组(让球盘: 主/客; 大小球: 大/小)
              const s2 = {
                name: s.name,
                plays: s.plays,
                handicapPlays: null
              }
              if (s.name === '让球盘' || s.name === '大小球') {
                const rows = {}
                for (const p of s.plays) {
                  if (p.handicap === undefined || p.handicap === null) continue
                  if (!rows[p.handicap]) rows[p.handicap] = { handicap: p.handicap, home: null, away: null }
                  if (p.side === 'home' || p.side === 'over') rows[p.handicap].home = p
                  else if (p.side === 'away' || p.side === 'under') rows[p.handicap].away = p
                }
                s2.handicapPlays = Object.values(rows).sort((a, b) => a.handicap - b.handicap)
              }
              return s2
            })
        }))

      result.push({
        _id: match._id,
        oddsVersion: match.oddsVersion || 0,
        name: match.name || '',
        teamA: match.teamA,
        teamB: match.teamB,
        teamAFlag: match.teamAFlag,
        teamBFlag: match.teamBFlag,
        startTime: match.startTime,
        status: match.status,
        ccId: match.ccId || '',
        jingcaiId: match.jingcaiId || '',
        leagueName: match.leagueName || '',
        displayState: match.displayState || '',
        time: match.time || '',
        homeScore: match.homeScore,
        guestScore: match.guestScore,
        homeHalfScore: match.homeHalfScore,
        guestHalfScore: match.guestHalfScore,
        description: match.description || '',
        syncedAt: match.syncedAt,
        liveOddsAt: match.liveOddsAt || null,
        categoryPlays
      })
    }

    return success({ matches: result, lastSyncAt })
  } catch (e) {
    console.error('user-match error:', e)
    return fail(e.message || '服务器错误')
  }
}
