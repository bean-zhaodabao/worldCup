'use strict'
/**
 * odds-core — 竞彩赔率/盘口的纯计算模块(无 uniCloud 依赖, 可单元测试)
 * 包含: 盘口解析/合并、玩法构建、结算结果判定、结算系数
 */

function round2(n) { return Math.round(n * 100) / 100 }

// ==================== 盘口工具 ====================

/** 中文盘口 -> 盘口绝对值, 如 一球/一球半 -> 1.25, 受半球/一球 -> 0.75 (支持"受/受让"前缀) */
const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 7: 7, 八: 8, 九: 9, 十: 10 }
function parsePankou(text) {
  if (!text) return null
  const t = String(text).trim().replace(/^受让/, '').replace(/^受/, '')
  const parts = t.split('/')
  let sum = 0
  for (const p of parts) {
    let v = null
    if (p === '平手') v = 0
    else if (p === '半球') v = 0.5
    else {
      const m = p.match(/^([一二三四五六七八九十]+)球(半)?$/)
      if (!m) return null
      v = CN_NUM[m[1]] + (m[2] ? 0.5 : 0)
    }
    sum += v
  }
  return round2(sum / parts.length)
}

/** 是否为"受让"盘口(主队受让, 盘口为正), 如 受半球、受让半球/一球 */
function isReceivePankou(text) {
  return /^(受让|受)/.test(String(text || '').trim())
}

/**
 * 合并指定公司的盘口: 相同盘口去重, 每侧保留最低水位
 * @param companies asia[]/dxq[] 原始数组
 * @param keepIds 参与合并的公司ID(默认 8/12/14)
 * @returns [{ pankou, line, home, away }] home/away 为水位
 */
function mergePankou(companies, keepIds) {
  keepIds = keepIds || [8, 12, 14]
  const map = new Map()
  for (const c of companies) {
    if (!keepIds.includes(c.companyId)) continue
    const pk = c.pankou
    if (!pk) continue
    const h = parseFloat(c.odds && c.odds[0])
    const a = parseFloat(c.odds && c.odds[1])
    if (!isFinite(h) || !isFinite(a)) continue
    if (!map.has(pk)) {
      map.set(pk, { pankou: pk, line: parsePankou(pk), receive: isReceivePankou(pk), home: h, away: a })
    } else {
      const m = map.get(pk)
      m.home = Math.min(m.home, h)
      m.away = Math.min(m.away, a)
    }
  }
  return Array.from(map.values()).filter(m => m.line !== null)
}

// ==================== 玩法构建 ====================

const BF_NAMES = {
  sw10: '1:0', sw20: '2:0', sw21: '2:1', sw30: '3:0', sw31: '3:1', sw32: '3:2',
  sw40: '4:0', sw41: '4:1', sw42: '4:2', sw50: '5:0', sw51: '5:1', sw52: '5:2',
  sw5: '胜其他',
  sd00: '0:0', sd11: '1:1', sd22: '2:2', sd33: '3:3', sd4: '平其他',
  sl01: '0:1', sl02: '0:2', sl03: '0:3', sl04: '0:4', sl05: '0:5',
  sl12: '1:2', sl13: '1:3', sl14: '1:4', sl15: '1:5',
  sl23: '2:3', sl24: '2:4', sl25: '2:5', sl5: '负其他'
}
const BF_KEYS = Object.keys(BF_NAMES)

const BQC_NAMES = { ht33: '胜胜', ht31: '胜平', ht30: '胜负', ht13: '平胜', ht11: '平平', ht10: '平负', ht03: '负胜', ht01: '负平', ht00: '负负' }
const BQC_KEYS = Object.keys(BQC_NAMES)

/** 合并互斥选项的公平赔率: 1 / Σ(1/oi) */
function combineOdds(arr) {
  let s = 0
  for (const o of arr) {
    if (!o || o <= 0 || !isFinite(o)) return null
    s += 1 / o
  }
  return s > 0 ? round2(1 / s) : null
}

function lastOf(oddsArr) { return (oddsArr && oddsArr.length) ? oddsArr[oddsArr.length - 1] : null }

/**
 * 由 sporttery.data 构建竞彩玩法列表
 * 返回 [{ sourceKey, name, odds, stop, categoryName, sort, handicap, oddsSource, oddsFirst, oddsStat }]
 */
