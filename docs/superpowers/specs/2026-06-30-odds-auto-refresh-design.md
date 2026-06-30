# 赔率自动刷新 — 设计文档

## 概述

管理端修改玩法赔率后，移动端在不刷新页面的情况下 2 秒内自动更新赔率显示。

## 方案：智能短轮询

管理端改赔率时自增比赛的 `oddsVersion`。移动端每 2 秒调轻量云函数检查版本号，变化时拉取新数据。

## 数据模型

### matches 新增字段

```json
{
  "oddsVersion": {
    "bsonType": "int",
    "description": "赔率版本号，每次该比赛下任意玩法赔率变更时 +1",
    "defaultValue": 0
  }
}
```

## 云函数变更

### 新增：`check-odds-version`

- 入参：`{ matchIds: string[] }`
- 出参：`{ code: 0, data: { versions: { [matchId]: version } } }`
- 逻辑：极轻量查询，只读 `matches._id` + `matches.oddsVersion`
- 批量轮询：一次请求检查所有关注的比赛

### 改造：`admin-play`

所有修改赔率的地方，更新后追加一行：

```js
await db.collection('matches').doc(matchId).update({
  oddsVersion: db.command.inc(1)
})
```

## 移动端变更

### 新增：`kaiyun/utils/oddsPoller.js`

轮询工具，输出 `startPolling` / `stopPolling`：

```
startPolling({ matchIds, onVersionChange, onError })
  → 每 2s 调 check-odds-version
  → 版本号变化 → onVersionChange(changedMatchIds)
  → 请求失败静默重试下一周期

stopPolling()
  → 清除定时器
```

### 改造：`pages/match/detail.vue`

```
onLoad:
  1. getMatchDetail() → 拿到 matchId + oddsVersion
  2. startPolling(matchId, onVersionChange → getMatchDetail → 更新列表数据 → 同步 betCart)

onUnload:
  stopPolling()
```

### 改造：`pages/index/index.vue`

```
onShow:
  1. loadMatches() → 拿到所有 matchId + oddsVersion 映射
  2. startPolling(allMatchIds, onVersionChange → loadMatchById → 局部更新该比赛数据)

onHide:
  stopPolling()
```

### 改造：`stores/betCart.js`

- 赔率更新后同步更新购物车中对应 play 的 odds
- 串关 totalOdds 重新计算
- 购物车有变化时通过 `uni.showToast` 提示"购物车赔率已更新"

### 改造：`components/bet-sheet/bet-sheet.vue`

- 无需改动逻辑，received props 自然更新
- 赔率变化时 `uni.showToast({ title: '赔率已更新', icon: 'none' })`

## 投注过程赔率变化行为

| 场景 | 行为 |
|------|------|
| 单关投注中赔率变化 | 弹层赔率实时刷新，toast 提示，金额不清空 |
| 串关购物车中某项变化 | 购物车更新，totalOdds 重算，toast 提示，金额不清空 |

## 不影响的部分

- `pages/order/list.vue` / `pages/order/detail.vue` — 展示 `oddsSnapshot`（下单时锁定的历史赔率），不参与刷新
- `user-match` 云函数 — 现有逻辑不变，可选择性返回 `oddsVersion`
- `user-order` 云函数 — 下单逻辑不变，仍用当前赔率做快照
