'use strict'
// @url /admin/users
// 用户管理: 列表(类型/余额) / 创建(散户/收单) / 充值 / 重置密码 / 启用停用
const db = uniCloud.database()
const cmd = db.command
const { ok, err, verifyToken, writeLog } = require('./utils')

function round2(n) { return Math.round(n * 100) / 100 }

exports.main = async (event, context) => {
  const token = (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const method = event.httpMethod || 'GET'
  const body = event.body ? JSON.parse(event.body) : {}
  const query = event.queryStringParameters || {}
  const path = event.path || ''

  try {
    // ============ GET - 用户列表 ============
    if (method === 'GET') {
      const { type, keyword, page = 1, pageSize = 20 } = query
      const where = { role: 'user' }
      if (type) where.type = type
      if (keyword) where.username = new RegExp(keyword, 'i')

      const total = await db.collection('users').where(where).count()
      const res = await db.collection('users')
        .where(where)
        .orderBy('createTime', 'desc')
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize))
        .get()
      // 不返回密码
      const list = (res.data || []).map(u => ({
        _id: u._id, username: u.username, createTime: u.createTime, status: u.status,
        type: u.type || 'retail',
        balance: u.balance || 0,
        frozenBalance: u.frozenBalance || 0
      }))
      return ok({ list, total: total.total, page: Number(page), pageSize: Number(pageSize) })
    }

    // ============ POST - 创建用户 ============
    if (method === 'POST') {
      const { username, password, type } = body
      if (!username || !password) return err('用户名和密码不能为空')
      if (username.length < 3) return err('用户名至少3个字符')
      if (password.length < 6) return err('密码至少6个字符')
      const userType = type === 'collector' ? 'collector' : 'retail'
      if (type !== undefined && type !== 'retail' && type !== 'collector') return err('账户类型无效')

      const exist = await db.collection('users').where({ username }).count()
      if (exist.total > 0) return err('用户名已存在')

      await db.collection('users').add({
        username, password,
        role: 'user',
        type: userType,
        balance: 0,
        frozenBalance: 0,
        status: 'active',
        createTime: new Date()
      })

      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'create_user', targetType: 'users', targetId: '',
        detail: '创建用户: ' + username + '(' + (userType === 'collector' ? '收单账户' : '散户') + ')'
      })
      return ok(null, '用户创建成功')
    }

    // ============ POST /:id/recharge - 充值(散户) ============
    if (method === 'POST' && path.includes('/recharge')) {
      const id = path.split('/')[path.split('/').length - 2]
      const amount = round2(Number(body.amount))
      const remark = body.remark || ''
      if (!amount || amount <= 0 || isNaN(amount)) return err('充值金额无效')

      const uRes = await db.collection('users').doc(id).get()
      const u = (uRes.data && uRes.data[0]) || null
      if (!u) return err('用户不存在')

      await db.collection('users').doc(id).update({ balance: cmd.inc(amount) })

      const afterRes = await db.collection('users').doc(id).get()
      const after = afterRes.data && afterRes.data[0]
      await db.collection('wallet-logs').add({
        userId: id,
        type: 'recharge',
        amount,
        balanceAfter: after ? (after.balance || 0) : 0,
        frozenAfter: after ? (after.frozenBalance || 0) : 0,
        operatorId: admin._id,
        operatorName: admin.username,
        remark: remark || '管理端充值',
        createTime: new Date()
      })

      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'recharge', targetType: 'users', targetId: id,
        detail: '充值: ' + u.username + ' +¥' + amount.toFixed(2) + (remark ? ' (' + remark + ')' : '')
      })
      return ok({ balance: after ? (after.balance || 0) : 0 }, '充值成功')
    }

    // ============ PATCH /:id/status - 启用/停用 ============
    if (method === 'PATCH' && path.includes('/status')) {
      const id = path.split('/')[path.split('/').length - 2]
      const { status } = body
      if (status !== 'active' && status !== 'disabled') return err('状态值无效')
      await db.collection('users').doc(id).update({ status })
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'user_status', targetType: 'users', targetId: id,
        detail: (status === 'active' ? '启用' : '停用') + '用户: ' + id
      })
      return ok(null, status === 'active' ? '已启用' : '已停用')
    }

    // ============ PATCH /:id/password - 重置密码 ============
    if (method === 'PATCH' && path.includes('/password')) {
      const id = path.split('/')[path.split('/').length - 2]
      const { password } = body
      if (!password || password.length < 6) return err('密码至少6个字符')

      await db.collection('users').doc(id).update({ password })
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'reset_password', targetType: 'users', targetId: id,
        detail: '重置用户密码: ' + id
      })
      return ok(null, '密码已重置')
    }

    return err('不支持的请求方法', 405)
  } catch (e) {
    console.error('admin-user error:', e)
    return err(e.message || '服务器错误')
  }
}
