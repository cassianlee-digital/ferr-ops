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

- **Google 同步已上线运行:GSC/GA4/Ads 三源均已授权,2026-06-30 首次同步成功并拉到真实数据(已逐源核验落库)。**
  - OAuth 授权/回调/刷新/撤销:`server/src/sync/googleClient.js`。
  - GSC 同步:`server/src/sync/gsc.js`(每日 + query/page)。GA4 同步:`server/src/sync/ga4.js`(每日 + 来源/国家/设备/落地页)。Ads 同步:`server/src/sync/ads.js`(campaign + keyword)。
  - 路由 `/api/sync/*`、`/api/google/*` 已在 `server/src/routes/index.js` 注册;数据表 `gsc_*`/`ga4_*`/`google_ads_*`/`google_oauth_*`/`google_sync_runs`/`google_projects` 已在 `migrate.js`;前端状态/连接/同步在 `public/google-projects.js`。授权在生产站由 boss/manager 走 OAuth 同意页完成(redirect_uri 为生产域名,localhost 无法回调)。
  - `GOOGLE_ADS_API_VERSION=v24.1` 在生产账号**实际可用**(Ads 同步已成功),非问题。
  - `server/src/routes/ga4.js` 是只读概览端点(从库读已同步数据),非同步逻辑。
  - **定时自动同步已上线**:`server/src/sync/scheduler.js` 进程内调度,每日 UTC `SYNC_DAILY_HOUR_UTC`(默认 5)点同步三源 + 启动补跑(最近成功同步过期才补);`SYNC_AUTO=false` 可关。仍保留手动「立即同步」/`POST /api/sync/<provider>`。
  - 已知小缺口:① GA4 落地页维度未取 conversions 指标,`landingPages[].conversions` 恒为 null;② GSC 有 ~2 天数据延迟,默认 7 天区间通常只回 6 天。
- `seo_weeks` / `sem_weeks` 当前**主要依赖人工录入**,无自动同步。
- **SEO 看板「概览」已升级为富看板(Looker 风格)**:顶部卡/趋势读 `/api/google/gsc/summary`(`loadSeoBoardGsc`);其余读 `/api/google/seo/board`(`loadSeoBoardFull`,后端 `routes/google.js` + `googleSync.js` 的 `gscBoardTables/gscScatter/ga4SourcesRange/ga4SourceSeries`)——**本周要点条**(后端 `buildSeoHighlights` 自动挑最大涨跌,绿涨红跌)、落地页表+关键词表带彩色Δ环比、**机会词散点象限**(ECharts 展现×排名+中位线)、GA4 来源甜甜圈+按天堆叠面积。均随时间范围重拉。第二期(需扩 GA4 同步)才能做:跳出率散点、来源级跳出/时长、date×source×page 明细。
- **SEM 看板「概览」已升级为富看板**:顶部卡读 `/api/google/ads/summary`(`loadSemBoardAds`);其余读 `/api/google/ads/board`(`loadSemBoardFull` + 后端 `adsBoardTables/adsScatter/adsSeries` + `buildAdsHighlights`)——本周要点条(转化涨绿/每转化成本涨红/高花费零转化合计/最烧钱零转化词/最佳系列)、系列表+关键词表带转化Δ+评估徽章、**花费×转化散点**(右下红区=高花费低转化=该砍,红点标关键词+下方「该砍」清单带诊断/采纳)、系列花费甜甜圈+每日花费/转化趋势。评估徽章按 有转化/零有效/无花费;金额按账户币种、不臆造符号。旧层级表已被 Δ 表替代。
- **询盘归因已上线**:`/api/attribution`(`server/src/routes/attribution.js`)按 `channel`(SEO自然/SEM付费/直接/其他,与 `renderInqDonuts` 同口径)+ `grade`(A/B=有效)聚合区间询盘 × Ads 花费,算 SEM **真实每有效询盘成本**并对比 Ads 自报每转化(差距≥1.3倍红字警示"Ads 转化虚高")。前端 SEM 看板顶部「真实询盘回报」卡(`loadAttribution`),随时间范围重算。这是"花的钱值不值"的真实答案,打通 询盘↔花费。
- 时间范围现影响:询盘、SEO 看板(GSC)、SEM 看板(Ads)、诊断、询盘归因;GA4 概览与总览暂未跟随。
- **诊断引擎已上线**:`/api/diagnostics`(`server/src/routes/diagnostics.js` + `googleSync.js` 规则查询)产出 4 类真实 findings——机会词(排名11-20有曝光)、关键词蚕食(同词多页)、流量衰退(当前vs上一等长窗口点击跌幅)、高花费零有效(Ads cost>0 conv=0)。前端 SEO「站点机会/流量衰退/关键词蚕食」三子面板 + minitab 角标已读真实结果,随时间范围重算。**尚未做 CTR 异常规则。**
- **诊断→整改闭环已通**:三类 SEO finding 每行「采纳」按钮 → POST `/api/fixes`(source=诊断引擎,evidence 记 GSC 依据)直接入整改清单(`public/charts.js` `adoptFinding`)。
- **AI 上下文已含真实同步数据**:`aiContext.js buildContext` 注入 GSC/Ads 近30天汇总 + Top系列 + 机会词/蚕食/衰退/高花费零有效。SEM 看板「问题分析/优化思路/关键词排查」及所有 AI 按钮据此产出基于真实数据的分析。
- **AI 弹窗能力**:分析按 `scope_key` 持久化(`ai_analyses`);弹窗顶部**历史时间线**可点切换对比(`history_json` 快照,重跑旧结论不丢不归档),footer「重新分析」按本页最新数据重跑、「拆成整改动作」(`/api/ai/analyses/:id/actions`)把结论拆成动作逐条「采纳」入整改。`max_tokens` 默认 4000(.env 显式值会覆盖)。
- **仍残留的 demo 假数据:** 整改清单 AI 框两条写死建议(`index.html` 约 348-349);GA4 看板与总览部分 mini 图仍空状态。
- **时间筛选目前只停留在前端变量**(`window._timeRange`),总览/KPI 仍不受区间影响(询盘/SEO/SEM/诊断已真正按区间重算)。
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
