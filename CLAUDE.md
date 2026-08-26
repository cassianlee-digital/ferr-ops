# CLAUDE.md — ferr-ops

> 每次会话先读本文件。它固定了项目的**真实状态**,避免重复扫描、重复解释、把占位功能误当已完成。

## Project Purpose

ferr-ops 是公司内部 **SEO / SEM 运营指挥中心**,目标是完成完整闭环:

> 数据记录 → 数据观察 → 数据分析 → 优化建议 → 任务执行 → 结果验证 → 周报复盘 → SOP 沉淀。

**这个后台不是展示花瓶,而是团队日常运营的主战场。** 每条建议必须能追溯到数据,每个任务必须能验证结果。

## Current Architecture

- **后端不是单文件**:Fastify,模块化良好。
  - `server/src/routes/`(**30 个路由文件**,2026-08-26 复测:`ls server/src/routes/*.js | wc -l`)、`server/src/db/migrate.js`(迁移/建表)、`server/src/db/repositories/`(数据访问层)、`server/src/services/`(业务/AI/加密)、`server/src/sync/`(第三方同步,见下方真实状态)。
- **前端已不再是单文件,别再按「都挤在 index.html」描述**(2026-07-15 实测):`public/index.html` **1070 行 / 107KB**(2026-08-26 复测,比 8-13 的 1539 行又瘦一圈),**内联 `<style>` 已清零**(CSS 拆为 `base.css`/`styles.css`/`components.css`/`page-*.css`,见 `css-rewrite-plan`)。JS 分两层:**经典脚本只剩 3 个**(`hermes.js`/`api.js`/`login.js` —— 2026-08-26 复测 `ls public/*.js`;charts/inquiries/kpi/ai/closed-loop/weekly-review **以及 `app.js` 本身都已迁进 `public/src/`,别再按老清单找文件**)+ **ES 模块**(`public/src/*.js` → esbuild 打 IIFE 成 `dist/bundle.js`)+ index.html 内联 `<script>`。**两套模块系统并存 = 绞杀式迁移的中间态,加载序是承重的,别随意调 `<script>` 顺序。**
- **已有真实表 + CRUD 的模块**:询盘、KPI、关键词、否词、广告创意、整改(fixes)、复盘(weekly_reports/loop_items)、内容资产(content_assets)、seo_weeks、sem_weeks 等。
- `server/src/routes/overview.js` 已聚合**真实** KPI(月度快照 + 环比)。
- `server/src/services/aiContext.js` 会拼接数据库中的 **KPI、询盘、SEO/SEM 周报、关键词**等真实上下文喂给 AI。
- `server/src/db/repositories/integrations.js` 对密钥做 **AES 加密**存储,**绝不返回前端**。
- `server/src/db/seed.js` 只插入**用户 / KPI / 市场调研**,**不注入假业务数据**。

### 前端全局面与「模块化地板」(2026-07-15 实测,别重新推导)

- **全局面已腰斩:实测 191 名字 / 155 函数**(2026-08-26 活站 iframe 差集,含 vendor;2026-07-15 同口径是 338/302)。降幅主要来自 `app.js` 迁入 ES 模块 —— 它原有 **35 个顶层符号自动是全局**,现在只导出 **4 个**给兼容层(第三刀又从 10 收到 4)。
  - **别用 grep 数 `window.X =` 去估全局面**——经典脚本里顶层 `function foo(){}` **自动就是全局**,根本不写 `window.`。要量就在活站上用 **iframe 差集**量(建空 iframe 取 `Object.getOwnPropertyNames` 做差集)。
