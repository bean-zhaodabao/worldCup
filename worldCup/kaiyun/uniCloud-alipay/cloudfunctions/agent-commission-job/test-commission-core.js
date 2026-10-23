'use strict'
// 本地运行: node test-commission-core.js
const assert = require('assert')
const { round2, calcCommission, shouldCommission } = require('./commission-core')

assert.strictEqual(round2(2.345), 2.35)
assert.strictEqual(calcCommission(100, 2.5), 2.5)
assert.strictEqual(calcCommission(99.99, 2.5), 2.5)
assert.strictEqual(calcCommission(100, 0), 0)
assert.strictEqual(calcCommission(0, 2.5), 0)
assert.strictEqual(calcCommission(-100, 2.5), 0)

const base = { agentId: 'a1', status: 'settled', deleted: false, commissionStatus: 'none', createTime: new Date() }
assert.strictEqual(shouldCommission(base, {}), true)
assert.strictEqual(shouldCommission(Object.assign({}, base, { agentId: null }), {}), false)
assert.strictEqual(shouldCommission(Object.assign({}, base, { status: 'pending' }), {}), false)
assert.strictEqual(shouldCommission(Object.assign({}, base, { deleted: true }), {}), false)
assert.strictEqual(shouldCommission(Object.assign({}, base, { commissionStatus: 'pending' }), {}), false)
assert.strictEqual(shouldCommission(Object.assign({}, base, { createTime: new Date('2026-01-01') }), { startAt: new Date('2026-06-01') }), false)

console.log('commission-core tests passed')
