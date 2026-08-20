/**
 * 串关购物车 - 跨页面共享的投注选择状态
 *
 * 规则（2026-08-20 客户确认）:
 * - 串关 2~8 场, 同场只能选 1 个玩法(同一场比赛不能重复加入)
 * - 不同玩法类型可混合(胜平负/让球/比分/总进球/半全场/让球盘/大小球)
 * - 赔率相乘, 全中方赢; 下单时以服务端实时赔率为准
 */
import { reactive, computed } from 'vue'

export const MAX_PARLAY = 8

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
   * @param {number} entry.odds - 十进制赔率(水位玩法=1+水位)
   * @param {string} entry.water - 水位显示(如0.85), 盘口玩法才有
   * @param {number} entry.handicap - 盘口数值
   * @param {string} entry.sourceKey - 接口玩法键
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
    // 最多8场
    if (state.items.length >= MAX_PARLAY) {
      return { ok: false, message: '串关最多 ' + MAX_PARLAY + ' 场' }
    }
    state.items.push({
      playId: entry.playId,
      playName: entry.playName,
      playLabel: entry.playLabel || '',
      odds: entry.odds,
      water: entry.water || '',
      handicap: entry.handicap,
      sourceKey: entry.sourceKey || '',
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

  /** 更新指定 play 的赔率（赔率变化时由外部调用） */
  updateOdds(playId, newOdds, newWater) {
    const item = state.items.find(i => i.playId === playId)
    if (!item) return false
    if (item.odds !== newOdds || (newWater !== undefined && item.water !== newWater)) {
      item.odds = newOdds
      if (newWater !== undefined) item.water = newWater
      return true // 表示有变化
    }
    return false
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
