# Google 同步与数据看板（GSC / GA4 / Ads）

> 状态：active
> 守护它的测试：`server/test/googleHighlights.test.js`、`server/test/productionReadiness.test.js`、`server/test/sites.test.js`
>
> 这里记的是**口径和踩过的坑** —— 代码里看不出来、忘了就会重犯的那些。「现在有哪些文件 / 表 / 接口」看 `docs/FACTS.md`（自动生成）。
> 2026-10-11 从原来 438 行的 `CLAUDE.md` 里按模块拆出，原文搬运，只更正了几处已核实不成立的说法。

- **多站点(2026-10-12 起,分三步;第 1、2 步已做)** —— 一个谷歌账号下有好几个网站(贝孚特两个、费尔瑞两个,以后还会加),后台以前只认其中一个。
  - **「站点」= `google_projects` 表里的一行**:一个网站 + 它的 Search Console 资源 + 它的 GA4 媒体资源 + 域名 + 所属公司。
    这张表和它的增删改接口早就有,数据表也早就按站点 / 媒体资源 / 账户分开存,**缺的只是界面、和「每个站都同步」**。规则在 `server/src/services/sites.js`(纯函数)。
  - **第 1 步(已做)**:设置 → API 接入 → 「站点管理」(`public/src/sites.js`,零 innerHTML);每天自动同步**所有**启用的站点;每个站点可单独「立即同步 / 补 90 天历史」。
    - **Ads 是账户级的**:几个站共用一个 Ads 账户,按系列区分。所以同步计划(`syncPlan`)里 GSC / GA4 每站一次,**Ads 同一个客户编号只一次**;新站点没填 Ads 编号就沿用现有账户。
    - **第一次加站点时,原来在用的那个站自动登记成默认站点**(`routes/google.js` 的 POST)。不这么做的话,新加的站会变成「默认」,所有看板一声不响换成另一个网站的数据。
      原来留下的、没有归属的同步记录同时归到它名下。
    - **同一份数据不能记在两个站点上**:域名 / Search Console 资源 / GA4 媒体资源在启用中的站点里各自唯一(`409 site_exists`);域名和资源必须是同一个站(`400 domain_mismatch`,防选错行)。
    - **默认站点不能直接取消、不能直接停用**(否则「默认」会悄悄落到别的站上):要换,把另一个设为默认。停用是软的,已同步的数据保留。
    - **新鲜度按站点各看各的**(`syncSites.staleTargets`):一个站刚同步过,不能替另一个站「显得新鲜」。
    - **GSC 明细以前只取第一页**(接口单次上限 25000 行):区间一长,后面的行悄悄没了、且没有任何报错 —— 原来的「回补 90 天」按钮就有这个问题。
      现在翻页取全(`gsc.js` 的 `queryAllRows`);真翻到上限还没完会标 `truncated` 并在界面上说。补历史另外按 30 天一段分段取(`backfillChunks`),某段失败就停在那段,已取到的保留。
    - **候选清单**:`GET /api/google/discover` 从账号里列出 Search Console 资源和 GA4 媒体资源给表单当候选;两个来源互不拖累,取不到就带原因、照样能手填。
      **⚠ 没在真实账号上跑过**(本地没有谷歌授权):GA4 那一半用的是 Analytics Admin API,生产的谷歌云项目里很可能还没启用它 —— 没启用时界面会显示谷歌给的原因,手填编号即可。
    - **已知的缺口**:改了一个站点的 Search Console 资源后,按旧资源同步进来的行还在库里,但不再属于任何站点(不会被删,也不会再显示)。
  - **第 2 步(已做):看板选站点** —— `public/src/site-scope.js`。登记了两个以上站点时,数据看板和总览顶部出现站点选择;只有一个站点时不出现,一切照旧。
    - **整个后台只有一个「当前站点」**(和时间范围「每页各存各的」不同):在数据看板选了管件站,回到总览看到的也是管件站,否则两个页面各说各的站。记在浏览器里(`ferr:site`),记住的站点被停用了就回到默认站点。
    - **跟着站点切的**:SEO 看板(GSC)、GA4 流量、诊断、数据新鲜度、总览的 SEO 小看板和 GEO 卡。取数点统一写成 `API.get(withSite(withRange(…)))`(有测试钉住)。
      切站点复用时间范围的「重新取数」通知(`refreshRangeConsumers`),顺带作废还在路上的旧请求。启动时先 `await loadSiteScope()` 再取数,不会先闪一下默认站点的数据。
    - **不跟着切的**:SEM 看板和询盘归因(广告是整个账户的,要等第 3 步把系列归到站点)、询盘与考核(部门口径)、GEO 抽查(全公司一份题库)。选择器旁边写明了这一点。
    - **没配的资源 = 没有数据,不是「全部」**(`googleClient.readScope`):查询里的写法是「没给资源就不过滤」,只有一个站时没问题;多站点下,一个没配 GA4 的站点会把所有站点的 GA4 加在一起显示成它自己的。
      登记过的站点现在严格按自己的资源过滤(有测试,且用反例验证过这条测试抓得住)。没登记站点的老情况保持原样。
    - **选的站点已经不存在**(被停用)时接口回 400,不悄悄换成默认站点或全部。数据新鲜度的「最后同步」看这个站点自己的同步记录(Ads 除外,它是账户级的)。
    - **区间里一天数据都没有时,SEO 顶部卡写「—」不写 0**(刚登记、还没补历史的站点就是这种情况)。
    - **没做「全部站点合计」**:点击、曝光、会话可以相加,但跳出率、平均时长、排名这类比率要按权重算,十几条查询得逐条核。做错了看板上就是错数,所以没有顺手做。
    - **⚠ AI 分析不跟着站点切**:AI 的证据那一层在 `services/hermesBrain.js`(另一个会话维护的文件),只读默认站点。选了别的站点时,AI 弹框标题上会写明「只读默认站点的数据」。`aiContext.js` 同样只看默认站点。
  - **第 3 步(进行中)**:把站点和询盘、任务、花费连起来。
    - **已做:询盘 / 线索认站点**(细节在 `docs/modules/inquiries.md`)。
    - **已做:任务 / 外链的前后对比按页面所在的站点取数**(细节在 `docs/modules/tasks.md`)。
    - **还没做**:广告系列归到站点(之后 SEM 看板和询盘归因才能按站点看)、周度审核按站点(`auditPackage.js` 仍是 `resolveProject({})`,只看默认站点)。
    - **考核口径不按站点拆**(老板定的是部门合计),按站点只做展示。
