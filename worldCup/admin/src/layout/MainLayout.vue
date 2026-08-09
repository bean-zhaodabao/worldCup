<template>
  <div class="main-layout">
    <el-container>
      <!-- 侧边栏 -->
      <el-aside :width="isCollapse ? '64px' : '220px'" class="aside">
        <div class="logo">
          <span v-if="!isCollapse">🏆 世界杯彩票管理</span>
          <span v-else>🏆</span>
        </div>
        <el-menu
          :default-active="activeMenu"
          :collapse="isCollapse"
          :collapse-transition="false"
          router
          background-color="#304156"
          text-color="#bfcbd9"
          active-text-color="#409EFF"
        >
          <template v-for="route in menuRoutes" :key="route.path">
            <el-menu-item :index="'/' + route.path">
              <el-icon><component :is="route.meta.icon" /></el-icon>
              <template #title>{{ route.meta.title }}</template>
            </el-menu-item>
          </template>
        </el-menu>
      </el-aside>

      <!-- 主内容区 -->
      <el-container>
        <el-header class="header">
          <div class="header-left">
            <el-icon
              class="collapse-btn"
              @click="isCollapse = !isCollapse"
              :size="22"
            >
              <Fold v-if="!isCollapse" />
              <Expand v-else />
            </el-icon>
          </div>
          <div class="header-right">
            <el-dropdown>
              <span class="admin-info">
                <el-icon><UserFilled /></el-icon>
                <span>{{ adminName }}</span>
                <el-icon><ArrowDown /></el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="handleLogout">退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-header>

        <el-main>
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const isCollapse = ref(false)

const menuRoutes = computed(() => {
  // 获取需要显示在菜单的路由（排除 hidden 的）
  return router.options.routes
    .find(r => r.path === '/')
    ?.children
    ?.filter(r => !r.meta?.hidden) || []
})

const activeMenu = computed(() => route.path)

const adminName = computed(() => {
  try { return JSON.parse(localStorage.getItem('admin_user') || '{}').username || '管理员' }
  catch { return '管理员' }
})

const handleLogout = () => {
  localStorage.removeItem('admin_token')
  localStorage.removeItem('admin_user')
  router.push('/login')
}
</script>

<style lang="scss" scoped>
.main-layout {
  height: 100vh;

  .aside {
    background-color: #304156;
    overflow: hidden;
    transition: width 0.3s;

    .logo {
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 16px;
      font-weight: bold;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      white-space: nowrap;
    }

    .el-menu {
      border-right: none;
    }
  }

  .header {
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #e6e6e6;
    height: 60px;
    padding: 0 20px;

    .collapse-btn {
      cursor: pointer;
      &:hover { color: #409EFF; }
    }

    .admin-info {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      color: #333;
    }
  }

  .el-main {
    background: #f0f2f5;
    min-height: calc(100vh - 60px);
  }
}
</style>
