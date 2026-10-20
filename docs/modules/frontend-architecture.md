# 前端架构：两套模块系统、全局面、时间范围、打包

> 状态：active
> 守护它的测试：`server/test/frontendXss.test.js`、`server/test/frontendDataIntegrity.test.js`、`server/test/bundleFresh.test.js`
>
> 这里记的是**口径和踩过的坑** —— 代码里看不出来、忘了就会重犯的那些。「现在有哪些文件 / 表 / 接口」看 `docs/FACTS.md`（自动生成）。
> 2026-10-11 从原来 438 行的 `CLAUDE.md` 里按模块拆出，原文搬运，只更正了几处已核实不成立的说法。

- **前端已不再是单文件,别再按「都挤在 index.html」描述**(2026-07-15 实测):`public/index.html` 只剩页面骨架(有哪些 ES 模块见 `docs/FACTS.md`),**内联 `<style>` 已清零**(CSS 拆为 `base.css`/`styles.css`/`components.css`/`page-*.css`)。JS 分两层:**经典脚本只剩 3 个**(`hermes.js`/`api.js`/`login.js` —— 2026-08-26 复测 `ls public/*.js`;charts/inquiries/kpi/ai/closed-loop/weekly-review **以及 `app.js` 本身都已迁进 `public/src/`,别再按老清单找文件**)+ **ES 模块**(`public/src/*.js` → esbuild 打 IIFE 成 `dist/bundle.js`)+ index.html 内联 `<script>`。**两套模块系统并存 = 绞杀式迁移的中间态,加载序是承重的,别随意调 `<script>` 顺序。**
- **全局面已腰斩:实测 190 名字 / 154 函数**(2026-08-27 合并后活站 iframe 差集,含 vendor;2026-07-15 同口径是 338/302)。降幅主要来自 `app.js` 迁入 ES 模块 —— 它原有 **35 个顶层符号自动是全局**,现在只导出 **4 个**给兼容层(第三刀又从 10 收到 4)。
  - **别用 grep 数 `window.X =` 去估全局面**——经典脚本里顶层 `function foo(){}` **自动就是全局**,根本不写 `window.`。要量就在活站上用 **iframe 差集**量(建空 iframe 取 `Object.getOwnPropertyNames` 做差集)。