function buildSportteryPlays(data) {
  const plays = []
  const push = (sourceKey, name, categoryName, sort, odds, extra) => {
    if (odds === null || odds === undefined || !isFinite(odds)) return
    plays.push(Object.assign({
      sourceKey, name, categoryName, sort,
      odds: round2(odds),
      oddsSource: round2(odds),
      stop: false
    }, extra || {}))
  }

  // 1. 胜平负 spf0=负 spf1=平 spf3=胜(主胜)
  if (data.spf) {
    const latest = lastOf(data.spf.odds)
    const first = data.spf.odds && data.spf.odds[0]
    const stat = { frist: data.spf.frist, last: data.spf.last, max: data.spf.max, min: data.spf.min, changeCount: data.spf.changeCount }
    if (latest) {
      push('spf:3', '胜', '胜平负', 1, latest.spf3, { oddsFirst: first ? round2(first.spf3) : null, oddsStat: stat })
      push('spf:1', '平', '胜平负', 2, latest.spf1, { oddsFirst: first ? round2(first.spf1) : null, oddsStat: stat })
      push('spf:0', '负', '胜平负', 3, latest.spf0, { oddsFirst: first ? round2(first.spf0) : null, oddsStat: stat })
    }
  }

  // 2. 让球胜平负, goal=让球数(负=主让)
  if (data.rqspf) {
    const goal = parseFloat(data.goal) || 0
    const latest = lastOf(data.rqspf.odds)
    const first = data.rqspf.odds && data.rqspf.odds[0]
    const stat = { frist: data.rqspf.frist, last: data.rqspf.last, max: data.rqspf.max, min: data.rqspf.min, changeCount: data.rqspf.changeCount }
    if (latest) {
      push('rqspf:3@' + goal, '让球胜', '让球胜平负', 1, latest.rq3, { handicap: goal, oddsFirst: first ? round2(first.rq3) : null, oddsStat: stat })
      push('rqspf:1@' + goal, '让球平', '让球胜平负', 2, latest.rq1, { handicap: goal, oddsFirst: first ? round2(first.rq1) : null, oddsStat: stat })
      push('rqspf:0@' + goal, '让球负', '让球胜平负', 3, latest.rq0, { handicap: goal, oddsFirst: first ? round2(first.rq0) : null, oddsStat: stat })
    }
  }

  // 3. 正确比分 31项
  if (data.bf) {
    const stop = data.bf.stop === true
    BF_KEYS.forEach((k, i) => {
      push('bf:' + k, BF_NAMES[k], '正确比分', i + 1, data.bf[k], { stop })
    })
  }

  // 4. 总进球数区间: 0-1 / 2-3 / 4+ (由官方t0..t7派生)
  if (data.jq) {
    const stop = data.jq.stop === true
    push('jq:r01', '0-1球', '总进球数区间', 1, combineOdds([data.jq.t0, data.jq.t1]), { stop })
    push('jq:r23', '2-3球', '总进球数区间', 2, combineOdds([data.jq.t2, data.jq.t3]), { stop })
    push('jq:r4', '4+球', '总进球数区间', 3, combineOdds([data.jq.t4, data.jq.t5, data.jq.t6, data.jq.t7]), { stop })
  }

  // 5. 半全场 9项
  if (data.bqc) {
    const stop = data.bqc.stop === true
    BQC_KEYS.forEach((k, i) => {
      push('bqc:' + k, BQC_NAMES[k], '半全场胜平负', i + 1, data.bqc[k], { stop })
    })
  }

  return plays
}

/** 由合并后的盘口构建玩法: 让球盘(主/客)、大小球(大/小), 水位转十进制赔率
 *  让球盘盘口带符号: 主让为负(一球半=-1.5), 主受让为正(受半球/一球=+0.75)
 */
function buildPankouPlays(merged, type) {
  const plays = []
  // 排序: 让球盘按带符号盘口升序(主让最多在前, 受让在后); 大小球按盘口升序
  const sorted = merged.slice().sort((a, b) => {
    const va = type === 'asia' ? (a.receive ? a.line : -a.line) : a.line
    const vb = type === 'asia' ? (b.receive ? b.line : -b.line) : b.line
    return va - vb
  })
  sorted.forEach((m, i) => {
    // 带符号盘口: 让球盘主让为负/受让为正; 大小球恒为正
    const signed = type === 'asia' ? (m.receive ? m.line : -m.line) : m.line
    const handicap = signed
    if (type === 'asia') {
      plays.push({ sourceKey: 'asia:home@' + signed, name: '主', categoryName: '让球盘', sort: i * 2 + 1, odds: round2(1 + m.home), oddsSource: round2(1 + m.home), water: String(m.home), side: 'home', handicap, stop: false })
      plays.push({ sourceKey: 'asia:away@' + signed, name: '客', categoryName: '让球盘', sort: i * 2 + 2, odds: round2(1 + m.away), oddsSource: round2(1 + m.away), water: String(m.away), side: 'away', handicap, stop: false })
    } else {
      plays.push({ sourceKey: 'dxq:over@' + m.line, name: '大', categoryName: '大小球', sort: i * 2 + 1, odds: round2(1 + m.home), oddsSource: round2(1 + m.home), water: String(m.home), side: 'over', handicap, stop: false })
      plays.push({ sourceKey: 'dxq:under@' + m.line, name: '小', categoryName: '大小球', sort: i * 2 + 2, odds: round2(1 + m.away), oddsSource: round2(1 + m.away), water: String(m.away), side: 'under', handicap, stop: false })
    }
  })
  return plays
}

// ==================== 结算判定 ====================

