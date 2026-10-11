# KPI：月度绩效考核、运营总账、询盘归因

> 状态：active
> 守护它的测试：`server/test/kpiReview.test.js`、`server/test/kpiLedger.test.js`、`server/test/kpi.test.js`、`server/test/attribution.test.js`
>
> 这里记的是**口径和踩过的坑** —— 代码里看不出来、忘了就会重犯的那些。「现在有哪些文件 / 表 / 接口」看 `docs/FACTS.md`（自动生成）。
> 2026-10-11 从原来 438 行的 `CLAUDE.md` 里按模块拆出，原文搬运，只更正了几处已核实不成立的说法。

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
       理由不是偷懒:询盘全是人工录入,`channel` 没有任何机器证据(表单接入之前拿不到;见 `docs/modules/inquiries.md` 的「询盘来源」),
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
  - **诚实口径(有单测焊死,`server/test/kpiReview.test.js`)**:
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
- **KPI「运营总账」已上线**(2026-08-26,本分支 `claude/kpi-ledger-deal-status-e41865`):`GET /api/kpi/ledger`(`routes/kpi.js` + 纯函数 `services/kpiLedger.js` `computeLedger`)。老板年终看运营部成绩的一屏业务漏斗:**花费→询盘→优质(A/B)→成交→效率**,按渠道(复用 `attribution.js` 的 `classify`,四渠道同口径)+ 合计,给 优质率/成交率(优质口径+总口径)/每优质成本/CAC。**这是 `inquiries.deal_status` 第一次被 KPI 用上**。诚实口径:SEO/直接/其他 **无媒体花费口径→ NOT_APPLICABLE**(人力不计);SEM 花费**先取 Ads 同步真实值**(`google_ads_campaign_daily`,与 `/api/attribution` 同源,消双真相),无同步数据才回退人工周报 `sem_weeks.cost`,**判有无同步数据用 `ads.campaigns.length` 而非 `totals.costMicros`**(后者 COALESCE 过,0 行也返 0,会把「没同步」误报成「花了 0 元」);单位成本零分母→ `null` + reason(有花费·零成交/零优质),**绝不 Infinity**;未标注是否成交的老行既不算成交也不算未成交,单列 `dealStatusMissing`;币种 Ads=账户币种不加符号(与 `charts.js _money` 一致)、周报=¥,金额目标 `currency_mismatch` 标红。**只读,不进绩效评分**(评分引擎一行未改)。前端 `public/src/ledger.js`(新 ES 模块,全 createElement/textContent、**零 innerHTML 零内联 handler**),自插 `#panel-kpi` 的 `.sheet-tip` 之后,自听 `timerange` 重拉。**优质数/成交数无 kpi_targets 行→显示「目标待定」,不编数。** 测试 `server/test/kpiLedger.test.js`。
- **询盘归因已上线**:`/api/attribution`(`server/src/routes/attribution.js`)按 `channel`(SEO自然/SEM付费/直接/其他,与 `renderInqDonuts` 同口径)+ `grade`(A/B=有效)聚合区间询盘 × Ads 花费,算 SEM **真实每有效询盘成本**并对比 Ads 自报每转化(差距≥1.3倍红字警示"Ads 转化虚高")。前端 SEM 看板顶部「真实询盘回报」卡(`loadAttribution`),随时间范围重算。这是"花的钱值不值"的真实答案,打通 询盘↔花费。
- `server/src/routes/overview.js` 已聚合**真实** KPI(月度快照 + 环比)。
