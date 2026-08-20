'use strict'

function ok(data, message) { return { code: 0, data, message: message || 'success' } }
function err(message, code) { return { code: code || -1, message } }

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
    if (u.role !== 'admin') return null
    const crypto = require('crypto')
    const expectedSign = crypto.createHash('md5').update(userId + ':' + timestamp + ':' + u.password).digest('hex').substring(0, 16)
    if (sign !== expectedSign) return null
    return { _id: u._id, username: u.username, role: u.role }
  } catch (e) { return null }
}

async function writeLog(db, data) {
  await db.collection('operation-logs').add(Object.assign({ createTime: new Date() }, data, { beforeData: data.beforeData || null, afterData: data.afterData || null }))
}

module.exports = { ok, err, verifyToken, writeLog }
