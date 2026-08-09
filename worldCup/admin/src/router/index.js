import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录' }
  },
  {
    path: '/',
    component: () => import('@/layout/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '仪表盘', icon: 'Odometer' }
      },
      {
        path: 'match',
        name: 'Match',
        component: () => import('@/views/match/index.vue'),
        meta: { title: '赛事管理', icon: 'Trophy' }
      },
      {
        path: 'match/:id/plays',
        name: 'MatchPlays',
        component: () => import('@/views/match/plays.vue'),
        meta: { title: '赛事玩法', hidden: true }
      },
      {
        path: 'category',
        name: 'Category',
        component: () => import('@/views/category/index.vue'),
        meta: { title: '玩法分类', icon: 'Collection' }
      },
      {
        path: 'play',
        name: 'Play',
        component: () => import('@/views/play/index.vue'),
        meta: { title: '玩法管理', icon: 'Grid' }
      },
      {
        path: 'order',
        name: 'Order',
        component: () => import('@/views/order/index.vue'),
        meta: { title: '订单管理', icon: 'Document' }
      },
      {
        path: 'user',
        name: 'User',
        component: () => import('@/views/user/index.vue'),
        meta: { title: '用户管理', icon: 'User' }
      },
      {
        path: 'report',
        name: 'Report',
        component: () => import('@/views/report/index.vue'),
        meta: { title: '报表统计', icon: 'DataAnalysis' }
      },
      {
        path: 'log',
        name: 'OperationLog',
        component: () => import('@/views/log/index.vue'),
        meta: { title: '操作日志', icon: 'List' }
      },
      {
        path: 'config',
        name: 'SystemConfig',
        component: () => import('@/views/config/index.vue'),
        meta: { title: '系统配置', icon: 'Setting' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫 - 登录检查
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('admin_token')
  if (to.path !== '/login' && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router
