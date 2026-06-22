<template>
  <view class="match-detail">
    <!-- 赛事信息 -->
    <view class="match-info">
      <view class="teams">
        <view class="team">
          <image :src="match.teamAFlag || '/static/football.png'" mode="aspectFit" class="flag" />
          <text>{{ match.teamA }}</text>
        </view>
        <text class="vs">VS</text>
        <view class="team">
          <image :src="match.teamBFlag || '/static/football.png'" mode="aspectFit" class="flag" />
          <text>{{ match.teamB }}</text>
        </view>
      </view>
      <text class="time">开赛时间: {{ formatTime(match.startTime) }}</text>
      <text class="status">{{ statusMap[match.status] || '未知' }}</text>
    </view>

    <!-- 玩法列表（按分类分组）- 单选模式 -->
    <view class="play-section" v-for="cat in categoryPlays" :key="cat.name">
      <view class="section-title">{{ cat.name }}</view>
      <view class="play-grid">
        <view
          class="play-item"
          v-for="play in cat.plays"
          :key="play._id"
          @click="selectPlay(play)"
          :class="{
            selected: selectedPlay._id === play._id
          }"
        >
          <text class="play-name">{{ play.name }}</text>
          <text class="play-odds">{{ play.odds }}</text>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view class="empty" v-if="categoryPlays.length === 0 && loaded">
      <text>该赛事暂无玩法</text>
    </view>

    <!-- 串关提示条：当前场次已在购物车中 -->
    <view class="cart-notice" v-if="isMatchInCart">
      <text>📌 该场次已在串关列表中</text>
      <text class="cart-notice-action" @click="removeFromCart">移出串关</text>
    </view>

    <!-- 串关提示条：正常加入 -->
    <view class="cart-notice success" v-else-if="cartCount > 0">
      <text>当前串关单已有 {{ cartCount }} 场，可继续选择其他场次</text>
    </view>

    <!-- 底部下单栏（仅未开始赛事显示） -->
    <view class="bottom-bar" v-if="match.status === 'upcoming'">
      <!-- 未选择玩法 / 场次已加入串关 -->
      <view class="no-select" v-if="!selectedPlay._id && !isMatchInCart">
        <text class="hint">请选择一个玩法</text>
      </view>

      <!-- 场次已在串关中：只显示移除按钮 -->
      <view class="action-row" v-if="isMatchInCart">
        <view class="selected-info">
          <text class="sel-play cart-added-text">已在串关列表中</text>
        </view>
        <view class="btn-group">
          <button class="bet-btn parlay remove" @click="removeFromCart">移出串关</button>
        </view>
      </view>

      <!-- 正常已选玩法 -->
      <view class="action-row" v-else-if="selectedPlay._id">
        <view class="selected-info">
          <text class="sel-play">{{ selectedPlay.name }}</text>
          <text class="sel-odds">赔率 @{{ selectedPlay.odds }}</text>
        </view>
        <view class="btn-group">
          <button class="bet-btn single" @click="singleBet">单关下注</button>
          <button class="bet-btn parlay" @click="addToCart">加入串关</button>
        </view>
      </view>

      <!-- 串关购物车指示条 -->
      <view class="cart-bar" v-if="cartCount > 0" @click="showCartBet">
        <text class="cart-icon">🛒</text>
        <text class="cart-text">串关单 ({{ cartCount }}场) 赔率 {{ cartTotalOdds.toFixed(2) }}</text>
        <text class="cart-arrow">›</text>
      </view>
    </view>

    <!-- 单关下注弹窗 -->
    <bet-sheet
      :visible="showSingleSheet"
      :matchInfo="match"
      :selectedPlays="selectedPlay._id ? [selectedPlay] : []"
      :isParlay="false"
      @confirm="handleSingleConfirm"
      @cancel="showSingleSheet = false"
    />

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
import { onLoad } from '@dcloudio/uni-app'
import BetSheet from '@/components/bet-sheet/bet-sheet.vue'
import { betCart } from '@/stores/betCart.js'

const match = ref({})
const selectedPlay = ref({})       // 当前选中的单个玩法
const showSingleSheet = ref(false) // 单关弹窗
const showCartSheet = ref(false)   // 串关弹窗
const categoryPlays = ref([])
const loaded = ref(false)

