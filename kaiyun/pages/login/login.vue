<template>
  <view class="login-page">
    <view class="login-header">
      <image class="logo" src="/static/football.png"></image>
      <text class="app-name">世界杯彩票</text>
    </view>
    <view class="login-form">
      <view class="form-item">
        <text class="label">用户名</text>
        <input class="input" v-model="username" placeholder="请输入用户名" />
      </view>
      <view class="form-item">
        <text class="label">密码</text>
        <input class="input" v-model="password" type="password" placeholder="请输入密码" />
      </view>
      <button class="login-btn" @click="handleLogin">登 录</button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'

const username = ref('')
const password = ref('')
const loading = ref(false)

const handleLogin = async () => {
  if (!username.value || !password.value) {
    uni.showToast({ title: '请输入用户名和密码', icon: 'none' })
    return
  }
  loading.value = true
  try {
    const res = await uniCloud.callFunction({
      name: 'user-auth',
      data: { username: username.value, password: password.value }
    })
    if (res.result && res.result.code === 0) {
      uni.setStorageSync('token', res.result.data.token)
      uni.setStorageSync('userInfo', JSON.stringify({
        _id: res.result.data.userId,
        username: res.result.data.username
      }))
      uni.reLaunch({ url: '/pages/index/index' })
    } else {
      uni.showToast({ title: res.result?.message || '登录失败', icon: 'error' })
    }
  } catch (e) {
    console.error(e)
    uni.showToast({ title: '网络错误，请重试', icon: 'error' })
  }
  loading.value = false
}
</script>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a237e, #0d47a1);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 120rpx;

  .login-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 60rpx;
    .logo { width: 120rpx; height: 120rpx; }
    .app-name { color: #fff; font-size: 36rpx; font-weight: bold; margin-top: 20rpx; }
  }

  .login-form {
    width: 600rpx;
    background: #fff;
    border-radius: 16rpx;
    padding: 60rpx 40rpx;

    .form-item {
      margin-bottom: 30rpx;
      .label { display: block; font-size: 28rpx; color: #333; margin-bottom: 12rpx; }
      .input {
        width: 100%; height: 80rpx; border: 1rpx solid #ddd; border-radius: 8rpx;
        padding: 0 20rpx; font-size: 28rpx; box-sizing: border-box;
      }
    }

    .login-btn {
      width: 100%; height: 88rpx; line-height: 88rpx;
      background: linear-gradient(135deg, #1a237e, #0d47a1);
      color: #fff; font-size: 32rpx; font-weight: bold;
      border-radius: 44rpx; margin-top: 30rpx; border: none;
    }
  }
}
</style>
