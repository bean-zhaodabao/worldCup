'use strict'
// @url /user/orders
// 下单规则(2026-08-20 客户确认):
//  - 提交时跟随系统实时赔率(服务端下单时重读最新赔率, 不用客户端传来的赔率)
//  - 单关: 全部玩法(胜平负/让球胜平负/比分/总进球/半全场/让球盘/大小球)均可单关
//  - 串关: 2~8场, 同场只能选1个玩法, 不同玩法类型可混合, 赔率相乘
//  - 停售(stop)/下架/已开赛/未上架/数据过期(>10分钟未同步) → 拒绝
//  - 进行中赛事: 当前不支持下注(仅移动端展示实时比分); LIVE_BET_READY 默认关闭
//  - 散户: 校验余额并扣款(余额不足拒绝); 收单账户: 不校验余额, 流水照记(可为负数)
//  - 下注限额(minBet/maxBet)仅限散户
const db = uniCloud.database()
const cmd = db.command
const { success, fail, verifyToken, generateOrderNo } = require('./utils')

const MAX_PARLAY = 8
const STALE_MS = 10 * 60 * 1000
const LIVE_BET_CUTOFF_MINUTE = 85
const LIVE_ODDS_MAX_AGE_MS = 2 * 60 * 1000
const LIVE_MAX_ELAPSED_MS = 150 * 60 * 1000
const LIVE_SUB_CATEGORIES = ['让球盘', '大小球']
// vipc 盘口为赛前盘, 暂无实时滚球赔率源; 接入后与 sync-jczq/user-match 同步打开
const LIVE_BET_READY = false

function round2(n) { return Math.round(n * 100) / 100 }

async function writeWalletLog(entry) {
  await db.collection('wallet-logs').add(Object.assign({ createTime: new Date() }, entry))
}

