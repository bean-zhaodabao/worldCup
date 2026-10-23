export function getAgentInfo() {
  try {
    return JSON.parse(uni.getStorageSync('userInfo') || '{}')
  } catch (e) {
    return {}
  }
}

export function checkAgent() {
  const info = getAgentInfo()
  if (!uni.getStorageSync('token') || info.role !== 'agent') {
    uni.reLaunch({ url: '/pages/login/login' })
    return null
  }
  return info
}

export function getToken() {
  return uni.getStorageSync('token')
}

export function formatTime(t) {
  if (!t) return ''
  const d = new Date(t)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

export function money(n) {
  return Number(n || 0).toFixed(2)
}

export const statusMap = {
  pending: '待开奖',
  won: '已中奖',
  lost: '未中奖',
  settled: '已结算',
  refunded: '已退款'
}

export const commissionStatusMap = {
  pending: '待确认',
  available: '可结算',
  paid: '已支付',
  void: '已冲销'
}
