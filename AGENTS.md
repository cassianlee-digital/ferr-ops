# ferr-ops · 给 AI 协作者的入口

公司内部的 **SEO / SEM 运营指挥中心**：数据记录 → 观察 → 分析 → 建议 → 任务执行 → 结果验证 → 周报复盘。
它是团队每天用的后台，里面的数直接进绩效考核 —— **数据可信度高于一切**。

这份文件是**目录**，不是百科：只放「去哪找」和「绝不能做错的事」。细节在 `docs/` 里，按需读。
所有 AI 工具读的都是这一份（`CLAUDE.md` 只是转发到这里）。

## 开工与收工

**开工**：读完本文件 → `git log --oneline -8` 看最近在做什么 → 要动哪个模块，先读 `docs/modules/` 里对应那一篇。
不要全仓库扫描；「仓库里现在有哪些文件、表、接口」直接看 `docs/FACTS.md`。

**收工**（提交时钩子会替你检查，但知道它查什么能少走弯路）：

| 你做了什么 | 要跟着做 |
|---|---|
| 改了 `public/src/` 下任何文件 | 在仓库根目录 `npm run build:web`，把 `public/dist/bundle.js` 一起提交 |
| 加 / 删 / 改名了文件，或改了某个文件的第一行注释 | `node server/scripts/projectFacts.mjs --write` |
| 加了环境变量 | 写进 `.env.example` |
| 新文件 | 第一行写一句注释说明它是干什么的 |
| 改了某个模块的口径或踩了新坑 | 更新 `docs/modules/` 里那一篇，不要写回本文件 |

提交信息写清「改了什么、为什么」。**合并到 main 和部署都要用户开口**；不操作服务器、不索要服务器密码，只给部署指令。

## 门禁

`.githooks/pre-commit` 在每次提交前跑全量测试（`cd server && node --test`，约 4 秒，需要 Node 20）。
红了就修，**不要用 `--no-verify`** —— 这个项目没有云端 CI，这是唯一的自动检查。
失败信息里大多直接写了原因和改法，照着做即可。它除了业务规则，还盯着这些容易忘的事：

| 测试 | 盯什么 |
|---|---|
| `server/test/bundleFresh.test.js` | 打包产物是不是用当前源码打的（线上直接用仓库里那份） |
| `server/test/projectFacts.test.js` | `docs/FACTS.md` 是否过期；新文件有没有说明；环境变量是否进了 `.env.example` |
| `server/test/docsLayout.test.js` | 本文件有没有长胖；文档有没有标状态、有没有被目录收录、提到的文件还在不在 |
| `server/test/frontendHtmlSinks.test.js` | 拼进 HTML 的每个表达式是否可证明安全 |
| `server/test/frontendXss.test.js` | 前端模块边界、加载顺序、没有内联事件 |
| `server/test/gateInstalled.test.js` | 这个克隆有没有启用提交钩子（没启用会提示那条命令） |

测试不读本机的 `.env`，也不许碰真实的库：需要什么配置由测试自己声明（`server/test-support/tempDb.js`）。

## 地图

| 去哪 | 有什么 |
|---|---|
| `docs/FACTS.md` | **自动生成**：路由、服务、数据访问、前端模块、数据表、测试、环境变量的清单 |
| `docs/modules/frontend-architecture.md` | 两套模块系统并存、全局面、时间范围、打包、ECharts 的坑 |
| `docs/modules/google-sync-and-boards.md` | GSC / GA4 / Ads 同步与数据看板 |
| `docs/modules/diagnostics-and-ai.md` | 诊断规则、AI 上下文与 AI 提供方 |
| `docs/modules/kpi.md` | 月度绩效考核、运营总账、询盘归因 —— **老板亲定的口径在这里** |
| `docs/modules/inquiries.md` | 询盘表、来源、确认权与改动留痕、附件 |
| `docs/modules/tasks.md` | 可审计任务、改动留痕、前后数据对比、日计划、SOP |
| `docs/modules/weekly-audit.md` | 周度审核包、疑点规则、导出、AI 意见 |
| `docs/modules/spend-and-geo.md` | 投入台账、外链核查、GEO |
| `docs/modules/security.md` | 密钥、HTML 拼接审计、对外请求 |
| `README.md` | 给人看的简介：技术栈、角色、从哪看起 |
| `DEPLOY_CHECKLIST.md` · `PRODUCTION_ACCEPTANCE.md` | 部署步骤、环境变量、生产验收工具 |
| `docs/INQUIRY_INTAKE.md` | 独立站表单怎么把线索发进后台（给改站的人看） |
| `docs/ACCEPTANCE_2026-10.md` · `docs/TEAM_CHANGES_2026-10.md` | 2026-10 这批更新的验收清单、给团队的操作变化说明 |
| `docs/GOOGLE_SYNC_CONTRACT.md` · `docs/SEO_SEM_AUTO_AGGREGATION.md` | 同步接口的历史契约（已完成）、周报自动汇总方案（未实施） |
| `docs/archive/` | 已经不成立的旧文档，只为查历史，**不要当事实引用** |

