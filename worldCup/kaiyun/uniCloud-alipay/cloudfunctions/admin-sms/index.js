'use strict'
// @url /admin-sms
// 短信配置 / 测试发送 / 发送日志 / 失败重发
const db = uniCloud.database()
const cmd = db.command
const { ok, err, verifyToken, writeLog } = require('./utils')
const { sendSms, normalizePhones } = require('./sms-core')

const DEFAULT_CONFIG = {
  key: 'default',
  enabled: false,
  phones: ['18298380835'],
  signName: '甘肃食为天餐饮管理',
  templateCode: 'SMS_512616834',
  templateParamName: 'name',
  accessKeyId: '',
  accessKeySecret: '',
  minAmount: 0,
  dailyLimit: 1000,
  maxRetry: 3
}

function publicConfig(config) {
  const c = Object.assign({}, DEFAULT_CONFIG, config || {})
  return Object.assign({}, c, {
    accessKeySecret: c.accessKeySecret ? '******' : '',
    hasSecret: !!c.accessKeySecret
  })
}

function parsePhones(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(/[,，;\s]+/)
  const invalid = []
  const valid = []
  raw.forEach(item => {
    let p = String(item || '').trim().replace(/[\s-]/g, '')
    if (!p) return
    if (p.indexOf('+86') === 0) p = p.slice(3)
    if (/^1[3-9]\d{9}$/.test(p)) {
      if (valid.indexOf(p) === -1) valid.push(p)
    } else {
      invalid.push(p)
    }
  })
  return { valid, invalid }
}

async function findConfig() {
  try {
    const res = await db.collection('sms-config').limit(1).get()
    return (res.data && res.data[0]) || null
  } catch (e) {
    return null
  }
}

