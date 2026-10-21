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
- **日计划布局再改版**(2026-10-20,`public/src/plan-tabs.js` 新模块):**三列并排 → 上方 Tab 切赛道**
  (陈 SEM & 社媒 / 李 SEO & GEO / 公司任务),选中那块吃整屏宽,**内部左右分栏:SOP 固定 40% / 每日新增 60%**
  (新增那栏的卡更长——目的/完成标准/结果/证据都在里面——所以拿大头)。1100px 以下退回上下排布。
  - 三列并排时每格只剩三分之一屏宽,SOP 标题一行放不下、任务卡的内容块挤成竖条,这是改版的直接原因。
  - **公司 Tab 沿用「有活才出现」的老语义**(原 `syncCompanyColVisibility`,现由 `syncPlanTabs` 统一管:
    它还要处理「正停在公司 Tab 上而它没了」的退场,两处各管各的会打架)。
  - 默认落哪个 Tab:上次选的(localStorage `ferr:planTab`)> 按登录角色(陈→SEM、李→SEO)> 第一个。
  - ⚠ **`#panel-tasks .sop-list .sop-row` 的 `flex-wrap: wrap` 是承重的**:
    `#panel-tasks .sop-list .tcard { flex-wrap: nowrap }` 特异性更高,只写 `.sop-row` 会被压掉;
    一旦压掉,`flex: 1 0 100%` 的进度条和展开区会跟标题挤在同一行,**标题被压到 min-width、竖排一行一个字**。
- **任务卡 meta 行固定两组**(2026-10-20):`.tmeta-info`(左:徽章/备注/时间段/优先级/天数)+
  `.tmeta-ops`(右:推进/顺延/分发/编辑/删除,`margin-left:auto` 贴右)。
  以前是一长串元素平铺,删除键按「右边还有没有别的东西」在两个 class 间切 `margin-left:auto`,
  同一列里两张卡的时间段徽章一张居左一张居右,眼睛每行都要重新找它在哪。
