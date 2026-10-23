'use strict'
// 代理工作台概览（只读）
const db = uniCloud.database()
const cmd = db.command
const $ = db.command.aggregate
const {
  DAY_MS, ok, fail, verifyAgent, round2,
  cnTodayStart, cnDateKey, fetchAll, getToken
} = require('./utils')

function sum(list, key) {
  return round2((list || []).reduce((s, item) => s + (Number(item[key]) || 0), 0))
}

exports.main = async (event, context) => {
  const agent = await verifyAgent(db, getToken(event))
  if (!agent) return fail('未登录或登录已过期', 401)

  try {
    const todayStart = cnTodayStart()
    const tomorrowStart = new Date(todayStart.getTime() + DAY_MS)
    const weekStart = new Date(todayStart.getTime() - 6 * DAY_MS)

    const [userTotalRes, todayNewRes, weekUsers, weekOrders, commissionRes, agentRes] = await Promise.all([
      db.collection('users').where({ agentId: agent._id, role: 'user' }).count(),
      db.collection('users').where({
        agentId: agent._id,
        role: 'user',
        bindTime: cmd.gte(todayStart).and(cmd.lt(tomorrowStart))
      }).count(),
      fetchAll(
        db.collection('users'),
        { agentId: agent._id, role: 'user', bindTime: cmd.gte(weekStart) },
        { bindTime: true, createTime: true }
      ),
      fetchAll(
        db.collection('orders'),
        { agentId: agent._id, deleted: cmd.neq(true), createTime: cmd.gte(weekStart) },
        { createTime: true, betAmount: true, winAmount: true, userId: true, status: true }
      ),
      (async () => {
        try {
          return await db.collection('agent-commission-records').aggregate()
            .match({ agentId: agent._id })
            .group({ _id: '$status', amount: $.sum('$amount'), count: $.sum(1) })
            .end()
        } catch (e) {
          return { data: [] }
        }
      })(),
      db.collection('users').doc(agent._id).get()
    ])

    const todayOrders = weekOrders.filter(o => {
      const t = new Date(o.createTime).getTime()
      return t >= todayStart.getTime() && t < tomorrowStart.getTime()
    })
    const todayBetAmount = sum(todayOrders, 'betAmount')
    const todayWinAmount = sum(todayOrders, 'winAmount')
    const todayBetUsers = new Set(todayOrders.map(o => o.userId).filter(Boolean)).size
    const activeUsers7d = new Set(weekOrders.map(o => o.userId).filter(Boolean)).size

    // 近 7 天趋势
    const trendMap = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart.getTime() - i * DAY_MS)
      trendMap[cnDateKey(d)] = { date: cnDateKey(d), betAmount: 0, orderCount: 0, newUsers: 0 }
    }
    weekOrders.forEach(o => {
      const key = cnDateKey(o.createTime)
      if (trendMap[key]) {
        trendMap[key].betAmount = round2(trendMap[key].betAmount + (Number(o.betAmount) || 0))
        trendMap[key].orderCount++
      }
    })
    weekUsers.forEach(u => {
      const key = cnDateKey(u.bindTime || u.createTime)
      if (trendMap[key]) trendMap[key].newUsers++
    })

    const commission = { pending: 0, available: 0, paid: 0, void: 0 }
    ;(commissionRes.data || []).forEach(item => {
      if (commission[item._id] !== undefined) commission[item._id] = round2(item.amount)
    })

    const agentDoc = (agentRes.data && agentRes.data[0]) || {}
    const trend = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date))

    return ok({
      userTotal: userTotalRes.total || 0,
      todayNewUsers: todayNewRes.total || 0,
      activeUsers7d,
      todayBetAmount,
      todayBetUsers,
      todayOrderCount: todayOrders.length,
      todayWinAmount,
      todayProfit: round2(todayBetAmount - todayWinAmount),
      pendingCommission: commission.pending,
      availableCommission: commission.available,
      paidCommission: round2(agentDoc.paidCommission || commission.paid),
      totalCommission: round2(agentDoc.totalCommission || 0),
      commissionBalance: round2(agentDoc.commissionBalance || 0),
      trend
    })
  } catch (e) {
    console.error('agent-dashboard error:', e)
    return fail(e.message || '服务器错误')
  }
}
