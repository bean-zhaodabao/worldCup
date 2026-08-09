'use strict'
// @url /admin/matches/:id/settle
const db = uniCloud.database()
const { ok, err, verifyToken, writeLog } = require('./utils')

exports.main = async (event, context) => {
  const token = (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const body = event.body ? JSON.parse(event.body) : {}
  const path = event.path || ''

  try {
    // POST - 结算赛事
    const pathParts = path.split('/')
    const matchId = pathParts[pathParts.indexOf('settle') - 1] || body.matchId

    if (!matchId) return err('缺少赛事ID')

    const match = await db.collection('matches').doc(matchId).get()
    if (!match.data || match.data.length === 0) return err('赛事不存在')
    if (match.data[0].status !== 'finished') return err('只能结算已结束的赛事')

    // 更新赛事状态
    await db.collection('matches').doc(matchId).update({ status: 'settled', updateTime: new Date() })

    // 结算该赛事相关的订单：
    // 1. 单关订单（matchId === matchId）
    // 2. 串关订单中仅包含此场次的（matchIds 只有这一个 matchId 的）
    //    对于包含多场次的串关，不在此处结算（需等所有场次都结算后再处理）
    const singleOrders = await db.collection('orders')
      .where({ matchId, status: db.command.in(['won', 'lost']), isParlay: db.command.neq(true) })
      .update({ status: 'settled', settleTime: new Date() })

    // 同时检查串关订单：如果 matchIds 只包含这一个 matchId，也结算
    const allParlayOrders = await db.collection('orders')
      .where({ status: db.command.in(['won', 'lost']), isParlay: true })
      .get()

    let parlaySettledCount = 0
    for (const order of (allParlayOrders.data || [])) {
      const orderMatchIds = order.matchIds || []
      // 如果串关中包含此场次，且所有场次都已结算
      if (orderMatchIds.includes(matchId)) {
        const allMatches = await db.collection('matches')
          .where({ _id: db.command.in(orderMatchIds) })
          .get()
        const allSettled = (allMatches.data || []).every(m => m.status === 'settled')
        if (allSettled) {
          await db.collection('orders').doc(order._id).update({
            status: 'settled',
            settleTime: new Date()
          })
          parlaySettledCount++
        }
      }
    }

    const totalSettled = (singleOrders.updated || 0) + parlaySettledCount

    await writeLog(db, {
      adminId: admin._id, adminName: admin.username,
      action: 'settle_match', targetType: 'matches', targetId: matchId,
      detail: '结算赛事: ' + match.data[0].name + ', 处理订单数: ' + totalSettled
    })

    return ok({ settledOrders: totalSettled }, '赛事已结算')
  } catch (e) {
    console.error('admin-settle error:', e)
    return err(e.message || '服务器错误')
  }
}
