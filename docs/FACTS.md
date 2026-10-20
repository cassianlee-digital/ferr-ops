# 仓库现状清单

> **自动生成，不要手改。** 生成命令：`node server/scripts/projectFacts.mjs --write`（在仓库根目录）。
> 这份清单和代码对不上时，提交前的测试会失败并提示这条命令。
> 每行的说明取自那个文件开头的第一句注释：想改说明，去改文件的第一行注释。

## 后端路由（37）

`server/src/routes/`

| 文件 | 说明 |
|---|---|
| `adCreatives.js` | 广告创意库 API（FR-7）。 |
| `ai.js` | AI 分析 API：发起分析、按 scope 存取历史、追问、采纳 / 归档、把结论拆成整改动作。 |
| `attachments.js` | 通用图片附件 API。 |
| `attribution.js` | 询盘归因：把真实询盘(按渠道)与 Ads 花费打通，算「真实每有效询盘成本」+ 对比 Ads 自报转化。 |
| `audit.js` | 周度审核 API：审核包（页面读它）、导出（JSON / XLSX / CSV）、AI 审核意见。 |
| `contentAssets.js` | 内容资产 API。 |
| `dailyPlan.js` | 日计划回放：某一天（不一定是今天）三列上到底有什么、谁有交代。 |
| `dataFreshness.js` | 数据新鲜度：一次返回 GSC/GA4/Ads 三源在所选区间内的 实际有数据天数 + 区间总天数 + 最后同步时间 + 连接态。 |
| `dataSources.js` | 数据源状态 API：各数据来源（人工录入 / Google 同步 / AI）现在接没接上、最近一次数据是什么时候。 |
| `diagnostics.js` | 诊断引擎路由：基于已同步真实数据跑规则，返回结构化 findings（机会词/蚕食/衰退/点击率偏低/高花费零有效）。 |
| `executionLoops.js` | Execution 闭环 CRUD（Phase 5A）。 |
| `fixes.js` | 整改清单 API（FR-6/10）+ 归档地基（state/archived/deleted）。 |
| `ga4.js` | GA4 概览 API（只读）：从库里读已同步的 GA4 数据，不触发同步。 |
| `geo.js` | GEO 概览 API：AI 引擎带来的流量与询盘。 |
| `google.js` | Google 项目与授权、以及 SEO / SEM 看板的数据 API（都读已同步落库的数据）。 |
| `hermes.js` | （没有写说明） |
| `hermesActions.js` | （没有写说明） |
| `index.js` | 业务路由聚合器。 |
| `inquiries.js` | 询盘 API（FR-1）。 |
| `inquiryLeads.js` | 表单线索 API：独立站询盘表单 → 后台。 |
| `keywords.js` | 关键词库 API（FR-9 / V7）。 |
| `kpi.js` | KPI 目标/评分 API（FR-4）。 |
| `loopItems.js` | 闭环条目 API（FR-10）：月度计划/测试登记/沉淀表/任务看板 + 归档地基（state/archived/deleted）。 |
| `market.js` | 市场分析 / AI 记忆体路由。 |
| `negKeywords.js` | 否词库 API（FR-7）。 |
| `overview.js` | 总览数据：公司评分 + 询盘汇总 + 与上月环比。 |
| `rankSnapshots.js` | 排名快照 API（FR-8）。 |
| `risks.js` | 风险清单 API（只读）：当前配置检查与最近一次生产验收的合并结果。 |
| `semWeeks.js` | SEM weekly report API. SEM role can write; signed-in users can read. |
| `seoWeeks.js` | SEO weekly report API. SEO role can write; signed-in users can read. |
| `settings.js` | 设置页 · 第三方 API 密钥（GSC / GA4 / Ads）。 |
| `siteReturns.js` | 按站点的广告花费与询盘 API，以及「广告系列归到哪个站点」的指定。 |
| `sop.js` | SOP 引擎 API（Step A）：定义增删改查 + 完成记录读写。 |
| `spend.js` | 投入台账 API：外链台账、其它支出台账、「钱花在哪」汇总。 |
| `sync.js` | 手动触发 Google 同步的 API（GSC / GA4 / Ads）与同步运行记录。 |
| `taskCheckins.js` | 跨天任务每日推进打卡 API。 |
| `weeklyReports.js` | 复盘周报 API。 |

## 后端服务（规则与业务逻辑）（44）

`server/src/services/`

