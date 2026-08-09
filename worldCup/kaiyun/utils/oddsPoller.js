/**
 * 赔率版本轮询器
 *
 * 用法:
 *   import { startPolling, stopPolling } from '@/utils/oddsPoller.js'
 *   startPolling({ matchIds: ['id1','id2'], versions: { id1: v1, id2: v2 }, onChange })
 *   stopPolling()
 */

let timer = null
let running = false

/**
 * @param {Object} opts
 * @param {string[]} opts.matchIds - 要监听的比赛 ID 列表
 * @param {Object<string,number>} opts.versions - 当前已知版本号映射 { matchId: version }
 * @param {Function} opts.onChange - 版本变化回调 (changedMatchIds: string[]) => void
 * @param {number} [opts.interval=2000] - 轮询间隔(ms)
 */
export function startPolling(opts = {}) {
  stopPolling()
  const { matchIds = [], versions = {}, onChange, interval = 2000 } = opts

  if (!matchIds.length || !onChange) return

  const knownVersions = { ...versions }
  running = true

  const poll = async () => {
    if (!running) return
    try {
      const res = await uniCloud.callFunction({
        name: 'check-odds-version',
        data: { matchIds }
      })
      if (!running) return
      if (res.result && res.result.code === 0) {
        const serverVersions = res.result.data.versions || {}
        const changed = []
        for (const id of matchIds) {
          const sv = serverVersions[id]
          const kv = knownVersions[id] || 0
          if (sv !== undefined && sv > kv) {
            changed.push(id)
            knownVersions[id] = sv
          }
        }
        if (changed.length > 0) {
          onChange(changed)
        }
      }
    } catch (e) {
      console.warn('oddsPoller error:', e)
    }
    if (running) {
      timer = setTimeout(poll, interval)
    }
  }

  poll()
}

export function stopPolling() {
  running = false
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
