# CLAUDE.md — ferr-ops

> 每次会话先读本文件。它固定了项目的**真实状态**,避免重复扫描、重复解释、把占位功能误当已完成。

## Project Purpose

ferr-ops 是公司内部 **SEO / SEM 运营指挥中心**,目标是完成完整闭环:

> 数据记录 → 数据观察 → 数据分析 → 优化建议 → 任务执行 → 结果验证 → 周报复盘 → SOP 沉淀。

**这个后台不是展示花瓶,而是团队日常运营的主战场。** 每条建议必须能追溯到数据,每个任务必须能验证结果。

## Current Architecture

- **后端不是单文件**:Fastify,模块化良好。
  - `server/src/routes/`(**36 个路由文件**,2026-10-10 实测:`ls server/src/routes/*.js | wc -l`)、`server/src/db/migrate.js`(迁移/建表)、`server/src/db/repositories/`(数据访问层)、`server/src/services/`(业务/AI/加密)、`server/src/sync/`(第三方同步,见下方真实状态)。
- **前端已不再是单文件,别再按「都挤在 index.html」描述**(2026-07-15 实测):`public/index.html` **1374 行 / 138KB**(2026-10-10 实测;ES 模块 **43 个**),**内联 `<style>` 已清零**(CSS 拆为 `base.css`/`styles.css`/`components.css`/`page-*.css`,见 `css-rewrite-plan`)。JS 分两层:**经典脚本只剩 3 个**(`hermes.js`/`api.js`/`login.js` —— 2026-08-26 复测 `ls public/*.js`;charts/inquiries/kpi/ai/closed-loop/weekly-review **以及 `app.js` 本身都已迁进 `public/src/`,别再按老清单找文件**)+ **ES 模块**(`public/src/*.js` → esbuild 打 IIFE 成 `dist/bundle.js`)+ index.html 内联 `<script>`。**两套模块系统并存 = 绞杀式迁移的中间态,加载序是承重的,别随意调 `<script>` 顺序。**
- **已有真实表 + CRUD 的模块**:询盘、KPI、关键词、否词、广告创意、整改(fixes)、复盘(weekly_reports/loop_items)、内容资产(content_assets)、seo_weeks、sem_weeks 等。
- `server/src/routes/overview.js` 已聚合**真实** KPI(月度快照 + 环比)。
- `server/src/services/aiContext.js` 会拼接数据库中的 **KPI、询盘、SEO/SEM 周报、关键词**等真实上下文喂给 AI。
- `server/src/db/repositories/integrations.js` 对密钥做 **AES 加密**存储,**绝不返回前端**。
- `server/src/db/seed.js` 只插入**用户 / KPI / 市场调研**,**不注入假业务数据**。

### 前端全局面与「模块化地板」(2026-07-15 实测,别重新推导)

- **全局面已腰斩:实测 190 名字 / 154 函数**(2026-08-27 合并后活站 iframe 差集,含 vendor;2026-07-15 同口径是 338/302)。降幅主要来自 `app.js` 迁入 ES 模块 —— 它原有 **35 个顶层符号自动是全局**,现在只导出 **4 个**给兼容层(第三刀又从 10 收到 4)。
  - **别用 grep 数 `window.X =` 去估全局面**——经典脚本里顶层 `function foo(){}` **自动就是全局**,根本不写 `window.`。要量就在活站上用 **iframe 差集**量(建空 iframe 取 `Object.getOwnPropertyNames` 做差集)。