const BF_LISTED = {}
;['sw10', 'sw20', 'sw21', 'sw30', 'sw31', 'sw32', 'sw40', 'sw41', 'sw42', 'sw50', 'sw51', 'sw52'].forEach(k => { BF_LISTED[k] = true })
const SD_LISTED = { sd00: true, sd11: true, sd22: true, sd33: true }
const SL_LISTED = { sl01: true, sl02: true, sl03: true, sl04: true, sl05: true, sl12: true, sl13: true, sl14: true, sl15: true, sl23: true, sl24: true, sl25: true }

/**
 * 按90分钟赛果判定单个玩法结果
 * @param play { sourceKey, handicap, side }
 * @returns 'win' | 'lose' | 'push' | 'half_win' | 'half_lose' | null(无法判定)
 * home/guest 为扣除加时与点球后的90分钟比分
 */
function computeResult(play, home, guest, halfHome, halfGuest) {
  const parts = String(play.sourceKey).split(':')
  const type = parts[0]
  const key = parts[1]
  if (!type || !key) return null

  if (type === 'spf') {
    const diff = home - guest
    if (key === '3') return diff > 0 ? 'win' : 'lose'
    if (key === '1') return diff === 0 ? 'win' : 'lose'
    return diff < 0 ? 'win' : 'lose'
  }
  if (type === 'rqspf') {
    const goal = Number(play.handicap) || 0
    const adj = home - guest + goal
    const opt = key.split('@')[0]
    if (opt === '3') return adj > 0 ? 'win' : 'lose'
    if (opt === '1') return adj === 0 ? 'win' : 'lose'
    return adj < 0 ? 'win' : 'lose'
  }
  if (type === 'bf') {
    if (key === 'sw5') {
      if (home <= guest) return 'lose'
      return BF_LISTED[('sw' + home + guest)] ? 'lose' : 'win'
    }
    if (key === 'sd4') {
      if (home !== guest) return 'lose'
      return SD_LISTED[('sd' + home + guest)] ? 'lose' : 'win'
    }
    if (key === 'sl5') {
      if (home >= guest) return 'lose'
      return SL_LISTED[('sl' + home + guest)] ? 'lose' : 'win'
    }
    // 具体比分: key=sw10 -> 比分1:0
    const h = parseInt(key.charAt(2), 10)
    const g = parseInt(key.charAt(3), 10)
    return (home === h && guest === g) ? 'win' : 'lose'
  }
  if (type === 'jq') {
    const total = home + guest
    if (key === 'r01') return (total >= 0 && total <= 1) ? 'win' : 'lose'
    if (key === 'r23') return (total === 2 || total === 3) ? 'win' : 'lose'
    return total >= 4 ? 'win' : 'lose'
  }
  if (type === 'bqc') {
    if (halfHome === null || halfHome === undefined || halfGuest === null || halfGuest === undefined) return null
    const hRes = halfHome > halfGuest ? '3' : (halfHome === halfGuest ? '1' : '0')
    const fRes = home > guest ? '3' : (home === guest ? '1' : '0')
    return key === ('ht' + hRes + fRes) ? 'win' : 'lose'
  }
  if (type === 'asia' || type === 'dxq') {
    const line = Number(play.handicap) || 0
    let diff
    if (type === 'asia') diff = (home - guest) + line // line为负(主让)
    else diff = (home + guest) - line
    // 统一为主/大视角: away/under 取反
    const effDiff = (play.side === 'home' || play.side === 'over') ? diff : -diff

    const frac = Math.abs(line % 1)
    if (frac === 0 || frac === 0.5) {
      if (effDiff > 0) return 'win'
      if (effDiff < 0) return 'lose'
      return 'push'
    }
    // 四分盘(如-1.25/2.75): 拆两半, 各自按整数盘判定
    const s = (d) => d > 0 ? 1 : (d < 0 ? -1 : 0)
    const a = s(effDiff - 0.25)
    const b = s(effDiff + 0.25)
    if (a === 1 && b === 1) return 'win'
    if ((a === 1 && b === 0) || (a === 0 && b === 1)) return 'half_win'
    if ((a === 0 && b === -1) || (a === -1 && b === 0)) return 'half_lose'
    return 'lose'
  }
  return null
}

/** 结算系数: 全赢=赔率, 半赢=(赔率+1)/2, 走盘=1, 半输=0.5, 输=0 */
function resultMultiplier(result, odds) {
  if (result === 'win') return odds
  if (result === 'half_win') return (odds + 1) / 2
  if (result === 'push') return 1
  if (result === 'half_lose') return 0.5
  return 0
}

/** 计算某场赛事的90分钟比分(扣除加时与点球) */
function regularScore(match) {
  const home = (match.homeScore || 0) - (match.homeOtScore || 0) - (match.homeOtPenalty || 0)
  const guest = (match.guestScore || 0) - (match.guestOtScore || 0) - (match.guestOtPenalty || 0)
  return { home: Math.max(0, home), guest: Math.max(0, guest) }
}

module.exports = {
  round2, parsePankou, mergePankou,
  BF_NAMES, BQC_NAMES,
  combineOdds, lastOf,
  buildSportteryPlays, buildPankouPlays,
  computeResult, resultMultiplier, regularScore
}
