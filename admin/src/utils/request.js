import axios from 'axios'

// 开发环境通过 Vite proxy 代理到 uniCloud（解决 CORS）
// 生产环境直接配置 uniCloud 域名
const BASE_URL = import.meta.env.DEV
  ? '/api'
  : 'http://worldcup.fumaokitchen.com'
// const BASE_URL = 'http://worldcup.fumaokitchen.com'

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 15000
})

http.interceptors.request.use(
  config => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      config.headers.Authorization = 'Bearer ' + token
    }
    return config
  },
  error => Promise.reject(error)
)

http.interceptors.response.use(
  response => {
    const data = response.data
    // 应用层 401 → 踢回登录
    if (data && data.code === 401) {
      localStorage.removeItem('admin_token')
      window.location.href = '/login'
      return Promise.reject(new Error(data.message || '未登录'))
    }
    return data
  },
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default http