- **⚠ 内联 handler 已清零,原「82 个强制全局是模块化地板」的说法已作废**(2026-08-26 实测)。事件委托改造**已经做完**:HTML 属性型 `onclick=`/`onchange=` **0 处**,全站改用 **154 处 `data-ui-action=`**(2026-10-10 实测,口径 `grep -ro 'data-ui-action=' public --include=*.html --include=*.js | grep -v /dist/ | grep -v /vendor/`)(+ `data-loop-tab`/`data-google-action` 等专用委托)。`public` 下仅剩 **1 处 `onclick=`(2026-10-10 实测:`google-projects.js` 的 `el.onclick=fn` DOM 属性赋值;`app.js` 那处已随死代码 `renderLoopbars` 删除)**,不是 HTML 字符串里的裸全局调用。**统计口径**:`grep -ro 'on\(click\|change\)=' public --include=*.html --include=*.js | grep -v dist | grep -v vendor`。
- **`public/src/ui-kit.js` 是全站 UI 基础工具的唯一实现**(2026-08-26 新增):`esc`/`renderText`/`mdToHtml`/`openModal`/`closeModal`/`toast`/`toastUndo`/`toastGo`/`showToast`/`hideToast` 从 app.js 搬来。**22 个 ES 模块已全部改为显式 `import { esc, toast } from './ui-kit.js'`,模块侧不再读 `window`**(校验脚本口径:模块里出现这些名字却没 import = 漏网)。收益是**编译期保护**:名字写错 esbuild 当场报错;此前它们是隐式全局,对打包器完全隐形。⚠ **本模块必须保持「无 DOM 也能被 import」**——`table-editor.js` 会被 `node --test` 真实 import,求值期碰 `document` 会让整个测试文件崩(已踩过);故遮罩绑定带 `typeof document` 守卫、toast 系列取不到 `#toast` 就安静退场。
- **`public/src/app.js` 是应用组装层**(2026-08-26 由经典脚本迁入 ES 模块):`STATIC_UI_ACTIONS` 委托表 + 导航 `go()` + `window load` 启动序列 + `applyRoleUi()`。**依赖方向单向**:它 import 21 个业务模块,**没有任何模块 import 它** —— 依赖图顶点,无环。故 `main.js` 里它**必须是最后一个 import**(模块求值期要做 DOM 绑定并注册 window load,等价于原来「bundle.js 之后再加载 app.js」),`Object.assign(window, …, app)` 里也**必须最后合并**(还原它的全局后定义、同名覆盖的语义)。这两条已被 `frontendXss.test.js` 焊死。它调用的 ~90 个模块函数现在**全部编译期校验**,写错 esbuild 当场失败。
- **`Object.assign(window, …)` 兼容层仍要留**,消费者两类:`public/hermes.js`(只读 `window.API`/`ME`/`_curTab`/`esc`/`toast`/`go`/`loadClosedLoop`,全部带 `window.` 前缀且有兜底),以及 `closed-loop.js` 裸调用的 `go`/`chk`/`setPlanningTab`/`setActionTab`。
- **app.js 的导出已从 10 个收到 4 个**(2026-08-26 第三刀):`loadInquiries`→`inquiries.js`(它渲染的三个函数本就在那)、`tableLoadState`→`ui-kit.js`、`renderSparklines`→`keywords.js`、`toggleHier`→`charts.js`(各自唯一调用者所在处);`hydrate`/`applyRoleUi`/`restoreRoute` **无任何外部调用者**,已降为模块私有。**顺带修掉一处设计违背**:`timerange.js` 原本反向调用 `loadInquiries()`,与其文件头写明的「消费者订阅事件」相悖且会成环,现改为 inquiries.js 自己监听 `timerange`(与 kpi-view/ledger 同一模式)。
- **剩下 4 个导出为什么收不掉:真的有环**。`chk` 被 `closed-loop.js` 裸调用、又被 `sop.js` 以 `window.chk` 调用,而它自身要调 `closed-loop` 的 `refreshTaskCols` 和 `sop` 的 5 个函数 —— 放进任一方都成环。`go` 同理:拆 `nav.js` 需 import charts/archive/sop/weekly-review,而这四个都可达 `closed-loop.js`(唯一裸调用 `go` 的模块)。**正解是事件反转**(chk 做完 API 后派发 `taskchanged`,closed-loop/sop 各自订阅刷新;`go` 派发 `tabchange`),就是本项目 `timerange` 已在用的那套 —— 但它改的是任务打卡这类关键路径,要单独排一刀。
- **已知既有缺陷(非重构引入)**:每次切时间范围会发**两个完全相同的** `/api/inquiries` 请求 —— `charts.js` 的 timerange 监听器调 `loadDashboardInq()` 与 `inquiries.js` 的 `loadInquiries()` 各取一次(改造前是 charts 监听 + timerange 直接调,数量口径一样)。要修得让两者共用一次取数。
- **app.js 里仍靠隐式全局解析的只剩 16 个**(已审计,零漏网):`api.js` 的 `API`/`ensureAuth`/`can`/`ME`,以及 `hermes.js` 自己挂 window 的 14 个面板函数(`openHermesPanel`/`sendHermesPrompt` 等)。这两个经典脚本在 `bundle.js` **之前**加载,故运行时一定就绪。
- **隐形风险降级但没消失**:经典脚本裸引用同样对打包器/静态分析隐形,改名依旧**没有编译期报错**。但排查方式变了 —— **改前端函数名前该 grep 的是 3 个经典脚本**(`hermes.js`/`api.js`/`login.js`),**不再是 `onclick=`**;`data-ui-action` 的动作名由 `app.js` 的 `STATIC_UI_ACTIONS` 表集中分发,改名会在表里露出来(且有测试校验 HTML 里每个动作都已注册)。
- ~~已知死代码 `renderLoopbars()` + `LOOP`~~ **已于 2026-10-10 删除**(`.loopbar` 元素早就不在 HTML 里)。`base.css` 里 `.loopbar` / `.loopstep` 几条样式因此成了死样式,没动。

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
- **KPI「月度绩效考核」已上线(2026-09-20,老板《2026 运营部绩效考核表》口径)** —— 这是 KPI 页现在的**主角**,
  摆在三个表盘之前。后端 `server/src/services/kpiReview.js`(纯函数 `computeReview` + DB 组装 `buildReview/buildReviewAll`),
  路由 `GET /api/kpi/review`、`GET·PUT /api/kpi/review-config`、`DELETE /api/kpi/review-targets/:periodKey`;
  前端 `public/src/kpi-review.js`(看板)+ `public/src/kpi-review-admin.js`(设置 → 月度绩效考核)。
  - **为什么另起一套而不改 `services/kpi.js` 的 v2**:v2 考的是「每个渠道各自的过程质量」(可见度/质量指数/CPVI),
    老板这张表考的是「部门这个月带回多少 A/B 询价、花了多少钱、该做的复盘整改做没做」。口径、量纲、
    出分范围(v2 封顶 100;老板表封顶 **120** 且带**绩效系数**)都不同,硬塞进一个引擎两边都拧巴。
    **v2 引擎与 `kpi_period_snapshots` 结算快照一行未改**,继续在下方作为诊断明细展示。
  - **老板亲定口径(2026-09-20 对话,别自作主张改)**:
    ① A/B 询价数量是 SEM 与 SEO **共同产出,按部门整体算一次,不按渠道拆到个人** ——
       理由不是偷懒:询盘全是人工录入,`channel` 没有任何机器证据(见 [[inquiry-channel-attribution-dead-end]]),
       按它拆 = 用手填字段决定谁的钱。三个范围(部门/李/陈)拿到的是**同一个 A/B 数**。
    ② 「直接 / 其他」渠道**全部计入部门总量**(老板:这些多半也是自家渠道带来的,只是当时没留来源);
       同时把**未归因占比**一直亮在看板上,长期偏高说明录入要改进。
    ③ 成本类指标按部门口径算一次;落到 **SEO 个人时标 `NOT_APPLICABLE`、20 分权重在其余指标间重新归一**,
       **绝不给李编一个 0 分**。
    ④ **SEM/SEO 的过程数据(CPC、排名、跳出率…)本期不计入考核。**
  - **权重(合计 100,全部可在设置页改)**:A 级数量 40 / B 级数量 20 / A 级成本 10 / A+B 成本 10 /
    A 级占比 5 / 周复盘 5 / 整改闭环 5 / 实验测试 5。单指标达成率上限 **1.2**(老板表 `MIN(实际/目标,120%)`)。
    **广告投入只做预算对照(±10%),不计分** —— 超预算是要解释的事,不是扣分项(多花的钱会如实反映在两项获客成本上)。
  - **绩效系数分档**(`kpi_config.review_bands`,JSON,可改):110+ 超额优秀×1.2 / 100+ 达成目标×1.0 /
    90+ 良好×0.9 / 80+ 达标×0.8 / 其余 未达标×0.6。
  - **诚实口径(有 18 例单测焊死,`server/test/kpiReview.test.js`)**:
    `NO_TARGET` 目标没设 → 整份标 `CONFIG_INCOMPLETE`,**只给参考分不出正式分**;
    `MISSING_DATA` 有目标没数据 → 留在分母拉低覆盖率,**不是 0 分**;
    `NOT_APPLICABLE` / `NO_BASELINE`(区间内一条整改都没有、零广告投入、有效询价为 0)→ **移出分母**,不判 0;
    **唯一强制 0 分的情形是「花了钱却零 A 级/零有效询价」** —— 那不是除零错误,是结论,绝不让它逃出评分。
    覆盖率低于 `review_min_coverage`(默认 0.6)同样只给参考分。
  - **数据源**:询价 `inquiries.grade`(全渠道,排除归档);广告投入先取 Ads 同步、无则回退 `sem_weeks.cost`
    (复用 `kpiLedger.resolveSemSpend`,与总账/归因同源);周复盘 `weekly_reports`(分母=区间周一数×部门数,**建了空行不算交**);
    整改闭环 `fixes`(按截止日归区间,**「放弃」不进分母**);实验测试 `loop_items(kind=test)`(按创建日,`period` 是自由文本不可靠)。
  - **月度目标表 `kpi_review_targets`**(对应老板表的「目标设置」页):`period_key='YYYY-MM'`,
    `'default'` 行兜底;**跨月区间一律回退 default**,不挑一个月假装代表全区间。**一个数都不预填** —— 目标是老板定的,编一个进去等于凭空立假 KPI。
