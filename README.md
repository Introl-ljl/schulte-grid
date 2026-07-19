# 每日方格

舒尔特方格 Web 游戏：北京时间每天提供同一套 3×3、4×4、5×5、1-50 四关每日挑战，同时保留简单、经典、1-50 三类无限模式，以及使用随机布局的复战模式（拥有独立排行榜）。

前端仍是原生 HTML/CSS/JS，静态资源位于 `public/`。Vercel Functions 只负责同源安全代理，用户、正式运行和成绩由当前服务器上的 `backend/` Node 服务处理，并写入 Docker Compose 管理的 PostgreSQL。

棋盘使用 Pointer Events 在按下瞬间处理输入，支持多个触点并发点击；键盘与辅助技术仍通过原生按钮的 `click` 事件操作。

## 用户与排行榜规则

- 入口是公共链接，不使用邮箱或 OAuth。首次打开必须输入用户名和 4 位 PIN 登录，没有用户时可以自由注册并自动登录。
- 不提供公开用户选择列表；用户名只在排行榜和当前用户界面中展示。
- PIN 使用 Node.js `scrypt` 加盐哈希；登录会话是 30 天有效的 HttpOnly、SameSite=Lax Cookie。
- PIN 登录按“用户 + IP”和 IP 总量限流。`AUTH_PEPPER` 只用于不可逆地散列请求 IP，不会保存原始 IP。
- 每日挑战可无限重开和重复游玩，每次完整完成都会写入每日排行榜。
- 简单、经典、1-50 无限模式每次正式完成都会提交。
- 每日复战的 `replay` 模式使用随机布局，进入独立的复战排行榜（与每日排行榜互不混入）。
- 所有排行榜保留每一次完整成绩，同一用户可重复出现，严格只展示 Top 20。
- 普通紫色表示该玩法/规格的“今日全体最快”；其他人提交更快成绩后会动态改变。
- 特殊深紫渐变表示跨日期“整体最速”，优先级高于今日最快。

## 本地开发

仅查看静态页面和关卡生成：

```bash
npm run build
npm start
```

访问 `http://localhost:3000`。这个零依赖静态服务器不运行 Functions，因此登录与排行榜会显示离线。

运行后端与数据库：

```bash
npm install
cp .env.example .env.backend
# 替换数据库密码、AUTH_PEPPER 和 PROXY_SECRET
docker compose up -d --build
```

生产 Compose 不映射 PostgreSQL 端口。API 只绑定宿主机内网地址 `192.168.1.104:3030`，供 Cloudflare Tunnel 使用。

常用运维命令：

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f postgres
docker compose up -d --build
docker compose restart api
```

数据保存在命名卷 `schulte_postgres_data`。备份示例：

```bash
docker exec schulte-postgres pg_dump -U schulte -d schulte -Fc > schulte-$(date +%F).dump
```

## 生产链路

```text
浏览器 → game.introl.me → Vercel Functions → schulte.introl.me
       → Cloudflare Tunnel → 192.168.1.104:3030 → schulte-api → PostgreSQL
```

- `schulte.introl.me/healthz` 是公开健康检查。
- 其他后端 `/api/*` 必须携带 `PROXY_SECRET`，直接访问会返回 401。
- Vercel 生产环境需要 `BACKEND_ORIGIN` 和 `BACKEND_PROXY_SECRET`。
- `BACKEND_PROXY_SECRET` 必须与服务器 `.env.backend` 中的 `PROXY_SECRET` 一致。
- `.env.backend` 包含生产密钥，权限应保持为 `0600`，不可提交到 Git。

数据库迁移位于 `db/*.sql`，按文件名顺序执行。迁移脚本可以重复执行，当前语句都使用 `IF NOT EXISTS`。

Vercel 发布：

```bash
npx vercel pull --yes --environment=production
npx vercel build --prod
npx vercel deploy --prebuilt --prod --yes
```

## API

- `POST /api/users`：使用用户名和四位 PIN 注册用户并自动登录。
- `GET/POST/DELETE /api/session`：读取当前用户、使用用户名和 PIN 登录、退出。
- `POST /api/runs/start`：登记正式每日、复战或无限模式运行；每日模式允许重复开始。
- `POST /api/runs/finish`：校验阶段结构并原子写入成绩。
- `GET /api/leaderboard`：读取每日、复战或无限模式排行榜；所有榜单按单次成绩排序并只返回 Top 20，每日整体榜额外返回记录日期。
- `GET /api/health`：通过 Vercel 检查本机后端与数据库链路。

服务端会校验玩法、规格、每日关卡编号、阶段结构、总用时求和、合理用时范围和运行有效期。由于计时发生在浏览器，无法完全阻止主动篡改客户端的玩家；若未来需要强对抗作弊，应增加可信客户端证明或服务端事件流，而不是仅继续收紧毫秒阈值。

## 关卡生成与测试

```bash
npm run build
npm test
```

`npm run build` 默认从北京时间当天生成 8 天关卡到 `public/data/daily-levels.json`，可用 `LEVEL_START_DATE` 和 `LEVEL_DAYS` 覆盖。布局由日期、规格与 `RULES_VERSION` 确定性生成。

`npm test` 同时检查关卡确定性/质量、API 成绩结构、复战排除和计时颜色优先级。

## 每日发布

GitHub Pages 只能托管静态前端，不能运行同源代理和用户系统。完整产品应部署到 Vercel，并保持本机 Compose 与 Cloudflare Tunnel 在线。

`.github/workflows/daily-vercel.yml` 可在北京时间每天 00:05 调用 Vercel Deploy Hook，重新生成未来关卡。Vercel 项目需要配置 `VERCEL_DEPLOY_HOOK_URL` 对应的 GitHub Repository Secret。
