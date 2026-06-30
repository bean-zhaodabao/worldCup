'use strict'
// @url /admin/plays
// 玩法CRUD + 中奖设定 + 赔率修改 + 复制玩法
const db = uniCloud.database()
const { ok, err, verifyToken, writeLog } = require('./utils')

/**
 * 检查所有玩法是否都中奖（串关用）
 */
async function checkAllPlaysWin(db, items) {
  for (const item of items) {
    const play = await db.collection('plays').doc(item.playId).get()
    if (!play.data || play.data.length === 0 || !play.data[0].isWin) {
      return false
    }
  }
  return true
}

/**
 * 当玩法中奖状态变化时，重算关联订单
 */
async function recalcOrdersForPlay(db, playId, isWin, admin) {
  const orderItems = await db.collection('order-items').where({ playId }).get()
  if (!orderItems.data || orderItems.data.length === 0) return

  const orderIds = [...new Set(orderItems.data.map(item => item.orderId))]

  for (const orderId of orderIds) {
    const order = await db.collection('orders').doc(orderId).get()
    if (!order.data || order.data.length === 0) continue

    const orderData = order.data[0]
    const items = await db.collection('order-items').where({ orderId }).get()
    const allItems = items.data || []

    if (orderData.isParlay) {
      const allWin = await checkAllPlaysWin(db, allItems)
      if (allWin) {
        await db.collection('orders').doc(orderId).update({
          status: 'won',
          winAmount: orderData.betAmount * orderData.totalOdds
        })
      } else {
        await db.collection('orders').doc(orderId).update({ status: 'lost', winAmount: 0 })
      }
    } else {
      if (isWin) {
        await db.collection('orders').doc(orderId).update({
          status: 'won',
          winAmount: orderData.betAmount * orderData.totalOdds
        })
      } else {
        await db.collection('orders').doc(orderId).update({ status: 'lost', winAmount: 0 })
      }
    }
  }
}

