<template>
  <view class="bet-sheet-mask" v-if="visible" @click="handleMaskClose">
    <view class="bet-sheet" :class="{ 'sheet-open': visible, 'sheet-loading': isLoading }" @click.stop>
      <!-- 拖动条 -->
      <view class="sheet-handle"><view class="handle-bar"></view></view>

      <!-- 头部信息 -->
      <view class="sheet-header">
        <!-- 单关模式：显示一场比赛 info -->
        <template v-if="!isParlay && playList.length === 1">
          <view class="header-row">
            <text class="play-name">
              {{ firstPlayName }}
              <text class="play-handicap-cn" v-if="firstHandicapCn">{{ firstHandicapCn }}</text>
            </text>
            <text class="odds-tag">赔率 {{ singleOddsText }}</text>
          </view>
          <view class="header-row sub">
            <text class="category-text">{{ categoryText }}</text>
          </view>
          <view class="header-row teams">
            <text>{{ matchInfo.teamA }} VS {{ matchInfo.teamB }}</text>
          </view>
        </template>

        <!-- 串关模式：显示多个场次 -->
        <template v-else-if="isParlay">
          <view class="header-row">
            <text class="play-name">{{ playList.length }}场串关</text>
            <text class="odds-tag">赔率 {{ totalOdds }}</text>
          </view>
          <view class="parlay-matches">
            <view class="parlay-match-item" v-for="(p, i) in playList" :key="p.playId || i">
              <view class="parlay-match-header">
                <text class="parlay-match-name">{{ p.teamA }} VS {{ p.teamB }}</text>
                <text class="play-tag-remove" @click="removePlay(i)">×</text>
              </view>
              <view class="parlay-play-row">
                <text class="parlay-play-name">
                  {{ playDisplayName(p) }}
                  <text class="play-handicap-cn" v-if="playHandicapCn(p)">{{ playHandicapCn(p) }}</text>
                </text>
                <text class="parlay-play-odds">@{{ playOddsText(p) }}</text>
              </view>
            </view>
          </view>
        </template>

        <!-- 实时赔率提示 -->
        <view class="header-row sub">
          <text class="realtime-hint">提交时按系统实时赔率下单</text>
        </view>
      </view>

      <!-- 金额输入区 -->
      <view class="amount-section">
        <view class="amount-label">下注金额 (RMB)</view>
        <view class="amount-display">
          <text class="currency">¥</text>
          <text class="amount-value" :class="{ placeholder: !displayAmount }">
            {{ displayAmount || '请输入金额' }}
          </text>
        </view>

        <!-- 快捷金额 -->
        <view class="quick-amounts">
          <view
            class="quick-chip"
            v-for="amt in quickAmounts"
            :key="amt"
            :class="{ active: inputAmount === amt }"
            @click="setQuickAmount(amt)"
          >
            {{ amt }}
          </view>
        </view>

        <!-- 倍数选择 -->
        <view class="multiplier-row">
          <text class="multiplier-label">倍数</text>
          <view class="multiplier-control">
            <view class="mult-btn" @click="changeMultiplier(-1)">-</view>
            <text class="mult-value">{{ multiplier }}</text>
            <view class="mult-btn" @click="changeMultiplier(1)">+</view>
          </view>
          <text class="mult-hint">买{{ multiplier }}倍</text>
        </view>
      </view>

      <!-- 自定义数字键盘 -->
      <view class="custom-keypad">
        <view class="keypad-row" v-for="(row, ri) in keypadKeys" :key="ri">
          <view
            class="keypad-key"
            v-for="key in row"
            :key="key.value"
            :class="{
              'key-delete': key.type === 'delete',
              'key-confirm': key.type === 'confirm',
              'key-disabled': key.type === 'confirm' && !canSubmit
            }"
            @click="onKeyPress(key)"
          >
            <text v-if="key.type === 'delete'">⌫</text>
            <text v-else-if="key.type === 'confirm'">确定</text>
            <text v-else>{{ key.value }}</text>
          </view>
        </view>
      </view>

      <!-- 下单失败原因（接口返回的 message，紧贴提交按钮持续展示，避免 toast 被弹层遮挡而看不到） -->
      <view class="sheet-error" v-if="errorText && !isLoading">
        <text class="sheet-error-icon">!</text>
        <text class="sheet-error-text">{{ errorText }}</text>
      </view>

      <!-- 滑动提交按钮 -->
      <view class="slide-submit-wrapper">
        <view
          class="slide-track"
          :class="{ 'slide-loading': isLoading, 'slide-disabled': !canSubmit }"
          ref="slideTrack"
          @touchstart.stop="onSlideStart"
          @touchmove.stop.prevent="onSlideMove"
          @touchend="onSlideEnd"
          @touchcancel="onSlideEnd"
        >
          <view v-if="!isLoading" class="slide-bg-text">
            {{ slideText }}
          </view>
          <view v-else class="slide-loading-text">
            <view class="slide-spinner"></view>
            <text>正在提交，请稍候…</text>
          </view>
          <view
            v-if="!isLoading"
            class="slide-thumb"
            :style="{ left: slideLeft + 'px' }"
          >
            <text class="slide-arrow">→</text>
          </view>
          <view
            v-else
            class="slide-thumb slide-thumb-loading"
            :style="{ left: slideMaxWidth + 'px' }"
          >
            <view class="slide-spinner slide-spinner-dark"></view>
          </view>
          <view class="slide-progress" :style="{ width: (isLoading ? 100 : slideProgress) + '%' }"></view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { fmtOdds, dxqHandicapText, rqHandicapText, rqHandicapCn } from '@/utils/format.js'
