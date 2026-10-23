<template>
  <view class="profile-page">
    <view class="card">
      <view class="avatar">{{ (info.username || '?').slice(0, 1).toUpperCase() }}</view>
      <view class="main">
        <text class="name">{{ info.username || '代理' }}</text>
        <text class="code">代理编号：{{ info.agentCode || '-' }}</text>
        <text class="rate">佣金比例：{{ Number(info.commissionRate || 0).toFixed(2) }}%</text>
      </view>
    </view>

    <view class="section">
      <view class="menu-item" @click="goUsers">
        <text>我的用户</text><text class="arrow">></text>
      </view>
      <view class="menu-item" @click="goOrders">
        <text>用户订单</text><text class="arrow">></text>
      </view>
      <view class="menu-item" @click="goCommission">
        <text>佣金明细</text><text class="arrow">></text>
      </view>
    </view>

    <view class="section">
      <view class="info-row"><text>当前待结算佣金</text><text class="money">¥{{ money(info.commissionBalance) }}</text></view>
      <view class="info-row"><text>数据范围</text><text>仅本人名下用户</text></view>
      <view class="info-row"><text>操作权限</text><text>只读</text></view>
    </view>

    <button class="logout-btn" @click="logout">退出登录</button>

    <agent-tabbar current="profile" />
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AgentTabbar from '../components/agent-tabbar.vue'
import { checkAgent, getToken, money } from '../common/agent.js'

const info = ref({})

const loadInfo = async () => {
  try {
    const res = await uniCloud.callFunction({
      name: 'agent-commission',
      data: { token: getToken(), action: 'summary' }
    })
    if (res.result && res.result.code === 0) {
      const d = res.result.data || {}
      info.value = Object.assign({}, info.value, {
        commissionBalance: d.commissionBalance || 0,
        commissionRate: d.commissionRate || info.value.commissionRate || 0,
        paidCommission: d.paidCommission || 0,
        totalCommission: d.totalCommission || 0
      })
    }
  } catch (e) { console.error(e) }
}

onShow(() => {
  const a = checkAgent()
  if (!a) return
  info.value = a
  loadInfo()
})

const goUsers = () => uni.reLaunch({ url: '/pages-agent/user/list' })
const goOrders = () => uni.reLaunch({ url: '/pages-agent/order/list' })
const goCommission = () => uni.navigateTo({ url: '/pages-agent/commission/index' })

const logout = () => {
  uni.removeStorageSync('token')
  uni.removeStorageSync('userInfo')
  uni.reLaunch({ url: '/pages/login/login' })
}
</script>

<style lang="scss" scoped>
.profile-page { min-height: 100vh; background: #f0f2f5; padding: 20rpx; padding-bottom: 140rpx; }
.card { background: linear-gradient(135deg, #1a237e, #0d47a1); border-radius: 20rpx; padding: 36rpx; display: flex; align-items: center; gap: 24rpx; color: #fff; }
.avatar { width: 100rpx; height: 100rpx; border-radius: 50%; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; font-size: 44rpx; font-weight: bold; }
.main { display: flex; flex-direction: column; gap: 6rpx; }
.name { font-size: 36rpx; font-weight: bold; }
.code, .rate { font-size: 22rpx; opacity: .8; }
.section { background: #fff; border-radius: 16rpx; margin-top: 20rpx; padding: 0 28rpx; }
.menu-item { display: flex; justify-content: space-between; align-items: center; padding: 30rpx 0; font-size: 28rpx; color: #333; border-bottom: 1rpx solid #f5f5f5; }
.menu-item:last-child { border-bottom: none; }
.arrow { color: #ccc; }
.info-row { display: flex; justify-content: space-between; padding: 24rpx 0; font-size: 26rpx; color: #666; border-bottom: 1rpx solid #f5f5f5; }
.info-row:last-child { border-bottom: none; }
.money { color: #d32f2f; font-weight: bold; }
.logout-btn { margin-top: 50rpx; height: 88rpx; line-height: 88rpx; background: #fff; color: #d32f2f; border-radius: 44rpx; font-size: 30rpx; }
</style>
