'use strict'

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * 按流水计算佣金
 * @param {number} betAmount 订单下注额
 * @param {number} rate 佣金比例，单位百分比（2.5 表示 2.5%）
 */
function calcCommission(betAmount, rate) {
  const amount = Number(betAmount) || 0
  const r = Number(rate) || 0
  if (amount <= 0 || r <= 0) return 0
  return round2(amount * r / 100)
}

/**
 * 判断订单是否应参与计佣
 * @param {object} order
 * @param {object} options { startAt: Date|null }
 */
function shouldCommission(order, options) {
  options = options || {}
  if (!order) return false
  if (!order.agentId) return false
  if (order.status !== 'settled') return false
  if (order.deleted === true) return false
  if (order.commissionStatus && order.commissionStatus !== 'none') return false
  if (options.startAt && new Date(order.createTime).getTime() < options.startAt.getTime()) return false
  return true
}

module.exports = { round2, calcCommission, shouldCommission }
