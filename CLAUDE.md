# CLAUDE.md — ferr-ops

> 每次会话先读本文件。它固定了项目的**真实状态**,避免重复扫描、重复解释、把占位功能误当已完成。

## Project Purpose

ferr-ops 是公司内部 **SEO / SEM 运营指挥中心**,目标是完成完整闭环:

> 数据记录 → 数据观察 → 数据分析 → 优化建议 → 任务执行 → 结果验证 → 周报复盘 → SOP 沉淀。

**这个后台不是展示花瓶,而是团队日常运营的主战场。** 每条建议必须能追溯到数据,每个任务必须能验证结果。

## Current Architecture

- **后端不是单文件**:Fastify,模块化良好。
  - `server/src/routes/`(19 个路由)、`server/src/db/migrate.js`(迁移/建表)、`server/src/db/repositories/`(数据访问层)、`server/src/services/`(业务/AI/加密)、`server/src/sync/`(第三方同步,见下方真实状态)。
- **前端集中在 `public/index.html`**,约 **1836 行 / 191KB**,所有页面+逻辑+CSS 挤在一个文件 —— **当前最大的维护风险**(辅助文件:`public/api.js`、`public/login.html`)。
- **已有真实表 + CRUD 的模块**:询盘、KPI、关键词、否词、广告创意、整改(fixes)、复盘(weekly_reports/loop_items)、内容资产(content_assets)、seo_weeks、sem_weeks 等。
- `server/src/routes/overview.js` 已聚合**真实** KPI(月度快照 + 环比)。
- `server/src/services/aiContext.js` 会拼接数据库中的 **KPI、询盘、SEO/SEM 周报、关键词**等真实上下文喂给 AI。
- `server/src/db/repositories/integrations.js` 对密钥做 **AES 加密**存储,**绝不返回前端**。
- `server/src/db/seed.js` 只插入**用户 / KPI / 市场调研**,**不注入假业务数据**。

## API / Sync Reality(真实状态,禁止把未实现描述成已完成)

- **Google 同步后端已实现(代码层面端到端打通),但尚未在生产完成 OAuth 授权,故还没拉到真实数据。**
  - OAuth 授权/回调/刷新/撤销:`server/src/sync/googleClient.js`。
  - GSC 同步:`server/src/sync/gsc.js`(每日 + query/page)。GA4 同步:`server/src/sync/ga4.js`(每日 + 来源/国家/设备/落地页)。Ads 同步:`server/src/sync/ads.js`(campaign + keyword)。
  - 路由 `/api/sync/*`、`/api/google/*` 已在 `server/src/routes/index.js` 注册;数据表 `gsc_*`/`ga4_*`/`google_ads_*`/`google_oauth_*`/`google_sync_runs`/`google_projects` 已在 `migrate.js`;前端状态/连接/同步在 `public/google-projects.js`。
  - **当前唯一卡点:三源均 `authorized:false`(从未授权)。** `redirect_uri=https://data.ferrcasting.com/api/google/auth/callback` 是生产域名 → 授权必须在生产站用 boss/manager 走 OAuth 同意页,本机 localhost 无法完成回调。授权后再 `POST /api/sync/<provider>` 才会落库。
  - ⚠️ **Ads `GOOGLE_ADS_API_VERSION` 默认 `v24.1` 待核对** —— Google Ads REST 路径通常是 `vNN`(无 `.1`),版本不对会 404,接 Ads 前按账号实际可用版本改 `.env`。
  - `server/src/routes/ga4.js` 是只读概览端点(从库读已同步数据),非同步逻辑。
- `seo_weeks` / `sem_weeks` 当前**主要依赖人工录入**,无自动同步。
- **前端图表存在「无数据时显示内置示例」的问题**(`public/index.html` 约 1745 行),必须后续修复 —— 会冒充真实趋势。
- **时间筛选目前只停留在前端变量**(`window._timeRange`),**未真正传后端重算**,KPI/询盘/总览不受所选区间影响。
- **目前没有自动诊断规则引擎**(机会词/衰退页/CTR 异常/蚕食/高花费零有效等全靠人工)。
- **AI 目前是单 provider**,仅通过 Anthropic(`server/src/services/anthropic.js`)。

## Low Token Working Rules

- 每次任务**先读取 `CLAUDE.md`**。
- **不要全项目扫描**,除非用户明确要求。
- 只读取**当前任务相关文件**。
- 不要输出长篇解释。
- 不要贴完整代码。
- **每次只做一个阶段**(见 `ROADMAP.md`)。
- **修改前先列涉及文件**。
- 修改后只输出:**修改摘要 + 测试结果 + TODO**。
- 不要重复解释已确认过的项目背景。
- **大文件(如 `public/index.html`)优先用搜索定位**,不要整文件反复读取。

## Development Rules

- 先分析再修改。
- 小步开发,不要无理由重构。
- **不要为了 UI 炫酷牺牲数据可信度。**
- 真实模式下**不能展示 demo 数据**。
- **API 失败必须显示失败原因**(未接入 / 需配置什么 / 失败原因 / 最近同步时间 / 重试)。
- 数据建议必须能**追溯到数据证据**。
- AI 建议必须**结构化**,不能只是漂亮文字。
- 任务必须能被**复盘验证**。
- 修改后运行相关检查。

## Security Rules

- **不提交 `.env`**。
- **不提交 token、密码、API key**。
- **不把 OAuth client secret、Google Ads developer token、服务器密码写入代码**。
- 密钥只存**服务器环境变量**或**加密存储**(参考 `integrations.js` 的 AES 方案)。
- **前端不能直接接触密钥。**
- 所有**用户输入和 API 返回文本**渲染前必须 **escape**。
- **谨慎使用 `innerHTML`**(当前前端 47 处,属 XSS 高风险面)。

## 协作流程约定

- 修改本地源文件 → 跑必要检查 → commit → push(GitHub: `cassianlee-digital/ferr-ops`,凭据走本机 GCM)。
- **不操作服务器、不索要服务器密码。** 部署由用户在服务器侧执行,Claude 只提供部署指令。
- **项目真实路径:`E:\Claude Code`**(E 盘卷标为「资料」,非目录)。
