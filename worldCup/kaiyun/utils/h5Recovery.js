/**
 * H5 页面分包加载失败自愈（仅 H5 生效）
 *
 * 现象: 访问某些页面(如 我的 / 赛事详情)时出现
 *       "连接服务器超时，点击屏幕重试"
 * 原因: uni-app H5 的页面是按需加载的分包(JS/CSS)。这个错误页来自
 *       uni-app 的 AsyncError 组件(uni.async.error), 即分包请求失败或超时:
 *       1. 发版后 iOS Safari 仍缓存着旧版 index.html / 入口 JS,
 *          旧入口去旧的文件名请求分包, 服务器上已被新版本替换 -> 404/超时;
 *       2. 网络抖动导致分包加载超时(内置超时 60s);
 *       3. 部署时 assets 目录未完整覆盖(分包文件缺失)。
 *       内置错误页点击时只执行 location.reload(), 若 index.html 仍是旧缓存,
 *       会一直重复失败。
 *
 * 处理: 分包加载失败时带时间戳参数强制重新拉取 index.html(绕过旧 HTML 缓存),
 *       从而拿到最新的入口与分包; 同时拦截内置错误页的点击改成同样的刷新方式。
 *       带 10s 节流(URL 参数 + sessionStorage 双保险), 避免服务器真的缺文件时死循环刷新。
 */

const RELOAD_FLAG = '_v'
const MIN_INTERVAL = 10 * 1000
const STORAGE_KEY = '__h5_chunk_reload_at__'

function readLastReloadAt() {
  let fromStorage = 0
  let fromUrl = 0
  try {
    fromStorage = Number(window.sessionStorage.getItem(STORAGE_KEY) || 0) || 0
  } catch (e) { /* 隐私模式可能禁用 sessionStorage */ }
  try {
    fromUrl = Number(new URL(window.location.href).searchParams.get(RELOAD_FLAG) || 0) || 0
  } catch (e) { /* 老浏览器不支持 URL, 忽略 */ }
  return Math.max(fromStorage, fromUrl)
}

/** 带缓存穿透参数刷新页面; 返回是否真的发起了刷新 */
function reloadWithFreshHtml() {
  const now = Date.now()
  const last = readLastReloadAt()
  if (last > 0 && now - last < MIN_INTERVAL) return false

  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(now))
  } catch (e) { /* ignore */ }

  // 自动刷新期间隐藏内置错误页, 避免"连接服务器超时"文案一闪而过
  try {
    document.documentElement.classList.add('h5-reloading')
  } catch (e) { /* ignore */ }

  let target = ''
  try {
    const url = new URL(window.location.href)
    url.searchParams.set(RELOAD_FLAG, String(now))
    target = url.toString()
  } catch (e) {
    const href = window.location.href
    target = href + (href.indexOf('?') >= 0 ? '&' : '?') + RELOAD_FLAG + '=' + now
  }

  window.location.replace(target)
  return true
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // 1) Vite 预加载/动态 import 失败(分包 JS、CSS 加载失败都会触发)
  window.addEventListener('vite:preloadError', (event) => {
    const payload = event && event.payload
    console.error('[H5] 页面资源加载失败，尝试拉取最新版本:', (payload && (payload.message || payload)) || payload)
    reloadWithFreshHtml()
  })

  // 2) uni-app 内置 "连接服务器超时，点击屏幕重试" 错误页
  //    默认点击只做 location.reload(); 这里在捕获阶段接管, 绕过旧的 index.html 缓存
  document.addEventListener('click', (event) => {
    const target = event.target
    const errorEl = target && target.closest ? target.closest('.uni-async-error') : null
    if (!errorEl) return
    if (reloadWithFreshHtml()) {
      event.preventDefault()
      event.stopPropagation()
    }
  }, true)
}
