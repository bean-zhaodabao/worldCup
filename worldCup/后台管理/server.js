/**
 * 世界杯彩票管理系统 - 本地启动服务器
 *
 * 功能：
 *   1. 静态文件服务（dist 目录）
 *   2. SPA 路由回退（所有路由 → index.html）
 *   3. API 代理（解决跨域问题）
 *   4. 自动打开浏览器
 *
 * 使用：node server.js
 * 或双击 start.bat
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const url = require('url');

// ==================== 配置 ====================
const PORT = process.env.PORT || 3002;
const DIST_DIR = path.join(__dirname);
const PROXY_TARGET = 'http://worldcup.fumaokitchen.com';

// uniCloud 生产环境 URL（会被重写为 /api 以走代理）
const UNICLOUD_URL = 'https://env-00jy6fzs9qxf.dev-hz.cloudbasefunction.cn';
const API_PROXY_PREFIX = '/api';

// ==================== MIME 类型 ====================
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.eot':  'application/vnd.ms-fontobject',
  '.otf':  'font/otf',
  '.webp': 'image/webp',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.wav':  'audio/wav',
  '.mp3':  'audio/mpeg',
  '.pdf':  'application/pdf',
  '.map':  'application/json; charset=utf-8',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// ==================== API 代理 ====================
function proxyApiRequest(clientReq, clientRes) {
  const targetUrl = PROXY_TARGET + clientReq.url.replace(API_PROXY_PREFIX, '');
  const parsed = new URL(targetUrl);

  const options = {
    hostname: parsed.hostname,
    port:     parsed.port || 80,
    path:     parsed.pathname + parsed.search,
    method:   clientReq.method,
    headers:  { ...clientReq.headers },
  };

  // 修正 host header
  options.headers.host = parsed.hostname;
  // 移除可能导致问题的 headers
  delete options.headers['accept-encoding'];

  console.log(`[proxy] ${clientReq.method} ${clientReq.url} → ${targetUrl}`);

  const proxyReq = http.request(options, (proxyRes) => {
    // 添加 CORS 头
    const headers = { ...proxyRes.headers };
    headers['access-control-allow-origin'] = '*';
    headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
    headers['access-control-allow-headers'] = 'Content-Type, Authorization';

    clientRes.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on('error', (err) => {
    console.error(`[proxy] 错误: ${err.message}`);
    clientRes.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    clientRes.end(JSON.stringify({
      code: 502,
      message: '代理请求失败: ' + err.message,
    }));
  });

  // 转发请求体
  if (clientReq.method === 'POST' || clientReq.method === 'PUT' || clientReq.method === 'PATCH') {
    clientReq.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

// ==================== 静态文件服务 ====================
function serveStaticFile(clientReq, clientRes, filePath) {
  const mimeType = getMimeType(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // 读取文件
  fs.readFile(filePath, (err, data) => {
    if (err) {
      clientRes.writeHead(500);
      clientRes.end('Internal Server Error');
      console.error(`[static] 读取失败: ${filePath}`);
      return;
    }

    let content = data;
    let encoding = mimeType.includes('charset=utf-8') ? 'utf-8' : null;

    // 对于 JS 文件，将 uniCloud URL 替换为 /api 代理路径
    // 这样前端 API 请求会走本地代理，避免跨域问题
    if (ext === '.js' || ext === '.mjs') {
      const original = data.toString('utf-8');
      if (original.includes(UNICLOUD_URL)) {
        content = original.split(UNICLOUD_URL).join(API_PROXY_PREFIX);
        console.log(`[rewrite] ${path.basename(filePath)} — uniCloud URL → /api`);
      }
      encoding = 'utf-8';
    }

    const headers = {
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache',
    };

    clientRes.writeHead(200, headers);
    if (encoding) {
      clientRes.end(content, encoding);
    } else {
      clientRes.end(content);
    }
  });
}

// 资源是否存在于磁盘
function fileExists(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

// ==================== HTTP 服务器 ====================
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;

  // 处理 OPTIONS 预检请求（CORS）
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  // API 代理
  if (pathname.startsWith(API_PROXY_PREFIX)) {
    proxyApiRequest(req, res);
    return;
  }

  // 静态文件
  let filePath = path.join(DIST_DIR, pathname);

  // 安全检查：防止目录遍历
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // 如果请求的是目录或文件不存在，回退到 index.html（SPA 路由）
  if (!fileExists(normalized) || fs.statSync(normalized).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  serveStaticFile(req, res, filePath);
});

// ==================== 启动 ====================
server.listen(PORT, () => {
  const localUrl = `http://localhost:${PORT}`;
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║     🌍 世界杯彩票管理系统               ║');
  console.log('  ╠══════════════════════════════════════════╣');
  console.log(`  ║  本地地址: ${localUrl}                  ║`);
  console.log(`  ║  API 代理: ${PROXY_TARGET}  ║`);
  console.log('  ║  按 Ctrl+C 停止服务                     ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  // 自动打开浏览器
  const platform = process.platform;
  const openCmd = platform === 'win32'
    ? `start "" "${localUrl}"`
    : platform === 'darwin'
      ? `open "${localUrl}"`
      : `xdg-open "${localUrl}"`;

  exec(openCmd, (err) => {
    if (err) {
      console.log(`  请手动打开浏览器访问: ${localUrl}`);
    }
  });
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n  服务器已停止');
  process.exit(0);
});
