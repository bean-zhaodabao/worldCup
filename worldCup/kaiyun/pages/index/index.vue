<template>
  <view class="match-list">
    <!-- 数据更新时间 -->
    <view class="sync-bar" v-if="syncTimeText">
      <text>数据更新时间: {{ syncTimeText }}</text>
    </view>

    <!-- 按日期分组 -->
    <view class="date-group" v-for="group in dateGroups" :key="group.key">
      <view class="date-header">
        <text class="date-label">{{ group.label }}</text>
        <text class="date-num">{{ group.dateText }}</text>
        <text class="date-count">{{ group.matches.length }} 场</text>
      </view>

      <view class="match-card" v-for="match in group.matches" :key="match._id" @click="goDetail(match)">
        <view class="match-header">
          <text class="match-cc" v-if="match.ccId">{{ match.ccId }}</text>
          <text class="match-league">{{ match.leagueName || match.name }}</text>
          <text class="match-time">{{ timeText(match.startTime) }}</text>
        </view>
        <view class="match-teams">
          <view class="team">
            <image class="flag" :src="match.teamAFlag || '/static/football.png'" mode="aspectFit"></image>
            <text class="team-name">{{ match.teamA }}</text>
          </view>
          <view class="vs-box">
            <text class="vs">VS</text>
          </view>
          <view class="team">
            <image class="flag" :src="match.teamBFlag || '/static/football.png'" mode="aspectFit"></image>
            <text class="team-name">{{ match.teamB }}</text>
          </view>
        </view>
        <!-- 胜平负赔率简览 -->
        <view class="spf-row" v-if="spfOf(match).length">
          <view class="spf-item" v-for="p in spfOf(match)" :key="p._id">
            <text class="spf-name">{{ p.name }}</text>
            <text class="spf-odds">{{ p.odds }}</text>
          </view>
          <view class="spf-more" @click.stop="goDetail(match)">更多玩法 ›</view>
        </view>
        <!-- 串关标记 -->
        <view class="cart-badge" v-if="betCart.hasMatch(match._id)">
          <text>已在串关列表中</text>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view class="empty" v-if="matchList.length === 0 && loaded">
      <text>暂无赛事</text>
      <text class="empty-sub">如有疑问请联系管理员</text>
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
import { onShow, onHide } from '@dcloudio/uni-app'
import BetSheet from '@/components/bet-sheet/bet-sheet.vue'
import { betCart } from '@/stores/betCart.js'
import { startPolling, stopPolling } from '@/utils/oddsPoller.js'

const matchList = ref([])
const matchVersions = ref({})
const loading = ref(false)
const loaded = ref(false)
const showCartSheet = ref(false)

const cartCount = computed(() => betCart.count)
const cartTotalOdds = computed(() => betCart.totalOdds)
const cartItems = computed(() => betCart.items)

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const pad = (n) => String(n).padStart(2, '0')

const formatTime = (t) => {
  if (!t) return ''
  const d = new Date(t)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

const timeText = (t) => {
  if (!t) return ''
  const d = new Date(t)
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

/** 日期分组: 今天/明天/周X */
const dateGroups = computed(() => {
  const groups = []
  const now = new Date()
  const todayStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000)
  const tomorrowStr = tomorrow.getFullYear() + '-' + pad(tomorrow.getMonth() + 1) + '-' + pad(tomorrow.getDate())

  for (const m of matchList.value) {
    const d = new Date(m.startTime)
    const key = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    let label = ''
    if (key === todayStr) label = '今天'
    else if (key === tomorrowStr) label = '明天'
    else label = WEEK[d.getDay()]
    let group = groups.find(g => g.key === key)
    if (!group) {
      group = { key, label, dateText: key.slice(5).replace('-', '-'), matches: [] }
      groups.push(group)
    }
    group.matches.push(m)
  }
  // 今天排最前, 其余按日期
  groups.sort((a, b) => (a.label === '今天' ? -1 : 0) - (b.label === '今天' ? -1 : 0) || a.key.localeCompare(b.key))
  return groups
})

/** 最新同步时间(取列表中最新的syncedAt) */
const syncTimeText = computed(() => {
  let latest = null
  for (const m of matchList.value) {
    if (m.syncedAt) {
      const t = new Date(m.syncedAt).getTime()
      if (!latest || t > latest) latest = t
    }
  }
  if (!latest) return ''
  return formatTime(latest)
})

/** 取胜平负小类玩法(胜/平/负) */
const spfOf = (match) => {
  const big = (match.categoryPlays || []).find(c => c.name === '胜平负')
  if (!big) return []
  const sub = (big.subCategories || []).find(s => s.name === '胜平负')
  return sub ? sub.plays : []
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
        playIds: betData.playIds,
        betAmount: betData.betAmount,
        isParlay: true
      }
    })
    const result = res.result
    if (result && result.code === 0) {
      // 以服务端实时赔率为准展示
      uni.showToast({
        title: '串关下单成功！可赢 ¥' + result.data.winAmount.toFixed(2),
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
      data: { token }
    })
    if (res.result && res.result.code === 0) {
      matchList.value = res.result.data.matches || []
      loaded.value = true
      const versions = {}
      for (const m of matchList.value) {
        versions[m._id] = m.oddsVersion || 0
      }
      matchVersions.value = versions
    }
  } catch (e) { console.error(e) }
  loading.value = false
}

