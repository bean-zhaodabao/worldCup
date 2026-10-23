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
export function syncMatches() {
  return request.post('/admin-match/sync')
}
// 同步健康状态（上次同步时间/错误），用于「同步停摆」告警
export function getSyncStatus() {
  return request.get('/admin-match/sync-status')
}
export function updateMatchOnline(id, online) {
  return request.patch('/admin-match/' + id + '/online', { online })
}
export function batchOnlineMatches(ids, online) {
  return request.post('/admin-match/online-batch', { ids, online })
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
export function followPlay(id) {
  return request.patch('/admin-play/' + id + '/follow')
}
export function stopPlay(id, stop) {
  return request.patch('/admin-play/' + id + '/stop', { stop })
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
export function deleteOrder(id) {
  return request.patch('/admin-order/' + id + '/delete')
}
export function batchDeleteOrders(ids) {
  return request.patch('/admin-order/batch-delete', { ids })
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
export function rechargeUser(id, amount, remark) {
  return request.post('/admin-user/' + id + '/recharge', { amount, remark })
}
export function updateUserStatus(id, status) {
  return request.patch('/admin-user/' + id + '/status', { status })
}

// ========== 提现审核 (admin-withdraw) ==========
export function getWithdrawList(params) {
  return request.get('/admin-withdraw', { params })
}
export function reviewWithdraw(id, approve, remark) {
  return request.patch('/admin-withdraw/' + id + '/review', { approve, remark })
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
  return request.post('/admin-config', data)
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

// ========== 代理商管理 (admin-agent) ==========
export function getAgentList(params) {
  return request.get('/admin-agent', { params })
}
export function createAgent(data) {
  return request.post('/admin-agent', data)
}
export function getAgentDetail(id) {
  return request.get('/admin-agent/' + id)
}
export function updateAgent(id, data) {
  return request.post('/admin-agent/' + id, data)
}
export function resetAgentPassword(id, password) {
  return request.post('/admin-agent/' + id + '/password', { password })
}
export function getAgentUsers(id, params) {
  return request.get('/admin-agent/' + id + '/users', { params })
}
export function getAgentOrders(id, params) {
  return request.get('/admin-agent/' + id + '/orders', { params })
}
export function getAgentCommission(id, params) {
  return request.get('/admin-agent/' + id + '/commission', { params })
}
export function rebindUserAgent(userId, agentId) {
  return request.post('/admin-agent/rebind-user', { userId, agentId })
}

// ========== 佣金结算 (admin-agent-commission) ==========
export function getCommissionList(params) {
  return request.get('/admin-agent-commission', { params })
}
export function confirmCommission(data) {
  return request.post('/admin-agent-commission/confirm', data)
}
export function recalcCommission() {
  return request.post('/admin-agent-commission/recalc')
}
export function getSettlementList(params) {
  return request.get('/admin-agent-commission/settlements', { params })
}
export function createSettlement(data) {
  return request.post('/admin-agent-commission/settlements', data)
}
export function markSettlementPaid(id, data) {
  return request.post('/admin-agent-commission/settlements/' + id + '/paid', data || {})
}

// ========== 短信通知 (admin-sms) ==========
export function getSmsConfig() {
  return request.get('/admin-sms/config')
}
export function updateSmsConfig(data) {
  return request.post('/admin-sms/config', data)
}
export function testSms(phone) {
  return request.post('/admin-sms/test', { phone })
}
export function getSmsLogs(params) {
  return request.get('/admin-sms/logs', { params })
}
export function retrySms(id) {
  return request.post('/admin-sms/retry/' + id, { taskId: id })
}
