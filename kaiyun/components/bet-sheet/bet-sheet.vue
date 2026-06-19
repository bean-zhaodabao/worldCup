<template>
  <view class="bet-sheet-mask" v-if="visible" @click="handleMaskClose">
    <view class="bet-sheet" :class="{ 'sheet-open': visible }" @click.stop>
      <!-- 拖动条 -->
      <view class="sheet-handle"><view class="handle-bar"></view></view>

      <!-- 头部信息 -->
      <view class="sheet-header">
        <view class="header-row">
          <text class="play-name">{{ firstPlayName }}</text>
          <text class="odds-tag">赔率 {{ totalOdds }}</text>
        </view>
        <view class="header-row sub">
          <text class="category-text">{{ categoryText }}</text>
        </view>
        <view class="header-row teams">
          <text>{{ matchInfo.teamA }} VS {{ matchInfo.teamB }}</text>
        </view>

        <!-- 已选玩法列表（串关时显示） -->
        <view class="selected-plays" v-if="playList.length > 0">
          <view class="play-tag" v-for="(p, i) in playList" :key="p._id">
            <text>{{ p.name }}</text>
            <text class="play-tag-odds">@{{ p.odds }}</text>
            <text class="play-tag-remove" @click="removePlay(i)">×</text>
          </view>
          <view class="play-tag add-tag" @click="$emit('addPlay')">
            <text>+ 串</text>
          </view>
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

        <!-- 串（倍投）选择 -->
        <view class="multiplier-row" v-if="playList.length >= 1">
          <text class="multiplier-label">串 (倍投)</text>
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
            @touchstart.prevent="onKeyPress(key)"
          >
            <text v-if="key.type === 'delete'">⌫</text>
            <text v-else-if="key.type === 'confirm'">确定</text>
            <text v-else>{{ key.value }}</text>
          </view>
        </view>
      </view>

      <!-- 滑动提交按钮 -->
      <view class="slide-submit-wrapper">
        <view
          class="slide-track"
          ref="slideTrack"
          @touchstart="onSlideStart"
          @touchmove="onSlideMove"
          @touchend="onSlideEnd"
        >
          <view class="slide-bg-text">
            {{ slideText }}
          </view>
          <view
            class="slide-thumb"
            :style="{ left: slideLeft + 'px' }"
          >
            <text class="slide-arrow">→</text>
          </view>
          <view class="slide-progress" :style="{ width: slideProgress + '%' }"></view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  matchInfo: { type: Object, default: () => ({ teamA: '', teamB: '' }) },
  // selectedPlays: [{ _id, name, odds, categoryName, bigCategoryName }]
  selectedPlays: { type: Array, default: () => [] },
})

const emit = defineEmits(['confirm', 'cancel', 'addPlay'])

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
  if (playList.value.length === 1) {
    const p = playList.value[0]
    return p.label ? (p.name + ' (' + p.label + ')') : p.name
	// return p.label ? p.label : ''
  }
  return playList.value.map(p => p.label ? (p.name + ' (' + p.label + ')') : p.name).join(' + ')
})

const categoryText = computed(() => {
  if (playList.value.length === 0) return ''
  const p = playList.value[0]
  return p.bigCategoryName ? (p.bigCategoryName + ' / ' + p.categoryName) : (p.categoryName || '')
})

const totalOdds = computed(() => {
  if (playList.value.length === 0) return '0.00'
  const product = playList.value.reduce((acc, p) => acc * p.odds, 1)
  return product.toFixed(2)
})

// ============ 可赢额度 ============
const winAmount = computed(() => {
  const amt = parseFloat(inputAmount.value) || 0
  const odds = parseFloat(totalOdds.value) || 0
  const mult = multiplier.value
  // 可赢额度 = (下注额 × 赔率 - 下注额) × 倍数
  return ((amt * odds - amt) * mult).toFixed(2)
})

