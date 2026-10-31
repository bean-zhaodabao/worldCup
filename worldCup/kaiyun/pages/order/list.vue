<template>
  <view class="order-page">
    <!-- 时间筛选 -->
    <view class="filter-wrap">
      <view class="filter-bar">
        <view
          v-for="tab in tabs"
          :key="tab.key"
          class="filter-tab"
          :class="{ active: activeTab === tab.key }"
          @click="switchTab(tab.key)"
        >
          <text>{{ tab.label }}</text>
        </view>
      </view>

      <!-- 自定义日期 -->
      <view class="custom-range" v-if="activeTab === 'custom'">
        <picker mode="date" :value="customStart" :end="customEnd || todayStr" @change="onStartChange">
          <view class="date-picker">{{ customStart || '开始日期' }}</view>
        </picker>
        <text class="range-sep">至</text>
        <picker mode="date" :value="customEnd" :start="customStart" :end="todayStr" @change="onEndChange">
          <view class="date-picker">{{ customEnd || '结束日期' }}</view>
        </picker>
        <view class="range-confirm" @click="applyCustom">确定</view>
      </view>
    </view>

    <!-- 注单汇总 -->
    <view class="summary">
      <view class="summary-item">
        <text class="summary-label">注单总数</text>
        <text class="summary-value">{{ summary.count }}</text>
      </view>
      <view class="summary-divider"></view>
      <view class="summary-item">
        <text class="summary-label">投注总额</text>
        <text class="summary-value">{{ money(summary.bet) }}</text>
      </view>
      <view class="summary-divider"></view>
      <view class="summary-item">
        <text class="summary-label">总输赢</text>
        <text class="summary-value" :class="summary.profit >= 0 ? 'profit-up' : 'profit-down'">
          {{ summary.profit > 0 ? '+' : '' }}{{ money(summary.profit) }}
        </text>
      </view>
    </view>

    <view class="list">
      <view
        class="order-card"
        v-for="order in filteredOrders"
        :key="order._id"
        :class="'state-' + stateOf(order)"
        @click="goDetail(order)"
      >
        <!-- 赛事 / 串关标题 -->
        <view class="card-head">
          <view class="head-left">
            <text class="teams">{{ headText(order) }}</text>
          </view>
          <text class="state-pill" :class="stateOf(order)">{{ stateText(order) }}</text>
        </view>

        <!-- 投注内容 -->
        <view class="bet-box" v-for="item in (order.items || [])" :key="item._id">
          <text class="bet-cat">{{ item.categoryName || '投注' }}</text>
          <text class="bet-pick">{{ pickText(item) }} @{{ fmtOdds(item.oddsSnapshot) }}</text>
          <text class="bet-sub" v-if="order.isParlay && (item.teamA || item.matchName)">
            {{ item.teamA ? item.teamA + ' VS ' + item.teamB : item.matchName }}
          </text>
        </view>

        <!-- 联赛 -->
        <view class="league-line" v-if="!order.isParlay && order.matchName">
          <text>[足球] {{ order.matchName }}</text>
        </view>

        <!-- 订单信息 -->
        <view class="info-list">
          <view class="info-row">
            <text class="info-label">投注单号</text>
            <view class="info-value-wrap">
              <text class="info-value mono">{{ order.orderNo }}</text>
              <text class="copy-btn" @click.stop="copyOrderNo(order.orderNo)">复制</text>
            </view>
          </view>
          <view class="info-row">
            <text class="info-label">投注时间</text>
            <text class="info-value">{{ formatTime(order.createTime) }}</text>
          </view>
          <view class="info-row" v-if="startTimeOf(order)">
            <text class="info-label">开赛时间</text>
            <text class="info-value">{{ formatTime(startTimeOf(order)) }}</text>
          </view>
          <view class="info-row" v-if="scoreTextOf(order)">
            <text class="info-label">结果比分</text>
            <text class="info-value score">{{ scoreTextOf(order) }}</text>
          </view>
          <view class="info-row">
            <text class="info-label">投注额</text>
            <text class="info-value amount">{{ money(order.betAmount) }}元</text>
          </view>
          <view class="info-row">
            <text class="info-label">可赢额</text>
            <text class="info-value amount winnable">{{ money(winnableOf(order)) }}元</text>
          </view>
          <view class="info-row">
            <text class="info-label settle-label">结算</text>
            <text class="info-value settle-value" :class="stateOf(order)">{{ settleText(order) }}</text>
          </view>
          <view class="info-row">
            <text class="info-label">注单状态</text>
            <text class="info-value" :class="'text-' + stateOf(order)">{{ orderStatusText(order) }}</text>
          </view>
        </view>
      </view>

      <view class="empty" v-if="loading && orders.length === 0">
        <text>加载中...</text>
      </view>
      <view class="empty" v-else-if="!loading && filteredOrders.length === 0">
        <text>该时间段暂无订单</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { fmtOdds, rqHandicapText, dxqHandicapText } from '@/utils/format.js'