const statusMap = { upcoming: '未开始', live: '进行中', finished: '已结束', settled: '已结算' }

const cartCount = computed(() => betCart.count)
const cartTotalOdds = computed(() => betCart.totalOdds)
const cartItems = computed(() => betCart.items)

// 当前场次是否已在串关购物车中
const isMatchInCart = computed(() => {
  return betCart.hasMatch(match.value._id)
})

const formatTime = (t) => {
  if (!t) return ''
  const d = new Date(t)
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0')
}

/** 单选玩法 */
const selectPlay = (play) => {
  if (isMatchInCart.value) return // 已在串关中，不可以再选
  if (selectedPlay.value._id === play._id) {
    selectedPlay.value = {}  // 取消选中
  } else {
    selectedPlay.value = { ...play }
  }
}

/** 单关下注 - 直接用当前选中的玩法下单 */
const singleBet = () => {
  if (!selectedPlay.value._id) return
  showSingleSheet.value = true
}

/** 加入串关购物车 */
const addToCart = () => {
  if (!selectedPlay.value._id) return
  if (isMatchInCart.value) {
    uni.showToast({ title: '该场次已在串关列表中', icon: 'none' })
    return
  }
  const result = betCart.add({
    playId: selectedPlay.value._id,
    playName: selectedPlay.value.name,
    playLabel: selectedPlay.value.label || '',
    odds: selectedPlay.value.odds,
    categoryName: selectedPlay.value.categoryName || '',
    bigCategoryName: selectedPlay.value.bigCategoryName || '',
    matchId: match.value._id,
    matchName: match.value.name || '',
    teamA: match.value.teamA || '',
    teamB: match.value.teamB || ''
  })
  if (result.ok) {
    uni.showToast({ title: '已加入串关，可继续选择其他场次', icon: 'success', duration: 1500 })
    selectedPlay.value = {}  // 清空当前选择
  } else {
    uni.showToast({ title: result.message || '加入失败', icon: 'none' })
  }
}

/** 打开串关下注弹窗 */
const showCartBet = () => {
  showCartSheet.value = true
}

/** 从串关弹窗中移除某个玩法（bet-sheet ×按钮回调） */
const onCartRemovePlay = ({ playId }) => {
  betCart.remove(playId)
}

/** 从串关购物车中移除当前场次（详情页直接移除） */
const removeFromCart = () => {
  betCart.removeByMatch(match.value._id)
  uni.showToast({ title: '已移出串关', icon: 'success', duration: 1200 })
}

/** 单关下单确认 */
const handleSingleConfirm = async (betData) => {
  showSingleSheet.value = false
  try {
    const res = await uniCloud.callFunction({
      name: 'user-order',
      data: {
        token: uni.getStorageSync('token'),
        matchId: match.value._id,
        playIds: betData.playIds,
        betAmount: betData.betAmount,
        isParlay: false
      }
    })
    const result = res.result
    if (result && result.code === 0) {
      uni.showToast({
        title: '下单成功！可赢 ¥' + (betData.totalOdds * betData.betAmount).toFixed(2),
        icon: 'success', duration: 2000
      })
      selectedPlay.value = {}
    } else {
      uni.showToast({ title: (result && result.message) || '下单失败', icon: 'error' })
    }
  } catch (e) {
    console.error('下单失败:', e)
    uni.showToast({ title: '网络错误，请重试', icon: 'error' })
  }
}

/** 串关下单确认 */
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
      betCart.clear()  // 清空购物车
      selectedPlay.value = {}
    } else {
      uni.showToast({ title: (result && result.message) || '下单失败', icon: 'error' })
    }
  } catch (e) {
    console.error('串关下单失败:', e)
    uni.showToast({ title: '网络错误，请重试', icon: 'error' })
  }
}

// 加载赛事数据
onLoad(async (options) => {
  const matchId = options.id
  if (!matchId) return

  try {
    const res = await uniCloud.callFunction({
      name: 'user-match',
      data: { token: uni.getStorageSync('token') }
    })
    if (res.result && res.result.code === 0) {
      const matchData = (res.result.data.matches || []).find(m => m._id === matchId)
      if (matchData) {
        match.value = matchData
        categoryPlays.value = matchData.categoryPlays || []
      }
    }
  } catch (e) {
    console.error('加载赛事失败:', e)
  }
  loaded.value = true
})
</script>

