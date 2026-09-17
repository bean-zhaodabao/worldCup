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
  const path = event.path || ''

  try {
    // GET /sync-status - 同步健康状态(管理端顶部"上次同步时间"告警用)
    // sync-jczq 每轮都会写 sync-status/main, 超过 15 分钟未更新即说明定时器没在跑
    if (method === 'GET' && path.includes('/sync-status')) {
      try {
        const res = await db.collection('sync-status').doc('main').get()
        return ok((res.data && res.data[0]) || null)
      } catch (e) {
        return ok(null) // 首次运行尚无该文档
      }
    }

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
        .limit(1000)
        .get()

      // 排序: 最近的比赛放前面
      // 未开始/进行中 按开赛时间升序(最近开赛在前); 已结束/已结算/已取消 按时间倒序(最近完场在前)
      const statusRank = { upcoming: 0, live: 1, finished: 2, settled: 3, cancelled: 4 }
      const sorted = (res.data || []).sort((a, b) => {
        const ra = statusRank[a.status] !== undefined ? statusRank[a.status] : 5
        const rb = statusRank[b.status] !== undefined ? statusRank[b.status] : 5
        if (ra !== rb) return ra - rb
        const ta = new Date(a.startTime).getTime() || 0
        const tb = new Date(b.startTime).getTime() || 0
        if (ra <= 1) return ta - tb   // 未开始/进行中: 最近开赛在前
        return tb - ta                 // 已结束: 最近完场在前
      })

      const p = Number(page), ps = Number(pageSize)
      const list = sorted.slice((p - 1) * ps, p * ps)
      return ok({ list, total: total.total, page: p, pageSize: ps })
    }

    // POST - 新增赛事
    if (method === 'POST' && !path.includes('/online-batch') && !path.includes('/sync')) {
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
    if (method === 'PATCH' && !path.includes('/online')) {
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

    // PATCH /:id/online - 上架/下架(管理端手动)
    if (method === 'PATCH' && path.includes('/online')) {
      const id = path.split('/')[path.split('/').length - 2]
      const { online } = body
      if (typeof online !== 'boolean') return err('online 参数必填(布尔)')

      await db.collection('matches').doc(id).update({ online, updateTime: new Date() })
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'match_online', targetType: 'matches', targetId: id,
        detail: (online ? '上架' : '下架') + '赛事: ' + id,
        beforeData: { online: !online },
        afterData: { online }
      })
      return ok(null, online ? '已上架' : '已下架')
    }

    // POST /online-batch - 批量上架/下架
    if (method === 'POST' && path.includes('/online-batch')) {
      const { ids, online } = body
      if (!ids || !Array.isArray(ids) || ids.length === 0) return err('ids 参数必填')
      if (typeof online !== 'boolean') return err('online 参数必填(布尔)')

      await db.collection('matches').where({ _id: db.command.in(ids) }).update({ online, updateTime: new Date() })
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'match_online_batch', targetType: 'matches', targetId: ids.join(','),
        detail: (online ? '批量上架' : '批量下架') + '赛事 ' + ids.length + ' 场'
      })
      return ok(null, '已' + (online ? '上架' : '下架') + ' ' + ids.length + ' 场赛事')
    }

    // POST /sync - 立即同步(调用 sync-jczq 云函数)
    if (method === 'POST' && path.includes('/sync')) {
      try {
        const syncRes = await uniCloud.callFunction({ name: 'sync-jczq', data: { manual: true } })
        const r = syncRes.result || {}
        await writeLog(db, {
          adminId: admin._id, adminName: admin.username,
          action: 'sync_jczq', targetType: 'matches', targetId: '',
          detail: '手动触发同步: ' + (r.message || JSON.stringify(r))
        })
        return r.code === 0 ? ok(r.data, r.message || '同步完成') : err(r.message || '同步失败')
      } catch (e) {
        console.error('sync call error:', e)
        return err('触发同步失败: ' + e.message)
      }
    }

    return err('不支持的请求方法', 405)
  } catch (e) {
    console.error('admin-match error:', e)
    return err(e.message || '服务器错误')
  }
}
