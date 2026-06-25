Task: 6.23 修改文档 31 条全部落地；等服务器 pull+rebuild 强刷验收最后一批
Changed files: 本轮已全部提交（origin/main=8e2c099）
Checks: 列对齐核过（询盘表 thead 10 / inqRowHtml 10 / colspan 10）；后端 PATCH lockOriginalGradeIfNull 幂等；纯前端时间条/SOP/归档/分页器/进度图/自定义时间/总览当月按日 + 单 backend 修补（lockOriginalGradeIfNull）
Commit: ... +5279cc9(14-A)+39e7ebb(询盘3列后端)+87eceda(询盘前端)+8e2c099(2/3/4/5/26/27+反馈修补)；origin/main=8e2c099
Blockers: 待验收 8e2c099：①跟踪反馈截断不溢出 ②历史 C 改 A 立即标红 ③关键词每页条数下拉记忆 ④KPI 李/陈 gauge 圆环 ⑤时间条「自定义」弹框 ⑥总览 KPI 1/3+趋势 2/3+GEO 占位 ⑦总览询盘当月按日+悬停 tooltip

## 已完成（待验收）
- 归档地基 ①②③：loop_items/fixes 8 列状态机 + 资产库归档页(三 subtab) + 任务按 task_date 惰性归档
- SOP 引擎 A/B/C：2 张新表(sop_definitions/sop_completions) + loop_items.urgent 列；设置页 SOP 设置(仅经理+老板可写) + 任务看板替换硬编码 SOP 卡(动态加载/周期 key 完成态);Step C 未做提示 banner + urgent banner + 侧栏红点
- 用户文档 6.23 修改文档 31 条逐条对照:
  - ✅ 1 资产库/归档页 / 16 计划已完成自动归档 / 17 测试沉淀+归档 / 18 整改沉淀+归档 / 19 公司新派 / 20 任务自动消失 / 21 未做提示 / 22 侧栏红点 / 23 SOP 完成入库 / 24 SOP 设置 / 29 归档溯源
  - ✅ B 组止血 5 条 BUG (15/23/28/6/31-B1)
  - ⏳ 剩余:总览页改造(2/3/4)、KPI 个人进度图(5)、询盘新列+标记+改等级(7/8/9/10/12)、删销售确认列(11)、删 metric 框 + 对齐+环比(13/14)、自定义时间(26)、每页条数 27、AI 三连入库切 state(28 正式版,当前指纹反查临时方案)、保留一年(30 多为不删，确认无清理即可)、刷新后失效系统排查(31 主体已解，可再过)

## C 组主条目已全部完成（待验收）
C-1 关键词分页 / C-2a 三框时间筛选 / C-2b 询盘趋势真实化 / 询盘按月折叠+近一年(预设4个:近7天/近30天/近90天/近一年)

## 剩余 backlog（下一步候选，非 C 主条目）
- 看板真实化：seoMini/semMini 两条 sparkline、inqDonut(A/B/C 占比)、chanDonut(渠道占比) 仍 chartEmpty；后两个 donut 可直接用 _inqCache 真实聚合(类似 C-2b)。
- 非阻断：GSC/GA4/Ads 同步未接(OAuth 已定单独立项)；loadClosedLoop 静默 catch；前端模块化；SEO「近6周」列为可编辑文本非 sparkline。

## 已完成（待验收）
- B-4 任务弹框(后端加 task_date/task_hour/note，migrate 幂等)、B-5/B-6 设置左竖栏+个人资料
- C-1 关键词每表20分页(applyKwPaging 统一可见性=分类∩页)
- C-2a 三框时间筛选(预设7/30/90+自动日期+粒度白名单；SEO 月汇总；无按天假数据)
- C-2b 询盘趋势真实化(inqSeriesByGran 按天/周/月聚合；询盘条加 day,week,month)

## C 组剩余 backlog（下一步候选）
- 询盘：自动折叠上月、可查看近一年。
- seoMini/semMini/两个 donut 仍 chartEmpty(真实聚合 TODO)。
- 已知非阻断：GSC/GA4/Ads 自动同步未接(OAuth 已定 B 组后单独立项)；loadClosedLoop 静默 catch；前端模块化；SEO「近6周」列为可编辑文本非 sparkline。

