'use strict'
// @url /user/orders
const db = uniCloud.database()
const { success, fail, verifyToken, generateOrderNo, writeLog } = require('./utils')

exports.main = async (event, context) => {
  // ============ 兼容两种调用方式 ============
  // 1. uniCloud.callFunction (移动端): 数据直接在 event 顶层
  // 2. HTTP URL 调用 (管理端): event.httpMethod / event.body / event.queryStringParameters
  const isHttp = !!event.httpMethod
  const token = event.token || (isHttp && event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const user = await verifyToken(db, token)
  if (!user) return fail('未登录或登录已过期', 401)

  try {
    // ============ 判断操作类型 ============
    // 直接调用：有 matchId + playIds → 下单；否则 → 查订单
    // HTTP 调用：method === 'POST' → 下单；method === 'GET' → 查订单
    const isCreate = isHttp
      ? (event.httpMethod === 'POST')
      : !!(event.matchId && event.playIds && event.playIds.length)

    // ============ 查询我的订单 ============
    if (!isCreate) {
      const page = Number(event.page || (isHttp ? (event.queryStringParameters || {}).page : 0) || 1)
      const pageSize = Number(event.pageSize || (isHttp ? (event.queryStringParameters || {}).pageSize : 0) || 20)

      const total = await db.collection('orders').where({ userId: user._id }).count()
      const res = await db.collection('orders')
        .where({ userId: user._id })
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      const list = await Promise.all((res.data || []).map(async order => {
        const items = await db.collection('order-items').where({ orderId: order._id }).get()
        const match = await db.collection('matches').doc(order.matchId).get()
        return {
          ...order,
          matchName: (match.data && match.data[0] && match.data[0].name) || '',
          items: items.data || []
        }
      }))

      return success({ list, total: total.total })
    }

    // ============ 下单 ============
    // 统一从正确的位置取参数
    const body = isHttp ? (event.body ? JSON.parse(event.body) : {}) : event
    const { matchId, playIds, betAmount } = body

    // 参数校验
    if (!matchId || !playIds || !playIds.length || !betAmount) return fail('缺少必填参数')
    if (playIds.length === 0) return fail('请至少选择一个玩法')

    // 获取系统配置的下注限额
    const configs = await db.collection('system-config').get()
    const configMap = {}
    ;(configs.data || []).forEach(c => { configMap[c.key] = c.value })

    const minBet = parseFloat(configMap.minBet || '2.00')
    const maxBet = parseFloat(configMap.maxBet || '100000.00')

    if (betAmount < minBet) return fail('下注金额不能低于 ¥' + minBet.toFixed(2))
    if (betAmount > maxBet) return fail('下注金额不能超过 ¥' + maxBet.toFixed(2))

    // 验证赛事状态（只能下注未开始的赛事）
    const match = await db.collection('matches').doc(matchId).get()
    if (!match.data || match.data.length === 0) return fail('赛事不存在')
    if (match.data[0].status !== 'upcoming') return fail('该赛事已开始，不可下注')
    if (new Date(match.data[0].startTime) <= new Date()) return fail('赛事已开始，不可下注')

    // 验证所有玩法是否属于同一赛事
    const plays = await db.collection('plays').where({ _id: db.command.in(playIds) }).get()
    if (!plays.data || plays.data.length !== playIds.length) return fail('存在无效的玩法')

    for (const play of plays.data) {
      if (play.matchId !== matchId) return fail('所有玩法必须属于同一赛事')
    }

    // 计算总赔率
    const isParlay = playIds.length > 1
    let totalOdds = 1
    const orderItems = []

    for (const play of plays.data) {
      totalOdds *= play.odds
      orderItems.push({
        playId: play._id,
        oddsSnapshot: play.odds,
        playName: play.name,
        categoryName: ''
      })
    }

    // 补充分类名称快照
    await Promise.all(orderItems.map(async item => {
      const play = plays.data.find(p => p._id === item.playId)
      if (play && play.categoryId) {
        const cat = await db.collection('play-categories').doc(play.categoryId).get()
        item.categoryName = (cat.data && cat.data[0] && cat.data[0].name) || ''
      }
    }))

    totalOdds = Math.round(totalOdds * 100) / 100
    const winAmount = Math.round(betAmount * totalOdds * 100) / 100

    // 创建订单
    const orderNo = generateOrderNo()
    const orderRes = await db.collection('orders').add({
      orderNo,
      userId: user._id,
      matchId,
      betAmount: Number(betAmount),
      totalOdds,
      winAmount: 0,
      status: 'pending',
      isParlay,
      createTime: new Date()
    })

    // 创建订单明细
    await Promise.all(orderItems.map(item => {
      return db.collection('order-items').add({
        ...item,
        orderId: orderRes.id
      })
    }))

    return success({
      orderId: orderRes.id,
      orderNo,
      totalOdds,
      winAmount,
      betAmount: Number(betAmount)
    }, '下单成功')
  } catch (e) {
    console.error('user-order error:', e)
    return fail(e.message || '服务器错误')
  }
}