| 文件 | 说明 |
|---|---|
| `aiAttachments.js` | AI 对话的附件：清洗上传的文件、把解析出的文字拼成提示词片段，带数量与长度上限。 |
| `aiContext.js` | 基于数据库实时数据组装 AI 上下文，保证建议「基于本周真实数据」。 |
| `aiEngines.js` | AI 引擎来源识别（纯函数）。 |
| `aiProvider.js` | AI 提供方的统一入口：读取配置（OpenRouter / Anthropic 二选一）、超时控制、把错误翻成可以给用户看的原因。 |
| `anthropic.js` | AI 文本生成客户端。 |
| `attribution.js` | 询盘归因的纯计算：channel 分类 + 按渠道聚合 + SEM「真实每有效询盘成本」。 |
| `auditAi.js` | 周度 AI 审核：把审核包交给 AI，让它按人写审核意见（纯函数：组装提示词、解析回答； |
| `auditExport.js` | 周度审核包 → 一组二维表（纯函数）。 |
| `auditPackage.js` | 周度审核包：一段日期（通常是一周）里，某个人或整个部门「做了什么、证据在哪、数据变没变、钱花在哪、询盘怎么样」。 |
| `auditRules.js` | 周度审核的规则（纯函数，不碰数据库）：一条任务在这个区间里算什么状态、有哪些该被问到的疑点。 |
| `crypto.js` | AES-256-GCM 对称加密，用于把设置页填入的第三方 API 密钥 / Google OAuth token 加密后存库。 |
| `ctrAnomaly.js` | 诊断规则：点击率偏低（纯函数，不碰数据库）。 |
| `derive.js` | 派生指标计算（后端权威）。 |
| `documentParser.js` | 把上传的文档（xlsx / csv / 文本等）解析成有长度上限的纯文字，供 AI 读取。 |
| `exporters.js` | 表格导出：CSV 与 XLSX（纯函数，零依赖）。 |
| `geo.js` | GEO（生成式引擎优化）的流量口径（纯函数，不碰数据库）。 |
| `geoChecks.js` | GEO 引用抽查的规则（纯函数，不碰数据库）。 |
| `geoData.js` | GEO 概览的数据组装：AI 引擎流量（GA4）+ AI 引擎带来的询盘 / 线索 + 最近一轮人工引用抽查。 |
| `hermesActions.js` | （没有写说明） |
| `hermesBrain.js` | Hermes 运营大脑（业务逻辑层）：诊断卡引擎 + 企业长期记忆 + 每日运营学习沉淀。 |
| `hermesEvidence.js` | （没有写说明） |
| `hermesMemoryPolicy.js` | （没有写说明） |
| `hermesPrompt.js` | （没有写说明） |
| `hermesStatus.js` | （没有写说明） |
| `inquirySource.js` | 询盘来源的规则（纯函数，不碰数据库）。 |
| `inquirySourceData.js` | 询盘来源对账的数据组装：拿一批询盘的来源词，去已同步的 Ads / GSC 点击数据里找证据。 |
| `kpi.js` | KPI 评分（后端权威）+ 由运营数据回写实际值。 |
| `kpiLedger.js` | 运营总账（业务结果漏斗）：花了多少钱 → 带来多少询盘 → 多少优质(A/B) → 多少成交 → 效率如何。 |
| `kpiReview.js` | 月度绩效考核（老板《2026 运营部绩效考核表》口径）—— 评分引擎。 |
| `linkCheck.js` | 外链存活核查：去外链所在的页面上看一眼，指向我们的那条链接还在不在、是什么属性。 |
| `linkCheckBatch.js` | 外链的定时批量核查。 |
| `marketBrain.js` | 市场 AI 记忆体：MD5 状态检测 + 缓存摘要 + 注入。 |
| `productionReadiness.js` | 生产验收：静态检查配置与数据证据； |
| `riskRegister.js` | 风险清单的组装：把当前的静态检查和最近一次生产实测合成一份带严重程度与下一步的清单。 |
| `siteReturns.js` | 按站点看「花了多少广告费、带来几条询盘」（纯函数，不碰数据库）。 |
| `sites.js` | 站点的规则（纯函数，不碰数据库）。 |
| `sopDuplicate.js` | SOP 执行流水的「同一条证据被记了两次」软提醒。 |
| `sopStats.js` | SOP 执行率的统计。 |
| `spend.js` | 投入台账的规则（纯函数，不碰数据库）：外链与其它支出的字段校验，以及「钱花在哪」的汇总。 |
| `taskAudit.js` | 可审计任务的规则（纯函数，不碰数据库 —— 可被 node --test 直接 import）。 |
| `taskAuditData.js` | 可审计任务的数据组装：给任务行补上关联键、证据截图、是否重要。 |
| `taskEffect.js` | 任务完成前后的数据对比（纯函数，不碰数据库）。 |
| `taskEffectData.js` | 任务前后对比的数据组装：按任务的关联键去同步表里取两个窗口的数，交给 taskEffect.js 的规则算。 |
| `verifiedAiAnswer.js` | 带证据核验的 AI 回答：结论引不出证据就降级为待验证，只做一次有界的纠偏重试。 |