- **日计划(`#panel-tasks`)原三列版**(2026-08-13):三列(公司/陈-SEM/李-SEO),每列上=SOP 固定清单、下=每日新增。
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
  (`sem sop.xlsx` 的 SEM/社媒、`SEO_GEO每周SOP_月度模板` 的 SEO/GEO)已接进来,**共 59 条**(原文 60 条,SEO S9 与社媒发布合并成一条)。
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
  - **\u504f\u79bb\u6587\u6863\u539f\u6587\u7684\u6761\u76ee\u5fc5\u987b\u5c31\u5730\u5199 `_override`**(\u7406\u7531 + \u62cd\u677f\u65f6\u95f4),\u4e0d\u8981\u9759\u9ed8\u6539\u6570\u3002
    **\u76ee\u524d\u53ea\u6709\u4e00\u6761,\u5355\u6d4b\u76ef\u6b7b\u4e86\u4e0d\u8bb8\u591a**(`sopEngine.test.js`)\u2014\u2014
    \u793e\u5a92 P1\u300cLinkedIn / Facebook \u9002\u914d\u53d1\u5e03\u300d:\u539f\u6587\u662f\u300c5 \u4e2a\u4e3b\u9898/\u5468\u300d,\u9002\u914d\u4e24\u4e2a\u5e73\u53f0\u5373 **10 \u6761/\u5468**;
    SEO \u8868 S9\u300c\u793e\u5a92\u53d1\u5e03\u300d\u5199\u7684\u662f\u300c2 \u6761/\u5929\u300d(D/E \u4e24\u5217\u539f\u672c\u5c31\u6253\u67b6),\u00d7 5 \u4e2a\u5de5\u4f5c\u65e5\u4e5f\u662f **10 \u6761/\u5468** \u2014\u2014
    **\u4e24\u4efd\u6587\u6863\u8bf4\u7684\u662f\u540c\u4e00\u6279\u5e16\u5b50**\u30022026-10-20 \u786e\u8ba4:\u5408\u6210\u4e00\u6761\u653e\u5728**\u793e\u5a92\u8d5b\u9053**,\u6309 `freq='daily'` + `target_qty=2`
    (\u6bcf\u5929\u5f00\u4e00\u683c,\u903c\u7740\u5747\u5300\u53d1,\u800c\u4e0d\u662f\u5468\u4e94\u8865\u9f50);S9 \u72ec\u6709\u7684\u300c\u6bcf\u6761\u5e26\u5b98\u7f51\u5bf9\u5e94\u9875\u9762\u94fe\u63a5\u300d\u5e76\u8fdb\u5b83\u7684\u600e\u4e48\u505a/\u5b8c\u6210\u6807\u51c6\u3002
    **SEO \u8d5b\u9053\u4e0d\u518d\u6709\u53d1\u5e16\u914d\u989d**\u2014\u2014\u540c\u4e00\u6279\u5e16\u5b50\u8ba9\u9648\u548c\u674e\u5404\u8bb0\u4e00\u904d,\u662f\u628a\u4e00\u4efd\u5de5\u4f5c\u7b97\u6210\u4e24\u4efd\u3002
  - **\u6e05\u5355\u91cc\u5220\u6389\u3001\u5e93\u91cc\u8fd8\u7559\u7740\u7684\u6761\u76ee**(\u6bd4\u5982\u5df2\u7ecf\u5bfc\u8fc7\u65e7\u6e05\u5355\u7684\u5e93\u91cc\u90a3\u6761 S9):
    \u5bfc\u5165\u811a\u672c**\u53ea\u62a5\u4e0d\u5220**\u2014\u2014\u5e93\u91cc\u90a3\u6761\u53ef\u80fd\u5df2\u7ecf\u6709\u6267\u884c\u6d41\u6c34,\u81ea\u52a8\u505c\u7528\u7b49\u4e8e\u66ff\u4eba\u505a\u51b3\u5b9a;
    \u4f46\u4e00\u58f0\u4e0d\u541e\u66f4\u7cdf,\u6267\u884c\u4eba\u4f1a\u7ee7\u7eed\u770b\u5230\u4e00\u6761\u5df2\u7ecf\u4f5c\u5e9f\u7684 SOP\u3002\u8981\u505c\u7528\u53bb \u8bbe\u7f6e \u2192 SOP \u624b\u52a8\u505c\u3002
  - **设置 → SOP 有「导入文档 SOP」按钮**(2026-10-21,`POST /api/sop/import-catalog`,仅经理/老板):
    先 dry-run 把「新增几条 / 更新几条 / 库里有而清单里没有的几条」摆出来,确认了再真导 ——
    一次往每个人的日计划里塞几十条清单,不该点一下就发生。
    加这个按钮的原因很实在:导入脚本得在服务器上开终端跑,**实际结果是没人跑**,
    SOP 和它的周目标/工时/完成标准一直躺在仓库里、后台看不到。
  - 导入(命令行):`server/src/db/sopCatalog.json`(由两份 xlsx 生成,正常**勿手改**)+ `npm run import:sop`(幂等,
    键 = `(source, track, title)`;**`active` 永不回写**,停用过的条目重导不会被悄悄打开)。
    **刻意不挂在 migrate 里自动跑** —— 这 60 条是业务内容不是表结构,一次重启往线上塞 60 条清单会让人以为系统疯了。
  - **SOP 固定任务按 日 / 周 / 月 三等份并排**(2026-10-21):以前是「赛道分段 → 段内再按日周月分节」,
    而一个 tab 下有两个赛道(SEM+社媒、SEO+GEO),于是「每周必做」这种标题会出现两次,
    整栏看下来全是小标题、条目反而被埋了。赛道现在靠每行的浅色标签认(标签本身带赛道前缀)。
    列头给本列的达标数(`2/15`),顶部给本周期整体(`本周期 3/22 达标`,日+周,月度不进这个口径)。
  - ⚠ **左右分栏的比例随之从 40/60 改成 60/40**(SOP 占大头):三等份之后 40% 下每列只剩 153px,
    条目全挤成竖条。给 SOP 60% 后每列约 236px。新增栏收到 40% 不吃亏 —— 「今日」卡的网格同时
    从写死两列改成 `repeat(auto-fit, minmax(240px,1fr))`,放不下就退一列,单卡实测从 360px 变成 475px。
    (原来写死两列在 503px 栏宽下会横向溢出:scrollWidth 570 > clientWidth 503。)
  - **文档的工作指标直接铺在标题下面**(2026-10-20,`sop.js metricsLine()`):
    `周目标 3 篇 · 工时 5h · 提升 排名 + 权重` —— 原样来自两份文档的 主要提升 / 周目标 / 单位 / 工时 四列。
    以前这些全藏在 ⓘ 后面,执行人看到的只有一个标题,「要做几个、该花多久、提升什么」每次都得点开才知道。
    **月度条目不在这行重复「什么时候」**:它已经在行右边的时间提示里了(踩过:「首月第 1 周 │ 首月第 1 周 · 工时 2h」)。
    **完成标准不进这行**,挂在行的 `title` 上(鼠标停一下就看得到)——它是一两句话,59 条每条都铺会把这一栏撑废。
  - **每条 SOP 带一个浅色小标签**(`sop_definitions.tag`,如「社媒 · 领英+脸书」「SEO · 文章」):
    **和 track 分开** —— track 是归谁管(算配额用)、tag 是做什么(认人眼用),一个赛道下有好几种活。
    清单里 59 条已全部打好;老条目没填就退回显示赛道名,在 设置 → SOP 里可改。
  - **「同一条证据被记了两次」软提醒**(`server/src/services/sopDuplicate.js`):记流水时拿 `evidence_url`
    去比最近 **60 天**的流水,撞上了就在回执里带 `duplicate`,前端 toast 出黄字——**只提醒不拦**。
    不拦是因为有合理的重叠:李写完集群文章、陈把它排进内容日历再推一轮,同一个链接两边都该算;
    机器分不清协同和重复记账,分得清的只有人。**报的时候「别的 SOP 记过」排在「本条 SOP 记过」之前**
    (前者是一份工作算两份,后者是往自己配额里灌水,两边该做的事不一样)。
    比对前先 `canonicalUrl()` 规范化:去 www / 末尾斜杠 / 锚点 / 跟踪参数(utm_*、fbclid…)、查询参数排序——
    SOP 自己就要求帖子链接打 UTM,逐字比等于白比。
  - 单测 `server/test/sopEngine.test.js`(28 例)焊死配额口径、查重口径 + 任务优先级/时刻的边界校验。
- **SOP 执行率已沉淀进周报**(2026-08-13):`GET /api/sop/stats?from=&to=&today=`(`routes/sop.js`)+ 前端
  `public/src/sop-rate.js`(新模块,`mountSopRate` 被经典脚本 `weekly-review.js` 调用)。周报每个周卡片顶部横跨两列
  显示三方(李/陈/公司)的 `done/expected · %` + **漏了哪条哪几天**。分母三条诚实规则:**未来的日子不算**(`today` 由前端传,
  `counted_to` 回给前端标注)、**SOP 创建之前的日子不算**(起点取 `max(from, created_at)`)、**月度 SOP 不进周口径**(`expected=null`)。
  统计按 `completed_at` 落在区间(不按 period_key——weekly 的 ISO 周号没法跟日期区间比,而 ISO 周只在前端算一份)。
  周卡片折叠居多,故**懒加载**:展开哪一周才算哪一周。
