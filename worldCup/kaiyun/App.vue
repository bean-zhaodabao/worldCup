<script>
export default {
  onLaunch: function () {
    console.log('世界杯彩票 H5 启动')
    // 检查登录状态
    const token = uni.getStorageSync('token')
    if (!token) {
      // 未登录跳转登录页
      // uni.reLaunch({ url: '/pages/login/login' })
    }
  },
  onShow: function () {
    console.log('App Show')
  },
  onHide: function () {
    console.log('App Hide')
  }
}
</script>

<style lang="scss">
/* 全局样式 */
html,
body {
  /* 禁止移动端浏览器的下拉刷新/橡皮筋回弹, 避免页面跟着手指上下晃动 */
  overscroll-behavior: none;
  overflow-x: hidden;
}

/* 轻点类控件关闭双击缩放, 点击更跟手(不影响页面上下滚动) */
uni-view,
uni-text,
uni-image,
uni-button,
uni-input {
  touch-action: manipulation;
}

/* 分包加载失败自动刷新期间, 隐藏 uni-app 内置的"连接服务器超时"错误页, 避免闪现 */
.h5-reloading .uni-async-error {
  display: none !important;
}

page {
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: #f0f2f5;
  -webkit-font-smoothing: antialiased;
}

/* uni-app 默认按钮样式重置 */
button {
  &::after {
    border: none;
  }
}

/**
 * uni-app 内置 toast/modal 的 z-index 默认是 999,
 * 低于下注弹层(.bet-sheet-mask = 1000), 会导致下单失败等异常提示被弹层遮住。
 * 这里统一抬高, 保证提示始终显示在最上层。
 */
uni-toast,
.uni-toast,
.uni-sample-toast,
uni-modal,
.uni-modal {
  z-index: 3000 !important;
}

/* 文字颜色 */
.text-primary { color: #1a237e; }
.text-danger { color: #d32f2f; }
.text-success { color: #2e7d32; }
.text-muted { color: #999; }

/* 弹性布局 */
.flex { display: flex; }
.flex-center { display: flex; align-items: center; justify-content: center; }
.flex-between { display: flex; align-items: center; justify-content: space-between; }
</style>