- **⚠ 内联 handler 已清零,原「82 个强制全局是模块化地板」的说法已作废**(2026-08-26 实测)。事件委托改造**已经做完**:HTML 属性型 `onclick=`/`onchange=` **0 处**,全站改用 `data-ui-action=`(要数有多少处用这条口径:`grep -ro 'data-ui-action=' public --include=*.html --include=*.js | grep -v /dist/ | grep -v /vendor/`)(+ `data-loop-tab`/`data-google-action` 等专用委托)。`public` 下仅剩 **1 处 `onclick=`(2026-10-10 实测:`google-projects.js` 的 `el.onclick=fn` DOM 属性赋值;`app.js` 那处已随死代码 `renderLoopbars` 删除)**,不是 HTML 字符串里的裸全局调用。**统计口径**:`grep -ro 'on\(click\|change\)=' public --include=*.html --include=*.js | grep -v dist | grep -v vendor`。
- **`public/src/ui-kit.js` 是全站 UI 基础工具的唯一实现**(2026-08-26 新增):`esc`/`renderText`/`mdToHtml`/`openModal`/`closeModal`/`toast`/`toastUndo`/`toastGo`/`showToast`/`hideToast` 从 app.js 搬来。**各 ES 模块已全部改为显式 `import { esc, toast } from './ui-kit.js'`,模块侧不再读 `window`**(校验脚本口径:模块里出现这些名字却没 import = 漏网)。收益是**编译期保护**:名字写错 esbuild 当场报错;此前它们是隐式全局,对打包器完全隐形。⚠ **本模块必须保持「无 DOM 也能被 import」**——`table-editor.js` 会被 `node --test` 真实 import,求值期碰 `document` 会让整个测试文件崩(已踩过);故遮罩绑定带 `typeof document` 守卫、toast 系列取不到 `#toast` 就安静退场。
- **`public/src/app.js` 是应用组装层**(2026-08-26 由经典脚本迁入 ES 模块):`STATIC_UI_ACTIONS` 委托表 + 导航 `go()` + `window load` 启动序列 + `applyRoleUi()`。**依赖方向单向**:它 import 全部业务模块,**没有任何模块 import 它** —— 依赖图顶点,无环。故 `main.js` 里它**必须是最后一个 import**(模块求值期要做 DOM 绑定并注册 window load,等价于原来「bundle.js 之后再加载 app.js」),`Object.assign(window, …, app)` 里也**必须最后合并**(还原它的全局后定义、同名覆盖的语义)。这两条已被 `frontendXss.test.js` 焊死。它调用的 ~90 个模块函数现在**全部编译期校验**,写错 esbuild 当场失败。
- **`Object.assign(window, …)` 兼容层仍要留**,消费者两类:`public/hermes.js`(只读 `window.API`/`ME`/`_curTab`/`esc`/`toast`/`go`/`loadClosedLoop`,全部带 `window.` 前缀且有兜底),以及 `closed-loop.js` 裸调用的 `go`/`chk`/`setPlanningTab`/`setActionTab`。
- **app.js 的导出已从 10 个收到 4 个**(2026-08-26 第三刀):`loadInquiries`→`inquiries.js`(它渲染的三个函数本就在那)、`tableLoadState`→`ui-kit.js`、`renderSparklines`→`keywords.js`、`toggleHier`→`charts.js`(各自唯一调用者所在处);`hydrate`/`applyRoleUi`/`restoreRoute` **无任何外部调用者**,已降为模块私有。**顺带修掉一处设计违背**:`timerange.js` 原本反向调用 `loadInquiries()`,与其文件头写明的「消费者订阅事件」相悖且会成环,现改为 inquiries.js 自己监听 `timerange`(与 kpi-view/ledger 同一模式)。
- **剩下 4 个导出为什么收不掉:真的有环**。`chk` 被 `closed-loop.js` 裸调用、又被 `sop.js` 以 `window.chk` 调用,而它自身要调 `closed-loop` 的 `refreshTaskCols` 和 `sop` 的 5 个函数 —— 放进任一方都成环。`go` 同理:拆 nav.js（还不存在，是设想中的文件） 需 import charts/archive/sop/weekly-review,而这四个都可达 `closed-loop.js`(唯一裸调用 `go` 的模块)。**正解是事件反转**(chk 做完 API 后派发 `taskchanged`,closed-loop/sop 各自订阅刷新;`go` 派发 `tabchange`),就是本项目 `timerange` 已在用的那套 —— 但它改的是任务打卡这类关键路径,要单独排一刀。
- ~~已知缺陷:询盘列表被重复请求~~ **已于 2026-10-11 修掉**。实际情况比原来记的更糟也更简单:询盘页的表格、总览的询盘趋势、KPI 页的两个圆环
  各按自己的时间范围取 `/api/inquiries`,范围相同时(默认都是近 30 天)发出去的是一模一样的请求 —— **打开后台一次取三遍**。
  现在三处都走 `public/src/inquiry-data.js` 的 `fetchInquiries(scope)`:**只合并正在路上的同地址请求,不缓存结果**
  (缓存哪怕一两秒,都可能出现「刚录的询盘没显示」),每个调用方拿自己的一份拷贝(询盘页会就地改行对象)。
  为了赶上「正在路上」那一次,`loadInquiries` 里取 KPI 圆环的调用挪到了 `await` 之前,启动序列里 `loadDashboardInq()` 挪到了 `hydrate()` 之前(有测试焊住)。
  实测首屏 3 次 → 1 次。**仍然多余的一次**:切询盘页时间范围时会顺带重取 KPI 圆环(它的范围其实没变)。
