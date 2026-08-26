<template>
  <view class="match-detail">
    <!-- 赛事信息 -->
    <view class="match-info">
      <view class="match-top">
        <text class="cc-tag" v-if="match.ccId">{{ match.ccId }}</text>
        <text class="league">{{ match.leagueName || match.name }}</text>
        <text class="state" v-if="match.displayState">{{ match.displayState }}</text>
      </view>
      <view class="teams">
        <view class="team">
          <image :src="match.teamAFlag || '/static/football.png'" mode="aspectFit" class="flag" />
          <text>{{ match.teamA }}</text>
        </view>
        <view class="vs-box">
          <text class="vs">VS</text>
          <text class="time">{{ formatTime(match.startTime) }}</text>
        </view>
        <view class="team">
          <image :src="match.teamBFlag || '/static/football.png'" mode="aspectFit" class="flag" />
          <text>{{ match.teamB }}</text>
        </view>
      </view>
      <text class="sync-time" v-if="match.syncedAt">数据更新时间: {{ formatTime(match.syncedAt) }}</text>
    </view>

    <!-- 大类Tab栏 -->
    <scroll-view scroll-x class="category-tabs" :show-scrollbar="false">
      <view class="tab-item" :class="{ active: activeTab === 'all' }" @click="activeTab = 'all'">全部玩法</view>
      <view
        v-for="cat in categoryPlays"
        :key="cat.name"
        class="tab-item"
        :class="{ active: activeTab === cat.name }"
        @click="activeTab = cat.name"
      >{{ cat.name }}</view>
    </scroll-view>

    <!-- 玩法区: 大类 → 小类 -->
    <view class="play-section" v-for="bigCat in displayCategories" :key="bigCat.name">
      <view class="big-cat-title" v-if="activeTab === 'all'">{{ bigCat.name }}</view>

      <view class="sub-category" v-for="sub in bigCat.subCategories" :key="sub.name">
        <view class="sub-cat-title">
          <text>{{ subTitle(sub) }}</text>
          <text class="rq-hint" v-if="sub.name === '让球胜平负' && rqGoal(sub) !== null">{{ rqGoalText(sub) }}</text>
        </view>

        <!-- 盘口表格(让球盘/大小球) -->
        <view class="pankou-table" v-if="sub.handicapPlays">
          <view class="pk-row pk-head">
            <text class="pk-col pk-line">盘口</text>
            <text class="pk-col">{{ sub.name === '让球盘' ? match.teamA : '大球' }}</text>
            <text class="pk-col">{{ sub.name === '让球盘' ? match.teamB : '小球' }}</text>
          </view>
          <view class="pk-row" v-for="row in sub.handicapPlays" :key="row.handicap">
            <text class="pk-col pk-line">{{ handicapText(row.handicap, sub.name) }}</text>
            <view class="pk-col pk-cell" v-if="row.home" :class="{ selected: selectedPlay._id === row.home._id }" @click="selectPlay(row.home)">
              <text class="pk-water">{{ fmtOdds(row.home.water || row.home.odds) }}</text>
            </view>
            <view class="pk-col pk-cell empty" v-else><text>-</text></view>
            <view class="pk-col pk-cell" v-if="row.away" :class="{ selected: selectedPlay._id === row.away._id }" @click="selectPlay(row.away)">
              <text class="pk-water">{{ fmtOdds(row.away.water || row.away.odds) }}</text>
            </view>
            <view class="pk-col pk-cell empty" v-else><text>-</text></view>
          </view>
        </view>

        <!-- 普通玩法宫格 -->
        <view v-else class="play-grid" :style="{ gridTemplateColumns: getGridColumns(sub.plays.length) }">
          <view
            class="play-item"
            v-for="play in sub.plays"
            :key="play._id"
            @click="selectPlay(play)"
            :class="{ selected: selectedPlay._id === play._id, disabled: play.odds === null }"
          >
            <text class="play-name">{{ play.name }}</text>
            <text class="play-odds">{{ fmtOdds(play.odds) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view class="empty" v-if="categoryPlays.length === 0 && loaded">
      <text>该赛事暂无玩法</text>
    </view>

    <!-- 串关提示条 -->
    <view class="cart-notice" v-if="isMatchInCart">
      <text>📌 该场次已在串关列表中</text>
      <text class="cart-notice-action" @click="removeFromCart">移出串关</text>
    </view>
    <view class="cart-notice success" v-else-if="cartCount > 0">
      <text>当前串关单已有 {{ cartCount }} 场，可继续选择其他场次</text>
    </view>

    <!-- 底部下单栏 -->
    <view class="bottom-bar">
      <view class="no-select" v-if="!selectedPlay._id && !isMatchInCart">
        <text class="hint">请选择一个玩法</text>
      </view>

      <view class="action-row" v-if="isMatchInCart">
        <view class="selected-info">
          <text class="sel-play cart-added-text">已在串关列表中</text>
        </view>
        <view class="btn-group">
          <button class="bet-btn parlay remove" @click="removeFromCart">移出串关</button>
        </view>
      </view>

      <view class="action-row" v-else-if="selectedPlay._id">
        <view class="selected-info">
          <text class="sel-play">{{ selectedDisplayName }}</text>
          <text class="sel-odds">@{{ selectedOddsText }}</text>
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
import { fmtOdds, dxqHandicapText } from '@/utils/format.js'

const match = ref({})
const selectedPlay = ref({})
const showSingleSheet = ref(false)
const showCartSheet = ref(false)
const categoryPlays = ref([])
const loaded = ref(false)
const currentOddsVersion = ref(0)
const activeTab = ref('all')

const cartCount = computed(() => betCart.count)
const cartTotalOdds = computed(() => betCart.totalOdds)
const cartItems = computed(() => betCart.items)

const isMatchInCart = computed(() => betCart.hasMatch(match.value._id))

const displayCategories = computed(() => {
  if (activeTab.value === 'all') return categoryPlays.value
  return categoryPlays.value.filter(c => c.name === activeTab.value)
})

const formatTime = (t) => {
  if (!t) return ''
  const d = new Date(t)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

/** 小类标题 */
const subTitle = (sub) => sub.name

/** 让球胜平负: 让球数 */
const rqGoal = (sub) => {
  if (!sub.plays || sub.plays.length === 0) return null
  return sub.plays[0].handicap
}
const rqGoalText = (sub) => {
  const g = rqGoal(sub)
  if (g === null) return ''
  if (g === 0) return '(平手)'
  return g > 0 ? '(主队受让' + g + '球)' : '(主队让' + Math.abs(g) + '球)'
}

/** 盘口数值 -> 中文 */
const handicapText = (n, subName) => {
  const v = Math.abs(n)
  const map = [
    [0, '平手'], [0.25, '平手/半球'], [0.5, '半球'], [0.75, '半球/一球'],
    [1, '一球'], [1.25, '一球/一球半'], [1.5, '一球半'], [1.75, '一球半/二球'],
    [2, '二球'], [2.25, '二球/二球半'], [2.5, '二球半'], [2.75, '二球半/三球'],
    [3, '三球'], [3.25, '三球/三球半'], [3.5, '三球半'], [3.75, '三球半/四球'],
    [4, '四球'], [4.25, '四球/四球半'], [4.5, '四球半'], [4.75, '四球半/五球'], [5, '五球']
  ]
  let text = ''
  for (const [k, t] of map) {
    if (Math.abs(v - k) < 0.001) { text = t; break }
  }
  if (!text) text = String(v)
  if (subName === '大小球') return dxqHandicapText(v)
  if (n === 0) return '平手'
  return n < 0 ? ('让' + text) : ('受让' + text)
}

/** 选中玩法显示名 */
const selectedDisplayName = computed(() => {
  const p = selectedPlay.value
  if (!p._id) return ''
  let name = p.name
  if (p.handicap !== undefined && p.handicap !== null) {
    const sideText = { home: '主', away: '客', over: '大', under: '小' }[p.side] || ''
    if (sideText === name) name = sideText + ' ' + handicapText(p.handicap, p.side === 'over' || p.side === 'under' ? '大小球' : '让球盘')
    else name = name + ' ' + handicapText(p.handicap, p.side === 'over' || p.side === 'under' ? '大小球' : '让球盘')
  }
  return name
})

const selectedOddsText = computed(() => {
  const p = selectedPlay.value
  if (!p._id) return ''
  return fmtOdds(p.water || p.odds)
})

const getGridColumns = (count) => {
  if (count === 1) return '1fr'
  if (count === 3) return '1fr 1fr 1fr'
  return '1fr 1fr'
}

const selectPlay = (play) => {
  if (isMatchInCart.value) {
    uni.showToast({ title: '该场次已在串关列表中', icon: 'none' })
    return
  }
  if (selectedPlay.value._id === play._id) {
    selectedPlay.value = {}
  } else {
    selectedPlay.value = { ...play }
  }
}

/** 单关下注 */
const singleBet = () => {
  if (!selectedPlay.value._id) return
  showSingleSheet.value = true
}

const addToCart = () => {
  if (!selectedPlay.value._id) return
  if (isMatchInCart.value) {
    uni.showToast({ title: '该场次已在串关列表中', icon: 'none' })
    return
  }
  const p = selectedPlay.value
  const result = betCart.add({
    playId: p._id,
    playName: p.name,
    playLabel: p.label || '',
    odds: p.odds,
    water: p.water || '',
    handicap: p.handicap,
    sourceKey: p.sourceKey || '',
    categoryName: p.categoryName || '',
    bigCategoryName: p.bigCategoryName || '',
    matchId: match.value._id,
    matchName: match.value.name || '',
    teamA: match.value.teamA || '',
    teamB: match.value.teamB || ''
  })
  if (result.ok) {
    uni.showToast({ title: '已加入串关，可继续选择其他场次', icon: 'success', duration: 1500 })
    selectedPlay.value = {}
  } else {
    uni.showToast({ title: result.message || '加入失败', icon: 'none' })
  }
}

const showCartBet = () => { showCartSheet.value = true }

const onCartRemovePlay = ({ playId }) => { betCart.remove(playId) }

const removeFromCart = () => {
  betCart.removeByMatch(match.value._id)
  uni.showToast({ title: '已移出串关', icon: 'success', duration: 1200 })
}

const handleSingleConfirm = async (betData) => {
  showSingleSheet.value = false
  try {
    const res = await uniCloud.callFunction({
      name: 'user-order',
      data: {
        token: uni.getStorageSync('token'),
        playIds: betData.playIds,
        betAmount: betData.betAmount,
        isParlay: false
      }
    })
    const result = res.result
    if (result && result.code === 0) {
      // 以服务端实时赔率为准
      uni.showToast({
        title: '下单成功！可赢 ¥' + result.data.winAmount.toFixed(2) + (result.data.balance !== undefined ? '，余额 ¥' + result.data.balance.toFixed(2) : ''),
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
      uni.showToast({
        title: '串关下单成功！可赢 ¥' + result.data.winAmount.toFixed(2),
        icon: 'success', duration: 2000
      })
      betCart.clear()
      selectedPlay.value = {}
    } else {
      uni.showToast({ title: (result && result.message) || '下单失败', icon: 'error' })
    }
  } catch (e) {
    console.error('串关下单失败:', e)
    uni.showToast({ title: '网络错误，请重试', icon: 'error' })
  }
}

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
          for (const sub of cat.subCategories || []) {
            for (const p of sub.plays || []) oldOddsMap[p._id] = p.odds
          }
        }
        match.value = matchData
        categoryPlays.value = matchData.categoryPlays || []
        currentOddsVersion.value = matchData.oddsVersion || 0

        if (selectedPlay.value._id) {
          const found = findAllPlays(matchData).find(p => p._id === selectedPlay.value._id)
          if (found) selectedPlay.value = { ...found }
        }

        let cartChanged = false
        for (const p of findAllPlays(matchData)) {
          if (oldOddsMap[p._id] !== undefined && oldOddsMap[p._id] !== p.odds) {
            if (betCart.updateOdds(p._id, p.odds, p.water)) cartChanged = true
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

function findAllPlays(matchData) {
  const out = []
  for (const cat of matchData.categoryPlays || []) {
    for (const sub of cat.subCategories || []) {
      for (const p of sub.plays || []) out.push(p)
      if (sub.handicapPlays) {
        for (const row of sub.handicapPlays) {
          if (row.home) out.push(row.home)
          if (row.away) out.push(row.away)
        }
      }
    }
  }
  return out
}

let pollingMatchId = ''

onLoad(async (options) => {
  const matchId = options.id
  if (!matchId) return
  pollingMatchId = matchId

  await fetchMatchData(matchId)
  loaded.value = true

  startPolling({
    matchIds: [matchId],
    versions: { [matchId]: currentOddsVersion.value },
    onChange: async () => {
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
  padding: 30rpx 40rpx; color: #fff; text-align: center;
  .match-top {
    display: flex; align-items: center; justify-content: center; gap: 12rpx;
    margin-bottom: 20rpx;
    .cc-tag { font-size: 22rpx; background: rgba(255,255,255,0.2); padding: 4rpx 14rpx; border-radius: 10rpx; }
    .league { font-size: 26rpx; opacity: 0.9; }
    .state { font-size: 22rpx; color: #ffcdd2; }
  }
  .teams { display: flex; justify-content: center; align-items: center; gap: 30rpx; }
  .team { display: flex; flex-direction: column; align-items: center; width: 200rpx;
    .flag { width: 80rpx; height: 60rpx; border-radius: 8rpx; background: rgba(255,255,255,0.2); }
    text { font-size: 30rpx; font-weight: bold; margin-top: 8rpx; }
  }
  .vs-box { display: flex; flex-direction: column; align-items: center;
    .vs { font-size: 40rpx; font-weight: bold; }
    .time { font-size: 24rpx; opacity: 0.85; margin-top: 8rpx; }
  }
  .sync-time { display: block; margin-top: 16rpx; font-size: 22rpx; opacity: 0.7; }
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
    display: flex; align-items: center; gap: 10rpx;
    .rq-hint { font-size: 22rpx; color: #ef6c00; }
  }
  .play-grid {
    display: grid; gap: 12rpx;
  }
  .play-item {
    position: relative;
    padding: 16rpx; background: #f5f5f5; border-radius: 12rpx;
    text-align: center; border: 2rpx solid transparent;
    .play-name { display: block; font-size: 26rpx; color: #333; }
    .play-odds { display: block; font-size: 32rpx; color: #d32f2f; font-weight: bold; margin-top: 8rpx; }
    &.selected { border-color: #1a237e; background: #e8eaf6; }
  }
}

// ============ 盘口表格 ============
.pankou-table {
  border: 1rpx solid #eee; border-radius: 12rpx; overflow: hidden;
  .pk-row {
    display: flex; align-items: stretch;
    border-bottom: 1rpx solid #f0f0f0;
    &:last-child { border-bottom: none; }
  }
  .pk-col {
    flex: 1; text-align: center; font-size: 26rpx; color: #333;
    padding: 16rpx 8rpx; display: flex; align-items: center; justify-content: center;
    border-left: 1rpx solid #f0f0f0;
    &:first-child { border-left: none; }
  }
  .pk-head {
    background: #f5f5f5;
    .pk-col { font-size: 24rpx; color: #666; }
  }
  .pk-line { font-weight: bold; color: #1a237e; }
  .pk-cell {
    &.selected { background: #e8eaf6; border: 2rpx solid #1a237e; border-radius: 4rpx; }
    &.empty { color: #ddd; }
    .pk-water { color: #d32f2f; font-weight: bold; }
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
