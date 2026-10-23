'use strict'
// 代理佣金任务：扫描已结算订单，幂等生成佣金记录
// 触发方式：uniCloud 定时器；也可由管理端带 admin token 手动触发
const db = uniCloud.database()
const cmd = db.command
const { ok, fail, verifyToken, round2, getToken } = require('./utils')
const { calcCommission } = require('./commission-core')

const BATCH_SIZE = 100

async function getConfig() {
  const res = await db.collection('system-config')
    .where({ key: cmd.in(['agentCommissionEnabled', 'agentCommissionConfirm', 'agentFeatureStartAt']) })
    .get()
  const map = {}
  ;(res.data || []).forEach(item => { map[item.key] = item.value })
  return {
    enabled: map.agentCommissionEnabled !== 'false',
    autoConfirm: map.agentCommissionConfirm === 'auto',
    startAt: map.agentFeatureStartAt ? new Date(map.agentFeatureStartAt) : null
  }
}

async function updateOrder(orderId, data) {
  await db.collection('orders').doc(orderId).update(data)
}

async function writeWalletLog(entry) {
  await db.collection('agent-wallet-logs').add(Object.assign({ createTime: new Date() }, entry))
}

function isMissingCollection(e) {
  const msg = String((e && e.message) || e || '')
  return msg.indexOf('not exist') > -1 || msg.indexOf('Collection') > -1 || msg.indexOf('collection') > -1
}

async function processOrder(order, config) {
  const agentRes = await db.collection('users').doc(order.agentId).get()
  const agent = (agentRes.data && agentRes.data[0]) || null
  if (!agent || agent.role !== 'agent') {
    await updateOrder(order._id, { commissionStatus: 'skipped', commissionTime: new Date() })
    return { skipped: 1 }
  }

  const rate = order.agentRate !== undefined && order.agentRate !== null
    ? Number(order.agentRate)
    : Number(agent.commissionRate || 0)

  if (!rate || rate <= 0) {
    await updateOrder(order._id, { commissionStatus: 'skipped', commissionTime: new Date() })
    return { skipped: 1 }
  }

  const amount = calcCommission(order.betAmount, rate)
  if (amount <= 0) {
    await updateOrder(order._id, { commissionStatus: 'skipped', commissionTime: new Date() })
    return { skipped: 1 }
  }

  let existRes = { data: [] }
  try {
    existRes = await db.collection('agent-commission-records')
      .where({ agentId: order.agentId, orderId: order._id })
      .get()
  } catch (e) {
    if (!isMissingCollection(e)) throw e
  }
  let record = (existRes.data && existRes.data[0]) || null
  let created = false

  if (!record) {
    const userRes = await db.collection('users').doc(order.userId).get()
    const user = (userRes.data && userRes.data[0]) || {}
    const recordData = {
      agentId: order.agentId,
      agentName: agent.username || '',
      userId: order.userId,
      userName: user.username || '',
      orderId: order._id,
      orderNo: order.orderNo || '',
      orderBetAmount: round2(order.betAmount || 0),
      orderWinAmount: round2(order.winAmount || 0),
      baseType: 'turnover',
      baseAmount: round2(order.betAmount || 0),
      rate,
      amount,
      status: 'pending',
      orderSettledAt: order.settleTime || null,
      createTime: new Date()
    }
    try {
      const addRes = await db.collection('agent-commission-records').add(recordData)
      record = Object.assign({ _id: addRes.id }, recordData)
      created = true
      await db.collection('users').doc(order.agentId).update({
        totalCommission: cmd.inc(amount)
      })

      // 自动确认模式：直接进入可结算
      if (config.autoConfirm) {
        await db.collection('agent-commission-records').doc(record._id).update({
          status: 'available',
          confirmTime: new Date()
        })
        await db.collection('users').doc(order.agentId).update({
          commissionBalance: cmd.inc(amount)
        })
        const agentAfterRes = await db.collection('users').doc(order.agentId).get()
        const agentAfter = (agentAfterRes.data && agentAfterRes.data[0]) || {}
        await writeWalletLog({
          agentId: order.agentId,
          type: 'commission',
          amount,
          balanceAfter: round2(agentAfter.commissionBalance || 0),
          recordId: record._id,
          remark: '佣金自动确认入账'
        })
        record.status = 'available'
      }
    } catch (e) {
      // 唯一索引冲突：重新读取，按已存在处理
      const again = await db.collection('agent-commission-records')
        .where({ agentId: order.agentId, orderId: order._id })
        .get()
      record = (again.data && again.data[0]) || null
      if (!record) throw e
    }
  }

  if (record && record.status === 'void') {
    await updateOrder(order._id, {
      commissionStatus: 'void',
      commissionAmount: 0,
      commissionRecordId: record._id,
      commissionTime: new Date()
    })
    return { skipped: 1 }
  }

  // 自动确认模式：兼容“记录已创建但上次未确认”的情况
  if (record && config.autoConfirm && record.status === 'pending') {
    await db.collection('agent-commission-records').doc(record._id).update({
      status: 'available',
      confirmTime: new Date()
    })
    await db.collection('users').doc(order.agentId).update({
      commissionBalance: cmd.inc(amount)
    })
    const agentAfterRes = await db.collection('users').doc(order.agentId).get()
    const agentAfter = (agentAfterRes.data && agentAfterRes.data[0]) || {}
    await writeWalletLog({
      agentId: order.agentId,
      type: 'commission',
      amount,
      balanceAfter: round2(agentAfter.commissionBalance || 0),
      recordId: record._id,
      remark: '佣金自动确认入账'
    })
    record.status = 'available'
  }

  await updateOrder(order._id, {
    commissionStatus: record.status === 'paid' ? 'paid' : (record.status === 'available' ? 'available' : 'pending'),
    commissionAmount: amount,
    commissionRecordId: record._id,
    commissionTime: new Date()
  })

  return created ? { created: 1 } : { skipped: 1 }
}

