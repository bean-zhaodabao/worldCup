'use strict'
const db = uniCloud.database()
const { ok, err, generateToken } = require('./utils')

exports.main = async (event, context) => {
  const body = event.body ? JSON.parse(event.body) : event
  const { username, password } = body

  if (!username || !password) return err('用户名和密码不能为空')

  try {
    const res = await db.collection('users')
      .where({ username, role: 'admin', status: 'active' })
      .get()

    if (!res.data || res.data.length === 0) return err('用户名或密码错误')

    const admin = res.data[0]
    if (admin.password !== password) return err('用户名或密码错误')

    const token = generateToken(admin)
    return ok({ token, username: admin.username, _id: admin._id }, '登录成功')
  } catch (e) {
    return err(e.message || '服务器错误')
  }
}