import { lockBodyScroll, unlockBodyScroll } from '@/utils/scrollLock.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  matchInfo: { type: Object, default: () => ({ teamA: '', teamB: '' }) },
  // selectedPlays: [{ _id (or playId), name (or playName), odds, categoryName, bigCategoryName, teamA, teamB, matchName }]
  selectedPlays: { type: Array, default: () => [] },
  // 串关模式标记
  isParlay: { type: Boolean, default: false },
  // 提交中（由父组件在请求下单接口期间置为 true）
  loading: { type: Boolean, default: false },
  // 下单失败原因（由父组件在接口返回非 0 时传入）
  errorText: { type: String, default: '' },
})

const emit = defineEmits(['confirm', 'cancel', 'removePlay'])

// ============ 金额输入 ============
const inputAmount = ref('')
const multiplier = ref(1)

const quickAmounts = [10, 50, 100, 200, 500, 1000]

const displayAmount = computed(() => {
  if (!inputAmount.value) return ''
  return parseFloat(inputAmount.value).toFixed(2)
})

// ============ 玩法信息 ============
const playList = computed(() => props.selectedPlays || [])

const firstPlayName = computed(() => {
  if (playList.value.length === 0) return ''
  const p = playList.value[0]
  const name = playDisplayName(p)
  const label = p.playLabel || p.label || ''
  return label ? (name + ' (' + label + ')') : name
})

const firstHandicapCn = computed(() => {
  if (playList.value.length === 0) return ''
  return playHandicapCn(playList.value[0])
})

const categoryText = computed(() => {
  if (playList.value.length === 0) return ''
  const p = playList.value[0]
  const bigCat = p.bigCategoryName || ''
  const cat = p.categoryName || ''
  if (bigCat && cat) return bigCat + ' / ' + cat
  return bigCat || cat
})

const totalOdds = computed(() => {
  if (playList.value.length === 0) return '0.00'
  const product = playList.value.reduce((acc, p) => acc * (p.odds || 0), 1)
  return product.toFixed(2)
})

/** 单关赔率文案: 盘口玩法显示水位, 其余显示十进制赔率 */
const singleOddsText = computed(() => {
  if (playList.value.length === 0) return '0.00'
  return playOddsText(playList.value[0])
})

