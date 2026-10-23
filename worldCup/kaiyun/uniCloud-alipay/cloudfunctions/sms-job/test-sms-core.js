'use strict'
// 本地运行: node test-sms-core.js
const assert = require('assert')
const { percentEncode, normalizePhones, maskPhone, buildSignedUrl } = require('./sms-core')

assert.strictEqual(percentEncode('a b!'), 'a%20b%21')
assert.deepStrictEqual(normalizePhones('13800138000, 13900139000'), ['13800138000', '13900139000'])
assert.deepStrictEqual(normalizePhones('+86 13800138000'), ['13800138000'])
assert.deepStrictEqual(normalizePhones('123,13800138000'), ['13800138000'])
assert.strictEqual(maskPhone('13800138000'), '138****8000')

const url = buildSignedUrl({
  accessKeyId: 'test-id',
  accessKeySecret: 'test-secret',
  phoneNumbers: ['13800138000'],
  signName: '测试签名',
  templateCode: 'SMS_123456',
  templateParam: { name: 'user001' },
  timestamp: '2026-10-23T00:00:00Z',
  signatureNonce: 'fixednonce'
})
assert.ok(url.indexOf('https://dysmsapi.aliyuncs.com/?Signature=') === 0)
assert.ok(url.indexOf('Action=SendSms') > -1)
assert.ok(url.indexOf('PhoneNumbers=13800138000') > -1)
assert.ok(url.indexOf('TemplateParam=') > -1)

console.log('sms-core tests passed')
