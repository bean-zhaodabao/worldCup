'use strict'
/**
 * odds-core 单元测试 (真实接口数据验证)
 * 运行: node test-odds-core.js
 */
const {
  round2, parsePankou, mergePankou, combineOdds, lastOf,
  buildSportteryPlays, buildPankouPlays,
  computeResult, resultMultiplier, regularScore, parseLiveTechnic, shouldKeepScore,
  parseMinute, shouldKeepLiveData,
  isHalfTime, resolveLiveTime, HALF_TIME_MINUTE
} = require('./odds-core')

let pass = 0, fail = 0
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label + '\n    期望: ' + JSON.stringify(expected) + '\n    实际: ' + JSON.stringify(actual)) }
}

// ==================== 1. 盘口解析 ====================
console.log('\n[1] parsePankou 中文盘口 -> 数值')
eq(parsePankou('平手'), 0, '平手=0')
eq(parsePankou('平手/半球'), 0.25, '平手/半球=0.25')
eq(parsePankou('半球'), 0.5, '半球=0.5')
eq(parsePankou('半球/一球'), 0.75, '半球/一球=0.75')
eq(parsePankou('一球'), 1, '一球=1')
eq(parsePankou('一球/一球半'), 1.25, '一球/一球半=1.25')
eq(parsePankou('一球半'), 1.5, '一球半=1.5')
eq(parsePankou('二球半'), 2.5, '二球半=2.5')
eq(parsePankou('二球半/三球'), 2.75, '二球半/三球=2.75')
eq(parsePankou('三球'), 3, '三球=3')
eq(parsePankou('三球半/四球'), 3.75, '三球半/四球=3.75')
eq(parsePankou('四球半'), 4.5, '四球半=4.5')

// ==================== 2. 盘口合并(8/12/14, 同盘口取低水位) ====================
console.log('\n[2] mergePankou 合并(实测数据片段)')
const asiaSample = [
  { companyId: 8, companyName: 'Bet3**', pankou: '一球/一球半', odds: ['0.75', '1.05'] },
  { companyId: 12, companyName: '易**', pankou: '一球半', odds: ['1.02', '0.86'] },
  { companyId: 14, companyName: '伟*', pankou: '一球半', odds: ['1.04', '0.84'] },
  { companyId: 17, companyName: '明*', pankou: '一球半', odds: ['1.05', '0.89'] }, // 不参与
  { companyId: 31, companyName: '利*', pankou: '一球/一球半', odds: ['0.81', '1.14'] } // 不参与
]
const merged = mergePankou(asiaSample, [8, 12, 14])
eq(merged.length, 2, '仅保留8/12/14且去重后2行')
eq(merged[0], { pankou: '一球/一球半', line: 1.25, receive: false, home: 0.75, away: 1.05 }, '一球/一球半 行正确')
eq(merged[1], { pankou: '一球半', line: 1.5, receive: false, home: 1.02, away: 0.84 }, '一球半 行取低水位(1.02/0.84)')