- **KPI「运营总账」已上线**(2026-08-26,本分支 `claude/kpi-ledger-deal-status-e41865`):`GET /api/kpi/ledger`(`routes/kpi.js` + 纯函数 `services/kpiLedger.js` `computeLedger`)。老板年终看运营部成绩的一屏业务漏斗:**花费→询盘→优质(A/B)→成交→效率**,按渠道(复用 `attribution.js` 的 `classify`,四渠道同口径)+ 合计,给 优质率/成交率(优质口径+总口径)/每优质成本/CAC。**这是 `inquiries.deal_status` 第一次被 KPI 用上**。诚实口径:SEO/直接/其他 **无媒体花费口径→ NOT_APPLICABLE**(人力不计);SEM 花费**先取 Ads 同步真实值**(`google_ads_campaign_daily`,与 `/api/attribution` 同源,消双真相),无同步数据才回退人工周报 `sem_weeks.cost`,**判有无同步数据用 `ads.campaigns.length` 而非 `totals.costMicros`**(后者 COALESCE 过,0 行也返 0,会把「没同步」误报成「花了 0 元」);单位成本零分母→ `null` + reason(有花费·零成交/零优质),**绝不 Infinity**;未标注是否成交的老行既不算成交也不算未成交,单列 `dealStatusMissing`;币种 Ads=账户币种不加符号(与 `charts.js _money` 一致)、周报=¥,金额目标 `currency_mismatch` 标红。**只读,不进绩效评分**(评分引擎一行未改)。前端 `public/src/ledger.js`(新 ES 模块,全 createElement/textContent、**零 innerHTML 零内联 handler**),自插 `#panel-kpi` 的 `.sheet-tip` 之后,自听 `timerange` 重拉。**优质数/成交数无 kpi_targets 行→显示「目标待定」,不编数。** 测试 `server/test/kpiLedger.test.js` 18 例。
- 时间范围现影响:询盘、SEO 看板(GSC)、SEM 看板(Ads)、诊断、询盘归因、KPI 运营总账;GA4 概览与总览暂未跟随。
- **询盘评级页已合表改版**(2026-08-26/27):原来是「Hero 左栏当月表 + 下方按月折叠的历史表」两张表,现在**只剩一张**(`#tb-inq`),Hero 左栏与 `renderInqFeed` 已删除;飞线地图改全宽,并**排在表格下面**(先看询价明细,再看落在世界哪儿)。
  - `<thead>` 第二行是**按列筛选**(`#inqFilterRow`,`renderInqFilterRow()`):国家/大区/渠道/产品/等级/公司/业务员/是否成交 = 下拉(**候选值只列当前区间数据里真实出现过的**,空值用 `__blank__` 哨兵单独可筛),客户编码/来源词/备注 = 文本包含,跟踪反馈 = 有/无;多条件 **AND**;日期列不给筛选(时间条在管)。
  - 主体是**日期倒序连续列表**,跨月插一条 `.inq-msep` 分隔行(**不再可折叠**,只是视觉分段,每页开头会重复本页首行所属月份),底部 `#inqPager` 分页(20/50/100,只有每页条数进 `localStorage`)。
  - **筛选/分页全在前端**(区间数据本来就一次取全),不改 `/api/inquiries`。**地图跟随筛选结果**(`inquiry-globe.js` 显式 `import { filteredInquiries }`,不再直读 `_inqCache`);**顶栏 KPI 与 KPI 页圆环一律不受筛选影响**——那是考核口径。
  - **跟踪反馈已从单条改成多条带时间的记录**(2026-08-27,新表 `inquiry_feedbacks`):表格里那一格显示**最新一条(带日期)+ 永远在的「添加」按钮**,
    点开是完整时间线弹框(新的在上、可逐条删、加完不关窗可以接着加)。老的 `inquiries.tracking_feedback` 列**只读不写**,
    迁移进来的老记录 `created_at` **留 NULL、前端显示「日期不详」**——那段话本来就没时间戳,补日期等于伪造跟进记录。
    **格子里把每一条跟进都铺出来**(老板明确要求):一条一行、各带自己的日期、正文**完整不截断**,最新的在最上(左侧竖条+日期是蓝的,便于一眼看出跟到哪一步)。
    做成左侧竖条的时间线而非一条一个方框——5 条跟进时方框套方框太吵。列宽 340px(14 列原来被表格均分成 138px,
    大区/渠道/产品/等级/公司/是否成交 只放 2~4 个字的标签,收窄后把宽度让给「跟踪反馈」和「备注」;实际渲染约 400px)。
    **已知代价**:跟进多、话又长的行会明显变高(实测 3 条含一条 150 字 → 行高 194px,单条 68px)。这是拿行高换可读性,是老板拍板的取舍,别自作主张改回截断。
    格子越界的老毛病同时修掉(格内元素一律 `max-width:100%` + `min-width:0` + `word-break`)。
  - **筛选条件刻意不持久化**:每次进页面是干净全量,只在表格上方显示「已筛选 N / M 条 · 清空筛选」。理由是持久化最容易造成「下次打开发现询盘少了一半,以为丢数据」。
  - **可编辑格(客户编码/业务员)存盘后必须同步 `_inqCache`**(2026-09-08 修):老板反馈「客户编码后期补录后,有的直接就不显示」——
    值**已经入库**,是 `renderInqTable()` 用旧行缓存整表重画时盖回了空白(翻页/改筛选/加跟进反馈/切时间范围都会重画)。
    修法:`table-editor.js` 存盘后 `document.dispatchEvent(new CustomEvent('cellsaved',…))`(成功带服务端整行 `item`,失败带回滚后的旧值 `ok:false`),
    `inquiries.js` 订阅它写回缓存;重画前先 `commitPendingCellEdit(tb)`(节点被 `innerHTML=''` 换掉后浏览器**不会**补发 focusout,
    正在敲的字连保存机会都没有)再 `absorbEditedCells(tb)` 收 dirty 格子(只收 `td._old` 与现值不同的,全量收会让过期 DOM 盖掉刚拉回的新数据)。
    同时给可编辑格补上存盘回执(复用 `setSavingState` 的黄/绿/红),以前存成功是**完全无提示**的。防回归见 `frontendDataIntegrity.test.js` 的
    `saved cell edits survive the next table repaint`。**别再让任何表只改 DOM 不回写缓存。**
- **询盘表 2026-09-20 改版(共 15 列)**:
  - **国家改成可编辑格、大区改成彩色标签下拉**(老板:录入当下常常还不知道客户哪来的,先留空后补)。
    顺带修掉一个**静默 bug**:`产品`/`渠道` 标签本来就长得像可点改,点了也换颜色,但 `tagselect.js` 的
    `fieldMap` 里没有这两个 kind → 直接 `return`,**一次 PATCH 都没发过**,刷新就退回去。region/product/channel 三个一起补上了。
  - **业务员后新增「业务反馈」列**:业务发回来的原始材料(一段话 + 若干张截图)。
    与旁边的「跟踪反馈」**刻意分表分列**(`inquiry_sales_notes` vs `inquiry_feedbacks`):
    跟踪反馈是运营记的跟进进度,业务反馈是业务给的材料;混在一起复盘时就分不清哪句话是谁说的。
    表头筛选多一列「有/无业务反馈」。前端模块 `public/src/inquiry-sales.js`(只对外给 `salesCellHtml`,
    刷新走 `salesnoteschanged` 事件,**不与 inquiries.js 互相 import**,避免成环)。
  - **列数与 colspan 不再手写**:`const COLSPAN=FILTER_COLS.length`,空态/月份分隔行/错误行统一用它(有测试焊死)。
- **产品 / 大区的可选值只有一份:`public/src/catalog.js`**(2026-09-20 新增)。
  老板反馈的「产品和筛选框不同步」根因是同一份清单散在四处(OPT.product / PROD_BADGE / 录入弹框 `<option>` / 表头筛选),
  加一个产品要改四处、漏一处就对不上。现在 tagselect 的 `OPT.product/OPT.region`、彩色徽章、
  录入弹框(运行时 `fillSelect` 渲染,HTML 里**刻意留空**)、表头筛选全从这里取 —— **加产品只改 catalog.js**。
  产品现为 11 个(新增 爬梯 / 紧线器 / 电力 / 建筑预埋件 / AI算力)。
  表头筛选里**有目录的列(产品/大区)列出完整目录并带该值的条数**,没目录的列仍只列真实出现过的值。
