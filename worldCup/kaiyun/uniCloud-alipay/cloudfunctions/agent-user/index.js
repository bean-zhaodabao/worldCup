'use strict'
// 代理端：名下用户查询（只读）
const db = uniCloud.database()
const cmd = db.command
const $ = db.command.aggregate
const { ok, fail, verifyAgent, round2, cnTodayStart, getToken } = require('./utils')

function safeUser(u) {
  return {
    _id: u._id,
    username: u.username,
    type: u.type || 'retail',
    status: u.status || 'active',
    balance: round2(u.balance || 0),
    frozenBalance: round2(u.frozenBalance || 0),
    createTime: u.createTime || null,
    bindTime: u.bindTime || null
  }
}

async function getStats(userIds, agentId, createTimeWhere) {
  if (!userIds || userIds.length === 0) return {}
  const match = { userId: cmd.in(userIds), agentId, deleted: cmd.neq(true) }
  if (createTimeWhere) Object.assign(match, createTimeWhere)
  const res = await db.collection('orders').aggregate()
    .match(match)
    .group({
      _id: '$userId',
      totalBet: $.sum('$betAmount'),
      totalWin: $.sum('$winAmount'),
      orderCount: $.sum(1),
      lastBetTime: $.max('$createTime')
    })
    .end()
  const map = {}
  ;(res.data || []).forEach(item => {
    map[item._id] = {
      totalBet: round2(item.totalBet || 0),
      totalWin: round2(item.totalWin || 0),
      orderCount: item.orderCount || 0,
      lastBetTime: item.lastBetTime || null
    }
  })
  return map
}

exports.main = async (event, context) => {
  const agent = await verifyAgent(db, getToken(event))
  if (!agent) return fail('未登录或登录已过期', 401)

  try {
    const action = event.action || 'list'

    // ============ 用户列表 ============
    if (action === 'list') {
      const page = Math.max(1, Number(event.page || 1))
      const pageSize = Math.min(100, Math.max(1, Number(event.pageSize || 20)))
      const where = { agentId: agent._id, role: 'user' }
      if (event.status) where.status = event.status
      if (event.keyword) where.username = new RegExp(String(event.keyword).trim(), 'i')

      const totalRes = await db.collection('users').where(where).count()
      const listRes = await db.collection('users')
        .where(where)
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      const users = listRes.data || []
      const userIds = users.map(u => u._id)
      const [statsMap, todayMap] = await Promise.all([
        getStats(userIds, agent._id),
        getStats(userIds, agent._id, { createTime: cmd.gte(cnTodayStart()) })
      ])

      const list = users.map(u => {
        const s = statsMap[u._id] || {}
        return Object.assign(safeUser(u), {
          totalBet: s.totalBet || 0,
          totalWin: s.totalWin || 0,
          orderCount: s.orderCount || 0,
          lastBetTime: s.lastBetTime || null,
          todayBet: (todayMap[u._id] && todayMap[u._id].totalBet) || 0
        })
      })

      return ok({ list, total: totalRes.total || 0, page, pageSize })
    }

    // ============ 用户详情 ============
    if (action === 'detail') {
      const userId = event.userId
      if (!userId) return fail('缺少用户ID')
      const uRes = await db.collection('users').doc(userId).get()
      const u = (uRes.data && uRes.data[0]) || null
      if (!u || u.role !== 'user' || u.agentId !== agent._id) return fail('无权访问', 403)

      const todayStart = cnTodayStart()
      const [statsMap, todayMap] = await Promise.all([
        getStats([userId], agent._id),
        getStats([userId], agent._id, { createTime: cmd.gte(todayStart) })
      ])
      const s = statsMap[userId] || {}
      const t = todayMap[userId] || {}

      return ok({
        user: safeUser(u),
        stats: {
          totalBet: s.totalBet || 0,
          totalWin: s.totalWin || 0,
          profit: round2((s.totalBet || 0) - (s.totalWin || 0)),
          orderCount: s.orderCount || 0,
          lastBetTime: s.lastBetTime || null,
          todayBet: t.totalBet || 0
        }
      })
    }

    return fail('不支持的操作', 400)
  } catch (e) {
    console.error('agent-user error:', e)
    return fail(e.message || '服务器错误')
  }
}
