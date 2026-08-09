# vipc-tools — 竞彩足球赛事看板

实时抓取 [vipc.cn](https://www.vipc.cn/live) 竞彩足球赛事列表（今天/明天），本地网页展示。

## 运行要求

- Node.js **18+**（用了全局 `fetch`）
- 无任何第三方依赖

## 启动

```bash
node server.js
# 或指定端口
PORT=9000 node server.js
```

启动后浏览器打开 **http://127.0.0.1:8787**

端口被占（EADDRINUSE）时：
```bash
netstat -ano | findstr :8787
taskkill /PID <PID> /F
```

## 数据来源

| 数据 | 接口 |
|---|---|
| 列表（今天/指定日期） | `https://www.vipc.cn/i/live/football/date/{date}/next` |
| 竞彩玩法详情 | `https://www.vipc.cn/i/match/jczq/sporttery/{id}` |
| 比赛基础信息 | `https://www.vipc.cn/i/match/football/{id}` |
| 技术统计 | `https://www.vipc.cn/i/match/football/{id}/live` |

列表接口说明：
- 前端请求**本地透传** `http://127.0.0.1:8787/i/live/football/date/{date}/next?_=<时间戳>`（`date` = `today` 或 `YYYY-MM-DD`），**路径与 vipc 官方接口逐字一致**；server.js 把 `/i/**` 原样转发到 `https://www.vipc.cn/i/**` 并补上 CORS 头
- 为什么透传：vipc 接口响应没有 CORS 头（`access-control-allow-origin`），浏览器直连会被跨域拦截（实测 CORS 报错）
- 返回 JSON，按日期分组：`{prev, next, items: [{date, dateDesc, matches: [...]}]}`，每场比赛在 `matches[i].model` 里（`matchId/home/guest/league/matchTime/displayState/homeScore/guestScore` 等），无赔率字段
- `public/index.html` 的 `parseVipcList()` 负责解析：按请求日期过滤分组（`today` 会带上昨天已完场的组，已滤掉）、去重、按状态排序（未开始/进行中在前，完场/推迟在后）
- 参考样例：`public/test.json`
- 旧版列表接口代码（HTML 赔率波动榜解析 / 服务端 JSON 解析）备份在 `legacy-list-api.js`

**注意：** 站点 WAF 按 User-Agent 过滤，裸 curl / Chrome UA 返回 403，代码内已内置搜索爬虫 UA（Baiduspider），请勿改成普通 UA。

## 文件结构

```
vipc-tools/
├── server.js              # Node 本地 HTTP 服务（端口 8787）：静态页面 + /i/** vipc 透传 + /api/match/:id 详情代理
├── public/index.html      # 前端看板页面（直连代理拿原始 JSON 后自行解析）
├── public/test.json       # 列表接口返回结构参考样例
├── legacy-list-api.js     # 旧版列表接口代码备份（不参与运行）
└── README.md
```

## 迁移记忆（给 Claude Code 用）

本项目关键信息（数据源、WAF 绕过、竞彩 0/1/3 编码、字段映射）已写入记忆文件 `memory/`。
copy 到新电脑后，将 `memory/` 下的文件放到新电脑的对应路径：

```
C:\Users\<用户名>\.claude\projects\D--work-project-tianyu-saishi-data\memory\
```

新电脑的 Claude Code 就能记住本项目上下文。若新电脑项目路径不同，记忆里的路径信息需相应调整。