## 数据访问层（38）

`server/src/db/repositories/`

| 文件 | 说明 |
|---|---|
| `adCreatives.js` | 广告创意库数据访问层。 |
| `adsCampaignSites.js` | 广告系列归到哪个站点（人指定）的数据访问层，以及给「建议归属」用的表单证据。 |
| `aiAnalyses.js` | AI 分析结果的数据访问层：按 scope 存一份当前结论，重跑时旧结论进历史。 |
| `attachments.js` | 通用附件（图片）数据访问层。 |
| `backlinks.js` | 外链台账数据访问层。 |
| `contentAssets.js` | 内容资产数据访问层。 |
| `executionLoops.js` | SEO/SEM 运营问题闭环（Execution KPI 真实数据源）。 |
| `expenses.js` | 其它支出台账数据访问层（广告费在 Ads 同步表、外链费在 backlinks，这里只记其余的钱）。 |
| `fixes.js` | 整改清单数据访问层 + 归档地基（state/archived/deleted）。 |
| `geo.js` | GEO 取数：GA4 会话来源、带表单证据的询盘、表单线索。 |
| `geoChecks.js` | GEO 引用抽查数据访问层：固定题库 + 每轮抽查记录。 |
| `googleSync.js` | Google 同步的数据访问层：项目与授权令牌、GSC / GA4 / Ads 事实表的写入，以及看板和诊断用的查询。 |
| `hermesActions.js` | （没有写说明） |
| `hermesConversations.js` | （没有写说明） |
| `hermesMemories.js` | （没有写说明） |
| `inquiries.js` | 询盘数据访问层。 |
| `inquiryLeads.js` | 表单线索数据访问层：独立站询盘表单提交后带着来源参数进来的原始记录。 |
| `inquirySalesNotes.js` | 业务反馈（业务员针对某条询盘发回来的一段话 + 若干张图）数据访问层。 |
| `inquirySource.js` | 询盘来源对账用的批量查询：一批来源词在一段日期里的点击命中、数据源的同步覆盖。 |
| `integrations.js` | 第三方集成密钥数据访问层（密钥 AES 加密存储，永不明文返回前端）。 |
| `keywords.js` | 关键词库数据访问层。 |
| `kpi.js` | KPI 目标/实际 数据访问层。 |
| `kpiReviewTargets.js` | 月度绩效考核目标（老板《2026 运营部绩效考核表》「目标设置」页口径）数据访问层。 |
| `kpiSnapshots.js` | KPI 考核期冻结快照（Phase 5C）。 |
| `loopItemChanges.js` | 任务改动流水的数据访问层。 |
| `loopItems.js` | 闭环条目数据访问层（plan/test/deposit/task）+ 归档地基（state/archived/deleted）。 |
| `marketBrain.js` | 市场 AI 记忆体（单行 id=1）数据访问层。 |
| `marketResearch.js` | 市场分析问卷数据访问层（P2 表格化填充； |
| `negKeywords.js` | 否词库数据访问层。 |
| `rankSnapshots.js` | 排名快照数据访问层。 |
| `semWeeks.js` | SEM weekly reports repository. |
| `seoWeeks.js` | SEO weekly reports repository. |
| `snapshots.js` | 月度快照数据访问层（总览环比用）。 |
| `sop.js` | SOP 引擎数据访问层（定义 + 完成记录）。 |
| `taskCheckins.js` | 跨天任务的每日推进打卡（task_checkins）。 |
| `taskEffect.js` | 任务前后对比用的窗口聚合查询：某个页面 / 关键词 / 广告系列在一段日期里的同步数据。 |
| `taskLinks.js` | 任务关联键数据访问层：任务 ↔ 页面 / 广告系列 / 关键词 / KPI。 |
| `weeklyReports.js` | 复盘周报数据访问层。 |

## 第三方同步（7）

`server/src/sync/`

| 文件 | 说明 |
|---|---|
| `ads.js` | Google Ads 同步：广告系列、关键词、搜索词三类日数据落库。 |
| `ga4.js` | GA4 同步：每日汇总、按来源 / 国家 / 设备 / 落地页的维度数据、事件数据落库。 |
| `googleClient.js` | Google 接口的公共部分：OAuth 授权与令牌刷新、项目配置解析、带鉴权的请求、日期区间归一。 |
| `googleDiscovery.js` | 从已授权的谷歌账号里列出「能选的」Search Console 资源和 GA4 媒体资源，给「添加站点」当候选，省得手敲编号敲错。 |
| `gsc.js` | Search Console 同步：每日汇总与「查询词 × 页面」明细落库。 |
| `scheduler.js` | 谷歌数据定时自动同步（进程内调度）。 |
| `syncSites.js` | 多站点同步的编排：每天把所有启用的站点都同步一遍； |

