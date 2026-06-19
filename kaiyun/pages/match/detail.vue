<template>
  <view class="match-detail">
    <!-- 赛事信息 -->
    <view class="match-info">
      <view class="teams">
        <view class="team">
          <image :src="match.teamAFlag || '/static/logo.png'" mode="aspectFit" class="flag" />
          <text>{{ match.teamA }}</text>
        </view>
        <text class="vs">VS</text>
        <view class="team">
          <image :src="match.teamBFlag || '/static/logo.png'" mode="aspectFit" class="flag" />
          <text>{{ match.teamB }}</text>
        </view>
      </view>
      <text class="time">开赛时间: {{ formatTime(match.startTime) }}</text>
      <text class="status">{{ statusMap[match.status] || '未知' }}</text>
    </view>

    <!-- 玩法列表（按分类分组） -->
    <view class="play-section" v-for="cat in categoryPlays" :key="cat.name">
      <view class="section-title">{{ cat.name }}</view>
      <view class="play-grid">
        <view
          class="play-item"
          v-for="play in cat.plays"
          :key="play._id"
          @click="togglePlay(play)"
          :class="{ selected: selectedPlays.find(p => p._id === play._id) }"
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

    <!-- 底部下单栏 -->
    <view class="bottom-bar" v-if="match.status === 'upcoming' && selectedPlays.length > 0">
      <view class="selected-info">
        <text>已选 {{ selectedPlays.length }} 项</text>
        <text class="total-odds" v-if="selectedPlays.length > 0">
          总赔率: {{ totalOdds }}
        </text>
      </view>
      <button class="bet-btn" @click="showBetSheet = true">下注</button>
    </view>

    <!-- 下单弹窗 -->
    <bet-sheet
      :visible="showBetSheet"
      :matchInfo="match"
      :selectedPlays="selectedPlays"
      @confirm="handleBetConfirm"
      @cancel="showBetSheet = false"
      @addPlay="handleAddPlay"
      @update:selectedPlays="onUpdatePlays"
    />
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import BetSheet from '@/components/bet-sheet/bet-sheet.vue'

const match = ref({})
const selectedPlays = ref([])
const showBetSheet = ref(false)
const categoryPlays = ref([])
const loaded = ref(false)

const statusMap = { upcoming: '未开始', live: '进行中', finished: '已结束', settled: '已结算' }

const totalOdds = computed(() => {
  if (selectedPlays.value.length === 0) return '0.00'
  return selectedPlays.value.reduce((acc, p) => acc * p.odds, 1).toFixed(2)
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

const togglePlay = (play) => {
  const idx = selectedPlays.value.findIndex(p => p._id === play._id)
  if (idx >= 0) {
    selectedPlays.value.splice(idx, 1)
  } else {
    selectedPlays.value.push(play)
  }
}

const handleAddPlay = () => {
  // 串关模式：关闭弹窗让用户继续选择
  showBetSheet.value = false
  uni.showToast({ title: '请继续选择玩法', icon: 'none' })
}

const onUpdatePlays = (newList) => {
  selectedPlays.value = newList
}

const handleBetConfirm = async (betData) => {
  showBetSheet.value = false
  try {
    const res = await uniCloud.callFunction({
      name: 'user-order',
      data: {
        token: uni.getStorageSync('token'),
        matchId: match.value._id,
        playIds: betData.playIds,
        betAmount: betData.betAmount
      }
    })
    const result = res.result
    if (result && result.code === 0) {
      uni.showToast({
        title: '下单成功！可赢 ¥' + (betData.totalOdds * betData.betAmount).toFixed(2),
        icon: 'success', duration: 2000
      })
      selectedPlays.value = []
    } else {
      uni.showToast({ title: (result && result.message) || '下单失败', icon: 'error' })
    }
  } catch (e) {
    console.error('下单失败:', e)
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
.match-detail { min-height: 100vh; background: #f0f2f5; padding-bottom: 120rpx; }

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

.bottom-bar {
  position: fixed; bottom: 0; left: 0; right: 0; background: #fff;
  padding: 20rpx 30rpx; display: flex; align-items: center; justify-content: space-between;
  box-shadow: 0 -2rpx 12rpx rgba(0,0,0,0.08);
  .selected-info { .total-odds { display: block; color: #d32f2f; font-weight: bold; font-size: 28rpx; } }
  .bet-btn {
    background: linear-gradient(135deg, #d32f2f, #b71c1c); color: #fff;
    border: none; border-radius: 44rpx; padding: 16rpx 60rpx; font-size: 30rpx; font-weight: bold;
    &[disabled] { background: #ccc; }
  }
}

.empty { text-align: center; padding: 200rpx 0; color: #999; font-size: 28rpx; }
</style>