exports.main = async (event, context) => {
  const token = (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const method = event.httpMethod || 'GET'
  const body = event.body ? JSON.parse(event.body) : {}
  const query = event.queryStringParameters || {}
  const path = event.path || ''

  try {
    // ============ GET - 查询玩法列表 ============
    if (method === 'GET') {
      const { matchId, categoryId, page = 1, pageSize = 200 } = query
      const where = {}
      if (matchId) where.matchId = matchId
      if (categoryId) where.categoryId = categoryId

      const total = await db.collection('plays').where(where).count()
      const res = await db.collection('plays')
        .where(where)
        .orderBy('sort', 'asc')
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize))
        .get()

      const list = await Promise.all((res.data || []).map(async play => {
        const matchRes = await db.collection('matches').doc(play.matchId).get()
        const catRes = await db.collection('play-categories').doc(play.categoryId).get()
        const matchData = matchRes.data && matchRes.data[0] || {}
        const catData = catRes.data && catRes.data[0] || {}
        let bigCatName = ''
        if (catData.parentId) {
          const bigCat = await db.collection('play-categories').doc(catData.parentId).get()
          bigCatName = (bigCat.data && bigCat.data[0] && bigCat.data[0].name) || ''
        }
        return {
          ...play,
          matchName: matchData.name || '',
          categoryName: catData.name || '',
          categoryPath: bigCatName ? (bigCatName + ' / ' + catData.name) : catData.name
        }
      }))

      return ok({ list, total: total.total })
    }

    // ============ POST /plays/copy - 复制玩法 ============
    if (method === 'POST' && path.includes('/copy')) {
      const { fromMatchId, toMatchId } = body
      if (!fromMatchId || !toMatchId) return err('fromMatchId 和 toMatchId 必填')

      const toMatch = await db.collection('matches').doc(toMatchId).get()
      if (!toMatch.data || toMatch.data.length === 0) return err('目标赛事不存在')
      if (toMatch.data[0].status !== 'upcoming') return err('只能复制玩法到未开始的赛事')

      const plays = await db.collection('plays').where({ matchId: fromMatchId }).get()
      if (!plays.data || plays.data.length === 0) return err('源赛事无玩法可复制')

      let copyCount = 0
      for (const play of plays.data) {
        const { _id, createTime, updateTime, matchId, ...playData } = play
        await db.collection('plays').add({
          ...playData,
          matchId: toMatchId,
          isWin: false,
          createTime: new Date(),
          updateTime: new Date()
        })
        copyCount++
      }

      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'copy_plays', targetType: 'plays', targetId: toMatchId,
        detail: '复制玩法: ' + fromMatchId + ' -> ' + toMatchId + ' (' + copyCount + '条)'
      })
      return ok({ count: copyCount }, '成功复制 ' + copyCount + ' 条玩法')
    }

    // ============ POST - 新增玩法 ============
    if (method === 'POST') {
      const { matchId, categoryId, name, label, odds, sort } = body
      if (!matchId || !categoryId || !name || odds === undefined) return err('缺少必填字段')
      if (odds < 1.01) return err('赔率不能低于1.01')

      const doc = {
        matchId, categoryId, name, label: label || '',
        odds: Number(odds), sort: Number(sort) || 0, isWin: false,
        createTime: new Date(), updateTime: new Date()
      }
      const res = await db.collection('plays').add(doc)

      // 自增比赛赔率版本号
      await db.collection('matches').doc(matchId).update({
        oddsVersion: db.command.inc(1)
      })

      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'update_play', targetType: 'plays', targetId: res.id,
        detail: '新增玩法: ' + name + ', 赔率' + odds + ', 赛事' + matchId
      })
      return ok({ _id: res.id }, '玩法创建成功')
    }

    // ============ PATCH /plays/:id/win - 设定中奖 ============
    if (method === 'PATCH' && path.includes('/win')) {
      const pathParts = path.split('/')
      const id = pathParts[pathParts.length - 2]
      const { isWin } = body
      if (isWin === undefined) return err('isWin 参数必填')

      const play = await db.collection('plays').doc(id).get()
      if (!play.data || play.data.length === 0) return err('玩法不存在')
      const playData = play.data[0]

      await db.collection('plays').doc(id).update({ isWin: Boolean(isWin), updateTime: new Date() })
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'set_win', targetType: 'plays', targetId: id,
        detail: '设定中奖: ' + playData.name + ' -> ' + (isWin ? '中奖' : '未中奖'),
        beforeData: { isWin: playData.isWin },
        afterData: { isWin: Boolean(isWin) }
      })

      await recalcOrdersForPlay(db, id, Boolean(isWin), admin)
      return ok(null, '中奖状态已更新')
    }

    // ============ PATCH /plays/odds - 批量更新赔率 ============
    if (method === 'PATCH' && path.includes('/odds')) {
      const { ids, odds } = body
      if (!ids || !Array.isArray(ids) || odds === undefined) return err('参数错误')
      if (odds < 1.01) return err('赔率不能低于1.01')

      await db.collection('plays').where({ _id: db.command.in(ids) }).update({ odds: Number(odds), updateTime: new Date() })

      // 自增所有涉及比赛的赔率版本号
      const affectedPlays = await db.collection('plays').where({ _id: db.command.in(ids) }).field({ matchId: 1 }).get()
      const affectedMatchIds = [...new Set((affectedPlays.data || []).map(p => p.matchId).filter(Boolean))]
      for (const mId of affectedMatchIds) {
        await db.collection('matches').doc(mId).update({
          oddsVersion: db.command.inc(1)
        })
      }

      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'update_odds', targetType: 'plays', targetId: ids.join(','),
        detail: '批量更新赔率: ' + ids.length + '个玩法 -> ' + odds,
        afterData: { odds: Number(odds) }
      })
      return ok(null, '已更新 ' + ids.length + ' 个玩法的赔率')
    }

    // ============ PUT - 编辑玩法 ============
    if (method === 'PUT') {
      const id = path.split('/').pop()
      const { name, label, categoryId, odds, sort, _oldOdds } = body
      const updateData = { updateTime: new Date() }
      if (name !== undefined) updateData.name = name
      if (label !== undefined) updateData.label = label
      if (categoryId !== undefined) updateData.categoryId = categoryId
      if (sort !== undefined) updateData.sort = Number(sort)
      if (odds !== undefined) {
        if (odds < 1.01) return err('赔率不能低于1.01')
        updateData.odds = Number(odds)
      }
      await db.collection('plays').doc(id).update(updateData)

      // 如果修改了赔率，自增比赛赔率版本号
      if (odds !== undefined) {
        const playInfo = await db.collection('plays').doc(id).field({ matchId: 1 }).get()
        const mId = (playInfo.data && playInfo.data[0] && playInfo.data[0].matchId) || ''
        if (mId) {
          await db.collection('matches').doc(mId).update({
            oddsVersion: db.command.inc(1)
          })
        }
      }

      if (odds !== undefined) {
        await writeLog(db, {
          adminId: admin._id, adminName: admin.username,
          action: 'update_odds', targetType: 'plays', targetId: id,
          detail: '修改赔率: ' + (name || id) + ' -> ' + odds,
          beforeData: { odds: _oldOdds },
          afterData: { odds: Number(odds) }
        })
      }
      return ok(null, '玩法更新成功')
    }

    // ============ DELETE - 删除/下架玩法 ============
    if (method === 'DELETE') {
      const id = path.split('/').pop()
      const orderItems = await db.collection('order-items').where({ playId: id }).count()
      if (orderItems.total > 0) {
        // 已有订单引用 → 下架（逻辑删除），移动端不可见
        await db.collection('plays').doc(id).update({ deleted: true, updateTime: new Date() })
        return ok(null, '该玩法已有订单引用，已下架（移动端不再显示）')
      }
      await db.collection('plays').doc(id).remove()
      return ok(null, '玩法已删除')
    }

    return err('不支持的请求方法', 405)
  } catch (e) {
    console.error('admin-play error:', e)
    return err(e.message || '服务器错误')
  }
}
