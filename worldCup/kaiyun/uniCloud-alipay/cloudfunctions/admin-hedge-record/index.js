'use strict'
// @url /admin/hedge-records
// 对冲记账: 独立手工台账，不关联订单/赛事/用户
const db = uniCloud.database()
const { ok, err, verifyToken, writeLog } = require('./utils')

const COLLECTION = 'hedge-records'

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : NaN
}

function parseAmount(value, name, allowNegative) {
  const n = toNumber(value, 0)
  if (!Number.isFinite(n)) throw new Error(name + '必须是数字')
  if (!allowNegative && n < 0) throw new Error(name + '不能为负数')
  return round2(n)
}

function parseRecordDate(value) {
  if (!value) return new Date()
  const s = String(value)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s)
  if (isNaN(d.getTime())) throw new Error('记账日期格式不正确')
  return d
}

function parseQueryDate(value, endOfDay) {
  if (!value) return null
  const s = String(value)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? new Date(s + (endOfDay ? 'T23:59:59.999' : 'T00:00:00'))
    : new Date(s)
  if (isNaN(d.getTime())) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    if (endOfDay) d.setHours(23, 59, 59, 999)
    else d.setHours(0, 0, 0, 0)
  }
  return d
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function trim(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function buildWhere(query) {
  const where = { deleted: db.command.neq(true) }

  const start = parseQueryDate(query.startDate, false)
  const end = parseQueryDate(query.endDate, true)
  if (start && end) where.recordDate = db.command.gte(start).and(db.command.lte(end))
  else if (start) where.recordDate = db.command.gte(start)
  else if (end) where.recordDate = db.command.lte(end)

  if (query.platform) where.platform = new RegExp(escapeRegExp(trim(query.platform)), 'i')

  if (query.keyword) {
    const reg = new RegExp(escapeRegExp(trim(query.keyword)), 'i')
    where.$or = [{ title: reg }, { platform: reg }, { remark: reg }]
  }

  return where
}

async function fetchAll(where) {
  const pageSize = 500
  const maxRows = 50000
  let skip = 0
  let all = []
  while (skip < maxRows) {
    const res = await db.collection(COLLECTION)
      .where(where)
      .orderBy('createTime', 'asc')
      .skip(skip)
      .limit(pageSize)
      .get()
    const data = res.data || []
    all = all.concat(data)
    if (data.length < pageSize) break
    skip += pageSize
  }
  return all
}

function calcSummary(records) {
  const summary = {
    betTotal: 0,
    hedgeTotal: 0,
    unhedgedTotal: 0,
    unhedgedProfitTotal: 0,
    rebateTotal: 0,
    totalProfit: 0,
    count: records.length
  }
  records.forEach(r => {
    summary.betTotal += Number(r.betAmount) || 0
    summary.hedgeTotal += Number(r.hedgeAmount) || 0
    summary.unhedgedTotal += Number(r.unhedgedAmount) || 0
    summary.unhedgedProfitTotal += Number(r.unhedgedProfit) || 0
    summary.rebateTotal += Number(r.hedgeRebate) || 0
    summary.totalProfit += Number(r.totalProfit) || 0
  })
  Object.keys(summary).forEach(k => {
    if (k !== 'count') summary[k] = round2(summary[k])
  })
  return summary
}

function buildRecord(body, admin) {
  const betAmount = parseAmount(body.betAmount, '下注金额', false)
  const hedgeAmount = parseAmount(body.hedgeAmount, '对冲金额', false)
  const unhedgedProfit = parseAmount(body.unhedgedProfit, '未对冲盈亏', true)
  const hedgeRebate = parseAmount(body.hedgeRebate, '对冲返现', true)

  return {
    recordDate: parseRecordDate(body.recordDate),
    title: trim(body.title),
    platform: trim(body.platform),
    betAmount,
    hedgeAmount,
    unhedgedAmount: round2(betAmount - hedgeAmount),
    unhedgedProfit,
    hedgeRebate,
    totalProfit: round2(unhedgedProfit + hedgeRebate),
    remark: trim(body.remark),
    operatorId: admin._id,
    operatorName: admin.username,
    deleted: false,
    createTime: new Date(),
    updateTime: new Date()
  }
}

exports.main = async (event, context) => {
  const token = (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const method = event.httpMethod || 'GET'
  const body = event.body ? JSON.parse(event.body) : {}
  const query = event.queryStringParameters || {}
  const path = event.path || ''

  try {
    // ============ GET /summary - 汇总 ============
    if (method === 'GET' && path.includes('/summary')) {
      const where = buildWhere(query)
      const records = await fetchAll(where)
      return ok(calcSummary(records))
    }

    // ============ GET - 列表 ============
    if (method === 'GET') {
      const page = Math.max(1, parseInt(query.page, 10) || 1)
      const pageSize = Math.min(200, Math.max(1, parseInt(query.pageSize, 10) || 20))
      const where = buildWhere(query)

      const total = await db.collection(COLLECTION).where(where).count()
      const res = await db.collection(COLLECTION)
        .where(where)
        .orderBy('recordDate', 'desc')
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      return ok({
        list: res.data || [],
        total: total.total,
        page,
        pageSize
      })
    }

    // ============ POST - 新增 ============
    if (method === 'POST') {
      const record = buildRecord(body, admin)
      const res = await db.collection(COLLECTION).add(record)
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'create_hedge_record', targetType: COLLECTION, targetId: res.id,
        detail: '新增对冲记账: 下注 ' + record.betAmount.toFixed(2) + ' / 对冲 ' + record.hedgeAmount.toFixed(2) + ' / 总盈亏 ' + record.totalProfit.toFixed(2),
        afterData: record
      })
      return ok({ _id: res.id }, '记账成功')
    }

    // ============ PUT - 编辑 ============
    if (method === 'PUT') {
      const id = path.split('/').pop()
      if (!id) return err('缺少记录ID')

      const existingRes = await db.collection(COLLECTION).doc(id).get()
      const existing = (existingRes.data && existingRes.data[0]) || null
      if (!existing || existing.deleted) return err('记录不存在')

      const betAmount = parseAmount(body.betAmount !== undefined ? body.betAmount : existing.betAmount, '下注金额', false)
      const hedgeAmount = parseAmount(body.hedgeAmount !== undefined ? body.hedgeAmount : existing.hedgeAmount, '对冲金额', false)
      const unhedgedProfit = parseAmount(body.unhedgedProfit !== undefined ? body.unhedgedProfit : existing.unhedgedProfit, '未对冲盈亏', true)
      const hedgeRebate = parseAmount(body.hedgeRebate !== undefined ? body.hedgeRebate : existing.hedgeRebate, '对冲返现', true)

      const updateData = {
        recordDate: body.recordDate !== undefined ? parseRecordDate(body.recordDate) : existing.recordDate,
        title: body.title !== undefined ? trim(body.title) : (existing.title || ''),
        platform: body.platform !== undefined ? trim(body.platform) : (existing.platform || ''),
        betAmount,
        hedgeAmount,
        unhedgedAmount: round2(betAmount - hedgeAmount),
        unhedgedProfit,
        hedgeRebate,
        totalProfit: round2(unhedgedProfit + hedgeRebate),
        remark: body.remark !== undefined ? trim(body.remark) : (existing.remark || ''),
        updateTime: new Date()
      }

      await db.collection(COLLECTION).doc(id).update(updateData)
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'update_hedge_record', targetType: COLLECTION, targetId: id,
        detail: '编辑对冲记账: 下注 ' + betAmount.toFixed(2) + ' / 对冲 ' + hedgeAmount.toFixed(2) + ' / 总盈亏 ' + updateData.totalProfit.toFixed(2),
        beforeData: {
          betAmount: existing.betAmount,
          hedgeAmount: existing.hedgeAmount,
          unhedgedProfit: existing.unhedgedProfit,
          hedgeRebate: existing.hedgeRebate,
          totalProfit: existing.totalProfit
        },
        afterData: updateData
      })
      return ok(null, '已保存')
    }

    // ============ DELETE - 逻辑删除 ============
    if (method === 'DELETE') {
      const id = path.split('/').pop()
      if (!id) return err('缺少记录ID')

      const existingRes = await db.collection(COLLECTION).doc(id).get()
      const existing = (existingRes.data && existingRes.data[0]) || null
      if (!existing || existing.deleted) return err('记录不存在')

      await db.collection(COLLECTION).doc(id).update({ deleted: true, updateTime: new Date() })
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'delete_hedge_record', targetType: COLLECTION, targetId: id,
        detail: '删除对冲记账: 下注 ' + Number(existing.betAmount || 0).toFixed(2) + ' / 对冲 ' + Number(existing.hedgeAmount || 0).toFixed(2),
        beforeData: existing
      })
      return ok(null, '已删除')
    }

    return err('不支持的请求方法', 405)
  } catch (e) {
    console.error('admin-hedge-record error:', e)
    return err(e.message || '服务器错误')
  }
}
