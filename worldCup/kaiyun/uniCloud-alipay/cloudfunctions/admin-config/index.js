'use strict'
// @url /admin-config
const db = uniCloud.database()
const { ok, err, verifyToken, writeLog } = require('./utils')

// 默认配置
const DEFAULT_CONFIG = {
  minBet: { value: '2.00', description: '单注最低金额' },
  maxBet: { value: '100000.00', description: '单注最高金额' },
  matchDays: { value: '2', description: '移动端赛事展示天数(含今天, 默认2)' },
  agentCommissionEnabled: { value: 'true', description: '代理佣金开关' },
  agentDefaultRate: { value: '2.5', description: '新建代理默认佣金比例(%)' },
  agentCommissionConfirm: { value: 'manual', description: '佣金确认方式: manual/auto' }
}

function buildConfig(list) {
  const config = {}
  Object.keys(DEFAULT_CONFIG).forEach(key => {
    config[key] = DEFAULT_CONFIG[key].value
  })
  ;(list || []).forEach(item => {
    config[item.key] = item.value
  })
  return config
}

exports.main = async (event, context) => {
  const headers = event.headers || {}
  const token = (headers.authorization || headers.Authorization || '').replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const method = (event.httpMethod || 'GET').toUpperCase()
  const body = event.body
    ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body)
    : {}

  try {
    // GET - 获取配置
    if (method === 'GET') {
      const res = await db.collection('system-config').get()
      return ok(buildConfig(res.data))
    }

    // PUT/POST - 更新配置（兼容 URL 化网关只放行 POST 的情况）
    if (method === 'PUT' || method === 'POST') {
      const saved = {}
      for (const key of Object.keys(DEFAULT_CONFIG)) {
        if (body[key] === undefined || body[key] === null) continue
        const value = String(body[key])
        saved[key] = value

        // 更新该 key 的所有记录，避免历史重复数据导致刷新后读到旧值
        const exist = await db.collection('system-config').where({ key }).get()
        if (exist.data && exist.data.length > 0) {
          await db.collection('system-config').where({ key }).update({
            value,
            updateTime: new Date()
          })
        } else {
          await db.collection('system-config').add({
            key,
            value,
            description: DEFAULT_CONFIG[key] ? DEFAULT_CONFIG[key].description : '',
            updateTime: new Date()
          })
        }
      }

      if (Object.keys(saved).length === 0) return err('没有需要保存的配置项')

      // 保存后重新读取，确认真正落库，避免“假成功”
      const checkRes = await db.collection('system-config').get()
      const latest = buildConfig(checkRes.data)
      for (const key of Object.keys(saved)) {
        if (String(latest[key]) !== String(saved[key])) {
          return err('配置保存校验失败: ' + key)
        }
      }

      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'update_config', targetType: 'system-config', targetId: '',
        detail: '更新系统配置: ' + Object.keys(saved).join(','),
        afterData: saved
      })

      return ok(latest, '配置已保存')
    }

    return err('不支持的请求方法: ' + method, 405)
  } catch (e) {
    console.error('admin-config error:', e)
    return err(e.message || '服务器错误')
  }
}
