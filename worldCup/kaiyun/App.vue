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
