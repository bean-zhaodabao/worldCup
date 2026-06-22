'use strict'
// @url /admin/report
const db = uniCloud.database()
const { ok, err, verifyToken } = require('./utils')

exports.main = async (event, context) => {
  const token = (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const query = event.queryStringParameters || {}
  const path = event.path || ''

  try {
    // ============ 仪表盘概览 ============
    if (path.includes('/dashboard')) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const [todayOrders, liveMatches, allOrders, settledOrders] = await Promise.all([
        db.collection('orders').where({ createTime: db.command.gte(today).and(db.command.lt(tomorrow)) }).get(),
        db.collection('matches').where({ status: 'live' }).count(),
        db.collection('orders').get(),
        db.collection('orders').where({ status: 'settled' }).get()
      ])

      const todayTotal = (todayOrders.data || []).reduce((sum, o) => sum + o.betAmount, 0)
      const todayCount = (todayOrders.data || []).length
      const todayWin = (todayOrders.data || []).filter(o => o.status === 'won').reduce((sum, o) => sum + (o.winAmount || 0), 0)

      return ok({
        todayTotal,
        todayCount,
        todayWin,
        todayProfit: todayTotal - todayWin,
        liveMatches: liveMatches.total,
        totalOrders: (allOrders.data || []).length
      })
    }

    // ============ 每日流水 ============
    if (path.includes('/daily')) {
      const { startDate, endDate } = query
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      start.setHours(0, 0, 0, 0)
      const end = endDate ? new Date(endDate) : new Date()
      end.setHours(23, 59, 59, 999)

      const orders = await db.collection('orders')
        .where({ createTime: db.command.gte(start).and(db.command.lte(end)) })
        .orderBy('createTime', 'asc')
        .get()

      // 按日分组
      const dailyMap = {}
      ;(orders.data || []).forEach(o => {
        const day = new Date(o.createTime).toISOString().split('T')[0]
        if (!dailyMap[day]) dailyMap[day] = { date: day, totalBet: 0, orderCount: 0, winAmount: 0 }
        dailyMap[day].totalBet += o.betAmount
        dailyMap[day].orderCount++
        if (o.status === 'won' || o.status === 'settled') {
          dailyMap[day].winAmount += (o.winAmount || 0)
        }
      })

      return ok({
        daily: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))
      })
    }

    // ============ 按赛事统计 ============
    if (path.includes('/match')) {
      const matches = await db.collection('matches').get()
      const allOrders = await db.collection('orders').get()
      const stats = await Promise.all((matches.data || []).map(async match => {
        // 兼容 matchId 和 matchIds
        const orders = (allOrders.data || []).filter(o =>
          o.matchId === match._id || (o.matchIds && o.matchIds.includes(match._id))
        )
        const totalBet = orders.reduce((s, o) => s + o.betAmount, 0)
        const totalWin = orders.filter(o => o.status === 'won' || o.status === 'settled').reduce((s, o) => s + (o.winAmount || 0), 0)
        return {
          matchId: match._id,
          matchName: match.name,
          teamA: match.teamA,
          teamB: match.teamB,
          status: match.status,
          totalBet,
          totalWin,
          profit: totalBet - totalWin,
          orderCount: orders.length
        }
      }))
      return ok({ matchStats: stats })
    }

    // ============ 按玩法统计 ============
    if (path.includes('/play')) {
      const plays = await db.collection('plays').get()
      const playMap = {}
      for (const play of (plays.data || [])) {
        const items = await db.collection('order-items').where({ playId: play._id }).get()
        const orderIds = [...new Set((items.data || []).map(i => i.orderId))]
        const orders = orderIds.length > 0 ? await db.collection('orders').where({ _id: db.command.in(orderIds) }).get() : { data: [] }
        const totalBet = (orders.data || []).reduce((s, o) => s + o.betAmount, 0)
        const totalWin = (orders.data || []).filter(o => o.status === 'won' || o.status === 'settled').reduce((s, o) => s + (o.winAmount || 0), 0)
        playMap[play._id] = {
          playId: play._id,
          playName: play.name,
          totalBet,
          totalWin,
          profit: totalBet - totalWin,
          betCount: orderIds.length
        }
      }
      return ok({ playStats: Object.values(playMap) })
    }

    // ============ 盈亏报表 ============
    if (path.includes('/profit')) {
      const orders = await db.collection('orders').get()
      const totalBet = (orders.data || []).reduce((s, o) => s + o.betAmount, 0)
      const totalWin = (orders.data || []).filter(o => o.status === 'won' || o.status === 'settled').reduce((s, o) => s + (o.winAmount || 0), 0)
      const totalLost = (orders.data || []).filter(o => o.status === 'lost' || o.status === 'settled' && !o.winAmount).reduce((s, o) => s + o.betAmount, 0)

      return ok({
        totalBet,
        totalWin,
        totalLost,
        grossProfit: totalBet - totalWin,
        netProfit: totalBet - totalWin,
        orderCount: (orders.data || []).length,
        wonCount: (orders.data || []).filter(o => o.status === 'won').length,
        lostCount: (orders.data || []).filter(o => o.status === 'lost').length
      })
    }

    return err('请指定报表类型: /dashboard /daily /match /play /profit', 400)
  } catch (e) {
    console.error('admin-report error:', e)
    return err(e.message || '服务器错误')
  }
}
