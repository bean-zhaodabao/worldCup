<template>
  <view class="bet-sheet-mask" v-if="visible" @click="handleMaskClose">
    <view class="bet-sheet" :class="{ 'sheet-open': visible, 'sheet-loading': isLoading }" @click.stop>
      <!-- 拖动条 -->
      <view class="sheet-handle"><view class="handle-bar"></view></view>

      <!-- 顶部栏 -->
      <view class="sheet-topbar">
        <text class="sheet-title">确认投注</text>
        <view class="sheet-close" @click="handleMaskClose">×</view>
      </view>

      <!-- 头部信息卡片 -->
      <view class="info-card">
        <view class="info-top">
          <text class="play-title">
            {{ isParlay ? '串关投注' : firstPlayName }}
            <text class="play-handicap-cn" v-if="!isParlay && firstHandicapCn">{{ firstHandicapCn }}</text>
          </text>
          <view class="odds-box" v-if="!isParlay">
            <text class="odds-at">@</text>
            <text class="odds-num">{{ singleOddsText }}</text>
          </view>
        </view>

        <!-- 单关信息 -->
        <view class="single-info" v-if="!isParlay && playList.length === 1">
          <view class="accent-bar"></view>
          <view class="accent-body">
            <text class="category-text" v-if="categoryText">{{ categoryText }}</text>
            <text class="teams-text" v-if="matchInfo.teamA || matchInfo.teamB">{{ matchInfo.teamA }} VS {{ matchInfo.teamB }}</text>
            <text class="league-text" v-if="matchInfo.leagueName || matchInfo.name">{{ matchInfo.leagueName || matchInfo.name }}</text>
          </view>
        </view>

        <!-- 串关场次 -->
        <view class="parlay-list" v-else-if="isParlay">
          <view class="parlay-item" v-for="(p, i) in playList" :key="p.playId || i">
            <view class="parlay-item-accent"></view>
            <view class="parlay-item-main">
              <view class="parlay-item-top">
                <text class="parlay-match-name">{{ p.teamA }} VS {{ p.teamB }}</text>
                <view class="remove-btn" @click="removePlay(i)">×</view>
              </view>
              <view class="parlay-item-bottom">
                <text class="parlay-play-name">
                  {{ playDisplayName(p) }}
                  <text class="play-handicap-cn" v-if="playHandicapCn(p)">{{ playHandicapCn(p) }}</text>
                </text>
                <text class="parlay-play-odds">@{{ playOddsText(p) }}</text>
              </view>
            </view>
          </view>

          <view class="parlay-summary">
            <view class="parlay-summary-head">
              <text class="parlay-summary-count">串关 {{ playList.length }} 场</text>
              <text class="parlay-summary-odds">@{{ totalOdds }}</text>
            </view>
            <view class="parlay-summary-win-row">
              <text class="parlay-summary-label">预计可赢</text>
              <text class="parlay-summary-win">¥{{ winAmount }}</text>
            </view>
          </view>
        </view>

        <!-- 底部提示 + 注数 -->
        <view class="info-footer">
          <view class="realtime-row">
            <view class="realtime-dot">i</view>
            <text class="realtime-hint">提交时按系统实时赔率下单</text>
          </view>
          <view class="count-badge">{{ playList.length }}</view>
        </view>
      </view>

      <!-- 金额输入区 -->
      <view class="amount-section">
        <view class="amount-head">
          <text class="amount-label">下注金额</text>
        </view>

        <view class="amount-row">
          <view class="amount-field">
            <text class="amount-value" :class="{ placeholder: !displayAmount }">{{ displayAmount || '0.00' }}</text>
            <view class="amount-caret"></view>
            <text class="amount-unit">RMB</text>
          </view>
          <view class="clear-btn" @click="clearAmount">
            <text class="clear-icon">×</text>
            <text>清空</text>
          </view>
        </view>

        <!-- 快捷金额 -->
        <view class="quick-amounts">
          <view
            class="quick-chip"
            v-for="amt in quickAmounts"
            :key="amt"
            :class="{ active: inputAmount === String(amt) }"
            @click="setQuickAmount(amt)"
          >
            {{ amt }}
          </view>
        </view>

        <!-- 倍数 -->
        <view class="multiplier-row">
          <text class="multiplier-label">倍数</text>
          <view class="multiplier-control">
            <view class="mult-btn" @click="changeMultiplier(-1)">−</view>
            <text class="mult-value">{{ multiplier }}</text>
            <view class="mult-btn" @click="changeMultiplier(1)">+</view>
          </view>
          <text class="mult-hint">买 {{ multiplier }} 倍</text>
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
            <text v-if="key.type === 'delete'" class="key-icon">⌫</text>
            <text v-else-if="key.type === 'confirm'">确定</text>
            <text v-else>{{ key.value }}</text>
          </view>
        </view>
      </view>

      <!-- 滑动提交按钮 -->
      <view class="slide-submit-wrapper">
        <!-- 下单失败原因（接口返回的 message，紧贴提交按钮持续展示，避免 toast 被弹层遮挡而看不到） -->
        <view class="sheet-error" v-if="errorText && !isLoading">
          <text class="sheet-error-icon">!</text>
          <text class="sheet-error-text">{{ errorText }}</text>
        </view>
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
          <view v-if="!isLoading" class="slide-chevrons">›››</view>
          <view
            v-if="!isLoading"
            class="slide-thumb"
            :style="{ left: (slideLeft + thumbMargin) + 'px' }"
          >
            <text class="slide-arrow">→</text>
          </view>
          <view
            v-else
            class="slide-thumb slide-thumb-loading"
            :style="{ left: (slideMaxWidth + thumbMargin) + 'px' }"
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
  return parseFloat(w) > 0 ? ('滑动投注 · 可赢 ¥' + w) : '请输入金额'
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

