/** 赔率统一保留2位小数 */
export function fmtOdds(v) {
  if (v === null || v === undefined || v === '') return '-'
  const n = Number(v)
  if (isNaN(n)) return String(v)
  return n.toFixed(2)
}

/** 大小球盘口数值 -> 数字样式: 2.5 -> "2.5", 2.75 -> "2.5/3" */
export function dxqHandicapText(n) {
  const v = Math.abs(Number(n) || 0)
  const whole = Math.floor(v)
  const frac = Math.round((v - whole) * 100) / 100
  if (frac === 0) return String(whole)
  if (Math.abs(frac - 0.25) < 0.001) return whole + '/' + (whole + 0.5)
  if (Math.abs(frac - 0.5) < 0.001) return String(whole + 0.5)
  if (Math.abs(frac - 0.75) < 0.001) return (whole + 0.5) + '/' + (whole + 1)
  return String(v)
}
