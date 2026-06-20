<template>
  <view class="order-list">
    <view class="list">
      <view class="order-card" v-for="order in orders" :key="order._id" @click="goDetail(order)">
        <view class="order-head">
          <text class="order-no">单号: {{ order.orderNo }}</text>
          <text class="order-status" :class="order.status">{{ statusMap[order.status] }}</text>
        </view>
        <view class="order-body">
          <text class="match-name">{{ order.matchName }}</text>
          <text class="match-teams" v-if="order.teamA || order.teamB">{{ order.teamA }} VS {{ order.teamB }}</text>
          <view class="play-items">
            <view v-for="item in order.items" :key="item._id" class="play-line">
              <text>{{ item.playName }}</text>
              <text class="play-odds">@{{ item.oddsSnapshot }}</text>
              <text class="play-cat" v-if="item.categoryName">{{ item.categoryName }}</text>
            </view>
          </view>
        </view>
        <view class="order-foot">
          <text>下注: ¥{{ order.betAmount }}</text>
          <text v-if="order.status === 'won'">中奖: ¥{{ order.winAmount }}</text>
        </view>
        <view class="order-time">
          <text>{{ formatTime(order.createTime) }}</text>
        </view>
      </view>

      <view class="empty" v-if="orders.length === 0">
        <text>暂无订单</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'

const orders = ref([])
const loading = ref(false)
const statusMap = { pending: '待开奖', won: '已中奖', lost: '未中奖', settled: '已结算' }

const formatTime = (t) => {
  if (!t) return ''
  const d = new Date(t)
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0')
}

const goDetail = (order) => {
  uni.navigateTo({ url: '/pages/order/detail?id=' + order._id })
}

const loadOrders = async () => {
  loading.value = true
  try {
    const res = await uniCloud.callFunction({
      name: 'user-order',
      data: { token: uni.getStorageSync('token'), action: 'list' }
    })
    if (res.result && res.result.code === 0) {
      orders.value = res.result.data.list || []
    }
  } catch (e) { console.error(e) }
  loading.value = false
}


onShow(() => { loadOrders() })
</script>

<style lang="scss" scoped>
.order-list { min-height: 100vh; background: #f0f2f5; }
.order-card {
  background: #fff; margin: 20rpx; border-radius: 16rpx; padding: 30rpx;
  .order-head {
    display: flex; justify-content: space-between; margin-bottom: 16rpx;
    .order-no { font-size: 24rpx; color: #999; }
    .order-status { font-size: 24rpx; padding: 4rpx 16rpx; border-radius: 20rpx; }
    .pending { background: #fff3e0; color: #ef6c00; }
    .won { background: #e8f5e9; color: #2e7d32; }
    .lost { background: #f5f5f5; color: #999; }
    .settled { background: #e3f2fd; color: #1565c0; }
  }
  .order-body {
    margin-bottom: 16rpx; .match-name { font-weight: bold; font-size: 30rpx; }
    .match-teams { display: block; font-size: 26rpx; color: #1a237e; margin-top: 6rpx; font-weight: 500; }
    .play-items { margin-top: 8rpx;
      .play-line { display: flex; align-items: center; flex-wrap: wrap; gap: 8rpx; padding: 4rpx 0; }
      .play-odds { font-size: 26rpx; color: #d32f2f; font-weight: bold; }
      .play-cat { font-size: 22rpx; color: #999; background: #f5f5f5; padding: 2rpx 10rpx; border-radius: 8rpx; }
    }
  }
  .order-foot { display: flex; justify-content: space-between; font-size: 28rpx; color: #333; }
  .order-time { margin-top: 10rpx; font-size: 22rpx; color: #bbb; }
}
.empty { text-align: center; padding: 200rpx 0; color: #999; }
</style>
