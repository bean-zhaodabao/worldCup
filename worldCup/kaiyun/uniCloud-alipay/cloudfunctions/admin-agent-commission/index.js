'use strict'
// @url /admin-agent-commission
// 代理佣金结算（管理员）
const db = uniCloud.database()
const cmd = db.command
const $ = db.command.aggregate
const { ok, err, verifyToken, writeLog } = require('./utils')

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100 }

async function getAgent(agentId) {
  const res = await db.collection('users').doc(agentId).get()
  return (res.data && res.data[0]) || null
}

async function writeWalletLog(entry) {
  await db.collection('agent-wallet-logs').add(Object.assign({ createTime: new Date() }, entry))
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
  // URL 化网关可能保留函数名前缀（/admin-agent-commission/xxx），也可能去掉（/xxx），两种都兼容
  const rawParts = path.split('/').filter(Boolean)
  const parts = rawParts.slice()
  while (parts[0] === 'admin-agent-commission') parts.shift()
  const action = parts[0] || ''
  const actionId = parts[1] || ''
  const actionSub = parts[2] || ''

  try {
    // ============ 佣金记录列表 ============
    if (method === 'GET' && !action) {
      const page = Math.max(1, Number(query.page || 1))
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)))
      const where = {}
      if (query.agentId) where.agentId = query.agentId
      if (query.status) where.status = query.status
      if (query.startDate || query.endDate) {
        let createTime = null
        if (query.startDate) createTime = cmd.gte(new Date(query.startDate))
        if (query.endDate) {
          const end = new Date(query.endDate)
          if (String(query.endDate).length === 10) end.setDate(end.getDate() + 1)
          const lt = cmd.lt(end)
          createTime = createTime ? createTime.and(lt) : lt
        }
        if (createTime) where.createTime = createTime
      }

      let totalRes, listRes, groupRes
      const summaryWhere = Object.assign({}, where)
      delete summaryWhere.status
      try {
        ;[totalRes, listRes, groupRes] = await Promise.all([
          db.collection('agent-commission-records').where(where).count(),
          db.collection('agent-commission-records')
            .where(where)
            .orderBy('createTime', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get(),
          (async () => {
            try {
              return await db.collection('agent-commission-records').aggregate()
                .match(summaryWhere)
                .group({ _id: '$status', amount: $.sum('$amount'), count: $.sum(1) })
                .end()
            } catch (e) {
              return { data: [] }
            }
          })()
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

    // ============ 确认佣金 pending -> available ============
    if (method === 'POST' && action === 'confirm') {
      let ids = Array.isArray(body.ids) ? body.ids : []
      if (ids.length === 0 && body.agentId) {
        const pendingRes = await db.collection('agent-commission-records')
          .where({ agentId: body.agentId, status: 'pending' })
          .limit(500)
          .get()
        ids = (pendingRes.data || []).map(r => r._id)
      }
      if (ids.length === 0) return err('没有待确认的佣金')

      const recordsRes = await db.collection('agent-commission-records')
        .where({ _id: cmd.in(ids), status: 'pending' })
        .get()
      const records = recordsRes.data || []
      if (records.length === 0) return err('没有待确认的佣金')

      const byAgent = {}
      records.forEach(r => {
        if (!byAgent[r.agentId]) byAgent[r.agentId] = { amount: 0, count: 0 }
        byAgent[r.agentId].amount = round2(byAgent[r.agentId].amount + (Number(r.amount) || 0))
        byAgent[r.agentId].count++
      })

      const actualIds = records.map(r => r._id)
      await db.collection('agent-commission-records')
        .where({ _id: cmd.in(actualIds) })
        .update({ status: 'available', confirmTime: new Date() })
      const orderIds = records.map(r => r.orderId).filter(Boolean)
      if (orderIds.length > 0) {
        await db.collection('orders').where({ _id: cmd.in(orderIds) }).update({ commissionStatus: 'available' })
      }

      for (const agentId of Object.keys(byAgent)) {
        const amount = byAgent[agentId].amount
        await db.collection('users').doc(agentId).update({ commissionBalance: cmd.inc(amount) })
        const agent = await getAgent(agentId)
        await writeWalletLog({
          agentId,
          type: 'commission',
          amount,
          balanceAfter: round2((agent && agent.commissionBalance) || 0),
          remark: '佣金确认入账 (' + byAgent[agentId].count + ' 条)',
          operatorId: admin._id,
          operatorName: admin.username
        })
      }

      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'confirm_agent_commission', targetType: 'agent-commission-records', targetId: actualIds.join(','),
        detail: '确认佣金 ' + actualIds.length + ' 条'
      })
      return ok({ count: actualIds.length, agents: Object.keys(byAgent).length }, '佣金已确认')
    }

    // ============ 重算 ============
    if (method === 'POST' && action === 'recalc') {
      const res = await uniCloud.callFunction({
        name: 'agent-commission-job',
        data: { token }
      })
      const result = (res && res.result) || {}
      if (result.code !== 0) return err(result.message || '重算失败')
      return ok(result.data, '重算完成')
    }

    // ============ 结算批次列表 ============
    if (method === 'GET' && action === 'settlements') {
      const page = Math.max(1, Number(query.page || 1))
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)))
      const where = {}
      if (query.agentId) where.agentId = query.agentId
      if (query.status) where.status = query.status

      let totalRes, listRes
      try {
        totalRes = await db.collection('agent-commission-settlements').where(where).count()
        listRes = await db.collection('agent-commission-settlements')
          .where(where)
          .orderBy('createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()
      } catch (e) {
        return ok({ list: [], total: 0, page, pageSize })
      }
      return ok({ list: listRes.data || [], total: totalRes.total || 0, page, pageSize })
    }

    // ============ 创建结算批次 ============
    if (method === 'POST' && action === 'settlements' && !actionId) {
      const agentId = body.agentId
      if (!agentId) return err('缺少代理ID')
      const agent = await getAgent(agentId)
      if (!agent || agent.role !== 'agent') return err('代理不存在')

      let ids = Array.isArray(body.recordIds) ? body.recordIds : []
      const where = { agentId, status: 'available' }
      if (ids.length > 0) where._id = cmd.in(ids)
      const recordsRes = await db.collection('agent-commission-records')
        .where(where)
        .limit(500)
        .get()
      // 已在其他结算批次中的记录不能重复建批次
      const records = (recordsRes.data || []).filter(r => !r.settlementId)
      if (records.length === 0) return err('没有可结算的佣金')

      const amount = round2(records.reduce((s, r) => s + (Number(r.amount) || 0), 0))
      const addRes = await db.collection('agent-commission-settlements').add({
        agentId,
        agentName: agent.username || '',
        recordIds: records.map(r => r._id),
        recordCount: records.length,
        amount,
        periodStart: body.periodStart ? new Date(body.periodStart) : null,
        periodEnd: body.periodEnd ? new Date(body.periodEnd) : null,
        status: 'pending',
        createTime: new Date(),
        operatorId: admin._id,
        operatorName: admin.username,
        remark: body.remark || ''
      })

      await db.collection('agent-commission-records')
        .where({ _id: cmd.in(records.map(r => r._id)) })
        .update({ settlementId: addRes.id })

      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'create_commission_settlement', targetType: 'agent-commission-settlements', targetId: addRes.id,
        detail: '创建结算批次: ' + agent.username + ' ' + records.length + ' 条 ¥' + amount.toFixed(2)
      })
      return ok({ _id: addRes.id, amount, count: records.length }, '结算批次已创建')
    }

    // ============ 标记已支付 ============
    if ((method === 'PATCH' || method === 'POST') && action === 'settlements' && actionId && actionSub === 'paid') {
      const bRes = await db.collection('agent-commission-settlements').doc(actionId).get()
      const batch = (bRes.data && bRes.data[0]) || null
      if (!batch) return err('结算批次不存在')
      if (batch.status !== 'pending') return err('该批次已处理')

      const recordsRes = await db.collection('agent-commission-records')
        .where({ settlementId: actionId, status: 'available' })
        .get()
      const records = recordsRes.data || []
      const amount = round2(records.reduce((s, r) => s + (Number(r.amount) || 0), 0))

      await db.collection('agent-commission-settlements').doc(actionId).update({
        status: 'paid',
        paidTime: new Date(),
        amount,
        remark: body.remark !== undefined ? String(body.remark) : batch.remark,
        payVoucher: body.payVoucher || batch.payVoucher || ''
      })
      if (records.length > 0) {
        await db.collection('agent-commission-records')
          .where({ _id: cmd.in(records.map(r => r._id)) })
          .update({ status: 'paid', payTime: new Date() })
        await db.collection('orders')
          .where({ _id: cmd.in(records.map(r => r.orderId).filter(Boolean)) })
          .update({ commissionStatus: 'paid' })
      }

      const agent = await getAgent(batch.agentId)
      await db.collection('users').doc(batch.agentId).update({
        commissionBalance: cmd.inc(-amount),
        paidCommission: cmd.inc(amount)
      })
      await writeWalletLog({
        agentId: batch.agentId,
        type: 'paid',
        amount: -amount,
        balanceAfter: round2(((agent && agent.commissionBalance) || 0) - amount),
        settlementId: actionId,
        remark: '佣金线下支付',
        operatorId: admin._id,
        operatorName: admin.username
      })

      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'pay_commission_settlement', targetType: 'agent-commission-settlements', targetId: actionId,
        detail: '佣金批次已支付: ' + batch.agentName + ' ¥' + amount.toFixed(2)
      })
      return ok({ amount, count: records.length }, '已标记支付')
    }

    return err('不支持的请求方法', 405)
  } catch (e) {
    console.error('admin-agent-commission error:', e)
    return err(e.message || '服务器错误')
  }
}