exports.main = async (event, context) => {
  const method = (event.httpMethod || 'GET').toUpperCase()

  const headers = event.headers || {}
  const token = (headers.authorization || headers.Authorization || '').replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const body = event.body
    ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body)
    : {}
  const query = event.queryStringParameters || {}
  const path = event.path || ''
  // URL 化网关可能保留函数名前缀（/admin-sms/test），也可能去掉（/test），两种都兼容
  const rawParts = path.split('/').filter(Boolean)
  const parts = rawParts.slice()
  while (parts[0] === 'admin-sms') parts.shift()
  const action = parts[0] || ''
  const actionId = parts[1] || ''

  try {
    // ============ 读取配置 ============
    if (method === 'GET' && (!action || action === 'config')) {
      const config = await findConfig()
      return ok(publicConfig(config))
    }

    // ============ 保存配置 ============
    // 兼容 URL 化网关：PUT/POST 都接受；路径带 /config 或不带都可以
    // 用 body 里的 phones 区分“保存配置”和“测试发送”，避免网关把所有子路径都吞掉
    if ((method === 'PUT' || method === 'POST') && (action === 'config' || (!action && body.phones !== undefined))) {
      const phones = parsePhones(body.phones)
      if (phones.invalid.length > 0) return err('手机号格式不正确: ' + phones.invalid.join(', '))
      if (phones.valid.length === 0) return err('请至少配置一个接收手机号')

      const existing = await findConfig()
      const data = {
        key: 'default',
        enabled: body.enabled === true || body.enabled === 'true',
        phones: phones.valid,
        signName: String(body.signName || '').trim(),
        templateCode: String(body.templateCode || '').trim(),
        templateParamName: (String(body.templateParamName || 'name').trim().replace(/[^a-zA-Z0-9_]/g, '') || 'name'),
        minAmount: Math.max(0, Number(body.minAmount) || 0),
        dailyLimit: Math.max(0, parseInt(body.dailyLimit, 10) || 0),
        maxRetry: Math.max(1, parseInt(body.maxRetry, 10) || 3),
        updateTime: new Date()
      }
      if (!data.signName) return err('请填写短信签名')
      if (!data.templateCode) return err('请填写短信模板CODE')

      // 前端回显的是掩码；只有传了新 Secret 才更新
      if (body.accessKeySecret && body.accessKeySecret !== '******') {
        data.accessKeySecret = String(body.accessKeySecret).trim()
      }
      if (body.accessKeyId) data.accessKeyId = String(body.accessKeyId).trim()

      if (existing) {
        await db.collection('sms-config').doc(existing._id).update(data)
      } else {
        await db.collection('sms-config').add(Object.assign({}, data, {
          accessKeySecret: data.accessKeySecret || '',
          createTime: new Date()
        }))
      }

      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'update_sms_config', targetType: 'sms-config', targetId: existing ? existing._id : '',
        detail: '更新短信配置: 接收号码 ' + data.phones.length + ' 个, 开关=' + data.enabled
      })
      return ok(publicConfig(Object.assign({}, existing || {}, data, { accessKeySecret: data.accessKeySecret || (existing && existing.accessKeySecret) || '' })), '短信配置已保存')
    }

    // ============ 测试发送 ============
    if (method === 'POST' && (action === 'test' || (!action && body.phone !== undefined && body.phones === undefined))) {
      const config = await findConfig()
      if (!config) return err('请先保存短信配置')
      if (!config.accessKeyId || !config.accessKeySecret) return err('请先填写 AccessKey ID 和 Secret')

      const phone = body.phone ? parsePhones(body.phone).valid[0] : (normalizePhones(config.phones)[0] || '')
      if (!phone) return err('接收手机号无效')

      const paramName = config.templateParamName || 'name'
      const templateParam = {}
      templateParam[paramName] = '测试'

      const result = await sendSms({
        accessKeyId: config.accessKeyId,
        accessKeySecret: config.accessKeySecret,
        phoneNumbers: phone,
        signName: config.signName,
        templateCode: config.templateCode,
        templateParam
      })

      await db.collection('sms-logs').add({
        taskId: 'test',
        orderId: '',
        orderNo: '',
        phoneMasked: phone.slice(0, 3) + '****' + phone.slice(7),
        signName: config.signName,
        templateCode: config.templateCode,
        params: templateParam,
        requestId: result.requestId || '',
        bizId: result.bizId || '',
        code: result.code || '',
        message: result.message || '',
        success: !!result.success,
        createTime: new Date()
      })

      if (!result.success) return err('发送失败: ' + (result.code || '') + ' ' + (result.message || ''))
      return ok(result, '短信请求已提交（阿里云 OK 仅代表受理，实际到达以手机为准）')
    }

    // ============ 发送日志 ============
    if (method === 'GET' && action === 'logs') {
      const page = Math.max(1, Number(query.page || 1))
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)))
      const where = {}
      if (query.orderNo) where.orderNo = new RegExp(String(query.orderNo).trim(), 'i')
      if (query.success === 'true') where.success = true
      if (query.success === 'false') where.success = false

      try {
        const totalRes = await db.collection('sms-logs').where(where).count()
        const listRes = await db.collection('sms-logs')
          .where(where)
          .orderBy('createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()
        return ok({ list: listRes.data || [], total: totalRes.total || 0, page, pageSize })
      } catch (e) {
        return ok({ list: [], total: 0, page, pageSize })
      }
    }

    // ============ 失败重发 ============
    const retryId = actionId || body.taskId
    if (method === 'POST' && (action === 'retry' || (!action && body.taskId)) && retryId) {
      const taskRes = await db.collection('sms-tasks').doc(retryId).get()
      const task = (taskRes.data && taskRes.data[0]) || null
      if (!task) return err('短信任务不存在')
      if (task.status === 'success') return err('该短信已发送成功')
      await db.collection('sms-tasks').doc(retryId).update({
        status: 'pending',
        attempts: 0,
        nextRetryAt: new Date(),
        lastError: '',
        updateTime: new Date()
      })
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'retry_sms', targetType: 'sms-tasks', targetId: retryId,
        detail: '手动重发短信: ' + (task.orderNo || retryId)
      })
      return ok(null, '已加入重发队列')
    }

    return err('不支持的请求方法: ' + method + ' ' + path, 405)
  } catch (e) {
    console.error('admin-sms error:', e)
    return err(e.message || '服务器错误')
  }
}
