'use strict'
// @url /admin/orders
const db = uniCloud.database()
const { ok, err, verifyToken } = require('./utils')

exports.main = async (event, context) => {
  const token = (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const method = event.httpMethod || 'GET'
  const body = event.body ? JSON.parse(event.body) : {}
  const query = event.queryStringParameters || {}
  const path = event.path || ''

  try {
    // ============ GET /orders/stats - 订单统计 ============
    if (method === 'GET' && path.includes('/stats')) {
      const { matchId, username } = query

      // 如果传了 username，查对应的用户 _id
      let resolvedUserId = null
      if (username) {
        const users = await db.collection('users').where({ username: new RegExp(username, 'i') }).get()
        if (users.data && users.data.length > 0) {
          resolvedUserId = users.data[0]._id
        }
      }

      // 某用户当天下单总额（用当天 UTC 零点，与 DB 中 createTime 的 UTC 存储对齐）
      let dailyUserTotal = 0
      if (resolvedUserId) {
        const now = new Date()
        const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
        const tomorrowStart = new Date(todayStart.getTime() + 86400000)

        const dailyOrders = await db.collection('orders')
          .where({
            userId: resolvedUserId,
            createTime: db.command.gte(todayStart).and(db.command.lt(tomorrowStart))
          })
          .get()
        dailyUserTotal = (dailyOrders.data || []).reduce((sum, o) => sum + o.betAmount, 0)
      }

      // 选中用户的某赛事中奖总额
      let userMatchWinTotal = 0
      if (resolvedUserId && matchId) {
        const winOrders = await db.collection('orders')
          .where({ userId: resolvedUserId, matchId, status: db.command.in(['won', 'settled']) })
          .get()
        userMatchWinTotal = (winOrders.data || []).reduce((sum, o) => sum + (o.winAmount || 0), 0)
      }

      // 总订单数（受筛选条件影响）
      const whereStats = {}
      if (matchId) whereStats.matchId = matchId
      if (resolvedUserId) whereStats.userId = resolvedUserId
      const totalOrders = await db.collection('orders').where(whereStats).count()

      return ok({
        dailyUserTotal,
        userMatchWinTotal,
        orderCount: totalOrders.total
      })
    }

    // ============ GET - 订单列表 ============
    if (method === 'GET') {
      const { matchId, username, status, page = 1, pageSize = 20 } = query
      const where = {}

      if (matchId) where.matchId = matchId
      if (status) where.status = status

      // 如果有用户名搜索，先查用户ID
      if (username) {
        const users = await db.collection('users').where({ username: new RegExp(username, 'i') }).get()
        const userIds = (users.data || []).map(u => u._id)
        if (userIds.length > 0) {
          where.userId = db.command.in(userIds)
        } else {
          return ok({ list: [], total: 0, page: Number(page) })
        }
      }

      const total = await db.collection('orders').where(where).count()
      const res = await db.collection('orders')
        .where(where)
        .orderBy('createTime', 'desc')
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize))
        .get()

      // 补充关联信息
      const list = await Promise.all((res.data || []).map(async order => {
        const items = await db.collection('order-items').where({ orderId: order._id }).get()
        const [user, match] = await Promise.all([
          db.collection('users').doc(order.userId).get(),
          db.collection('matches').doc(order.matchId).get()
        ])
        return {
          ...order,
          username: (user.data && user.data[0] && user.data[0].username) || '',
          matchName: (match.data && match.data[0] && match.data[0].name) || '',
          items: items.data || []
        }
      }))

      return ok({ list, total: total.total, page: Number(page), pageSize: Number(pageSize) })
    }

    return err('不支持的请求方法', 405)
  } catch (e) {
    console.error('admin-order error:', e)
    return err(e.message || '服务器错误')
  }
}
