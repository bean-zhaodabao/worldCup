import request from '@/utils/request'

// ========== 登录 ==========
export function login(data) {
  return request.post('/admin-login', data)
}

// ========== 赛事管理 (admin-match) ==========
export function getMatchList(params) {
  return request.get('/admin-match', { params })
}
export function createMatch(data) {
  return request.post('/admin-match', data)
}
export function updateMatch(id, data) {
  return request.put('/admin-match/' + id, data)
}
export function deleteMatch(id) {
  return request.delete('/admin-match/' + id)
}
export function updateMatchStatus(id, status) {
  return request.patch('/admin-match/' + id, { status })
}

// ========== 玩法分类 (admin-category) ==========
export function getCategoryTree() {
  return request.get('/admin-category')
}
export function createCategory(data) {
  return request.post('/admin-category', data)
}
export function updateCategory(id, data) {
  return request.put('/admin-category/' + id, data)
}
export function deleteCategory(id) {
  return request.delete('/admin-category/' + id)
}

// ========== 玩法管理 (admin-play) ==========
export function getPlayList(params) {
  return request.get('/admin-play', { params })
}
export function createPlay(data) {
  return request.post('/admin-play', data)
}
export function updatePlay(id, data) {
  return request.put('/admin-play/' + id, data)
}
export function deletePlay(id) {
  return request.delete('/admin-play/' + id)
}
export function setPlayWin(id, isWin) {
  return request.patch('/admin-play/' + id + '/win', { isWin })
}
export function batchUpdateOdds(ids, odds) {
  return request.patch('/admin-play/odds', { ids, odds })
}
export function copyPlays(fromMatchId, toMatchId) {
  return request.post('/admin-play/copy', { fromMatchId, toMatchId })
}

// ========== 订单管理 (admin-order) ==========
export function getOrderList(params) {
  return request.get('/admin-order', { params })
}
export function getOrderDetail(id) {
  return request.get('/admin-order/' + id)
}
export function getOrderStats(params) {
  return request.get('/admin-order/stats', { params })
}

// ========== 用户管理 (admin-user) ==========
export function getUserList(params) {
  return request.get('/admin-user', { params })
}
export function createUser(data) {
  return request.post('/admin-user', data)
}
export function resetUserPassword(id, password) {
  return request.patch('/admin-user/' + id + '/password', { password })
}
export function deleteUser(id) {
  return request.delete('/admin-user/' + id)
}

// ========== 结算 (admin-settle) ==========
export function settleMatch(matchId) {
  return request.post('/admin-settle/' + matchId + '/settle')
}

// ========== 操作日志 (admin-log) ==========
export function getLogList(params) {
  return request.get('/admin-log', { params })
}

// ========== 系统配置 (admin-config) ==========
export function getSystemConfig() {
  return request.get('/admin-config')
}
export function updateSystemConfig(data) {
  return request.put('/admin-config', data)
}

// ========== 报表 (admin-report) ==========
export function getDashboardStats() {
  return request.get('/admin-report/dashboard')
}
export function getDailyReport(params) {
  return request.get('/admin-report/daily', { params })
}
export function getMatchReport(params) {
  return request.get('/admin-report/match', { params })
}
export function getPlayReport(params) {
  return request.get('/admin-report/play', { params })
}
export function getProfitReport(params) {
  return request.get('/admin-report/profit', { params })
}
