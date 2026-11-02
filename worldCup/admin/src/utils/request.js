import axios from 'axios'

// 开发环境通过 Vite proxy 代理到 uniCloud（解决 CORS）
// 生产环境用云函数 URL 化自定义域名（HTTPS，避免 mixed content）
// 支付宝云默认的 url 化域名（*.cloudbasefunction.cn）存在共享限流池，管理端并发稍高
// 就会返回「函数调用系统限流 / System Request RateLimited」，且 OPTIONS 预检被限流时
// 浏览器会报成 CORS 错误。绑定自定义域名后即可解除。
// 自定义域名同时写在 .env.production 的 VITE_API_BASE，这里保留兜底默认值。
const PROD_BASE = import.meta.env.VITE_API_BASE || 'https://worldcup.fumaokitchen.com'
const BASE_URL = import.meta.env.DEV ? '/api' : PROD_BASE

// ============ 限流与重试 ============
// uniCloud 云函数是共享资源，浏览器短时间内并发太多会触发平台限流
// （典型表现：HTTP 500 + errCode 50001「函数调用系统限流」，
// 或者预检 OPTIONS 返回非 2xx，被浏览器报成 CORS 错误）。
// 这里统一做三件事：限制并发、合并重复 GET、失败后退避重试。
const MAX_CONCURRENT = 2
const MIN_START_INTERVAL = 300
const MAX_RETRIES = 5
const RETRY_DELAYS = [400, 1000, 2000, 4000, 6000]
const RETRYABLE_STATUS = [408, 425, 429, 500, 502, 503, 504]
const RATE_LIMIT_MESSAGE = '服务器繁忙（请求过于频繁），请稍后重试'

let activeCount = 0
const pendingQueue = []
let lastStartAt = 0
let startChain = Promise.resolve()

function acquire() {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++
    return Promise.resolve()
  }
  return new Promise(resolve => pendingQueue.push(resolve))
}

function release() {
  const next = pendingQueue.shift()
  if (next) {
    // 直接把并发名额交给下一个等待者，activeCount 保持不变
    next()
  } else {
    activeCount--
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// 控制请求启动间隔，避免 2 个并发名额被瞬间打满后又立刻发下一批
function waitForStartSlot() {
  const run = startChain.then(async () => {
    const wait = Math.max(0, MIN_START_INTERVAL - (Date.now() - lastStartAt))
    if (wait > 0) await sleep(wait)
    lastStartAt = Date.now()
  })
  startChain = run.catch(() => {})
  return run
}

function retryDelay(attempt) {
  const base = RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1]
  // 加一点随机抖动，避免多个页面同时重试再次撞上限流
  return base + Math.floor(Math.random() * 300)
}

function isRateLimitData(data) {
  if (!data || typeof data !== 'object') return false
  const text = [data.errCode, data.errMsg, data.errDetail, data.message]
    .filter(Boolean)
    .join(' ')
  return String(data.errCode) === '50001' || /RateLimited|限流|too many requests/i.test(text)
}

function redirectToLogin() {
  localStorage.removeItem('admin_token')
  window.location.hash = '#/login'
}

function isRetryable(error, config) {
  if (error.__noRetry) return false
  // 平台限流：函数根本没有执行，任何方法重试都不会产生副作用
  if (isRateLimitData(error.response?.data) || isRateLimitData(error.__responseData)) return true

  const method = String(config.method || 'get').toLowerCase()
  // 非幂等请求不重试，避免重复下单 / 重复审核 / 重复充值
  if (method !== 'get' && method !== 'head') return false

  // 没有 response：网络中断、CORS 预检失败（OPTIONS 被限流时浏览器只能报 CORS）
  if (!error.response) return true
  return RETRYABLE_STATUS.includes(error.response.status)
}

function normalizeError(error) {
  if (error.__appError) return error

  const data = error.response?.data
  if (isRateLimitData(data) || isRateLimitData(error.__responseData)) {
    error.message = RATE_LIMIT_MESSAGE
    error.isRateLimited = true
    return error
  }

  const status = error.response?.status
  if (status === 401) {
    redirectToLogin()
    error.message = '未登录或登录已过期'
  } else if (!error.response) {
    error.message = '网络异常或服务器繁忙，请稍后重试'
  } else if (status >= 500) {
    error.message = '服务器暂不可用（' + status + '），请稍后重试'
  }
  return error
}

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 15000
})

http.interceptors.request.use(
  config => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = 'Bearer ' + token
    }
    return config
  },
  error => Promise.reject(error)
)

function unwrap(response) {
  const data = response.data

  // 应用层 401 → 踢回登录
  if (data && data.code === 401) {
    redirectToLogin()
    const error = new Error(data.message || '未登录')
    error.__noRetry = true
    error.__appError = true
    throw error
  }

  // 业务层非 0 错误码 → 统一按异常处理，让调用方的 catch 块能正确显示错误信息
  if (data && data.code !== undefined && data.code !== 0) {
    const error = new Error(data.message || '操作失败')
    error.__appError = true
    error.__responseData = data
    if (isRateLimitData(data)) {
      error.__noRetry = false
      error.__appError = false
      error.message = RATE_LIMIT_MESSAGE
      error.isRateLimited = true
    } else {
      error.__noRetry = true
    }
    throw error
  }

  return data
}

async function execute(config) {
  let attempt = 0
  for (;;) {
    await acquire()
    try {
      await waitForStartSlot()
      const response = await http.request(config)
      return unwrap(response)
    } catch (error) {
      if (error.response?.status === 401) redirectToLogin()
      const isTimeout = error.code === 'ECONNABORTED'
      if (attempt < MAX_RETRIES && isRetryable(error, config) && (!isTimeout || attempt < 1)) {
        attempt++
        console.warn(
          '[api] 请求失败，' + attempt + '/' + MAX_RETRIES + ' 次重试：',
          String(config.method || 'get').toUpperCase(),
          config.url,
          error.message
        )
      } else {
        throw normalizeError(error)
      }
    } finally {
      release()
    }
    await sleep(retryDelay(attempt))
  }
}

// 合并完全相同的并发 GET，避免同一个页面/快速切换菜单时重复请求
const inflight = new Map()

function keyOf(config) {
  const params = config.params ? JSON.stringify(config.params) : ''
  return [config.method, config.url, params].join('|')
}

function dispatch(config) {
  const method = String(config.method || 'get').toLowerCase()
  if (method !== 'get' && method !== 'head') return execute(config)

  const key = keyOf(config)
  const running = inflight.get(key)
  if (running) return running

  const promise = execute(config)
  inflight.set(key, promise)
  promise
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key)
    })
    .catch(() => {})
  return promise
}

const request = {
  get(url, config = {}) {
    return dispatch({ ...config, url, method: 'get' })
  },
  post(url, data, config = {}) {
    return dispatch({ ...config, url, data, method: 'post' })
  },
  put(url, data, config = {}) {
    return dispatch({ ...config, url, data, method: 'put' })
  },
  patch(url, data, config = {}) {
    return dispatch({ ...config, url, data, method: 'patch' })
  },
  delete(url, config = {}) {
    return dispatch({ ...config, url, method: 'delete' })
  }
}

export default request