const clearAmount = () => {
  inputAmount.value = ''
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
const thumbMargin = 8
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
      trackWidth = rect.width - 34 - thumbMargin * 2
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
  background: rgba(15, 23, 42, 0.55);
  z-index: 1000;
  display: flex; align-items: flex-end;
  // 阻止滚动手势穿透到背后的页面
  overscroll-behavior: none;
}

.bet-sheet {
  width: 100%; max-height: 88vh; overflow-y: auto;
  background: #f4f6fa;
  border-radius: 32rpx 32rpx 0 0;
  box-shadow: 0 -12rpx 40rpx rgba(15, 23, 42, 0.16);
  // 弹层内部滚动到边界时不要让背景页面接着滚(滚动链传导)
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  animation: slideUp 0.26s cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.sheet-handle {
  display: flex; justify-content: center; padding: 16rpx 0 6rpx;
  .handle-bar {
    width: 64rpx; height: 6rpx; background: #d5dae3; border-radius: 3rpx;
  }
}

.sheet-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4rpx 24rpx 18rpx;
  .sheet-title {
    font-size: 32rpx; font-weight: bold; color: #1f2937; letter-spacing: 0.5rpx;
  }
  .sheet-close {
    width: 56rpx; height: 56rpx; border-radius: 50%;
    background: #e9edf4; color: #7b8494;
    display: flex; align-items: center; justify-content: center;
    font-size: 36rpx; line-height: 1;
    &:active { opacity: 0.7; }
  }
}

// ============ 头部信息卡片 ============
.info-card {
  margin: 0 24rpx;
  padding: 26rpx 26rpx 20rpx;
  background: #fff;
  border-radius: 22rpx;
  box-shadow: 0 6rpx 24rpx rgba(17, 24, 39, 0.05);
}

