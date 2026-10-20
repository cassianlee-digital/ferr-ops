# 任务：可审计任务、改动留痕、前后数据对比、日计划、SOP

> 状态：active
> 守护它的测试：`server/test/taskAudit.test.js`、`server/test/taskAuditRoutes.test.js`、`server/test/taskChanges.test.js`、`server/test/taskEffect.test.js`
>
> 这里记的是**口径和踩过的坑** —— 代码里看不出来、忘了就会重犯的那些。「现在有哪些文件 / 表 / 接口」看 `docs/FACTS.md`（自动生成）。
> 2026-10-11 从原来 438 行的 `CLAUDE.md` 里按模块拆出，原文搬运，只更正了几处已核实不成立的说法。

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
    **跨天改单日也堵上了(2026-10-11)**:执行人把跨天任务改成单日,流水里多记一个 `multi_day` 记号,这条任务继续按重要任务要证据
    (原因显示「原本是跨天任务」;同一个请求里又改日期又勾完成一样拦)。**经理 / 老板改的不记** —— 那是重新定范围。
  - **任务改动留痕(2026-10-11)**:表 `loop_item_changes`,规则在 `taskAudit.taskChanges(cur, next)`(纯函数),仓库 `repositories/loopItemChanges.js`。
    询盘改渠道 / 等级早就留痕,任务以前没有:完成之后还能改标题、把截止日往后挪,一点痕迹都不剩。
    - **记什么**:内容 / 负责人 / 部门 / 项目 / 起止日 / 预估工时 / 重要标记;完成结果 / 动作 / 证据 / 实际用时**从空到有不记**(那是「完成」本身),之后再改才记;
      外加两个合成项 `done`(完成 ↔ 撤销,撤销会清掉 `done_at`)和 `multi_day`(见上)。备注、时段、思考框架不记 —— 记得太多,要看的就被淹了。
    - 改动与流水**同一个事务**(`repo.updateWithLog`),被拒的请求不留痕(有测试)。**没有外键**,彻底删除时由路由显式清。
    - 入口:任务卡 / 归档行上的「改 N」(不数 `done` / `multi_day`)→ `GET /api/loop-items/:id/changes`。
      弹框与询盘的改动流水共用一个(`public/src/change-log.js`,调用方给标题、接口和「每条怎么念」)。
    - 周度审核包每条任务带 `changes`(**落在区间内的**改动),并多三条疑点:`DUE_MOVED` 截止日被往后改过 / `SHORTENED` 跨天被执行人改成单日 /
      `EDITED_AFTER_DONE` 完成之后又改了内容、结果或日期。**疑点按全部流水判**(它是这条任务的事实,不是某一周的事)。
  - **任务的三个日期只收真实的 `YYYY-MM-DD`**(`task_date` / `start_date` / `task_verify_date`;`400 invalid_date`),空串存成 NULL;
    请求动了起止日时还要求开始日不晚于截止日(`400 bad_date_range`)。**老数据不追溯,计划 / 测试 / 沉淀不走这套**(它们的日期字段另有用法)。
    以前什么字符串都收:截止日写成 `10/12` 的任务比不过任何区间,既不逾期也不在做,从周度审核里凭空消失。校验函数 `lib/parseDateRange.js` 的 `isIsoDate`,询盘也用它。
  - **门槛只保证「填了」,不保证「填得对」**。证据能不能支撑结论,由周度审核(规则疑点 + AI 意见)去看。
  - **勾完成改走完成弹框**(`#taskDoneMask`):`chk()` 不再直接 PATCH done,入库成功后才标勾;取消 = 什么都没发生。
    卡片重画走 `taskchanged` 事件(app.js 派发、closed-loop.js 订阅)—— 这就是 `docs/modules/frontend-architecture.md` 里说的「事件反转」的第一处落地,
    顺带没有加宽 closed-loop.js 的导出面。**公司大任务完成现在会先戳 `done_at` 再归档**(以前直接归档,完成时刻是空的)。
  - 证据截图复用 `attachments`(`owner_type='task'`)。归档页任务行带出结果/动作/证据/关联/工时。
  - 日计划按日期回放(`plan-history.js`)的任务行也带审计信息;**完成结果 / 动作 / 证据只在「那天或之前已完成」时显示** ——
    回放是那一天的视角,不把事后写的结论摆进更早的日子。
  - **测试登记的门槛**:`POST /api/loop-items/:id/archive` 对 `kind='test'` 要求 `conclusion` 非空,否则 `400 conclusion_required`
    (放弃的测试也要写明为什么放弃;已归档的不追溯;计划不受限)。
