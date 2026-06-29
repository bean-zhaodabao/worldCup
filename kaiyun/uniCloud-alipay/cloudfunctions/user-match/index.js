'use strict'
// @url /user/matches
const db = uniCloud.database()
const { success, fail, verifyToken } = require('./utils')

exports.main = async (event, context) => {
  const token = event.token || (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const user = await verifyToken(db, token)
  if (!user) return fail('未登录或登录已过期', 401)

  try {
    // 获取所有赛事
    const matchesRes = await db.collection('matches')
      .where({ status: db.command.in(['upcoming', 'live', 'finished', 'settled']) })
      .orderBy('startTime', 'desc')
      .get()

    const now = new Date()
    // 过滤：已逻辑删除的赛事不展示；未开始的赛事只展示 startTime 在未来的
    const matches = (matchesRes.data || []).filter(m => {
      if (m.deleted) return false
      if (m.status === 'upcoming') return new Date(m.startTime) > now
      return true  // live / finished / settled 照常展示
    })

    // 只返回有玩法的赛事（且未设置玩法的赛事对用户不可见）
    const result = []
    for (const match of matches) {
      const playsRes = await db.collection('plays').where({ matchId: match._id }).get()
      // 过滤已下架的玩法
      const activePlays = (playsRes.data || []).filter(p => !p.deleted)
      if (activePlays.length === 0) continue

      // 分组：按小类 -> 大类
      const playList = await Promise.all(activePlays.map(async play => {
        const cat = await db.collection('play-categories').doc(play.categoryId).get()
        const catData = cat.data && cat.data[0] || {}
        let bigCatName = ''
        let bigCatId = ''
        if (catData.parentId) {
          const bigCat = await db.collection('play-categories').doc(catData.parentId).get()
          bigCatName = (bigCat.data && bigCat.data[0] && bigCat.data[0].name) || ''
          bigCatId = catData.parentId
        }
        return {
          _id: play._id,
          name: play.name,
          label: play.label,
          odds: play.odds,
          categoryId: play.categoryId,
          categoryName: catData.name || '',
          bigCategoryId: bigCatId,
          bigCategoryName: bigCatName
        }
      }))

      // 按大类分组
      const groupedPlays = {}
      for (const p of playList) {
        const key = p.bigCategoryName || p.categoryName
        if (!groupedPlays[key]) groupedPlays[key] = { name: key, plays: [] }
        groupedPlays[key].plays.push({
          _id: p._id,
          name: p.name,
          label: p.label,
          odds: p.odds,
          categoryName: p.categoryName,
          bigCategoryName: p.bigCategoryName
        })
      }

      result.push({
        _id: match._id,
        name: match.name,
        teamA: match.teamA,
        teamB: match.teamB,
        teamAFlag: match.teamAFlag,
        teamBFlag: match.teamBFlag,
        startTime: match.startTime,
        status: match.status,
        categoryPlays: Object.values(groupedPlays)
      })
    }

    return success({ matches: result })
  } catch (e) {
    console.error('user-match error:', e)
    return fail(e.message || '服务器错误')
  }
}