exports.main = async (event, context) => {
  // ============ 兼容两种调用方式 ============
  const isHttp = !!event.httpMethod
  const token = event.token || (isHttp && event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const user = await verifyToken(db, token)
  if (!user) return fail('未登录或登录已过期', 401)
  if (user.role !== 'user') return fail('无下注权限', 403)

  try {
    // ============ 判断操作类型 ============
    const isCreate = isHttp
      ? (event.httpMethod === 'POST')
      : !!(event.playIds && event.playIds.length) && !!(event.betAmount)

    // ============ 查询我的订单 ============
    if (!isCreate) {
      const page = Number(event.page || (isHttp ? (event.queryStringParameters || {}).page : 0) || 1)
      const pageSize = Number(event.pageSize || (isHttp ? (event.queryStringParameters || {}).pageSize : 0) || 20)

      const where = { userId: user._id }
      const total = await db.collection('orders').where(where).count()
      const res = await db.collection('orders')
        .where(where)
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      const orderRows = res.data || []
      const orderIds = orderRows.map(o => o._id)
      const allMatchIds = [...new Set(orderRows.reduce((ids, o) => {
        return ids.concat(o.matchIds || (o.matchId ? [o.matchId] : []))
      }, []))]

      // 批量读取明细与赛事, 避免订单多时逐单查询过慢
      const [itemsRes, matchesRes] = await Promise.all([
        orderIds.length
          ? db.collection('order-items').where({ orderId: cmd.in(orderIds) }).limit(1000).get()
          : Promise.resolve({ data: [] }),
        allMatchIds.length
          ? db.collection('matches').where({ _id: cmd.in(allMatchIds) }).limit(1000).get()
          : Promise.resolve({ data: [] })
      ])

      const itemsByOrder = {}
      for (const item of itemsRes.data || []) {
        if (!itemsByOrder[item.orderId]) itemsByOrder[item.orderId] = []
        itemsByOrder[item.orderId].push(item)
      }
      const matchMap = {}
      for (const m of matchesRes.data || []) matchMap[m._id] = m

      const list = orderRows.map(order => {
        const matchIds = order.matchIds || (order.matchId ? [order.matchId] : [])
        const matchesData = matchIds.map(mId => matchMap[mId]).filter(Boolean).map(mData => ({
          _id: mData._id,
          name: mData.name || '',
          leagueName: mData.leagueName || '',
          teamA: mData.teamA || '',
          teamB: mData.teamB || '',
          startTime: mData.startTime || null,
          status: mData.status || '',
          displayState: mData.displayState || '',
          homeScore: mData.homeScore,
          guestScore: mData.guestScore,
          homeHalfScore: mData.homeHalfScore,
          guestHalfScore: mData.guestHalfScore
        }))

        const itemsWithMatch = (itemsByOrder[order._id] || []).map(item => {
          const relatedMatch = matchesData.find(m => m._id === item.matchId)
          return {
            ...item,
            teamA: relatedMatch ? relatedMatch.teamA : (item.teamA || ''),
            teamB: relatedMatch ? relatedMatch.teamB : (item.teamB || ''),
            matchName: relatedMatch ? relatedMatch.name : ''
          }
        })

        return {
          ...order,
          matchName: matchesData.length === 1 ? matchesData[0].name : (matchesData.map(m => m.name).join(' / ')),
          teamA: matchesData.length === 1 ? matchesData[0].teamA : '',
          teamB: matchesData.length === 1 ? matchesData[0].teamB : '',
          matches: matchesData,
          items: itemsWithMatch
        }
      })

      return success({ list, total: total.total })
    }

    // ============ 下单 ============
    const body = isHttp ? (event.body ? JSON.parse(event.body) : {}) : event
    const { playIds, betAmount, isParlay } = body

    // 参数校验
    if (!playIds || !Array.isArray(playIds) || playIds.length === 0) return fail('请至少选择一个玩法')
    if (!betAmount || isNaN(Number(betAmount)) || Number(betAmount) <= 0) return fail('下注金额无效')

    const amount = round2(Number(betAmount))

    // 串关数量限制 2~8
    if (isParlay && playIds.length < 2) return fail('串关至少需要选择2个场次')
    if (isParlay && playIds.length > MAX_PARLAY) return fail('串关最多 ' + MAX_PARLAY + ' 个场次')

    // ===== 重读最新玩法与赛事(实时赔率) =====
    const playsRes = await db.collection('plays').where({ _id: cmd.in(playIds) }).get()
    const playMap = {}
    for (const p of playsRes.data || []) playMap[p._id] = p
    if (Object.keys(playMap).length !== new Set(playIds).size) return fail('存在无效的玩法')

    const orderedPlays = playIds.map(id => playMap[id])
    const matchIds = [...new Set(orderedPlays.map(p => p.matchId))]

    // 串关: 场次不能重复
    if (isParlay && matchIds.length !== orderedPlays.length) return fail('串关不能重复选择同一场次')

    const now = new Date()
    const matchMap = {}
    for (const mId of matchIds) {
      const mRes = await db.collection('matches').doc(mId).get()
      const m = (mRes.data && mRes.data[0]) || null
      if (!m) return fail('赛事不存在')
      matchMap[mId] = m
    }

    // 滚球下注需要校验玩法分类(让球盘/大小球), 防止伪造 sourceKey
    const hasLivePlay = orderedPlays.some(p => matchMap[p.matchId].status === 'live')
    const categoryIds = hasLivePlay ? [...new Set(orderedPlays.map(p => p.categoryId).filter(Boolean))] : []
    const catRes = categoryIds.length
      ? await db.collection('play-categories').where({ _id: cmd.in(categoryIds), deleted: cmd.neq(true) }).get()
      : { data: [] }
    const catNameMap = {}
    for (const c of catRes.data || []) catNameMap[c._id] = c.name

    for (const play of orderedPlays) {
      const match = matchMap[play.matchId]
      const isLive = match.status === 'live'
      const matchLabel = match.name || match.teamA + ' vs ' + match.teamB
      // 下架/停售
      if (play.deleted) return fail('玩法「' + play.name + '」已下架')
      if (play.stop) return fail('玩法「' + play.name + '」已停售')
      // 赛事状态/上架/开赛截止
      if (match.online === false) return fail('赛事已下架: ' + matchLabel)
      if (!isLive && match.status !== 'upcoming') return fail('赛事已开始或已结束，不可下注: ' + matchLabel)
      if (!isLive && new Date(match.startTime) <= now) return fail('赛事已开始，不可下注: ' + matchLabel)

      if (isLive) {
        if (!LIVE_BET_READY) return fail('滚球暂未开放，请稍后再试')
        // 滚球只开放亚盘/大小球, 且一期只支持单关
        if (isParlay || orderedPlays.length > 1) return fail('滚球玩法仅支持单关，暂不支持串关')
        if (LIVE_SUB_CATEGORIES.indexOf(catNameMap[play.categoryId]) < 0 ||
          !/^(asia|dxq):/.test(String(play.sourceKey || ''))) {
          return fail('该玩法滚球期间已停售')
        }
        if (match.displayState && /(完场|取消|推迟|中断|腰斩|加时|点球)/.test(match.displayState)) {
          return fail('赛事已结束或暂停，不可下注: ' + matchLabel)
        }
        if (match.homeScore === undefined || match.homeScore === null ||
          match.guestScore === undefined || match.guestScore === null) {
          return fail('赛事比分异常，暂不可下注: ' + matchLabel)
        }
        // 85分钟后停止滚球下注(加时/点球盘不开放)
        const minuteMatch = String(match.time || '').match(/\d+/)
        const liveMinute = minuteMatch ? parseInt(minuteMatch[0], 10) : NaN
        if (Number.isFinite(liveMinute) && liveMinute >= LIVE_BET_CUTOFF_MINUTE) {
          return fail('滚球已到 ' + LIVE_BET_CUTOFF_MINUTE + ' 分钟，停止下注')
        }
        // 兜底: 数据异常时避免长时间停留在 live 的赛事继续接单
        const startedAt = new Date(match.startTime).getTime()
        if (Number.isFinite(startedAt) && now.getTime() - startedAt > LIVE_MAX_ELAPSED_MS) {
          return fail('赛事数据超时，滚球已停止下注')
        }
        if (new Date(match.startTime) > now) return fail('赛事尚未开赛，暂不可滚球下注')
        // 盘口必须新鲜: 同步失败/停止更新超过 2 分钟则拒绝
        const updatedAt = play.updateTime ? new Date(play.updateTime).getTime() : 0
        if (!updatedAt || now.getTime() - updatedAt > LIVE_ODDS_MAX_AGE_MS) {
          return fail('滚球盘口已更新，请刷新后重试')
        }
      } else if (match.displayState && match.displayState !== '未开始') {
        return fail('赛事状态异常(' + match.displayState + ')，不可下注')
      }

      // 数据过期保护(同步超过10分钟未更新则暂停投注)
      if (match.syncedAt && (now.getTime() - new Date(match.syncedAt).getTime()) > STALE_MS) return fail('赛事数据暂未更新，请稍后再试')
    }

    // 下注限额(仅散户)
    if (user.type === 'retail') {
      const configs = await db.collection('system-config').get()
      const configMap = {}
      ;(configs.data || []).forEach(c => { configMap[c.key] = c.value })
      const minBet = parseFloat(configMap.minBet || '2.00')
      const maxBet = parseFloat(configMap.maxBet || '100000.00')
      if (amount < minBet) return fail('下注金额不能低于 ¥' + minBet.toFixed(2))
      if (amount > maxBet) return fail('下注金额不能超过 ¥' + maxBet.toFixed(2))
    }

    // ===== 计算实时总赔率(服务端以当前赔率为准) =====
    let totalOdds = 1
    for (const play of orderedPlays) totalOdds *= play.odds
    totalOdds = round2(totalOdds)
    const winAmountPreview = round2(amount * totalOdds)

    // ===== 扣款 =====
    if (user.type === 'retail') {
      // 原子扣款: 余额不足则更新0条
      const upd = await db.collection('users')
        .where({ _id: user._id, balance: cmd.gte(amount) })
        .update({ balance: cmd.inc(-amount) })
      if (!upd.updated || upd.updated === 0) return fail('余额不足，无法下注')
    } else {
      // 收单账户: 不校验余额, 流水照记(可为负数)
      await db.collection('users').doc(user._id).update({ balance: cmd.inc(-amount) })
    }

    // ===== 创建订单 =====
    try {
      // 读取用户当前归属代理，下单时快照，后续转移/调比例不影响本单
      const userDocRes = await db.collection('users').doc(user._id).get()
      const userDoc = (userDocRes.data && userDocRes.data[0]) || {}
      const agentId = userDoc.agentId || null
      let agentRate = 0
      if (agentId) {
        const agentRes = await db.collection('users').doc(agentId).get()
        const agentDoc = (agentRes.data && agentRes.data[0]) || {}
        if (agentDoc.role === 'agent' && agentDoc.status === 'active') {
          agentRate = Number(agentDoc.commissionRate || 0)
        }
      }
      const orderNo = generateOrderNo()
      const orderData = {
        orderNo,
        userId: user._id,
        matchIds,               // 支持多场次（串关）
        matchId: matchIds[0],   // 兼容旧字段
        betAmount: amount,
        totalOdds,
        winAmount: 0,
        status: 'pending',
        isParlay: !!isParlay,
        agentId: agentId || null,
        agentRate: agentRate,
        commissionStatus: agentId ? 'none' : 'skipped',
        createTime: new Date()
      }
      const orderRes = await db.collection('orders').add(orderData)

      // 订单明细(赔率快照 + 结算所需字段)
      await Promise.all(orderedPlays.map(async play => {
        const match = matchMap[play.matchId]
        return db.collection('order-items').add({
          orderId: orderRes.id,
          playId: play._id,
          matchId: play.matchId,
          oddsSnapshot: play.odds,          // 下单时实时赔率快照
          playName: play.name,
          categoryName: play.categoryName || '',
          sourceKey: play.sourceKey || '',
          handicap: play.handicap,
          side: play.side || null,
          water: play.water || null,
          matchName: match.name || '',
          createTime: new Date()
        })
      }))

      // 扣款流水(读取扣款后余额)
      const uAfterRes = await db.collection('users').doc(user._id).get()
      const uAfter = (uAfterRes.data && uAfterRes.data[0]) || {}
      await writeWalletLog({
        userId: user._id,
        type: 'bet',
        amount: -amount,
        balanceAfter: uAfter.balance || 0,
        frozenAfter: uAfter.frozenBalance || 0,
        orderId: orderRes.id,
        orderNo,
        remark: isParlay ? '串关下注' : '单关下注'
      })

      // 短信通知任务（独立 try/catch，失败不影响下单）
      try {
        await db.collection('sms-tasks').add({
          type: 'bet',
          orderId: orderRes.id,
          orderNo,
          userId: user._id,
          userName: user.username || '用户',
          betAmount: amount,
          status: 'pending',
          attempts: 0,
          nextRetryAt: new Date(),
          lastError: '',
          createTime: new Date(),
          updateTime: new Date()
        })
      } catch (smsErr) {
        console.error('sms task create error:', smsErr)
      }

      return success({
        orderId: orderRes.id,
        orderNo,
        totalOdds,
        winAmount: winAmountPreview,
        betAmount: amount,
        matchIds,
        isParlay: !!isParlay,
        balance: uAfter.balance || 0
      }, '下单成功')
    } catch (e) {
      // 订单创建失败, 回滚扣款
      await db.collection('users').doc(user._id).update({ balance: cmd.inc(amount) })
      console.error('user-order create error:', e)
      return fail('下单失败，请重试')
    }
  } catch (e) {
    console.error('user-order error:', e)
    return fail(e.message || '服务器错误')
  }
}
