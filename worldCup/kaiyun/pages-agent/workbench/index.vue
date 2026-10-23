<template>
  <view class="workbench">
    <view class="hero">
      <view class="hero-top">
        <view>
          <text class="hello">代理工作台</text>
          <text class="agent-name">{{ info.username || '代理' }}</text>
        </view>
        <text class="agent-code">{{ info.agentCode || '' }}</text>
      </view>
      <view class="hero-stats">
        <view class="hero-item">
          <text class="num">{{ summary.userTotal }}</text>
          <text class="label">名下用户</text>
        </view>
        <view class="hero-item">
          <text class="num">+{{ summary.todayNewUsers }}</text>
          <text class="label">今日新增</text>
        </view>
        <view class="hero-item">
          <text class="num">¥{{ money(summary.todayBetAmount) }}</text>
          <text class="label">今日流水</text>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-title">数据概览</text>
        <text class="section-sub">近 7 天</text>
      </view>
      <view class="metric-grid">
        <view class="metric-card">
          <text class="metric-label">今日订单</text>
          <text class="metric-value">{{ summary.todayOrderCount }}</text>
        </view>
        <view class="metric-card">
          <text class="metric-label">今日中奖</text>
          <text class="metric-value red">¥{{ money(summary.todayWinAmount) }}</text>
        </view>
        <view class="metric-card">
          <text class="metric-label">今日盈亏</text>
          <text class="metric-value" :class="summary.todayProfit >= 0 ? 'green' : 'red'">¥{{ money(summary.todayProfit) }}</text>
        </view>
        <view class="metric-card">
          <text class="metric-label">活跃用户</text>
          <text class="metric-value">{{ summary.activeUsers7d }}</text>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-title">佣金</text>
        <text class="section-sub" @click="goCommission">明细 ></text>
      </view>
      <view class="commission-card">
        <view class="commission-item">
          <text class="c-label">待确认</text>
          <text class="c-value">¥{{ money(summary.pendingCommission) }}</text>
        </view>
        <view class="commission-item">
          <text class="c-label">待结算</text>
          <text class="c-value orange">¥{{ money(summary.availableCommission) }}</text>
        </view>
        <view class="commission-item">
          <text class="c-label">已支付</text>
          <text class="c-value green">¥{{ money(summary.paidCommission) }}</text>
        </view>
      </view>
      <view class="commission-total">
        <text>累计产生佣金</text>
        <text class="total-num">¥{{ money(summary.totalCommission) }}</text>
      </view>
    </view>

    <view class="section">
      <view class="section-head">
        <text class="section-title">近 7 天流水</text>
      </view>
      <view class="chart">
        <view class="bar-col" v-for="item in trend" :key="item.date">
          <view class="bar-area">
            <view class="bar" :style="{ height: barHeight(item.betAmount) }"></view>
          </view>
          <text class="bar-date">{{ shortDate(item.date) }}</text>
        </view>
      </view>
    </view>

    <view class="quick">
      <view class="quick-item" @click="goUsers">
        <text class="quick-icon">👥</text>
        <text>我的用户</text>
      </view>
      <view class="quick-item" @click="goOrders">
        <text class="quick-icon">📋</text>
        <text>用户订单</text>
      </view>
      <view class="quick-item" @click="goCommission">
        <text class="quick-icon">💰</text>
        <text>佣金明细</text>
      </view>
    </view>

    <agent-tabbar current="workbench" />
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AgentTabbar from '../components/agent-tabbar.vue'
import { checkAgent, getToken, money } from '../common/agent.js'

const info = ref({})
const summary = ref({
  userTotal: 0, todayNewUsers: 0, todayBetAmount: 0, todayOrderCount: 0,
  todayWinAmount: 0, todayProfit: 0, activeUsers7d: 0,
  pendingCommission: 0, availableCommission: 0, paidCommission: 0, totalCommission: 0,
  trend: []
})
const trend = computed(() => summary.value.trend || [])
const maxBet = computed(() => Math.max(1, ...trend.value.map(t => Number(t.betAmount) || 0)))

