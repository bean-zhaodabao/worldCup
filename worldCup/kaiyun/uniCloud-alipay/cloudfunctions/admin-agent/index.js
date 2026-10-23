'use strict'
// @url /admin-agent
// 代理商管理（管理员）
const db = uniCloud.database()
const cmd = db.command
const $ = db.command.aggregate
const { ok, err, verifyToken, writeLog } = require('./utils')

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100 }

function safeAgent(a) {
  return {
    _id: a._id,
    username: a.username,
    agentCode: a.agentCode || '',
    commissionRate: Number(a.commissionRate || 0),
    commissionBalance: round2(a.commissionBalance || 0),
    paidCommission: round2(a.paidCommission || 0),
    totalCommission: round2(a.totalCommission || 0),
    status: a.status || 'active',
    remark: a.remark || '',
    createTime: a.createTime || null
  }
}

function safeUser(u) {
  return {
    _id: u._id,
    username: u.username,
    type: u.type || 'retail',
    status: u.status || 'active',
    balance: round2(u.balance || 0),
    frozenBalance: round2(u.frozenBalance || 0),
    agentId: u.agentId || null,
    agentCodeSnapshot: u.agentCodeSnapshot || '',
    bindTime: u.bindTime || null,
    createTime: u.createTime || null
  }
}

async function genAgentCode() {
  for (let i = 0; i < 30; i++) {
    const code = 'AG' + String(Math.floor(Math.random() * 9000) + 1000)
    const exist = await db.collection('users').where({ agentCode: code }).count()
    if (!exist.total) return code
  }
  return 'AG' + String(Date.now()).slice(-8)
}

async function agentStats(agentIds) {
  if (!agentIds || agentIds.length === 0) return {}
  const [userRes, orderRes, commissionRes] = await Promise.all([
    db.collection('users').aggregate()
      .match({ agentId: cmd.in(agentIds), role: 'user' })
      .group({ _id: '$agentId', count: $.sum(1) })
      .end(),
    db.collection('orders').aggregate()
      .match({ agentId: cmd.in(agentIds), deleted: cmd.neq(true) })
      .group({
        _id: '$agentId',
        totalBet: $.sum('$betAmount'),
        totalWin: $.sum('$winAmount'),
        orderCount: $.sum(1)
      })
      .end(),
    (async () => {
      try {
        return await db.collection('agent-commission-records').aggregate()
          .match({ agentId: cmd.in(agentIds), status: cmd.in(['pending', 'available', 'paid']) })
          .group({ _id: '$agentId', total: $.sum('$amount') })
          .end()
      } catch (e) {
        return { data: [] }
      }
    })()
  ])

  const map = {}
  agentIds.forEach(id => {
    map[id] = { userCount: 0, totalBet: 0, totalWin: 0, profit: 0, orderCount: 0, commissionTotal: 0 }
  })
  ;(userRes.data || []).forEach(item => {
    if (map[item._id]) map[item._id].userCount = item.count || 0
  })
  ;(orderRes.data || []).forEach(item => {
    if (!map[item._id]) return
    map[item._id].totalBet = round2(item.totalBet || 0)
    map[item._id].totalWin = round2(item.totalWin || 0)
    map[item._id].profit = round2((item.totalBet || 0) - (item.totalWin || 0))
    map[item._id].orderCount = item.orderCount || 0
  })
  ;(commissionRes.data || []).forEach(item => {
    if (map[item._id]) map[item._id].commissionTotal = round2(item.total || 0)
  })
  return map
}