- **可审计任务已上线(2026-10-10,经理反馈第 1/4 条)** —— 后台以前只记「做了多少事」,答不出「结果是什么、证据在哪、
  动的是哪个页面/系列/关键词、花了多久」。规则**只有后端一份**:`server/src/services/taskAudit.js`(纯函数),
  数据组装 `services/taskAuditData.js`(`decorateTasks`),前端 `public/src/task-audit.js` 只照着显示。
  - **任务新增列**(`loop_items`):`project` 产品/项目、`result` 完成结果、`task_actions` 具体动作、`evidence` 证据链接
    (一行一个,**只收 http(s)** —— 别的 scheme 存进去会被渲染成可点链接)、`est_hours`/`actual_hours`、`important`(人工标记)。
    **老行全部留 NULL 不回填**,归档页显示「结果未记录 / 无完成记录」。
  - **关联键 `task_links`**:任务 ↔ `page`(完整网址,对 `gsc_query_daily.page`)/ `campaign`(**只收已同步过的 campaign_id**,
    手敲的名字对不上任何花费数据)/ `keyword`(归一成小写)/ `kpi`(`TASK_KPIS` 目录)。候选走 `GET /api/loop-items/link-options`。
    **它是下面「任务前后数据对比」的连接键。**
  - **完成门槛(`PATCH /api/loop-items/:id` 强制)**:所有任务必须写完成结果(≥4 字);**重要任务**还要证据(链接或截图任一)。
    重要 = 人工标记 / 涉及花费 / 整改出身 / 跨天 / 公司派发(仅顶层,子任务不连坐),**按规则判,不由执行人自选**;
    「重要」谁都能加、只有 manager/boss 能摘。失败回 `400 completion_incomplete` + `missing` + 给人看的 `detail`。
  - **已堵的旁路(各有测试,别拆)**:POST 直接建成完成;完成后把 result/evidence 清空;完成后删最后一张证据图(`409 last_evidence`);
    请求里夹白名单外的 `parent_id`/`fix_id` 伪装成普通任务(门槛只拿 `repo.UPDATABLE` 内的字段合并预判)。
    **已知没堵的**:执行人把跨天任务的日期改成同一天,就不再算「跨天」—— 改动本身留在记录里,由周度审核去看。
  - **门槛只保证「填了」,不保证「填得对」**。证据能不能支撑结论,由周度审核(规则疑点 + AI 意见)去看。
  - **勾完成改走完成弹框**(`#taskDoneMask`):`chk()` 不再直接 PATCH done,入库成功后才标勾;取消 = 什么都没发生。
    卡片重画走 `taskchanged` 事件(app.js 派发、closed-loop.js 订阅)—— 这就是上文说的「事件反转」的第一处落地,
    顺带没有加宽 closed-loop.js 的导出面。**公司大任务完成现在会先戳 `done_at` 再归档**(以前直接归档,完成时刻是空的)。
  - 证据截图复用 `attachments`(`owner_type='task'`)。归档页任务行带出结果/动作/证据/关联/工时。
  - 日计划按日期回放(`plan-history.js`)的任务行也带审计信息;**完成结果 / 动作 / 证据只在「那天或之前已完成」时显示** ——
    回放是那一天的视角,不把事后写的结论摆进更早的日子。
  - **测试登记的门槛**:`POST /api/loop-items/:id/archive` 对 `kind='test'` 要求 `conclusion` 非空,否则 `400 conclusion_required`
    (放弃的测试也要写明为什么放弃;已归档的不追溯;计划不受限)。
- **周度审核已上线(2026-10-10,第三阶段;导航「行动中心 → 周度审核」)** —— 经理要的四样东西(审核页、AI 按人审核、
  CSV/XLSX/JSON 导出、把数据开放给 AI)**吃同一个包**:`services/auditPackage.js` 的 `buildAuditPackage({range, person, today})`。
  **要加字段只改这一处**,页面(`public/src/audit.js`)、导出(`services/auditExport.js`)、AI(`services/auditAi.js`)都读它。
  - **路由 `routes/audit.js`**:`GET /api/audit/weekly`(包本身)、`GET /api/audit/weekly/export?format=json|xlsx|csv[&section=]`、
    `GET·POST /api/audit/weekly/ai`。区间最长 92 天;`person` 只收 `all / 李 / 陈`;`today` 由前端按本地日期传。
  - **包里有什么**:任务(状态 / 结果 / 证据 / 关联 / 14 天前后对比摘要 / 疑点)、SOP、SEO 与 SEM 的本期对上一等长区间、GEO、
    询盘(含来源对账)、表单线索(**不带联系人与留言**)、测试、整改、花费、KPI、周报原文。
    任务按人切(负责人优先,没写按部门 SEO→李 / SEM→陈,公司任务不归个人);**询盘 / 线索 / 花费 / KPI 是部门口径不按人拆**。
  - **任务状态(`auditRules.taskState`)**:`completed` 按**北京时间的完成日**落在区间内;`overdue` 包含上周拖下来的;
    `in_progress` = 区间与任务起止有重叠;`abandoned` = 区间内归档且从未完成。**标了完成却没有 `done_at` 的老任务不计入任何一周**。
    **`deleted` = 区间内被删除**(2026-10-10 自查补上):任务卡上谁都能点删除,删了就从看板和归档页上一起消失,审核以前也对它返回「不存在」——
    逾期的任务删掉就等于没发生过。现在在被删的那一周列一次,疑点分三种:`DELETED_DONE` 已完成的被删(结果和证据只剩这里看得到,页面照样列出)/
    `DELETED_OVERDUE` 逾期未完成时被删 / `DELETED` 未完成即删除。**唯一不列的是建出来当天就删、且没完成过的**(录错了改正)。
    **谁删的记在 `deleted_by`**(任务 / 外链 / 支出三张表,2026-10-10 加;**这之前删的留 NULL,页面显示「删除人未记录」,不猜**)。
    只有 `deleted_at` 在区间内才列,被删任务在它「完成的那一周」不再出现。
  - **被删除的花费记录同理**(`spend.deleted_items`,页面「花费」卡下方 + 导出表「已删除的花费记录」):付费外链 / 其它支出软删后从台账和月度汇总里一起消失,
    审核在被删的那一周把它单独列出来(**不计入合计**)。口径与任务一致:按北京时间的删除日,当天建当天删的不列。免费外链被删不列(这里只管钱)。
  - **疑点(`taskFlags`)是确定性规则,只陈述事实不定性**:缺结果 / 重要任务没证据 / 没可量化关联 / 没填预估或实际工时 /
    实际超预估 1.5 倍或不到一半 / 晚于截止日完成 / 逾期 / 跨天任务区间内零推进。**AI 不可用时这一页照样能用**。
  - **KPI 取「本月至今」**(区间结束日所在月的 1 号到结束日),不是拿一周的实际去比月度目标。
  - **导出零新依赖**:`services/exporters.js` 用 Node 自带 `zlib` 手写 ZIP + XLSX(内联字符串,数字写数值单元格),
    测试用已有的 `read-excel-file` 读回校验。CSV 带 **UTF-8 BOM**(否则 Excel 中文乱码)且**防公式注入**(`= + - @` 开头的文字前加单引号;数字不加)。
    XLSX 每张表一个工作表(概要 / 任务 / 数据变化 / 数据概览 / GEO / 询盘 / 表单线索 / 整改 / 测试 / SOP / 花费汇总 / 外链 / 其它支出 / KPI本月至今 / 周报 / 口径说明);
    CSV 一次一张(`section`)。文件名只用 ASCII(`李→li`、`陈→chen`)。
    **已在真机验证(2026-10-10)**:用 COM 在本机的 Microsoft Excel 和 WPS 表格里各打开过一份真实导出(16 个工作表)和一份压力样本
    (特殊字符 / 多行 / 5000 字长文本 / emoji / 负数),均无修复提示;`=SUM(1,2)` 这类文字是字符串不是公式,数字列能求和;CSV 中文不乱码。
  - **AI 审核**:直接调 `callAnthropic`(没走 Hermes 那套证据核验流程),提示词要求只依据包内数据、每条结论带 `task_id` / `inquiry_id`、
    只输出约定的 JSON 结构;`parseAuditAi` 解析不出来就**原文显示并标注「未按结构返回」**。交给 AI 的包**不带客户编码、业务员**。
    结果按 `weekly_audit:<start>:<end>:<person>` 存进 `ai_analyses`,重跑时旧意见进历史。
    **⚠ 本地没有 AI 密钥,真实的 AI 输出没跑过**(只验过「不可用时回原因」和「结构化渲染」两头);首次在生产跑要看它是否守结构、是否超出 `max_tokens`。
  - **「开放给 AI」目前 = 导出 JSON 后上传**(用户 2026-10-10 采纳的方案)。只读签名链接没做。
  - SOP 统计(`services/sopStats.js`)与 GEO 概览(`services/geoData.js`)因此从路由里抽成了 service,路由与审核包共用。
