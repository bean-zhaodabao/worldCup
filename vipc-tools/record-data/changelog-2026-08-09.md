# 2026-08-09 变更记录（列表接口切换 + 前端改造）

> 与 Claude Code 协作完成的当天改动全记录。本次会话对应记录文件：`a4169076-f6f2-4b8b-8b4d-0e88a1059e61.jsonl`、`05315e55-49cc-4a58-9b4b-b589eee0260c.jsonl`（会话记录）。
> 相关记忆：`memory/vipc-tools-project.md`

## 一、列表数据源切换（核心变更）

**旧**：抓 `https://www.vipc.cn/jczq/tools/bd` 服务端渲染 HTML 赔率波动榜（仅 10 场，含即时/初赔、波幅、升降、变动次数），`server.js` 里用正则解析 HTML。

**新**：`https://www.vipc.cn/i/live/football/date/{date}/next?_=<时间戳>` JSON 接口
- `date` = `today`（今天）或 `YYYY-MM-DD`（明天/后天）
- URL 末尾必须带当前时间戳 `?_=<ms>` 防缓存
- **必须带 `/i/` 前缀**，不带 `/i/` 返回 404（实测）
- 响应结构：`{prev, next, items: [{date, dateDesc, matches: [{type, model, room}]}]}`，每场比赛在 `model` 里（`matchId/home/guest/leagueName/matchTime/displayState/homeScore/guestScore/bdIssue...`）
- **无赔率字段**；`today` 请求会带上昨天已完场的分组，需按 `items[].date === 请求日期` 过滤
- 接口限流：WAF 按 UA 过滤，服务端抓取必须用 Baiduspider UA；`/i/` 系列接口实测 Chrome UA 也能过（仅 HTML 页面被 WAF 拦）

## 二、CORS 问题的最终方案（踩坑记录）

1. 一开始想前端直连 vipc → **实测失败**：vipc 响应没有 `access-control-allow-origin` 头，浏览器直连必被跨域拦截
2. 中间试过 `/api/list` 透传 → 能用，但路径不像官方接口
3. **最终采用"路径镜像透传"**：前端请求 `http://127.0.0.1:8787/i/live/football/date/{date}/next?_=<ms>`（路径与 vipc 官方逐字一致），server.js 把任意 `/i/**` 路径原样转发到 `https://www.vipc.cn/i/**` 并补上 `Access-Control-Allow-Origin: *`

## 三、前端改造

- **`parseVipcList()`**（index.html 新增）：解析原始 JSON → 按请求日期过滤分组（滤掉昨天的组）→ 按 matchId 去重 → 状态排序（未开始/进行中在前、完场/推迟在后）+ 开赛时间升序
- **卡片展示**：改为 主队 vs 客队 + 联赛/期号/时间 + 状态徽章（未开始灰/进行中绿/完场蓝）+ 比分行（非"未开始"时显示）；去掉了赔率/波幅/升降展示
- **日期切换**：头部 今天/明天/后天 三个按钮，`dayStr(offset)` 计算日期
- **详情弹窗两个渲染修复**：
  1. **让球胜平负不显示**：`rq0/rq1/rq3` 键不在 `rqspf` 顶层，在 `odds` 数组每条记录里（`{rq0,rq1,rq3,updateTime}`）→ `playTableHtml` 改为从 `odds[0]` 判断玩法键名
  2. **标题 `-- VS --`**：基础信息接口返回 `{type, model:{...}}`，字段在 `model` 里 → `renderDetail` 改为 `b = (d.base && d.base.model) || d.base`
- 让球数显示格式：`1.00` → `1`（保留 `1.25` 这类小数）

## 四、文件改动清单

| 文件 | 改动 |
|---|---|
| `server.js` | 删除列表 HTML 解析/服务端 JSON 解析/轮询缓存；新增 `/i/**` 通用透传（原样转发 + 补 CORS 头）；保留静态页面 + `/api/match/:id` 详情代理（详情仍服务端抓取） |
| `public/index.html` | 新增 `parseVipcList()`/`dayStr()`；重写 `pollList`（请求 `/i/**` 透传路径）；卡片改为对阵+状态+比分；今天/明天/后天按钮；修复 `playTableHtml` 和 `renderDetail` |
| `legacy-list-api.js` | **新建备份**：旧版列表代码两版（A: /jczq/tools/bd HTML 解析；B: JSON 接口服务端解析），不参与运行 |
| `public/test.json` | 用户提供的列表响应结构样例（保留） |
| `README.md` | 数据源表、列表接口说明、文件结构同步 |
| `memory/vipc-tools-project.md` | 数据源、关键坑、架构说明同步 |

## 五、验证结果（实测）

- `/i/live/football/date/today/next` 透传 → 200，返回原始 JSON，带 `Access-Control-Allow-Origin: *`
- 今天 189 场（92 未开始 / 1 下半场 / 8 推迟 / 88 完场，日期过滤后），明天 78 场全未开始，后天 08-11 分组正常
- 详情 `/api/match/:id` 正常（非竞彩场次 sporttery 为空属正常）
- 让球胜平负渲染验证：即时 1.69 / 3.65 / 3.8，初赔 1.73 / 3.6 / 3.65
- 详情标题/信息栏验证：韦莱斯 VS 列宁格勒达，联赛/赛季/排名/开赛全部正常

## 六、运维注意

- 改代码后需重启服务：`netstat -ano | findstr :8787` → `taskkill /PID <PID> /F` → `node server.js`
- 静态文件（index.html）改动无需重启，刷新即可
