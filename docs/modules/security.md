# 安全：密钥、HTML 拼接审计、对外请求

> 状态：active
> 守护它的测试：`server/test/frontendHtmlSinks.test.js`、`server/test/frontendXss.test.js`、`server/test/linkCheck.test.js`、`server/test/routes.test.js`
>
> 这里记的是**口径和踩过的坑** —— 代码里看不出来、忘了就会重犯的那些。「现在有哪些文件 / 表 / 接口」看 `docs/FACTS.md`（自动生成）。
> 2026-10-11 从原来 438 行的 `CLAUDE.md` 里按模块拆出，原文搬运，只更正了几处已核实不成立的说法。

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
- `server/src/db/repositories/integrations.js` 对密钥做 **AES 加密**存储,**绝不返回前端**。
