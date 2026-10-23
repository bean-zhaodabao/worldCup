'use strict'
// 代理端：名下订单查询（只读）
// 口径：以订单下单时的 agentId 快照为准，用户后续转移代理不影响历史订单归属
const db = uniCloud.database()
const cmd = db.command
const $ = db.command.aggregate
const {
  ok, fail, verifyAgent, round2, getToken, fetchAll
} = require('./utils')

function timeWhere(startDate, endDate) {
  let createTime = null
  if (startDate) createTime = cmd.gte(new Date(startDate))
  if (endDate) {
    const end = new Date(endDate)
    // 只传日期时按“当天结束”处理
    if (String(endDate).length === 10) end.setDate(end.getDate() + 1)
    const lt = cmd.lt(end)
    createTime = createTime ? createTime.and(lt) : lt
  }
  return createTime ? { createTime } : {}
}

async function enrichOrders(orders) {
  if (!orders || orders.length === 0) return []
  const orderIds = orders.map(o => o._id)
  const items = await fetchAll(db.collection('order-items'), { orderId: cmd.in(orderIds) })
  const itemsByOrder = {}
  items.forEach(it => {
    if (!itemsByOrder[it.orderId]) itemsByOrder[it.orderId] = []
    itemsByOrder[it.orderId].push(it)
  })

  const matchIds = [...new Set(orders.flatMap(o => o.matchIds || (o.matchId ? [o.matchId] : [])))]
  const matches = matchIds.length
    ? await fetchAll(db.collection('matches'), { _id: cmd.in(matchIds) }, { _id: true, name: true, teamA: true, teamB: true })
    : []
  const matchMap = {}
  matches.forEach(m => { matchMap[m._id] = m })

  const userIds = [...new Set(orders.map(o => o.userId).filter(Boolean))]
  const users = userIds.length
    ? await fetchAll(db.collection('users'), { _id: cmd.in(userIds) }, { _id: true, username: true })
    : []
  const userMap = {}
  users.forEach(u => { userMap[u._id] = u.username })

  return orders.map(order => {
    const matchesData = (order.matchIds || (order.matchId ? [order.matchId] : []))
      .map(id => matchMap[id])
      .filter(Boolean)
      .map(m => ({ _id: m._id, name: m.name || '', teamA: m.teamA || '', teamB: m.teamB || '' }))

    const orderItems = (itemsByOrder[order._id] || []).map(item => {
      const m = matchMap[item.matchId]
      return Object.assign({}, item, {
        teamA: m ? m.teamA : (item.teamA || ''),
        teamB: m ? m.teamB : (item.teamB || ''),
        matchName: m ? m.name : (item.matchName || '')
      })
    })

    return Object.assign({}, order, {
      username: userMap[order.userId] || '',
      matchName: matchesData.length === 1 ? matchesData[0].name : matchesData.map(m => m.name).join(' / '),
      teamA: matchesData.length === 1 ? matchesData[0].teamA : '',
      teamB: matchesData.length === 1 ? matchesData[0].teamB : '',
      matches: matchesData,
      items: orderItems
    })
  })
}

exports.main = async (event, context) => {
  const agent = await verifyAgent(db, getToken(event))
  if (!agent) return fail('未登录或登录已过期', 401)

  try {
    const action = event.action || 'list'

    // ============ 订单列表 ============
    if (action === 'list') {
      const page = Math.max(1, Number(event.page || 1))
      const pageSize = Math.min(100, Math.max(1, Number(event.pageSize || 20)))
      const where = Object.assign(
        { agentId: agent._id, deleted: cmd.neq(true) },
        timeWhere(event.startDate, event.endDate)
      )
      if (event.userId) where.userId = event.userId
      if (event.status) where.status = event.status

      const totalRes = await db.collection('orders').where(where).count()
      const listRes = await db.collection('orders')
        .where(where)
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      const list = await enrichOrders(listRes.data || [])
      return ok({ list, total: totalRes.total || 0, page, pageSize })
    }

    // ============ 订单详情 ============
    if (action === 'detail') {
      const orderId = event.orderId
      if (!orderId) return fail('缺少订单ID')
      const orderRes = await db.collection('orders').doc(orderId).get()
      const order = (orderRes.data && orderRes.data[0]) || null
      if (!order || order.agentId !== agent._id) return fail('无权访问', 403)

      const enriched = await enrichOrders([order])
      return ok(enriched[0])
    }

    // ============ 订单统计 ============
    if (action === 'stats') {
      const match = Object.assign(
        { agentId: agent._id, deleted: cmd.neq(true) },
        timeWhere(event.startDate, event.endDate)
      )
      const statsRes = await db.collection('orders').aggregate()
        .match(match)
        .group({
          _id: null,
          totalBet: $.sum('$betAmount'),
          totalWin: $.sum('$winAmount'),
          orderCount: $.sum(1),
          userIds: $.addToSet('$userId')
        })
        .end()
      const row = (statsRes.data && statsRes.data[0]) || {}
      const totalBet = round2(row.totalBet || 0)
      const totalWin = round2(row.totalWin || 0)
      return ok({
        totalBet,
        totalWin,
        profit: round2(totalBet - totalWin),
        orderCount: row.orderCount || 0,
        betUsers: (row.userIds || []).length
      })
    }

    return fail('不支持的操作', 400)
  } catch (e) {
    console.error('agent-order error:', e)
    return fail(e.message || '服务器错误')
  }
}