- **任务完成前后的数据对比已上线(2026-10-10,第二阶段)** —— `GET /api/loop-items/:id/effect?days=7|14|28`,
  纯函数 `services/taskEffect.js` + 组装 `services/taskEffectData.js`(**周度审核包直接复用 `buildTaskEffect`**)+ 查询 `repositories/taskEffect.js`。
  按 `task_links`:页面/关键词 → GSC(点击/曝光/曝光加权排名),系列 → Ads(花费/点击/转化/每转化成本),关键词在 Ads 有数据时多列一行。
  - **口径(有测试焊死,别改松)**:前后窗口**永远等长** —— 完成后数据没满 N 天时两边一起缩短并标 `PARTIAL`
    (拿 14 天前窗口比 5 天后窗口,任何任务看起来都在跌);**完成当天两边都不算**;完成时刻按 **Asia/Shanghai** 归日
    (`done_at` 是 UTC,北京早上勾的任务直接取 UTC 日期会错开一天);两边都没数据标 `NO_DATA`,不画 0 → 0。
  - **同时给全站 / 全账户同期变化当参照**,并在响应里带一句 `note`:「只说明之后变了,不能证明因此变了」。界面原样显示。
  - **KPI 关联只记声明(`DECLARED`),不做单条任务的前后对比** —— A/B 询价数量是部门级的数,拆不到单条任务。
  - 只读现算不落库(同步数据会补齐,今天的「数据未满」过几天该变完整)。入口:已完成任务卡 / 归档行上的「数据变化」。
  - **外链也接上了**:`GET /api/backlinks/:id/effect`,原点 = 外链上线日,对象 = 它指向的页面。任务与外链共用 `taskEffectData.js` 里的
    同一个 `buildEffect`,弹框也是同一个(`task-audit.js` 的 `openEffect(path)`);**没有原点时的原因由后端给**(`status` + `message`),前端不各写一份。
  - **GA4 落地页也进了对比**:任务 / 外链关联的页面如果在 GA4 里有落地页数据,多列一行「作为落地页」的 **进站会话 / 关键事件**,并带全站 GA4 同期作参照。
    GA4 的落地页维度是「路径 + 查询串」,同一页面会被广告参数拆成多行 —— `repositories/taskEffect.js` 的 `ga4LandingPage` **按路径归并**
    (带不带尾斜杠、后面跟不跟查询串都算同一页),`LIKE` 的 `%` / `_` 已转义(路径里有下划线是常事)。只在 GA4 真有该页面数据时才列这一行。
    **⚠ 落地页取值格式没有用生产数据校验过**(本地没有真实 GA4 数据,按 `landingPagePlusQueryString` 的通用格式写的)。
- **询盘来源已上线(2026-10-10,第二阶段)** —— 来源分两种可信度,**分开存、分开显示**(`inquiries.src_evidence`):
  `form` = 独立站表单带回的机器证据(**任何角色都不能手改**,`409 source_locked`),`manual` = 人填的主张。
  **绝不用 `channel` 的取值暗示有没有证据。** 规则 `services/inquirySource.js`,前端 `public/src/inquiry-source.js`
  (与 inquiry-sales.js 同模式:只给 `sourceCellHtml`,反向走事件 `inqsourcechanged` / `leadconvert`,不动 inquiries.js 被焊死的导出面)。
  - 新列:`src_campaign_id`/`src_campaign`/`src_landing_page`/`src_referrer`/`src_gclid`/`src_utm`/`src_evidence`/`lead_id`;来源词仍在老的 `source` 列。
    **这些列刻意不在 `repo.update()` 的通用白名单里**,只能经 `repo.setSource()` 写 —— 否则 PATCH 里夹一个 `src_evidence:'form'` 就能把手填来源升成机器证据。
  - **来源对账 `GET /api/inquiries/source-check`**(前端在表格画完后才拉,不拖慢列表):拿手填来源词去 Ads 关键词 + 搜索词、GSC 查询里
    找**有点击**的日子(询盘日前 30 天),结论 `SUPPORTED 有据 / AMBIGUOUS 两边都有 / CONFLICT 对不上 / UNSUPPORTED 存疑 / HINT 可能填错 / NO_SOURCE / NO_DATA`。
    **对账只挑疑点给人复核:不改渠道、不参与计分。** 自己那一侧没有同步数据时一律 `NO_DATA`,不说「找不到」。
  - **表单线索 `inquiry_leads`**:`POST /api/inquiry-intake` 是全站唯一不靠登录态的写入口 —— 请求头 `X-Intake-Token` 与
    `INQUIRY_INTAKE_SECRET` 恒定时间比较,**未配或短于 24 位 = 入口关闭(一律 401)**,限流 60/分钟,64KB 上限,按 `submission_id` 去重。
    线索**不进任何统计**;「转为询盘」时 `POST /api/inquiries` 只带 `lead_id`,来源由后端自己从线索里取(不信前端回传)。
    「忽略」必须写原因,连同来源一起保留 —— 垃圾询盘从哪个系列 / 词来,靠的就是这些行。
  - **⚠ 站点侧还没接**:生产 `INQUIRY_INTAKE_SECRET` 未配置,独立站表单也没改,所以线上线索收件箱会显示「尚未接入」。
    给站点负责人的接入说明在 `docs/INQUIRY_INTAKE.md`(含 Ads 跟踪模板)。**独立站表单由老板来改(用户 2026-10-10 答复)**;站点用什么搭的、表单是插件还是自写的还不知道,这决定第三步「服务端调用」具体怎么落。
  - **AI 引擎暂归渠道「其他」**:渠道目录只有四个值,加第五个会牵动考核口径,是老板要定的事。引擎本身记在来路里。
  - 邮件 / WhatsApp 直接来的询盘带不了参数,仍是人填 + 对账。历史询盘不回填。
