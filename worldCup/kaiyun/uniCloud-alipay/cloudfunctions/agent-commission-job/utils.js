'use strict'

const DAY_MS = 24 * 60 * 60 * 1000
const CN_OFFSET_MS = 8 * 60 * 60 * 1000

function ok(data, msg) { return { code: 0, data, message: msg || 'success' } }
function fail(msg, code) { return { code: code || -1, message: msg || 'error' } }

async function verifyToken(db, token) {
  if (!token) return null
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8')
    const parts = decoded.split(':')
    if (parts.length !== 3) return null
    const [userId, timestamp, sign] = parts
    if (Date.now() - parseInt(timestamp) > 24 * 60 * 60 * 1000) return null
    const user = await db.collection('users').doc(userId).get()
    if (!user.data || user.data.length === 0) return null
    const u = user.data[0]
    const crypto = require('crypto')
    const expected = crypto.createHash('md5').update(userId + ':' + timestamp + ':' + u.password).digest('hex').substring(0, 16)
    if (sign !== expected) return null
    return { _id: u._id, username: u.username, role: u.role, status: u.status }
  } catch (e) { return null }
}

async function verifyAgent(db, token) {
  const user = await verifyToken(db, token)
  if (!user || user.role !== 'agent' || user.status !== 'active') return null
  return user
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100 }

// 北京时间当天 00:00
function cnTodayStart() {
  const now = new Date()
  const cn = new Date(now.getTime() + CN_OFFSET_MS)
  return new Date(Date.UTC(cn.getUTCFullYear(), cn.getUTCMonth(), cn.getUTCDate()) - CN_OFFSET_MS)
}

function cnDateKey(value) {
  const d = new Date(value)
  const cn = new Date(d.getTime() + CN_OFFSET_MS)
  return cn.toISOString().slice(0, 10)
}

// 分页取全量，避免 uniCloud 单次 get 条数限制
async function fetchAll(collection, where, field, pageSize) {
  pageSize = pageSize || 500
  let page = 0
  let all = []
  while (page < 20) {
    let q = collection.where(where)
    if (field) q = q.field(field)
    const res = await q.skip(page * pageSize).limit(pageSize).get()
    const list = res.data || []
    all = all.concat(list)
    if (list.length < pageSize) break
    page++
  }
  return all
}

async function getAgentUserIds(db, agentId) {
  const users = await fetchAll(db.collection('users'), { agentId, role: 'user' }, { _id: true })
  return users.map(u => u._id).filter(Boolean)
}

function getToken(event) {
  return event.token || (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
}

module.exports = {
  DAY_MS, CN_OFFSET_MS, ok, fail, verifyToken, verifyAgent,
  round2, cnTodayStart, cnDateKey, fetchAll, getAgentUserIds, getToken
}
