<template>
  <view class="order-list">
    <view class="top-bar"><text class="title">我的订单</text></view>

    <view class="list">
      <view class="order-card" v-for="order in orders" :key="order._id" @click="goDetail(order)">
        <view class="order-head">
          <text class="order-no">单号: {{ order.orderNo }}</text>
          <text class="order-status" :class="order.status">{{ statusMap[order.status] }}</text>
        </view>
        <view class="order-body">
          <text class="match-name">{{ order.matchName }}</text>
          <view class="play-items">
            <text v-for="item in order.items" :key="item._id">{{ item.playName }} @{{ item.oddsSnapshot }}</text>
          </view>
        </view>
        <view class="order-foot">
          <text>下注: ¥{{ order.betAmount }}</text>
          <text v-if="order.status === 'won'">中奖: ¥{{ order.winAmount }}</text>
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
.top-bar {
  background: linear-gradient(135deg, #1a237e, #0d47a1);
  padding: 30rpx; .title { color: #fff; font-size: 36rpx; font-weight: bold; }
}
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
    .play-items { margin-top: 8rpx; text { display: block; font-size: 26rpx; color: #666; } }
  }
  .order-foot { display: flex; justify-content: space-between; font-size: 28rpx; color: #333; }
}
.empty { text-align: center; padding: 200rpx 0; color: #999; }
</style>
