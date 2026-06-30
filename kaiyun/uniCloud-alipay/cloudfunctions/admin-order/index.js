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

      let resolvedUserId = null
      if (username) {
        const users = await db.collection('users').where({ username: new RegExp(username, 'i') }).get()
        if (users.data && users.data.length > 0) {
          resolvedUserId = users.data[0]._id
        }
      }

      let dailyUserTotal = 0
      if (resolvedUserId) {
        const now = new Date()
        const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
        const tomorrowStart = new Date(todayStart.getTime() + 86400000)

        const dailyOrders = await db.collection('orders')
          .where({
            userId: resolvedUserId,
            deleted: db.command.neq(true),
            createTime: db.command.gte(todayStart).and(db.command.lt(tomorrowStart))
          })
          .get()
        dailyUserTotal = (dailyOrders.data || []).reduce((sum, o) => sum + o.betAmount, 0)
      }

      // 选中用户的某赛事中奖总额（兼容 matchId 和 matchIds）
      let userMatchWinTotal = 0
      if (resolvedUserId && matchId) {
        const allWinOrders = await db.collection('orders')
          .where({
            userId: resolvedUserId,
            status: db.command.in(['won', 'settled']),
            deleted: db.command.neq(true)
          })
          .get()
        userMatchWinTotal = (allWinOrders.data || [])
          .filter(o => (o.matchIds && o.matchIds.includes(matchId)) || o.matchId === matchId)
          .reduce((sum, o) => sum + (o.winAmount || 0), 0)
      }

      // 总订单数
      const whereStats = { deleted: db.command.neq(true) }
      if (resolvedUserId) whereStats.userId = resolvedUserId
      if (matchId) {
        whereStats.$or = [{ matchId: matchId }, { matchIds: db.command.in([matchId]) }]
      }
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
      const where = { deleted: db.command.neq(true) }

      if (status) where.status = status
      // 兼容 matchId 和 matchIds 字段
      if (matchId) {
        where.$or = [{ matchId: matchId }, { matchIds: db.command.in([matchId]) }]
      }

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

        // 获取关联的所有赛事（兼容 matchId 和 matchIds）
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

        const user = await db.collection('users').doc(order.userId).get()

        return {
          ...order,
          username: (user.data && user.data[0] && user.data[0].username) || '',
          matchName: matchesData.length === 1 ? matchesData[0].name : (matchesData.map(m => m.name).join(' / ')),
          matches: matchesData,
          items: items.data || []
        }
      }))

      return ok({ list, total: total.total, page: Number(page), pageSize: Number(pageSize) })
    }

    // ============ PATCH /orders/batch-delete - 批量逻辑删除 ============
    if (method === 'PATCH' && path.includes('/batch-delete')) {
      const { ids } = body
      if (!ids || !Array.isArray(ids) || ids.length === 0) return err('ids 参数错误')
      await db.collection('orders').where({ _id: db.command.in(ids) }).update({ deleted: true })
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'batch_delete_orders', targetType: 'orders', targetId: ids.join(','),
        detail: '批量删除 ' + ids.length + ' 条订单'
      })
      return ok(null, '已删除 ' + ids.length + ' 条订单')
    }

    // ============ PATCH /orders/:id/delete - 单条逻辑删除 ============
    if (method === 'PATCH' && path.includes('/delete')) {
      const pathParts = path.split('/')
      const id = pathParts[pathParts.length - 2]
      if (!id) return err('缺少订单ID')
      await db.collection('orders').doc(id).update({ deleted: true })
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'delete_order', targetType: 'orders', targetId: id,
        detail: '删除订单: ' + id
      })
      return ok(null, '订单已删除')
    }

    return err('不支持的请求方法', 405)
  } catch (e) {
    console.error('admin-order error:', e)
    return err(e.message || '服务器错误')
  }
}
