'use strict'
// @url /user/orders
const db = uniCloud.database()
const { success, fail, verifyToken, generateOrderNo, writeLog } = require('./utils')

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
      : !!(event.matchId || (event.matchIds && event.matchIds.length)) && !!(event.playIds && event.playIds.length)

    // ============ 查询我的订单 ============
    if (!isCreate) {
      const page = Number(event.page || (isHttp ? (event.queryStringParameters || {}).page : 0) || 1)
      const pageSize = Number(event.pageSize || (isHttp ? (event.queryStringParameters || {}).pageSize : 0) || 20)

      const total = await db.collection('orders').where({ userId: user._id, deleted: db.command.neq(true) }).count()
      const res = await db.collection('orders')
        .where({ userId: user._id, deleted: db.command.neq(true) })
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      const list = await Promise.all((res.data || []).map(async order => {
        const items = await db.collection('order-items').where({ orderId: order._id }).get()

        // 获取关联的赛事信息（支持串关多场次）
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

        // 补充分类名称
        const itemsWithCategory = await Promise.all((items.data || []).map(async item => {
          if (!item.categoryName && item.playId) {
            const play = await db.collection('plays').doc(item.playId).get()
            const playData = (play.data && play.data[0]) || {}
            if (playData.categoryId) {
              const cat = await db.collection('play-categories').doc(playData.categoryId).get()
              item.categoryName = (cat.data && cat.data[0] && cat.data[0].name) || ''
            }
          }
          // 获取该 order-item 对应 match 的 vs 信息
          if (item.matchId && !item.teamA) {
            const relatedMatch = matchesData.find(m => m._id === item.matchId)
            if (relatedMatch) {
              item.teamA = relatedMatch.teamA
              item.teamB = relatedMatch.teamB
              item.matchName = relatedMatch.name
            }
          }
          return item
        }))

        return {
          ...order,
          matchName: matchesData.length === 1 ? matchesData[0].name : (matchesData.map(m => m.name).join(' / ')),
          teamA: matchesData.length === 1 ? matchesData[0].teamA : '',
          teamB: matchesData.length === 1 ? matchesData[0].teamB : '',
          matches: matchesData,
          items: itemsWithCategory
        }
      }))

      return success({ list, total: total.total })
    }

    // ============ 下单 ============
    const body = isHttp ? (event.body ? JSON.parse(event.body) : {}) : event
    const { matchId, matchIds, playIds, betAmount, isParlay } = body

    // 统一处理 matchIds
    const allMatchIds = matchIds && matchIds.length ? matchIds : (matchId ? [matchId] : [])

    // 参数校验
    if (!allMatchIds.length || !playIds || !playIds.length || !betAmount) return fail('缺少必填参数')
    if (playIds.length === 0) return fail('请至少选择一个玩法')

    // 串关至少需要2个不同场次
    if (isParlay && allMatchIds.length < 2) return fail('串关至少需要选择2个不同场次')

    // 串关：场次不能重复
    if (isParlay) {
      const uniqueMatchIds = [...new Set(allMatchIds)]
      if (uniqueMatchIds.length !== allMatchIds.length) return fail('串关不能重复选择同一场次')
    }

    // 获取系统配置的下注限额
    const configs = await db.collection('system-config').get()
    const configMap = {}
    ;(configs.data || []).forEach(c => { configMap[c.key] = c.value })

    const minBet = parseFloat(configMap.minBet || '2.00')
    const maxBet = parseFloat(configMap.maxBet || '100000.00')

    if (betAmount < minBet) return fail('下注金额不能低于 ¥' + minBet.toFixed(2))
    if (betAmount > maxBet) return fail('下注金额不能超过 ¥' + maxBet.toFixed(2))

    // 验证所有玩法
    const plays = await db.collection('plays').where({ _id: db.command.in(playIds) }).get()
    if (!plays.data || plays.data.length !== playIds.length) return fail('存在无效的玩法')

    // 构建 playId -> play 的映射
    const playMap = {}
    plays.data.forEach(p => { playMap[p._id] = p })

    // 验证每个 play 对应的 matchId 与传入的 matchIds 一致
    for (const playId of playIds) {
      const play = playMap[playId]
      if (!play) return fail('玩法 ' + playId + ' 不存在')
      if (!allMatchIds.includes(play.matchId)) return fail('玩法与场次不匹配')
    }

    // 验证每场比赛的状态
    for (const mId of allMatchIds) {
      const match = await db.collection('matches').doc(mId).get()
      if (!match.data || match.data.length === 0) return fail('赛事 ' + mId + ' 不存在')
      if (match.data[0].status !== 'upcoming') return fail('赛事 ' + match.data[0].name + ' 已开始，不可下注')
      if (new Date(match.data[0].startTime) <= new Date()) return fail('赛事 ' + match.data[0].name + ' 已开始，不可下注')
    }

    // 计算总赔率
    let totalOdds = 1
    const orderItems = []

    for (const playId of playIds) {
      const play = playMap[playId]
      totalOdds *= play.odds
      orderItems.push({
        playId: play._id,
        matchId: play.matchId,  // 记录每个玩法所属的场次
        oddsSnapshot: play.odds,
        playName: play.name,
        categoryName: ''
      })
    }

    // 补充分类名称快照
    await Promise.all(orderItems.map(async item => {
      const play = playMap[item.playId]
      if (play && play.categoryId) {
        const cat = await db.collection('play-categories').doc(play.categoryId).get()
        item.categoryName = (cat.data && cat.data[0] && cat.data[0].name) || ''
      }
    }))

    totalOdds = Math.round(totalOdds * 100) / 100
    const winAmount = Math.round(betAmount * totalOdds * 100) / 100

    // 创建订单
    const orderNo = generateOrderNo()
    const orderData = {
      orderNo,
      userId: user._id,
      matchIds: allMatchIds,         // 支持多场次（串关）
      matchId: allMatchIds[0],       // 兼容旧字段：保留第一个matchId
      betAmount: Number(betAmount),
      totalOdds,
      winAmount: 0,
      status: 'pending',
      isParlay: !!isParlay,
      createTime: new Date()
    }

    const orderRes = await db.collection('orders').add(orderData)

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
      betAmount: Number(betAmount),
      matchIds: allMatchIds,
      isParlay: !!isParlay
    }, '下单成功')
  } catch (e) {
    console.error('user-order error:', e)
    return fail(e.message || '服务器错误')
  }
}
