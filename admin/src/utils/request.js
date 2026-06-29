import axios from 'axios'

// 开发环境通过 Vite proxy 代理到 uniCloud（解决 CORS）
// 生产环境用 uniCloud 默认 HTTPS 域名（避免 mixed content）
// const PROD_BASE = 'https://env-00jy6fzs9qxf.dev-hz.cloudbasefunction.cn'
const PROD_BASE = 'http://worldcup.fumaokitchen.com'
const BASE_URL = import.meta.env.DEV ? '/api' : PROD_BASE

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
    // 业务层非 0 错误码 → 统一按异常处理，让调用方的 catch 块能正确显示错误信息
    if (data && data.code !== undefined && data.code !== 0) {
      return Promise.reject(new Error(data.message || '操作失败'))
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
