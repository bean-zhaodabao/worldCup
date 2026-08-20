<template>
  <view class="wallet-page">
    <view class="balance-card">
      <text class="balance-label">可用余额 (¥)</text>
      <text class="balance-value">{{ balanceText }}</text>
      <text class="balance-label">冻结 (¥) {{ frozenText }}</text>
    </view>

    <view class="log-list">
      <view class="log-item" v-for="log in logs" :key="log._id">
        <view class="log-left">
          <text class="log-type">{{ typeMap[log.type] || log.type }}</text>
          <text class="log-time">{{ formatTime(log.createTime) }}</text>
          <text class="log-remark" v-if="log.remark">{{ log.remark }}</text>
        </view>
        <view class="log-right">
          <text class="log-amount" :class="log.amount > 0 ? 'plus' : 'minus'">{{ log.amount > 0 ? '+' : '' }}{{ Number(log.amount).toFixed(2) }}</text>
          <text class="log-balance">余额 {{ Number(log.balanceAfter || 0).toFixed(2) }}</text>
        </view>
      </view>

      <view class="empty" v-if="logs.length === 0 && loaded">
        <text>暂无流水</text>
      </view>

      <view class="load-more" v-if="logs.length < total" @click="loadLogs">
        <text>加载更多</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const balanceText = ref('0.00')
const frozenText = ref('0.00')
const logs = ref([])
const total = ref(0)
const page = ref(1)
const loaded = ref(false)

const typeMap = {
  recharge: '充值',
  withdraw: '提现',
  bet: '下注',
  win: '中奖入账',
  refund: '退款',
  freeze: '提现冻结',
  unfreeze: '解冻',
  adjust: '人工调整'
}

const formatTime = (t) => {
  if (!t) return ''
  const d = new Date(t)
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0')
}

const loadInfo = async () => {
  try {
    const res = await uniCloud.callFunction({
      name: 'user-wallet',
      data: { token: uni.getStorageSync('token'), action: 'info' }
    })
    if (res.result && res.result.code === 0) {
      balanceText.value = Number(res.result.data.balance || 0).toFixed(2)
      frozenText.value = Number(res.result.data.frozenBalance || 0).toFixed(2)
    }
  } catch (e) { console.error(e) }
}

const loadLogs = async () => {
  try {
    const res = await uniCloud.callFunction({
      name: 'user-wallet',
      data: { token: uni.getStorageSync('token'), action: 'logs', page: page.value, pageSize: 20 }
    })
    if (res.result && res.result.code === 0) {
      logs.value = logs.value.concat(res.result.data.list || [])
      total.value = res.result.data.total || 0
      page.value++
      loaded.value = true
    }
  } catch (e) { console.error(e) }
}

onLoad(() => {
  loadInfo()
  loadLogs()
})
</script>

<style lang="scss" scoped>
.wallet-page { min-height: 100vh; background: #f0f2f5; }
.balance-card {
  background: linear-gradient(135deg, #1a237e, #0d47a1);
  padding: 50rpx 40rpx; display: flex; flex-direction: column; align-items: center;
  .balance-label { font-size: 24rpx; color: rgba(255,255,255,0.7); }
  .balance-value { font-size: 60rpx; font-weight: bold; color: #fff; margin: 10rpx 0; }
}
.log-list { padding: 20rpx; }
.log-item {
  background: #fff; border-radius: 16rpx; padding: 24rpx 30rpx; margin-bottom: 16rpx;
  display: flex; justify-content: space-between; align-items: center;
  .log-left { display: flex; flex-direction: column; }
  .log-type { font-size: 28rpx; font-weight: bold; color: #333; }
  .log-time { font-size: 22rpx; color: #bbb; margin-top: 6rpx; }
  .log-remark { font-size: 22rpx; color: #999; margin-top: 4rpx; }
  .log-right { display: flex; flex-direction: column; align-items: flex-end; }
  .log-amount { font-size: 32rpx; font-weight: bold;
    &.plus { color: #2e7d32; }
    &.minus { color: #d32f2f; }
  }
  .log-balance { font-size: 22rpx; color: #bbb; margin-top: 6rpx; }
}
.empty { text-align: center; padding: 120rpx 0; color: #999; }
.load-more {
  text-align: center; padding: 20rpx; color: #1a237e; font-size: 26rpx;
}
</style>
