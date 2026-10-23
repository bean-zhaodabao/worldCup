<template>
  <view class="commission-page">
    <view class="summary-card">
      <view class="summary-main">
        <text class="s-label">累计产生佣金</text>
        <text class="s-total">¥{{ money(summary.totalCommission) }}</text>
      </view>
      <view class="summary-row">
        <view class="s-item"><text class="s-l">待确认</text><text class="s-v">¥{{ money(summary.pending) }}</text></view>
        <view class="s-item"><text class="s-l">待结算</text><text class="s-v orange">¥{{ money(summary.available) }}</text></view>
        <view class="s-item"><text class="s-l">已支付</text><text class="s-v green">¥{{ money(summary.paid) }}</text></view>
      </view>
      <text class="tip">佣金由平台线下结算，如有疑问请联系管理员</text>
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
      <view class="record-card" v-for="r in list" :key="r._id">
        <view class="record-top">
          <text class="order-no">{{ r.orderNo }}</text>
          <text class="status" :class="r.status">{{ commissionStatusMap[r.status] }}</text>
        </view>
        <view class="record-body">
          <text class="user">{{ r.userName || '-' }}</text>
          <text class="base">流水 ¥{{ money(r.baseAmount) }} × {{ Number(r.rate || 0).toFixed(2) }}%</text>
        </view>
        <view class="record-foot">
          <text class="time">{{ formatTime(r.createTime) }}</text>
          <text class="amount">+¥{{ money(r.amount) }}</text>
        </view>
      </view>

      <view class="empty" v-if="!loading && list.length === 0"><text>暂无佣金记录</text></view>
      <view class="load-more" v-if="list.length > 0">
        <text v-if="loading">加载中...</text>
        <text v-else-if="hasMore" @click="loadMore">加载更多</text>
        <text v-else>没有更多了</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow, onReachBottom } from '@dcloudio/uni-app'
import { checkAgent, getToken, money, formatTime, commissionStatusMap } from '../common/agent.js'

const summary = ref({ pending: 0, available: 0, paid: 0, totalCommission: 0 })
const list = ref([])
const loading = ref(false)
const status = ref('')
const page = ref(1)
const pageSize = 20
const hasMore = ref(true)

const filters = [
  { label: '全部', value: '' },
  { label: '待确认', value: 'pending' },
  { label: '待结算', value: 'available' },
  { label: '已支付', value: 'paid' }
]

const loadSummary = async () => {
  try {
    const res = await uniCloud.callFunction({
      name: 'agent-commission',
      data: { token: getToken(), action: 'summary' }
    })
    if (res.result && res.result.code === 0) summary.value = res.result.data || summary.value
  } catch (e) { console.error(e) }
}

const loadList = async (reset) => {
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
      name: 'agent-commission',
      data: { token: getToken(), action: 'list', status: status.value, page: page.value, pageSize }
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

const changeStatus = (v) => { status.value = v; loadList(true) }
const loadMore = () => loadList(false)

onShow(() => {
  if (!checkAgent()) return
  loadSummary()
  loadList(true)
})
onReachBottom(() => loadMore())
</script>

<style lang="scss" scoped>
.commission-page { min-height: 100vh; background: #f0f2f5; padding-bottom: 60rpx; }
.summary-card { margin: 20rpx; background: linear-gradient(135deg, #1a237e, #0d47a1); border-radius: 20rpx; padding: 32rpx; color: #fff; }
.summary-main { display: flex; flex-direction: column; gap: 8rpx; }
.s-label { font-size: 24rpx; opacity: .8; }
.s-total { font-size: 52rpx; font-weight: bold; }
.summary-row { display: flex; margin-top: 28rpx; background: rgba(255,255,255,.12); border-radius: 12rpx; padding: 20rpx 0; }
.s-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6rpx; }
.s-l { font-size: 22rpx; opacity: .8; }
.s-v { font-size: 28rpx; font-weight: bold; }
.s-v.orange { color: #ffcc80; }
.s-v.green { color: #a5d6a7; }
.tip { display: block; margin-top: 20rpx; font-size: 20rpx; opacity: .7; }
.filter-row { display: flex; gap: 16rpx; padding: 0 20rpx 10rpx; }
.filter-item { padding: 8rpx 26rpx; border-radius: 28rpx; background: #fff; color: #666; font-size: 24rpx; }
.filter-item.active { background: #1a237e; color: #fff; }
.list { padding: 10rpx 20rpx; }
.record-card { background: #fff; border-radius: 16rpx; padding: 26rpx; margin-bottom: 18rpx; }
.record-top { display: flex; justify-content: space-between; align-items: center; }
.order-no { font-size: 22rpx; color: #999; }
.status { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 10rpx; }
.status.pending { background: #fff3e0; color: #ef6c00; }
.status.available { background: #e8f5e9; color: #2e7d32; }
.status.paid { background: #e3f2fd; color: #1565c0; }
.status.void { background: #f5f5f5; color: #999; }
.record-body { display: flex; justify-content: space-between; margin-top: 16rpx; font-size: 26rpx; }
.user { color: #1a237e; font-weight: 600; }
.base { color: #999; font-size: 24rpx; }
.record-foot { display: flex; justify-content: space-between; margin-top: 14rpx; }
.time { font-size: 22rpx; color: #bbb; }
.amount { font-size: 30rpx; font-weight: bold; color: #d32f2f; }
.empty { text-align: center; padding: 160rpx 0; color: #999; font-size: 26rpx; }
.load-more { text-align: center; padding: 30rpx 0; color: #999; font-size: 24rpx; }
</style>
