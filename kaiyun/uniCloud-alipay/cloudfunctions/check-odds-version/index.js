'use strict'
// 轻量轮询端点：批量查询比赛赔率版本号
// 入参: { matchIds: string[] }
// 出参: { code: 0, data: { versions: { [matchId]: version } } }
const db = uniCloud.database()
const MAX_MATCH_IDS = 200

exports.main = async (event, context) => {
  const matchIds = event.matchIds
  if (!matchIds || !Array.isArray(matchIds) || matchIds.length === 0) {
    return { code: 0, data: { versions: {} }, message: 'ok' }
  }
  if (matchIds.length > MAX_MATCH_IDS) {
    return { code: -1, message: `每次最多查询 ${MAX_MATCH_IDS} 场比赛` }
  }

  try {
    const cmd = db.command
    const res = await db.collection('matches')
      .where({ _id: cmd.in(matchIds) })
      .field({ oddsVersion: 1 })
      .get()

    const versions = {}
    for (const m of (res.data || [])) {
      versions[m._id] = m.oddsVersion || 0
    }
    for (const id of matchIds) {
      if (!(id in versions)) versions[id] = -1
    }

    return { code: 0, data: { versions }, message: 'ok' }
  } catch (e) {
    console.error('check-odds-version error:', e)
    return { code: -1, message: e.message || 'server error' }
  }
}