- **询盘的确认权与改动留痕已上线(2026-10-10)** —— 等级(A/B/C)决定月度考核里 60 分的 A / B 询价数量,渠道决定「这条询盘算谁带来的」,
  而录入人自己就能填、能改。没有表单证据的询盘拿不到独立于录入人的机器证据,能立的只有流程规矩。
  规则在 `routes/inquiries.js` + `repositories/inquiries.js`,前端 `public/src/inquiry-attribution.js`(与 inquiry-sales / inquiry-source 同模式,
  反向走 `attributionchanged` 事件)。测试 `server/test/attributionGate.test.js` 24 例。
  - **三条规矩**:① 录入 = 建议值(`inquiries.attribution_status='proposed'`);**manager / boss 录入即确认**,也只有他们能确认(单条 / 批量)和撤销确认;
    ② 已确认后李 / 陈改不动**渠道、等级和日期**(`403 attribution_locked`;`repo.LOCKED_FIELDS`),manager / boss 改必须带 `reason`(`400 reason_required`);
    ③ 每次改动进 `inquiry_field_changes`(谁 / 何时 / 从什么改成什么 / 为什么),相同值不记。
    老行状态为 NULL = **历史未审**,既不算已确认也不算待确认,不补假值。
  - 顺带补了一直缺的校验:`channel` 只认 `SEO自然 / SEM付费 / 直接 / 其他`,`grade` 只认 A / B / C(以前 PATCH 不校验,任何字符串都能写进去)。
  - 界面:每行渠道格下标 待确认 / 已确认 / 历史未审 +「改 N」(可点看流水);已确认的渠道 / 等级换成带锁的静态徽章;
    表格上方亮出确认进度(未确认 ≥50% 标红),经理 / 老板有「全部确认」(要点两次;**确认的是当前时间范围内全部未确认的,不受表头筛选影响**)。
    周度审核包的 `inquiries.confirmation` 与每条询盘的 `confirmation_label` / `attr_change_count` 同源。
  - **已堵的旁路(2026-10-10 自查逐条复现过,各有测试,别拆)**:
    ① **清空也是改**:判断「改没改」用 `f in body`,不是 `!= null` —— 传 `null` 曾能把已确认的 A 级询盘变成无等级,且不留流水。等级任何人都不能清空(`400 invalid_grade`);
    ② **日期也锁**:它决定询盘算进哪个月。顺带只收真实的 `YYYY-MM-DD`(`400 invalid_date`),乱写的日期会落在所有区间之外、悄悄从统计里消失;
    ③ **流水与改动同一个事务**(`repo.updateWithLog`):以前流水先写,后面的校验把请求拒掉后会留下一条没发生过的改动;
    ④ **已确认的询盘录入人不能归档**(归档 = 从考核里消失);归档 / 恢复都记流水(`field='state'`),「改 N」数的是确认状态以外的全部改动;
    ⑤ **彻底删除只认老板**(`403 hard_delete_forbidden`,询盘 / 任务 / 整改三处):界面一直只给老板显示按钮,接口以前却是四个角色都能调,
       而彻底删除会把改动流水、完成结果、证据截图一起抹掉。**界面上藏按钮不是权限,以后加「只给某角色」的操作先写后端判断。**
    **没拦、但看得见的两件事**:还没确认的询盘录入人可以自己归档(录错 / 重复是正常需要)—— 周度审核的 `inquiries.archived_items` 把本期归档的询盘连同归档人列出来
    (**不排除「当天录当天归档」的**,与被删除的任务口径不同:一条 C 级询盘录完就归档,正是最该被看到的那种);
    `deal_status`(是否成交)不锁(它本来就随时间变),但**改动进流水**,审核包的 `inquiries.deals_marked` = 本期被标为成交的询盘(按标记日,询盘可能是几个月前的;
    标了又撤回的、成交后又归档的不算)。在这之前系统答不出「哪天成交的、谁标的」。成交改动**不计入行上的「改 N」**(标成交是正常流程,不是疑点)。
  - **只管「谁能改、改了留痕、未确认看得见」,不改任何考核口径** —— 月度考核照旧数全部询盘。
    旧分支里绑在旧版 KPI 上的「严格模式(只认已确认的询盘)」**没有移植**:现在的考核口径是老板亲定的,要不要只认已确认的询盘得他来定。
  - **来历**:设计与大部分后端代码移植自旧分支 `claude/inquiry-channel-attribution-aed2c6` 的提交 `a298574`。
    **那条分支不要合并** —— 它落后 main 26 个提交,且与已被月度考核替换掉的旧版 KPI(三层考核)绑在一起。
  - **踩过的坑**:`inquiry_field_changes.inquiry_id` 有外键,彻底删除询盘前必须先清流水(`repo.remove` 已处理,有测试),否则 500。
    以后给任何「可被彻底删除」的表加外键子表,都要回头看它的删除路径。
- **GEO 卡已接真实数据(2026-10-10,总览页,原「占位」已撤)** —— `GET /api/geo/summary`(`routes/geo.js` + `services/geo.js` + `public/src/geo.js`)。
  从 GA4 会话来源(`ga4_dimension_daily` 的 `source_medium`)按域名识别 AI 引擎(`services/aiEngines.js`,**加引擎只改那张表**;
  后缀匹配卡在域名边界上,Gemini 先于谷歌搜索判定),给各引擎会话数、占全站比例、与上一等长区间对比;
  外加「AI 引擎带来的询盘」(**只数有表单证据的**)。跟随总览页时间范围。
  - **卡上必须一直挂着的局限**:只有「从 AI 回答里点链接进站」的访问;AI 提到了但没人点的看不到,所以只会低估。
  - **⚠ 域名表没有用真实数据校验过**:本地库没有 GA4 同步数据,识别规则是按 GA4 `source / medium` 的通用格式写的。
    上线后要去卡片上逐个引擎悬停看「GA4 来源值」,确认生产里的实际写法都被归对了。
  - **引用抽查已上线(数据看板 → GEO 抽查)**:`geo_questions`(题库)+ `geo_checks`(每轮记录),规则 `services/geoChecks.js`,前端 `public/src/geo-checks.js`。
    一轮一张「问题 × 引擎」矩阵,每格记 提到 / 引用 / 被引用页面 / 备注,截图走 `attachments(owner_type='geo_check')`。
    **可比性的三条规矩由后端强制**:问题文字**不能改**(`PATCH` 只收 `active`,改字 = 换题,之前各轮就对不上)、
    引擎固定为 `CHECK_ENGINE_KEYS`(ChatGPT / Perplexity / Gemini / Copilot,**改这张表会让历史轮次失去可比性**)、
    汇总分母用**已查的格子**,没查的单独报出来不算没提到;没截图的也单独数(不拦保存)。
    总览 GEO 卡带出最近一轮与上一轮;没查过显示「还没做过」而不是 0。
    已知近似:历史轮次的「应查题数」用的是**当前**启用题数,题库变动后旧轮次的分母会跟着变。
