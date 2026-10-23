'use strict'
// 阿里云短信 SendSms 调用（RPC 签名，无第三方依赖）
const https = require('https')
const crypto = require('crypto')

function percentEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function normalizePhones(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(/[,，;\s]+/)
  const out = []
  for (let p of raw) {
    p = String(p || '').trim().replace(/[\s-]/g, '')
    if (p.indexOf('+86') === 0) p = p.slice(3)
    if (/^1[3-9]\d{9}$/.test(p) && out.indexOf(p) === -1) out.push(p)
  }
  return out
}

function maskPhone(phone) {
  const p = String(phone || '')
  if (/^1[3-9]\d{9}$/.test(p)) return p.slice(0, 3) + '****' + p.slice(7)
  return p ? p.slice(0, 3) + '****' : ''
}

function maskPhones(phones) {
  return normalizePhones(phones).map(maskPhone).join(',')
}

function buildSignedUrl(options) {
  const params = {
    AccessKeyId: options.accessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    RegionId: options.regionId || 'cn-hangzhou',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: options.signatureNonce || crypto.randomBytes(16).toString('hex'),
    SignatureVersion: '1.0',
    Timestamp: options.timestamp || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25',
    PhoneNumbers: normalizePhones(options.phoneNumbers).join(','),
    SignName: options.signName,
    TemplateCode: options.templateCode
  }
  if (options.templateParam && Object.keys(options.templateParam).length > 0) {
    params.TemplateParam = JSON.stringify(options.templateParam)
  }
  if (options.outId) params.OutId = String(options.outId).slice(0, 256)

  const canonical = Object.keys(params)
    .sort()
    .map(key => percentEncode(key) + '=' + percentEncode(params[key]))
    .join('&')
  const stringToSign = 'GET&' + percentEncode('/') + '&' + percentEncode(canonical)
  const signature = crypto.createHmac('sha1', options.accessKeySecret + '&')
    .update(stringToSign)
    .digest('base64')

  return 'https://dysmsapi.aliyuncs.com/?Signature=' + percentEncode(signature) + '&' + canonical
}

function sendSms(options) {
  return new Promise(resolve => {
    const phones = normalizePhones(options.phoneNumbers)
    if (phones.length === 0) {
      return resolve({ success: false, code: 'INVALID_PHONE', message: '手机号格式不正确' })
    }
    if (!options.accessKeyId || !options.accessKeySecret) {
      return resolve({ success: false, code: 'NO_ACCESS_KEY', message: '未配置 AccessKey' })
    }
    if (!options.signName || !options.templateCode) {
      return resolve({ success: false, code: 'NO_TEMPLATE', message: '未配置短信签名或模板' })
    }

    const url = buildSignedUrl(Object.assign({}, options, { phoneNumbers: phones }))
    const req = https.get(url, {
      timeout: options.timeout || 10000,
      headers: {
        'User-Agent': 'worldcup-sms/1.0',
        Accept: 'application/json'
      }
    }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        let data = null
        try { data = JSON.parse(body) } catch (e) { }
        if (!data) {
          return resolve({
            success: false,
            code: 'BAD_RESPONSE',
            message: '阿里云返回格式异常: ' + String(body).slice(0, 200)
          })
        }
        resolve({
          success: data.Code === 'OK',
          code: data.Code || '',
          message: data.Message || '',
          requestId: data.RequestId || '',
          bizId: data.BizId || '',
          raw: data
        })
      })
    })
    req.on('timeout', () => req.destroy(new Error('请求阿里云超时')))
    req.on('error', err => {
      resolve({ success: false, code: 'NETWORK_ERROR', message: err.message || '网络错误' })
    })
  })
}

module.exports = {
  percentEncode,
  normalizePhones,
  maskPhone,
  maskPhones,
  buildSignedUrl,
  sendSms
}