- **Google 同步已上线运行:GSC/GA4/Ads 三源均已授权,2026-06-30 首次同步成功并拉到真实数据(已逐源核验落库)。**
  - OAuth 授权/回调/刷新/撤销:`server/src/sync/googleClient.js`。
  - GSC 同步:`server/src/sync/gsc.js`(每日 + query/page)。GA4 同步:`server/src/sync/ga4.js`(每日 + 来源/国家/设备/落地页)。Ads 同步:`server/src/sync/ads.js`(campaign + keyword)。
  - 路由 `/api/sync/*`、`/api/google/*` 已在 `server/src/routes/index.js` 注册;数据表 `gsc_*`/`ga4_*`/`google_ads_*`/`google_oauth_*`/`google_sync_runs`/`google_projects` 已在 `migrate.js`;前端状态/连接/同步在 `public/src/google-projects.js`。授权在生产站由 boss/manager 走 OAuth 同意页完成(redirect_uri 为生产域名,localhost 无法回调)。
  - `GOOGLE_ADS_API_VERSION=v24.1` 在生产账号**实际可用**(Ads 同步已成功),非问题。
  - `server/src/routes/ga4.js` 是只读概览端点(从库读已同步数据),非同步逻辑。
  - **定时自动同步已上线**:`server/src/sync/scheduler.js` 进程内调度,每日 UTC `SYNC_DAILY_HOUR_UTC`(默认 5)点同步三源 + 启动补跑(最近成功同步过期才补);`SYNC_AUTO=false` 可关。仍保留手动「立即同步」/`POST /api/sync/<provider>`。
  - 已知小缺口:GSC 有 ~2 天数据延迟,默认 7 天区间通常只回 6 天。(原来这里还记着「GA4 落地页维度未取 conversions、恒为 null」—— **2026-10-11 核对代码,这条早就不成立**:
    `sync/ga4.js` 的 `dimensionReport` 每个维度都带 `keyEvents`,`landingPages[].conversions` 取的就是它。又一条没抽验就沿用的旧记录。)
- `seo_weeks` / `sem_weeks` 当前**主要依赖人工录入**,无自动同步。
- **SEO 看板「概览」已升级为富看板(Looker 风格)**:顶部卡/趋势读 `/api/google/gsc/summary`(`loadSeoBoardGsc`);其余读 `/api/google/seo/board`(`loadSeoBoardFull`,后端 `routes/google.js` + `googleSync.js` 的 `gscBoardTables/gscScatter/ga4SourcesRange/ga4SourceSeries`)——**本周要点条**(后端 `buildSeoHighlights` 自动挑最大涨跌,绿涨红跌)、落地页表+关键词表带彩色Δ环比、**机会词散点象限**(ECharts 展现×排名+中位线)、GA4 来源甜甜圈+按天堆叠面积。均随时间范围重拉。第二期(需扩 GA4 同步)才能做:跳出率散点、来源级跳出/时长、date×source×page 明细。
- **SEM 看板「概览」已升级为富看板**:顶部卡读 `/api/google/ads/summary`(`loadSemBoardAds`);其余读 `/api/google/ads/board`(`loadSemBoardFull` + 后端 `adsBoardTables/adsScatter/adsSeries` + `buildAdsHighlights`)——本周要点条(转化涨绿/每转化成本涨红/高花费零转化合计/最烧钱零转化词/最佳系列)、系列表+关键词表带转化Δ+评估徽章、**花费×转化散点**(右下红区=高花费低转化=该砍,红点标关键词+下方「该砍」清单带诊断/采纳)、系列花费甜甜圈+每日花费/转化趋势。评估徽章按 有转化/零有效/无花费;金额按账户币种、不臆造符号。旧层级表已被 Δ 表替代。
- 时间范围现影响:询盘、SEO 看板(GSC)、SEM 看板(Ads)、GA4、诊断、询盘归因、总览、KPI。
