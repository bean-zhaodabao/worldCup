'use strict'

// ============ CORS ============
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

function handleOptions(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      mpserverlessComposedResponse: true,
      statusCode: 200,
      headers: CORS_HEADERS,
      body: ''
    }
  }
  return null
}

function wrap(data) {
  return {
    mpserverlessComposedResponse: true,
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify(data)
  }
}

function ok(data, message) { return wrap({ code: 0, data, message: message || 'success' }) }
function err(message, code) { return wrap({ code: code || -1, message: message || 'error' }) }

// ============ Token ============
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
    const expectedSign = crypto.createHash('md5').update(userId + ':' + timestamp + ':' + u.password).digest('hex').substring(0, 16)
    if (sign !== expectedSign) return null
    return { _id: u._id, username: u.username, role: u.role }
  } catch (e) { return null }
}

function generateToken(user) {
  const timestamp = Date.now()
  const crypto = require('crypto')
  const sign = crypto.createHash('md5').update(user._id + ':' + timestamp + ':' + user.password).digest('hex').substring(0, 16)
  return Buffer.from(user._id + ':' + timestamp + ':' + sign).toString('base64')
}

// ============ 工具 ============
async function writeLog(db, { adminId, adminName, action, targetType, targetId, detail, beforeData, afterData }) {
  await db.collection('operation-logs').add({
    adminId, adminName, action, targetType, targetId,
    detail: detail || '', beforeData: beforeData || null, afterData: afterData || null,
    createTime: new Date()
  })
}

module.exports = { ok, err, handleOptions, verifyToken, generateToken, writeLog }
