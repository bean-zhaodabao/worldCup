'use strict'
// @url /admin/logs
const db = uniCloud.database()
const { ok, err, verifyToken } = require('./utils')

exports.main = async (event, context) => {
  const token = (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const query = event.queryStringParameters || {}

  try {
    const { action, page = 1, pageSize = 30, startDate, endDate } = query
    const where = {}

    if (action) where.action = action
    if (startDate || endDate) {
      where.createTime = {}
      if (startDate) where.createTime.$gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.createTime.$lte = end
      }
    }

    const total = await db.collection('operation-logs').where(where).count()
    const res = await db.collection('operation-logs')
      .where(where)
      .orderBy('createTime', 'desc')
      .skip((Number(page) - 1) * Number(pageSize))
      .limit(Number(pageSize))
      .get()

    return ok({
      list: res.data || [],
      total: total.total,
      page: Number(page),
      pageSize: Number(pageSize)
    })
  } catch (e) {
    console.error('admin-log error:', e)
    return err(e.message || '服务器错误')
  }
}