// ==================== 3. 竞彩玩法构建(实测 sporttery 数据: 马竞vs马拉加) ====================
console.log('\n[3] buildSportteryPlays 竞彩官方玩法')
const sportteryData = {
  ccId: '周三002', goal: -1, matchId: 3013643,
  spf: { changeCount: 2, frist: 1.2, last: 1.22, max: 1.22, min: 1.2, odds: [
    { spf0: 9.2, spf1: 4.6, spf3: 1.2, updateTime: '08-19 15:11:10' },
    { spf0: 9.85, spf1: 4.8, spf3: 1.22, updateTime: '08-19 18:51:10' }
  ] },
  rqspf: { changeCount: 1, frist: 1.74, last: 1.77, max: 1.77, min: 1.74, odds: [
    { rq0: 3.4, rq1: 3.7, rq3: 1.77, updateTime: '08-19 18:51:10' }
  ] },
  bf: { sd00: 18, sd11: 9.75, sd22: 20, sd33: 70, sd4: 300, sl01: 24, sl02: 70, sl03: 200, sl04: 500, sl05: 850, sl12: 30, sl13: 90, sl14: 300, sl15: 850, sl23: 80, sl24: 300, sl25: 850, sl5: 300, sw10: 7.25, sw20: 6.15, sw21: 7.5, sw30: 7.75, sw31: 10, sw32: 26, sw40: 12.5, sw41: 18, sw42: 50, sw5: 20, sw50: 28, sw51: 38, sw52: 90, stop: false },
  jq: { t0: 18, t1: 6.15, t2: 3.85, t3: 3.5, t4: 4.9, t5: 8.25, t6: 15, t7: 21, stop: false },
  bqc: { ht00: 18.5, ht01: 23, ht03: 27, ht10: 23, ht11: 8, ht13: 3.9, ht30: 75, ht31: 23, ht33: 1.7, stop: false }
}
const spPlays = buildSportteryPlays(sportteryData)
eq(spPlays.length, 3 + 3 + 31 + 4 + 9, '共 50 个竞彩玩法')
const spfWin = spPlays.find(p => p.sourceKey === 'spf:3')
eq(spfWin && spfWin.odds, 1.22, '胜赔率取最新一条 1.22')
eq(spfWin && spfWin.oddsFirst, 1.2, '胜初赔 1.2')
eq(spfWin && spfWin.oddsStat.frist, 1.2, 'oddsStat.frist=1.2')
const rqPing = spPlays.find(p => p.sourceKey === 'rqspf:1@-1')
eq(rqPing && rqPing.handicap, -1, '让球平 handicap=-1(主让1球)')
const bfOther = spPlays.find(p => p.sourceKey === 'bf:sw5')
eq(bfOther && bfOther.name, '胜其他', 'sw5=胜其他')
// 总进球区间: 0-1 = 1/(1/18+1/6.15)
const jq01 = spPlays.find(p => p.sourceKey === 'jq:r01')
const expect01 = round2(1 / (1 / 18 + 1 / 6.15))
eq(jq01 && jq01.odds, expect01, '0-1区间合并赔率=' + expect01)
const jq46 = spPlays.find(p => p.sourceKey === 'jq:r46')
const expect46 = round2(1 / (1 / 4.9 + 1 / 8.25 + 1 / 15))
eq(jq46 && jq46.odds, expect46, '4-6区间合并赔率=' + expect46)
const jq7 = spPlays.find(p => p.sourceKey === 'jq:r7')
eq(jq7 && jq7.odds, 21, '7+区间赔率=t7=21')
eq(spPlays.find(p => p.sourceKey === 'jq:r4'), undefined, '不再生成旧版4+球(jq:r4)')
eq(spPlays.filter(p => p.sourceKey.indexOf('bqc:') === 0).length, 9, '半全场9项')

// ==================== 4. 亚盘/大小球玩法构建 ====================
console.log('\n[4] buildPankouPlays 水位转十进制')
const dxqMerged = [
  { pankou: '二球半/三球', line: 2.75, home: 0.78, away: 1.03 },
  { pankou: '三球', line: 3, home: 1.12, away: 0.81 }
]
const dxqPlays = buildPankouPlays(dxqMerged, 'dxq')
eq(dxqPlays.length, 4, '2行×2侧=4个玩法')
const over275 = dxqPlays.find(p => p.sourceKey === 'dxq:over@2.75')
eq(over275 && over275.odds, 1.78, '大2.75: 0.78水位→1.78十进制')
eq(over275 && over275.water, '0.78', '水位保留0.78')
eq(over275 && over275.handicap, 2.75, 'handicap=2.75')
const asiaPlays = buildPankouPlays([{ pankou: '一球半', line: 1.5, home: 1.02, away: 0.84 }], 'asia')
const asiaHome = asiaPlays.find(p => p.sourceKey === 'asia:home@-1.5')
eq(asiaHome && asiaHome.handicap, -1.5, '亚盘主队 handicap=-1.5')

