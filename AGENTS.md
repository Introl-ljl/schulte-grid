# 项目说明（AGENTS.md）

舒尔特方格 Web 游戏：每日固定挑战（3×3、4×4、5×5、1-50 四关，可无限重开和重复挑战，每次完整完成均记入每日榜）+ 复战模式（随机布局，独立排行榜）+ 无限模式。正式成绩经 Vercel Functions 安全代理写入当前服务器的 Node API + PostgreSQL；所有排行榜保留每次完整成绩，同一用户可多次出现，榜单严格展示 Top 20。

## 技术栈

- 原生 HTML/CSS/JS 前端，无框架、无打包器（`public/app.js`、`public/api.js`、`public/theme.js`、`public/sw.js`）。
- Vercel API：`api/**/*.mjs` 是薄代理，使用 `BACKEND_ORIGIN`、`BACKEND_PROXY_SECRET` 调用本机后端。
- 后端：`backend/server.mjs` + `backend/routes/`，Docker Compose 服务名为 `api` / 容器名为 `schulte-api`。
- 数据库：Docker Compose PostgreSQL 16，驱动为 `postgres`，迁移在 `db/*.sql`（按文件名顺序执行），数据卷为 `schulte_postgres_data`。
- 公网入口：`schulte.introl.me` Cloudflare Tunnel → `192.168.1.104:3030`。
- 服务端仅本地/容器内提供静态文件：`server.js`（Node 原生 `http`，零依赖）。
- 关卡生成用原生 Node 脚本，无第三方依赖。
- Node 24（后端 Docker 与 Vercel）。

## 常用命令

- `npm run build`：生成 `public/data/daily-levels.json`（默认当天起 8 天，可用 `LEVEL_START_DATE`、`LEVEL_DAYS` 覆盖）。
- `npm test`：校验关卡生成的质量与结构。
- `npm run db:migrate`：使用 `DATABASE_URL` 执行 PostgreSQL 建表迁移。
- `docker compose up -d --build`：启动/更新生产 API 与 PostgreSQL。
- `npm run dev`：通过 Vercel CLI 启动静态前端与 Functions 完整链路。
- `npm start`：本地起服务，`http://localhost:3000`（可用 `PORT` 覆盖）。
- 部署：GitHub Pages 走 `.github/workflows/daily-pages.yml`，Vercel 走 `vercel.json` + `daily-vercel.yml`，均为北京时间每天 00:05 重新生成关卡。

## 关键约定

- 关卡布局由日期 + 规格 + `RULES_VERSION` 确定性生成，逻辑在 `scripts/daily-levels.js`。改规则务必同步 `RULES_VERSION`，否则旧缓存关卡失效。
- `daily` / `replay` / `easy` / `classic` / `fifty` 五种模式均为正式玩法，开始必须先调用 `/api/runs/start` 创建服务端 run，完成后调用 `/api/runs/finish` 写入 `scores`。
- `daily` 模式：开始次数不受限制；每次完整完成都会写入 `scores`，首页的连续天数与本地摘要仍按日期计算。
- 所有排行榜按单次成绩排序，不按用户去重，同一用户可有多条记录；API 只返回 Top 20，不额外返回榜外的本人记录。
- `replay` 模式：随机布局，使用与 `daily` 相同的 4 阶段结构，可多次上榜，进入独立的复战排行榜。
- 普通紫色是今日全体最快，特殊深紫是整体最速；颜色从排行榜 benchmark 动态计算，不能持久化成永久评级。
- PostgreSQL 不得映射宿主机端口；API 只能绑定内网 `192.168.1.104:3030`，并要求 `PROXY_SECRET`。
- 修改后端后必须重建 `docker compose up -d --build api`，验证容器 health、`schulte.introl.me/healthz` 和 `game.introl.me/api/health`。
- 改前端或 API 后跑 `npm test`，再确认 `public/data/daily-levels.json` 结构不变。
- 代码风格跟随现有文件；无 linter，提交前手动保持一致。

## 更多细节

- 玩法/模式差异见 `README.md`。
- 关卡质量规则（相邻、直线、接近度检查）见 `scripts/daily-levels.js` 的 `passesQuality`。