const orders = ref([])
const loading = ref(false)

const tabs = [
  { key: 'today', label: '今日' },
  { key: 'yesterday', label: '昨日' },
  { key: 'week', label: '近7日' },
  { key: 'month', label: '近30日' },
  { key: 'custom', label: '自定义' }
]
const activeTab = ref('today')
const customStart = ref('')
const customEnd = ref('')
const appliedStart = ref('')
const appliedEnd = ref('')

const pad = (n) => String(n).padStart(2, '0')

const dateStr = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())

const todayStr = ref(dateStr(new Date()))

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

const parseDate = (s) => {
  const parts = String(s || '').split('-').map(Number)
  if (parts.length !== 3 || !parts[0]) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

const range = computed(() => {
  const today = startOfDay(new Date())
  switch (activeTab.value) {
    case 'today': return [today, addDays(today, 1)]
    case 'yesterday': return [addDays(today, -1), today]
    case 'week': return [addDays(today, -6), addDays(today, 1)]
    case 'month': return [addDays(today, -29), addDays(today, 1)]
    case 'custom': {
      const s = parseDate(appliedStart.value)
      const e = parseDate(appliedEnd.value)
      if (!s || !e) return null
      return [s, addDays(e, 1)]
    }
    default: return null
  }
})

const filteredOrders = computed(() => {
  const r = range.value
  if (!r) return orders.value
  const start = r[0].getTime()
  const end = r[1].getTime()
  return orders.value.filter(o => {
    const t = new Date(o.createTime).getTime()
    return t >= start && t < end
  })
})

const summary = computed(() => {
  let bet = 0
  let profit = 0
  for (const o of filteredOrders.value) {
    const b = Number(o.betAmount) || 0
    bet += b
    if (o.status === 'pending' || o.status === 'refunded') continue
    profit += (Number(o.winAmount) || 0) - b
  }
  return { count: filteredOrders.value.length, bet, profit }
})

const switchTab = (key) => {
  activeTab.value = key
}

const onStartChange = (e) => {
  customStart.value = e.detail.value
  if (customEnd.value && customEnd.value < customStart.value) customEnd.value = customStart.value
}

const onEndChange = (e) => {
  customEnd.value = e.detail.value
}

const applyCustom = () => {
  if (!customStart.value || !customEnd.value) {
    uni.showToast({ title: '请选择起止日期', icon: 'none' })
    return
  }
  appliedStart.value = customStart.value
  appliedEnd.value = customEnd.value
}

const money = (v) => {
  const n = Number(v) || 0
  const sign = n < 0 ? '-' : ''
  return sign + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 可赢额(净赢)，与订单详情保持一致 */
const winnableOf = (order) => {
  const bet = Number(order.betAmount) || 0
  const odds = Number(order.totalOdds) || 0
  return bet * odds - bet
}

const formatTime = (t) => {
  if (!t) return ''
  const d = new Date(t)
  if (isNaN(d.getTime())) return ''
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

const stateOf = (order) => {
  if (order.status === 'pending') return 'pending'
  if (order.status === 'refunded') return 'refunded'
  if (order.status === 'won') return 'won'
  if (order.status === 'lost') return 'lost'
  if (order.status === 'settled') {
    const win = Number(order.winAmount) || 0
    const bet = Number(order.betAmount) || 0
    if (win > bet) return 'won'
    if (win > 0 && win === bet) return 'settled'
    return 'lost'
  }
  return 'pending'
}

const stateText = (order) => {
  const map = { pending: '待开奖', won: '已中奖', lost: '未中奖', settled: '已结算', refunded: '已退款' }
  return map[stateOf(order)] || '待开奖'
}

const orderStatusText = (order) => {
  if (order.status === 'pending') return '投注成功'
  return stateText(order)
}

const settleText = (order) => {
  const state = stateOf(order)
  const win = Number(order.winAmount) || 0
  const bet = Number(order.betAmount) || 0
  if (state === 'pending') return '待结算'
  if (state === 'refunded') return '退款 ' + money(bet) + '元'
  if (state === 'settled') return '返还 ' + money(win) + '元'
  if (state === 'won') {
    const profit = win - bet
    return profit >= 0 ? '赢 +' + money(profit) + '元' : '返还 ' + money(win) + '元'
  }
  if (win > 0) return '输 ' + money(bet - win) + '元'
  return '输 ' + money(bet) + '元'
}

const headText = (order) => {
  if (order.isParlay) {
    const count = (order.matches && order.matches.length) ||
      (order.matchIds && order.matchIds.length) ||
      (order.items && order.items.length) || 0
    return '串关 ' + count + ' 场'
  }
  if (order.teamA || order.teamB) return (order.teamA || '') + ' VS ' + (order.teamB || '')
  return order.matchName || '单关'
}

const pickText = (item) => {
  const cat = item.categoryName || ''
  const name = item.playName || ''
  const h = item.handicap
  if (cat === '让球盘') return name + ' ' + rqHandicapText(h)
  if (cat === '大小球') return name + ' ' + dxqHandicapText(h)
  if (cat === '让球胜平负' && h !== undefined && h !== null && h !== '') return name + '(' + rqHandicapText(h) + ')'
  return name
}

const startTimeOf = (order) => {
  const matches = order.matches || []
  if (!matches.length) return ''
  const times = matches.map(m => m.startTime ? new Date(m.startTime).getTime() : NaN).filter(t => !isNaN(t))
  if (!times.length) return ''
  return new Date(Math.min.apply(null, times))
}

const scoreTextOf = (order) => {
  if (order.isParlay) return ''
  const m = (order.matches || [])[0]
  if (!m || m.status === 'upcoming') return ''
  const hs = m.homeScore
  const gs = m.guestScore
  if (hs === null || hs === undefined || gs === null || gs === undefined) return ''
  let text = hs + ' - ' + gs
  const hh = m.homeHalfScore
  const hg = m.guestHalfScore
  if (hh !== null && hh !== undefined && hg !== null && hg !== undefined) {
    text += '（半 ' + hh + '-' + hg + '）'
  }
  return text
}

const copyOrderNo = (no) => {
  uni.setClipboardData({
    data: String(no || ''),
    success: () => uni.showToast({ title: '单号已复制', icon: 'none' })
  })
}

const goDetail = (order) => {
  uni.navigateTo({ url: '/pages/order/detail?id=' + order._id })
}

const loadOrders = async () => {
  loading.value = true
  try {
    const res = await uniCloud.callFunction({
      name: 'user-order',
      data: { token: uni.getStorageSync('token'), page: 1, pageSize: 100 }
    })
    if (res.result && res.result.code === 0) {
      orders.value = res.result.data.list || []
    }
  } catch (e) { console.error(e) }
  loading.value = false
}

onShow(() => {
  todayStr.value = dateStr(new Date())
  loadOrders()
})
</script>

<style lang="scss" scoped>
.order-page { min-height: 100vh; background: #f0f2f5; padding-bottom: 30rpx; }

/* 筛选 */
.filter-wrap {
  position: sticky; top: 0; z-index: 20;
  padding: 16rpx 20rpx 0; background: #f0f2f5;
}
.filter-bar {
  display: flex; align-items: center; background: #fff;
  border-radius: 16rpx; padding: 8rpx;
  box-shadow: 0 4rpx 16rpx rgba(26, 35, 126, 0.06);
  .filter-tab {
    flex: 1; text-align: center; padding: 16rpx 0;
    font-size: 26rpx; color: #666; border-radius: 12rpx;
    transition: all 0.2s;
    &.active { color: #1a237e; font-weight: bold; background: #eef1fb; }
  }
}
.custom-range {
  display: flex; align-items: center; gap: 12rpx;
  margin-top: 12rpx; padding: 18rpx 20rpx;
  background: #fff; border-radius: 16rpx;
  box-shadow: 0 4rpx 16rpx rgba(26, 35, 126, 0.06);
  .date-picker {
    min-width: 170rpx; text-align: center;
    font-size: 24rpx; color: #333;
    background: #f5f6fa; padding: 12rpx 18rpx; border-radius: 10rpx;
  }
  .range-sep { font-size: 24rpx; color: #999; }
  .range-confirm {
    margin-left: auto; background: #1a237e; color: #fff;
    font-size: 24rpx; padding: 12rpx 28rpx; border-radius: 10rpx;
  }
}

/* 汇总 */
.summary {
  display: flex; align-items: center;
  margin: 20rpx; padding: 26rpx 10rpx;
  border-radius: 20rpx;
  background: linear-gradient(135deg, #1a237e, #0d47a1);
  box-shadow: 0 8rpx 22rpx rgba(26, 35, 126, 0.2);
  .summary-item { flex: 1; display: flex; flex-direction: column; align-items: center; }
  .summary-label { font-size: 24rpx; color: rgba(255, 255, 255, 0.65); }
  .summary-value { margin-top: 8rpx; font-size: 34rpx; font-weight: bold; color: #fff; }
  .profit-up { color: #ffd54f; }
  .profit-down { color: #ff8a80; }
  .summary-divider { width: 1rpx; height: 60rpx; background: rgba(255, 255, 255, 0.18); }
}

/* 订单卡片 */
.list { padding: 0 20rpx; }
.order-card {
  position: relative; overflow: hidden;
  margin-bottom: 20rpx; padding: 26rpx 28rpx 20rpx;
  border-radius: 20rpx; background: #fff;
  border: 1rpx solid #e8eaf6;
  box-shadow: 0 4rpx 16rpx rgba(26, 35, 126, 0.05);
  &::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0;
    width: 8rpx; background: #1a237e; opacity: 0.25;
  }
  &.state-won {
    background: #eefaf2;
    border-color: #c8e6c9;
    &::before { background: #2e7d32; opacity: 1; }
  }
  &.state-lost {
    background: #fff3f3;
    border-color: #ffcdd2;
    &::before { background: #e57373; opacity: 1; }
  }
  &.state-settled {
    background: #f5f7fb;
    border-color: #e3e7ef;
    &::before { background: #90a4ae; opacity: 1; }
  }
  &.state-refunded {
    background: #f7f8fa;
    border-color: #eceff1;
    &::before { background: #b0bec5; opacity: 1; }
  }
}

.card-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: 18rpx;
  .head-left { display: flex; flex-direction: column; flex: 1; min-width: 0; padding-right: 12rpx; }
  .teams {
    font-size: 30rpx; font-weight: bold; color: #1f2430;
    line-height: 1.35;
  }
  .state-pill {
    flex-shrink: 0; font-size: 22rpx; padding: 6rpx 18rpx; border-radius: 20rpx;
    &.pending { background: #fff3e0; color: #ef6c00; }
    &.won { background: #e8f5e9; color: #2e7d32; }
    &.lost { background: #ffebee; color: #c62828; }
    &.settled { background: #eceff1; color: #546e7a; }
    &.refunded { background: #eceff1; color: #78909c; }
  }
}

/* 蓝色投注信息块 */
.bet-box {
  display: flex; flex-direction: column; align-items: center;
  margin-bottom: 14rpx; padding: 22rpx 24rpx;
  border-radius: 14rpx;
  background: linear-gradient(135deg, #2f6cf6, #1e4fd0);
  box-shadow: 0 6rpx 16rpx rgba(30, 79, 208, 0.22);
  .bet-cat { font-size: 30rpx; font-weight: bold; color: #fff; }
  .bet-pick { margin-top: 8rpx; font-size: 28rpx; font-weight: 600; color: #fff; }
  .bet-sub { margin-top: 8rpx; font-size: 23rpx; color: rgba(255, 255, 255, 0.82); text-align: center; }
}

.league-line {
  margin: 2rpx 0 6rpx;
  font-size: 24rpx; color: #5c6370; font-weight: 500;
}

/* 订单信息 */
.info-list { margin-top: 4rpx; }
.info-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12rpx 0;
  .info-label { font-size: 26rpx; color: #8a8f99; flex-shrink: 0; }
  .info-value {
    font-size: 27rpx; color: #2b2f36; font-weight: 500;
    text-align: right; word-break: break-all;
  }
  .mono { font-family: inherit; font-variant-numeric: tabular-nums; letter-spacing: 0.5rpx; }
  .info-value-wrap { display: flex; align-items: center; gap: 10rpx; }
  .copy-btn {
    flex-shrink: 0; font-size: 20rpx; color: #1a237e;
    background: #eef1fb; padding: 4rpx 12rpx; border-radius: 8rpx;
    &:active { opacity: 0.6; }
  }
  .score { color: #1a237e; font-weight: bold; }
  .amount { font-weight: bold; }
  .winnable { color: #ef6c00; }
  .settle-label { color: #1a237e; font-weight: 500; }
  .settle-value {
    font-weight: bold;
    &.pending { color: #9aa0aa; }
    &.won { color: #2e7d32; }
    &.lost { color: #c62828; }
    &.settled { color: #546e7a; }
    &.refunded { color: #78909c; }
  }
  .text-pending { color: #ef6c00; }
  .text-won { color: #2e7d32; }
  .text-lost { color: #c62828; }
  .text-settled { color: #546e7a; }
  .text-refunded { color: #78909c; }
}

.empty { text-align: center; padding: 160rpx 0; color: #999; font-size: 28rpx; }
</style>
