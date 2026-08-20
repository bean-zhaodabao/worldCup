'use strict'
// @url /user/wallet
// 移动端钱包: 余额查询 / 资金流水 / 提现申请 / 提现记录
// 规则(2026-08-20 客户确认):
//  - 提现申请即冻结(可用->冻结), 管理端审核通过扣减, 驳回解冻
//  - 收单账户无提现(仅散户可提现)
const db = uniCloud.database()
const cmd = db.command
const { success, fail, verifyToken } = require('./utils')

function round2(n) { return Math.round(n * 100) / 100 }

exports.main = async (event, context) => {
  const token = event.token || (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const user = await verifyToken(db, token)
  if (!user) return fail('未登录或登录已过期', 401)

  try {
    const action = event.action || 'info'

    // ============ 余额信息 ============
    if (action === 'info') {
      const uRes = await db.collection('users').doc(user._id).get()
      const u = (uRes.data && uRes.data[0]) || {}
      return success({
        type: u.type || 'retail',
        balance: u.balance || 0,
        frozenBalance: u.frozenBalance || 0
      })
    }

    // ============ 资金流水 ============
    if (action === 'logs') {
      const page = Number(event.page || 1)
      const pageSize = Number(event.pageSize || 20)
      const where = { userId: user._id }
      if (event.logType) where.type = event.logType

      const total = await db.collection('wallet-logs').where(where).count()
      const res = await db.collection('wallet-logs')
        .where(where)
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()
      return success({ list: res.data || [], total: total.total })
    }

    // ============ 提现申请 ============
    if (action === 'apply') {
      if (user.type === 'collector') return fail('收单账户不支持提现')
      const amount = round2(Number(event.amount))
      if (!amount || amount <= 0 || isNaN(amount)) return fail('提现金额无效')

      // 原子操作: 余额足够则冻结(可用->冻结)
      const upd = await db.collection('users')
        .where({ _id: user._id, balance: cmd.gte(amount) })
        .update({ balance: cmd.inc(-amount), frozenBalance: cmd.inc(amount) })
      if (!upd.updated || upd.updated === 0) return fail('可用余额不足')

      try {
        const wRes = await db.collection('withdrawals').add({
          userId: user._id,
          userName: user.username,
          amount,
          status: 'pending',
          applyTime: new Date()
        })

        const uAfterRes = await db.collection('users').doc(user._id).get()
        const uAfter = (uAfterRes.data && uAfterRes.data[0]) || {}
        await db.collection('wallet-logs').add({
          userId: user._id,
          type: 'freeze',
          amount: -amount,
          balanceAfter: uAfter.balance || 0,
          frozenAfter: uAfter.frozenBalance || 0,
          withdrawId: wRes.id,
          remark: '提现申请冻结',
          createTime: new Date()
        })
        return success({ withdrawId: wRes.id }, '提现申请已提交，等待审核')
      } catch (e) {
        // 回滚冻结
        await db.collection('users').doc(user._id).update({ balance: cmd.inc(amount), frozenBalance: cmd.inc(-amount) })
        console.error('user-wallet apply error:', e)
        return fail('提现申请失败，请重试')
      }
    }

    // ============ 提现记录 ============
    if (action === 'withdrawals') {
      const page = Number(event.page || 1)
      const pageSize = Number(event.pageSize || 20)
      const where = { userId: user._id }
      const total = await db.collection('withdrawals').where(where).count()
      const res = await db.collection('withdrawals')
        .where(where)
        .orderBy('applyTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()
      return success({ list: res.data || [], total: total.total })
    }

    return fail('不支持的操作: ' + action)
  } catch (e) {
    console.error('user-wallet error:', e)
    return fail(e.message || '服务器错误')
  }
}