## 前端 ES 模块（打包进 dist/bundle.js）（50）

`public/src/`

| 文件 | 说明 |
|---|---|
| `ai.js` | AI 协同（ES 模块 · 服务端分析记录 + 对话框）。 |
| `app.js` | 应用组装层（ES 模块 · esbuild 打包为 IIFE，由 main.js **最后** import）。 |
| `archive.js` | 归档②：行级归档/沉淀委托 + 归档页加载（ES 模块 · esbuild 打包为 IIFE）。 |
| `attachments.js` | 图片附件：选图 → 前端压缩 → 上传 → 缩略图 / 大图预览 / 删除。 |
| `audit.js` | 周度审核页（行动中心 → 周度审核，2026-10-10）。 |
| `catalog.js` | 询盘的「可选值目录」——产品 / 大区 的唯一真相（2026-09-20 新增）。 |
| `change-log.js` | 改动流水弹框：询盘（渠道 / 等级 / 日期…）和任务（内容 / 日期 / 工时 / 结果…）共用这一个。 |
| `charts.js` | 图表与数据看板层（ES 模块 · esbuild 打包为 IIFE）。 |
| `closed-loop.js` | 运营闭环引擎（ES 模块 · esbuild 打包为 IIFE）。 |
| `editable.js` | Shared helpers for contenteditable fields. |
| `execution.js` | Execution 验证闭环明细（Phase 5A · 新写 ES 模块，零内联 handler，事件委托）。 |
| `ga4-view.js` | GA4 流量看板（ES 模块 · esbuild 打包为 IIFE）。 |
| `geo-checks.js` | GEO 引用抽查（数据看板 → GEO 抽查，2026-10-10）。 |
| `geo.js` | 总览页的 GEO 卡（2026-10-10）：AI 引擎带来的流量与询盘。 |
| `google-projects.js` | Google 接入 / 数据源状态（ES 模块 · esbuild 打包为 IIFE）。 |
| `hermes-memory.js` | Hermes 长期记忆管理页（ES 模块 · esbuild 打包为 IIFE）。 |
| `inquiries.js` | 询盘录入（真实弹框 + 持久化）+ 询盘列表加载（ES 模块 · esbuild 打包为 IIFE）。 |
| `inquiry-attribution.js` | 询盘的确认权与改动留痕（前端这一半； |
| `inquiry-data.js` | 询盘列表的取数。 |
| `inquiry-globe.js` | Inquiry distribution world map（ES 模块 · esbuild 打包为 IIFE）。 |
| `inquiry-sales.js` | 询盘表的「业务反馈」列（2026-09-20 新增）。 |
| `inquiry-source.js` | 询盘来源（2026-10-10）：来源格里的对账徽章、来源详情弹框、表单线索收件箱。 |
| `keywords.js` | 关键词库（4 类 · 增删改入库 · FR-9）（ES 模块 · esbuild 打包为 IIFE）。 |
| `kpi-periods.js` | 考核期结算与历史（Phase 5C · 新写 ES 模块，零内联 handler，事件委托）。 |
| `kpi-review-admin.js` | 设置 → 月度绩效考核：权重 / 达成率上限 / 出分地板 / 预算容忍带 / 绩效系数分档 / 月度目标。 |
| `kpi-review.js` | 月度绩效考核看板（老板《2026 运营部绩效考核表》口径）。 |
| `kpi-view.js` | KPI 看板渲染（ES 模块 · esbuild 打包为 IIFE）。 |
| `kpi.js` | KPI 引擎 + 周数据（ES 模块 · esbuild 打包为 IIFE）。 |
| `ledger.js` | 运营总账（ES 模块 · esbuild 打包为 IIFE）。 |
| `main.js` | 前端 ES 模块入口（渐进迁移）。 |
| `market-brain.js` | 市场分析（表格化）+ AI 记忆体联动（ES 模块 · esbuild 打包为 IIFE）。 |
| `neg-ads.js` | 否词库 / 广告创意库 录入（ES 模块 · esbuild 打包为 IIFE）。 |
| `plan-history.js` | 日计划回放（ES 模块 · esbuild 打包为 IIFE）。 |
| `plan-tabs.js` | 日计划的赛道切换（ES 模块 · esbuild 打包为 IIFE）。 |
| `rank-snapshots.js` | SEO opportunity keyword rank snapshots and first-to-latest trend display. |
| `risks.js` | 风险清单页：把后端返回的检查结果画出来（全部走 DOM 文本节点，不拼 HTML）。 |
| `settings.js` | Settings page: persisted KPI targets and account password changes. |
| `site-returns.js` | 按站点：广告花费与询盘（数据看板 → SEM 看板，多站点第 3 步）。 |
| `site-scope.js` | 当前看的是哪个站点（多站点第 2 步）。 |
| `sites.js` | 站点管理（设置 → API 接入）：一个谷歌账号下的每个网站各登记一次。 |
| `sop-rate.js` | SOP 执行率（ES 模块 · esbuild 打包为 IIFE）。 |
| `sop.js` | SOP 引擎（ES 模块 · esbuild 打包为 IIFE）。 |
| `spend.js` | 投入台账（2026-10-10）：钱花在哪 —— 广告 / 外链 / 其它支出。 |
| `table-editor.js` | Shared persistence and keyboard behavior for data-field table cells. |
| `tagselect.js` | 彩色标签下拉 tag-select（ES 模块 · esbuild 打包为 IIFE）。 |
| `task-audit.js` | 可审计任务（前端）。 |
| `task-pickers.js` | 任务的优先级 / 日期 / 时刻选择器（ES 模块 · esbuild 打包为 IIFE）。 |
| `timerange.js` | 时间范围筛选（ES 模块 · esbuild 打包为 IIFE）。 |
| `ui-kit.js` | 全站 UI 基础工具（ES 模块 · esbuild 打包为 IIFE）—— 转义 / 弹窗 / toast 的**唯一实现**。 |
| `weekly-review.js` | Weekly/monthly review workspace. |

