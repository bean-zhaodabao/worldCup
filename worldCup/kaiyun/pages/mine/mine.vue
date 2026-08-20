<template>
  <view class="mine-page">
    <view class="user-card">
      <image class="avatar" src="/static/football.png"></image>
      <text class="username">{{ username }}</text>
      <text class="type-tag" :class="userType">{{ typeText }}</text>
    </view>

    <!-- 散户: 钱包卡片 -->
    <view class="wallet-card" v-if="userType === 'retail'" @click="goWallet">
      <view class="wallet-row">
        <view class="wallet-item">
          <text class="wallet-label">可用余额 (¥)</text>
          <text class="wallet-value">{{ balanceText }}</text>
        </view>
        <view class="wallet-item">
          <text class="wallet-label">提现冻结 (¥)</text>
          <text class="wallet-value frozen">{{ frozenText }}</text>
        </view>
      </view>
      <view class="wallet-hint">
        <text>充值请联系管理员 · 点击查看资金流水</text>
      </view>
    </view>

    <view class="menu-list">
      <view class="menu-item" @click="goOrders">
        <text>我的订单</text>
        <text class="arrow">></text>
      </view>
      <template v-if="userType === 'retail'">
        <view class="menu-item" @click="goWallet">
          <text>资金流水</text>
          <text class="arrow">></text>
        </view>
        <view class="menu-item" @click="goWithdraw">
          <text>提现</text>
          <text class="arrow">></text>
        </view>
      </template>
    </view>

    <button class="logout-btn" @click="handleLogout">退出登录</button>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'

const username = ref('')
const userType = ref('retail')
const balance = ref(0)
const frozenBalance = ref(0)

const typeText = ref('散户')

try {
  const info = JSON.parse(uni.getStorageSync('userInfo') || '{}')
  username.value = info.username || '用户'
  if (info.type) {
    userType.value = info.type
    typeText.value = info.type === 'collector' ? '收单账户' : '散户'
  }
} catch (e) { username.value = '用户' }

const balanceText = ref('0.00')
const frozenText = ref('0.00')

const loadWallet = async () => {
  if (userType.value !== 'retail') return
  try {
    const res = await uniCloud.callFunction({
      name: 'user-wallet',
      data: { token: uni.getStorageSync('token'), action: 'info' }
    })
    if (res.result && res.result.code === 0) {
      const d = res.result.data
      balance.value = d.balance || 0
      frozenBalance.value = d.frozenBalance || 0
      balanceText.value = Number(d.balance || 0).toFixed(2)
      frozenText.value = Number(d.frozenBalance || 0).toFixed(2)
      userType.value = d.type
      typeText.value = d.type === 'collector' ? '收单账户' : '散户'
    }
  } catch (e) { console.error(e) }
}

onShow(() => { loadWallet() })

const goOrders = () => { uni.switchTab({ url: '/pages/order/list' }) }
const goWallet = () => { uni.navigateTo({ url: '/pages/mine/wallet' }) }
const goWithdraw = () => { uni.navigateTo({ url: '/pages/mine/withdraw' }) }

const handleLogout = () => {
  uni.removeStorageSync('token')
  uni.removeStorageSync('userInfo')
  uni.reLaunch({ url: '/pages/login/login' })
}
</script>

<style lang="scss" scoped>
.mine-page { min-height: 100vh; background: #f0f2f5; }
.user-card {
  background: linear-gradient(135deg, #1a237e, #0d47a1);
  padding: 60rpx 40rpx; display: flex; flex-direction: column; align-items: center;
  .avatar { width: 120rpx; height: 120rpx; border-radius: 50%; border: 4rpx solid rgba(255,255,255,0.3); }
  .username { color: #fff; font-size: 32rpx; margin-top: 16rpx; }
  .type-tag {
    margin-top: 10rpx; font-size: 22rpx; padding: 4rpx 20rpx;
    border-radius: 20rpx; color: #fff; background: rgba(255,255,255,0.2);
    &.collector { background: #ef6c00; }
  }
}
.wallet-card {
  margin: 20rpx; background: linear-gradient(135deg, #fff, #f8f9ff);
  border-radius: 16rpx; padding: 30rpx; box-shadow: 0 2rpx 12rpx rgba(0,0,0,0.04);
  .wallet-row { display: flex; }
  .wallet-item { flex: 1; display: flex; flex-direction: column;
    &:last-child { align-items: flex-end; }
    .wallet-label { font-size: 24rpx; color: #999; }
    .wallet-value { font-size: 44rpx; font-weight: bold; color: #d32f2f; margin-top: 8rpx; }
    .wallet-value.frozen { color: #1a237e; }
  }
  .wallet-hint { margin-top: 16rpx; font-size: 22rpx; color: #bbb; }
}
.menu-list {
  margin: 20rpx; background: #fff; border-radius: 16rpx;
  .menu-item { display: flex; justify-content: space-between; padding: 30rpx; font-size: 30rpx; border-bottom: 1rpx solid #f5f5f5;
    .arrow { color: #ccc; } }
}
.logout-btn {
  margin: 40rpx 20rpx; background: #fff; color: #d32f2f; border: 1rpx solid #d32f2f;
  border-radius: 44rpx; font-size: 30rpx; height: 88rpx; line-height: 88rpx;
}
</style>
