<template>
  <view class="match-list">
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
          <text>开赛时间: {{ formatTime(match.startTime) }}</text>
        </view>
        <!-- 串关标记 -->
        <view class="cart-badge" v-if="betCart.hasMatch(match._id)">
          <text>已在串关列表中</text>
        </view>
      </view>

      <!-- 空状态 -->
      <view class="empty" v-if="matchList.length === 0">
        <text>暂无赛事</text>
      </view>
    </view>

    <!-- 串关购物车浮动按钮 -->
    <view class="floating-cart" v-if="cartCount > 0" @click="showCartSheet = true">
      <text class="cart-badge-count">{{ cartCount }}</text>
      <text class="cart-label">串关单</text>
      <text class="cart-odds">赔率 {{ cartTotalOdds.toFixed(2) }}</text>
    </view>

    <!-- 串关下注弹窗 -->
    <bet-sheet
      :visible="showCartSheet"
      :matchInfo="{}"
      :selectedPlays="cartItems"
      :isParlay="true"
      @confirm="handleCartConfirm"
      @cancel="showCartSheet = false"
      @removePlay="onCartRemovePlay"
    />
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import BetSheet from '@/components/bet-sheet/bet-sheet.vue'
import { betCart } from '@/stores/betCart.js'
import { startPolling, stopPolling } from '@/utils/oddsPoller.js'

const matchList = ref([])
const matchVersions = ref({})
const loading = ref(false)
const showCartSheet = ref(false)

const cartCount = computed(() => betCart.count)
const cartTotalOdds = computed(() => betCart.totalOdds)
const cartItems = computed(() => betCart.items)

const statusMap = { upcoming: '未开始', live: '进行中', finished: '已结束', settled: '已结算' }

const formatTime = (t) => {
  if (!t) return ''
  const d = new Date(t)
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0')
}

const goDetail = (match) => {
  uni.navigateTo({ url: '/pages/match/detail?id=' + match._id })
}

const onCartRemovePlay = ({ playId }) => {
  betCart.remove(playId)
}

const handleCartConfirm = async (betData) => {
  showCartSheet.value = false
  try {
    const res = await uniCloud.callFunction({
      name: 'user-order',
      data: {
        token: uni.getStorageSync('token'),
        matchIds: betCart.getMatchIds(),
        playIds: betData.playIds,
        betAmount: betData.betAmount,
        isParlay: true
      }
    })
    const result = res.result
    if (result && result.code === 0) {
      uni.showToast({
        title: '串关下单成功！可赢 ¥' + (betData.totalOdds * betData.betAmount).toFixed(2),
        icon: 'success', duration: 2000
      })
      betCart.clear()
    } else {
      uni.showToast({ title: (result && result.message) || '下单失败', icon: 'error' })
    }
  } catch (e) {
    console.error('串关下单失败:', e)
    uni.showToast({ title: '网络错误，请重试', icon: 'error' })
  }
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
      const matches = res.result.data.matches || []
      matchList.value = matches
      const versions = {}
      for (const m of matches) {
        versions[m._id] = m.oddsVersion || 0
      }
      matchVersions.value = versions
    }
  } catch (e) { console.error(e) }
  loading.value = false
}

// 页面显示时加载
import { onShow, onHide } from '@dcloudio/uni-app'
onShow(() => {
  loadMatches().then(() => {
    const ids = Object.keys(matchVersions.value)
    if (ids.length > 0) {
      startPolling({
        matchIds: ids,
        versions: { ...matchVersions.value },
        onChange: async (changedIds) => {
          const token = uni.getStorageSync('token')
          if (!token) return
          try {
            const res = await uniCloud.callFunction({
              name: 'user-match',
              data: { token }
            })
            if (res.result && res.result.code === 0) {
              const freshMatches = res.result.data.matches || []
              const freshMap = {}
              for (const m of freshMatches) {
                freshMap[m._id] = m
                matchVersions.value[m._id] = m.oddsVersion || 0
              }
              for (const id of changedIds) {
                const idx = matchList.value.findIndex(m => m._id === id)
                if (idx >= 0 && freshMap[id]) {
                  matchList.value[idx] = freshMap[id]
                }
              }
              for (const id of changedIds) {
                const freshMatch = freshMap[id]
                if (!freshMatch) continue
                for (const cat of freshMatch.categoryPlays || []) {
                  for (const p of cat.plays) {
                    betCart.updateOdds(p._id, p.odds)
                  }
                }
              }
              const cartMatchIds = new Set(betCart.getMatchIds())
              const relevantChanges = changedIds.filter(id => cartMatchIds.has(id))
              if (relevantChanges.length > 0) {
                uni.showToast({ title: '购物车赔率已更新', icon: 'none', duration: 2000 })
              }
            }
          } catch (e) { console.error(e) }
        }
      })
    }
  })
})

onHide(() => {
  stopPolling()
})
</script>

<style lang="scss" scoped>
.match-list {
  min-height: 100vh;
  background: #f0f2f5;
  padding-bottom: 120rpx;

  .list { padding: 20rpx; }

  .match-card {
    background: #fff;
    border-radius: 16rpx;
    padding: 30rpx;
    margin-bottom: 20rpx;
    box-shadow: 0 2rpx 12rpx rgba(0,0,0,0.06);
    position: relative;

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

    .cart-badge {
      position: absolute; top: 12rpx; right: 12rpx;
      background: #1a237e; color: #fff; font-size: 20rpx;
      padding: 4rpx 14rpx; border-radius: 16rpx;
    }
  }

  .empty { text-align: center; padding: 200rpx 0; color: #999; font-size: 28rpx; }
}

// ============ 浮动购物车按钮 ============
.floating-cart {
  position: fixed; bottom: 120rpx; left: 50%; transform: translateX(-50%);
  background: linear-gradient(135deg, #1a237e, #283593);
  color: #fff; padding: 20rpx 40rpx; border-radius: 48rpx;
  display: flex; align-items: center; gap: 16rpx;
  box-shadow: 0 8rpx 24rpx rgba(26, 35, 126, 0.4);
  z-index: 100;
  .cart-badge-count {
    width: 40rpx; height: 40rpx; background: #ff5722; color: #fff;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 24rpx; font-weight: bold; flex-shrink: 0;
  }
  .cart-label { font-size: 28rpx; font-weight: bold; }
  .cart-odds { font-size: 24rpx; opacity: 0.85; }
}
</style>
