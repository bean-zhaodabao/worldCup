/**
 * 全局登录过期处理
 *
 * 云函数在 token 失效时返回业务层 { code: 401 }（HTTP 仍然是 200），
 * 各页面只判断 code === 0 时不会跳登录页，用户会停留在页面上看到空数据。
 * 这里统一包装一次 uniCloud.callFunction：
 *   - 任意云函数返回 401 → 清掉本地登录态 → 提示并跳转登录页
 *   - 并发请求同时 401 时只处理一次
 * 同时提供本地 token 过期判断，用于冷启动/回到前台时提前跳转。
 */

const LOGIN_PAGE = '/pages/login/login'
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 与云函数 verifyToken 的 24 小时一致
const CLOCK_GRACE_MS = 5 * 60 * 1000

let handling = false

function currentRoute() {
  try {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    const page = pages[pages.length - 1]
    return page ? '/' + page.route : ''
  } catch (e) {
    return ''
  }
}

function isLoginPage() {
  return currentRoute() === LOGIN_PAGE
}

/**
 * 清登录态并跳登录页（多次调用只会执行一次）
 * @param {string} [message] 提示文案
 */
export function forceLogout(message) {
  if (handling) return
  handling = true
  try {
    uni.removeStorageSync('token')
    uni.removeStorageSync('userInfo')
  } catch (e) { /* ignore */ }

  if (isLoginPage()) {
    handling = false
    return
  }

  uni.reLaunch({
    url: LOGIN_PAGE,
    success: () => {
      uni.showToast({
        title: message || '登录已过期，请重新登录',
        icon: 'none',
        duration: 2000
      })
    },
    complete: () => {
      // 跳转完成后再释放，避免同一批 401 重复弹提示
      setTimeout(() => { handling = false }, 500)
    }
  })
}

function handleResult(res) {
  const result = res && res.result
  if (result && result.code === 401) {
    forceLogout(result.message)
  }
  return res
}

/**
 * 包装 uniCloud.callFunction，统一处理业务层 401。
 * 在 App onLaunch 里调用一次即可；重复调用会被忽略。
 */
export function installCloudAuthGuard() {
  if (typeof uniCloud === 'undefined' || !uniCloud || typeof uniCloud.callFunction !== 'function') return
  if (uniCloud.__authGuardInstalled) return

  const original = uniCloud.callFunction
  const wrapped = function (options) {
    let promise
    try {
      promise = original.call(uniCloud, options)
    } catch (e) {
      return Promise.reject(e)
    }
    if (!promise || typeof promise.then !== 'function') return promise
    return promise.then(handleResult)
  }

  try {
    uniCloud.callFunction = wrapped
  } catch (e) { /* ignore */ }

  // 某些运行环境下方法定义在只读属性/原型上，再尝试 defineProperty 覆盖
  if (uniCloud.callFunction !== wrapped) {
    try {
      Object.defineProperty(uniCloud, 'callFunction', {
        value: wrapped,
        configurable: true,
        writable: true
      })
    } catch (e) { /* ignore */ }
  }

  if (uniCloud.callFunction === wrapped) {
    uniCloud.__authGuardInstalled = true
  } else {
    console.warn('[auth] uniCloud.callFunction 包装失败，登录过期需要页面自行处理')
  }
}

function decodeBase64(str) {
  try {
    const b64 = String(str).replace(/-/g, '+').replace(/_/g, '/')
    if (typeof atob === 'function') return atob(b64)
    if (typeof uni !== 'undefined' && typeof uni.base64ToArrayBuffer === 'function') {
      const bytes = new Uint8Array(uni.base64ToArrayBuffer(b64))
      let out = ''
      for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i])
      return out
    }
  } catch (e) { /* ignore */ }
  return ''
}

/**
 * 本地判断 token 是否明显过期（token = base64(userId:timestamp:sign)）。
 * 解不出来时返回 false，交给服务端 401 兜底，避免误判。
 */
export function isTokenExpired(token) {
  if (!token) return true
  const text = decodeBase64(token)
  if (!text) return false
  const parts = text.split(':')
  if (parts.length !== 3) return false
  const issuedAt = Number(parts[1])
  if (!issuedAt) return false
  return Date.now() - issuedAt > TOKEN_TTL_MS + CLOCK_GRACE_MS
}
