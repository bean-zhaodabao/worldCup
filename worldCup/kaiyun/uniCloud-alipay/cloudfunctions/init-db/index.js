'use strict'
const db = uniCloud.database()

exports.main = async (event, context) => {
  const { action } = event

  // ===== 重置管理员密码 =====
  if (action === 'reset') {
    const admins = await db.collection('users').where({ role: 'admin' }).get()
    if (admins.data && admins.data.length > 0) {
      await db.collection('users').doc(admins.data[0]._id).update({ password: 'admin123' })
      return { code: 0, message: '管理员密码已重置为 admin123' }
    }
  }

  // ===== 一键初始化 =====
  const results = []

  // 1. 创建默认管理员
  const exist = await db.collection('users').where({ username: 'admin' }).count()
  if (exist.total === 0) {
    await db.collection('users').add({
      username: 'admin',
      password: 'admin123',
      role: 'admin',
      status: 'active',
      createTime: new Date()
    })
    results.push('管理员账号创建: admin / admin123')
  } else {
    results.push('管理员账号已存在，跳过')
  }

  // 2. 初始化系统配置
  const configKeys = ['minBet', 'maxBet']
  for (const key of configKeys) {
    const existCfg = await db.collection('system-config').where({ key }).count()
    if (existCfg.total === 0) {
      const defaults = { minBet: '2.00', maxBet: '100000.00' }
      const descs = { minBet: '单注最低金额', maxBet: '单注最高金额' }
      await db.collection('system-config').add({
        key, value: defaults[key], description: descs[key], updateTime: new Date()
      })
      results.push('配置项 ' + key + ' 已创建: ' + defaults[key])
    }
  }

  // 3. 初始化玩法分类（标准7组玩法：5大类 + 7小类）
  // 结构: 胜平负(胜平负/让球胜平负)、进球(总进球数区间/大小球)、比分(正确比分)、半全场(半全场胜平负)、盘口(让球盘)
  const bigCatDefs = [
    { name: '胜平负', sort: 1 },
    { name: '进球', sort: 2 },
    { name: '比分', sort: 3 },
    { name: '半全场', sort: 4 },
    { name: '盘口', sort: 5 }
  ]
  const smallCatDefs = [
    { name: '胜平负', parent: '胜平负', sort: 1 },
    { name: '让球胜平负', parent: '胜平负', sort: 2 },
    { name: '总进球数区间', parent: '进球', sort: 1 },
    { name: '大小球', parent: '进球', sort: 2 },
    { name: '正确比分', parent: '比分', sort: 1 },
    { name: '半全场胜平负', parent: '半全场', sort: 1 },
    { name: '让球盘', parent: '盘口', sort: 1 }
  ]

  // 大类：按名查找，不存在则创建
  const bigIds = {}
  for (const cat of bigCatDefs) {
    const exist = await db.collection('play-categories').where({ name: cat.name, parentId: null }).get()
    if (exist.data && exist.data.length > 0) {
      const doc = exist.data[0]
      bigIds[cat.name] = doc._id
      // 修正排序/恢复误删
      if (doc.sort !== cat.sort || doc.deleted) {
        await db.collection('play-categories').doc(doc._id).update({ sort: cat.sort, deleted: false })
      }
    } else {
      const res = await db.collection('play-categories').add({
        name: cat.name, parentId: null, sort: cat.sort, deleted: false, createTime: new Date()
      })
      bigIds[cat.name] = res.id
      results.push('大类已创建: ' + cat.name)
    }
  }

  // 小类：按(名称+父类)查找，不存在则创建
  const validSmallNames = smallCatDefs.map(c => c.name)
  for (const cat of smallCatDefs) {
    const exist = await db.collection('play-categories').where({ name: cat.name, parentId: bigIds[cat.parent] }).get()
    if (exist.data && exist.data.length > 0) {
      const doc = exist.data[0]
      if (doc.sort !== cat.sort || doc.deleted) {
        await db.collection('play-categories').doc(doc._id).update({ sort: cat.sort, deleted: false })
      }
    } else {
      await db.collection('play-categories').add({
        name: cat.name, parentId: bigIds[cat.parent], sort: cat.sort, deleted: false, createTime: new Date()
      })
      results.push('小类已创建: ' + cat.parent + ' / ' + cat.name)
    }
  }

  // 旧版小类（准确进球数、上半场准确进球数）标记删除，避免在分类选择中干扰
  const legacyCats = await db.collection('play-categories')
    .where({ parentId: db.command.neq(null) })
    .get()
  for (const c of (legacyCats.data || [])) {
    if (!validSmallNames.includes(c.name)) {
      await db.collection('play-categories').doc(c._id).update({ deleted: true })
      results.push('旧小类已停用: ' + c.name)
    }
  }

  results.push('玩法分类初始化完成（5大类 + 7小类）')

  return {
    code: 0,
    message: '数据库初始化完成',
    data: results
  }
}
