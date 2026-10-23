'use strict'
// 代理端：佣金查询（只读）
const db = uniCloud.database()
const cmd = db.command
const $ = db.command.aggregate
const { ok, fail, verifyAgent, round2, getToken } = require('./utils')

exports.main = async (event, context) => {
  const agent = await verifyAgent(db, getToken(event))
  if (!agent) return fail('未登录或登录已过期', 401)

  try {
    const action = event.action || 'summary'

    // ============ 佣金汇总 ============
    if (action === 'summary') {
      const [groupRes, agentRes] = await Promise.all([
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

      const summary = { pending: 0, available: 0, paid: 0, void: 0 }
      const counts = { pending: 0, available: 0, paid: 0, void: 0 }
      ;(groupRes.data || []).forEach(item => {
        if (summary[item._id] !== undefined) {
          summary[item._id] = round2(item.amount)
          counts[item._id] = item.count || 0
        }
      })
      const doc = (agentRes.data && agentRes.data[0]) || {}
      return ok({
        pending: summary.pending,
        available: summary.available,
        paid: summary.paid,
        void: summary.void,
        counts,
        commissionRate: round2(doc.commissionRate || 0),
        commissionBalance: round2(doc.commissionBalance || 0),
        paidCommission: round2(doc.paidCommission || 0),
        totalCommission: round2(doc.totalCommission || 0)
      })
    }

    // ============ 佣金明细 ============
    if (action === 'list') {
      const page = Math.max(1, Number(event.page || 1))
      const pageSize = Math.min(100, Math.max(1, Number(event.pageSize || 20)))
      const where = { agentId: agent._id }
      if (event.status) where.status = event.status
      if (event.startDate || event.endDate) {
        let createTime = null
        if (event.startDate) createTime = cmd.gte(new Date(event.startDate))
        if (event.endDate) {
          const end = new Date(event.endDate)
          if (String(event.endDate).length === 10) end.setDate(end.getDate() + 1)
          const lt = cmd.lt(end)
          createTime = createTime ? createTime.and(lt) : lt
        }
        if (createTime) where.createTime = createTime
      }

      let totalRes, listRes
      try {
        totalRes = await db.collection('agent-commission-records').where(where).count()
        listRes = await db.collection('agent-commission-records')
          .where(where)
          .orderBy('createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()
      } catch (e) {
        // 集合尚未创建时返回空列表
        return ok({ list: [], total: 0, page, pageSize })
      }
      return ok({
        list: (listRes.data || []).map(item => Object.assign({}, item, {
          orderBetAmount: round2(item.orderBetAmount || 0),
          orderWinAmount: round2(item.orderWinAmount || 0),
          baseAmount: round2(item.baseAmount || 0),
          amount: round2(item.amount || 0)
        })),
        total: totalRes.total || 0,
        page,
        pageSize
      })
    }

    return fail('不支持的操作', 400)
  } catch (e) {
    console.error('agent-commission error:', e)
    return fail(e.message || '服务器错误')
  }
}
