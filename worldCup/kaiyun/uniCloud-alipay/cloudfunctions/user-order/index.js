'use strict'
// @url /user/orders
// 下单规则(2026-08-20 客户确认):
//  - 提交时跟随系统实时赔率(服务端下单时重读最新赔率, 不用客户端传来的赔率)
//  - 单关: 全部玩法(胜平负/让球胜平负/比分/总进球/半全场/让球盘/大小球)均可单关
//  - 串关: 2~8场, 同场只能选1个玩法, 不同玩法类型可混合, 赔率相乘
//  - 停售(stop)/下架/已开赛/未上架/数据过期(>10分钟未同步) → 拒绝
//  - 散户: 校验余额并扣款(余额不足拒绝); 收单账户: 不校验余额, 流水照记(可为负数)
//  - 下注限额(minBet/maxBet)仅限散户
const db = uniCloud.database()
const cmd = db.command
const { success, fail, verifyToken, generateOrderNo } = require('./utils')

const MAX_PARLAY = 8
const STALE_MS = 10 * 60 * 1000

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

      const list = await Promise.all((res.data || []).map(async order => {
        const items = await db.collection('order-items').where({ orderId: order._id }).get()

        const matchIds = order.matchIds || (order.matchId ? [order.matchId] : [])
        const matchesData = []
        for (const mId of matchIds) {
          const match = await db.collection('matches').doc(mId).get()
          const mData = (match.data && match.data[0]) || {}
          if (mData._id) {
            matchesData.push({
              _id: mData._id,
              name: mData.name || '',
              teamA: mData.teamA || '',
              teamB: mData.teamB || ''
            })
          }
        }

        const itemsWithMatch = (items.data || []).map(item => {
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
      }))

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

    for (const play of orderedPlays) {
      const match = matchMap[play.matchId]
      // 下架/停售
      if (play.deleted) return fail('玩法「' + play.name + '」已下架')
      if (play.stop) return fail('玩法「' + play.name + '」已停售')
      // 赛事状态/上架/开赛截止
      if (match.online === false) return fail('赛事已下架: ' + (match.name || match.teamA + ' vs ' + match.teamB))
      if (match.status !== 'upcoming') return fail('赛事已开始或已结束，不可下注: ' + (match.name || match.teamA + ' vs ' + match.teamB))
      if (new Date(match.startTime) <= now) return fail('赛事已开始，不可下注: ' + (match.name || match.teamA + ' vs ' + match.teamB))
      if (match.displayState && match.displayState !== '未开始') return fail('赛事状态异常(' + match.displayState + ')，不可下注')
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