- **任务完成前后的数据对比已上线(2026-10-10,第二阶段)** —— `GET /api/loop-items/:id/effect?days=7|14|28`,
  纯函数 `services/taskEffect.js` + 组装 `services/taskEffectData.js`(**周度审核包直接复用 `buildTaskEffect`**)+ 查询 `repositories/taskEffect.js`。
  按 `task_links`:页面/关键词 → GSC(点击/曝光/曝光加权排名),系列 → Ads(花费/点击/转化/每转化成本),关键词在 Ads 有数据时多列一行。
  - **口径(有测试焊死,别改松)**:前后窗口**永远等长** —— 完成后数据没满 N 天时两边一起缩短并标 `PARTIAL`
    (拿 14 天前窗口比 5 天后窗口,任何任务看起来都在跌);**完成当天两边都不算**;完成时刻按 **Asia/Shanghai** 归日
    (`done_at` 是 UTC,北京早上勾的任务直接取 UTC 日期会错开一天);两边都没数据标 `NO_DATA`,不画 0 → 0。
  - **同时给全站 / 全账户同期变化当参照**,并在响应里带一句 `note`:「只说明之后变了,不能证明因此变了」。界面原样显示。
  - **多站点下按页面的域名认站点(2026-10-12,`taskEffectData.siteScopes`)**:以前一律查默认站点,任务关联了别的站的页面永远是「没有数据」,看起来像那个页面没人搜。
    现在页面各用各自所在站点的数据,**窗口也各算各的**(每个站点同步到哪天不一样);关键词和参照行(全站同期)跟这条任务的「主站点」走 ——
    第一个认得出站点的页面所在的站,一个都认不出就是默认站点;广告系列不分站点(账户级)。响应里的 `site` 是主站点名,
    页面所在站点和主站点不同的那一行另带 `site`,界面都标出来。没登记站点时等价于以前。测试 `server/test/taskEffectSites.test.js`。
  - **KPI 关联只记声明(`DECLARED`),不做单条任务的前后对比** —— A/B 询价数量是部门级的数,拆不到单条任务。
  - 只读现算不落库(同步数据会补齐,今天的「数据未满」过几天该变完整)。入口:已完成任务卡 / 归档行上的「数据变化」。
  - **外链也接上了**:`GET /api/backlinks/:id/effect`,原点 = 外链上线日,对象 = 它指向的页面。任务与外链共用 `taskEffectData.js` 里的
    同一个 `buildEffect`,弹框也是同一个(`task-audit.js` 的 `openEffect(path)`);**没有原点时的原因由后端给**(`status` + `message`),前端不各写一份。
  - **GA4 落地页也进了对比**:任务 / 外链关联的页面如果在 GA4 里有落地页数据,多列一行「作为落地页」的 **进站会话 / 关键事件**,并带全站 GA4 同期作参照。
    GA4 的落地页维度是「路径 + 查询串」,同一页面会被广告参数拆成多行 —— `repositories/taskEffect.js` 的 `ga4LandingPage` **按路径归并**
    (带不带尾斜杠、后面跟不跟查询串都算同一页),`LIKE` 的 `%` / `_` 已转义(路径里有下划线是常事)。只在 GA4 真有该页面数据时才列这一行。
    **⚠ 落地页取值格式没有用生产数据校验过**(本地没有真实 GA4 数据,按 `landingPagePlusQueryString` 的通用格式写的)。
