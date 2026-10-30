<template>
  <view class="live-page">
    <!-- 播放器 -->
    <view class="player-wrap">
      <!-- #ifdef H5 -->
      <view id="h5LivePlayer" class="h5-player"></view>
      <!-- #endif -->

      <!-- #ifndef H5 -->
      <video
        v-if="playUrl"
        :key="playUrl"
        id="livePlayer"
        class="player"
        :src="playUrl"
        mode="live-video"
        autoplay
        controls
        :show-play-btn="true"
        :show-center-play-btn="true"
        :enable-progress-gesture="false"
        object-fit="contain"
        @error="handleVideoError"
        @ended="handleVideoEnded"
      ></video>
      <!-- #endif -->

      <view class="player-mask" v-if="loading">
        <view class="spinner"></view>
        <text class="mask-text">正在获取直播信号…</text>
      </view>
      <view class="player-mask" v-else-if="errorText">
        <text class="mask-text">{{ errorText }}</text>
        <button class="mask-btn" @click="refreshPlay">重新获取</button>
      </view>
      <view class="player-mask idle" v-else-if="!playUrl">
        <text class="mask-icon">📺</text>
        <text class="mask-text">{{ tipText || '直播信号暂不可用' }}</text>
        <button class="mask-btn" @click="refreshPlay">刷新信号</button>
      </view>
    </view>

    <!-- 赛事信息 -->
    <view class="info">
      <view class="info-top">
        <text class="league">{{ leagueText }}</text>
        <text class="live-status" :class="{ on: isLive }">{{ isLive ? '● 直播中' : '直播' }}</text>
      </view>
      <view class="teams">
        <text class="team">{{ hostText }}</text>
        <text class="vs">VS</text>
        <text class="team">{{ guestText }}</text>
      </view>
      <text class="start-time" v-if="startTimeText">开赛时间：{{ startTimeText }}</text>
    </view>

    <!-- 清晰度 -->
    <view class="quality-row" v-if="qualityOptions.length || playUrl">
      <text class="quality-label">清晰度</text>
      <view
        class="quality-item"
        v-for="q in qualityOptions"
        :key="q.key"
        :class="{ active: quality === q.key }"
        @click="switchQuality(q.key)"
      >{{ q.label }}</view>
      <text class="refresh-link" @click="refreshPlay">刷新信号</text>
    </view>

    <!-- 直播间线路 -->
    <view class="room-section" v-if="rooms.length > 1">
      <view class="section-title">
        <text>直播间线路</text>
        <text class="section-sub">{{ rooms.length }} 个可用</text>
      </view>
      <scroll-view scroll-x class="room-scroll" :show-scrollbar="false">
        <view
          class="room-item"
          v-for="r in rooms"
          :key="r.roomId"
          :class="{ active: r.roomId === playingRoomId }"
          @click="switchRoom(r)"
        >
          <text class="room-name">{{ r.nickName || ('线路 ' + r.roomId) }}</text>
          <text class="room-hot" v-if="r.hot">{{ hotText(r.hot) }}人气</text>
          <text class="room-live" v-if="Number(r.status) === 1">直播中</text>
        </view>
      </scroll-view>
    </view>

    <!-- 提示 -->
    <view class="tips">
      <text>· 直播流由第三方提供，链接会定时失效；无法播放时请点击「刷新信号」</text>
      <text>· 若当前线路卡顿，可切换其他直播间或清晰度</text>
      <text>· 建议在 WiFi 环境下观看</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { onLoad, onUnload, onHide } from '@dcloudio/uni-app'

const QUALITY_META = [
  { key: 'ori', label: '原画' },
  { key: 'ud', label: '超清' },
  { key: 'hd', label: '高清' },
  { key: 'sd', label: '标清' },
  { key: 'ld', label: '流畅' }
]

const matchId = ref('')
const roomId = ref('')
const match = ref(null)
const matchInfo = ref(null)
const fallbackHost = ref('')
const fallbackGuest = ref('')
const fallbackLeague = ref('')