- **投入台账已上线(2026-10-10,导航「数据中心 → 投入台账」)** —— 回答「每个月的钱花在哪」。
  `server/src/routes/spend.js` + 纯函数 `services/spend.js` + 前端 `public/src/spend.js`(全 createElement,**零 innerHTML**)。
  - 钱有三个去处,**各只记一处**:广告费(复用 `kpiLedger.resolveSemSpend`,Ads 同步优先、无则回退 `sem_weeks.cost`)、
    外链(`backlinks` 表)、其它支出(`expenses` 表,类别里**刻意没有「外链」**,否则同一笔钱数两遍)。
  - **`backlinks` 付费与免费同表**,为的是并排比质量:`GET /api/backlinks` 回 `stats`(付费/免费各自的 数量、有效/失效、dofollow、
    平均 DR、**几条里有几条录了 DR**、从未核查数)。`dr`/`traffic` 是第三方工具读数、**人工录入**,没接任何外链工具 API,不录就空着。
  - **诚实口径(有测试焊死)**:不同币种分开列、**绝不相加**;Ads 同步金额标 `ADS_ACCOUNT`(库里没存账户币种,不猜符号);
    广告费没有数据源时金额为空对象,**不是 0**;花了钱的外链必须有币种和日期,否则进不了任何一个月。
  - 两张台账都是**软删**(`deleted_at`),且 `task_id` 只能指向真实任务;挂了花费的任务自动成为「重要任务」。
  - 月份自带选择器,**没有接入 `timerange.js` 的 scope 体系**(钱按自然月看,不需要近 7 天这类区间)。
  - 外链行上的「数据变化」= 它指向的页面在外链上线前后的自然搜索表现(见上面「任务完成前后的数据对比」)。
  - **外链存活自动核查已上线**:`POST /api/backlinks/:id/check`(`services/linkCheck.js`),服务器去外链所在页面取一次源码,找指向登记页面的链接,
    记下页面上实际的属性(`auto_rel`)与锚文本(`auto_anchor`),并指出与台账不一致之处(**买的是 dofollow、页面上是 nofollow 会直接标在行上**)。
    - **这是后台唯一一处「服务器按用户填的网址主动发请求」的代码,SSRF 防线别拆(各有测试)**:只允许 http/https 与默认端口;
      域名解析出的**每一个**地址都必须是公网地址(私网 / 回环 / 链路本地 / 各家云的元数据地址 / IPv4 映射的 IPv6 都拦);
      连接时用自定义 `lookup` **固定使用校验过的那个地址**(防「校验时公网、连接时内网」);跳转最多 3 次且每跳重新校验;
      8 秒无响应超时 + **16 秒总时限**(对方慢慢吐字节时前者永远不触发)、1.5MB 上限(**按解压后算**,防压缩炸弹)、不带 cookie;
      页面内容不回给调用方。路由限流 20 次 / 分钟。`requestPinned` 导出只为测试,**它自己不校验地址,业务代码一律走 `fetchPage`**。
    - **结论三种:`found` / `not_found` / `unreachable`,后两种都不等于失效**(对方常拦非浏览器请求、或用脚本加载链接),
      所以结果只写 `auto_*` 五列,**绝不改人工填的 `status`**;只有 `found` 才更新 `checked_date`。404 / 410 会提示「很可能已失效,请人工确认」。
    - 找链接用**线性扫描**不用正则:对方页面是不可信输入,一堆没闭合的 `<a` 会让惰性正则退化成平方复杂度。
      **`findBacklink` 是同步函数,卡住的是整个后台**。手写扫描第一版也漏了两种形状(2026-10-10 自查复现:4 万个 `<a ` 后只跟一个 `>` 要 6.5 秒;
      2 万条指向本站其它页、都不闭合的链接要 1 秒),现已修并各有耗时测试 —— 改这个函数时三种形状都要过。
    - 读属性时属性名前必须是空白或引号:`data-rel="nofollow"`(灯箱插件常见)不是 `rel`,`data-href` 不是 `href`。
      前者曾误报「属性与台账不符」,后者曾把真链接漏成「没找到」。
    - 对方无视 `Accept-Encoding: identity` 照样压缩时会解开再找(gzip / deflate / br);GBK 等页面按响应头或 `<meta>` 里的编码读,锚文本不乱码。
    - 取页函数可注入(`routes/spend.js` 的 `setPageFetcher`),测试不走真实网络。**已用真实外部站点实测过**(2026-10-10:找到链接 / 404 / 域名不存在 / 57 万字节的大页面)。
    - 没有做定时批量核查,只有逐条手动点。
- **图片附件已上线**(`attachments` 表 + `server/src/routes/attachments.js` + `public/src/attachments.js`):
  询盘「业务反馈」和关键词库「客户信息词库 → 业务反馈」共用。BLOB 存库(生产是 Docker Compose,
  落盘要额外挂卷且 `backup.js` 备的就是这个 .db,存库能跟着一起备份);列表接口只回元数据,
  原图走 `GET /api/attachments/:id/raw`(immutable 缓存,id 不复用)。前端 canvas 压到长边 1600px 再传(GIF 原样传,重绘会只剩第一帧);
  服务端**不信前端报的 MIME,用文件头魔数复验** + `nosniff`,防的是「把 .html 改名 .png 传上来当同源页面打开」。
- 时间范围现影响:询盘、SEO 看板(GSC)、SEM 看板(Ads)、GA4、诊断、询盘归因、总览、KPI。
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
- **ECharts 一律用 canvas 渲染,别用 svg**(2026-10-10 踩过):svg 渲染器靠 `setAttribute('style', …)` 给 `<svg>` 和每个 `<text>` 写样式,
  而本站 CSP 是 `style-src-attr 'none'`,样式被整条丢掉 —— 询盘地图标签的字号 / 字重曾因此完全没生效,且每画一次报 2 条违规。
  已把 `inquiry-globe.js` 改成 canvas(实测违规 0)。`styles.css` 里 `.inq-echarts-map svg / text` 两条规则因此成了死规则(没动那个文件)。
- **前端已没有任何示例数据(2026-10-10 实测 + 测试焊死)**。两件事分开说:① 整改清单 AI 框那两条写死的建议**早在提交 `efdf64e` 就清掉了**,
  本文件却一直写着「仍残留」—— 又是一条没抽验就沿用的旧记录;② 真正留着的是 `charts.js` 里的 **`DEMO` 夹具 + `window.DEMO_MODE` 开关**:
  没有任何地方会打开它,但在控制台敲一行,总览页就会画出假的询盘趋势和等级 / 渠道圆环(注释写的是「便于演示 / 截图」)。这个后台的数是拿来考核的,
  所以连开关带夹具一起删了(`charts.js` 6 处分支、数据源状态卡上的「示例模式」标记、`#ds-demo-tag`)。
  `frontendDataIntegrity.test.js` 有一条测试扫 `public/src`、`index.html` 和打包产物,**出现 `DEMO_MODE` / `DEMO` 就失败 —— 别再加回来,要演示请用测试库**。
  GA4 看板与总览部分 mini 图在没有数据时是空状态(不是假数据)。
