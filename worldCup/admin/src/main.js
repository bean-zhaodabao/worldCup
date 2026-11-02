import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus, { ElMessage } from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)

// ============ 发版后资源加载失败兜底 ============
// 部署新版本后，浏览器可能还持有旧 index.html / 旧路由 chunk 名，
// 动态导入的 JS/CSS 一旦 404，路由组件不会渲染，页面会整页空白。
// 这里自动刷新一次（10 秒内不重复），仍失败则给出明确提示，避免用户一直看白屏。
const CHUNK_RELOAD_KEY = 'admin_chunk_reload_at'
const CHUNK_ERROR_RE = /Failed to fetch dynamically imported module|Unable to preload CSS|Importing a module script failed|error loading dynamically imported module/i

function isChunkLoadError(error) {
  const msg = String((error && error.message) || error || '')
  return CHUNK_ERROR_RE.test(msg)
}

function lastReloadAt() {
  try { return Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0) } catch (e) { return 0 }
}

function markReload() {
  try { sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now())) } catch (e) { /* ignore */ }
}

function handleChunkLoadError(error) {
  if (!isChunkLoadError(error)) return false
  if (Date.now() - lastReloadAt() > 10000) {
    markReload()
    window.location.reload()
    return true
  }
  ElMessage.error('页面资源加载失败，请刷新页面重试')
  return true
}

router.onError(handleChunkLoadError)
window.addEventListener('vite:preloadError', (event) => {
  if (handleChunkLoadError(event.payload)) event.preventDefault()
})

// 注册所有 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { size: 'default' })
app.mount('#app')
