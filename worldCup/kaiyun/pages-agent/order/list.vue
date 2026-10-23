<template>
  <view class="order-page">
    <view class="filter-row">
      <scroll-view scroll-x class="status-scroll">
        <view class="status-list">
          <view
            v-for="item in statusFilters"
            :key="item.value"
            class="status-item"
            :class="{ active: status === item.value }"
            @click="changeStatus(item.value)"
          >{{ item.label }}</view>
        </view>
      </scroll-view>
    </view>

    <view class="user-filter" v-if="userId">
      <text>仅显示指定用户订单</text>
      <text class="clear" @click="clearUser">查看全部</text>
    </view>

    <view class="list">
      <view class="order-card" v-for="order in list" :key="order._id" @click="goDetail(order)">
        <view class="order-head">
          <text class="order-no">{{ order.orderNo }}</text>
          <view class="head-right">
            <text class="parlay-tag" v-if="order.isParlay">串关</text>
            <text class="order-status" :class="order.status">{{ statusMap[order.status] }}</text>
          </view>
        </view>
        <view class="order-body">
          <view class="line"><text class="user">{{ order.username || '-' }}</text><text class="match">{{ order.matchName }}</text></view>
          <view class="play-items">
            <view v-for="item in order.items" :key="item._id" class="play-line">
              <text>{{ item.playName }}</text>
              <text class="odds">@{{ fmtOdds(item.oddsSnapshot) }}</text>
            </view>
          </view>
        </view>
        <view class="order-foot">
          <text>下注：¥{{ money(order.betAmount) }}</text>
          <text class="win" v-if="order.winAmount > 0">返还：¥{{ money(order.winAmount) }}</text>
        </view>
        <view class="order-time">{{ formatTime(order.createTime) }}</view>
      </view>

      <view class="empty" v-if="!loading && list.length === 0"><text>暂无订单</text></view>
      <view class="load-more" v-if="list.length > 0">
        <text v-if="loading">加载中...</text>
        <text v-else-if="hasMore" @click="loadMore">加载更多</text>
        <text v-else>没有更多了</text>
      </view>
    </view>

    <agent-tabbar current="order" />
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onShow, onReachBottom } from '@dcloudio/uni-app'
import AgentTabbar from '../components/agent-tabbar.vue'
import { checkAgent, getToken, money, formatTime, statusMap } from '../common/agent.js'

const list = ref([])
const loading = ref(false)
const status = ref('')
const userId = ref('')
const page = ref(1)
const pageSize = 20
const hasMore = ref(true)

const statusFilters = [
  { label: '全部', value: '' },
  { label: '待开奖', value: 'pending' },
  { label: '已中奖', value: 'won' },
  { label: '未中奖', value: 'lost' },
  { label: '已结算', value: 'settled' },
  { label: '已退款', value: 'refunded' }
]

const fmtOdds = (v) => Number(v || 0).toFixed(2)

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
      name: 'agent-order',
      data: {
        token: getToken(),
        action: 'list',
        status: status.value,
        userId: userId.value,
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

const changeStatus = (v) => { status.value = v; load(true) }
const loadMore = () => load(false)
const clearUser = () => { userId.value = ''; load(true) }
const goDetail = (order) => uni.navigateTo({ url: '/pages-agent/order/detail?id=' + order._id })

onLoad((options) => {
  userId.value = options.userId || ''
})
onShow(() => {
  if (!checkAgent()) return
  load(true)
})
onReachBottom(() => loadMore())
</script>

<style lang="scss" scoped>
.order-page { min-height: 100vh; background: #f0f2f5; padding-bottom: 140rpx; }
.filter-row { background: #fff; padding: 16rpx 0; }
.status-scroll { white-space: nowrap; }
.status-list { display: inline-flex; gap: 16rpx; padding: 0 20rpx; }
.status-item { padding: 8rpx 26rpx; border-radius: 28rpx; background: #f5f6fa; color: #666; font-size: 24rpx; }
.status-item.active { background: #1a237e; color: #fff; }
.user-filter { display: flex; justify-content: space-between; margin: 16rpx 20rpx 0; padding: 16rpx 24rpx; background: #e8eaf6; border-radius: 12rpx; font-size: 24rpx; color: #1a237e; }
.user-filter .clear { color: #d32f2f; }
.list { padding: 10rpx 20rpx; }
.order-card { background: #fff; border-radius: 16rpx; padding: 26rpx; margin-bottom: 20rpx; }
.order-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14rpx; }
.order-no { font-size: 22rpx; color: #999; }
.head-right { display: flex; align-items: center; gap: 8rpx; }
.parlay-tag { font-size: 20rpx; color: #fff; background: #1a237e; padding: 2rpx 12rpx; border-radius: 10rpx; }
.order-status { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 18rpx; }
.pending { background: #fff3e0; color: #ef6c00; }
.won { background: #e8f5e9; color: #2e7d32; }
.lost { background: #f5f5f5; color: #999; }
.settled { background: #e3f2fd; color: #1565c0; }
.refunded { background: #ffebee; color: #c62828; }
.line { display: flex; justify-content: space-between; gap: 12rpx; font-size: 26rpx; }
.user { color: #1a237e; font-weight: 600; }
.match { color: #666; flex: 1; text-align: right; }
.play-items { margin-top: 12rpx; }
.play-line { display: flex; gap: 12rpx; padding: 4rpx 0; font-size: 24rpx; color: #666; }
.odds { color: #d32f2f; font-weight: 600; }
.order-foot { display: flex; justify-content: space-between; margin-top: 16rpx; font-size: 26rpx; color: #333; }
.win { color: #d32f2f; font-weight: 600; }
.order-time { margin-top: 10rpx; font-size: 22rpx; color: #bbb; }
.empty { text-align: center; padding: 200rpx 0; color: #999; font-size: 26rpx; }
.load-more { text-align: center; padding: 30rpx 0; color: #999; font-size: 24rpx; }
</style>
