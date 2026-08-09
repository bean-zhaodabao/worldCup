'use strict'
// @url /user/login
const db = uniCloud.database()
const { success, fail, generateToken } = require('./utils')

exports.main = async (event, context) => {
  const body = event.body ? JSON.parse(event.body) : event
  const { username, password } = body

  if (!username || !password) return fail('用户名和密码不能为空')

  const res = await db.collection('users')
    .where({ username, role: 'user', status: 'active' })
    .get()

  if (!res.data || res.data.length === 0) return fail('用户名或密码错误')

  const user = res.data[0]
  if (user.password !== password) return fail('用户名或密码错误')

  const token = generateToken(user)
  return success({
    token,
    userId: user._id,
    username: user.username
  }, '登录成功')
}
