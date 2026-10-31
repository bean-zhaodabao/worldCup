<template>
  <view class="match-list">
    <!-- 数据更新时间 -->
    <view class="sync-bar" v-if="syncTimeText">
      <text>数据更新时间: {{ syncTimeText }}</text>
    </view>

    <!-- 正在直播(斗球直播源) -->
    <view class="live-strip" v-if="liveGroups.length">
      <view class="live-strip-head">
        <view class="live-strip-title">
          <text class="live-dot on"></text>
          <text>正在直播</text>
        </view>
        <text class="live-strip-sub">足球 · {{ liveGroups.length }} 场</text>
      </view>
      <scroll-view scroll-x class="live-scroll" :show-scrollbar="false">
        <view
          class="live-card"
          v-for="g in liveGroups"
          :key="g.doveMatchId"
          @click="goLiveGroup(g)"
        >
          <view class="live-card-top">
            <text class="live-league">{{ g.leagueName || '足球' }}</text>
            <text class="live-hot" v-if="g.hot">{{ hotText(g.hot) }}人气</text>
          </view>
          <view class="live-teams">
            <text class="live-team">{{ g.hostTeamName }}</text>
            <text class="live-vs">VS</text>
            <text class="live-team">{{ g.guestTeamName }}</text>
          </view>
          <view class="live-card-bottom">
            <text class="live-room-count">{{ g.rooms.length }} 个直播间</text>
            <text class="live-watch-btn">观看直播 ›</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 进行中(滚球) + 按日期分组 -->
    <view
      class="date-group"
      v-for="group in dateGroups"
      :key="group.key"
      :class="{ 'live-group': group.key === 'live' }"
    >
      <view class="date-header">
        <text class="live-dot on" v-if="group.key === 'live'"></text>
        <text class="date-label">{{ group.label }}</text>
        <text class="date-num">{{ group.dateText }}</text>
        <text class="date-count">{{ group.matches.length }} 场</text>
      </view>

      <view
        class="match-card"
        v-for="match in group.matches"
        :key="match._id"
        :class="{ 'live-match-card': match.status === 'live' }"
        @click="goDetail(match)"
      >
        <view class="match-header">
          <text class="match-cc" v-if="match.ccId">{{ match.ccId }}</text>
          <text class="match-league">{{ match.leagueName || match.name }}</text>
          <text class="match-time">{{ matchTimeText(match) }}</text>
        </view>
        <view class="match-teams">
          <view class="team">
            <image class="flag" :src="match.teamAFlag || '/static/football.png'" mode="aspectFit"></image>
            <text class="team-name">{{ match.teamA }}</text>
          </view>
          <view class="vs-box">
            <text class="vs" v-if="match.status !== 'live'">VS</text>
            <text class="live-score" v-else>{{ scoreText(match) }}</text>
            <text class="live-minute" v-if="match.status === 'live'">{{ match.time || match.displayState || '进行中' }}</text>
          </view>
          <view class="team">
            <image class="flag" :src="match.teamBFlag || '/static/football.png'" mode="aspectFit"></image>
            <text class="team-name">{{ match.teamB }}</text>
          </view>
        </view>
        <!-- 该场次的直播入口 -->
        <view
          class="live-bar"
          v-if="liveMap[match._id]"
          @click.stop="goLiveMatch(match, liveMap[match._id])"
        >
          <view class="live-bar-left">
            <text class="live-dot" :class="{ on: liveMap[match._id].isLive }"></text>
            <text class="live-bar-text">{{ liveMap[match._id].isLive ? '直播中' : '有直播' }}</text>
            <text class="live-bar-sub">
              {{ liveMap[match._id].rooms.length > 1
                ? liveMap[match._id].rooms.length + ' 个直播间'
                : (liveMap[match._id].rooms[0] && liveMap[match._id].rooms[0].nickName) || '' }}
            </text>
          </view>
          <text class="live-bar-action">观看直播 ›</text>
        </view>
        <!-- 进行中赛事: 仅查看实时数据 -->
        <view class="live-bet-row" v-if="match.status === 'live'">
          <view class="live-bet-left">
            <text class="live-bet-tag">进行中</text>
            <text class="live-bet-markets">实时比分</text>
          </view>
          <text class="live-bet-action">查看实时数据 ›</text>
        </view>
        <!-- 胜平负赔率简览(仅未开赛) -->
        <view class="spf-row" v-if="match.status !== 'live' && spfOf(match).length">
          <view class="spf-item" v-for="p in spfOf(match)" :key="p._id">
            <text class="spf-name">{{ p.name }}</text>
            <text class="spf-odds">{{ fmtOdds(p.odds) }}</text>
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
      <text class="empty-sub" v-if="serverSyncTimeText">数据更新于 {{ serverSyncTimeText }}</text>
      <text class="empty-sub" v-if="syncStale">数据已较长时间未更新，可能是同步异常</text>
      <text class="empty-sub">如有疑问请联系管理员</text>
    </view>

    <!-- 串关购物车浮动按钮 -->
    <view class="floating-cart" v-if="cartCount > 0" @click="openCartSheet">
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
      :loading="cartSubmitting"
      :errorText="cartError"
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
import { fmtOdds } from '@/utils/format.js'

