'use strict'

function ok(data, msg) { return { code: 0, data, message: msg || 'success' } }
function err(msg, code) { return { code: code || -1, message: msg || 'error' } }

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
    return { _id: u._id, username: u.username, role: u.role }
  } catch (e) { return null }
}

function generateToken(user) {
  const timestamp = Date.now()
  const crypto = require('crypto')
  const sign = crypto.createHash('md5').update(user._id + ':' + timestamp + ':' + user.password).digest('hex').substring(0, 16)
  return Buffer.from(user._id + ':' + timestamp + ':' + sign).toString('base64')
}

async function writeLog(db, opt) {
  await db.collection('operation-logs').add({
    adminId: opt.adminId, adminName: opt.adminName,
    action: opt.action, targetType: opt.targetType, targetId: opt.targetId,
    detail: opt.detail || '', beforeData: opt.beforeData || null, afterData: opt.afterData || null,
    createTime: new Date()
  })
}

module.exports = { ok, err, verifyToken, generateToken, writeLog }