const rooms = ref([])
const playingRoomId = ref('')
const playUrls = ref({})
const qualityOptions = ref([])
const quality = ref('')
const playUrl = ref('')

const loading = ref(false)
const errorText = ref('')
const tipText = ref('')

// 视频播放出错时只自动重试一次，避免死循环
let autoRetryUsed = false
let retryScheduled = false

const optionValue = (options, key) => {
  if (!options || options[key] === undefined || options[key] === null) return ''
  return String(options[key])
}

const safeDecode = (v) => {
  try { return decodeURIComponent(v) } catch (e) { return v }
}

const pad = (n) => String(n).padStart(2, '0')

const formatTime = (t) => {
  const d = new Date(t)
  if (isNaN(d.getTime())) return ''
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

const hotText = (n) => {
  const v = Number(n) || 0
  if (v >= 10000) return (v / 10000).toFixed(1) + '万'
  return String(v)
}

const hostText = computed(() => {
  if (match.value && match.value.teamA) return match.value.teamA
  if (matchInfo.value && matchInfo.value.hostTeamName) return matchInfo.value.hostTeamName
  return fallbackHost.value || '主队'
})

const guestText = computed(() => {
  if (match.value && match.value.teamB) return match.value.teamB
  if (matchInfo.value && matchInfo.value.guestTeamName) return matchInfo.value.guestTeamName
  return fallbackGuest.value || '客队'
})

const leagueText = computed(() => {
  if (match.value) return match.value.leagueName || match.value.name || '赛事直播'
  if (matchInfo.value && matchInfo.value.leagueName) return matchInfo.value.leagueName
  return fallbackLeague.value || '赛事直播'
})

const startTimeText = computed(() => {
  let t = match.value && match.value.startTime
  if (!t && matchInfo.value) t = matchInfo.value.startTime || matchInfo.value.matchTime
  if (!t) return ''
  return formatTime(t)
})

const isLive = computed(() => {
  const r = rooms.value.find(x => x.roomId === playingRoomId.value)
  if (!r) return true
  return Number(r.status) === 1
})

const buildQualityOptions = (urls) => QUALITY_META.filter(q => !!urls[q.key])

/** 没有赛事信息时，从斗球标题 "联赛 主队 - 客队" 兜底解析 */
const fillFromTitle = (title) => {
  const t = String(title || '').replace(/\s+/g, ' ').trim()
  if (!t) return
  let cut = t.lastIndexOf(' - ')
  if (cut < 0) cut = t.lastIndexOf('-')
  if (cut <= 0) return
  const left = t.slice(0, cut).trim()
  const guest = t.slice(cut + 1).trim()
  const sp = left.indexOf(' ')
  if (sp > 0) {
    fallbackLeague.value = fallbackLeague.value || left.slice(0, sp)
    fallbackHost.value = fallbackHost.value || left.slice(sp + 1)
  } else {
    fallbackHost.value = fallbackHost.value || left
  }
  fallbackGuest.value = fallbackGuest.value || guest
}

const loadMatchInfo = async () => {
  if (!matchId.value) return
  try {
    const res = await uniCloud.callFunction({
      name: 'user-match',
      data: { token: uni.getStorageSync('token'), matchId: matchId.value }
    })
    if (res.result && res.result.code === 0) {
      const list = res.result.data.matches || []
      match.value = list.find(m => m._id === matchId.value) || null
    }
  } catch (e) {
    console.warn('加载赛事信息失败:', e)
  }
}

/**
 * 实时获取播放链
 * @param {string} rid 指定直播间；为空时由服务端挑选最佳房间
 * @param {boolean} isAutoRetry 是否为播放出错后的自动重试
 */
const loadPlay = async (rid, isAutoRetry) => {
  if (loading.value) return
  if (!isAutoRetry) {
    autoRetryUsed = false
    retryScheduled = false
  }
  loading.value = true
  errorText.value = ''
  tipText.value = ''
  // 置空可强制 H5/App 播放器重新挂载，避免相同 src 不刷新
  playUrl.value = ''

  try {
    const res = await uniCloud.callFunction({
      name: 'user-live',
      data: {
        token: uni.getStorageSync('token'),
        action: 'play',
        matchId: matchId.value,
        roomId: rid || ''
      }
    })
    const result = res.result || {}
    if (result.code !== 0) throw new Error(result.message || '获取直播失败')

    const data = result.data || {}
    if (data.matchInfo) matchInfo.value = data.matchInfo
    if (data.title) fillFromTitle(data.title)
    rooms.value = data.rooms || []
    playingRoomId.value = data.roomId || ''

    const urls = data.playAddr || {}
    playUrls.value = urls
    qualityOptions.value = buildQualityOptions(urls)

    let q = quality.value
    if (!urls[q]) {
      q = (data.defaultQuality && urls[data.defaultQuality])
        ? data.defaultQuality
        : (qualityOptions.value[0] ? qualityOptions.value[0].key : '')
    }
    quality.value = q
    playUrl.value = q ? urls[q] : ''

    if (!playUrl.value) {
      tipText.value = data.message || '直播信号暂未开始或已结束，请稍后刷新'
    }
  } catch (e) {
    console.error('获取直播失败:', e)
    playUrl.value = ''
    errorText.value = e.message || '网络异常，请稍后重试'
  } finally {
    loading.value = false
  }
}

const refreshPlay = () => {
  loadPlay(playingRoomId.value || roomId.value, false)
}

const switchQuality = (key) => {
  if (loading.value || !playUrls.value[key] || quality.value === key) return
  quality.value = key
  playUrl.value = playUrls.value[key]
  autoRetryUsed = false
  retryScheduled = false
}

const switchRoom = (r) => {
  if (!r || !r.roomId) return
  if (r.roomId === playingRoomId.value && playUrl.value) return
  loadPlay(r.roomId, false)
}

const handleVideoError = () => {
  // 正在切换线路/清晰度时，旧播放器的报错直接忽略
  if (loading.value) return
  // 一次播放可能在 HLS 与 video 元素上连续报错，重试排队期间忽略后续报错
  if (retryScheduled) return
  if (autoRetryUsed) {
    // 彻底停掉旧播放器，避免错误遮罩下面还在出声
    playUrl.value = ''
    errorText.value = '播放失败，请点击重新获取'
    return
  }
  autoRetryUsed = true
  retryScheduled = true
  uni.showToast({ title: '直播信号中断，正在重新获取', icon: 'none' })
  setTimeout(() => {
    if (!retryScheduled) return
    retryScheduled = false
    loadPlay(playingRoomId.value || roomId.value, true)
  }, 1000)
}

const handleVideoEnded = () => {
  if (loading.value || autoRetryUsed || retryScheduled) return
  autoRetryUsed = true
  retryScheduled = true
  setTimeout(() => {
    if (!retryScheduled) return
    retryScheduled = false
    loadPlay(playingRoomId.value || roomId.value, true)
  }, 1000)
}

// ==================== H5 播放（hls.js） ====================
// #ifdef H5
let hlsInstance = null
let hlsLoader = null
let hlsRetried = false

function destroyH5Player() {
  if (hlsInstance) {
    try { hlsInstance.destroy() } catch (e) { /* ignore */ }
    hlsInstance = null
  }
  const box = document.getElementById('h5LivePlayer')
  if (box) box.innerHTML = ''
}

function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls)
  if (hlsLoader) return hlsLoader

  const sources = []
  try {
    // 优先使用打包进 static 的本地文件，避免 CDN 被墙/不稳定
    sources.push(new URL('static/js/hls.light.min.js', document.baseURI).href)
  } catch (e) { /* ignore */ }
  sources.push('https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.light.min.js')
  sources.push('https://cdn.bootcdn.net/ajax/libs/hls.js/1.5.20/hls.light.min.js')

  hlsLoader = new Promise((resolve, reject) => {
    let i = 0
    const next = () => {
      if (i >= sources.length) {
        hlsLoader = null
        return reject(new Error('HLS 播放器加载失败'))
      }
      const src = sources[i++]
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.onload = () => {
        if (window.Hls) resolve(window.Hls)
        else next()
      }
      script.onerror = () => {
        try { script.parentNode.removeChild(script) } catch (e) { /* ignore */ }
        next()
      }
      document.head.appendChild(script)
    }
    next()
  })
  return hlsLoader
}

