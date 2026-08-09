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

    <!-- 大类Tab栏（可左右滑动） -->
    <scroll-view scroll-x class="category-tabs" :show-scrollbar="false">
      <view
        class="tab-item"
        :class="{ active: activeTab === 'all' }"
        @click="activeTab = 'all'"
      >全部玩法</view>
      <view
        v-for="cat in categoryPlays"
        :key="cat.name"
        class="tab-item"
        :class="{ active: activeTab === cat.name }"
        @click="activeTab = cat.name"
      >{{ cat.name }}</view>
    </scroll-view>

    <!-- 玩法列表（大类 → 小类 → 玩法） -->
    <view class="play-section" v-for="bigCat in displayCategories" :key="bigCat.name">
      <!-- 大类标题（仅全部玩法tab时显示） -->
      <view class="big-cat-title" v-if="activeTab === 'all'">{{ bigCat.name }}</view>

      <!-- 小类 -->
      <view class="sub-category" v-for="sub in bigCat.subCategories" :key="sub.name">
        <view class="sub-cat-title">{{ sub.name }}</view>
        <view
          class="play-grid"
          :style="{ gridTemplateColumns: getGridColumns(sub.plays.length) }"
        >
          <view
            class="play-item"
            v-for="play in sub.plays"
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
import { onLoad, onUnload } from '@dcloudio/uni-app'
import BetSheet from '@/components/bet-sheet/bet-sheet.vue'
import { betCart } from '@/stores/betCart.js'
import { startPolling, stopPolling } from '@/utils/oddsPoller.js'

const match = ref({})
const selectedPlay = ref({})       // 当前选中的单个玩法
const showSingleSheet = ref(false) // 单关弹窗
const showCartSheet = ref(false)   // 串关弹窗
const categoryPlays = ref([])
const loaded = ref(false)
const currentOddsVersion = ref(0)
const activeTab = ref('all')       // 当前选中的大类tab，'all'=全部玩法

/** 将每个大类的玩法按小类(categoryName)二次分组 */
const subGroupedCategories = computed(() => {
  return categoryPlays.value.map(bigCat => {
    const subMap = {}
    for (const play of bigCat.plays) {
      const key = play.categoryName || bigCat.name
      if (!subMap[key]) subMap[key] = { name: key, plays: [] }
      subMap[key].plays.push(play)
    }
    return {
      name: bigCat.name,
      subCategories: Object.values(subMap)
    }
  })
})

/** 根据选中的tab过滤要显示的大类 */
const displayCategories = computed(() => {
  if (activeTab.value === 'all') return subGroupedCategories.value
  return subGroupedCategories.value.filter(c => c.name === activeTab.value)
})

/** 根据玩法数量返回 grid-template-columns */
const getGridColumns = (count) => {
  if (count === 1) return '1fr'
  if (count === 3) return '1fr 1fr 1fr'
  return '1fr 1fr'  // 2, 4, 5, 6...
}

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

/** 拉取比赛详情数据 */
const fetchMatchData = async (matchId) => {
  try {
    const res = await uniCloud.callFunction({
      name: 'user-match',
      data: { token: uni.getStorageSync('token') }
    })
    if (res.result && res.result.code === 0) {
      const matchData = (res.result.data.matches || []).find(m => m._id === matchId)
      if (matchData) {
        const oldOddsMap = {}
        for (const cat of categoryPlays.value) {
          for (const p of cat.plays) {
            oldOddsMap[p._id] = p.odds
          }
        }
        match.value = matchData
        categoryPlays.value = matchData.categoryPlays || []
        currentOddsVersion.value = matchData.oddsVersion || 0

        // 如果已选中的玩法赔率变了，更新 selectedPlay
        if (selectedPlay.value._id) {
          for (const cat of matchData.categoryPlays || []) {
            const found = cat.plays.find(p => p._id === selectedPlay.value._id)
            if (found) {
              selectedPlay.value = { ...found }
              break
            }
          }
        }

        // 同步购物车中的赔率
        let cartChanged = false
        for (const cat of matchData.categoryPlays || []) {
          for (const p of cat.plays) {
            if (oldOddsMap[p._id] !== undefined && oldOddsMap[p._id] !== p.odds) {
              if (betCart.updateOdds(p._id, p.odds)) {
                cartChanged = true
              }
            }
          }
        }
        if (cartChanged) {
          uni.showToast({ title: '购物车赔率已更新', icon: 'none', duration: 2000 })
        }
      }
    }
  } catch (e) {
    console.error('加载赛事失败:', e)
  }
}

let pollingMatchId = ''

onLoad(async (options) => {
  const matchId = options.id
  if (!matchId) return
  pollingMatchId = matchId

  await fetchMatchData(matchId)
  loaded.value = true

  // 启动赔率轮询
  startPolling({
    matchIds: [matchId],
    versions: { [matchId]: currentOddsVersion.value },
    onChange: async (changedIds) => {
      await fetchMatchData(matchId)
    }
  })
})

onUnload(() => {
  stopPolling()
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

// ============ 大类Tab栏 ============
.category-tabs {
  white-space: nowrap; padding: 16rpx 20rpx; background: #fff;
  border-bottom: 1rpx solid #eee;
  .tab-item {
    display: inline-block; padding: 12rpx 24rpx; font-size: 26rpx; color: #666;
    border-radius: 28rpx; margin-right: 12rpx; background: #f5f5f5;
    transition: all 0.2s;
    &.active { background: #1a237e; color: #fff; font-weight: bold; }
  }
}

.play-section {
  background: #fff; margin: 20rpx; border-radius: 16rpx; padding: 20rpx;
  .big-cat-title {
    font-size: 30rpx; font-weight: bold; color: #1a237e;
    padding-bottom: 12rpx; margin-bottom: 16rpx; border-bottom: 2rpx solid #e0e0e0;
  }
}

.sub-category {
  margin-bottom: 20rpx;
  &:last-child { margin-bottom: 0; }
  .sub-cat-title {
    font-size: 26rpx; color: #666; margin-bottom: 10rpx; padding-left: 8rpx;
    border-left: 4rpx solid #1a237e; line-height: 1.2;
  }
  .play-grid {
    display: grid; gap: 12rpx;
  }
  .play-item {
    padding: 16rpx; background: #f5f5f5; border-radius: 12rpx;
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