## 前端经典脚本（不经打包，直接加载）（3）

`public/`

| 文件 | 说明 |
|---|---|
| `api.js` | 统一 REST 调用封装（替代原型里的 window.storage/localStorage）。 |
| `hermes.js` | Hermes / Ferr Ops assistant entry. All operator workflows stay inside ferr-ops. |
| `login.js` | 登录页的表单提交（经典脚本，只在 login.html 加载）。 |

## 样式表（23）

`base.css` · `components.css` · `csp-utilities.css` · `login.css` · `page-archive.css` · `page-audit.css` · `page-content.css` · `page-dashboard.css` · `page-data.css` · `page-deposit.css` · `page-fixes.css` · `page-ga4.css` · `page-inquiry.css` · `page-keywords.css` · `page-kpi.css` · `page-market.css` · `page-review.css` · `page-risks.css` · `page-settings.css` · `page-spend.css` · `page-tasks.css` · `page-test.css` · `styles.css`

## 数据表（54）

`server/src/db/migrate.js`

| 表 | 说明 |
|---|---|
| `ad_creatives` | 广告创意库：标题、描述、点击率、A/B 结论。 |
| `ads_campaign_sites` | 广告系列归到哪个站点：Ads 是一个账户几个站共用、按系列区分，这张表记「这个系列投的是哪个站」（由人指定，不自动推断）。 |
| `ai_analyses` | AI 分析结果：每个 scope 一份当前结论，重跑时旧结论进 history_json。 |
| `attachments` | 通用附件（目前只收图片）。业务发回来的关键词截图 / 聊天记录截图等原始材料。 |
| `backlinks` | 外链台账（2026-10-10）。经理的原话：花钱买的外链要能直接查到是哪一条、值不值； |
| `content_assets` | V7：内容资产 |
| `execution_loops` | Phase 5A：SEO/SEM 运营问题闭环（Problem→Analysis→Action→Verification）。Execution KPI 的真实数据源。 |
| `expenses` | 其它支出台账：广告费从 Ads 同步、外链费在 backlinks，除此之外的钱（工具订阅、内容外包、建站技术…）记这里。 |
| `fixes` | 整改清单：问题、依据、动作、负责人、截止日、状态。 |
| `ga4_daily` | GA4 每日汇总：用户、会话、浏览、关键事件、跳出率、平均时长。 |
| `ga4_dimension_daily` | GA4 按维度的每日数据：来源 / 国家 / 设备 / 落地页 / 广告系列（dimension_type 区分）。 |
| `ga4_event_daily` | GA4 每日事件：事件名、次数、用户数、关键事件数。 |
| `geo_checks` | GEO 引用抽查的每一格结果：某一轮 × 某个问题 × 某个引擎，提没提到、引没引用。 |
| `geo_questions` | GEO 引用抽查（2026-10-10）：AI 回答里有没有提到 / 引用我们，没有接口能自动拿，只能人按固定题库去问。 |
| `geo_rounds` | GEO 引用抽查每一轮定格的题数：题库会变，旧轮次的「应查几题」不能跟着现在的题库变（规矩见 services/geoChecks.js 的 roundExpected）。 |
| `google_ads_campaign_daily` | Google Ads 广告系列每日数据：花费、展示、点击、转化。 |
| `google_ads_keyword_daily` | Google Ads 关键词每日数据。 |
| `google_ads_search_term_daily` | Google Ads 真实搜索词每日数据（用户实际搜的词，不是投放的关键词）。 |
| `google_oauth_states` | Google 授权流程里的一次性 state，用来确认回调确实是自己发起的。 |
| `google_oauth_tokens` | Google 授权令牌（加密存储，绝不返回前端）。 |
| `google_projects` | Google 项目：一组 GSC 站点 / GA4 媒体资源 / Ads 账户的对应关系。 |
| `google_sync_runs` | 每一次同步的运行记录：哪个源、哪段区间、成没成功、写了多少行。 |
| `gsc_daily` | Search Console 每日汇总：点击、曝光、点击率、平均排名。 |
| `gsc_query_daily` | Search Console「查询词 × 页面」每日明细。 |
| `hermes_action_runs` | （没有写说明） |
| `hermes_conversations` | （没有写说明） |
| `hermes_memories` | SOP 引擎（Step A）：定义 + 完成记录 |
| `inquiries` | 询盘：日期、国家、渠道、产品、等级、来源、是否成交，以及渠道 / 等级的确认状态。 |
| `inquiry_feedbacks` | 跟踪反馈改成「多条带时间的记录」（2026-08-27）。 |
| `inquiry_field_changes` | 询盘确认权与改动留痕（2026-10-10 移植自旧分支的设计）。 |
| `inquiry_leads` | 表单线索（2026-10-10）：独立站询盘表单提交时带着来源参数进来的原始记录。 |
| `inquiry_sales_notes` | 业务反馈：业务员针对这条询盘发回来的东西（一段话 + 若干张图）。 |
| `integrations` | V7：第三方集成密钥（AES 加密存储） |
| `keywords` | 关键词库：SEO / SEM / 客户信息等几类共用一张表（type 区分），各类特有的属性存在 attrs 里。 |
| `kpi_config` | KPI 全局参数（出分地板、评分上限、Lead 权重、考核周期等），KV 存储、可在设置页改。 |
| `kpi_period_snapshots` | KPI 绩效重构：正式考核期的冻结快照。改目标/权重不影响已结算的历史期（§29）。 |
| `kpi_review_targets` | 月度绩效考核目标（老板《2026 运营部绩效考核表》的「目标设置」页口径）。 |
| `kpi_targets` | KPI 指标的权重、目标值与实际值（旧版考核表盘与运营总账用；月度绩效考核的目标在 kpi_review_targets）。 |
| `loop_item_changes` | 任务改动流水（2026-10-11）。询盘改渠道 / 等级早就留痕，任务却没有：完成之后还能改标题、把截止日往后挪、 |
| `loop_items` | 闭环条目：任务、月度计划、测试登记、沉淀四种共用一张表（kind 区分）。 |
| `market_brain` | V7：市场 AI 记忆体（单行，id=1） |
| `market_research` | V7：市场分析问卷数据（按 xlsx 表格化；P2 填充） |
| `monthly_snapshots` | V7：月度快照（用于总览环比对比） |
| `neg_keywords` | 否定关键词库。 |
| `rank_snapshots` | 关键词排名快照：哪天、哪个词、排第几、落在哪个页面。 |
| `sem_weeks` | SEM 周数据（人工录入的周报口径，与 Ads 同步的事实表不是一个来源）。 |
| `seo_weeks` | SEO 周数据（人工录入的周报口径，与 GSC 同步的事实表不是一个来源）。 |
| `sop_completions` | SOP 的完成打卡：某条固定任务在某个周期做了没有。 |
| `sop_definitions` | SOP 固定任务的定义：部门、频率（日 / 周 / 月）、标题。 |
| `sop_logs` | SOP 执行流水（2026-10-20）。sop_completions 一个周期只能记一个勾，答得了「做没做」， |
| `task_checkins` | 跨天任务的每日推进打卡。跨天任务（start_date~task_date）在日计划上会连续挂好几天， |
| `task_links` | 任务关联键（2026-10-10）：一条任务指向它动过的页面 / 广告系列 / 关键词，以及它想推动的 KPI。 |
| `users` | 账号与角色（seo / sem / manager / boss）。 |
| `weekly_reports` | V7：复盘周报（每周 × 每部门；四段内容为 JSON 列表） |

