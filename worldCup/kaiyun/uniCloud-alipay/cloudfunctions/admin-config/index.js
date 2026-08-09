'use strict'
// @url /admin/config
const db = uniCloud.database()
const { ok, err, verifyToken } = require('./utils')

// 默认配置
const DEFAULT_CONFIG = {
  minBet: { value: '2.00', description: '单注最低金额' },
  maxBet: { value: '100000.00', description: '单注最高金额' }
}

exports.main = async (event, context) => {
  const token = (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const method = event.httpMethod || 'GET'
  const body = event.body ? JSON.parse(event.body) : {}

  try {
    // GET - 获取配置
    if (method === 'GET') {
      const res = await db.collection('system-config').get()
      const config = {}
      // 初始化默认值
      Object.keys(DEFAULT_CONFIG).forEach(key => {
        config[key] = DEFAULT_CONFIG[key].value
      })
      // 覆盖数据库中的值
      (res.data || []).forEach(item => {
        config[item.key] = item.value
      })
      return ok(config)
    }

    // PUT - 更新配置
    if (method === 'PUT') {
      for (const [key, value] of Object.entries(body)) {
        // 使用 upsert
        const exist = await db.collection('system-config').where({ key }).get()
        if (exist.data && exist.data.length > 0) {
          await db.collection('system-config').doc(exist.data[0]._id).update({
            value: String(value),
            updateTime: new Date()
          })
        } else {
          await db.collection('system-config').add({
            key,
            value: String(value),
            description: DEFAULT_CONFIG[key] ? DEFAULT_CONFIG[key].description : '',
            updateTime: new Date()
          })
        }
      }

      await require('./utils').writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'update_config', targetType: 'system-config', targetId: '',
        detail: '更新系统配置',
        afterData: body
      })

      return ok(null, '配置已保存')
    }

    return err('不支持的请求方法', 405)
  } catch (e) {
    console.error('admin-config error:', e)
    return err(e.message || '服务器错误')
  }
}
