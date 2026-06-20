<template>
  <view class="order-detail">
    <view class="section">
      <text class="section-title">订单信息</text>
      <view class="info-row"><text>单号</text><text>{{ order.orderNo }}</text></view>
      <view class="info-row"><text>状态</text><text>{{ statusMap[order.status] }}</text></view>
      <view class="info-row"><text>下单时间</text><text>{{ formatTime(order.createTime) }}</text></view>
    </view>
    <view class="section">
      <text class="section-title">赛事信息</text>
      <view class="info-row"><text>赛事</text><text>{{ order.matchName }}</text></view>
    </view>
    <view class="section">
      <text class="section-title">投注明细</text>
      <view class="play-row" v-for="item in order.items" :key="item._id">
        <text>{{ item.playName }}</text>
        <text>赔率: {{ item.oddsSnapshot }}</text>
      </view>
    </view>
    <view class="section">
      <view class="info-row"><text>下注金额</text><text class="amount">¥ {{ order.betAmount }}</text></view>
      <view class="info-row"><text>总赔率</text><text>{{ order.totalOdds }}</text></view>
      <view class="info-row" v-if="order.status === 'won' || order.status === 'settled'">
        <text>中奖金额</text><text class="amount win">¥ {{ order.winAmount }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const order = ref({ items: [] })
const statusMap = { pending: '待开奖', won: '已中奖', lost: '未中奖', settled: '已结算' }

const formatTime = (t) => {
  if (!t) return ''
  const d = new Date(t)
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0')
}

onLoad(async (options) => {
  const orderId = options.id
  if (!orderId) return
  try {
    const res = await uniCloud.callFunction({ name: 'user-order', data: { token: uni.getStorageSync('token') } })
    if (res.result && res.result.code === 0) {
      const found = (res.result.data.list || []).find(o => o._id === orderId)
      if (found) order.value = found
    }
  } catch (e) { console.error(e) }
})
</script>

<style lang="scss" scoped>
.order-detail { min-height: 100vh; background: #f0f2f5; padding: 20rpx; }
.section {
  background: #fff; border-radius: 16rpx; padding: 30rpx; margin-bottom: 20rpx;
  .section-title { font-size: 30rpx; font-weight: bold; color: #333; margin-bottom: 20rpx; display: block; }
  .info-row { display: flex; justify-content: space-between; padding: 12rpx 0; font-size: 28rpx; color: #666; border-bottom: 1rpx solid #f5f5f5; }
  .play-row { display: flex; justify-content: space-between; padding: 12rpx 0; font-size: 28rpx; }
  .amount { font-weight: bold; color: #333; }
  .win { color: #d32f2f; font-size: 32rpx; }
}
</style>
