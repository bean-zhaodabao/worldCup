import App from './App'

// #ifdef H5
// 分包加载失败时自动拉取最新版本, 解决 iOS Safari 缓存旧入口导致的 "连接服务器超时，点击屏幕重试"
import './utils/h5Recovery.js'
// #endif

// #ifndef VUE3
import Vue from 'vue'
import './uni.promisify.adaptor'
Vue.config.productionTip = false
App.mpType = 'app'
const app = new Vue({
  ...App
})
app.$mount()
// #endif

// #ifdef VUE3
import { createSSRApp } from 'vue'
export function createApp() {
  const app = createSSRApp(App)
  return {
    app
  }
}
// #endif