# 每日方格

每日固定关卡的舒尔特方格静态 Web 游戏。每个北京时间自然日提供同一套 3×3、4×4、5×5、1-50 四关挑战；每日挑战从首次开始时占用当天机会，每天只能玩一次。玩法选择仅作用于无限模式：简单模式和经典模式支持 3×3、4×4、5×5、6×6，1-50 模式固定使用双层 5×5 方格，均可无限重复游玩。成绩与每日挑战状态仅保存在浏览器本地。

方格使用统一主题色，首次引导和设置页均提供主题色滑动条，可在六套颜色中切换并保存到当前浏览器。

无限模式会按照玩法与规格分别保存本地最快成绩；刷新纪录时结算时间使用金色动画展示，分享文本也会包含对应模式规格的最快纪录。

## 本地运行

```bash
npm run build
npm start
```

访问 `http://localhost:3000`。

## 关卡生成

`npm run build` 默认从北京时间当天开始生成 8 天关卡（当天和未来 7 天）。可通过环境变量调整：

```bash
LEVEL_START_DATE=2026-07-10 LEVEL_DAYS=8 npm run build
```

生成结果位于 `public/data/daily-levels.json`。布局由日期、规格和规则版本确定，并经过连续数字相邻、直线排列和自然顺序接近度检查。

## 每日发布

`.github/workflows/daily-pages.yml` 在北京时间每天 00:05 自动执行测试、生成未来关卡并部署到 GitHub Pages。仓库需要在 Settings → Pages 中将 Source 设置为 GitHub Actions。

### Vercel

仓库可以直接导入 Vercel。`vercel.json` 已配置：

- Install Command：`npm ci`
- Build Command：`npm run build`
- Output Directory：`public`
- `sw.js` 和 `daily-levels.json` 强制重新验证缓存

Vercel 连接 Git 仓库后，代码推送会自动部署。为了每天重新生成关卡，还需要：

1. 在 Vercel 项目 Settings → Git → Deploy Hooks 中创建一个指向生产分支的 Deploy Hook。
2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中新增 Repository secret：`VERCEL_DEPLOY_HOOK_URL`。
3. 将 Deploy Hook URL 保存为该 secret 的值。
4. `.github/workflows/daily-vercel.yml` 会在北京时间每天 00:05 调用该 Hook，也支持在 Actions 页面手动触发。

应用本身没有账号、数据库或成绩接口；`server.js` 仅用于本地或容器内提供静态文件。
