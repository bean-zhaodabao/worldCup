'use strict'

// ============ CORS ============
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

/** 处理 OPTIONS 预检 —— 每个 URL 化云函数开头调用 */
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

/** 将普通结果包装为带 CORS 头的 HTTP 集成响应 (供 URL 化云函数使用) */
function wrap(data) {
  return {
    mpserverlessComposedResponse: true,
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify(data)
  }
}

// ============ 基础返回 (callFunction 用) ============
function success(data, message = 'success') {
  return { code: 0, data, message }
}

function fail(message = 'error', code = -1) {
  return { code, message }
}

// ============ URL 化返回 (HTTP 用，自动加 CORS 头) ============
function ok(data, message) { return wrap(success(data, message)) }
function err(message, code) { return wrap(fail(message, code)) }

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
    const expectedSign = require('crypto').createHash('md5').update(userId + ':' + timestamp + ':' + u.password).digest('hex').substring(0, 16)
    if (sign !== expectedSign) return null
    return { _id: u._id, username: u.username, role: u.role }
  } catch (e) { return null }
}

function generateToken(user) {
  const timestamp = Date.now()
  const sign = require('crypto').createHash('md5').update(user._id + ':' + timestamp + ':' + user.password).digest('hex').substring(0, 16)
  return Buffer.from(user._id + ':' + timestamp + ':' + sign).toString('base64')
}

// ============ 工具 ============
function generateOrderNo() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return 'WC' + now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + rand
}

async function writeLog(db, { adminId, adminName, action, targetType, targetId, detail, beforeData, afterData }) {
  await db.collection('operation-logs').add({
    adminId, adminName, action, targetType, targetId,
    detail: detail || '', beforeData: beforeData || null, afterData: afterData || null,
    createTime: new Date()
  })
}

module.exports = { success, fail, ok, err, wrap, handleOptions, verifyToken, generateToken, generateOrderNo, writeLog }