- **⚠ 内联 handler 已清零,原「82 个强制全局是模块化地板」的说法已作废**(2026-08-26 实测)。事件委托改造**已经做完**:HTML 属性型 `onclick=`/`onchange=` **0 处**,全站改用 **114 处 `data-ui-action=`**(+ `data-loop-tab`/`data-google-action` 等专用委托)。`public` 下仅剩 **4 处 `onclick=`,且全是 JS 里的 `el.onclick=fn` DOM 属性赋值**(`app.js` toastUndo/toastGo 已随 ui-kit 迁走,现为 `src/app.js` 的 loop-tab 委托 + `google-projects.js` 委托),不是 HTML 字符串里的裸全局调用。**统计口径**:`grep -ro 'on\(click\|change\)=' public --include=*.html --include=*.js | grep -v dist | grep -v vendor`。
- **`public/src/ui-kit.js` 是全站 UI 基础工具的唯一实现**(2026-08-26 新增):`esc`/`renderText`/`mdToHtml`/`openModal`/`closeModal`/`toast`/`toastUndo`/`toastGo`/`showToast`/`hideToast` 从 app.js 搬来。**22 个 ES 模块已全部改为显式 `import { esc, toast } from './ui-kit.js'`,模块侧不再读 `window`**(校验脚本口径:模块里出现这些名字却没 import = 漏网)。收益是**编译期保护**:名字写错 esbuild 当场报错;此前它们是隐式全局,对打包器完全隐形。⚠ **本模块必须保持「无 DOM 也能被 import」**——`table-editor.js` 会被 `node --test` 真实 import,求值期碰 `document` 会让整个测试文件崩(已踩过);故遮罩绑定带 `typeof document` 守卫、toast 系列取不到 `#toast` 就安静退场。
- **`public/src/app.js` 是应用组装层**(2026-08-26 由经典脚本迁入 ES 模块):`STATIC_UI_ACTIONS` 委托表 + 导航 `go()` + `window load` 启动序列 + `applyRoleUi()`。**依赖方向单向**:它 import 21 个业务模块,**没有任何模块 import 它** —— 依赖图顶点,无环。故 `main.js` 里它**必须是最后一个 import**(模块求值期要做 DOM 绑定并注册 window load,等价于原来「bundle.js 之后再加载 app.js」),`Object.assign(window, …, app)` 里也**必须最后合并**(还原它的全局后定义、同名覆盖的语义)。这两条已被 `frontendXss.test.js` 焊死。它调用的 ~90 个模块函数现在**全部编译期校验**,写错 esbuild 当场失败。
- **`Object.assign(window, …)` 兼容层仍要留**,消费者两类:`public/hermes.js`(只读 `window.API`/`ME`/`_curTab`/`esc`/`toast`/`go`/`loadClosedLoop`,全部带 `window.` 前缀且有兜底),以及 `closed-loop.js` 裸调用的 `go`/`chk`/`setPlanningTab`/`setActionTab`。
- **app.js 的导出已从 10 个收到 4 个**(2026-08-26 第三刀):`loadInquiries`→`inquiries.js`(它渲染的三个函数本就在那)、`tableLoadState`→`ui-kit.js`、`renderSparklines`→`keywords.js`、`toggleHier`→`charts.js`(各自唯一调用者所在处);`hydrate`/`applyRoleUi`/`restoreRoute` **无任何外部调用者**,已降为模块私有。**顺带修掉一处设计违背**:`timerange.js` 原本反向调用 `loadInquiries()`,与其文件头写明的「消费者订阅事件」相悖且会成环,现改为 inquiries.js 自己监听 `timerange`(与 kpi-view/ledger 同一模式)。
- **剩下 4 个导出为什么收不掉:真的有环**。`chk` 被 `closed-loop.js` 裸调用、又被 `sop.js` 以 `window.chk` 调用,而它自身要调 `closed-loop` 的 `refreshTaskCols` 和 `sop` 的 5 个函数 —— 放进任一方都成环。`go` 同理:拆 `nav.js` 需 import charts/archive/sop/weekly-review,而这四个都可达 `closed-loop.js`(唯一裸调用 `go` 的模块)。**正解是事件反转**(chk 做完 API 后派发 `taskchanged`,closed-loop/sop 各自订阅刷新;`go` 派发 `tabchange`),就是本项目 `timerange` 已在用的那套 —— 但它改的是任务打卡这类关键路径,要单独排一刀。
- **已知既有缺陷(非重构引入)**:每次切时间范围会发**两个完全相同的** `/api/inquiries` 请求 —— `charts.js` 的 timerange 监听器调 `loadDashboardInq()` 与 `inquiries.js` 的 `loadInquiries()` 各取一次(改造前是 charts 监听 + timerange 直接调,数量口径一样)。要修得让两者共用一次取数。
- **app.js 里仍靠隐式全局解析的只剩 16 个**(已审计,零漏网):`api.js` 的 `API`/`ensureAuth`/`can`/`ME`,以及 `hermes.js` 自己挂 window 的 14 个面板函数(`openHermesPanel`/`sendHermesPrompt` 等)。这两个经典脚本在 `bundle.js` **之前**加载,故运行时一定就绪。
- **隐形风险降级但没消失**:经典脚本裸引用同样对打包器/静态分析隐形,改名依旧**没有编译期报错**。但排查方式变了 —— **改前端函数名前该 grep 的是 3 个经典脚本**(`hermes.js`/`api.js`/`login.js`),**不再是 `onclick=`**;`data-ui-action` 的动作名由 `app.js` 的 `STATIC_UI_ACTIONS` 表集中分发,改名会在表里露出来(且有测试校验 HTML 里每个动作都已注册)。
- **已知死代码**:`app.js` 的 `renderLoopbars()` + `LOOP` 常量是 no-op —— `.loopbar` 元素早在 commit `e138dfd`「drop loop numbering」从 HTML 删光,2026-08-26 活站实测命中 0 个。清理时可直接删。

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
- **KPI「运营总账」已上线**(2026-08-26,本分支 `claude/kpi-ledger-deal-status-e41865`):`GET /api/kpi/ledger`(`routes/kpi.js` + 纯函数 `services/kpiLedger.js` `computeLedger`)。老板年终看运营部成绩的一屏业务漏斗:**花费→询盘→优质(A/B)→成交→效率**,按渠道(复用 `attribution.js` 的 `classify`,四渠道同口径)+ 合计,给 优质率/成交率(优质口径+总口径)/每优质成本/CAC。**这是 `inquiries.deal_status` 第一次被 KPI 用上**。诚实口径:SEO/直接/其他 **无媒体花费口径→ NOT_APPLICABLE**(人力不计);SEM 花费**先取 Ads 同步真实值**(`google_ads_campaign_daily`,与 `/api/attribution` 同源,消双真相),无同步数据才回退人工周报 `sem_weeks.cost`,**判有无同步数据用 `ads.campaigns.length` 而非 `totals.costMicros`**(后者 COALESCE 过,0 行也返 0,会把「没同步」误报成「花了 0 元」);单位成本零分母→ `null` + reason(有花费·零成交/零优质),**绝不 Infinity**;未标注是否成交的老行既不算成交也不算未成交,单列 `dealStatusMissing`;币种 Ads=账户币种不加符号(与 `charts.js _money` 一致)、周报=¥,金额目标 `currency_mismatch` 标红。**只读,不进绩效评分**(评分引擎一行未改)。前端 `public/src/ledger.js`(新 ES 模块,全 createElement/textContent、**零 innerHTML 零内联 handler**),自插 `#panel-kpi` 的 `.sheet-tip` 之后,自听 `timerange` 重拉。**优质数/成交数无 kpi_targets 行→显示「目标待定」,不编数。** 测试 `server/test/kpiLedger.test.js` 18 例。
- 时间范围现影响:询盘、SEO 看板(GSC)、SEM 看板(Ads)、诊断、询盘归因、KPI 运营总账;GA4 概览与总览暂未跟随。
- **诊断引擎已上线**:`/api/diagnostics`(`server/src/routes/diagnostics.js` + `googleSync.js` 规则查询)产出 4 类真实 findings——机会词(排名11-20有曝光)、关键词蚕食(同词多页)、流量衰退(当前vs上一等长窗口点击跌幅)、高花费零有效(Ads cost>0 conv=0)。前端 SEO「站点机会/流量衰退/关键词蚕食」三子面板 + minitab 角标已读真实结果,随时间范围重算。**尚未做 CTR 异常规则。**
- **诊断→整改闭环已通**:三类 SEO finding 每行「采纳」按钮 → POST `/api/fixes`(source=诊断引擎,evidence 记 GSC 依据)直接入整改清单(`public/charts.js` `adoptFinding`)。
- **整改→日计划→回写也已通**(2026-08-13):整改清单每行「排入」→ `POST /api/fixes/:id/plan`,
  按整改的 dept/owner/title/due_date 建任务卡并写 `loop_items.fix_id`(**幂等**:已排过返回原任务 `existed:true`;整改已归档回 409),
  同时把整改状态推到「进行中」。任务勾完 → `PATCH /api/loop-items/:id` 在路由里**回写** `fixes.status='已改'`,撤销回「进行中」;
  状态为「放弃」或已归档的整改不被任务牵着走。`GET /api/fixes` 每行带 `planned_task_id`/`planned_done`,
  整改清单一眼看出哪条还没人接。日计划卡上有「整改」出身标,点击跳回整改清单看依据。
  至此闭环为:**数据 → 诊断 → 整改 → 谁的今日 → 打卡推进 → 完成回写**。