/** 玩法显示名: 盘口玩法带盘口(如 主 -1.25) */
function playDisplayName(p) {
  let name = p.playName || p.name || ''
  if (p.handicap !== undefined && p.handicap !== null) {
    const sideText = { home: '主', away: '客', over: '大', under: '小' }[p.side] || ''
    if (sideText === name) name = sideText + ' ' + handicapText(p.handicap, p.sourceKey)
    else name = name + ' ' + handicapText(p.handicap, p.sourceKey)
  }
  return name
}

/** 让球玩法的中文盘口(小字后缀, 便于与原中文盘口对照) */
function playHandicapCn(p) {
  if (p.handicap === undefined || p.handicap === null) return ''
  if ((p.sourceKey || '').indexOf('dxq:') === 0 || p.side === 'over' || p.side === 'under') return ''
  return rqHandicapCn(p.handicap)
}

/** 赔率显示: 有水位显示水位, 否则十进制, 统一2位小数 */
function playOddsText(p) {
  if (p.water) return fmtOdds(p.water)
  return fmtOdds(p.odds || 0)
}

/** 盘口数值 -> 让球用带符号拆分盘口, 大小球用数字样式盘口(2.5/2.5-3) */
function handicapText(n, sourceKey) {
  const isDxq = (sourceKey || '').indexOf('dxq:') === 0
  return isDxq ? dxqHandicapText(n) : rqHandicapText(n)
}

const lastOdds = ref(0)

// 仅弹层可见期间监听赔率变化（后台改赔率触发的才提示，用户切换玩法不会触发）
watch(totalOdds, (newVal) => {
  if (!props.visible) return
  const num = parseFloat(newVal) || 0
  if (lastOdds.value > 0 && num !== lastOdds.value) {
    const isParlay = playList.value.length > 1
    uni.showToast({
      title: isParlay ? '购物车赔率已更新' : '赔率已更新',
      icon: 'none',
      duration: 2000
    })
  }
  lastOdds.value = num
})

// ============ 可赢额度 ============
const winAmount = computed(() => {
  const amt = parseFloat(inputAmount.value) || 0
  const odds = parseFloat(totalOdds.value) || 0
  const mult = multiplier.value
  return ((amt * odds - amt) * mult).toFixed(2)
})

const slideText = computed(() => {
  const w = winAmount.value
  return parseFloat(w) > 0 ? ('可赢 ¥' + w + '  ››› 滑动确认') : '请输入金额后滑动确认'
})

const canSubmit = computed(() => {
  const amt = parseFloat(inputAmount.value)
  if (isNaN(amt) || amt <= 0) return false
  if (props.isParlay && playList.value.length < 2) return false
  if (props.isParlay && playList.value.length > 8) return false
  return true
})

// ============ 键盘 ============
const keypadKeys = [
  [
    { value: '1', type: 'number' },
    { value: '2', type: 'number' },
    { value: '3', type: 'number' }
  ],
  [
    { value: '4', type: 'number' },
    { value: '5', type: 'number' },
    { value: '6', type: 'number' }
  ],
  [
    { value: '7', type: 'number' },
    { value: '8', type: 'number' },
    { value: '9', type: 'number' }
  ],
  [
    { value: '.', type: 'decimal' },
    { value: '0', type: 'number' },
    { value: 'delete', type: 'delete' }
  ]
]

const onKeyPress = (key) => {
  if (key.type === 'delete') {
    inputAmount.value = inputAmount.value.slice(0, -1)
    return
  }
  if (key.type === 'number') {
    const parts = inputAmount.value.split('.')
    if (parts[0] && parts[0].length >= 6 && !inputAmount.value.includes('.')) return
    if (inputAmount.value.includes('.') && parts[1] && parts[1].length >= 2) return
    inputAmount.value += key.value
    return
  }
  if (key.type === 'decimal') {
    if (inputAmount.value.includes('.')) return
    if (!inputAmount.value) {
      inputAmount.value = '0.'
      return
    }
    inputAmount.value += '.'
    return
  }
}

const setQuickAmount = (amt) => {
  inputAmount.value = String(amt)
}

