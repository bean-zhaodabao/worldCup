/**
 * 旧版列表接口代码备份（2026-08-09 移除，仅供恢复参考，不会被 server.js 引用）
 *
 * 当前架构：server.js 的 /api/list 只做透传（原样转发 vipc JSON），解析在 public/index.html 的
 * parseVipcList()。以下两个版本都是旧的服务端解析实现，需要恢复时把对应函数复制回 server.js。
 *
 * 版本 A（最原始）：抓 https://www.vipc.cn/jczq/tools/bd 服务端渲染 HTML 赔率波动榜（10 场）
 * 版本 B（过渡版）：抓 https://www.vipc.cn/i/live/football/date/{date}/next JSON，服务端解析
 */

/* ============ 版本 A：/jczq/tools/bd HTML 解析（含即/初赔、波幅、升降） ============ */

// const LIST_URL = 'https://www.vipc.cn/jczq/tools/bd';

/** 将一段 HTML 中的 span 赔率抽成 {value, trend} 数组 */
function parseOdds(seg) {
  const list = [];
  // class 属性可有可无（初赔的 span 是裸 <span>3.9</span>）
  const re = /<span(?:\s+class="([^"]*)")?\s*>([\s\S]*?)<\/span>/g;
  let m;
  while ((m = re.exec(seg)) !== null) {
    const cls = m[1] || '';
    list.push({
      value: m[2].replace(/\s+/g, '').trim(),
      trend: cls.includes('red') ? 'up' : cls.includes('green') ? 'down' : 'flat',
    });
  }
  return list;
}

function parseList(html) {
  const blocks = html.split('class="vMod vTools_jczq_bd_item"').slice(1);
  const clean = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  return blocks.map((blk) => {
    const get = (re, i = 1) => {
      const m = blk.match(re);
      return m ? clean(m[i]) : '';
    };

    // a 标签里的 matchId
    const idMatch = blk.match(/href="\/live\/football\/(\d+)/);
    const matchId = idMatch ? idMatch[1] : '';

    // 对阵（两组都取：主队 + 客队）
    const vsM = blk.match(/<p>(.*?)<span class="gray">vs<\/span>(.*?)<\/p>/);
    const vsText = vsM ? clean(vsM[1]) + ' vs ' + clean(vsM[2]) : '';

    // 期号 联赛 日期时间：如 "周五001 日职联 08-07 18:25"
    const info = get(/<p class="gray info">(.*?)<\/p>/);
    const infoParts = info.split(/\s+/);
    const num = get(/<p class="red num">(.*?)<\/p>/).replace('次', '');

    // 即时/初赔：从 <b>即:</b> ... </p> 段里抽 span 值
    const curSeg = (blk.match(/<b class="gray">即:<\/b>([\s\S]*?)<\/p>/) || [])[1] || '';
    const iniSeg = (blk.match(/<b class="gray">初:<\/b>([\s\S]*?)<\/p>/) || [])[1] || '';

    // 一赔波幅
    const waveMatch = blk.match(/<span class="orange">([\s\S]*?)<\/span>/);
    // 一赔升降：取「一赔升降」标签之前最后一个 span 的内容
    const riseBefore = blk.slice(0, blk.indexOf('<p class="gray">一赔升降</p>'));
    const riseSpans = [...riseBefore.matchAll(/<span(?:\s+class="([^"]*)")?\s*>([\s\S]*?)<\/span>/g)];
    const riseSeg = riseSpans.length ? riseSpans[riseSpans.length - 1][2] : '';

    return {
      matchId,
      name: vsText,
      // info 结构：期号 / 联赛 / 日期时间
      no: infoParts[0] || '',
      league: infoParts[1] || '',
      time: infoParts.slice(2).join(' ') || '',
      changeCount: num || '0',
      currentOdds: parseOdds(curSeg),
      initialOdds: parseOdds(iniSeg),
      wave: waveMatch ? clean(waveMatch[1]) : '',
      rise: clean(riseSeg),
      detailUrl: `https://www.vipc.cn/live/football/${matchId}?in=jczq_tools_bd`,
    };
  }).filter((m) => m.matchId);
}

// 对应的 refreshList：
// async function refreshList(force) {
//   if (state.fetching) return state.fetching;
//   const elapsed = Date.now() - state.listFetchedAt;
//   if (!force && state.list.length && elapsed < LIST_REFRESH_MS) return;
//   state.fetching = (async () => {
//     try {
//       const html = await fetchText(LIST_URL, 'https://www.vipc.cn/jczq/tools/bd');
//       state.list = parseList(html);
//       state.listFetchedAt = Date.now();
//       state.listError = null;
//     } catch (e) {
//       state.listError = String(e.message || e);
//       console.error('[list]', new Date().toLocaleTimeString(), state.listError);
//     } finally {
//       state.fetching = null;
//     }
//   })();
//   return state.fetching;
// }

/* ============ 版本 B：JSON 接口服务端解析（含日期过滤 + 状态排序） ============ */

// const LIST_URL = 'https://www.vipc.cn/i/live/football/date/';

/** 本机当天日期 YYYY-MM-DD */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 递归收集对象里的所有带 matchId 的 model，不依赖具体嵌套层级 */
function collectModels(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => collectModels(n, out));
  if (node.matchId != null) return out.push(node);
  Object.keys(node).forEach((k) => collectModels(node[k], out));
}

async function fetchList(dateStr) {
  const url = `${LIST_URL}${dateStr}/next?_=${Date.now()}`;
  const json = await fetchJson(url, 'https://www.vipc.cn/live');

  if (json && typeof json === 'object' && json.code != null && Number(json.code) !== 0) {
    throw new Error(`vipc 接口返回 code=${json.code}`);
  }

  // 接口按日期分组（today 会带上昨天已完场的比赛），只保留请求日期当天的分组
  const items = Array.isArray(json.items)
    ? json.items
    : json.data && Array.isArray(json.data.items) ? json.data.items : null;
  const concrete = dateStr === 'today' ? todayStr() : dateStr;
  let groups = items;
  if (items) {
    const matched = items.filter((it) => it.date === concrete);
    if (matched.length) groups = matched; // 没匹配到说明结构变了，退回全部，避免静默变空
  }

  const models = [];
  for (const g of groups || [json]) collectModels(g, models);

  // 去重（同一场可能出现在多个分组）
  const seen = new Set();
  const list = models.filter((m) => {
    const id = String(m.matchId);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map((m) => ({
    matchId: String(m.matchId),
    home: m.home || '',
    guest: m.guest || '',
    league: m.leagueName || m.league || '',
    time: m.matchTime || '',
    no: m.bdIssue || '',
    displayState: m.displayState || '',
    status: m.status,
    homeScore: m.homeScore,
    guestScore: m.guestScore,
  }));

  // 排序：未开始/进行中在前（按开赛时间升序），已完场/推迟在后
  const PRIO = { '未开始': 0, '完场': 2, '推迟': 2 };
  const prio = (s) => (s in PRIO ? PRIO[s] : 1); // 1 = 进行中（上半场/中场/下半场/加时…）
  return list.sort((a, b) => {
    const pa = prio(a.displayState), pb = prio(b.displayState);
    if (pa !== pb) return pa - pb;
    return (a.time || '').localeCompare(b.time || '');
  });
}
