<template>
  <view class="order-detail">
    <view class="section">
      <text class="section-title">订单信息</text>
      <view class="info-row"><text>单号</text><text>{{ order.orderNo }}</text></view>
      <view class="info-row"><text>用户</text><text>{{ order.username || '-' }}</text></view>
      <view class="info-row"><text>类型</text><text>{{ order.isParlay ? '串关 (' + (order.matchIds || []).length + '场)' : '单关' }}</text></view>
      <view class="info-row"><text>状态</text><text>{{ statusMap[order.status] }}</text></view>
      <view class="info-row"><text>下单时间</text><text>{{ formatTime(order.createTime) }}</text></view>
    </view>

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

    <view class="section">
      <text class="section-title">投注明细</text>
      <view class="play-row" v-for="item in order.items" :key="item._id">
        <view class="play-left">
          <text class="play-name">{{ item.playName }}</text>
          <text class="play-cat" v-if="item.categoryName">{{ item.categoryName }}</text>
        </view>
        <text class="play-odds">赔率 {{ fmtOdds(item.oddsSnapshot) }}</text>
      </view>
    </view>

    <view class="section">
      <view class="info-row"><text>下注金额</text><text class="amount">¥{{ money(order.betAmount) }}</text></view>
      <view class="info-row"><text>总赔率</text><text>{{ fmtOdds(order.totalOdds) }}</text></view>
      <view class="info-row" v-if="order.winAmount !== undefined"><text>返还金额</text><text class="amount win">¥{{ money(order.winAmount) }}</text></view>
      <view class="info-row" v-if="order.commissionAmount !== undefined && order.commissionAmount !== null">
        <text>本单佣金</text><text class="amount">¥{{ money(order.commissionAmount) }}（{{ order.agentRate || 0 }}%）</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { checkAgent, getToken, money, formatTime, statusMap } from '../common/agent.js'

const order = ref({ items: [] })
const fmtOdds = (v) => Number(v || 0).toFixed(2)

onLoad(async (options) => {
  if (!checkAgent()) return
  const orderId = options.id
  if (!orderId) return
  try {
    const res = await uniCloud.callFunction({
      name: 'agent-order',
      data: { token: getToken(), action: 'detail', orderId }
    })
    if (res.result && res.result.code === 0) {
      order.value = res.result.data || { items: [] }
    } else {
      uni.showToast({ title: (res.result && res.result.message) || '加载失败', icon: 'none' })
    }
  } catch (e) {
    console.error(e)
    uni.showToast({ title: '网络错误', icon: 'none' })
  }
})
</script>

<style lang="scss" scoped>
.order-detail { min-height: 100vh; background: #f0f2f5; padding: 20rpx; }
.section { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 20rpx; }
.section-title { display: block; font-size: 30rpx; font-weight: bold; color: #333; margin-bottom: 20rpx; }
.info-row { display: flex; justify-content: space-between; padding: 14rpx 0; font-size: 26rpx; color: #666; border-bottom: 1rpx solid #f5f5f5; }
.info-row:last-child { border-bottom: none; }
.play-row { display: flex; justify-content: space-between; align-items: center; padding: 14rpx 0; font-size: 26rpx; }
.play-left { display: flex; flex-direction: column; gap: 6rpx; }
.play-name { color: #333; }
.play-cat { font-size: 22rpx; color: #999; background: #f5f5f5; padding: 2rpx 10rpx; border-radius: 8rpx; width: fit-content; }
.play-odds { color: #d32f2f; font-weight: 600; }
.amount { font-weight: bold; color: #333; }
.win { color: #d32f2f; }
.match-row { display: flex; align-items: center; gap: 12rpx; padding: 10rpx 0; border-bottom: 1rpx solid #f5f5f5; font-size: 26rpx; color: #333; }
.match-row:last-child { border-bottom: none; }
.match-index { color: #999; width: 36rpx; }
.match-name-sub { margin-left: auto; font-size: 22rpx; color: #999; }
</style>
