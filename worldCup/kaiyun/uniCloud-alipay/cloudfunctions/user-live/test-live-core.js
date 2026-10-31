'use strict'
/**
 * live-core 单元测试（斗球真实标题/字段样本）
 * 运行: node test-live-core.js
 */
const {
  parseNextData,
  parseTitle,
  normName,
  nameScore,
  leagueScore,
  buildLiveEntries,
  matchScore,
  matchMatches,
  filterMatchedEntries,
  pickPlayUrls,
  pickDefaultQuality,
  extractRoomDetail
} = require('./live-core')

let pass = 0, fail = 0
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label + '\n    期望: ' + JSON.stringify(expected) + '\n    实际: ' + JSON.stringify(actual)) }
}
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}

// ==================== 1. SSR 解析 ====================
console.log('\n[1] parseNextData')
const html = '<html><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"liveAnchorList":{"records":[{"roomId":1}]},"liveMatchList":[]}}}</script></html>'
eq(parseNextData(html).liveAnchorList.records.length, 1, '从 SSR HTML 取出 pageProps')

// ==================== 2. 标题解析 ====================
console.log('\n[2] parseTitle (实测三种格式)')
eq(parseTitle('巴甲 格雷米奥 - 巴拉纳竞技'), { league: '巴甲', host: '格雷米奥', guest: '巴拉纳竞技' }, '巴甲 格雷米奥 - 巴拉纳竞技')
eq(parseTitle('NBA    新奥尔良鹈鹕 - 萨克拉门托国王'), { league: 'NBA', host: '新奥尔良鹈鹕', guest: '萨克拉门托国王' }, 'NBA 多空格')
eq(parseTitle('S16全球总决赛\t\tTES\t-\tBLG'), { league: 'S16全球总决赛', host: 'TES', guest: 'BLG' }, '电竞 tab')
eq(parseTitle('NBA 亚特兰大老鹰-克利夫兰骑士'), { league: 'NBA', host: '亚特兰大老鹰', guest: '克利夫兰骑士' }, '无空格短横')
eq(parseTitle('哥伦甲春 国民竞技 - 圣达菲独立'), { league: '哥伦甲春', host: '国民竞技', guest: '圣达菲独立' }, '普通标题')
eq(parseTitle(''), null, '空标题')
eq(parseTitle('没有分隔符'), null, '无法拆分')

// ==================== 3. 归一化 / 队名相似度 ====================
console.log('\n[3] 队名归一化与相似度')
eq(normName(' New Orleans Pelicans （备注） '), 'neworleanspelicans', '去空格/括号/小写')
eq(nameScore('格雷米奥', '格雷米奥'), 0.4, '完全相同=0.4')
eq(nameScore('拉科', '拉科鲁尼亚'), 0.4, '简称经别名表=0.4')
eq(nameScore('马竞', '马德里竞技'), 0.4, '马竞=马德里竞技')
eq(nameScore('萨迪纳摩', '萨格勒布迪纳摩'), 0.4, '萨迪纳摩=萨格勒布迪纳摩')
eq(nameScore('纽约城FC', '纽约城'), 0.35, '包含关系=0.35')
eq(nameScore('北京国安', '国安'), 0.35, '长名包含短名=0.35')
eq(nameScore('巴黎', '巴黎FC'), 0, '别名简称不做包含匹配(巴黎 != 巴黎FC)')
eq(nameScore('曼联', '曼联青年队'), 0, '别名简称不做包含匹配(曼联 != 曼联青年队)')
eq(nameScore('格雷米奥', '科林蒂安'), 0, '无关=0')

// ==================== 4. 联赛加分 ====================
console.log('\n[4] leagueScore')
eq(leagueScore('巴西甲', '巴甲'), 0.05, '巴西甲=巴甲')
eq(leagueScore('西甲', '西班牙甲级联赛'), 0.05, '西甲=西班牙甲级联赛')
eq(leagueScore('英超', '西甲'), 0, '不同联赛=0')

