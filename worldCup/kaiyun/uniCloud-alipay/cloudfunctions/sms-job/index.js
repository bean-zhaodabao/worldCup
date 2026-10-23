'use strict'
// 下注短信通知任务：扫描 sms-tasks，调用阿里云 SendSms
// 触发方式：uniCloud 定时器；也可带 admin token 手动触发
const db = uniCloud.database()
const cmd = db.command
const { ok, fail, verifyToken, getToken, cnTodayStart } = require('./utils')
const { sendSms, maskPhones, normalizePhones } = require('./sms-core')

const BATCH_SIZE = 50
const RETRY_DELAYS = [1 * 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000]

async function getConfig() {
  try {
    const res = await db.collection('sms-config').limit(1).get()
    return (res.data && res.data[0]) || null
  } catch (e) {
    return null
  }
}

async function updateTask(taskId, data) {
  await db.collection('sms-tasks').doc(taskId).update(Object.assign({ updateTime: new Date() }, data))
}

async function writeLog(entry) {
  await db.collection('sms-logs').add(Object.assign({ createTime: new Date() }, entry))
}

async function getTodaySentCount() {
  try {
    const res = await db.collection('sms-logs')
      .where({ success: true, createTime: cmd.gte(cnTodayStart()) })
      .count()
    return res.total || 0
  } catch (e) {
    return 0
  }
}

function isMissingCollection(e) {
  const msg = String((e && e.message) || e || '')
  return msg.indexOf('not exist') > -1 || msg.indexOf('Collection') > -1 || msg.indexOf('collection') > -1
}

function configMissingText(config) {
  if (!config) return '未配置短信'
  if (!config.phones || normalizePhones(config.phones).length === 0) return '未配置接收手机号'
  if (!config.signName) return '未配置短信签名'
  if (!config.templateCode) return '未配置短信模板'
  if (!config.accessKeyId || !config.accessKeySecret) return '未配置 AccessKey'
  return ''
}

async function processTask(task, config, state) {
  if (!config) {
    await updateTask(task._id, {
      status: 'pending',
      lastError: '未配置短信',
      nextRetryAt: new Date(Date.now() + 10 * 60 * 1000)
    })
    return 'waiting'
  }
  if (config.enabled !== true) {
    await updateTask(task._id, { status: 'skipped', lastError: '短信开关未开启' })
    return 'skipped'
  }

  const missing = configMissingText(config)
  if (missing) {
    // 配置不完整时保留待发送，10 分钟后再试，避免配置完成后漏发
    await updateTask(task._id, {
      status: 'pending',
      lastError: missing,
      nextRetryAt: new Date(Date.now() + 10 * 60 * 1000)
    })
    return 'waiting'
  }

  if (Number(config.minAmount || 0) > 0 && Number(task.betAmount || 0) < Number(config.minAmount)) {
    await updateTask(task._id, { status: 'skipped', lastError: '未达到通知金额阈值' })
    return 'skipped'
  }

  const dailyLimit = Number(config.dailyLimit || 0)
  if (dailyLimit > 0 && state.sentToday >= dailyLimit) {
    await updateTask(task._id, { status: 'skipped', lastError: '超过每日发送上限' })
    return 'skipped'
  }

  const phones = normalizePhones(config.phones)
  const paramName = config.templateParamName || 'name'
  const templateParam = {}
  templateParam[paramName] = String(task.userName || '用户').replace(/[\r\n\t]/g, ' ').slice(0, 20)

  const result = await sendSms({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    phoneNumbers: phones,
    signName: config.signName,
    templateCode: config.templateCode,
    templateParam,
    outId: task.orderId || task._id
  })

  await writeLog({
    taskId: task._id,
    orderId: task.orderId || '',
    orderNo: task.orderNo || '',
    phoneMasked: maskPhones(phones),
    signName: config.signName,
    templateCode: config.templateCode,
    params: templateParam,
    requestId: result.requestId || '',
    bizId: result.bizId || '',
    code: result.code || '',
    message: result.message || '',
    success: !!result.success
  })

  const attempts = Number(task.attempts || 0) + 1
  if (result.success) {
    state.sentToday++
    await updateTask(task._id, {
      status: 'success',
      attempts,
      lastError: ''
    })
    return 'success'
  }

  const maxRetry = Number(config.maxRetry || 3)
  if (attempts >= maxRetry) {
    await updateTask(task._id, {
      status: 'failed',
      attempts,
      lastError: (result.code || '') + ' ' + (result.message || '')
    })
    return 'failed'
  }

  const delay = RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)]
  await updateTask(task._id, {
    status: 'pending',
    attempts,
    lastError: (result.code || '') + ' ' + (result.message || ''),
    nextRetryAt: new Date(Date.now() + delay)
  })
  return 'retry'
}

exports.main = async (event, context) => {
  if (event.token) {
    const admin = await verifyToken(db, getToken(event))
    if (!admin || admin.role !== 'admin') return fail('无权限', 403)
  }

  try {
    const config = await getConfig()
    let tasks = []
    try {
      const tasksRes = await db.collection('sms-tasks')
        .where({ status: 'pending', nextRetryAt: cmd.lte(new Date()) })
        .orderBy('createTime', 'asc')
        .limit(BATCH_SIZE)
        .get()
      tasks = tasksRes.data || []
    } catch (e) {
      if (isMissingCollection(e)) {
        return ok({ processed: 0, success: 0, failed: 0, retry: 0, skipped: 0, waiting: 0, hasMore: false })
      }
      throw e
    }

    const state = { sentToday: await getTodaySentCount() }
    const stats = { processed: tasks.length, success: 0, failed: 0, retry: 0, skipped: 0, waiting: 0 }

    for (const task of tasks) {
      const r = await processTask(task, config, state)
      if (stats[r] !== undefined) stats[r]++
    }

    if (tasks.length > 0) {
      await db.collection('operation-logs').add({
        adminId: 'system', adminName: 'system',
        action: 'sms_job', targetType: 'sms-tasks', targetId: '',
        detail: '短信任务: 处理 ' + stats.processed + ', 成功 ' + stats.success + ', 失败 ' + stats.failed + ', 待重试 ' + stats.retry + ', 跳过 ' + stats.skipped,
        createTime: new Date()
      })
    }

    return ok(Object.assign({ hasMore: tasks.length >= BATCH_SIZE }, stats))
  } catch (e) {
    console.error('sms-job error:', e)
    return fail(e.message || '服务器错误')
  }
}
