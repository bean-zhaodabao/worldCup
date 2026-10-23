<template>
  <view class="user-detail">
    <view class="profile-card">
      <view class="avatar">{{ (user.username || '?').slice(0, 1).toUpperCase() }}</view>
      <view class="profile-main">
        <view class="name-row">
          <text class="name">{{ user.username }}</text>
          <text class="status" :class="user.status">{{ user.status === 'active' ? '正常' : '禁用' }}</text>
        </view>
        <text class="sub">注册时间：{{ formatTime(user.createTime) || '-' }}</text>
      </view>
      <view class="balance-wrap">
        <text class="balance-label">余额</text>
        <text class="balance">¥{{ money(user.balance) }}</text>
      </view>
    </view>

    <view class="section">
      <text class="section-title">数据汇总</text>
      <view class="stats-grid">
        <view class="stat"><text class="s-label">累计下注</text><text class="s-value">¥{{ money(stats.totalBet) }}</text></view>
        <view class="stat"><text class="s-label">累计中奖</text><text class="s-value red">¥{{ money(stats.totalWin) }}</text></view>
        <view class="stat"><text class="s-label">盈亏</text><text class="s-value" :class="stats.profit >= 0 ? 'green' : 'red'">¥{{ money(stats.profit) }}</text></view>
        <view class="stat"><text class="s-label">订单数</text><text class="s-value">{{ stats.orderCount || 0 }}</text></view>
        <view class="stat"><text class="s-label">今日下注</text><text class="s-value">¥{{ money(stats.todayBet) }}</text></view>
        <view class="stat"><text class="s-label">最近下注</text><text class="s-value small">{{ stats.lastBetTime ? formatTime(stats.lastBetTime) : '暂无' }}</text></view>
      </view>
    </view>

    <view class="section">
      <text class="section-title">用户信息</text>
      <view class="info-row"><text>用户ID</text><text>{{ user._id }}</text></view>
      <view class="info-row"><text>账户类型</text><text>{{ user.type === 'collector' ? '收单账户' : '散户' }}</text></view>
      <view class="info-row"><text>冻结余额</text><text>¥{{ money(user.frozenBalance) }}</text></view>
      <view class="info-row"><text>绑定代理时间</text><text>{{ formatTime(user.bindTime) || '-' }}</text></view>
    </view>

    <button class="primary-btn" @click="goOrders">查看该用户订单</button>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { checkAgent, getToken, money, formatTime } from '../common/agent.js'

const userId = ref('')
const user = ref({})
const stats = ref({})

const load = async () => {
  if (!userId.value) return
  try {
    const res = await uniCloud.callFunction({
      name: 'agent-user',
      data: { token: getToken(), action: 'detail', userId: userId.value }
    })
    if (res.result && res.result.code === 0) {
      user.value = res.result.data.user || {}
      stats.value = res.result.data.stats || {}
    } else {
      uni.showToast({ title: (res.result && res.result.message) || '加载失败', icon: 'none' })
    }
  } catch (e) {
    console.error(e)
    uni.showToast({ title: '网络错误', icon: 'none' })
  }
}

onLoad((options) => {
  if (!checkAgent()) return
  userId.value = options.id || ''
  load()
})

const goOrders = () => {
  uni.navigateTo({ url: '/pages-agent/order/list?userId=' + userId.value })
}
</script>

<style lang="scss" scoped>
.user-detail { min-height: 100vh; background: #f0f2f5; padding: 20rpx; padding-bottom: 60rpx; }
.profile-card { background: linear-gradient(135deg, #1a237e, #0d47a1); border-radius: 20rpx; padding: 32rpx; display: flex; align-items: center; gap: 20rpx; color: #fff; }
.avatar { width: 88rpx; height: 88rpx; border-radius: 50%; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; font-size: 38rpx; font-weight: bold; }
.profile-main { flex: 1; }
.name-row { display: flex; align-items: center; gap: 12rpx; }
.name { font-size: 34rpx; font-weight: bold; }
.status { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 10rpx; background: rgba(255,255,255,.2); }
.sub { display: block; font-size: 22rpx; opacity: .75; margin-top: 8rpx; }
.balance-wrap { text-align: right; }
.balance-label { display: block; font-size: 22rpx; opacity: .75; }
.balance { font-size: 34rpx; font-weight: bold; }
.section { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-top: 20rpx; }
.section-title { display: block; font-size: 30rpx; font-weight: bold; color: #333; margin-bottom: 20rpx; }
.stats-grid { display: flex; flex-wrap: wrap; }
.stat { width: 50%; display: flex; flex-direction: column; gap: 6rpx; padding: 14rpx 0; }
.s-label { font-size: 24rpx; color: #999; }
.s-value { font-size: 32rpx; font-weight: bold; color: #333; }
.s-value.small { font-size: 24rpx; font-weight: 500; }
.red { color: #d32f2f; }
.green { color: #2e7d32; }
.info-row { display: flex; justify-content: space-between; padding: 16rpx 0; font-size: 26rpx; color: #666; border-bottom: 1rpx solid #f5f5f5; }
.info-row:last-child { border-bottom: none; }
.primary-btn { margin-top: 40rpx; height: 88rpx; line-height: 88rpx; background: #1a237e; color: #fff; border-radius: 44rpx; font-size: 30rpx; }
</style>