<style lang="scss" scoped>
.match-detail { min-height: 100vh; background: #f0f2f5; padding-bottom: 180rpx; }

.match-info {
  background: linear-gradient(135deg, #1a237e, #0d47a1);
  padding: 40rpx; color: #fff; text-align: center;
  .teams { display: flex; justify-content: center; align-items: center; gap: 30rpx; }
  .team { display: flex; flex-direction: column; align-items: center; .flag { width: 80rpx; height: 60rpx; border-radius: 8rpx; background: rgba(255,255,255,0.2); } }
  .vs { font-size: 40rpx; font-weight: bold; }
  .time { display: block; margin-top: 20rpx; font-size: 26rpx; opacity: 0.8; }
  .status { display: inline-block; margin-top: 10rpx; font-size: 24rpx; padding: 4rpx 20rpx; border-radius: 20rpx; background: rgba(255,255,255,0.2); }
}

.play-section {
  background: #fff; margin: 20rpx; border-radius: 16rpx; padding: 20rpx;
  .section-title { font-size: 30rpx; font-weight: bold; margin-bottom: 16rpx; color: #333; }
  .play-grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
  .play-item {
    width: calc(50% - 6rpx); padding: 16rpx; background: #f5f5f5; border-radius: 12rpx;
    text-align: center; border: 2rpx solid transparent;
    .play-name { display: block; font-size: 26rpx; color: #333; }
    .play-odds { display: block; font-size: 32rpx; color: #d32f2f; font-weight: bold; margin-top: 8rpx; }
    &.selected { border-color: #1a237e; background: #e8eaf6; }
  }
}

.cart-notice {
  margin: 0 20rpx; padding: 16rpx 24rpx; border-radius: 12rpx;
  font-size: 24rpx; color: #ef6c00; background: #fff3e0;
  display: flex; justify-content: space-between; align-items: center;
  .cart-notice-action {
    color: #d32f2f; font-weight: bold; padding: 6rpx 16rpx;
    border: 1rpx solid #d32f2f; border-radius: 20rpx; font-size: 22rpx;
    &:active { background: #ffebee; }
  }
  &.success { background: #e8f5e9; color: #2e7d32; }
}

// ============ 底部栏 ============
.bottom-bar {
  position: fixed; bottom: 0; left: 0; right: 0; background: #fff;
  padding: 20rpx 30rpx; box-shadow: 0 -2rpx 12rpx rgba(0,0,0,0.08);

  .no-select {
    text-align: center; padding: 16rpx 0;
    .hint { font-size: 26rpx; color: #999; }
  }

  .action-row {
    display: flex; align-items: center; justify-content: space-between; gap: 16rpx;
    .selected-info {
      flex: 1; min-width: 0;
      .sel-play { font-size: 28rpx; font-weight: bold; color: #1a1a1a; display: block; }
      .sel-odds { font-size: 24rpx; color: #d32f2f; font-weight: bold; }
      .cart-added-text { color: #ef6c00; }
    }
    .btn-group { display: flex; gap: 12rpx; flex-shrink: 0; }
    .bet-btn {
      border: none; border-radius: 36rpx; padding: 14rpx 28rpx; font-size: 26rpx; font-weight: bold;
      white-space: nowrap;
      &.single {
        background: linear-gradient(135deg, #d32f2f, #b71c1c); color: #fff;
      }
      &.parlay {
        background: #fff; color: #1a237e; border: 2rpx solid #1a237e;
        &.remove {
          color: #d32f2f; border-color: #d32f2f; background: #fff;
          &:active { background: #ffebee; }
        }
      }
    }
  }

  // 串关购物车条
  .cart-bar {
    margin-top: 16rpx; padding: 14rpx 20rpx;
    background: linear-gradient(135deg, #1a237e, #283593);
    border-radius: 12rpx; display: flex; align-items: center; gap: 12rpx;
    color: #fff;
    .cart-icon { font-size: 28rpx; }
    .cart-text { flex: 1; font-size: 26rpx; font-weight: bold; }
    .cart-arrow { font-size: 32rpx; }
  }
}

.empty { text-align: center; padding: 200rpx 0; color: #999; font-size: 28rpx; }
</style>