## C-2 进度与剩余
方案：前端分桶(不动后端)。三框=预设(7/30/90)+自动日期(只读)+粒度(按模块 data-gran 白名单)。
诚实模型(已确认)：询盘=天/周/月；SEO/SEM=仅周/月+「按周记录」；真按天等 GSC/GA4。
- C-2a(已写未提交)：三框 UI + 默认近30天 + 粒度只挂数据看板(week,month)驱动 SEO 折线月汇总(seoSeriesFromWeeks 按 ym 求和；mapSeoWeek 加 ym)。
- C-2b(下一步)：点亮询盘趋势图 inqTrend——用 window._inqCache(真实日行)按 天/周/月 分桶画真实折线；询盘页时间条加 data-gran="day,week,month"。SEM 折线月汇总同理(若有消费图)。
- 关键函数：时间条渲染/事件 ~1118-1156；seoSeriesFromWeeks ~2188；loadInquiries/inqTrend ~1465；rebuildSeoChart ~2204。
- 注：updateSeoChart 是死代码(只定义未调用)，可顺手清，本轮未动。

## C-2 已定方向（下一步出详案）
三框时间筛选：①预设(7/30/90天) ②自动填日期 ③粒度(天/周/月)。
诚实硬约束（用户已确认）：粒度按模块真实数据粒度动态给——询盘=天/周/月(按天入库可聚合)；SEO/SEM=仅周/月并标注「按周记录」(无日数据)；真按天等 GSC/GA4。
必须后端真按粒度重聚合，不能只做前端样子。现有基础：[data-time] 时间条 + resolveRange/withRange + timerange 事件已存在；/api/inquiries、/api/seo-weeks、/api/sem-weeks 已支持 start_date/end_date(Phase 1e)。
C-2 分两阶段：C-2a 三框UI+动态粒度白名单+自动日期框；C-2b 后端按粒度聚合(询盘按天滚周/月；seo/sem周滚月)+前端如实渲染。动手前先单独出详细文件清单。

## B-4 已定稿计划（明天直接照做）
持久化：loop_items kind='task'（非新表）。后端先改，顺序：migrate.js → repo → route → 前端。
后端加 3 列（loop_items，沿用「列+注释」风格）：
  - task_date TEXT（任务:日期可选）、task_hour TEXT（任务:今日完成小时）、note TEXT（任务:备注）
  1) migrate.js：CREATE TABLE loop_items 在 created_at 前加 3 列；ensureColumns('loop_items',…) 追加这 3 个幂等 ALTER。
  2) repo loopItems.create：INSERT 加 @task_date,@task_hour,@note；update allowed 追加这 3 个。
     注意 better-sqlite3 命名参数要齐——由 route 统一补 null（route 是 create 唯一调用方，seed 不写 loop_items）。
  3) route loopItems POST：item 加 task_date:s(b.task_date,20)、task_hour:s(b.task_hour,10)、note:s(b.note,400)（非 task 传 null 无影响）。
前端（public/index.html，复用 .modal-mask 体系，仿 #inqMask）：
  - 新增 #taskMask：部门(只读)、日期(input date 默认今日,可选)、今日完成时间(select 小时 00-23,可空)、任务内容(textarea 必填)、备注(textarea 可选)。
  - 模块级 _taskScope；openTaskModal(dept) 设 scope+重置+openModal；submitTask() 校验内容非空→API.post /api/loop-items {kind:'task',dept,content,owner,status:'待办',task_date,task_hour,note}→addTaskCard+closeModal+toast。
  - 3 个按钮（约 719/734/744 行）onclick 由 addPersonalTask/addCompanyTask 改 openTaskModal('SEM'/'SEO'/'公司')；旧两函数删/留空壳。
  - addTaskCard（约 1119 行）在 .tmeta 加渲染：有 task_date/task_hour 显示「📅日期 ⏱HH:00」、有 note 显示 dim 备注（全 esc）。loadClosedLoop 对 kind='task' 已传 it，刷新自动带出，无需另改。
用户已确认：小时下拉 00-23 + 卡片上显示日期/小时/备注。
风险低：看板是 div 卡片非表格，无 thead/td 列数对齐问题。

---

## 已上线代码（origin/main = 785b7c5，但服务器需 pull+rebuild 才生效）

### A 组（commit 793a712）—— 全部前端
- 整改清单「截止日期」、测试登记「起止」改原生 `<input type="date">`（起止=两个日期合成 `start~end`），change 即存。
- 关键词删除「就地确认」（点删除→变红「确认删除」，3 秒内再点才删）。
- 所有 `.dt` 表格加浅色竖分割线。
- 关键词库「加词」工具条 + 表头 sticky 固定。

