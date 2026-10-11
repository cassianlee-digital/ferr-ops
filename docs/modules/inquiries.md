# 询盘：评级表、来源、确认权与改动留痕、附件

> 状态：active
> 守护它的测试：`server/test/attributionGate.test.js`、`server/test/inquirySource.test.js`、`server/test/frontendDataIntegrity.test.js`
>
> 这里记的是**口径和踩过的坑** —— 代码里看不出来、忘了就会重犯的那些。「现在有哪些文件 / 表 / 接口」看 `docs/FACTS.md`（自动生成）。
> 2026-10-11 从原来 438 行的 `CLAUDE.md` 里按模块拆出，原文搬运，只更正了几处已核实不成立的说法。

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
    给站点负责人的接入说明在 `docs/INQUIRY_INTAKE.md`(含 Ads 跟踪模板)。**独立站表单由老板来改(用户 2026-10-10 答复)**。
    独立站是 **WordPress + Fluent Forms**(用户 2026-10-11 答复),站点侧已写成现成插件 `integrations/wordpress/ferr-intake/`:
    `ferr-source.js` 在访客浏览器里记「最近一次从站外进来」的来源并填进名叫 `ferr_source` 的隐藏字段(JSON 的 base64url —— 表单插件会清洗文字,直接放网址会被改坏);
    `ferr-intake.php` 挂 Fluent Forms 的 `fluentform/submission_inserted`,由 WordPress 服务器带密钥发给后台,失败重试三次。免费版 Fluent Forms 即可(它的 Webhook 是 Pro 功能,没用)。
    **两边的约定由 `server/test/sitePlugin.test.js` 盯着**:脚本在假浏览器里跑、PHP 在假 WordPress 里跑(`server/test-support/wpStub.php`),发出的请求体交给 `normalizeLead`。
    **⚠ 没在真实的 WordPress 上装过**:Fluent Forms 的钩子名和参数是照它的官方文档写的;表单里各字段的 Name Attribute 要老板对着表单核一遍(接入说明第 4 步)。
  - **AI 引擎暂归渠道「其他」**:渠道目录只有四个值,加第五个会牵动考核口径,是老板要定的事。引擎本身记在来路里。
  - 邮件 / WhatsApp 直接来的询盘带不了参数,仍是人填 + 对账。历史询盘不回填。
- **询盘的确认权与改动留痕已上线(2026-10-10)** —— 等级(A/B/C)决定月度考核里 60 分的 A / B 询价数量,渠道决定「这条询盘算谁带来的」,
  而录入人自己就能填、能改。没有表单证据的询盘拿不到独立于录入人的机器证据,能立的只有流程规矩。
  规则在 `routes/inquiries.js` + `repositories/inquiries.js`,前端 `public/src/inquiry-attribution.js`(与 inquiry-sales / inquiry-source 同模式,
  反向走 `attributionchanged` 事件)。测试 `server/test/attributionGate.test.js`。
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
- **图片附件已上线**(`attachments` 表 + `server/src/routes/attachments.js` + `public/src/attachments.js`):
  询盘「业务反馈」和关键词库「客户信息词库 → 业务反馈」共用。BLOB 存库(生产是 Docker Compose,
  落盘要额外挂卷且 `backup.js` 备的就是这个 .db,存库能跟着一起备份);列表接口只回元数据,
  原图走 `GET /api/attachments/:id/raw`(immutable 缓存,id 不复用)。前端 canvas 压到长边 1600px 再传(GIF 原样传,重绘会只剩第一帧);
  服务端**不信前端报的 MIME,用文件头魔数复验** + `nosniff`,防的是「把 .html 改名 .png 传上来当同源页面打开」。