// ==================== 5. 结算判定 ====================
console.log('\n[5] computeResult 结算判定')
const mk = (sk, handicap, side) => ({ sourceKey: sk, handicap, side })
// 胜平负: 2-1 → 胜
eq(computeResult(mk('spf:3'), 2, 1), 'win', '2-1 胜平负-胜 中')
eq(computeResult(mk('spf:1'), 2, 1), 'lose', '2-1 胜平负-平 未中')
eq(computeResult(mk('spf:0'), 0, 1), 'win', '0-1 负 中')
// 让球胜平负: goal=-1(主让1球), 2-1 → 让球平
eq(computeResult(mk('rqspf:3@-1', -1), 2, 1), 'lose', '2-1 让1球 让球胜 未中')
eq(computeResult(mk('rqspf:1@-1', -1), 2, 1), 'win', '2-1 让1球 让球平 中')
eq(computeResult(mk('rqspf:3@1', 1), 2, 1), 'win', '2-1 受让1球 让球胜 中')
// 比分
eq(computeResult(mk('bf:sw21'), 2, 1), 'win', '2-1 比分2:1 中')
eq(computeResult(mk('bf:sw10'), 2, 1), 'lose', '2-1 比分1:0 未中')
eq(computeResult(mk('bf:sd4'), 4, 4), 'win', '4-4 平其他 中')
eq(computeResult(mk('bf:sd4'), 3, 3), 'lose', '3-3 平其他 未中(3:3是列出比分)')
eq(computeResult(mk('bf:sw5'), 4, 2), 'lose', '4-2 胜其他 未中(4:2列出)')
eq(computeResult(mk('bf:sw5'), 6, 3), 'win', '6-3 胜其他 中')
eq(computeResult(mk('bf:sl5'), 0, 3), 'lose', '0-3 负其他 未中(列出)')
eq(computeResult(mk('bf:sl5'), 1, 6), 'win', '1-6 负其他 中')
// 总进球区间
eq(computeResult(mk('jq:r01'), 1, 0), 'win', '1-0 → 0-1球 中')
eq(computeResult(mk('jq:r23'), 1, 2), 'win', '1-2 → 2-3球 中')
eq(computeResult(mk('jq:r23'), 4, 0), 'lose', '4-0 → 2-3球 未中')
eq(computeResult(mk('jq:r46'), 2, 2), 'win', '2-2 → 4-6球 中')
eq(computeResult(mk('jq:r46'), 6, 1), 'lose', '6-1 → 7球 不在4-6球')
eq(computeResult(mk('jq:r46'), 3, 0), 'lose', '3-0 → 3球 不在4-6球')
eq(computeResult(mk('jq:r7'), 4, 3), 'win', '4-3 → 7+球 中')
eq(computeResult(mk('jq:r7'), 5, 1), 'lose', '5-1 → 6球 未中7+球')
eq(computeResult(mk('jq:r4'), 5, 2), 'win', '历史4+球(jq:r4)仍按4+结算')
// 半全场(半场1-0, 全场2-1 → 胜胜)
eq(computeResult(mk('bqc:ht33'), 2, 1, 1, 0), 'win', '半1-0全2-1 → 胜胜 中')
eq(computeResult(mk('bqc:ht13'), 2, 1, 1, 0), 'lose', '半1-0全2-1 → 平胜 未中')
eq(computeResult(mk('bqc:ht01'), 1, 1, 0, 1), 'win', '半0-1全1-1 → 负平(ht01) 中')
eq(computeResult(mk('bqc:ht10'), 0, 1, 0, 0), 'win', '半0-0全0-1 → 平负(ht10) 中')
// 亚盘: 主让1.5, 2-0 → 主胜(diff=0.5)
eq(computeResult(mk('asia:home@-1.5', -1.5, 'home'), 2, 0), 'win', '2-0 让1.5 主 中')
eq(computeResult(mk('asia:away@-1.5', -1.5, 'away'), 2, 0), 'lose', '2-0 让1.5 客 未中')
eq(computeResult(mk('asia:away@-1.5', -1.5, 'away'), 1, 0), 'win', '1-0 让1.5 客 中')
// 亚盘整数盘: 主让1, 1-0 → 走盘
eq(computeResult(mk('asia:home@-1', -1, 'home'), 1, 0), 'push', '1-0 让1 主 走盘退本金')
eq(computeResult(mk('asia:away@-1', -1, 'away'), 1, 0), 'push', '1-0 让1 客 走盘')
// 亚盘四分盘: 主让1.25, 1-0 → 半输
eq(computeResult(mk('asia:home@-1.25', -1.25, 'home'), 1, 0), 'half_lose', '1-0 让1.25 主 半输')
eq(computeResult(mk('asia:home@-1.25', -1.25, 'home'), 2, 0), 'win', '2-0 让1.25 主 全赢')
// 大小球: 大2.5, 总3球 → 赢
eq(computeResult(mk('dxq:over@2.5', 2.5, 'over'), 1, 2), 'win', '总3 大2.5 中')
eq(computeResult(mk('dxq:under@2.5', 2.5, 'under'), 1, 2), 'lose', '总3 小2.5 未中')
// 大小球整数盘: 大2, 总2 → 走盘
eq(computeResult(mk('dxq:over@2', 2, 'over'), 1, 1), 'push', '总2 大2 走盘')
// 大小球四分盘: 大2.75, 总3 → 半赢
eq(computeResult(mk('dxq:over@2.75', 2.75, 'over'), 1, 2), 'half_win', '总3 大2.75 半赢')
eq(computeResult(mk('dxq:under@2.75', 2.75, 'under'), 1, 2), 'half_lose', '总3 小2.75 半输')
eq(computeResult(mk('dxq:under@2.75', 2.75, 'under'), 0, 1), 'win', '总1 小2.75 全赢')

