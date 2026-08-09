<template>
  <view class="order-detail">
    <view class="section">
      <text class="section-title">订单信息</text>
      <view class="info-row"><text>单号</text><text>{{ order.orderNo }}</text></view>
      <view class="info-row">
        <text>类型</text>
        <text :class="order.isParlay ? 'parlay-text' : 'single-text'">
          {{ order.isParlay ? '串关 (' + (order.matchIds || []).length + '场)' : '单关' }}
        </text>
      </view>
      <view class="info-row"><text>状态</text><text>{{ statusMap[order.status] }}</text></view>
      <view class="info-row"><text>下单时间</text><text>{{ formatTime(order.createTime) }}</text></view>
    </view>

    <!-- 赛事信息 -->
    <view class="section">
      <text class="section-title">赛事信息</text>
      <template v-if="order.matches && order.matches.length > 1">
        <view class="match-row" v-for="(m, i) in order.matches" :key="m._id || i">
          <text class="match-index">{{ i + 1 }}.</text>
          <text>{{ m.teamA }} VS {{ m.teamB }}</text>
          <text class="match-name-sub">{{ m.name }}</text>
        </view>
      </template>
      <template v-else>
        <view class="info-row"><text>赛事</text><text>{{ order.matchName }}</text></view>
        <view class="info-row" v-if="order.teamA || order.teamB">
          <text>对阵</text><text>{{ order.teamA }} VS {{ order.teamB }}</text>
        </view>
      </template>
    </view>

    <!-- 投注明细 -->
    <view class="section">
      <text class="section-title">投注明细</text>
      <view class="play-row" v-for="item in order.items" :key="item._id">
        <view class="play-left">
          <text class="play-name">{{ item.playName }}</text>
          <text class="play-match-tag" v-if="order.isParlay && (item.teamA || item.matchName)">
            {{ item.teamA ? (item.teamA + ' VS ' + item.teamB) : item.matchName }}
          </text>
        </view>
        <text class="play-odds">赔率: {{ item.oddsSnapshot }}</text>
      </view>
    </view>

    <!-- 金额 -->
    <view class="section">
      <view class="info-row"><text>下注金额</text><text class="amount">¥ {{ order.betAmount }}</text></view>
      <view class="info-row"><text>总赔率</text><text>{{ order.totalOdds }}</text></view>
      <view class="info-row">
        <text>可赢额</text><text class="amount winnable">¥ {{ (order.betAmount * order.totalOdds - order.betAmount).toFixed(2) }}</text>
      </view>
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
  .play-row { display: flex; justify-content: space-between; align-items: center; padding: 12rpx 0; font-size: 28rpx; }
  .play-left { display: flex; flex-direction: column; }
  .play-name { color: #333; }
  .play-match-tag { font-size: 22rpx; color: #1a237e; background: #e8eaf6; padding: 2rpx 12rpx; border-radius: 8rpx; margin-top: 4rpx; display: inline-block; width: fit-content; }
  .play-odds { color: #d32f2f; font-weight: bold; }
  .amount { font-weight: bold; color: #333; }
  .winnable { color: #ef6c00; font-size: 32rpx; }
  .win { color: #d32f2f; font-size: 32rpx; }
  .parlay-text { color: #1a237e; font-weight: bold; }
  .single-text { color: #666; }

  .match-row {
    display: flex; align-items: center; gap: 12rpx; padding: 10rpx 0;
    border-bottom: 1rpx solid #f5f5f5;
    &:last-child { border-bottom: none; }
    .match-index { color: #999; font-size: 24rpx; width: 36rpx; }
    font-size: 28rpx; color: #333;
    .match-name-sub { font-size: 24rpx; color: #999; margin-left: auto; }
  }
}
</style>
