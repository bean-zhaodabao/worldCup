'use strict'
// @url /user/login
const db = uniCloud.database()
const { success, fail, generateToken } = require('./utils')

exports.main = async (event, context) => {
  const body = event.body ? JSON.parse(event.body) : event
  const { username, password } = body

  if (!username || !password) return fail('用户名和密码不能为空')

  const res = await db.collection('users')
    .where({ username, status: 'active' })
    .get()

  if (!res.data || res.data.length === 0) return fail('用户名或密码错误')

  const user = res.data[0]
  // 管理端账号不允许从移动端登录；移动端只允许散户/收单/代理
  if (user.role !== 'user' && user.role !== 'agent') return fail('用户名或密码错误')
  if (user.password !== password) return fail('用户名或密码错误')

  const token = generateToken(user)
  return success({
    token,
    userId: user._id,
    username: user.username,
    role: user.role || 'user',
    type: user.type || 'retail',
    agentCode: user.agentCode || '',
    commissionRate: user.commissionRate || 0,
    commissionBalance: user.commissionBalance || 0,
    balance: user.balance || 0,
    frozenBalance: user.frozenBalance || 0
  }, '登录成功')
}
