'use strict'
// @url /admin/matches
const db = uniCloud.database()
const { ok, err, verifyToken, writeLog } = require('./utils')

exports.main = async (event, context) => {
  const token = (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const method = event.httpMethod || 'GET'
  const body = event.body ? JSON.parse(event.body) : {}
  const query = event.queryStringParameters || {}

  try {
    // GET - 查询赛事列表
    if (method === 'GET') {
      const { name, status, page = 1, pageSize = 20 } = query
      const where = {}
      if (name) where.name = new RegExp(name, 'i')
      if (status) where.status = status
      // 过滤已逻辑删除的赛事
      where.deleted = db.command.neq(true)

      const total = await db.collection('matches').where(where).count()
      const res = await db.collection('matches')
        .where(where)
        .orderBy('startTime', 'desc')
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize))
        .get()

      return ok({ list: res.data, total: total.total, page: Number(page), pageSize: Number(pageSize) })
    }

    // POST - 新增赛事
    if (method === 'POST') {
      const { name, teamA, teamB, teamAFlag, teamBFlag, startTime } = body
      if (!name || !teamA || !teamB || !startTime) return err('缺少必填字段')

      const doc = {
        name, teamA, teamB,
        teamAFlag: teamAFlag || '',
        teamBFlag: teamBFlag || '',
        startTime: new Date(startTime),
        status: 'upcoming',
        createTime: new Date(),
        updateTime: new Date()
      }
      const res = await db.collection('matches').add(doc)
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'match_status', targetType: 'matches', targetId: res.id,
        detail: `创建赛事: ${name} (${teamA} vs ${teamB})`
      })
      return ok({ _id: res.id }, '赛事创建成功')
    }

    // PUT - 编辑赛事
    if (method === 'PUT') {
      const id = event.path.split('/').pop()
      const { name, teamA, teamB, teamAFlag, teamBFlag, startTime } = body
      const updateData = { updateTime: new Date() }
      if (name !== undefined) updateData.name = name
      if (teamA !== undefined) updateData.teamA = teamA
      if (teamB !== undefined) updateData.teamB = teamB
      if (teamAFlag !== undefined) updateData.teamAFlag = teamAFlag
      if (teamBFlag !== undefined) updateData.teamBFlag = teamBFlag
      if (startTime !== undefined) updateData.startTime = new Date(startTime)

      await db.collection('matches').doc(id).update(updateData)
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'match_status', targetType: 'matches', targetId: id,
        detail: `编辑赛事: ${name || id}`
      })
      return ok(null, '赛事更新成功')
    }

    // DELETE - 删除/下架赛事
    if (method === 'DELETE') {
      const id = event.path.split('/').pop()
      // 检查是否有订单关联
      const orderCount = await db.collection('orders').where({ matchId: id }).count()
      if (orderCount.total > 0) {
        // 已有订单 → 逻辑删除
        await db.collection('matches').doc(id).update({ deleted: true, updateTime: new Date() })
        await writeLog(db, {
          adminId: admin._id, adminName: admin.username,
          action: 'match_status', targetType: 'matches', targetId: id,
          detail: `下架赛事(逻辑删除): ${id}`
        })
        return ok(null, '该赛事已有订单，已下架（页面不再显示）')
      }

      await db.collection('plays').where({ matchId: id }).remove()
      await db.collection('matches').doc(id).remove()
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'match_status', targetType: 'matches', targetId: id,
        detail: `删除赛事: ${id}`
      })
      return ok(null, '赛事已删除')
    }

    // PATCH - 更新赛事状态
    if (method === 'PATCH') {
      const id = event.path.split('/').pop()
      const { status } = body
      const validStatuses = ['upcoming', 'live', 'finished', 'settled']
      if (!validStatuses.includes(status)) return err('无效的状态值')

      const match = await db.collection('matches').doc(id).get()
      if (!match.data || match.data.length === 0) return err('赛事不存在')

      const oldStatus = match.data[0].status
      await db.collection('matches').doc(id).update({ status, updateTime: new Date() })

      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'match_status', targetType: 'matches', targetId: id,
        detail: `赛事状态变更: ${oldStatus} → ${status}`,
        beforeData: { status: oldStatus },
        afterData: { status }
      })
      return ok(null, '状态更新成功')
    }

    return err('不支持的请求方法', 405)
  } catch (e) {
    console.error('admin-match error:', e)
    return err(e.message || '服务器错误')
  }
}