- **AI 上下文已含真实同步数据**:`aiContext.js buildContext` 注入 GSC/Ads 近30天汇总 + Top系列 + 机会词/蚕食/衰退/高花费零有效。SEM 看板「问题分析/优化思路/关键词排查」及所有 AI 按钮据此产出基于真实数据的分析。
- **AI 弹窗能力**:分析按 `scope_key` 持久化(`ai_analyses`);弹窗顶部**历史时间线**可点切换对比(`history_json` 快照,重跑旧结论不丢不归档),footer「重新分析」按本页最新数据重跑、「拆成整改动作」(`/api/ai/analyses/:id/actions`)把结论拆成动作逐条「采纳」入整改。`max_tokens` 默认 4000(.env 显式值会覆盖)。
- **仍残留的 demo 假数据:** 整改清单 AI 框两条写死建议(`index.html` 约 348-349);GA4 看板与总览部分 mini 图仍空状态。
- **时间筛选目前只停留在前端变量**(`window._timeRange`),总览/KPI 仍不受区间影响(询盘/SEO/SEM/诊断已真正按区间重算)。
- **AI 目前是单 provider**,仅通过 Anthropic(`server/src/services/anthropic.js`)。
- **日计划(`#panel-tasks`)已改版**(2026-08-13):三列(公司/陈-SEM/李-SEO),每列上=SOP 固定清单、下=每日新增。
  - SOP 日/周/月**合并成一个清单框**,一条一行,频率是行尾标签(`src/sop.js renderSopCards/sopCardEl`)。
  - 任务卡单行、无彩色边条;三列各自 `max-height:64vh` 滚动(1280px 断点下撤销,见 `page-tasks.css` 注释)。
  - `loop_items` 加 **`start_date`**(开始日),`task_date` 语义=**截止日**。两者构成跨天任务:
    `逾期(截止<今天) / 今日(截止=今天或无日期) / 进行中(已开始未到截止) / 稍后`,**分组只在 SEM/SEO 列**,公司列平铺。
    跨天卡显示「第 N/M 天」、逾期卡显示「逾期 N 天」+ 两个出口(顺延到今天 / 放弃并归档)。
  - 日期胶囊可点 → 复用任务弹窗的**编辑模式**(`openTaskEdit` + `submitTask` 的 `_taskEditing` 分支)走 PATCH。
  - **跨天任务每日推进打卡**:表 `task_checkins`(与 `sop_completions` 同构,`UNIQUE(loop_item_id,day_key)`,day_key 由前端按本地日期传),
    路由 `server/src/routes/taskCheckins.js`(`/api/task-checkins` + `/summary`)。卡上「推进」按钮一天一勾,
    徽章显示「第 N/M 天 · 已推进 K 天」;**今天没打且上次推进≥2 天前 → 黄色停滞标**。这是跨天任务唯一的问责证据。
  - 每列列尾「已完成 N 项」折叠条(默认收起);跨零点靠 `checkDayRollover()`(visibility/focus/5min)**就地重排,不重拉列表**。
  - **按日期回放**(`public/src/plan-history.js`,新写的 ES 模块,零内联 handler):页头日期条选别的日期 →
    `GET /api/daily-plan?day=&weekly=&monthly=`(`routes/dailyPlan.js`)回那天的三列**只读快照**,实时看板隐藏、
    选「今天」还原。每条任务标 **当天完成 / 当天推进 / 此前已完成 / 无记录**,列头给 `SOP x/y · 任务 n · 有交代 m`。
    周/月 period_key 由前端算好传入(与 `/api/sop/completions` 同口径,服务端不重算 ISO 周)。
    "那天在盘子里"= 区间覆盖那天 ∪ 截止日=那天 ∪ 那天完成的;归档任务只要是那天之后才归档的也算。
  - `loop_items` 加 **`done_at`**:以前只存 `state='done'`,"那天完成了什么"永远答不出来。
    在 `PATCH /api/loop-items/:id` 里戳时刻(`stampDone`),撤销清空;**老数据留 NULL,不补假值**。
  - 老库一次性回填 `start_date=创建日`(migrate 的 `backfillTaskStartDates`,`meta.backfill_task_start_date` 打标只跑一次)。
