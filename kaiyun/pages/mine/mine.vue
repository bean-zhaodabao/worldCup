<template>
  <view class="mine-page">
    <view class="user-card">
      <image class="avatar" src="/static/logo.png"></image>
      <text class="username">{{ username }}</text>
    </view>

    <view class="menu-list">
      <view class="menu-item" @click="goOrders">
        <text>我的订单</text>
        <text class="arrow">></text>
      </view>
    </view>

    <button class="logout-btn" @click="handleLogout">退出登录</button>
  </view>
</template>

<script setup>
import { ref } from 'vue'

const username = ref('')

// 加载用户信息
try {
  const info = JSON.parse(uni.getStorageSync('userInfo') || '{}')
  username.value = info.username || '用户'
} catch (e) { username.value = '用户' }

const goOrders = () => { uni.switchTab({ url: '/pages/order/list' }) }

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