const barHeight = (v) => {
  const h = Math.max(6, Math.round((Number(v) || 0) / maxBet.value * 120))
  return h + 'rpx'
}
const shortDate = (d) => (d || '').slice(5)

const load = async () => {
  try {
    const res = await uniCloud.callFunction({
      name: 'agent-dashboard',
      data: { token: getToken(), action: 'summary' }
    })
    if (res.result && res.result.code === 0) {
      summary.value = Object.assign(summary.value, res.result.data || {})
    } else {
      uni.showToast({ title: (res.result && res.result.message) || '加载失败', icon: 'none' })
    }
  } catch (e) {
    console.error(e)
    uni.showToast({ title: '网络错误', icon: 'none' })
  }
}

onShow(() => {
  const a = checkAgent()
  if (!a) return
  info.value = a
  load()
})

const goUsers = () => uni.reLaunch({ url: '/pages-agent/user/list' })
const goOrders = () => uni.reLaunch({ url: '/pages-agent/order/list' })
const goCommission = () => uni.navigateTo({ url: '/pages-agent/commission/index' })
</script>

<style lang="scss" scoped>
.workbench { min-height: 100vh; background: #f0f2f5; padding-bottom: 140rpx; }
.hero {
  background: linear-gradient(135deg, #1a237e, #0d47a1);
  padding: 40rpx 32rpx 36rpx;
  color: #fff;
  border-radius: 0 0 32rpx 32rpx;
  .hero-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .hello { display: block; font-size: 24rpx; opacity: .8; }
  .agent-name { display: block; font-size: 40rpx; font-weight: bold; margin-top: 8rpx; }
  .agent-code { font-size: 22rpx; opacity: .8; background: rgba(255,255,255,.15); padding: 6rpx 16rpx; border-radius: 20rpx; }
  .hero-stats { display: flex; margin-top: 36rpx; }
  .hero-item { flex: 1; display: flex; flex-direction: column; gap: 6rpx; }
  .hero-item .num { font-size: 32rpx; font-weight: bold; }
  .hero-item .label { font-size: 22rpx; opacity: .75; }
}
.section { background: #fff; margin: 20rpx; border-radius: 16rpx; padding: 28rpx; }
.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
.section-title { font-size: 30rpx; font-weight: bold; color: #333; }
.section-sub { font-size: 24rpx; color: #999; }
.metric-grid { display: flex; flex-wrap: wrap; }
.metric-card { width: 50%; display: flex; flex-direction: column; gap: 8rpx; padding: 14rpx 0; box-sizing: border-box; }
.metric-label { font-size: 24rpx; color: #999; }
.metric-value { font-size: 34rpx; font-weight: bold; color: #333; }
.metric-value.red { color: #d32f2f; }
.metric-value.green { color: #2e7d32; }
.commission-card { display: flex; background: #f8f9ff; border-radius: 12rpx; padding: 24rpx 0; }
.commission-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx; }
.c-label { font-size: 22rpx; color: #999; }
.c-value { font-size: 30rpx; font-weight: bold; color: #333; }
.c-value.orange { color: #ef6c00; }
.c-value.green { color: #2e7d32; }
.commission-total { display: flex; justify-content: space-between; margin-top: 20rpx; font-size: 26rpx; color: #666; }
.total-num { font-size: 30rpx; font-weight: bold; color: #1a237e; }
.chart { display: flex; align-items: flex-end; height: 180rpx; padding-top: 10rpx; }
.bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
.bar-area { flex: 1; display: flex; align-items: flex-end; width: 100%; justify-content: center; }
.bar { width: 28rpx; background: linear-gradient(180deg, #5c6bc0, #1a237e); border-radius: 8rpx 8rpx 0 0; min-height: 6rpx; }
.bar-date { font-size: 18rpx; color: #999; margin-top: 10rpx; }
.quick { display: flex; margin: 20rpx; background: #fff; border-radius: 16rpx; padding: 24rpx 0; }
.quick-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx; font-size: 24rpx; color: #333; }
.quick-icon { font-size: 40rpx; }
</style>