function mountH5Player(url) {
  if (!url) {
    destroyH5Player()
    return
  }
  destroyH5Player()
  hlsRetried = false

  const box = document.getElementById('h5LivePlayer')
  if (!box) return

  const video = document.createElement('video')
  video.controls = true
  video.autoplay = true
  video.playsInline = true
  video.preload = 'auto'
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')
  // 微信/QQ 内置 X5 内核：尽量内联播放，不自动全屏
  video.setAttribute('x5-video-player-type', 'h5')
  video.setAttribute('x5-video-player-fullscreen', 'false')
  video.style.display = 'block'
  video.style.width = '100%'
  video.style.height = '100%'
  video.style.background = '#000'
  video.style.objectFit = 'contain'
  video.addEventListener('error', () => handleVideoError())
  box.appendChild(video)

  // iOS Safari / 部分内置浏览器原生支持 HLS
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url
    video.play().catch(() => {})
    return
  }

  loadHls().then((Hls) => {
    // 加载 hls.js 期间用户可能已切换线路/离开页面
    if (!document.body.contains(video)) return
    if (!Hls || !Hls.isSupported()) {
      video.src = url
      video.play().catch(() => {})
      return
    }
    hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 })
    hlsInstance.loadSource(url)
    hlsInstance.attachMedia(video)
    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (!data || !data.fatal) return
      console.warn('[live] HLS fatal:', data.type, data.details)
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !hlsRetried) {
        hlsRetried = true
        handleVideoError()
      } else {
        handleVideoError()
      }
    })
    video.play().catch(() => {})
  }).catch((e) => {
    console.warn('[live] hls.js 加载失败，尝试直连:', e)
    if (!document.body.contains(video)) return
    video.src = url
    video.play().catch(() => {})
  })
}

