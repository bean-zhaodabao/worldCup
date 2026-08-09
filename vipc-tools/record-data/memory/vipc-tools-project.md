---
name: vipc-tools-project
description: 竞彩足球赔率抓取展示项目（vipc-tools），含数据源接口、WAF 绕过、竞彩编码等关键技术点
metadata: 
  node_type: memory
  type: project
  originSessionId: 05315e55-49cc-4a58-9b4b-b589eee0260c
  modified: 2026-08-09T16:00:00.000Z
---

# vipc-tools 项目（2026-08 建立）

实时抓取 `vipc.cn` 竞彩足球赛事列表（今天/明天/后天）并本地网页展示的工具。

- **项目路径**：`D:\wxd\project\saishi-data\vipc-tools`（本机）；旧路径 `D:\work\project\tianyu\saishi-data\vipc-tools`
- **技术栈**：纯 Node.js（全局 fetch，无第三方依赖），`server.js` + `public/index.html`
- **启动**：`node server.js`，端口 `8787`，浏览器访问 `http://127.0.0.1:8787`
- **轮询**：前端每 10s 经本地透传拉一次列表（服务端不再轮询），详情缓存 60s

## 数据源（关键，重新发现成本高）

| 数据 | 接口 | 说明 |
|---|---|---|
| 列表 | `https://www.vipc.cn/i/live/football/date/{date}/next?_=<时间戳>` | `date`=`today` 或 `YYYY-MM-DD`；JSON，每场在嵌套 `model` 对象里 |
| 竞彩玩法详情 | `https://www.vipc.cn/i/match/jczq/sporttery/{matchId}` | spf/rqspf/bf/bqc/jq 五种玩法赔率+变化历史，`{code:0,data:{...}}` |
| 比赛基础信息 | `https://www.vipc.cn/i/match/football/{matchId}` | 比分、状态、队标、排名、赛季；**返回 `{type, model:{...}}`，字段在 model 里**（前端 renderDetail 踩过这个坑） |
| 技术统计 | `https://www.vipc.cn/i/match/football/{matchId}/live` | 控球率、射门等 |

matchId 在列表响应的 `model.matchId` 字段（字符串数字）。响应按日期分组：`{prev, next, items:[{date, dateDesc, matches:[{type, model, room}]}]}`——`today` 会带上昨天已完场的组。**前端请求本地透传** `http://127.0.0.1:8787/i/live/football/date/{today|YYYY-MM-DD}/next?_=<时间戳>`（路径与 vipc 官方接口逐字一致），server.js 把 `/i/**` 原样转发到 `https://www.vipc.cn/i/**` 并补 CORS 头；解析在 `public/index.html` 的 `parseVipcList()` 里做日期过滤分组、去重、状态排序（未开始/进行中在前、完场/推迟在后）+ 开赛时间排序；服务端另有静态页面 + `/api/match/:id` 详情代理。响应无赔率字段，前端卡片展示 对阵/联赛/时间/状态/比分，头部可切今天/明天。接口必须带 `/i/` 前缀，不带 `/i/` 是 404。**坑：vipc 响应无 CORS 头（`access-control-allow-origin`），浏览器直连必被跨域拦截（用户实测过），必须经本地透传**。旧版列表代码（HTML 赔率波动榜解析 + 服务端 JSON 解析）备份在 `legacy-list-api.js`，`public/test.json` 是列表响应结构样例。

**2026-08-09 变更：** 列表从抓 `jczq/tools/bd` HTML 赔率波动榜（10 场，含即/初赔、波幅、升降）改为上面的 JSON 接口，旧接口已弃用。完整变更记录见 `record-data/changelog-2026-08-09.md`。

## 关键坑（务必记住）

1. **WAF 按 User-Agent 过滤**：裸 curl / Chrome UA → nginx 403；必须带搜索爬虫 UA（实测 `Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)` 能过）。会限流，抓取要控制频率。
2. **竞彩编码 0/1/3**（sporttery 接口内）：`spf3`=胜(主胜)、`spf1`=平、`spf0`=负(客胜)；`rqspf` 同理 `rq3`=让球胜、`rq1`=让球平、`rq0`=让球负。已用真实比分验证。**注意这些键不在 spf/rqspf 顶层，而在 `odds` 数组的每条记录里**（`{rq0,rq1,rq3,updateTime}`），判断玩法要看 `odds[0]`（前端 playTableHtml 踩过这个坑）。
3. **列表页赔率顺序是正常的 胜/平/负**，只有 sporttery 接口用 0/1/3 编码，别搞混。
4. **bf 比分字段**：`sw*`=主胜系列（sw10=1:0…sw5=胜其他）、`sd*`=平局（sd00=0:0…sd4=平其他）、`sl*`=主负（sl01=0:1…sl5=负其他）。
5. **bqc 半全场**：`ht00`=胜/胜 … `ht33`=负/负 共 9 种；**jq 进球**：`t0`~`t7`（0球~7+球）。
6. 详情页真实内容 = sporttery 接口（用户指定），不是 `/odds/euro`（欧赔多公司对比，现未用）。

## 记忆迁移

本记忆文件的**迁移副本**就在项目内 `record-data/memory/`。copy 项目到新电脑后，把 `record-data/memory/` 下的文件放到新电脑 Claude Code 对应路径：`C:\Users\<用户名>\.claude\projects\<项目路径编码>\memory\`（本机为 `C:\Users\Lenovo\.claude\projects\D--wxd-project-saishi-data-vipc-tools\memory\`），即可在新环境恢复本项目记忆。若新电脑项目路径不同，记忆里的路径信息需相应调整。