### B 组 part1（commit 785b7c5）
- B-1：关键词库 4 表最前加「添加时间」列（只读 created_at）。
- B-2：SEO/SEM 关键词后加「搜索意图」列（tagselect 6 预选+配色：信息型/商业调研型/交易型/导航型/规格标准型/灵感案例型，存 attrs.searchIntent）。
- B-3：沉淀表加「分析」可编辑列。**后端**：loop_items 加 `analysis` 列（migrate.js SCHEMA + ensureColumns 幂等加列 + repo allowed）。
- 列对齐已严格核对：SEO 11、SEM 8、高价值 7、客户 5、沉淀 5，均 thead=td。

## ⚠️ 部署提醒（务必）
服务器：`cd /opt/ferr-ops && sudo git pull origin main && sudo docker compose up -d --build`。
B-3 加了数据库列 → 启动时 `migrate()` 的 `ensureColumns` 会自动 `ALTER TABLE loop_items ADD COLUMN analysis`（不清库、不丢数据）。部署后**强刷浏览器**验：关键词库列对齐+添加时间+搜索意图可选、沉淀表分析列可填并刷新仍在、A 组四项。

## B 组剩余（下一步从这里继续）
- B-4：任务看板「新增任务」改弹框（选日期 + 今日完成时间(小时) + 任务内容 + 备注）。**需后端**：tasks 走 loop_items(kind='task')还是新表，先查 addTaskCard 的持久化路径再定字段。B 里最大。
- B-5：设置页改 TAB（指标修改 / 等级阈值 / 数据源状态 / API 接入 分页签）。纯前端。
- B-6：顶栏个人信息移入设置「个人资料」。纯前端。

## C 组 / 其它 backlog（更大，单独立项，勿混入 B）
- C-1：关键词每表最多 20 条 + 超出分页。
- C-2：三框时间筛选（框1：最近7/30/90天；框2：自动填日期；框3：粒度——7天只能按天/30天天或周/90天天周月；中文显示）。**硬约束**：按粒度筛选后数据必须如实按该粒度展示；且 SEO/SEM 是按周录入、没有日数据，"按天看"做不出来→粒度按各模块真实数据粒度动态给，不造假。
- 询盘：自动折叠上月、可查看近一年。
- 已知非阻断 TODO：GSC/GA4/Ads 自动同步未接；loadClosedLoop 加载失败仍静默；部分静态看板真实化；前端模块化；SEO「近6周」列现为可编辑文本（非 sparkline）；询盘写入角色为 editor（非仅销售）。

## 工作规则（MVP 上线稳定版）
- 只做对上线有价值的事；非阻断只记 TODO 不现场修；不做 GSC/GA4/Ads OAuth、不做 UI 美化、不做前端模块化。
- 改动小步：一项→核对列对齐/括号→（用户验收）→commit→push。涉及后端先改 migrate/路由再接前端。
- 提交只 stage 业务文件；**不要** stage/恢复用户删除的 `FERR运营后台_需求文档.md`，不要提交 `.claude/`、`AGENTS.md`。不用 `--no-verify`。
- 本机无 Node/Docker，无法实跑/浏览器验证 → 运行级验收由用户在服务器/浏览器做。
- 每轮结束用 5 行更新本文件：Task / Changed files / Checks / Commit / Blockers。
Task: Codex updated AI collaboration flow: persistent AI analysis records, analyzed button state, wider chat-style AI modal, follow-up chat, adopt/deposit/archive actions.
Changed files: public/index.html; server/src/routes/ai.js; server/src/db/repositories/aiAnalyses.js; server/src/db/migrate.js. Note: migrate.js already had unrelated Google sync local changes before this task; do not commit blindly with mixed worktree.
Checks: git diff --check passed for public/index.html, server/src/routes/ai.js, server/src/db/repositories/aiAnalyses.js, server/src/db/migrate.js. Node runtime is not available in this shell, so app start / node syntax checks were not run.
Commit: Not committed / not pushed because the worktree contains unrelated existing changes.
Blockers: Need run `cd server && npm run migrate`, start app, then browser-check AI analyze -> 已分析 -> reopen history -> chat -> adopt/deposit/archive.