## 测试（56）

`server/test/`

| 文件 | 说明 |
|---|---|
| `aiAnalyses.test.js` | AI 分析的持久化：当前结论、历史快照、追问各自的评分都要存得住。 |
| `aiProvider.test.js` | AI 提供方：配置集中读取、未知提供方被拒绝、请求到时限真的会中断。 |
| `attribution.test.js` | 询盘归因：SEM「真实每有效询盘成本」——回答「广告花的钱值不值」，算错会误导预算决策。 |
| `attributionGate.test.js` | 询盘确认权与改动留痕。 |
| `audit.test.js` | 周度审核：任务状态与疑点的规则、审核包、导出（CSV / XLSX / JSON）、AI 审核意见的解析。 |
| `bundleFresh.test.js` | 线上跑的是 public/dist/bundle.js —— 它是手动打包之后提交进仓库的，构建镜像时原样拷贝，不会重新打。 |
| `config.test.js` | 配置：生产环境拒绝缺失 / 默认 / 过短的 JWT 密钥，开发环境保留本地兜底。 |
| `ctrAnomaly.test.js` | 诊断规则「点击率偏低」：排在首页、曝光够多，但点击率不到本站同位次中位数一半的词。 |
| `dateRange.test.js` | 时间范围解析 + 上一等长窗口。 |
| `derive.test.js` | 派生指标纯计算：round / deriveSem / seoWow。 |
| `docsLayout.test.js` | 文档不许悄悄烂掉。 |
| `documentParser.test.js` | 文档解析：xlsx 解析成有上限的文字； |
| `execution.test.js` | Phase 5A Execution：渠道隔离 + 到期区间过滤（DB 级）。 |
| `frontendApi.test.js` | 前端 api.js：调用签名不变、请求卡住时会中断并给出稳定的超时错误。 |
| `frontendDataIntegrity.test.js` | 前端数据完整性：各页面取数带自己的时间范围、过期响应被丢弃、表格改动不被重画冲掉等（多为对源码结构的断言）。 |
| `frontendHtmlSinks.test.js` | 前端每一个「进入 HTML 的表达式」都必须可证明安全（规则见 server/scripts/auditHtmlSinks.mjs 文件头）。 |
| `frontendXss.test.js` | 前端结构与注入面：模块边界和加载顺序、没有内联事件与内联样式、动作按钮经事件委托。 |
| `ga4Sync.test.js` | GA4 同步：重复同步不产生重复行、某个报表失败时保留旧数据、概览返回看得懂的标签。 |
| `gateInstalled.test.js` | 提交前门禁（.githooks/pre-commit）装上了没有。 |
| `geo.test.js` | GEO：AI 引擎带来的流量与询盘。 |
| `geoChecks.test.js` | GEO 引用抽查：固定题库 + 每轮记录。 |
| `googleAdsSearchTerms.test.js` | Ads 搜索词同步：取的是真实搜索词视图、重复同步不重复落库、候选否词排除已否掉的。 |
| `googleHighlights.test.js` | 看板「本周要点」：只陈述汇总事实，不把相关性写成原因。 |
| `hermesEvidence.test.js` | （没有写说明） |
| `hermesMemoryPolicy.test.js` | （没有写说明） |
| `hermesPrompt.test.js` | （没有写说明） |
| `hermesStatus.test.js` | （没有写说明） |
| `inquiryFeedback.test.js` | 跟踪反馈：一条询盘多条带时间的记录（2026-08-27 改版）。 |
| `inquirySite.test.js` | 询盘和表单线索认得出是哪个站点来的。 |
| `inquirySource.test.js` | 询盘来源：表单线索接收、线索转询盘、手填来源的对账。 |
| `kpi.test.js` | KPI 评分：整个后台「公司分/李分/陈分」的权威算法。 |
| `kpiLedger.test.js` | 运营总账：老板年终看的那张「花钱→询盘→优质→成交→效率」表。 |
| `kpiReview.test.js` | 月度绩效考核（老板《2026 运营部绩效考核表》口径）评分引擎单测。 |
| `linkCheck.test.js` | 外链存活核查。 |
| `linkCheckBatch.test.js` | 外链的定时批量核查：轮到谁、查完怎么记、「上次还在这次没了」怎么标。 |
| `middleware.test.js` | 权限矩阵回归测试。 |
| `migrateUpgrade.test.js` | 升级不丢数据。 |
| `productionReadiness.test.js` | 生产验收工具：静态检查不冒充实测、不泄露密钥； |
| `projectFacts.test.js` | 文档里的「事实」不许过期。 |
| `riskRegister.test.js` | 风险清单：生产实测结果脱敏后原子保存； |
| `routes.test.js` | 路由层冒烟测试。 |
| `settle.test.js` | Phase 5C 考核期冻结：结算快照后，改目标不改历史（§29）。 |
| `sitePlugin.test.js` | 独立站那一侧的 WordPress 插件（integrations/wordpress/ferr-intake）：浏览器里记来源的脚本 + 服务器上往后台发的 PHP。 |
| `siteReturns.test.js` | 按站点看「花了多少广告费、带来几条询盘」。 |
| `sites.test.js` | 多站点：一个谷歌账号下的几个网站各是一个「站点」。 |
| `sopEngine.test.js` | SOP 引擎 v2：执行流水（一次执行一行）+ 周配额口径。 |
| `spend.test.js` | 投入台账：外链 / 其它支出 / 「钱花在哪」汇总。 |
| `taskAudit.test.js` | 可审计任务的规则：重要性判定、完成门槛、证据与关联键的合法性。 |
| `taskAuditRoutes.test.js` | 可审计任务 · 路由层：完成门槛、关联键、重要标记、证据截图。 |
| `taskChanges.test.js` | 任务的改动留痕与日期校验。 |
| `taskEffect.test.js` | 任务完成前后的数据对比。 |
| `taskEffectSites.test.js` | 多站点下的「任务完成前后数据对比」：关联的页面是哪个站的，就去哪个站的数据里找。 |
| `timeRangeIntegration.test.js` | 时间范围端到端契约：KPI、总览、询盘必须消费同一日期口径，且只读查询不能污染共享快照。 |
| `updateHelper.test.js` | updateById：7 个仓库共用的「按白名单部分更新」helper。 |
| `verifiedAiAnswer.test.js` | AI 回答的证据核验：没有证据的数据结论降级为待验证； |
| `weeklyReportKey.test.js` | 周报的周 / 月标识会原样出现在所有人的周报页上，所以只收固定的几种写法。 |