watch(playUrl, (url) => {
  if (url) nextTick(() => mountH5Player(url))
  else destroyH5Player()
})

/** 切到后台/其它标签页时暂停，避免继续出声 */
function handleVisibilityChange() {
  if (!document.hidden) return
  const box = document.getElementById('h5LivePlayer')
  const video = box ? box.querySelector('video') : null
  if (video) {
    try { video.pause() } catch (e) { /* ignore */ }
  }
}

function unmountH5Player() {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  destroyH5Player()
}

document.addEventListener('visibilitychange', handleVisibilityChange)

onMounted(() => {
  if (playUrl.value) nextTick(() => mountH5Player(playUrl.value))
})

onBeforeUnmount(unmountH5Player)
// #endif

// ==================== 生命周期 ====================
onLoad((options) => {
  matchId.value = optionValue(options, 'matchId')
  roomId.value = optionValue(options, 'roomId')
  fallbackHost.value = safeDecode(optionValue(options, 'home'))
  fallbackGuest.value = safeDecode(optionValue(options, 'away'))
  fallbackLeague.value = safeDecode(optionValue(options, 'league'))

  if (!matchId.value && !roomId.value) {
    errorText.value = '缺少直播参数'
    return
  }
  if (matchId.value) loadMatchInfo()
  loadPlay(roomId.value, false)
})

onHide(() => {
  // #ifndef H5
  try { uni.createVideoContext('livePlayer').pause() } catch (e) { /* ignore */ }
  // #endif
})

onUnload(() => {
  // #ifdef H5
  unmountH5Player()
  // #endif
  // #ifndef H5
  try { uni.createVideoContext('livePlayer').stop() } catch (e) { /* ignore */ }
  // #endif
})
</script>

<style lang="scss" scoped>
.live-page {
  min-height: 100vh;
  background: #f0f2f5;
}