// ==================== 6. 结算系数 ====================
console.log('\n[6] resultMultiplier 结算系数')
eq(resultMultiplier('win', 1.85), 1.85, '全赢=赔率')
eq(resultMultiplier('half_win', 1.85), 1.425, '半赢=(赔率+1)/2')
eq(resultMultiplier('push', 1.85), 1, '走盘=1')
eq(resultMultiplier('half_lose', 1.85), 0.5, '半输=0.5')
eq(resultMultiplier('lose', 1.85), 0, '输=0')

// ==================== 7. 90分钟比分 ====================
console.log('\n[7] regularScore 加时/点球扣除')
eq(regularScore({ homeScore: 3, guestScore: 2, homeOtScore: 0, guestOtScore: 0, homeOtPenalty: 0, guestOtPenalty: 0 }), { home: 3, guest: 2 }, '无加时: 3-2')
eq(regularScore({ homeScore: 2, guestScore: 2, homeOtScore: 1, guestOtScore: 0, homeOtPenalty: 0, guestOtPenalty: 0 }), { home: 1, guest: 2 }, '加时主进1: 90分钟1-2')

// ==================== 8. 进行中技术统计 ====================
console.log('\n[8] parseLiveTechnic 技术统计解析')
const liveData = {
  time: "90'", matchState: -1, displayState: '完场',
  technic: [
    { name: '控球率', home: '55%', guest: '45%', homePercent: 55, guestPercent: 45 },
    { name: '射门', home: '14', guest: '12', homePercent: 54, guestPercent: 46 },
    { name: '传球成功率', home: '83%', guest: '85%', homePercent: 83, guestPercent: 85 },
    { name: '角球', home: '5', guest: '4', homePercent: 56, guestPercent: 44 },
    { name: '', home: '1', guest: '1', homePercent: 50, guestPercent: 50 },
    null
  ]
}
const technic = parseLiveTechnic(liveData)
eq(technic.length, 4, '过滤空名称项')
eq(technic[0], { name: '控球率', home: '55%', guest: '45%', homePercent: 55, guestPercent: 45 }, '控球率解析正确')
eq(technic[2], { name: '传球成功率', home: '83%', guest: '85%', homePercent: 83, guestPercent: 85 }, '传球成功率保留原始占比')
eq(parseLiveTechnic({ technic: [{ name: '射正', home: '5', guest: '4' }] })[0].homePercent, 0, '缺失占比补 0')
eq(parseLiveTechnic({}), [], '无 technic 返回空数组')

// ==================== 9. 列表比分防回退 ====================
console.log('\n[9] shouldKeepScore 列表接口滞后的比分不覆盖')
eq(shouldKeepScore('live', 'live', '上半场'), true, 'live -> live 保留最新比分')
eq(shouldKeepScore('live', 'upcoming', '未开始'), true, 'live -> upcoming(列表滞后) 保留')
eq(shouldKeepScore('live', 'finished', '完场'), false, 'live -> finished 允许写最终比分')
eq(shouldKeepScore('finished', 'live', '下半场'), true, 'finished -> live(列表滞后) 保留')
eq(shouldKeepScore('finished', 'finished', '下半场'), true, 'finished 未完场数据不回退')
eq(shouldKeepScore('finished', 'finished', '完场'), false, 'finished -> finished(完场) 允许最终比分修正')
eq(shouldKeepScore('settled', 'finished', '完场'), true, 'settled 永不再改比分')
eq(shouldKeepScore('upcoming', 'live', '上半场'), false, 'upcoming -> live 正常写入')
eq(shouldKeepScore('upcoming', 'upcoming', '未开始'), false, 'upcoming -> upcoming 正常写入')