- **app.js 里仍靠隐式全局解析的只剩 16 个**(已审计,零漏网):`api.js` 的 `API`/`ensureAuth`/`can`/`ME`,以及 `hermes.js` 自己挂 window 的 14 个面板函数(`openHermesPanel`/`sendHermesPrompt` 等)。这两个经典脚本在 `bundle.js` **之前**加载,故运行时一定就绪。
- **隐形风险降级但没消失**:经典脚本裸引用同样对打包器/静态分析隐形,改名依旧**没有编译期报错**。但排查方式变了 —— **改前端函数名前该 grep 的是 3 个经典脚本**(`hermes.js`/`api.js`/`login.js`),**不再是 `onclick=`**;`data-ui-action` 的动作名由 `app.js` 的 `STATIC_UI_ACTIONS` 表集中分发,改名会在表里露出来(且有测试校验 HTML 里每个动作都已注册)。
- ~~已知死代码 `renderLoopbars()` + `LOOP`~~ **已于 2026-10-10 删除**(`.loopbar` 元素早就不在 HTML 里)。`base.css` 里 `.loopbar` / `.loopstep` 几条样式因此成了死样式,没动。
- **当前站点是全后台一个,不是每页各存各的**(2026-10-12,`public/src/site-scope.js`):和下面的时间范围正相反 —— 细节与理由见 `docs/modules/google-sync-and-boards.md` 的多站点一节。
- **时间范围已改成「每个页面各存各的」**(2026-08-26,`public/src/timerange.js` 重写):以前全站共用一个 `window._timeRange`,在询盘页点「近一年」,数据看板也跟着变成近一年。
  现按 **scope** 隔离:`dashboard / kpi / inquiry / data / fix`,各自一份 label+range+revision,各自 `localStorage`(`ferr:timeRange:<scope>` / `ferr:customRange:<scope>`;老的全站单 key 只在首次加载时读一次做迁移)。
  - **scope 来自 HTML 上的 `[data-time][data-scope]`,不靠 DOM 推导** —— GA4 面板会被 `mountGa4IntoData()` 搬进数据看板,`closest('.panel')` 会推错;GA4 与数据看板**共用 `data`**(同一屏两个互不相干的时间条会误导人)。
  - `withRange(path, scope|rangeObj)`、`getCurrentRange(scope)`、`getRangeRevision(scope)` —— **业务代码必须显式传 scope**,不传只兜底到当前可见页。
  - `timerange` 事件 detail 带 `{scope,range,revision}`,消费者(charts/kpi-view/ga4-view/app.js)**各自按 scope 认领**;时间模块不再反向调用任何 loader。
  - 顶栏三个 KPI pill 与右上角日期**跟随「当前所在页面」**(`activeScope()`),切页时由 `go()` 重新拉 `/api/overview`;没有时间条的页面落回 `dashboard`。
  - KPI 页两个 donut 不再蹭询盘页的 `_inqCache`,改为按 KPI 页区间自取一份 `_inqKpiCache`(`loadKpiInqDonuts()`),否则会出现「KPI 页写着近30天、圆环画的是询盘页的近一年」。
- **ECharts 一律用 canvas 渲染,别用 svg**(2026-10-10 踩过):svg 渲染器靠 `setAttribute('style', …)` 给 `<svg>` 和每个 `<text>` 写样式,
  而本站 CSP 是 `style-src-attr 'none'`,样式被整条丢掉 —— 询盘地图标签的字号 / 字重曾因此完全没生效,且每画一次报 2 条违规。
  已把 `inquiry-globe.js` 改成 canvas(实测违规 0)。`styles.css` 里 `.inq-echarts-map svg / text` 两条规则因此成了死规则(没动那个文件)。
- **前端已没有任何示例数据(2026-10-10 实测 + 测试焊死)**。两件事分开说:① 整改清单 AI 框那两条写死的建议**早在提交 `efdf64e` 就清掉了**,
  原来的主文档却一直写着「仍残留」—— 又是一条没抽验就沿用的旧记录;② 真正留着的是 `charts.js` 里的 **`DEMO` 夹具 + `window.DEMO_MODE` 开关**:
  没有任何地方会打开它,但在控制台敲一行,总览页就会画出假的询盘趋势和等级 / 渠道圆环(注释写的是「便于演示 / 截图」)。这个后台的数是拿来考核的,
  所以连开关带夹具一起删了(`charts.js` 6 处分支、数据源状态卡上的「示例模式」标记、`#ds-demo-tag`)。
  `frontendDataIntegrity.test.js` 有一条测试扫 `public/src`、`index.html` 和打包产物,**出现 `DEMO_MODE` / `DEMO` 就失败 —— 别再加回来,要演示请用测试库**。
  GA4 看板与总览部分 mini 图在没有数据时是空状态(不是假数据)。
- **改前端函数名前先搜 3 个经典脚本**(`public/hermes.js`/`api.js`/`login.js`)+ **仍裸调用 app.js 导出的模块**(grep `go(`/`chk(`/`loadInquiries(` 等):这些引用对打包器隐形,改了**不会有任何报错**,直到跑到那行才 ReferenceError。改完在活站上验 `typeof window.<name>==='function'`。(两条老规矩已作废:内联 `onclick=` 已清零;`app.js` 已迁入 `public/src/`,它调用模块函数的方向现在有编译期保护。)
- **改前端函数名前先搜 `data-ui-action` 与经典脚本调用点**:内联 `onclick` 已清零(2026-08-27 实测),但 `data-ui-action` 的字符串键、以及 app.js/hermes.js 对 `window.<name>` 的裸调用改了**同样不会有编译期报错**。改完在活站上验 `typeof window.<name>==='function'`。