// ============ 播放器 ============
.player-wrap {
  position: relative;
  width: 100%;
  height: 56.25vw;
  max-height: 70vh;
  min-height: 360rpx;
  background: #000;
  overflow: hidden;

  .h5-player,
  .player {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }
}

.player-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20rpx;
  z-index: 10;
  padding: 0 60rpx;

  .mask-icon { font-size: 64rpx; }
  .mask-text {
    font-size: 26rpx;
    color: #fff;
    text-align: center;
    line-height: 1.6;
  }
  .mask-btn {
    margin-top: 10rpx;
    background: linear-gradient(135deg, #d32f2f, #b71c1c);
    color: #fff;
    font-size: 26rpx;
    border-radius: 40rpx;
    padding: 0 48rpx;
    line-height: 68rpx;
    border: none;
  }
  &.idle { background: rgba(0, 0, 0, 0.82); }
}

.spinner {
  width: 52rpx;
  height: 52rpx;
  border: 5rpx solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  border-radius: 50%;
  animation: live-spin 0.9s linear infinite;
}

@keyframes live-spin {
  to { transform: rotate(360deg); }
}

// ============ 赛事信息 ============
.info {
  background: linear-gradient(135deg, #1a237e, #0d47a1);
  color: #fff;
  padding: 28rpx 40rpx 32rpx;
  text-align: center;

  .info-top {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16rpx;
    margin-bottom: 20rpx;
    .league { font-size: 26rpx; opacity: 0.9; }
    .live-status {
      font-size: 22rpx;
      padding: 4rpx 16rpx;
      border-radius: 20rpx;
      background: rgba(255, 255, 255, 0.16);
      &.on { background: #ff3b30; color: #fff; }
    }
  }

  .teams {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 26rpx;
    .team {
      font-size: 34rpx;
      font-weight: bold;
      max-width: 260rpx;
      text-align: center;
    }
    .vs { font-size: 26rpx; opacity: 0.65; }
  }

  .start-time {
    display: block;
    margin-top: 16rpx;
    font-size: 22rpx;
    opacity: 0.72;
  }
}

// ============ 清晰度 ============
.quality-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
  flex-wrap: wrap;
  background: #fff;
  margin-top: 20rpx;
  padding: 20rpx 30rpx;

  .quality-label {
    font-size: 24rpx;
    color: #999;
    margin-right: 6rpx;
  }
  .quality-item {
    font-size: 24rpx;
    color: #666;
    background: #f5f5f5;
    border-radius: 24rpx;
    padding: 10rpx 26rpx;
    border: 2rpx solid transparent;
    &.active {
      color: #1a237e;
      font-weight: bold;
      background: #e8eaf6;
      border-color: #1a237e;
    }
  }
  .refresh-link {
    margin-left: auto;
    font-size: 22rpx;
    color: #1a237e;
    padding: 6rpx 0 6rpx 16rpx;
  }
}

// ============ 直播间线路 ============
.room-section {
  background: #fff;
  margin-top: 20rpx;
  padding: 24rpx 30rpx 30rpx;

  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 28rpx;
    font-weight: bold;
    color: #1a1a1a;
    margin-bottom: 18rpx;
    .section-sub { font-size: 22rpx; color: #999; font-weight: normal; }
  }

  .room-scroll {
    white-space: nowrap;
  }
  .room-item {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 6rpx;
    min-width: 200rpx;
    margin-right: 16rpx;
    padding: 16rpx 22rpx;
    border-radius: 14rpx;
    background: #f7f7f7;
    border: 2rpx solid transparent;

    .room-name { font-size: 26rpx; color: #333; font-weight: bold; }
    .room-hot { font-size: 20rpx; color: #999; }
    .room-live { font-size: 18rpx; color: #ff3b30; }

    &.active {
      background: #e8eaf6;
      border-color: #1a237e;
      .room-name { color: #1a237e; }
    }
  }
}

// ============ 提示 ============
.tips {
  padding: 26rpx 36rpx 60rpx;
  text {
    display: block;
    font-size: 22rpx;
    color: #999;
    line-height: 1.8;
  }
}
</style>