// ==================== 10. 多数据源比分防回退 ====================
console.log('\n[10] parseMinute / shouldKeepLiveData 多数据源防回退')
eq(parseMinute("12'"), 12, "12' = 12")
eq(parseMinute("45+2'"), 45.02, "45+2' = 45.02")
eq(parseMinute("90+4'"), 90.04, "90+4' = 90.04")
eq(parseMinute('中场'), null, '中场无法解析')
eq(
  shouldKeepLiveData({ time: "12'", homeScore: 1, guestScore: 0 }, { time: "11'", homeScore: 0, guestScore: 0 }),
  true,
  '慢 1 分钟的 status 数据不回退比分/分钟'
)
eq(
  shouldKeepLiveData({ time: "12'", homeScore: 1, guestScore: 0 }, { time: "12'", homeScore: 0, guestScore: 0 }),
  true,
  '同一分钟进球数变少不回退'
)
eq(
  shouldKeepLiveData({ time: "12'", homeScore: 0, guestScore: 0 }, { time: "12'", homeScore: 1, guestScore: 0 }),
  false,
  '同一分钟新进球允许更新'
)
eq(
  shouldKeepLiveData({ time: "12'", homeScore: 0, guestScore: 0 }, { time: "13'", homeScore: 0, guestScore: 0 }),
  false,
  '分钟前进允许更新'
)
eq(shouldKeepLiveData({ time: '中场', homeScore: 1, guestScore: 0 }, { time: "46'", homeScore: 1, guestScore: 0 }), false, '无分钟时不拦截')

// ==================== 11. 中场休息 ====================
console.log('\n[11] 中场休息时间不再继续走')
eq(isHalfTime('中场'), true, '中场 = 中场休息')
eq(isHalfTime('中场休息'), true, '中场休息 = 中场休息')
eq(isHalfTime('上半场'), false, '上半场不是中场')
eq(isHalfTime('下半场'), false, '下半场不是中场')
eq(isHalfTime(''), false, '空状态不是中场')

eq(
  shouldKeepLiveData(
    { time: "45+3'", displayState: '上半场', homeScore: 1, guestScore: 0 },
    { time: "45'", displayState: '中场', homeScore: 1, guestScore: 0 }
  ),
  false,
  '进入中场时允许更新(分钟重置为45不算回退)'
)
eq(
  resolveLiveTime(
    { time: "45+3'", displayState: '上半场' },
    { time: "47'", displayState: '中场' }
  ),
  HALF_TIME_MINUTE,
  '中场休息期间源站分钟继续增长也固定为45'
)
eq(
  resolveLiveTime(
    { time: "45'", displayState: '中场' },
    { time: "46'", displayState: '下半场' }
  ),
  "46'",
  '下半场开始后恢复源站分钟'
)
eq(
  shouldKeepLiveData(
    { time: "45'", displayState: '中场', homeScore: 1, guestScore: 0 },
    { time: "45+2'", displayState: '上半场', homeScore: 1, guestScore: 0 }
  ),
  true,
  '中场后收到上半场滞后的补时数据不回退'
)
eq(
  shouldKeepLiveData(
    { time: "45'", displayState: '中场', homeScore: 1, guestScore: 0 },
    { time: "46'", displayState: '下半场', homeScore: 1, guestScore: 0 }
  ),
  false,
  '中场后进入下半场允许更新'
)
eq(
  shouldKeepLiveData(
    { time: "46'", displayState: '下半场', homeScore: 1, guestScore: 0 },
    { time: "45'", displayState: '中场', homeScore: 1, guestScore: 0 }
  ),
  true,
  '已进入下半场时, 详情接口滞后的中场数据不退回中场'
)
eq(
  shouldKeepLiveData(
    { time: "46'", displayState: '', homeScore: 1, guestScore: 0 },
    { time: "45'", displayState: '中场', homeScore: 1, guestScore: 0 }
  ),
  true,
  '分钟已过45时, 中场数据视为滞后'
)

console.log('\n========================================')
console.log('通过 ' + pass + ' 项, 失败 ' + fail + ' 项')
if (fail > 0) process.exit(1)