- **时间范围已改成「每个页面各存各的」**(2026-08-26,`public/src/timerange.js` 重写):以前全站共用一个 `window._timeRange`,在询盘页点「近一年」,数据看板也跟着变成近一年。
  现按 **scope** 隔离:`dashboard / kpi / inquiry / data / fix`,各自一份 label+range+revision,各自 `localStorage`(`ferr:timeRange:<scope>` / `ferr:customRange:<scope>`;老的全站单 key 只在首次加载时读一次做迁移)。
  - **scope 来自 HTML 上的 `[data-time][data-scope]`,不靠 DOM 推导** —— GA4 面板会被 `mountGa4IntoData()` 搬进数据看板,`closest('.panel')` 会推错;GA4 与数据看板**共用 `data`**(同一屏两个互不相干的时间条会误导人)。
  - `withRange(path, scope|rangeObj)`、`getCurrentRange(scope)`、`getRangeRevision(scope)` —— **业务代码必须显式传 scope**,不传只兜底到当前可见页。
  - `timerange` 事件 detail 带 `{scope,range,revision}`,消费者(charts/kpi-view/ga4-view/app.js)**各自按 scope 认领**;时间模块不再反向调用任何 loader。
  - 顶栏三个 KPI pill 与右上角日期**跟随「当前所在页面」**(`activeScope()`),切页时由 `go()` 重新拉 `/api/overview`;没有时间条的页面落回 `dashboard`。
  - KPI 页两个 donut 不再蹭询盘页的 `_inqCache`,改为按 KPI 页区间自取一份 `_inqKpiCache`(`loadKpiInqDonuts()`),否则会出现「KPI 页写着近30天、圆环画的是询盘页的近一年」。
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
- **改前端函数名前先搜 `data-ui-action` 与经典脚本调用点**:内联 `onclick` 已清零(2026-08-27 实测),但 `data-ui-action` 的字符串键、以及 app.js/hermes.js 对 `window.<name>` 的裸调用改了**同样不会有编译期报错**。改完在活站上验 `typeof window.<name>==='function'`。
- **写进本文件的数字必须是实测的**,并注日期。本文件自称「固定项目真实状态」,一旦数字漂移(2026-07-15 曾查出路由 19→实为 27、index.html 1836 行→实为 1504、innerHTML 47→实为 168;2026-08-13 又漂:1504→1539、内联 handler 157/77→177/82;2026-08-27 再漂:index.html 1539→1062、内联 handler 177→**0**(已全量改事件委托)、innerHTML 236→183 处赋值、路由 29→30),它就从「省 token 的地图」变成「误导人的旧地图」,危害大于没有。**引用前先抽验一个数,对不上就先修文件再干活。**
- 修改后运行相关检查。
- **本机 worktree 跑 `node --test` 固定红 6 条,原因已逐条核实(2026-10-10),全是环境问题、与代码无关**:
  ① `live production check…`:本机不是生产模式;② `风险清单…不返回服务器密钥值`:本机缺 Google 配置,「缺少哪些变量」的清单里出现了变量名,撞上断言里的正则;
  ③ `询盘录入落库新字段…`:精简 `.env` 没有种子口令 → 没有 id=1 的用户 → `created_by` 外键 500;④⑤⑥ 三条 Hermes / 仪表盘 AI:本机没有 AI 密钥 → 503。
  **判断有没有改坏,看的是「除了这 6 条还有没有别的红」。**

## Security Rules

- **不提交 `.env`**。
- **不提交 token、密码、API key**。
- **不把 OAuth client secret、Google Ads developer token、服务器密码写入代码**。
- 密钥只存**服务器环境变量**或**加密存储**(参考 `integrations.js` 的 AES 方案)。
- **前端不能直接接触密钥。**
- 所有**用户输入和 API 返回文本**渲染前必须 **escape**。
- **`innerHTML` 已做过全量审计，并由测试焊住(2026-10-10)** —— 这条以前写的是「近 200 处从未被完整审计过」,现在不是了。
  实测 **203 处 `.innerHTML=` + 1 处 `insertAdjacentHTML` + 1 处 `outerHTML`**(口径 `grep -roE '\.innerHTML\s*=' public --include=*.js --include=*.html | grep -v /dist/ | grep -v /vendor/ | wc -l`),
  共 **1103 个进入 HTML 的表达式**,逐个过了一遍:改了 18 个模块里约 80 处之后,**全部可证明安全**。
  - **工具 `server/scripts/auditHtmlSinks.mjs`**(零依赖,自带一个够用的词法分析;`node server/scripts/auditHtmlSinks.mjs` 可单独跑):
    找出每个写入点的右侧、带标签的模板里的插值、与带标签字符串相加的操作数,要求它是 字面量 / `esc()` / 必然是数字或布尔 /
    只从字面量常量表取值 / 由这些拼成;会顺着局部变量的**每一次**赋值、函数的每条 `return`、`import` 往回追;
    具名函数把参数拼进 HTML 的,义务转给**每一个调用点**(一个调用点都找不到也报)。**函数参数、解构出来的名字、`r.name` 这类字段一律当未知。**
  - **测试 `server/test/frontendHtmlSinks.test.js`**:真实代码零发现 + **18 种故意写错的反例必须全抓到** + 9 种常见安全写法不能误报。
    红了就按提示处理:文字用 `esc()` 包;确实安全但证明不了的登记到 `server/scripts/htmlSinksAllow.json` **并写明理由**
    (现有 6 个已审函数 + 6 条表达式;登记了却用不上的会被报成过期)。**别为了让它变绿顺手登记,先想清楚为什么安全。**
  - **这一轮查出来的真问题**(都已修):周报的周 / 月标识解析不出来时原样进页面和 `data-week` 属性 ——
    而后端以前什么字符串都收(连 `GET ?current=` 都会建行),是**唯一一条「登录用户可写、全员可见」的未转义路径**,
    现在前端转义 + 后端只收 `[0-9A-Za-z-]{4,20}`(`routes/weeklyReports.js`,有测试);KPI 指标单位(设置页里人填的)原样拼接;
    考核期的负责人 / 状态、执行闭环的状态 / 影响级别在不认识的取值下原样回退(后端有枚举校验,属纵深防御);
    时间解析失败时原样截取接口字符串;自定义日期范围从 `localStorage` 原样进页面。其余是给编号 / 计数包一层,使其可证明。
    **CSP 禁止内联脚本,所以这些路径当时能做到的是往页面里塞标记(改版面、伪造内容),不是执行脚本。**
  - **工具管不到的三件事(改这些地方要自己看)**:① 不含任何标签字样的字符串被别的库当 HTML 渲染 ——
    **ECharts 的 tooltip `formatter` 返回值就是 HTML**,只返回 `name + ': ' + value` 的话工具看不出来(现有 4 个都带 `<br/>`,已审);
    ② 链接地址的协议(`javascript:`),转义挡不住,靠 `isHttp()`(现有 `href` 落点都有);③ 经典脚本经 `window.xxx` 调模块函数时传的实参。
  - `hermes.js` 只读不改(另一位在维护):它的 `renderMarkdown` / `inline` 读过实现后登记为已审。

## 协作流程约定

- 修改本地源文件 → 跑必要检查 → commit → push(GitHub: `cassianlee-digital/ferr-ops`,凭据走本机 GCM)。
- **不操作服务器、不索要服务器密码。** 部署由用户在服务器侧执行,Claude 只提供部署指令。
- **项目真实路径:`E:\Claude Code`**(E 盘卷标为「资料」,非目录)。