## 工具脚本（3）

`server/scripts/`

| 文件 | 说明 |
|---|---|
| `auditHtmlSinks.mjs` | 前端 HTML 注入面审计。 |
| `projectFacts.mjs` | 生成 docs/FACTS.md：仓库里「现在有什么」的清单 —— 路由、服务、数据访问、前端模块、数据表、测试、环境变量。 |
| `verify-google-e2e.mjs` | 对着一个已部署的环境走一遍 Google 相关接口的端到端检查（用环境变量给地址和账号，不含任何密钥）。 |

## 代码会读的环境变量（52）

`AI_HEALTH_TIMEOUT_MS` · `AI_PROVIDER` · `AI_REQUEST_TIMEOUT_MS` · `ANTHROPIC_API_KEY` · `ANTHROPIC_BASE_URL` · `ANTHROPIC_MAX_TOKENS` · `ANTHROPIC_MODEL` · `BACKLINK_AUTO_CHECK` · `BACKLINK_CHECK_BATCH` · `BACKLINK_CHECK_HOUR_UTC` · `BACKLINK_CHECK_PAUSE_MS` · `BACKLINK_CHECK_STALE_DAYS` · `CONFIRM_RESET` · `COOKIE_SECURE` · `DB_FILE` · `GA4_PROPERTY_ID` · `GOOGLE_ADS_API_VERSION` · `GOOGLE_ADS_CUSTOMER_ID` · `GOOGLE_ADS_DEVELOPER_TOKEN` · `GOOGLE_ADS_LOGIN_CUSTOMER_ID` · `GOOGLE_OAUTH_CLIENT_ID` · `GOOGLE_OAUTH_CLIENT_SECRET` · `GOOGLE_OAUTH_REDIRECT_URI` · `GSC_SITE_URL` · `HERMES_DAILY_LEARNING_AUTO` · `HERMES_HEALTH_CACHE_MS` · `HERMES_HEALTH_CHECK_INTERVAL_MS` · `HERMES_SHARED_SECRET` · `INQUIRY_INTAKE_SECRET` · `JWT_SECRET` · `LOGIN_RATE_LIMIT_MAX` · `LOGIN_RATE_LIMIT_WINDOW_MS` · `NODE_ENV` · `NODE_TEST_CONTEXT` · `OPENROUTER_API_KEY` · `OPENROUTER_BASE_URL` · `OPENROUTER_MAX_TOKENS` · `OPENROUTER_MODEL` · `OPENROUTER_VISION_MODEL` · `PORT` · `SEED_BOSS_PASSWORD` · `SEED_CHEN_PASSWORD` · `SEED_LI_PASSWORD` · `SEED_MANAGER_PASSWORD` · `SESSION_HOURS` · `SETTINGS_SECRET` · `SYNC_AUTO` · `SYNC_CATCHUP_ON_START` · `SYNC_CHECK_INTERVAL_HOURS` · `SYNC_DAILY_HOUR_UTC` · `SYNC_STALE_HOURS` · `SYNC_START_DELAY_MS`

每一个的含义见 `.env.example`（测试会检查两边对得上）。