- **SOP 执行率已沉淀进周报**(2026-08-13):`GET /api/sop/stats?from=&to=&today=`(`routes/sop.js`)+ 前端
  `public/src/sop-rate.js`(新模块,`mountSopRate` 被经典脚本 `weekly-review.js` 调用)。周报每个周卡片顶部横跨两列
  显示三方(李/陈/公司)的 `done/expected · %` + **漏了哪条哪几天**。分母三条诚实规则:**未来的日子不算**(`today` 由前端传,
  `counted_to` 回给前端标注)、**SOP 创建之前的日子不算**(起点取 `max(from, created_at)`)、**月度 SOP 不进周口径**(`expected=null`)。
  统计按 `completed_at` 落在区间(不按 period_key——weekly 的 ISO 周号没法跟日期区间比,而 ISO 周只在前端算一份)。
  周卡片折叠居多,故**懒加载**:展开哪一周才算哪一周。

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
- **改前端函数名前先搜 3 个经典脚本**(`public/hermes.js`/`api.js`/`login.js`)+ **仍裸调用 app.js 导出的模块**(grep `go(`/`chk(`/`loadInquiries(` 等):这些引用对打包器隐形,改了**不会有任何报错**,直到跑到那行才 ReferenceError。改完在活站上验 `typeof window.<name>==='function'`。(两条老规矩已作废:内联 `onclick=` 已清零;`app.js` 已迁入 `public/src/`,它调用模块函数的方向现在有编译期保护。)
- **写进本文件的数字必须是实测的**,并注日期。本文件自称「固定项目真实状态」,一旦数字漂移(2026-07-15 曾查出路由 19→实为 27、index.html 1836 行→实为 1504、innerHTML 47→实为 168;2026-08-13 又漂:1504→1539、内联 handler 157/77→177/82;**2026-08-26 漂得最狠**:路由 29→30、index.html 1539→1070、innerHTML 236→194、经典脚本清单里 6 个文件早已迁走、**内联 handler 177/82→0**——「82 个强制全局是模块化地板」这条被当成前提写了两版,实际早被事件委托拆掉了),它就从「省 token 的地图」变成「误导人的旧地图」,危害大于没有。**引用前先抽验一个数,对不上就先修文件再干活。**
- 修改后运行相关检查。

## Security Rules

- **不提交 `.env`**。
- **不提交 token、密码、API key**。
- **不把 OAuth client secret、Google Ads developer token、服务器密码写入代码**。
- 密钥只存**服务器环境变量**或**加密存储**(参考 `integrations.js` 的 AES 方案)。
- **前端不能直接接触密钥。**
- 所有**用户输入和 API 返回文本**渲染前必须 **escape**。
- **谨慎使用 `innerHTML`**(2026-08-26 复测 **194 处赋值 + 2 处 `insertAdjacentHTML`**,较 8-13 的 236 处有所下降,仍属 XSS 高风险面)。**这近 200 处从未被完整审计过**——曾抽查过若干插值点(market-brain/google-projects/kpi-view/tagselect/keywords)均已 `esc()`,但**抽样不是结论,别当已排查**。真要下结论需专门做一轮全量审计。

## 协作流程约定

- 修改本地源文件 → 跑必要检查 → commit → push(GitHub: `cassianlee-digital/ferr-ops`,凭据走本机 GCM)。
- **不操作服务器、不索要服务器密码。** 部署由用户在服务器侧执行,Claude 只提供部署指令。
- **项目真实路径:`E:\Claude Code`**(E 盘卷标为「资料」,非目录)。
