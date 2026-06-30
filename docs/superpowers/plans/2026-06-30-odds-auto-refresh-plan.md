# 赔率自动刷新 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理端修改赔率后，移动端 2 秒内自动更新赔率显示，无需手动刷新。

**Architecture:** matches 表新增 `oddsVersion` 字段，admin-play 每次改赔率时自增该字段。移动端通过 `oddsPoller.js` 每 2 秒轮询新云函数 `check-odds-version`，版本变化时拉取最新数据并更新页面。购物车中赔率同步更新并 toast 提示。

**Tech Stack:** uniCloud (Alibaba Cloud) + uni-app (Vue3) + Node.js cloud functions

---

### Task 1: matches 数据模型新增 oddsVersion 字段

**Files:**
- Modify: `kaiyun/uniCloud-alipay/database/schemas/matches.schema.json`

- [ ] **Step 1: 在 matches schema 的 properties 中添加 oddsVersion 字段**

在 `"updateTime"` 字段定义之后添加逗号和 `oddsVersion`:

```json
    "updateTime": { "bsonType": "date" },
    "oddsVersion": {
      "bsonType": "int",
      "title": "赔率版本号",
      "description": "每次该比赛下任意玩法赔率变更时 +1，用于移动端轮询自动刷新",
      "defaultValue": 0
    }
```

- [ ] **Step 2: Commit**

```bash
git add kaiyun/uniCloud-alipay/database/schemas/matches.schema.json
git commit -m "feat: matches schema 新增 oddsVersion 字段

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 新增 check-odds-version 云函数

**Files:**
- Create: `kaiyun/uniCloud-alipay/cloudfunctions/check-odds-version/index.js`
- Create: `kaiyun/uniCloud-alipay/cloudfunctions/check-odds-version/package.json`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "check-odds-version",
  "version": "1.0.0",
  "dependencies": {}
}
```

- [ ] **Step 2: 创建云函数入口 index.js**

