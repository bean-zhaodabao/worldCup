<template>
  <view class="agent-tabbar">
    <view
      v-for="item in items"
      :key="item.key"
      class="tab-item"
      :class="{ active: current === item.key }"
      @click="go(item)"
    >
      <text class="tab-icon">{{ item.icon }}</text>
      <text class="tab-text">{{ item.text }}</text>
    </view>
  </view>
</template>

<script setup>
const props = defineProps({
  current: { type: String, default: 'workbench' }
})

const items = [
  { key: 'workbench', text: '工作台', icon: '📊', url: '/pages-agent/workbench/index' },
  { key: 'user', text: '用户', icon: '👥', url: '/pages-agent/user/list' },
  { key: 'order', text: '订单', icon: '📋', url: '/pages-agent/order/list' },
  { key: 'profile', text: '我的', icon: '👤', url: '/pages-agent/profile/index' }
]

const go = (item) => {
  if (item.key === props.current) return
  uni.reLaunch({ url: item.url })
}
</script>

<style lang="scss" scoped>
.agent-tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99;
  display: flex;
  background: #fff;
  border-top: 1rpx solid #eee;
  padding-bottom: env(safe-area-inset-bottom);

  .tab-item {
    flex: 1;
    height: 100rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2rpx;
    color: #999;

    .tab-icon { font-size: 34rpx; line-height: 1; }
    .tab-text { font-size: 22rpx; }

    &.active { color: #1a237e; }
  }
}
</style>