.info-top {
  display: flex; align-items: flex-start; justify-content: space-between;
  .play-title {
    flex: 1; min-width: 0; padding-right: 16rpx;
    font-size: 36rpx; font-weight: bold; color: #1f2937;
    line-height: 1.35;
  }
  .odds-box {
    flex-shrink: 0; display: flex; align-items: baseline;
    .odds-at { font-size: 24rpx; color: #9aa3b2; margin-right: 2rpx; }
    .odds-num {
      font-size: 42rpx; font-weight: bold; color: #1f2937;
      letter-spacing: -0.5rpx;
    }
  }
}

// 让球中文盘口小字后缀
.play-handicap-cn {
  font-size: 20rpx; color: #9aa3b2; font-weight: normal; margin-left: 6rpx;
}

.single-info {
  display: flex; margin-top: 20rpx;
  .accent-bar {
    width: 6rpx; border-radius: 3rpx; background: #2f6cf6; flex-shrink: 0;
  }
  .accent-body {
    display: flex; flex-direction: column; padding-left: 18rpx;
    .category-text { font-size: 25rpx; color: #7b8494; }
    .teams-text {
      margin-top: 8rpx; font-size: 28rpx; color: #1f2937; font-weight: 500;
    }
    .league-text { margin-top: 6rpx; font-size: 23rpx; color: #9aa3b2; }
  }
}

// 串关场次列表
.parlay-list {
  margin-top: 20rpx;
  .parlay-item {
    display: flex; margin-bottom: 12rpx; padding: 16rpx 18rpx;
    background: #f7f9fc; border-radius: 14rpx;
    &:last-child { margin-bottom: 0; }
    .parlay-item-accent {
      width: 6rpx; border-radius: 3rpx; background: #2f6cf6; flex-shrink: 0;
    }
    .parlay-item-main { flex: 1; min-width: 0; padding-left: 16rpx; }
  }
  .parlay-item-top {
    display: flex; align-items: center; justify-content: space-between;
    .parlay-match-name { font-size: 27rpx; font-weight: bold; color: #1f2937; }
    .remove-btn {
      width: 40rpx; height: 40rpx; border-radius: 50%;
      background: #e9edf4; color: #8b93a1;
      display: flex; align-items: center; justify-content: center;
      font-size: 28rpx; line-height: 1;
      &:active { background: #ffe8e8; color: #d64545; }
    }
  }
  .parlay-item-bottom {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-top: 8rpx;
    .parlay-play-name { font-size: 25rpx; color: #7b8494; }
    .parlay-play-odds { font-size: 27rpx; font-weight: bold; color: #2f6cf6; }
  }

  // 串关汇总
  .parlay-summary {
    margin-top: 12rpx; padding: 16rpx 18rpx;
    background: #eef5ff; border-radius: 12rpx;
    .parlay-summary-head {
      display: flex; align-items: baseline; justify-content: space-between;
      .parlay-summary-count { font-size: 28rpx; font-weight: bold; color: #1f2937; }
      .parlay-summary-odds { font-size: 30rpx; font-weight: bold; color: #2f6cf6; }
    }
    .parlay-summary-win-row {
      display: flex; align-items: baseline; justify-content: space-between;
      margin-top: 8rpx;
      .parlay-summary-label { font-size: 24rpx; color: #5c6b84; }
      .parlay-summary-win { font-size: 30rpx; font-weight: bold; color: #2f6cf6; }
    }
  }
}

.info-footer {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 20rpx;
  .realtime-row {
    display: flex; align-items: center; min-width: 0;
    .realtime-dot {
      width: 30rpx; height: 30rpx; border-radius: 50%;
      background: #eaf2ff; color: #2f6cf6;
      font-size: 20rpx; font-weight: bold;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; margin-right: 10rpx;
    }
    .realtime-hint { font-size: 23rpx; color: #8b93a1; }
  }
  .count-badge {
    flex-shrink: 0; min-width: 44rpx; height: 44rpx; padding: 0 10rpx;
    border-radius: 22rpx; background: #eef1f7; color: #6b7280;
    font-size: 23rpx; font-weight: 600;
    display: flex; align-items: center; justify-content: center;
  }
}

// ============ 金额区 ============
.amount-section {
  padding: 22rpx 24rpx 0;
  .amount-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 14rpx;
    .amount-label { font-size: 26rpx; font-weight: 600; color: #4b5563; }
  }
}

.amount-row { display: flex; gap: 16rpx; }

.amount-field {
  flex: 1; min-width: 0; height: 96rpx;
  display: flex; align-items: center;
  padding: 0 22rpx;
  background: #fff; border: 1rpx solid #e1e7f0;
  border-radius: 16rpx;
  box-shadow: inset 0 2rpx 4rpx rgba(17, 24, 39, 0.02);
  .amount-value {
    font-size: 44rpx; font-weight: bold; color: #1f2937;
    letter-spacing: 0.5rpx;
  }
  .placeholder { color: #c1c7d2; font-weight: 500; }
  .amount-caret {
    width: 3rpx; height: 38rpx; margin-left: 4rpx;
    background: #2f6cf6; border-radius: 2rpx;
    animation: caretBlink 1s step-end infinite;
  }
  .amount-unit {
    margin-left: auto; padding-left: 12rpx;
    font-size: 24rpx; color: #9aa3b2;
  }
}

@keyframes caretBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.clear-btn {
  flex-shrink: 0; width: 150rpx; height: 96rpx;
  display: flex; align-items: center; justify-content: center; gap: 4rpx;
  background: linear-gradient(135deg, #2f6cf6, #1e4fd0);
  color: #fff; font-size: 26rpx; font-weight: 600;
  border-radius: 16rpx;
  box-shadow: 0 8rpx 18rpx rgba(47, 108, 246, 0.24);
  &:active { opacity: 0.85; }
  .clear-icon { font-size: 30rpx; line-height: 1; font-weight: 400; }
}

.quick-amounts {
  display: flex; gap: 10rpx; margin-top: 18rpx;
  .quick-chip {
    flex: 1; height: 72rpx;
    display: flex; align-items: center; justify-content: center;
    background: #fff; border: 1rpx solid #e1e7f0; border-radius: 14rpx;
    font-size: 25rpx; font-weight: 500; color: #2f6cf6;
    position: relative; overflow: hidden; box-sizing: border-box;
    &:active { background: #f3f8ff; }
    &.active {
      border-color: #2f6cf6; background: #f3f8ff; font-weight: bold;
      &::after {
        content: ''; position: absolute; right: 0; bottom: 0;
        width: 0; height: 0;
        border-left: 16rpx solid transparent;
        border-bottom: 16rpx solid #2f6cf6;
      }
    }
  }
}

.multiplier-row {
  display: flex; align-items: center;
  margin-top: 18rpx; padding: 14rpx 20rpx;
  background: #fff; border-radius: 16rpx;
  box-shadow: 0 2rpx 10rpx rgba(17, 24, 39, 0.03);
  .multiplier-label { font-size: 25rpx; color: #6b7280; }
  .multiplier-control {
    display: flex; align-items: center; margin-left: 24rpx;
    .mult-btn {
      width: 56rpx; height: 56rpx; border-radius: 50%;
      background: #f2f6ff; color: #2f6cf6;
      font-size: 34rpx; font-weight: 500;
      display: flex; align-items: center; justify-content: center;
      &:active { background: #e3edff; }
    }
    .mult-value {
      min-width: 72rpx; text-align: center;
      font-size: 34rpx; font-weight: bold; color: #1f2937;
    }
  }
  .mult-hint { margin-left: auto; font-size: 24rpx; color: #8b93a1; }
}

// ============ 数字键盘 ============
.custom-keypad {
  padding: 16rpx 24rpx 2rpx;
  .keypad-row {
    display: flex; gap: 12rpx; margin-bottom: 12rpx;
    .keypad-key {
      flex: 1; height: 74rpx;
      display: flex; align-items: center; justify-content: center;
      background: #fff; border-radius: 14rpx;
      font-size: 32rpx; font-weight: 500; color: #1f2937;
      box-shadow: 0 2rpx 8rpx rgba(17, 24, 39, 0.04);
      &:active { background: #eaf0fb; }
      &.key-delete {
        background: #e9edf4; color: #5b6575; font-size: 28rpx;
        box-shadow: none;
        .key-icon { font-size: 30rpx; }
      }
      &.key-confirm {
        background: linear-gradient(135deg, #2f6cf6, #1e4fd0);
        color: #fff; font-size: 26rpx; font-weight: bold;
        box-shadow: none;
        &:active { opacity: 0.85; }
      }
      &.key-disabled { opacity: 0.45; }
    }
  }
}

// 下单失败提示
.sheet-error {
  display: flex; align-items: flex-start;
  margin: 0 0 16rpx;
  padding: 16rpx 18rpx;
  background: #fff1f2;
  border: 1rpx solid #ffd6d9;
  border-radius: 14rpx;

  .sheet-error-icon {
    flex-shrink: 0;
    width: 30rpx; height: 30rpx;
    margin-right: 10rpx;
    border-radius: 50%;
    background: #e04b4b;
    color: #fff;
    font-size: 22rpx; font-weight: bold;
    line-height: 30rpx; text-align: center;
  }

  .sheet-error-text {
    flex: 1;
    font-size: 24rpx;
    line-height: 34rpx;
    color: #c53030;
    word-break: break-all;
  }
}

// ============ 滑动提交按钮 ============
.slide-submit-wrapper {
  position: sticky; bottom: 0; z-index: 6;
  padding: 24rpx 24rpx 32rpx;
  padding-bottom: calc(32rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
  background: #f4f6fa;
}

.slide-track {
  position: relative;
  height: 100rpx;
  background: linear-gradient(135deg, #2f6cf6, #1e4fd0);
  border-radius: 50rpx;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  box-shadow: 0 10rpx 24rpx rgba(47, 108, 246, 0.28);
  // 拖动滑块时禁止浏览器接管手势（避免页面跟着滚动）
  touch-action: none;

  &.slide-disabled {
    background: #e5e9f0;
    box-shadow: none;
    .slide-bg-text { color: #a0a7b4; }
    .slide-chevrons { color: #c3c9d4; }
    .slide-thumb {
      box-shadow: none;
      .slide-arrow { color: #b3bac6; }
    }
  }

  &.slide-loading {
    background: linear-gradient(135deg, #2f6cf6, #1e4fd0);
    animation: slideGlow 1.4s ease-in-out infinite;
  }
}

@keyframes slideGlow {
  0%, 100% { box-shadow: 0 10rpx 24rpx rgba(47, 108, 246, 0.28); }
  50% { box-shadow: 0 10rpx 34rpx rgba(47, 108, 246, 0.46); }
}

.slide-bg-text {
  position: relative; z-index: 4;
  margin-left: 100rpx; padding-right: 74rpx;
  font-size: 27rpx; font-weight: 600; color: #fff;
  letter-spacing: 0.5rpx;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.slide-loading-text {
  display: flex; align-items: center; justify-content: center;
  z-index: 4; padding: 0 24rpx; margin-left: 80rpx;
  font-size: 26rpx; color: #fff; font-weight: bold;
  text { margin-left: 12rpx; }
}

.slide-chevrons {
  position: absolute; right: 28rpx; top: 50%; transform: translateY(-50%);
  z-index: 4; font-size: 28rpx; letter-spacing: 2rpx;
  color: rgba(255, 255, 255, 0.75);
}

// 加载转圈
.slide-spinner {
  width: 30rpx; height: 30rpx; flex-shrink: 0;
  border: 4rpx solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: slideSpin 0.7s linear infinite;

  &.slide-spinner-dark {
    border-color: rgba(47, 108, 246, 0.2);
    border-top-color: #2f6cf6;
  }
}

@keyframes slideSpin {
  to { transform: rotate(360deg); }
}

.slide-progress {
  position: absolute; left: 0; top: 0; height: 100%;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50rpx; transition: width 0.05s linear; z-index: 2;
}

.slide-thumb {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 68rpx; height: 68rpx; background: #fff;
  border-radius: 50%; z-index: 3;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4rpx 12rpx rgba(15, 23, 42, 0.18);
  transition: left 0.05s linear;

  .slide-arrow {
    font-size: 30rpx; color: #2f6cf6; font-weight: bold; line-height: 1;
  }

  &.slide-thumb-loading {
    transition: left 0.2s ease-out;
    box-shadow: 0 4rpx 16rpx rgba(15, 23, 42, 0.2);
  }
}

// 提交中：锁定金额区/键盘，避免重复操作
.sheet-loading {
  .amount-section, .custom-keypad { pointer-events: none; opacity: 0.5; }
}
</style>
