<template>
  <view class="withdraw-page">
    <view class="balance-card">
      <text class="balance-label">可用余额 (¥)</text>
      <text class="balance-value">{{ balanceText }}</text>
      <text class="balance-sub">冻结 (¥) {{ frozenText }}</text>
    </view>

    <view class="apply-card">
      <view class="apply-title">提现申请</view>
      <view class="amount-row">
        <text class="currency">¥</text>
        <input
          class="amount-input"
          type="digit"
          v-model="amount"
          placeholder="请输入提现金额"
          placeholder-class="placeholder"
        />
        <text class="all-btn" @click="amount = String(Math.floor(balance * 100) / 100)">全部</text>
      </view>
      <button class="apply-btn" :disabled="submitting" @click="doApply">提交申请</button>
      <text class="apply-hint">提交后金额将被冻结，管理员审核通过后线下打款；驳回自动解冻</text>
    </view>

    <view class="record-list">
      <view class="record-title">提现记录</view>
      <view class="record-item" v-for="w in records" :key="w._id">
        <view class="record-left">
          <text class="record-amount">¥{{ Number(w.amount).toFixed(2) }}</text>
          <text class="record-time">{{ formatTime(w.applyTime) }}</text>
          <text class="record-remark" v-if="w.remark">{{ w.remark }}</text>
        </view>
        <text class="record-status" :class="w.status">{{ statusMap[w.status] || w.status }}</text>
      </view>
      <view class="empty" v-if="records.length === 0 && loaded">
        <text>暂无提现记录</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'

const balance = ref(0)
const frozen = ref(0)
const balanceText = ref('0.00')
const frozenText = ref('0.00')
const amount = ref('')
const submitting = ref(false)
const records = ref([])
const loaded = ref(false)

const statusMap = { pending: '待审核', approved: '已通过', rejected: '已驳回' }

const formatTime = (t) => {
  if (!t) return ''
  const d = new Date(t)
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0')
}

const loadAll = async () => {
  try {
    const infoRes = await uniCloud.callFunction({
      name: 'user-wallet',
      data: { token: uni.getStorageSync('token'), action: 'info' }
    })
    if (infoRes.result && infoRes.result.code === 0) {
      const d = infoRes.result.data
      balance.value = d.balance || 0
      frozen.value = d.frozenBalance || 0
      balanceText.value = Number(d.balance || 0).toFixed(2)
      frozenText.value = Number(d.frozenBalance || 0).toFixed(2)
    }
    const listRes = await uniCloud.callFunction({
      name: 'user-wallet',
      data: { token: uni.getStorageSync('token'), action: 'withdrawals', page: 1, pageSize: 50 }
    })
    if (listRes.result && listRes.result.code === 0) {
      records.value = listRes.result.data.list || []
      loaded.value = true
    }
  } catch (e) { console.error(e) }
}

const doApply = async () => {
  const amt = parseFloat(amount.value)
  if (isNaN(amt) || amt <= 0) {
    uni.showToast({ title: '请输入有效金额', icon: 'none' })
    return
  }
  if (amt > balance.value) {
    uni.showToast({ title: '可用余额不足', icon: 'none' })
    return
  }
  submitting.value = true
  try {
    const res = await uniCloud.callFunction({
      name: 'user-wallet',
      data: { token: uni.getStorageSync('token'), action: 'apply', amount: amt }
    })
    if (res.result && res.result.code === 0) {
      uni.showToast({ title: res.result.message || '申请已提交', icon: 'success' })
      amount.value = ''
      loadAll()
    } else {
      uni.showToast({ title: (res.result && res.result.message) || '申请失败', icon: 'error' })
    }
  } catch (e) {
    console.error(e)
    uni.showToast({ title: '网络错误，请重试', icon: 'error' })
  }
  submitting.value = false
}

onShow(() => { loadAll() })
</script>

<style lang="scss" scoped>
.withdraw-page { min-height: 100vh; background: #f0f2f5; padding-bottom: 60rpx; }
.balance-card {
  background: linear-gradient(135deg, #1a237e, #0d47a1);
  padding: 50rpx 40rpx; display: flex; flex-direction: column; align-items: center;
  .balance-label { font-size: 24rpx; color: rgba(255,255,255,0.7); }
  .balance-value { font-size: 60rpx; font-weight: bold; color: #fff; margin: 10rpx 0; }
  .balance-sub { font-size: 24rpx; color: rgba(255,255,255,0.7); }
}
.apply-card {
  margin: 20rpx; background: #fff; border-radius: 16rpx; padding: 30rpx;
  .apply-title { font-size: 30rpx; font-weight: bold; color: #333; margin-bottom: 20rpx; }
  .amount-row {
    display: flex; align-items: center; border-bottom: 2rpx solid #1a237e; padding: 10rpx 0;
    .currency { font-size: 36rpx; color: #d32f2f; font-weight: bold; margin-right: 10rpx; }
    .amount-input { flex: 1; font-size: 40rpx; height: 60rpx; }
    .placeholder { font-size: 28rpx; color: #ccc; }
    .all-btn { font-size: 26rpx; color: #1a237e; font-weight: bold; }
  }
  .apply-btn {
    margin-top: 30rpx; background: linear-gradient(135deg, #d32f2f, #b71c1c);
    color: #fff; border-radius: 44rpx; font-size: 30rpx; height: 88rpx; line-height: 88rpx;
  }
  .apply-hint { display: block; margin-top: 16rpx; font-size: 22rpx; color: #bbb; text-align: center; }
}
.record-list { margin: 20rpx; }
.record-title { font-size: 30rpx; font-weight: bold; color: #333; margin-bottom: 16rpx; }
.record-item {
  background: #fff; border-radius: 16rpx; padding: 24rpx 30rpx; margin-bottom: 16rpx;
  display: flex; justify-content: space-between; align-items: center;
  .record-left { display: flex; flex-direction: column; }
  .record-amount { font-size: 30rpx; font-weight: bold; color: #333; }
  .record-time { font-size: 22rpx; color: #bbb; margin-top: 6rpx; }
  .record-remark { font-size: 22rpx; color: #999; margin-top: 4rpx; }
  .record-status { font-size: 26rpx; font-weight: bold;
    &.pending { color: #ef6c00; }
    &.approved { color: #2e7d32; }
    &.rejected { color: #999; }
  }
}
.empty { text-align: center; padding: 80rpx 0; color: #999; }
</style>