// ==================== 5. 直播间整理 ====================
console.log('\n[5] buildLiveEntries')
const pageProps = {
  liveAnchorList: {
    records: [
      {
        roomId: 106236, matchId: 13131666, title: '巴甲 格雷米奥 - 巴拉纳竞技', liveTypeName: '足球',
        nickName: '小鱼聊球', anchorHot: 100, previewInfo: { status: 1, playAddr: { hd_m3u8: 'https://a/hd.m3u8' } }
      },
      {
        roomId: 106539, matchId: 13131666, title: '巴甲  格雷米奥 - 巴拉纳竞技', liveTypeName: '足球',
        nickName: '主播B', anchorHot: 300, previewInfo: { status: 1, playAddr: { sd_m3u8: 'https://a/sd.m3u8' } }
      },
      {
        roomId: 108127, matchId: 14371496, title: 'NBA    新奥尔良鹈鹕 - 萨克拉门托国王', liveTypeName: '篮球',
        nickName: '篮球主播', anchorHot: 999, previewInfo: { status: 1, playAddr: { hd_m3u8: 'https://b/hd.m3u8' } }
      },
      {
        roomId: 999999, matchId: 13982780, title: '无法解析的标题', liveTypeName: '足球',
        nickName: '无效', anchorHot: 1, previewInfo: { status: 0 }
      }
    ]
  },
  liveMatchList: []
}
const entries = buildLiveEntries(pageProps)
eq(entries.length, 2, '同一场比赛多个房间合并 + 无法解析的标题被跳过')
const gremio = entries.find(e => e.matchId === '13131666')
eq(gremio.rooms.length, 2, '格雷米奥场次合并 2 个直播间')
eq(gremio.rooms.map(r => r.roomId), ['106539', '106236'], '直播间按人气排序')
eq(gremio.hostTeamName, '格雷米奥', '标题解析主队')
eq(gremio.guestTeamName, '巴拉纳竞技', '标题解析客队')
eq(gremio.isLive, true, '有直播中的房间')

// 官方赛程优先
const officialEntries = buildLiveEntries({
  liveAnchorList: { records: [{ roomId: 1, matchId: 10, title: '随便写的标题', liveTypeName: '足球', anchorHot: 1, previewInfo: { status: 1, playAddr: { hd_m3u8: 'x' } } }] },
  liveMatchList: [{ matchId: 10, matchTime: 1793325600000, leagueName: 'NBA', sportType: 2, hostTeamName: '波特兰开拓者', guestTeamName: '孟菲斯灰熊' }]
})
eq(officialEntries[0].hostTeamName, '波特兰开拓者', '有官方赛程时优先用官方队名')
eq(officialEntries[0].liveTypeName, '篮球', '有官方赛程时用 sportType 判断项目')
eq(officialEntries[0].matchTime, 1793325600000, '官方开赛时间')

// ==================== 6. 赛事匹配 ====================
console.log('\n[6] matchScore / matchMatches')
const now = 1793324071873 // 2026-10-30 09:34:31 UTC+8
const myMatch = {
  _id: 'my1', teamA: '格雷米奥', teamB: '巴拉纳竞技', leagueName: '巴西甲',
  startTime: new Date(now + 60 * 60 * 1000) // 1 小时后开赛
}
eq(matchScore(myMatch, gremio, now), 1, '双方队名全中 + 临近开赛 + 联赛别名 = 1.0')
const hits = matchMatches([myMatch], entries, now)
eq(hits.length, 1, '匹配到 1 场')
eq(hits[0].matchId, 'my1', '返回我方 matchId')
eq(hits[0].entry.matchId, '13131666', '返回斗球 matchId')

// 首页顶部直播源只保留本系统赛事库里存在的场次
eq(
  filterMatchedEntries([myMatch], entries, now).map(e => e.matchId),
  ['13131666'],
  '本系统不存在的赛事直播源被过滤'
)
eq(filterMatchedEntries([], entries, now).length, 0, '本系统没有赛事时直播源全部过滤')