const slideText = computed(() => {
  const w = winAmount.value
  return parseFloat(w) > 0 ? ('可赢 ¥' + w + '  ››› 滑动确认') : '请输入金额后滑动确认'
})

const canSubmit = computed(() => parseFloat(inputAmount.value) > 0)

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
    // 限制整数部分最多6位
    const parts = inputAmount.value.split('.')
    if (parts[0] && parts[0].length >= 6 && !inputAmount.value.includes('.')) return
    // 限制小数最多2位
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
  if (playList.value.length <= 1) return // 至少保留1个
  const newList = [...playList.value]
  newList.splice(index, 1)
  // 需要通知父组件更新
  emit('update:selectedPlays', newList)
}

// ============ 滑动提交 ============
const slideLeft = ref(0)
const slideProgress = ref(0)
const slideMaxWidth = ref(300) // 轨道宽度（动态获取）
let startX = 0
let currentLeft = 0
let trackWidth = 0

const onSlideStart = (e) => {
  if (!canSubmit.value) return
  startX = e.touches[0].clientX
  currentLeft = slideLeft.value

  // 动态获取轨道宽度
  const query = uni.createSelectorQuery().in(instance)
  query.select('.slide-track').boundingClientRect(rect => {
    if (rect) {
      trackWidth = rect.width - 44 // 减去滑块宽度
      slideMaxWidth.value = trackWidth
    }
  }).exec()
}

const onSlideMove = (e) => {
  if (!canSubmit.value) return
  const deltaX = e.touches[0].clientX - startX
  const newLeft = Math.max(0, Math.min(currentLeft + deltaX, trackWidth))
  slideLeft.value = newLeft
  slideProgress.value = trackWidth > 0 ? (newLeft / trackWidth) * 100 : 0
}

const onSlideEnd = (e) => {
  if (!canSubmit.value) return
  if (slideProgress.value >= 85) {
    // 滑动到位，触发提交
    handleSubmit()
  }
  // 弹回
  slideLeft.value = 0
  slideProgress.value = 0
}

// uni-app 组件实例引用
import { getCurrentInstance } from 'vue'
const instance = getCurrentInstance()

// ============ 提交 ============
const handleSubmit = () => {
  if (!canSubmit.value) return
  emit('confirm', {
    playIds: playList.value.map(p => p._id),
    betAmount: parseFloat(parseFloat(inputAmount.value).toFixed(2)),
    multiplier: multiplier.value,
    totalOdds: parseFloat(totalOdds.value),
    isParlay: playList.value.length > 1
  })
  // 重置
  inputAmount.value = ''
  multiplier.value = 1
}

const handleMaskClose = () => {
  emit('cancel')
}

// visible 变化时重置
watch(() => props.visible, (val) => {
  if (val) {
    inputAmount.value = ''
    multiplier.value = 1
    slideLeft.value = 0
    slideProgress.value = 0
  }
})
</script>

<style lang="scss" scoped>
.bet-sheet-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5); z-index: 1000;
  display: flex; align-items: flex-end;
}

.bet-sheet {
  width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0;
  max-height: 85vh; overflow-y: auto;
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
}

// 已选玩法标签
.selected-plays {
  display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx;
  .play-tag {
    display: flex; align-items: center; gap: 6rpx;
    background: #e8eaf6; padding: 6rpx 16rpx; border-radius: 20rpx; font-size: 24rpx;
    .play-tag-odds { color: #d32f2f; font-weight: bold; }
    .play-tag-remove { color: #999; font-size: 28rpx; margin-left: 4rpx; }
    &.add-tag {
      background: #fff; border: 1rpx dashed #1a237e; color: #1a237e;
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
  padding: 20rpx 30rpx 40rpx;
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
}

.slide-bg-text {
  font-size: 26rpx; color: #999; z-index: 1;
  white-space: nowrap; overflow: hidden;
  padding: 0 20rpx;
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
}
</style>