- **整改→日计划→回写也已通**(2026-08-13):整改清单每行「排入」→ `POST /api/fixes/:id/plan`,
  按整改的 dept/owner/title/due_date 建任务卡并写 `loop_items.fix_id`(**幂等**:已排过返回原任务 `existed:true`;整改已归档回 409),
  同时把整改状态推到「进行中」。任务勾完 → `PATCH /api/loop-items/:id` 在路由里**回写** `fixes.status='已改'`,撤销回「进行中」;
  状态为「放弃」或已归档的整改不被任务牵着走。`GET /api/fixes` 每行带 `planned_task_id`/`planned_done`,
  整改清单一眼看出哪条还没人接。日计划卡上有「整改」出身标,点击跳回整改清单看依据。
  至此闭环为:**数据 → 诊断 → 整改 → 谁的今日 → 打卡推进 → 完成回写**。
- **日计划(`#panel-tasks`)已改版**(2026-08-13):三列(公司/陈-SEM/李-SEO),每列上=SOP 固定清单、下=每日新增。
  - SOP 日/周/月**合并成一个清单框**,一条一行,频率是行尾标签(`src/sop.js renderSopCards/sopCardEl`)。
  - 任务卡单行、无彩色边条;三列各自 `max-height:64vh` 滚动(1280px 断点下撤销,见 `page-tasks.css` 注释)。
  - `loop_items` 加 **`start_date`**(开始日),`task_date` 语义=**截止日**。两者构成跨天任务:
    `逾期(截止<今天) / 今日(截止=今天或无日期) / 进行中(已开始未到截止) / 稍后`,**分组只在 SEM/SEO 列**,公司列平铺。
    跨天卡显示「第 N/M 天」、逾期卡显示「逾期 N 天」+ 两个出口(顺延到今天 / 放弃并归档)。
  - **日期胶囊改成 Todoist 式轻弹层**(2026-10-20,`public/src/task-pickers.js` 新模块):点胶囊(或已排时刻的卡上那枚
    `.ttime-badge`——它会把胶囊藏掉,不挂入口就再也点不开)出**快捷日期(明天/本周稍后/本周周末/下周/没有日期)
    + 双月月历 + 时刻二级面板**,直接 PATCH;整张编辑弹窗挪到卡上新增的铅笔按钮。
    弹层**无条件夹进视口**(三列各自滚动,锚点常在可视区边缘)、滚动即关(留 250ms 静默期,否则惯性滚动让它一开就关)。
  - **任务优先级**`loop_items.task_priority`(INTEGER 1-4,1 最高、NULL=4 普通,**老数据不回填**):
    卡上小旗(红/橙/蓝/灰,与 tagselect 的 priority 同色序)、弹窗里一颗胶囊。
    **排序改成「先优先级后时刻」**(`sortTaskCardsByTime` 的 `cmpHour`)——否则设了优先级跟没设一样。
  - **`task_hour` 从整点 'HH' 放宽到 'HH:MM'(15 分钟步进)**,两种格式并存:字符串比较仍成立(`'09' < '09:30' < '10'`),
    但**解析必须走 `task-pickers.js` 的 `hourToMin()`**,`Number(hr)*60` 碰到 `'09:30'` 得 NaN,整列时间段跟着错位。
    服务端 `routes/loopItems.js` 的 `hhmm()` 在 POST/PATCH 两处都卡格式,脏值落 null 不入库。
    语义没变:它仍是**预计完成时刻**,开始时刻由 `annotateTaskTimes()` 按上一条的结束时刻顺推(08:30 起、扣午休);
    故**不收「持续时长」**——那在本项目是推导值,收进来两套算法打架。
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
- **SOP 引擎 v2:从「一个勾」改成「一条流水」**(2026-10-20)。老板那两份 SOP 文档
  (`sem sop.xlsx` 的 SEM/社媒、`SEO_GEO每周SOP_月度模板` 的 SEO/GEO)已原样接进来,**共 60 条**。
  - **为什么改**:`sop_completions` 一个周期只能记一个勾,答不了两件事 ——
    ①「今天的 SOP 和昨天的区别」(同一条「社媒发布」,昨天 FERR 技术选型、今天 BAFAW 连接方式,勾长得一模一样);
    ②「一周 5 篇发了几篇」(文档 D 列「周目标」+ E 列「单位」是数量,布尔勾装不下 3/5)。
  - 新表 **`sop_logs`**(sop_id, period_key, day_key, qty, subject, detail, evidence_url, logged_by),一次执行一行。
    **`sop_completions` 一行未改**,打一条流水的同时 upsert 一条 completion ——
    周报执行率(`/api/sop/stats`)、日计划回放(`routes/dailyPlan.js`)那套老口径全部原样成立。
  - `sop_definitions` 扩了 12 列:`track`(SEM/社媒/SEO/GEO/公司)、`code`、`target_qty`、`unit`、`effort_h`、
    `metric`、`why`、`how`、`done_when`、`subject_label`、`sort_order`、`source`。
    **日计划仍是三列**(公司/陈-SEM/李-SEO),赛道只在列内分段 —— 社媒归陈、GEO 归李,但配额各算各的。
  - **两个判据别混用**(`public/src/sop.js`):`isLogged`=有 `subject_label` → 走「记一条」,
    `hasQuota`=isLogged 且 `target_qty>0` → 画进度条。「周一看数」周目标也写着 1 次但没有对象可填,维持原来的勾。
    服务端 `POST /api/sop/logs` 的必填判据同样是 **`subject_label` 不是 `target_qty`**。
  - **周目标 / 日目标两种**:`freq='weekly'` 的 `target_qty` 是周目标,`freq='daily'` 的是日目标。
    文档里确实有「2 条/天」(SEO S9 社媒发布),折成周目标会丢掉「每天都要发」——周五一口气补 10 条照样满分。
  - **偏离文档原文的条目必须就地写 `_override`**(理由 + 拍板时间),不要静默改数。
    目前只有一条:**S9「社媒发布」** 文档 D 列写「周目标 2」、E 列写「条/天」,两列口径冲突,
    2026-10-20 老板拍板按**每日 2 条**,故它是 `freq='daily'` + `target_qty=2`。
  - 导入:`server/src/db/sopCatalog.json`(由两份 xlsx 生成,正常**勿手改**)+ `npm run import:sop`(幂等,
    键 = `(source, track, title)`;**`active` 永不回写**,停用过的条目重导不会被悄悄打开)。
    **刻意不挂在 migrate 里自动跑** —— 这 60 条是业务内容不是表结构,一次重启往线上塞 60 条清单会让人以为系统疯了。
  - 单测 `server/test/sopEngine.test.js`(17 例)焊死配额口径 + 任务优先级/时刻的边界校验。
- **SOP 执行率已沉淀进周报**(2026-08-13):`GET /api/sop/stats?from=&to=&today=`(`routes/sop.js`)+ 前端
  `public/src/sop-rate.js`(新模块,`mountSopRate` 被经典脚本 `weekly-review.js` 调用)。周报每个周卡片顶部横跨两列
  显示三方(李/陈/公司)的 `done/expected · %` + **漏了哪条哪几天**。分母三条诚实规则:**未来的日子不算**(`today` 由前端传,
  `counted_to` 回给前端标注)、**SOP 创建之前的日子不算**(起点取 `max(from, created_at)`)、**月度 SOP 不进周口径**(`expected=null`)。
  统计按 `completed_at` 落在区间(不按 period_key——weekly 的 ISO 周号没法跟日期区间比,而 ISO 周只在前端算一份)。
  周卡片折叠居多,故**懒加载**:展开哪一周才算哪一周。