eq(matchScore({ ...myMatch, teamB: '科林蒂安' }, gremio, now), 0, '客队不一致 => 不匹配')
eq(matchScore({ ...myMatch, startTime: new Date(now + 8 * 60 * 60 * 1000) }, gremio, now), 0, '距开赛 8 小时(无官方时间) => 不匹配')

// 有官方开赛时间时按 ±3 小时窗口
const officialEntry = {
  matchId: '20', hostTeamName: '勒阿弗尔', guestTeamName: '巴黎圣日耳曼', leagueName: '法甲',
  matchTime: now + 2 * 60 * 60 * 1000, isLive: true, hot: 10, rooms: []
}
const psgMatch = { _id: 'my2', teamA: '勒阿弗尔', teamB: '巴黎', startTime: new Date(now + 2 * 60 * 60 * 1000), leagueName: '法甲' }
ok(matchScore(psgMatch, officialEntry, now) >= 0.8, '官方时间 ±2 小时 + 巴黎别名 => 匹配')
eq(matchScore({ ...psgMatch, startTime: new Date(now + 6 * 60 * 60 * 1000) }, officialEntry, now), 0, '官方时间相差 4 小时 => 不匹配')

// 歧义：两场同名同队、分数相同 => 跳过
const dupA = { matchId: 'd1', hostTeamName: '格雷米奥', guestTeamName: '巴拉纳竞技', leagueName: '巴甲', matchTime: null, hot: 10, rooms: [] }
const dupB = { matchId: 'd2', hostTeamName: '格雷米奥', guestTeamName: '巴拉纳竞技', leagueName: '巴甲', matchTime: null, hot: 20, rooms: [] }
eq(matchMatches([myMatch], [dupA, dupB], now).length, 0, '同分候选视为歧义，不自动匹配')

// ==================== 7. 播放链筛选 ====================
console.log('\n[7] pickPlayUrls / pickDefaultQuality')
const urls = pickPlayUrls({
  ori_m3u8: 'https://pull.example/live/1.m3u8?auth=1',
  hd_m3u8: 'https://pull.example/live/1_lhd.m3u8?auth=2',
  sd_m3u8: '//pull.example/live/1_lsd.m3u8?auth=3',
  ld_m3u8: 'rtmp://bad', // 非 http 协议丢弃
  hd_flv: 'https://pull.example/live/1.flv'
})
eq(Object.keys(urls).sort(), ['hd', 'ori', 'sd'], '只保留可用的 m3u8')
eq(urls.sd, 'https://pull.example/live/1_lsd.m3u8?auth=3', '协议相对地址补 https')
eq(pickDefaultQuality(urls), 'hd', '默认高清')
eq(pickDefaultQuality({ sd: 'x' }), 'sd', '无高清时用标清')
eq(pickDefaultQuality({}), '', '无可用清晰度')

// ==================== 8. 房间详情 ====================
console.log('\n[8] extractRoomDetail')
const detail = extractRoomDetail({
  anchorId: 106236,
  serverConfig: { playerUrlBakList: ['https://video.a/'] },
  liveDetailProp: {
    status: 1, matchId: 13131666, liveTitle: '巴甲 格雷米奥 - 巴拉纳竞技', nickName: '小鱼聊球',
    pullDomainBakList: ['pull.example', 'pull2.example'],
    playAddr: { hd_m3u8: 'https://pull.example/live/1_lhd.m3u8', hd_flv: 'x' }
  }
})
eq(detail.roomId, '106236', 'roomId')
eq(detail.matchId, '13131666', 'matchId')
eq(detail.playUrls, { hd: 'https://pull.example/live/1_lhd.m3u8' }, '只返回 m3u8')
eq(detail.defaultQuality, 'hd', '默认清晰度')
eq(detail.playerUrlBakList, ['https://video.a/'], '备用播放域名')
eq(detail.pullDomainBakList, ['pull.example', 'pull2.example'], '备用拉流域名')

// ==================== 汇总 ====================
console.log('\n========================================')
console.log(pass + ' 项通过, ' + fail + ' 项失败')
console.log('========================================')
if (fail > 0) process.exit(1)
