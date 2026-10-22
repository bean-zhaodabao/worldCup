/**
 * H5 页面滚动锁定
 *
 * 移动端浏览器里仅给 body 设置 overflow:hidden 无法可靠禁止背景滚动
 * (iOS Safari 尤其明显), 会导致弹层打开时页面仍跟着手指滑动。
 * 这里使用 position:fixed + 记录 scrollY 的方式锁定, 关闭弹层时恢复原滚动位置。
 *
 * 支持嵌套调用(引用计数), 多个弹层同时打开时不会提前解锁。
 */
let lockCount = 0
let saved = null

export function lockBodyScroll() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return

  if (lockCount === 0) {
    const body = document.body
    const html = document.documentElement
    const scrollY = window.scrollY || html.scrollTop || 0

    saved = {
      scrollY,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyHeight: body.style.height,
      bodyOverflow: body.style.overflow,
      htmlOverflow: html.style.overflow
    }

    // 固定 body 并向上偏移, 视觉上停留在当前滚动位置
    // 注意: uni-app H5 默认 body{height:100%}, 固定定位后会变成视口高度并裁剪内容,
    // 所以这里要改成 auto, 让 body 保持完整内容高度
    body.style.position = 'fixed'
    body.style.top = '-' + scrollY + 'px'
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.height = 'auto'
    body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'
  }

  lockCount++
}

export function unlockBodyScroll() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return

  if (lockCount === 0) return
  lockCount--
  if (lockCount > 0) return
  if (!saved) return

  const body = document.body
  const html = document.documentElement

  body.style.position = saved.bodyPosition
  body.style.top = saved.bodyTop
  body.style.left = saved.bodyLeft
  body.style.right = saved.bodyRight
  body.style.width = saved.bodyWidth
  body.style.height = saved.bodyHeight
  body.style.overflow = saved.bodyOverflow
  html.style.overflow = saved.htmlOverflow

  const scrollY = saved.scrollY
  saved = null

  // 恢复锁定前的滚动位置
  window.scrollTo(0, scrollY)
}