onShow(() => {
  loadMatches().then(() => {
    const ids = Object.keys(matchVersions.value)
    if (ids.length > 0) {
      startPolling({
        matchIds: ids,
        versions: { ...matchVersions.value },
        onChange: async () => {
          await loadMatches()
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
  padding-bottom: 140rpx;
}

.sync-bar {
  padding: 12rpx 20rpx;
  background: #e8eaf6;
  font-size: 22rpx;
  color: #1a237e;
}

.date-group {
  margin-top: 16rpx;
  .date-header {
    display: flex;
    align-items: center;
    gap: 12rpx;
    padding: 16rpx 20rpx 8rpx;
    .date-label { font-size: 30rpx; font-weight: bold; color: #1a1a1a; }
    .date-num { font-size: 24rpx; color: #999; }
    .date-count { font-size: 22rpx; color: #bbb; margin-left: auto; }
  }
}

.match-card {
  background: #fff;
  margin: 0 20rpx 16rpx;
  border-radius: 16rpx;
  padding: 24rpx 30rpx;
  box-shadow: 0 2rpx 12rpx rgba(0,0,0,0.04);
  position: relative;

  .match-header {
    display: flex;
    align-items: center;
    gap: 10rpx;
    margin-bottom: 16rpx;
    .match-cc {
      font-size: 22rpx; color: #1a237e; background: #e8eaf6;
      padding: 2rpx 12rpx; border-radius: 10rpx; font-weight: bold;
    }
    .match-league { font-size: 24rpx; color: #666; flex: 1; }
    .match-time { font-size: 24rpx; color: #d32f2f; font-weight: bold; }
  }

  .match-teams {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16rpx;
    .team { display: flex; flex-direction: column; align-items: center; flex: 1; }
    .flag { width: 80rpx; height: 60rpx; border-radius: 8rpx; background: #f5f5f5; }
    .team-name { font-size: 28rpx; font-weight: bold; margin-top: 8rpx; }
    .vs-box { padding: 0 20rpx; }
    .vs { font-size: 32rpx; font-weight: bold; color: #d32f2f; }
  }

  .spf-row {
    display: flex;
    align-items: center;
    gap: 12rpx;
    border-top: 1rpx dashed #eee;
    padding-top: 16rpx;
    .spf-item {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8rpx;
      background: #fafafa;
      border-radius: 10rpx;
      padding: 10rpx 0;
      .spf-name { font-size: 24rpx; color: #999; }
      .spf-odds { font-size: 26rpx; color: #d32f2f; font-weight: bold; }
    }
    .spf-more { font-size: 22rpx; color: #1a237e; white-space: nowrap; }
  }

  .cart-badge {
    position: absolute; top: 12rpx; right: 12rpx;
    background: #1a237e; color: #fff; font-size: 20rpx;
    padding: 4rpx 14rpx; border-radius: 16rpx;
  }
}

.empty { text-align: center; padding: 200rpx 0; color: #999; font-size: 28rpx;
  .empty-sub { display: block; font-size: 24rpx; color: #bbb; margin-top: 12rpx; } }

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
