/**
 * vipc.cn 竞彩足球数据 本地展示服务
 *
 * 数据来源（均为 JSON 接口，需伪装搜索引擎爬虫 UA 才能过 WAF）：
 *   - 列表    https://www.vipc.cn/i/live/football/date/{date}/next  (date=today 或 YYYY-MM-DD，JSON)
 *   - 详情    https://www.vipc.cn/i/match/football/{id}   (比赛基础信息)
 *   - 竞彩玩法 https://www.vipc.cn/i/match/jczq/sporttery/{id}
 *   - 技术统计 https://www.vipc.cn/i/match/football/{id}/live
 *
 * 对外接口：
 *   GET /i/**              -> vipc 通用透传（路径与 vipc 官方一致，如 /i/live/football/date/{date}/next；
 *                              vipc 无 CORS 头浏览器不能直连，必须经本服务转发原始 JSON）
 *   GET /                  -> 前端页面 public/index.html
 *   GET /api/match/:id     -> 单场详情（基础信息 + 竞彩玩法 + 技术统计）
 *
 * 列表数据结构（前端解析，见 public/test.json）：
 *   { prev, next, items: [{ date, dateDesc, matches: [{ type, model, room }] }] }
 *   model = { matchId, home, guest, leagueName, matchTime, displayState, homeScore, guestScore, ... }
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);

const UA = 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)';

// 详情缓存时长（毫秒）
const DETAIL_CACHE_MS = 60 * 1000;

const state = {
  detailCache: new Map(), // matchId -> { data, fetchedAt, error }
};

/* ---------------------- 抓取工具 ---------------------- */

async function fetchText(url, referer) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: referer || 'https://www.vipc.cn/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchJson(url, referer) {
  const text = await fetchText(url, referer);
  return JSON.parse(text);
}


/* ---------------------- vipc 通用透传 ---------------------- */

/**
 * 浏览器直连 vipc 会被 CORS 拦截（响应无 access-control-allow-origin 头），
 * 前端改请求本地 /i/** 路径，本服务原样转发到 https://www.vipc.cn/i/**。
 * 请求路径与 vipc 官方接口完全一致，如：
 *   /i/live/football/date/today/next?_=<时间戳>
 *   /i/live/football/date/2026-08-10/next?_=<时间戳>
 */
async function proxyVipc(res, pathname, search) {
  const upstream = 'https://www.vipc.cn' + pathname + search;
  try {
    const body = await fetchText(upstream, 'https://www.vipc.cn/live');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(body);
  } catch (e) {
    sendJson(res, 502, { ok: false, error: String(e.message || e), url: upstream });
  }
}

/* ---------------------- 单场详情 ---------------------- */

async function fetchMatchDetail(matchId) {
  const baseRef = `https://www.vipc.cn/live/football/${matchId}`;
  // sporttery = 竞彩官方玩法赔率（胜平负/让球/比分/半全场/总进球 + 变化历史）—— 点击 a 标签展示的内容
  const [base, sporttery, live] = await Promise.allSettled([
    fetchJson(`https://www.vipc.cn/i/match/football/${matchId}`, baseRef),
    fetchJson(`https://www.vipc.cn/i/match/jczq/sporttery/${matchId}`, baseRef),
    fetchJson(`https://www.vipc.cn/i/match/football/${matchId}/live`, baseRef),
  ]);

  const st = sporttery.status === 'fulfilled' ? sporttery.value : null;
  return {
    matchId,
    base: base.status === 'fulfilled' ? base.value : null,
    sporttery: st && st.code === 0 ? st.data : null,
    sportteryRaw: st,
    live: live.status === 'fulfilled' ? live.value : null,
    errors: [base, sporttery, live].filter((r) => r.status === 'rejected').map((r) => String(r.reason)),
    fetchedAt: Date.now(),
  };
}

async function getMatchDetail(matchId) {
  const hit = state.detailCache.get(matchId);
  if (hit && Date.now() - hit.fetchedAt < DETAIL_CACHE_MS) return hit;

  // 抓取期间并发请求共享同一个 Promise
  if (hit && hit._promise) return hit._promise;

  const p = fetchMatchDetail(matchId)
    .then((data) => {
      state.detailCache.set(matchId, { ...data, _promise: null });
      return data;
    })
    .catch((e) => {
      state.detailCache.set(matchId, { matchId, error: String(e.message || e), fetchedAt: Date.now(), _promise: null });
      return state.detailCache.get(matchId);
    });
  state.detailCache.set(matchId, { matchId, fetchedAt: 0, _promise: p });
  return p;
}

/* ---------------------- HTTP 服务 ---------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // vipc 透传：/i/** 原样转发（含 ?_= 时间戳查询串）；vipc 无 CORS 头，浏览器只能经本地中转
  if (pathname.startsWith('/i/')) {
    proxyVipc(res, pathname, url.search).catch((e) => sendJson(res, 500, { ok: false, error: String(e.message || e) }));
    return;
  }

  const detailMatch = pathname.match(/^\/api\/match\/(\d+)$/);
  if (detailMatch) {
    getMatchDetail(detailMatch[1]).then((data) => {
      if (data.error) return sendJson(res, 502, { ok: false, error: data.error, matchId: detailMatch[1] });
      sendJson(res, 200, { ok: true, ...data });
    });
    return;
  }

  // 静态文件
  if (pathname === '/') {
    serveFile(res, 'index.html');
    return;
  }
  serveFile(res, pathname.slice(1));
});

function serveFile(res, name) {
  const root = path.join(__dirname, 'public');
  const file = path.resolve(root, name);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

server.listen(PORT, HOST, () => {
  console.log('🚀 vipc 赛事数据展示服务已启动');
  console.log(`   打开浏览器访问: http://${HOST}:${PORT}`);
  console.log(`   接口: /i/** 透传(列表)   /api/match/:id(详情)`);
});