const changeMultiplier = (delta) => {
  const newVal = multiplier.value + delta
  if (newVal >= 1 && newVal <= 99) {
    multiplier.value = newVal
  }
}

const removePlay = (index) => {
  if (props.isParlay && playList.value.length <= 2) {
    uni.showToast({ title: '串关至少需要2个场次', icon: 'none' })
    return
  }
  const item = playList.value[index]
  if (item) {
    emit('removePlay', { playId: item.playId || item._id, matchId: item.matchId })
  }
}

// ============ 滑动提交 ============
const slideLeft = ref(0)
const slideProgress = ref(0)
const slideMaxWidth = ref(300)
const submitting = ref(false)
const isLoading = computed(() => submitting.value || props.loading)
let startX = 0
let currentLeft = 0
let trackWidth = 0
let dragging = false

const resetSlide = () => {
  slideLeft.value = 0
  slideProgress.value = 0
}

const onSlideStart = (e) => {
  if (isLoading.value || !canSubmit.value) return
  dragging = true
  startX = e.touches[0].clientX
  currentLeft = slideLeft.value

  const query = uni.createSelectorQuery().in(instance)
  query.select('.slide-track').boundingClientRect(rect => {
    if (rect) {
      trackWidth = rect.width - 44
      slideMaxWidth.value = trackWidth
    }
  }).exec()
}

const onSlideMove = (e) => {
  if (isLoading.value || !dragging || !canSubmit.value) return
  const deltaX = e.touches[0].clientX - startX
  const newLeft = Math.max(0, Math.min(currentLeft + deltaX, trackWidth))
  slideLeft.value = newLeft
  slideProgress.value = trackWidth > 0 ? (newLeft / trackWidth) * 100 : 0
}

const onSlideEnd = () => {
  if (!dragging) return
  dragging = false
  if (!canSubmit.value) {
    resetSlide()
    return
  }
  if (slideProgress.value >= 85) {
    // 拉到最右端并进入加载态，等待父组件完成下单
    slideLeft.value = trackWidth
    slideProgress.value = 100
    submitting.value = true
    handleSubmit()
  } else {
    resetSlide()
  }
}

import { getCurrentInstance } from 'vue'
const instance = getCurrentInstance()

// 父组件请求结束（失败/取消）时退出加载态，允许重新滑动
watch(() => props.loading, (val) => {
  if (val) {
    submitting.value = true
  } else if (submitting.value) {
    submitting.value = false
    resetSlide()
  }
})

// ============ 提交 ============
const handleSubmit = () => {
  if (!canSubmit.value) return
  emit('confirm', {
    playIds: playList.value.map(p => p.playId || p._id),
    betAmount: parseFloat(parseFloat(inputAmount.value).toFixed(2)),
    multiplier: multiplier.value,
    totalOdds: parseFloat(totalOdds.value),
    isParlay: playList.value.length > 1
  })
}

const handleMaskClose = () => {
  if (isLoading.value) return
  emit('cancel')
}

// 弹层打开期间锁定背景页面滚动, 避免手指滑动时整页跟着移动
let scrollLocked = false
const setScrollLock = (locked) => {
  if (locked === scrollLocked) return
  scrollLocked = locked
  if (locked) lockBodyScroll()
  else unlockBodyScroll()
}

watch(() => props.visible, (val) => {
  if (val) {
    setScrollLock(true)
    inputAmount.value = ''
    multiplier.value = 1
    submitting.value = false
    dragging = false
    resetSlide()
    // 记录打开时的赔率作为基准，后续只在此基准上检测变化
    lastOdds.value = parseFloat(totalOdds.value) || 0
  } else {
    setScrollLock(false)
  }
})

onUnmounted(() => {
  // 页面跳转/组件销毁时确保解锁, 避免页面一直不能滚动
  setScrollLock(false)
})
</script>

<style lang="scss" scoped>
.bet-sheet-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5); z-index: 1000;
  display: flex; align-items: flex-end;
  // 阻止滚动手势穿透到背后的页面
  overscroll-behavior: none;
}

