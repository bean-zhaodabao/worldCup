'use strict'
// @url /admin/withdraws
// 提现审核: 列表 / 通过(冻结扣减) / 驳回(解冻回余额)
const db = uniCloud.database()
const cmd = db.command
const { ok, err, verifyToken, writeLog } = require('./utils')

exports.main = async (event, context) => {
  const token = (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const method = event.httpMethod || 'GET'
  const body = event.body ? JSON.parse(event.body) : {}
  const query = event.queryStringParameters || {}
  const path = event.path || ''

  try {
    // ============ GET - 提现列表 ============
    if (method === 'GET') {
      const { status, page = 1, pageSize = 20 } = query
      const where = {}
      if (status) where.status = status

      const total = await db.collection('withdrawals').where(where).count()
      const res = await db.collection('withdrawals')
        .where(where)
        .orderBy('applyTime', 'desc')
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize))
        .get()
      return ok({ list: res.data || [], total: total.total, page: Number(page), pageSize: Number(pageSize) })
    }

    // ============ PATCH /:id/review - 审核 ============
    if (method === 'PATCH' && path.includes('/review')) {
      const id = path.split('/')[path.split('/').length - 2]
      const { approve, remark } = body
      if (typeof approve !== 'boolean') return err('approve 参数必填(布尔)')

      const wRes = await db.collection('withdrawals').doc(id).get()
      const w = (wRes.data && wRes.data[0]) || null
      if (!w) return err('提现申请不存在')
      if (w.status !== 'pending') return err('该申请已审核过')

      const amount = Number(w.amount)
      if (approve) {
        // 通过: 冻结金额扣减(打款线下处理, 系统只记流水)
        await db.collection('users').doc(w.userId).update({ frozenBalance: cmd.inc(-amount) })
      } else {
        // 驳回: 解冻回可用余额
        await db.collection('users').doc(w.userId).update({ frozenBalance: cmd.inc(-amount), balance: cmd.inc(amount) })
      }

      await db.collection('withdrawals').doc(id).update({
        status: approve ? 'approved' : 'rejected',
        reviewTime: new Date(),
        operatorId: admin._id,
        operatorName: admin.username,
        remark: remark || ''
      })

      const uRes = await db.collection('users').doc(w.userId).get()
      const u = (uRes.data && uRes.data[0]) || {}
      await db.collection('wallet-logs').add({
        userId: w.userId,
        type: approve ? 'withdraw' : 'unfreeze',
        amount: approve ? -amount : amount,
        balanceAfter: u.balance || 0,
        frozenAfter: u.frozenBalance || 0,
        withdrawId: id,
        operatorId: admin._id,
        operatorName: admin.username,
        remark: approve ? ('提现审核通过' + (remark ? ': ' + remark : '')) : ('提现审核驳回' + (remark ? ': ' + remark : '')),
        createTime: new Date()
      })

      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'withdraw_review', targetType: 'withdrawals', targetId: id,
        detail: (approve ? '通过' : '驳回') + '提现: ' + w.userName + ' ¥' + amount.toFixed(2),
        beforeData: { status: 'pending' },
        afterData: { status: approve ? 'approved' : 'rejected' }
      })
      return ok(null, approve ? '已通过，请线下打款' : '已驳回并解冻')
    }

    return err('不支持的请求方法', 405)
  } catch (e) {
    console.error('admin-withdraw error:', e)
    return err(e.message || '服务器错误')
  }
}
