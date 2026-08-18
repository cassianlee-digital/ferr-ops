# AGENTS.md — ferr-ops

> 每次会话先读本文件。它固定了项目的**真实状态**,避免重复扫描、重复解释、把占位功能误当已完成。

## Project Purpose

ferr-ops 是公司内部 **SEO / SEM 运营指挥中心**,目标是完成完整闭环:

> 数据记录 → 数据观察 → 数据分析 → 优化建议 → 任务执行 → 结果验证 → 周报复盘 → SOP 沉淀。

**这个后台不是展示花瓶,而是团队日常运营的主战场。** 每条建议必须能追溯到数据,每个任务必须能验证结果。

## Current Architecture

- **后端不是单文件**:Fastify,模块化良好。
  - `server/src/routes/`(模块化路由)、`server/src/db/migrate.js`(迁移/建表)、`server/src/db/repositories/`(数据访问层)、`server/src/services/`(业务/AI/加密/验收)、`server/src/sync/`(第三方真实同步)。
- 前端页面骨架仍在 `public/index.html`,但主要业务逻辑已逐步拆入 `public/src/` ES 模块,样式也按页面拆分；修改模块后需运行 `npm run build:web`。
- **已有真实表 + CRUD 的模块**:询盘、KPI、关键词、否词、广告创意、整改(fixes)、复盘(weekly_reports/loop_items)、内容资产(content_assets)、seo_weeks、sem_weeks 等。
- `server/src/routes/overview.js` 已聚合**真实** KPI(月度快照 + 环比)。
- `server/src/services/aiContext.js` 会拼接数据库中的 **KPI、询盘、SEO/SEM 周报、关键词**等真实上下文喂给 AI。
- `server/src/db/repositories/integrations.js` 对密钥做 **AES 加密**存储,**绝不返回前端**。
- `server/src/db/seed.js` 只插入**用户 / KPI / 市场调研**,**不注入假业务数据**。

## API / Sync Reality(真实状态,禁止把未验收描述成已通过)

- **GSC 真实同步已实现**:每日汇总与搜索词/页面明细写入事实表。
- **GA4 真实同步已实现**:每日汇总、维度、广告系列和事件级事实可供 Hermes 与看板使用；GA4 事件不冒充 CRM 有效询盘。
- **Google Ads 真实同步已实现**:广告系列、关键词和 `search_term_view` 搜索词明细分别入库；否词/Hermes 不再用关键词数据冒充搜索词。
- `seo_weeks` / `sem_weeks` 仍保留人工周报录入,与 Google 事实表是不同口径,不得混为同一来源。
- 真实模式无数据时显示诚实空状态或失败原因,不使用内置示例冒充趋势。
- 时间范围已贯通 KPI、总览、询盘、GSC、Ads、GA4、周报和图表；快速切换有过期响应保护。
- 自动诊断规则已覆盖机会词、衰退页、关键词蚕食和高花费零有效搜索词等真实数据场景。
- AI Provider 支持 Anthropic 与 OpenRouter；前端不接触密钥。
- `npm run verify:production` 提供生产验收工具；只有 `NODE_ENV=production` 且显式 `--live` 才执行真实探测、三源同步和备份恢复验证。
- 最近一次生产 `--live` 验收会脱敏保存到 `meta`,后台“风险清单”将当前静态检查与最近生产实测合并展示。
- **截至当前工作区状态,生产服务器尚未执行本轮 `--live` 验收**,因此不能声称生产接入、OAuth、真实同步和备份恢复已通过。

## Low Token Working Rules

- 每次任务**先读取 `AGENTS.md`**。
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
- **谨慎使用 `innerHTML`**；新增动态页面优先使用 DOM API + `textContent`,并由 CSP/XSS 测试守住边界。

## 协作流程约定

- 修改本地源文件 → 跑必要检查 → commit → push(GitHub: `cassianlee-digital/ferr-ops`,凭据走本机 GCM)。
- **不操作服务器、不索要服务器密码。** 部署由用户在服务器侧执行,Codex 只提供部署指令。
- **项目真实路径:`E:\Claude Code`**。
