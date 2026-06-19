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

    // 将该赛事所有订单标记为已结算
    const updateRes = await db.collection('orders')
      .where({ matchId, status: db.command.in(['won', 'lost']) })
      .update({ status: 'settled', settleTime: new Date() })

    await writeLog(db, {
      adminId: admin._id, adminName: admin.username,
      action: 'settle_match', targetType: 'matches', targetId: matchId,
      detail: '结算赛事: ' + match.data[0].name + ', 处理订单数: ' + (updateRes.updated || 0)
    })

    return ok({ settledOrders: updateRes.updated || 0 }, '赛事已结算')
  } catch (e) {
    console.error('admin-settle error:', e)
    return err(e.message || '服务器错误')
  }
}
