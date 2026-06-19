'use strict'
// @url /admin/users
const db = uniCloud.database()
const { ok, err, verifyToken, writeLog } = require('./utils')

exports.main = async (event, context) => {
  const token = (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const method = event.httpMethod || 'GET'
  const body = event.body ? JSON.parse(event.body) : {}
  const path = event.path || ''

  try {
    // ============ GET - 用户列表 ============
    if (method === 'GET') {
      const res = await db.collection('users')
        .where({ role: 'user' })
        .orderBy('createTime', 'desc')
        .get()
      // 不返回密码
      const list = (res.data || []).map(u => ({ _id: u._id, username: u.username, createTime: u.createTime, status: u.status }))
      return ok({ list })
    }

    // ============ POST - 创建用户 ============
    if (method === 'POST') {
      const { username, password } = body
      if (!username || !password) return err('用户名和密码不能为空')
      if (username.length < 3) return err('用户名至少3个字符')
      if (password.length < 6) return err('密码至少6个字符')

      // 检查用户名是否已存在
      const exist = await db.collection('users').where({ username }).count()
      if (exist.total > 0) return err('用户名已存在')

      await db.collection('users').add({
        username, password,
        role: 'user',
        status: 'active',
        createTime: new Date()
      })

      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'create_user', targetType: 'users', targetId: '',
        detail: '创建用户: ' + username
      })
      return ok(null, '用户创建成功')
    }

    // ============ PATCH /:id/password - 重置密码 ============
    if (method === 'PATCH' && path.includes('/password')) {
      const id = path.split('/')[path.split('/').length - 2]
      const { password } = body
      if (!password || password.length < 6) return err('密码至少6个字符')

      await db.collection('users').doc(id).update({ password })
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'create_user', targetType: 'users', targetId: id,
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