```js
'use strict'
// 轻量轮询端点：批量查询比赛赔率版本号
// 入参: { matchIds: string[] }
// 出参: { code: 0, data: { versions: { matchId1: version1, matchId2: version2 } } }
const db = uniCloud.database()

exports.main = async (event, context) => {
  const matchIds = event.matchIds
  if (!matchIds || !Array.isArray(matchIds) || matchIds.length === 0) {
    return { code: 0, data: { versions: {} }, message: 'ok' }
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
    // 补齐未查到的 matchId（可能已被删除），版本号返回 -1 表示不可用
    for (const id of matchIds) {
      if (!(id in versions)) versions[id] = -1
    }

    return { code: 0, data: { versions }, message: 'ok' }
  } catch (e) {
    console.error('check-odds-version error:', e)
    return { code: -1, message: e.message || 'server error' }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add kaiyun/uniCloud-alipay/cloudfunctions/check-odds-version/
git commit -m "feat: 新增 check-odds-version 云函数

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: admin-play 云函数 — 修改赔率时自增 oddsVersion

**Files:**
- Modify: `kaiyun/uniCloud-alipay/cloudfunctions/admin-play/index.js`

影响三个位置：POST（新增玩法）、PUT（编辑玩法）、PATCH /odds（批量改赔率）。

- [ ] **Step 1: POST 新增玩法 — 创建后自增 oddsVersion**

找到 `if (method === 'POST')` 分支中 `db.collection('plays').add(doc)` 成功之后、`writeLog` 之前，插入自增逻辑：

```js
      const res = await db.collection('plays').add(doc)

      // 自增比赛赔率版本号
      await db.collection('matches').doc(matchId).update({
        oddsVersion: db.command.inc(1)
      })

      await writeLog(db, {
```

- [ ] **Step 2: PUT 编辑玩法 — 修改 odds 时自增 oddsVersion**

找到 `if (method === 'PUT')` 分支，在 `db.collection('plays').doc(id).update(updateData)` 之后、`if (odds !== undefined) { await writeLog(...) }` 之前，插入：

```js
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
```

- [ ] **Step 3: PATCH /plays/odds 批量改赔率 — 自增所有涉及比赛的 oddsVersion**

找到 `if (method === 'PATCH' && path.includes('/odds'))` 分支，在 `update` 之后插入：

```js
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
```

- [ ] **Step 4: Commit**

```bash
git add kaiyun/uniCloud-alipay/cloudfunctions/admin-play/index.js
git commit -m "feat: admin-play 修改赔率时自增 match.oddsVersion

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: user-match 云函数 — 返回 oddsVersion

**Files:**
- Modify: `kaiyun/uniCloud-alipay/cloudfunctions/user-match/index.js`

- [ ] **Step 1: 在 match 对象中携带 oddsVersion**

找到构建 `result.push` 的位置，在 `_id: match._id` 之后添加 `oddsVersion`:

```js
      result.push({
        _id: match._id,
        oddsVersion: match.oddsVersion || 0,
        name: match.name,
```

- [ ] **Step 2: Commit**

```bash
git add kaiyun/uniCloud-alipay/cloudfunctions/user-match/index.js
git commit -m "feat: user-match 返回 match.oddsVersion 供移动端轮询使用

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 新增移动端轮询工具 oddsPoller.js

**Files:**
- Create: `kaiyun/utils/oddsPoller.js`

- [ ] **Step 1: 创建 oddsPoller.js**

```js
/**
 * 赔率版本轮询器
 *
 * 用法:
 *   import { startPolling, stopPolling } from '@/utils/oddsPoller.js'
 *   startPolling({ matchIds: ['id1','id2'], versions: { id1: v1, id2: v2 }, onChange })
 *   stopPolling()
 */

let timer = null
let running = false

/**
 * @param {Object} opts
 * @param {string[]} opts.matchIds - 要监听的比赛 ID 列表
 * @param {Object<string,number>} opts.versions - 当前已知版本号映射 { matchId: version }
 * @param {Function} opts.onChange - 版本变化回调 (changedMatchIds: string[]) => void
 * @param {number} [opts.interval=2000] - 轮询间隔(ms)
 */
export function startPolling(opts = {}) {
  stopPolling()
  const { matchIds = [], versions = {}, onChange, interval = 2000 } = opts

  if (!matchIds.length || !onChange) return

  const knownVersions = { ...versions }
  running = true

  const poll = async () => {
    if (!running) return
    try {
      const res = await uniCloud.callFunction({
        name: 'check-odds-version',
        data: { matchIds }
      })
      if (!running) return
      if (res.result && res.result.code === 0) {
        const serverVersions = res.result.data.versions || {}
        const changed = []
        for (const id of matchIds) {
          const sv = serverVersions[id]
          const kv = knownVersions[id] || 0
          if (sv !== undefined && sv > kv) {
            changed.push(id)
            knownVersions[id] = sv
          }
        }
        if (changed.length > 0) {
          onChange(changed)
        }
      }
    } catch (e) {
      // 静默处理，下个周期重试
      console.warn('oddsPoller error:', e)
    }
    if (running) {
      timer = setTimeout(poll, interval)
    }
  }

  // 立即执行第一次检查
  poll()
}

export function stopPolling() {
  running = false
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add kaiyun/utils/oddsPoller.js
git commit -m "feat: 新增 oddsPoller.js 赔率版本轮询工具

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 比赛详情页集成赔率自动刷新

**Files:**
- Modify: `kaiyun/pages/match/detail.vue`

- [ ] **Step 1: 引入 oddsPoller**

在 `<script setup>` 顶部 import 区域添加:

```js
import { startPolling, stopPolling } from '@/utils/oddsPoller.js'
```

并将 `import { onLoad } from '@dcloudio/uni-app'` 改为:

```js
import { onLoad, onUnload } from '@dcloudio/uni-app'
```

- [ ] **Step 2: 添加当前版本号存储变量**

在 `const loaded = ref(false)` 之后添加:

```js
const currentOddsVersion = ref(0)
```

- [ ] **Step 3: 抽取加载数据为独立函数**

将 `onLoad` 中的加载逻辑抽取为独立函数 `fetchMatchData`，以便轮询回调复用:

```js
/** 拉取比赛详情数据 */
const fetchMatchData = async (matchId) => {
  try {
    const res = await uniCloud.callFunction({
      name: 'user-match',
      data: { token: uni.getStorageSync('token') }
    })
    if (res.result && res.result.code === 0) {
      const matchData = (res.result.data.matches || []).find(m => m._id === matchId)
      if (matchData) {
        const oldOddsMap = {}
        for (const cat of categoryPlays.value) {
          for (const p of cat.plays) {
            oldOddsMap[p._id] = p.odds
          }
        }
        match.value = matchData
        categoryPlays.value = matchData.categoryPlays || []
        currentOddsVersion.value = matchData.oddsVersion || 0

        // 如果已选中的玩法赔率变了，更新 selectedPlay
        if (selectedPlay.value._id) {
          for (const cat of matchData.categoryPlays || []) {
            const found = cat.plays.find(p => p._id === selectedPlay.value._id)
            if (found) {
              selectedPlay.value = { ...found }
              break
            }
          }
        }

        // 同步购物车中的赔率
        let cartChanged = false
        for (const cat of matchData.categoryPlays || []) {
          for (const p of cat.plays) {
            if (oldOddsMap[p._id] !== undefined && oldOddsMap[p._id] !== p.odds) {
              if (betCart.updateOdds(p._id, p.odds)) {
                cartChanged = true
              }
            }
          }
        }
        if (cartChanged) {
          uni.showToast({ title: '购物车赔率已更新', icon: 'none', duration: 2000 })
        }
      }
    }
  } catch (e) {
    console.error('加载赛事失败:', e)
  }
}
```

- [ ] **Step 4: 修改 onLoad，启动轮询**

```js
let pollingMatchId = ''

onLoad(async (options) => {
  const matchId = options.id
  if (!matchId) return
  pollingMatchId = matchId

  await fetchMatchData(matchId)
  loaded.value = true

  // 启动赔率轮询
  startPolling({
    matchIds: [matchId],
    versions: { [matchId]: currentOddsVersion.value },
    onChange: async (changedIds) => {
      await fetchMatchData(matchId)
    }
  })
})
```

- [ ] **Step 5: 添加 onUnload，停止轮询**

在 `onLoad` 之后添加:

```js
onUnload(() => {
  stopPolling()
})
```

- [ ] **Step 6: Commit**

```bash
git add kaiyun/pages/match/detail.vue
git commit -m "feat: 比赛详情页集成赔率自动刷新 + 购物车同步提示

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 比赛列表页集成赔率自动刷新

**Files:**
- Modify: `kaiyun/pages/index/index.vue`

- [ ] **Step 1: 引入 oddsPoller**

```js
import { startPolling, stopPolling } from '@/utils/oddsPoller.js'
```

将 `import { onShow } from '@dcloudio/uni-app'` 改为:

```js
import { onShow, onHide } from '@dcloudio/uni-app'
```

- [ ] **Step 2: 提取加载函数并记录版本号**

将 `loadMatches` 函数改为同时记录版本号映射:

```js
const matchVersions = ref({})

const loadMatches = async () => {
  const token = uni.getStorageSync('token')
  if (!token) { uni.reLaunch({ url: '/pages/login/login' }); return }

  loading.value = true
  try {
    const res = await uniCloud.callFunction({
      name: 'user-match',
      data: { token: uni.getStorageSync('token') }
    })
    if (res.result && res.result.code === 0) {
      const matches = res.result.data.matches || []
      matchList.value = matches
      // 记录各比赛版本号
      const versions = {}
      for (const m of matches) {
        versions[m._id] = m.oddsVersion || 0
      }
      matchVersions.value = versions
    }
  } catch (e) { console.error(e) }
  loading.value = false
}
```

- [ ] **Step 3: 修改 onShow，启动轮询**

```js
onShow(() => {
  loadMatches().then(() => {
    const ids = Object.keys(matchVersions.value)
    if (ids.length > 0) {
      startPolling({
        matchIds: ids,
        versions: { ...matchVersions.value },
        onChange: async (changedIds) => {
          // 局部刷新变化的比赛
          const token = uni.getStorageSync('token')
          if (!token) return
          try {
            const res = await uniCloud.callFunction({
              name: 'user-match',
              data: { token }
            })
            if (res.result && res.result.code === 0) {
              const freshMatches = res.result.data.matches || []
              const freshMap = {}
              for (const m of freshMatches) {
                freshMap[m._id] = m
                matchVersions.value[m._id] = m.oddsVersion || 0
              }
              for (const id of changedIds) {
                const idx = matchList.value.findIndex(m => m._id === id)
                if (idx >= 0 && freshMap[id]) {
                  matchList.value[idx] = freshMap[id]
                }
              }
              // 同步购物车赔率
              let cartChanged = false
              for (const id of changedIds) {
                const freshMatch = freshMap[id]
                if (!freshMatch) continue
                for (const cat of freshMatch.categoryPlays || []) {
                  for (const p of cat.plays) {
                    betCart.updateOdds(p._id, p.odds)
                  }
                }
              }
              // 检查购物车是否有变化（通过比较 totalOdds 变化）
              // 简化：直接提示购物车可能已更新
              if (changedIds.length > 0) {
                // 只有购物车中有对应比赛时才提示
                const cartMatchIds = new Set(betCart.getMatchIds())
                const relevantChanges = changedIds.filter(id => cartMatchIds.has(id))
                if (relevantChanges.length > 0) {
                  uni.showToast({ title: '购物车赔率已更新', icon: 'none', duration: 2000 })
                }
              }
            }
          } catch (e) { console.error(e) }
        }
      })
    }
  })
})
```

- [ ] **Step 4: 添加 onHide，停止轮询**

```js
onHide(() => {
  stopPolling()
})
```

- [ ] **Step 5: Commit**

```bash
git add kaiyun/pages/index/index.vue
git commit -m "feat: 比赛列表页集成赔率自动刷新 + 局部更新

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: betCart 添加 updateOdds 方法

**Files:**
- Modify: `kaiyun/stores/betCart.js`

- [ ] **Step 1: 在 betCart 对象中添加 updateOdds 方法**

在 `hasMatch` 方法之后添加:

```js
  /** 更新指定 play 的赔率（赔率变化时由外部调用） */
  updateOdds(playId, newOdds) {
    const item = state.items.find(i => i.playId === playId)
    if (item && item.odds !== newOdds) {
      item.odds = newOdds
      return true  // 表示有变化
    }
    return false
  },
```

- [ ] **Step 2: Commit**

```bash
git add kaiyun/stores/betCart.js
git commit -m "feat: betCart 添加 updateOdds 方法用于赔率同步

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: bet-sheet 投注弹层增加赔率变化 toast

**Files:**
- Modify: `kaiyun/components/bet-sheet/bet-sheet.vue`

已经通过 props 接收 `selectedPlays`，赔率变化后父组件更新数据，子组件自动重新渲染。`totalOdds` 是 computed，会自动重算。此任务只需添加赔率变化时的 toast 提示。

- [ ] **Step 1: 监听 totalOdds 变化并 toast**

在 `<script setup>` 中，在 `totalOdds` 的 computed 之后添加 watch:

```js
import { ref, computed, watch } from 'vue'

// 在 totalOdds computed 之后添加：
const lastOdds = ref(parseFloat(totalOdds.value) || 0)

watch(totalOdds, (newVal) => {
  const num = parseFloat(newVal) || 0
  if (lastOdds.value > 0 && num !== lastOdds.value) {
    const isParlay = playList.value.length > 1
    uni.showToast({
      title: isParlay ? '购物车赔率已更新' : '赔率已更新',
      icon: 'none',
      duration: 2000
    })
  }
  lastOdds.value = num
})
```

- [ ] **Step 2: Commit**

```bash
git add kaiyun/components/bet-sheet/bet-sheet.vue
git commit -m "feat: bet-sheet 赔率变化时 toast 提示用户

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 总结

| Task | 文件 | 操作 |
|------|------|------|
| 1 | `matches.schema.json` | 新增 `oddsVersion` 字段 |
| 2 | `check-odds-version/` | 新建轻量轮询云函数 |
| 3 | `admin-play/index.js` | 3 处改赔率位置各加 `inc(oddsVersion)` |
| 4 | `user-match/index.js` | 返回 `oddsVersion` |
| 5 | `kaiyun/utils/oddsPoller.js` | 新建轮询工具 |
| 6 | `pages/match/detail.vue` | onLoad 启动轮询 + onUnload 停止 |
| 7 | `pages/index/index.vue` | onShow 启动轮询 + onHide 停止 + 局部刷新 |
| 8 | `stores/betCart.js` | 新增 `updateOdds` 方法 |
| 9 | `components/bet-sheet/bet-sheet.vue` | watch odds 变化 toast |
