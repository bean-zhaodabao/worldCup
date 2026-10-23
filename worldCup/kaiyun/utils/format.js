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

/** 让球盘口数值 -> 带符号数字: 0 -> "0", 1 -> "+1", -1 -> "-1", 0.75 -> "+0.75" */
export function rqHandicapText(n) {
  const num = Number(n)
  if (!isFinite(num) || num === 0) return '0'
  const v = Math.round(Math.abs(num) * 100) / 100
  return (num > 0 ? '+' : '-') + v
}

/** 让球盘口数值 -> 中文文案: 0 -> "平手", 1 -> "受让一球", -0.75 -> "让半球/一球" */
export function rqHandicapCn(n) {
  const num = Number(n)
  if (!isFinite(num) || num === 0) return '平手'
  const v = Math.abs(num)
  const map = [
    [0.25, '平手/半球'], [0.5, '半球'], [0.75, '半球/一球'],
    [1, '一球'], [1.25, '一球/一球半'], [1.5, '一球半'], [1.75, '一球半/二球'],
    [2, '二球'], [2.25, '二球/二球半'], [2.5, '二球半'], [2.75, '二球半/三球'],
    [3, '三球'], [3.25, '三球/三球半'], [3.5, '三球半'], [3.75, '三球半/四球'],
    [4, '四球'], [4.25, '四球/四球半'], [4.5, '四球半'], [4.75, '四球半/五球'], [5, '五球']
  ]
  let text = ''
  for (const [k, t] of map) {
    if (Math.abs(v - k) < 0.001) { text = t; break }
  }
  if (!text) text = String(v)
  return (num < 0 ? '让' : '受让') + text
}
