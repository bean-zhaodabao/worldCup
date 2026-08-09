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

  // 3. 初始化玩法分类（示例数据）
  const catExist = await db.collection('play-categories').count()
  if (catExist.total === 0) {
    // 大类
    const bigCats = [
      { name: '胜平负', sort: 1 },
      { name: '进球', sort: 2 },
      { name: '比分', sort: 3 },
      { name: '半全场', sort: 4 }
    ]
    const bigIds = {}
    for (const cat of bigCats) {
      const res = await db.collection('play-categories').add({
        name: cat.name, parentId: null, sort: cat.sort, createTime: new Date()
      })
      bigIds[cat.name] = res.id
    }

    // 小类
    const smallCats = [
      { name: '胜平负', parent: '胜平负', sort: 1 },
      { name: '让球胜平负', parent: '胜平负', sort: 2 },
      { name: '总进球数区间', parent: '进球', sort: 1 },
      { name: '准确进球数', parent: '进球', sort: 2 },
      { name: '上半场准确进球数', parent: '进球', sort: 3 },
      { name: '正确比分', parent: '比分', sort: 1 },
      { name: '半全场胜平负', parent: '半全场', sort: 1 }
    ]
    for (const cat of smallCats) {
      await db.collection('play-categories').add({
        name: cat.name, parentId: bigIds[cat.parent], sort: cat.sort, createTime: new Date()
      })
    }
    results.push('玩法分类已创建（4大类 + 7小类）')
  } else {
    results.push('玩法分类已存在，跳过')
  }

  return {
    code: 0,
    message: '数据库初始化完成',
    data: results
  }
}