## 架构一句话

后端 Fastify + SQLite：`routes/`（薄）→ `services/`（规则，尽量纯函数）→ `db/repositories/`（数据访问），迁移只前进、不清库。
前端是迁移到一半的状态：ES 模块（`public/src/` → 打包成 `dist/bundle.js`）+ 三个经典脚本，**`<script>` 的加载顺序是承重的，别调**。

## 硬规矩

**数据可信度**
- 没有数据 ≠ 0。没同步、没填、算不出来，都要如实显示成「没有」并说明原因，不许画成 0，不许放示例数据。
- 老数据不回填、不补假值（没有时间戳的记录就显示「日期不详」）；不同币种不相加。
- API 失败必须把失败原因显示给用户。每条建议要能追溯到数据，每个任务要能复盘验证。
- **考核口径是老板定的**（见 `docs/modules/kpi.md`）：权重、计分范围、哪些询盘算数 —— 改之前必须问，不要自作主张。

**安全**
- 不提交 `.env`、密钥、口令；密钥只在服务器环境变量或加密存储里，前端永远拿不到。
- 用户填的文字和接口返回的文字，进页面前必须 `esc()`；优先用 `textContent`。
- **权限写在后端。** 界面上藏起按钮不算权限 —— 曾经「彻底删除」只对老板显示按钮，接口却谁都能调。
- 服务器按用户填的网址主动发请求的代码只有外链核查一处，那里的防线一条都别拆（`docs/modules/security.md`）。

**加「门槛」类规则时**（必须填什么、确认后不能改……这类规则第一版几乎都有旁路，交付前逐条自查）
- 判断「改没改」用 `字段 in 请求体`，不用 `!= null` —— 否则传 `null` 清空就绕过去了。
- 软删 / 归档的东西要在周度审核里看得见 —— 否则删掉就等于没发生过。
- 流水和改动放在同一个事务里 —— 否则被拒的请求会留下假流水。

**改代码时**
- 先分析再动手，小步改，不做无理由的重构。
- 改前端函数名之前，先搜三个经典脚本（`public/hermes.js`、`public/api.js`、`public/login.js`）和 `data-ui-action`：这些引用对打包器不可见，改错了不会有任何报错。
- 回复只给：改动摘要 + 测试结果 + 待办。不贴整段代码，不重复已确认的背景。

**写文档时**
- 文档里不手写「有几个 / 有哪些」—— 那是 `docs/FACTS.md` 的事。
- 写「还没做 / 已知缺陷」之前先去代码里确认；引用别人写的这类话之前也先确认。这份仓库里过期的「待办」误导过不止一次。
- 每篇文档第三行标状态：`active` / `completed` / `proposed` / `superseded`。

## 多个 AI 并行时的分工

`public/hermes.js`、`public/styles.css`、`server/src/routes/hermes.js` 以及 `server/src/services/hermes*.js`
由做 Hermes 助手的那个会话维护（2026-08 起的约定）。其它会话对这些文件**只读不改**，确实要改先问用户。
`public/index.html` 是共用的。如果这个分工已经结束，请用户删掉这一段。

## 本机环境

- 项目路径 `E:\Claude Code`；工作树在 `.claude/worktrees/` 下。
- 项目用 **Node 20**（`.node-version`；数据库依赖按它编译，线上镜像也是 20）。便携版在 `.tooling/` 下，提交钩子会自己找到它；系统里另装的新版 Node 跑不了测试。
- 远端 `cassianlee-digital/ferr-ops`，凭据走本机的凭据管理器。