const matchList = ref([])
const matchVersions = ref({})
const loading = ref(false)
const loaded = ref(false)
const showCartSheet = ref(false)
const cartSubmitting = ref(false)
const cartError = ref('')

// 直播: matchId -> 该场次的斗球直播间信息；liveGroups = 当前正在直播的足球场次
const LIVE_REFRESH_MS = 2 * 60 * 1000
const liveMap = ref({})
const liveGroups = ref([])
let liveLoadedAt = 0
let liveRetryAt = 0
let liveTimer = null
let liveScoreTimer = null

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

/** 进行中赛事显示实时比分 */
const scoreText = (match) => {
  const h = match.homeScore === undefined || match.homeScore === null ? 0 : match.homeScore
  const g = match.guestScore === undefined || match.guestScore === null ? 0 : match.guestScore
  return h + ' : ' + g
}

/** 进行中显示比赛分钟, 未开赛显示开赛时间 */
const matchTimeText = (match) => {
  if (match.status === 'live') return match.time || match.displayState || '进行中'
  return timeText(match.startTime)
}

const hotText = (n) => {
  const v = Number(n) || 0
  if (v >= 10000) return (v / 10000).toFixed(1) + '万'
  return String(v)
}

/** 分组: 进行中置顶, 其余按今天/明天/周X */
const dateGroups = computed(() => {
  const groups = []
  const now = new Date()
  const todayStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000)
  const tomorrowStr = tomorrow.getFullYear() + '-' + pad(tomorrow.getMonth() + 1) + '-' + pad(tomorrow.getDate())

  const liveMatches = matchList.value.filter(m => m.status === 'live')
  if (liveMatches.length) {
    groups.push({ key: 'live', label: '进行中', dateText: '实时比分', matches: liveMatches })
  }

  for (const m of matchList.value) {
    if (m.status === 'live') continue
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
  // 进行中置顶, 今天其次, 其余按日期
  groups.sort((a, b) => {
    if (a.key === 'live') return -1
    if (b.key === 'live') return 1
    return (a.label === '今天' ? -1 : 0) - (b.label === '今天' ? -1 : 0) || a.key.localeCompare(b.key)
  })
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

/** 服务端同步时间(来自 sync-status, 列表为空时也能显示, 用于区分"没赛事"和"同步停摆") */
const serverSyncAt = ref(null)
const serverSyncTimeText = computed(() => serverSyncAt.value ? formatTime(new Date(serverSyncAt.value).getTime()) : '')
const syncStale = computed(() => {
  if (!serverSyncAt.value) return false
  return Date.now() - new Date(serverSyncAt.value).getTime() > 30 * 60 * 1000
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

/** 该场次有直播时跳转播放页 */
const goLiveMatch = (match, live) => {
  const room = live && live.rooms && live.rooms[0]
  let url = '/pages/match/live?matchId=' + encodeURIComponent(match._id)
  if (room) url += '&roomId=' + encodeURIComponent(room.roomId)
  uni.navigateTo({ url })
}

/** 顶部「正在直播」卡片跳转播放页 */
const goLiveGroup = (group) => {
  const room = group && group.rooms && group.rooms[0]
  if (!room) return
  const url = '/pages/match/live?roomId=' + encodeURIComponent(room.roomId) +
    '&home=' + encodeURIComponent(group.hostTeamName || '') +
    '&away=' + encodeURIComponent(group.guestTeamName || '') +
    '&league=' + encodeURIComponent(group.leagueName || '')
  uni.navigateTo({ url })
}

/** 直播接口失败不影响赛事列表，返回 null 由调用方忽略 */
const callLive = async (data) => {
  try {
    const res = await uniCloud.callFunction({ name: 'user-live', data })
    if (res.result && res.result.code === 0) return res.result.data || {}
    return null
  } catch (e) {
    console.warn('直播接口调用失败:', e)
    return null
  }
}

/** 加载直播信息(最多每 2 分钟刷新一次，避免赔率轮询重复请求) */
const loadLives = async () => {
  const token = uni.getStorageSync('token')
  if (!token) return
  // 失败后 60 秒内不重复请求，避免斗球挂掉时被赔率轮询带着刷接口
  if (Date.now() < liveRetryAt) return
  // 留 10 秒余量，避免定时器刚好提前触发时被这里挡掉
  if (Date.now() - liveLoadedAt < LIVE_REFRESH_MS - 10000) return
  liveLoadedAt = Date.now()

  try {
    const ids = matchList.value.map(m => m._id)
    const [listData, liveData] = await Promise.all([
      ids.length ? callLive({ token, action: 'list', matchIds: ids }) : Promise.resolve(null),
      callLive({ token, action: 'live' })
    ])

    if (listData) {
      const map = {}
      for (const item of listData.lives || []) {
        item.rooms = item.rooms || []
        map[item.matchId] = item
      }
      liveMap.value = map
    }
    if (liveData) {
      liveGroups.value = liveData.groups || []
    }
    if (!listData && !liveData) {
      liveRetryAt = Date.now() + 60 * 1000
    } else {
      liveRetryAt = 0
    }
  } catch (e) {
    console.warn('加载直播信息失败:', e)
    liveRetryAt = Date.now() + 60 * 1000
  }
}

/** 有进行中赛事时每分钟刷新比分/比赛分钟(赔率轮询只在版本变化时触发) */
const ensureLiveScoreTimer = () => {
  const hasLive = matchList.value.some(m => m.status === 'live')
  if (hasLive && !liveScoreTimer) {
    liveScoreTimer = setInterval(() => {
      if (!loading.value) loadMatches()
    }, 60 * 1000)
  } else if (!hasLive && liveScoreTimer) {
    clearInterval(liveScoreTimer)
    liveScoreTimer = null
  }
}

const onCartRemovePlay = ({ playId }) => {
  betCart.remove(playId)
}

const openCartSheet = () => {
  cartError.value = ''
  showCartSheet.value = true
}

const handleCartConfirm = async (betData) => {
  if (cartSubmitting.value) return
  cartSubmitting.value = true
  cartError.value = ''
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
      showCartSheet.value = false
      // 以服务端实时赔率为准展示
      uni.showToast({
        title: '串关下单成功！可赢 ¥' + result.data.winAmount.toFixed(2),
        icon: 'none', duration: 2500
      })
      betCart.clear()
    } else {
      const msg = (result && result.message) || '下单失败，请重试'
      cartError.value = msg
      uni.showToast({ title: msg, icon: 'none', duration: 3000 })
    }
  } catch (e) {
    console.error('串关下单失败:', e)
    const msg = '网络错误，请重试'
    cartError.value = msg
    uni.showToast({ title: msg, icon: 'none', duration: 3000 })
  } finally {
    cartSubmitting.value = false
  }
}

const loadMatches = async () => {
  const token = uni.getStorageSync('token')
  if (!token) { uni.reLaunch({ url: '/pages/login/login' }); return }
  try {
    const info = JSON.parse(uni.getStorageSync('userInfo') || '{}')
    if (info.role === 'agent') { uni.reLaunch({ url: '/pages-agent/workbench/index' }); return }
  } catch (e) {}

  loading.value = true
  try {
    const res = await uniCloud.callFunction({
      name: 'user-match',
      data: { token }
    })
    if (res.result && res.result.code === 0) {
      matchList.value = res.result.data.matches || []
      serverSyncAt.value = res.result.data.lastSyncAt || null
      loaded.value = true
      const versions = {}
      for (const m of matchList.value) {
        versions[m._id] = m.oddsVersion || 0
      }
      matchVersions.value = versions
    }
  } catch (e) { console.error(e) }
  loading.value = false
  // 直播信息异步加载，失败不影响赛事/赔率展示
  loadLives()
  ensureLiveScoreTimer()
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
  // 赔率没变化时 loadMatches 不会触发，这里每 2 分钟主动刷新一次直播信息
  if (!liveTimer) {
    liveTimer = setInterval(() => { loadLives() }, LIVE_REFRESH_MS)
  }
})

onHide(() => {
  stopPolling()
  if (liveTimer) {
    clearInterval(liveTimer)
    liveTimer = null
  }
  if (liveScoreTimer) {
    clearInterval(liveScoreTimer)
    liveScoreTimer = null
  }
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

// ============ 直播 ============
.live-dot {
  display: inline-block;
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #bbb;
  flex-shrink: 0;
  &.on {
    background: #ff3b30;
    box-shadow: 0 0 0 4rpx rgba(255, 59, 48, 0.15);
    animation: livePulse 1.6s infinite;
  }
}

@keyframes livePulse {
  0% { opacity: 1; }
  50% { opacity: 0.35; }
  100% { opacity: 1; }
}

.live-strip {
  background: #fff;
  margin-top: 16rpx;
  padding: 22rpx 0 24rpx;
}

.live-strip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24rpx 16rpx;
  .live-strip-title {
    display: flex;
    align-items: center;
    gap: 10rpx;
    font-size: 30rpx;
    font-weight: bold;
    color: #1a1a1a;
  }
  .live-strip-sub { font-size: 22rpx; color: #999; }
}

.live-scroll { white-space: nowrap; }

.live-card {
  display: inline-block;
  width: 420rpx;
  margin-left: 20rpx;
  padding: 20rpx 22rpx;
  border-radius: 16rpx;
  background: linear-gradient(135deg, #fff5f5, #fff);
  border: 1rpx solid #ffe0e0;
  vertical-align: top;
  &:first-child { margin-left: 24rpx; }

  .live-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14rpx;
    .live-league { font-size: 22rpx; color: #ff3b30; font-weight: bold; }
    .live-hot { font-size: 20rpx; color: #bbb; }
  }
  .live-teams {
    display: flex;
    align-items: center;
    gap: 10rpx;
    margin-bottom: 16rpx;
    .live-team {
      font-size: 26rpx; font-weight: bold; color: #222;
      max-width: 160rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .live-vs { font-size: 20rpx; color: #bbb; }
  }
  .live-card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    .live-room-count { font-size: 20rpx; color: #999; }
    .live-watch-btn {
      font-size: 22rpx; color: #fff;
      background: linear-gradient(135deg, #ff3b30, #d32f2f);
      padding: 6rpx 18rpx; border-radius: 20rpx;
    }
  }
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

  &.live-group {
    .date-label { color: #ff3b30; }
    .date-num { color: #ff8a80; }
  }
}

.match-card {
  background: #fff;
  margin: 0 20rpx 16rpx;
  border-radius: 16rpx;
  padding: 24rpx 30rpx;
  box-shadow: 0 2rpx 12rpx rgba(0,0,0,0.04);
  position: relative;

  &.live-match-card {
    border: 1rpx solid #ffe0e0;
    background: linear-gradient(180deg, #fff8f8 0%, #fff 28%);
  }

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
    .vs-box { padding: 0 20rpx; display: flex; flex-direction: column; align-items: center; }
    .vs { font-size: 32rpx; font-weight: bold; color: #d32f2f; }
    .live-score { font-size: 36rpx; font-weight: bold; color: #ff3b30; white-space: nowrap; }
    .live-minute { font-size: 20rpx; color: #ff3b30; margin-top: 4rpx; white-space: nowrap; }
  }

  .live-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #fff5f5;
    border: 1rpx solid #ffe0e0;
    border-radius: 12rpx;
    padding: 14rpx 20rpx;
    margin-bottom: 16rpx;

    .live-bar-left {
      display: flex;
      align-items: center;
      gap: 10rpx;
      min-width: 0;
    }
    .live-bar-text { font-size: 24rpx; color: #d32f2f; font-weight: bold; white-space: nowrap; }
    .live-bar-sub {
      font-size: 20rpx; color: #999;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .live-bar-action { font-size: 22rpx; color: #d32f2f; font-weight: bold; white-space: nowrap; }
  }

  .live-bet-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #fff5f5;
    border: 1rpx solid #ffe0e0;
    border-radius: 12rpx;
    padding: 14rpx 20rpx;
    margin-bottom: 16rpx;

    .live-bet-left { display: flex; align-items: center; gap: 10rpx; min-width: 0; }
    .live-bet-tag {
      font-size: 20rpx; color: #fff; background: #ff3b30;
      padding: 2rpx 10rpx; border-radius: 8rpx; font-weight: bold; flex-shrink: 0;
    }
    .live-bet-markets {
      font-size: 24rpx; color: #d32f2f; font-weight: bold;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .live-bet-action { font-size: 22rpx; color: #d32f2f; font-weight: bold; white-space: nowrap; }
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