// 退款/删除订单冲销未支付佣金
async function reconcileVoided() {
  let voided = 0
  const badRes = await db.collection('orders')
    .where({
      commissionStatus: cmd.in(['pending', 'available']),
      status: 'refunded',
      deleted: cmd.neq(true)
    })
    .limit(100)
    .get()

  const deletedRes = await db.collection('orders')
    .where({
      commissionStatus: cmd.in(['pending', 'available']),
      deleted: true
    })
    .limit(100)
    .get()

  const orders = [...(badRes.data || []), ...(deletedRes.data || [])]
  for (const order of orders) {
    let recRes = { data: [] }
    try {
      recRes = await db.collection('agent-commission-records')
        .where({ agentId: order.agentId, orderId: order._id })
        .get()
    } catch (e) {
      if (isMissingCollection(e)) continue
      throw e
    }
    const record = (recRes.data && recRes.data[0]) || null
    if (!record || record.status === 'void' || record.status === 'paid') continue

    const amount = round2(record.amount || 0)
    await db.collection('agent-commission-records').doc(record._id).update({
      status: 'void',
      remark: '订单退款/删除，佣金冲销'
    })

    const agentUpdate = { totalCommission: cmd.inc(-amount) }
    if (record.status === 'available') {
      agentUpdate.commissionBalance = cmd.inc(-amount)
    }
    await db.collection('users').doc(order.agentId).update(agentUpdate)
    const agentAfterRes = await db.collection('users').doc(order.agentId).get()
    const agentAfter = (agentAfterRes.data && agentAfterRes.data[0]) || {}

    await writeWalletLog({
      agentId: order.agentId,
      type: 'adjust',
      amount: -amount,
      balanceAfter: round2(agentAfter.commissionBalance || 0),
      recordId: record._id,
      remark: '订单退款/删除，佣金冲销'
    })

    await updateOrder(order._id, {
      commissionStatus: 'void',
      commissionAmount: 0,
      commissionRecordId: record._id,
      commissionTime: new Date()
    })
    voided++
  }
  return voided
}

exports.main = async (event, context) => {
  // 定时触发无 token；手动触发要求管理员
  if (event.token) {
    const admin = await verifyToken(db, getToken(event))
    if (!admin || admin.role !== 'admin') return fail('无权限', 403)
  }

  try {
    const config = await getConfig()
    if (!config.enabled) return ok({ processed: 0, created: 0, skipped: 0, voided: 0, disabled: true })

    const where = {
      agentId: cmd.neq(null),
      status: 'settled',
      commissionStatus: 'none',
      deleted: cmd.neq(true)
    }
    if (config.startAt && !isNaN(config.startAt.getTime())) {
      where.createTime = cmd.gte(config.startAt)
    }

    const ordersRes = await db.collection('orders')
      .where(where)
      .orderBy('createTime', 'asc')
      .limit(BATCH_SIZE)
      .get()
    const orders = ordersRes.data || []

    let created = 0
    let skipped = 0
    for (const order of orders) {
      const r = await processOrder(order, config)
      created += r.created || 0
      skipped += r.skipped || 0
    }

    const voided = await reconcileVoided()

    if (orders.length > 0 || voided > 0) {
      await db.collection('operation-logs').add({
        adminId: 'system', adminName: 'system',
        action: 'agent_commission_job', targetType: 'orders', targetId: '',
        detail: '佣金任务: 处理订单 ' + orders.length + ', 新增 ' + created + ', 跳过 ' + skipped + ', 冲销 ' + voided,
        createTime: new Date()
      })
    }

    return ok({
      processed: orders.length,
      created,
      skipped,
      voided,
      hasMore: orders.length >= BATCH_SIZE
    })
  } catch (e) {
    console.error('agent-commission-job error:', e)
    return fail(e.message || '服务器错误')
  }
}
