<template>
  <view class="match-list">
    <!-- 顶部导航 -->
    <view class="top-bar">
      <text class="title">世界杯赛事</text>
    </view>

    <!-- 赛事列表 -->
    <view class="list">
      <view class="match-card" v-for="match in matchList" :key="match._id" @click="goDetail(match)">
        <view class="match-header">
          <text class="match-name">{{ match.name }}</text>
          <text class="match-status" :class="match.status">{{ statusMap[match.status] }}</text>
        </view>
        <view class="match-teams">
          <view class="team">
            <image class="flag" :src="match.teamAFlag" mode="aspectFit"></image>
            <text class="team-name">{{ match.teamA }}</text>
          </view>
          <text class="vs">VS</text>
          <view class="team">
            <image class="flag" :src="match.teamBFlag" mode="aspectFit"></image>
            <text class="team-name">{{ match.teamB }}</text>
          </view>
        </view>
        <view class="match-time">
          <text>开赛时间: {{ match.startTime }}</text>
        </view>
      </view>

      <!-- 空状态 -->
      <view class="empty" v-if="matchList.length === 0">
        <text>暂无赛事</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'

const matchList = ref([])
const loading = ref(false)

const statusMap = { upcoming: '未开始', live: '进行中', finished: '已结束', settled: '已结算' }

const goDetail = (match) => {
  uni.navigateTo({ url: '/pages/match/detail?id=' + match._id })
}

const loadMatches = async () => {
  const token = uni.getStorageSync('token')
  if (!token) { uni.reLaunch({ url: '/pages/login/login' }); return }

  loading.value = true
  try {
    const res = await uniCloud.callFunction({
      name: 'user-match',
      data: { token: uni.getStorageSync('token') }
    })
    if (res.result && res.result.code === 0) {
      matchList.value = res.result.data.matches || []
    }
  } catch (e) { console.error(e) }
  loading.value = false
}

// 页面显示时加载
import { onShow } from '@dcloudio/uni-app'
onShow(() => { loadMatches() })
</script>

<style lang="scss" scoped>
.match-list {
  min-height: 100vh;
  background: #f0f2f5;

  .top-bar {
    background: linear-gradient(135deg, #1a237e, #0d47a1);
    padding: 30rpx 30rpx;
    .title { color: #fff; font-size: 36rpx; font-weight: bold; }
  }

  .list { padding: 20rpx; }

  .match-card {
    background: #fff;
    border-radius: 16rpx;
    padding: 30rpx;
    margin-bottom: 20rpx;
    box-shadow: 0 2rpx 12rpx rgba(0,0,0,0.06);

    .match-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 20rpx;
      .match-name { font-size: 26rpx; color: #666; }
      .match-status { font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 20rpx; }
      .upcoming { background: #e3f2fd; color: #1565c0; }
      .live { background: #e8f5e9; color: #2e7d32; }
      .finished { background: #fff3e0; color: #ef6c00; }
      .settled { background: #f5f5f5; color: #999; }
    }

    .match-teams {
      display: flex; align-items: center; justify-content: space-around;
      margin-bottom: 20rpx;
      .team { display: flex; flex-direction: column; align-items: center; }
      .flag { width: 80rpx; height: 60rpx; border-radius: 8rpx; }
      .team-name { font-size: 28rpx; font-weight: bold; margin-top: 8rpx; }
      .vs { font-size: 32rpx; font-weight: bold; color: #d32f2f; }
    }

    .match-time { font-size: 24rpx; color: #999; text-align: center; }
  }

  .empty { text-align: center; padding: 200rpx 0; color: #999; font-size: 28rpx; }
}
</style>