async function userStats(userIds, agentId) {
  if (!userIds || userIds.length === 0) return {}
  const res = await db.collection('orders').aggregate()
    .match({ userId: cmd.in(userIds), agentId, deleted: cmd.neq(true) })
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

async function enrichOrders(orders) {
  if (!orders || orders.length === 0) return []
  const orderIds = orders.map(o => o._id)
  const itemsRes = await db.collection('order-items').where({ orderId: cmd.in(orderIds) }).limit(1000).get()
  const itemsByOrder = {}
  ;(itemsRes.data || []).forEach(item => {
    if (!itemsByOrder[item.orderId]) itemsByOrder[item.orderId] = []
    itemsByOrder[item.orderId].push(item)
  })

  const matchIds = [...new Set(orders.flatMap(o => o.matchIds || (o.matchId ? [o.matchId] : [])))]
  const matchesRes = matchIds.length
    ? await db.collection('matches').where({ _id: cmd.in(matchIds) }).get()
    : { data: [] }
  const matchMap = {}
  ;(matchesRes.data || []).forEach(m => { matchMap[m._id] = m })

  const userIds = [...new Set(orders.map(o => o.userId).filter(Boolean))]
  const usersRes = userIds.length
    ? await db.collection('users').where({ _id: cmd.in(userIds) }).get()
    : { data: [] }
  const userMap = {}
  ;(usersRes.data || []).forEach(u => { userMap[u._id] = u.username })

  return orders.map(order => {
    const matches = (order.matchIds || (order.matchId ? [order.matchId] : []))
      .map(id => matchMap[id]).filter(Boolean)
    const items = (itemsByOrder[order._id] || []).map(item => {
      const m = matchMap[item.matchId]
      return Object.assign({}, item, {
        teamA: m ? m.teamA : (item.teamA || ''),
        teamB: m ? m.teamB : (item.teamB || ''),
        matchName: m ? m.name : (item.matchName || '')
      })
    })
    return Object.assign({}, order, {
      username: userMap[order.userId] || '',
      matchName: matches.length === 1 ? matches[0].name : matches.map(m => m.name).join(' / '),
      matches: matches.map(m => ({ _id: m._id, name: m.name || '', teamA: m.teamA || '', teamB: m.teamB || '' })),
      items
    })
  })
}

exports.main = async (event, context) => {
  const headers = event.headers || {}
  const token = (headers.authorization || headers.Authorization || '').replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const method = (event.httpMethod || 'GET').toUpperCase()
  const body = event.body
    ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body)
    : {}
  const query = event.queryStringParameters || {}
  const path = event.path || ''
  // URL 化网关可能保留函数名前缀（/admin-agent/xxx），也可能去掉（/xxx），两种都兼容
  const rawParts = path.split('/').filter(Boolean)
  const parts = rawParts.slice()
  while (parts[0] === 'admin-agent') parts.shift()
  const agentId = parts[0] && ['rebind-user', 'report'].indexOf(parts[0]) === -1 ? parts[0] : ''
  const sub = parts[1] || ''

  try {
    // ============ 代理列表 ============
    if (method === 'GET' && !agentId) {
      const page = Math.max(1, Number(query.page || 1))
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)))
      const where = { role: 'agent' }
      if (query.status) where.status = query.status
      if (query.keyword) {
        where.$or = [
          { username: new RegExp(String(query.keyword).trim(), 'i') },
          { agentCode: new RegExp(String(query.keyword).trim(), 'i') }
        ]
      }

      const totalRes = await db.collection('users').where(where).count()
      const listRes = await db.collection('users')
        .where(where)
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()
      const agents = listRes.data || []
      const statsMap = await agentStats(agents.map(a => a._id))
      const list = agents.map(a => Object.assign(safeAgent(a), statsMap[a._id] || {}))

      return ok({ list, total: totalRes.total || 0, page, pageSize })
    }

    // ============ 代理详情 ============
    if (method === 'GET' && agentId && !sub) {
      const aRes = await db.collection('users').doc(agentId).get()
      const agent = (aRes.data && aRes.data[0]) || null
      if (!agent || agent.role !== 'agent') return err('代理不存在')
      const statsMap = await agentStats([agentId])
      return ok({ agent: safeAgent(agent), stats: statsMap[agentId] || {} })
    }

    // ============ 名下用户 ============
    if (method === 'GET' && agentId && sub === 'users') {
      const page = Math.max(1, Number(query.page || 1))
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)))
      const where = { agentId, role: 'user' }
      if (query.status) where.status = query.status
      if (query.keyword) where.username = new RegExp(String(query.keyword).trim(), 'i')

      const totalRes = await db.collection('users').where(where).count()
      const listRes = await db.collection('users')
        .where(where)
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()
      const users = listRes.data || []
      const statsMap = await userStats(users.map(u => u._id), agentId)
      const list = users.map(u => Object.assign(safeUser(u), statsMap[u._id] || {}))
      return ok({ list, total: totalRes.total || 0, page, pageSize })
    }

    // ============ 名下订单 ============
    if (method === 'GET' && agentId && sub === 'orders') {
      const page = Math.max(1, Number(query.page || 1))
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)))
      const where = { agentId, deleted: cmd.neq(true) }
      if (query.status) where.status = query.status
      if (query.userId) where.userId = query.userId

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

    // ============ 佣金明细 ============
    if (method === 'GET' && agentId && sub === 'commission') {
      const page = Math.max(1, Number(query.page || 1))
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)))
      const where = { agentId }
      if (query.status) where.status = query.status

      let totalRes, listRes, groupRes
      try {
        ;[totalRes, listRes, groupRes] = await Promise.all([
          db.collection('agent-commission-records').where(where).count(),
          db.collection('agent-commission-records')
            .where(where)
            .orderBy('createTime', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get(),
          db.collection('agent-commission-records').aggregate()
            .match({ agentId })
            .group({ _id: '$status', amount: $.sum('$amount'), count: $.sum(1) })
            .end()
        ])
      } catch (e) {
        return ok({ list: [], total: 0, summary: { pending: 0, available: 0, paid: 0, void: 0 }, page, pageSize })
      }
      const summary = { pending: 0, available: 0, paid: 0, void: 0 }
      ;(groupRes.data || []).forEach(item => {
        if (summary[item._id] !== undefined) summary[item._id] = round2(item.amount)
      })
      return ok({ list: listRes.data || [], total: totalRes.total || 0, summary, page, pageSize })
    }

    // ============ 创建代理 ============
    if (method === 'POST' && !parts[0]) {
      const { username, password, commissionRate, remark } = body
      if (!username || String(username).length < 3) return err('用户名至少3个字符')
      if (!password || String(password).length < 6) return err('密码至少6个字符')
      const rate = Number(commissionRate)
      if (isNaN(rate) || rate < 0 || rate > 100) return err('佣金比例需在 0~100 之间')

      const exist = await db.collection('users').where({ username }).count()
      if (exist.total > 0) return err('用户名已存在')

      const agentCode = await genAgentCode()
      const addRes = await db.collection('users').add({
        username,
        password,
        role: 'agent',
        type: 'retail',
        agentCode,
        commissionRate: rate,
        commissionBalance: 0,
        paidCommission: 0,
        totalCommission: 0,
        balance: 0,
        frozenBalance: 0,
        status: 'active',
        remark: remark || '',
        createTime: new Date()
      })

      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'create_agent', targetType: 'users', targetId: addRes.id,
        detail: '创建代理: ' + username + ' (' + agentCode + ', 佣金 ' + rate + '%)'
      })
      return ok({ _id: addRes.id, agentCode }, '代理创建成功')
    }

    // ============ 转移用户归属 ============
    if (method === 'POST' && parts[0] === 'rebind-user') {
      const { userId, agentId: newAgentId } = body
      if (!userId) return err('缺少用户ID')
      const uRes = await db.collection('users').doc(userId).get()
      const user = (uRes.data && uRes.data[0]) || null
      if (!user || user.role !== 'user') return err('用户不存在')

      let agentCodeSnapshot = ''
      if (newAgentId) {
        const aRes = await db.collection('users').doc(newAgentId).get()
        const agent = (aRes.data && aRes.data[0]) || null
        if (!agent || agent.role !== 'agent') return err('代理不存在')
        if (agent.status !== 'active') return err('代理已停用')
        agentCodeSnapshot = agent.agentCode || ''
      }

      await db.collection('users').doc(userId).update({
        agentId: newAgentId || null,
        agentCodeSnapshot,
        bindTime: new Date()
      })
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'rebind_user_agent', targetType: 'users', targetId: userId,
        detail: '用户 ' + user.username + ' 转移代理: ' + (user.agentId || '无') + ' -> ' + (newAgentId || '无'),
        beforeData: { agentId: user.agentId || null },
        afterData: { agentId: newAgentId || null }
      })
      return ok(null, '用户归属已更新')
    }

    // ============ 修改代理 ============
    if ((method === 'PATCH' || method === 'PUT' || method === 'POST') && agentId && !sub) {
      const aRes = await db.collection('users').doc(agentId).get()
      const agent = (aRes.data && aRes.data[0]) || null
      if (!agent || agent.role !== 'agent') return err('代理不存在')

      const update = {}
      if (body.commissionRate !== undefined) {
        const rate = Number(body.commissionRate)
        if (isNaN(rate) || rate < 0 || rate > 100) return err('佣金比例需在 0~100 之间')
        update.commissionRate = rate
      }
      if (body.status !== undefined) {
        if (['active', 'disabled'].indexOf(body.status) === -1) return err('状态值无效')
        update.status = body.status
      }
      if (body.remark !== undefined) update.remark = String(body.remark)
      if (Object.keys(update).length === 0) return err('没有需要更新的字段')

      await db.collection('users').doc(agentId).update(update)
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'update_agent', targetType: 'users', targetId: agentId,
        detail: '修改代理: ' + agent.username + ' ' + JSON.stringify(update),
        afterData: update
      })
      return ok(null, '代理已更新')
    }

    // ============ 重置代理密码 ============
    if ((method === 'PATCH' || method === 'POST') && agentId && sub === 'password') {
      const { password } = body
      if (!password || String(password).length < 6) return err('密码至少6个字符')
      const aRes = await db.collection('users').doc(agentId).get()
      const agent = (aRes.data && aRes.data[0]) || null
      if (!agent || agent.role !== 'agent') return err('代理不存在')
      await db.collection('users').doc(agentId).update({ password })
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'reset_agent_password', targetType: 'users', targetId: agentId,
        detail: '重置代理密码: ' + agent.username
      })
      return ok(null, '密码已重置')
    }

    return err('不支持的请求方法', 405)
  } catch (e) {
    console.error('admin-agent error:', e)
    return err(e.message || '服务器错误')
  }
}
