# 玩法排序 — 设计文档

## 概述

管理端支持为玩法设置排序序号，移动端按排序展示玩法。

## 数据模型

### plays 新增字段

```json
"sort": {
  "bsonType": "int",
  "title": "排序",
  "description": "数字越小越靠前",
  "default": 0
}
```

## 云函数变更

### admin-play

- GET 查询：`.orderBy('sort', 'asc')`
- POST/PUT：支持 `sort` 字段写入

### user-match

- plays 查询：`.orderBy('sort', 'asc')` 确保移动端有序

## 管理端变更

### play/index.vue（玩法管理）

- 表格加"排序"列，`el-input-number` 行内编辑，change 时调 `updatePlay(id, { sort })`
- 新增/编辑弹窗加排序字段

### match/plays.vue（赛事玩法）

- 同上：表格加排序列 + 弹窗加排序字段

## 移动端

无需改动，云函数已按 sort 排序返回。