.bet-sheet {
  width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0;
  max-height: 85vh; overflow-y: auto;
  // 弹层内部滚动到边界时不要让背景页面接着滚(滚动链传导)
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  animation: slideUp 0.25s ease-out;
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.sheet-handle {
  display: flex; justify-content: center; padding: 16rpx;
  .handle-bar {
    width: 60rpx; height: 8rpx; background: #ddd; border-radius: 4rpx;
  }
}

// ============ 头部 ============
.sheet-header {
  padding: 0 30rpx 20rpx;
  border-bottom: 1rpx solid #f0f0f0;
  .header-row {
    display: flex; align-items: center; margin-bottom: 8rpx;
    &.sub { margin-bottom: 4rpx; }
  }
  .play-name { font-size: 34rpx; font-weight: bold; color: #1a1a1a; }
  .odds-tag {
    margin-left: 16rpx; background: #ffebee; color: #d32f2f;
    font-size: 24rpx; padding: 4rpx 16rpx; border-radius: 20rpx; font-weight: bold;
  }
  .category-text { font-size: 24rpx; color: #999; }
  .teams { font-size: 26rpx; color: #666; margin-top: 8rpx; }
  .realtime-hint {
    font-size: 22rpx; color: #ef6c00; background: #fff3e0;
    padding: 4rpx 14rpx; border-radius: 12rpx;
  }
}

// 下单失败提示
.sheet-error {
  display: flex;
  align-items: flex-start;
  margin: 16rpx 30rpx 0;
  padding: 16rpx 20rpx;
  background: #ffebee;
  border: 1rpx solid #ffcdd2;
  border-radius: 12rpx;

  .sheet-error-icon {
    flex-shrink: 0;
    width: 32rpx; height: 32rpx;
    margin-right: 12rpx;
    border-radius: 50%;
    background: #d32f2f;
    color: #fff;
    font-size: 24rpx; font-weight: bold;
    line-height: 32rpx; text-align: center;
  }

  .sheet-error-text {
    flex: 1;
    font-size: 26rpx;
    line-height: 32rpx;
    color: #c62828;
    word-break: break-all;
  }
}

// 让球中文盘口小字后缀
.play-handicap-cn {
  font-size: 20rpx; color: #999; font-weight: normal; margin-left: 6rpx;
}

// 串关场次列表
.parlay-matches {
  margin-top: 12rpx;
  .parlay-match-item {
    background: #f8f9fa; border-radius: 12rpx; padding: 14rpx 16rpx; margin-bottom: 10rpx;
    .parlay-match-header {
      display: flex; justify-content: space-between; align-items: center;
      .parlay-match-name { font-size: 26rpx; font-weight: bold; color: #1a237e; }
      .play-tag-remove {
        color: #999; font-size: 32rpx; padding: 4rpx 12rpx;
        &:active { color: #d32f2f; }
      }
    }
    .parlay-play-row {
      display: flex; justify-content: space-between; align-items: center; margin-top: 8rpx;
      .parlay-play-name { font-size: 24rpx; color: #666; }
      .parlay-play-odds { font-size: 26rpx; color: #d32f2f; font-weight: bold; }
    }
  }
}

// ============ 金额区 ============
.amount-section {
  padding: 20rpx 30rpx;
  .amount-label { font-size: 26rpx; color: #999; margin-bottom: 12rpx; }
  .amount-display {
    display: flex; align-items: baseline; padding: 16rpx 0; border-bottom: 2rpx solid #1a237e;
    .currency { font-size: 36rpx; color: #d32f2f; font-weight: bold; margin-right: 8rpx; }
    .amount-value { font-size: 44rpx; font-weight: bold; color: #1a1a1a; }
    .placeholder { color: #ccc; font-size: 28rpx; font-weight: normal; }
  }

  .quick-amounts {
    display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 20rpx;
    .quick-chip {
      padding: 12rpx 24rpx; background: #f5f5f5; border-radius: 8rpx;
      font-size: 26rpx; color: #666; border: 2rpx solid transparent;
      &.active { border-color: #1a237e; color: #1a237e; background: #e8eaf6; font-weight: bold; }
    }
  }

  .multiplier-row {
    display: flex; align-items: center; margin-top: 20rpx;
    .multiplier-label { font-size: 26rpx; color: #666; }
    .multiplier-control {
      display: flex; align-items: center; margin: 0 20rpx;
      .mult-btn {
        width: 56rpx; height: 56rpx; border: 2rpx solid #ddd;
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        font-size: 32rpx; color: #333;
        &:active { background: #f0f0f0; }
      }
      .mult-value { font-size: 36rpx; font-weight: bold; margin: 0 30rpx; color: #1a237e; }
    }
    .mult-hint { font-size: 24rpx; color: #d32f2f; }
  }
}

// ============ 数字键盘 ============
.custom-keypad {
  background: #f5f5f5; padding: 10rpx 20rpx 20rpx;
  .keypad-row {
    display: flex; gap: 12rpx; margin-bottom: 10rpx;
    .keypad-key {
      flex: 1; height: 90rpx; display: flex; align-items: center; justify-content: center;
      background: #fff; border-radius: 12rpx; font-size: 36rpx; font-weight: 500;
      color: #1a1a1a;
      &:active { background: #e0e0e0; }
      &.key-delete { background: #e0e0e0; font-size: 28rpx; }
      &.key-confirm {
        background: linear-gradient(135deg, #1a237e, #0d47a1);
        color: #fff; font-size: 28rpx; font-weight: bold;
        &:active { opacity: 0.8; }
      }
      &.key-disabled { opacity: 0.5; }
    }
  }
}

// ============ 滑动提交按钮 ============
.slide-submit-wrapper {
  padding: 20rpx 80rpx 40rpx;
}

.slide-track {
  position: relative;
  height: 90rpx;
  background: #e0e0e0;
  border-radius: 45rpx;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  // 拖动滑块时禁止浏览器接管手势（避免页面跟着滚动）
  touch-action: none;

  &.slide-disabled .slide-bg-text { color: #bbb; }
  &.slide-loading {
    background: #2e7d32;
    animation: slideGlow 1.4s ease-in-out infinite;
  }
}

@keyframes slideGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.35); }
  50% { box-shadow: 0 0 0 10rpx rgba(76, 175, 80, 0.12); }
}

.slide-bg-text {
  font-size: 26rpx; color: #999; z-index: 4;
  white-space: nowrap; overflow: hidden;
  padding: 0 20rpx;
}

.slide-loading-text {
  display: flex; align-items: center; justify-content: center;
  z-index: 4; padding: 0 24rpx;
  font-size: 26rpx; color: #fff; font-weight: bold;
  text { margin-left: 12rpx; }
}

// 加载转圈
.slide-spinner {
  width: 30rpx; height: 30rpx; flex-shrink: 0;
  border: 4rpx solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: slideSpin 0.7s linear infinite;

  &.slide-spinner-dark { border-color: rgba(76, 175, 80, 0.25); border-top-color: #4caf50; }
}

@keyframes slideSpin {
  to { transform: rotate(360deg); }
}

.slide-progress {
  position: absolute; left: 0; top: 0; height: 100%;
  background: linear-gradient(135deg, #4caf50, #2e7d32);
  border-radius: 45rpx; transition: width 0.05s linear; z-index: 2;
}

.slide-thumb {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 80rpx; height: 80rpx; background: #fff;
  border-radius: 50%; z-index: 3;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.2);
  transition: left 0.05s linear;

  .slide-arrow {
    font-size: 36rpx; color: #4caf50; font-weight: bold;
  }

  &.slide-thumb-loading {
    transition: left 0.2s ease-out;
    box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.25);
  }
}

// 提交中：锁定金额区/键盘，避免重复操作
.sheet-loading {
  .amount-section, .custom-keypad { pointer-events: none; opacity: 0.5; }
}
</style>
