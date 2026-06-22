/**
 * 串关购物车 - 跨页面共享的投注选择状态
 *
 * 规则：
 * - 一场比赛只能选一个玩法
 * - 串关必须来自不同场次（同一场比赛不能重复加入）
 * - 单关下注不走购物车，直接打开 bet-sheet
 */
import { reactive, computed } from 'vue'

const state = reactive({
  items: []
})

export const betCart = {
  items: state.items,

  /** 当前购物车中的玩法数量 */
  get count() {
    return state.items.length
  },

  /** 购物车中所有玩法的赔率乘积 */
  get totalOdds() {
    if (state.items.length === 0) return 0
    return state.items.reduce((acc, item) => acc * item.odds, 1)
  },

  /** 购物车中已包含的场次ID列表 */
  get matchIds() {
    return state.items.map(i => i.matchId)
  },

  /**
   * 加入购物车
   * @param {Object} entry
   * @param {string} entry.playId
   * @param {string} entry.playName
   * @param {string} entry.playLabel
   * @param {number} entry.odds
   * @param {string} entry.categoryName
   * @param {string} entry.bigCategoryName
   * @param {string} entry.matchId
   * @param {string} entry.matchName
   * @param {string} entry.teamA
   * @param {string} entry.teamB
   * @returns {{ ok: boolean, message?: string }}
   */
  add(entry) {
    // 同一场比赛不能重复加入
    if (state.items.some(i => i.matchId === entry.matchId)) {
      return { ok: false, message: '该场次已在串关列表中，请选择其他场次' }
    }
    state.items.push({
      playId: entry.playId,
      playName: entry.playName,
      playLabel: entry.playLabel || '',
      odds: entry.odds,
      categoryName: entry.categoryName || '',
      bigCategoryName: entry.bigCategoryName || '',
      matchId: entry.matchId,
      matchName: entry.matchName || '',
      teamA: entry.teamA || '',
      teamB: entry.teamB || ''
    })
    return { ok: true }
  },

  /** 从购物车移除指定玩法的项 */
  remove(playId) {
    const idx = state.items.findIndex(i => i.playId === playId)
    if (idx >= 0) state.items.splice(idx, 1)
  },

  /** 按场次ID移除 */
  removeByMatch(matchId) {
    const idx = state.items.findIndex(i => i.matchId === matchId)
    if (idx >= 0) state.items.splice(idx, 1)
  },

  /** 检查某场比赛是否已在购物车中 */
  hasMatch(matchId) {
    return state.items.some(i => i.matchId === matchId)
  },

  /** 清空购物车 */
  clear() {
    state.items.splice(0, state.items.length)
  },

  /** 获取所有 playId 列表（用于下单） */
  getPlayIds() {
    return state.items.map(i => i.playId)
  },

  /** 获取所有 matchId 列表 */
  getMatchIds() {
    return state.items.map(i => i.matchId)
  }
}
