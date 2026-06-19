'use strict'
// @url /admin/categories
const db = uniCloud.database()
const { ok, err, verifyToken, writeLog } = require('./utils')

exports.main = async (event, context) => {
  const token = (event.headers && (event.headers.authorization || event.headers.Authorization || '')).replace('Bearer ', '')
  const admin = await verifyToken(db, token)
  if (!admin) return err('未登录或登录已过期', 401)

  const method = event.httpMethod || 'GET'
  const body = event.body ? JSON.parse(event.body) : {}

  try {
    // GET - 获取分类树
    if (method === 'GET') {
      const res = await db.collection('play-categories').orderBy('sort', 'asc').get()
      const list = res.data || []
      // 构建树形结构
      const bigCategories = list.filter(c => !c.parentId)
      const smallCategories = list.filter(c => c.parentId)
      const tree = bigCategories.map(big => ({
        ...big,
        children: smallCategories.filter(s => s.parentId === big._id)
      }))
      return ok({ tree, flat: list })
    }

    // POST - 新增分类
    if (method === 'POST') {
      const { name, parentId, sort = 0 } = body
      if (!name) return err('分类名称不能为空')
      // parentId 为 null 或空表示大类
      const doc = { name, parentId: parentId || null, sort, createTime: new Date() }
      const res = await db.collection('play-categories').add(doc)
      await writeLog(db, {
        adminId: admin._id, adminName: admin.username,
        action: 'update_play', targetType: 'play-categories', targetId: res.id,
        detail: `创建玩法分类: ${name} (${parentId ? '小类' : '大类'})`
      })
      return ok({ _id: res.id }, '分类创建成功')
    }

    // PUT - 编辑分类
    if (method === 'PUT') {
      const id = event.path.split('/').pop()
      const { name, sort } = body
      const updateData = {}
      if (name !== undefined) updateData.name = name
      if (sort !== undefined) updateData.sort = sort
      await db.collection('play-categories').doc(id).update(updateData)
      return ok(null, '分类更新成功')
    }

    // DELETE - 删除分类
    if (method === 'DELETE') {
      const id = event.path.split('/').pop()
      // 检查是否有子分类
      const children = await db.collection('play-categories').where({ parentId: id }).count()
      if (children.total > 0) return err('请先删除该分类下的所有小类')
      // 检查是否有玩法引用
      const plays = await db.collection('plays').where({ categoryId: id }).count()
      if (plays.total > 0) return err('该分类下有玩法引用，无法删除')
      await db.collection('play-categories').doc(id).remove()
      return ok(null, '分类已删除')
    }

    return err('不支持的请求方法', 405)
  } catch (e) {
    console.error('admin-category error:', e)
    return err(e.message || '服务器错误')
  }
}
