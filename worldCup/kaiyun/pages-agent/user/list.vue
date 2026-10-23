<template>
  <view class="user-page">
    <view class="search-bar">
      <input class="search-input" v-model="keyword" placeholder="搜索用户名" confirm-type="search" @confirm="doSearch" />
      <text class="search-btn" @click="doSearch">搜索</text>
    </view>

    <view class="filter-row">
      <view
        v-for="item in filters"
        :key="item.value"
        class="filter-item"
        :class="{ active: status === item.value }"
        @click="changeStatus(item.value)"
      >{{ item.label }}</view>
    </view>

    <view class="list">
      <view class="user-card" v-for="u in list" :key="u._id" @click="goDetail(u)">
        <view class="card-top">
          <view class="name-wrap">
            <text class="name">{{ u.username }}</text>
            <text class="status" :class="u.status">{{ u.status === 'active' ? '正常' : '禁用' }}</text>
          </view>
          <text class="balance">¥{{ money(u.balance) }}</text>
        </view>
        <view class="card-metrics">
          <view class="metric"><text class="m-label">累计下注</text><text class="m-value">¥{{ money(u.totalBet) }}</text></view>
          <view class="metric"><text class="m-label">累计中奖</text><text class="m-value">¥{{ money(u.totalWin) }}</text></view>
          <view class="metric"><text class="m-label">订单数</text><text class="m-value">{{ u.orderCount || 0 }}</text></view>
        </view>
        <view class="card-foot">
          <text>最近下注：{{ u.lastBetTime ? formatTime(u.lastBetTime) : '暂无' }}</text>
          <text class="arrow">></text>
        </view>
      </view>

      <view class="empty" v-if="!loading && list.length === 0">
        <text>暂无用户</text>
      </view>
      <view class="load-more" v-if="list.length > 0">
        <text v-if="loading">加载中...</text>
        <text v-else-if="hasMore" @click="loadMore">加载更多</text>
        <text v-else>没有更多了</text>
      </view>
    </view>

    <agent-tabbar current="user" />
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow, onReachBottom } from '@dcloudio/uni-app'
import AgentTabbar from '../components/agent-tabbar.vue'
import { checkAgent, getToken, money, formatTime } from '../common/agent.js'

const list = ref([])
const loading = ref(false)
const keyword = ref('')
const status = ref('')
const page = ref(1)
const pageSize = 20
const hasMore = ref(true)

const filters = [
  { label: '全部', value: '' },
  { label: '正常', value: 'active' },
  { label: '禁用', value: 'disabled' }
]

const load = async (reset) => {
  if (loading.value) return
  if (reset) {
    page.value = 1
    hasMore.value = true
    list.value = []
  }
  if (!hasMore.value) return
  loading.value = true
  try {
    const res = await uniCloud.callFunction({
      name: 'agent-user',
      data: {
        token: getToken(),
        action: 'list',
        keyword: keyword.value,
        status: status.value,
        page: page.value,
        pageSize
      }
    })
    if (res.result && res.result.code === 0) {
      const data = res.result.data || {}
      const rows = data.list || []
      list.value = reset ? rows : list.value.concat(rows)
      hasMore.value = rows.length >= pageSize
      if (hasMore.value) page.value++
    } else {
      uni.showToast({ title: (res.result && res.result.message) || '加载失败', icon: 'none' })
    }
  } catch (e) {
    console.error(e)
    uni.showToast({ title: '网络错误', icon: 'none' })
  }
  loading.value = false
}

const doSearch = () => load(true)
const changeStatus = (v) => { status.value = v; load(true) }
const loadMore = () => load(false)
const goDetail = (u) => uni.navigateTo({ url: '/pages-agent/user/detail?id=' + u._id })

onShow(() => {
  if (!checkAgent()) return
  load(true)
})
onReachBottom(() => loadMore())
</script>

<style lang="scss" scoped>
.user-page { min-height: 100vh; background: #f0f2f5; padding-bottom: 140rpx; }
.search-bar { display: flex; align-items: center; gap: 16rpx; padding: 20rpx; background: #fff; }
.search-input { flex: 1; height: 68rpx; background: #f5f6fa; border-radius: 34rpx; padding: 0 28rpx; font-size: 26rpx; }
.search-btn { font-size: 26rpx; color: #1a237e; font-weight: 500; }
.filter-row { display: flex; gap: 16rpx; padding: 20rpx; background: #fff; border-top: 1rpx solid #f5f5f5; }
.filter-item { padding: 8rpx 28rpx; border-radius: 28rpx; background: #f5f6fa; color: #666; font-size: 24rpx; }
.filter-item.active { background: #1a237e; color: #fff; }
.list { padding: 10rpx 20rpx; }
.user-card { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 20rpx; }
.card-top { display: flex; justify-content: space-between; align-items: center; }
.name-wrap { display: flex; align-items: center; gap: 12rpx; }
.name { font-size: 30rpx; font-weight: bold; color: #333; }
.status { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 10rpx; }
.status.active { background: #e8f5e9; color: #2e7d32; }
.status.disabled { background: #f5f5f5; color: #999; }
.balance { font-size: 30rpx; font-weight: bold; color: #d32f2f; }
.card-metrics { display: flex; margin-top: 20rpx; background: #f8f9ff; border-radius: 12rpx; padding: 18rpx 0; }
.metric { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6rpx; }
.m-label { font-size: 22rpx; color: #999; }
.m-value { font-size: 26rpx; font-weight: 600; color: #333; }
.card-foot { display: flex; justify-content: space-between; margin-top: 18rpx; font-size: 22rpx; color: #bbb; }
.arrow { color: #ccc; }
.empty { text-align: center; padding: 200rpx 0; color: #999; font-size: 26rpx; }
.load-more { text-align: center; padding: 30rpx 0; color: #999; font-size: 24rpx; }
</style>
