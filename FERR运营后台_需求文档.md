# 费尔瑞 FERR 运营指挥中心 · 落地需求文档

> 版本：v1.0　｜　目标读者：Claude Code / 开发者
> 输入物：现有单文件原型 `ferr_ops_dashboard_v6.html`（含完整 UI 与交互）
> 一句话目标：把这个「单文件演示原型」改造成一个**自托管、有数据库、有真账号、AI 真接入**的内部运营后台，团队多人可日常使用。

---

## 0. 项目背景

费尔瑞 FERR 是一家做来图定制铸造/机加工件的外贸出口公司，目标客户为欧美来图定制工厂与中间商。这个后台用于团队（SEO 负责人李、SEM 负责人陈、销售、老板）以「记录 → 监控 → 优化 → 复盘」的闭环方式管理 SEO/SEM 运营数据，并用 AI 基于真实数据给优化建议。

现有原型已完成全部前端 UI 和交互逻辑，但：
- 数据是写死的演示数据；
- 持久化用浏览器 `window.storage / localStorage`，只存在单个浏览器里、无法多人共享；
- AI 调用是 claude.ai Artifact 专用的伪接入，脱离该环境无法工作。

本文档定义如何把它变成真正能用的产品。

---

## 1. 现有原型已具备的功能（前端不用重做，是本项目的输入）

导航共 15 个面板：总览、考核、询盘评级、运营闭环（①计划/②测试/③数据看板/④整改清单/⑤复盘）、资产库（关键词库/内容资产/市场情报/沉淀表）、任务看板、GA4 流量、设置。

核心模块：

| 模块 | 已有能力 |
|---|---|
| 总览 | 公司/李/陈 三个评分仪表盘、迷你趋势图、SEO/SEM AI 诊断入口 |
| 考核（KPI） | 总指标 + SEO 明细 + SEM 明细的目标/实际/达成率，自动算分与等级 |
| 询盘评级 | 录入弹框（日期/国家/大区/渠道/来源词/产品/等级/备注），自动汇总有效询盘率、A 级占比等 |
| ③ 数据看板 | SEO/SEM 唯一数据中心。SEO：概览（指标卡+趋势图+页面明细表+AI 周报+AI 诊断）/ 站点机会 / 流量衰退 / 关键词蚕食 四个二级标签；SEM：周报 + 系列→广告组→关键词层级表 + AI 诊断；**含 SEO/SEM 本周数据录入弹框** |
| 关键词库 | SEO 词库（内嵌 GSC 排名 + 近 6 周折线）/ SEM 词库 / 高价值词库 / 客户信息词库 / **否词库** / **广告创意库** |
| 运营闭环 | AI 建议可「沉淀/采纳/测试」三连流转；④整改清单；⑤复盘「下周必做」回流到①计划 + 任务看板 |
| 设置 | 考核目标值可编辑，改完即时回写、重算评分 |

> 这些 UI 与前端交互逻辑保留，本项目的工作是把它们背后的「数据」和「AI」从假的换成真的。

---

## 2. 目标架构（第一期 · 自托管）

明确不使用 Vercel / Supabase 等托管服务，全部自托管，可跑在自己的电脑（测试）或云服务器 VPS（正式）。

- **前端**：沿用现有看板 UI，改为调用后端 REST 接口取数/存数；可由后端或 Caddy 直接托管静态资源。
- **后端**：Node.js（Fastify 或 Express），提供 REST API。
- **数据库**：SQLite（`better-sqlite3`，单文件，零运维）；数据量变大后可平滑换 PostgreSQL，故数据访问层需抽象。
- **AI 代理**：后端 `/api/ai` 持有 `ANTHROPIC_API_KEY`（环境变量），代前端调用 `https://api.anthropic.com/v1/messages`，浏览器永不接触密钥。
- **鉴权**：自实现的账号密码登录 + 会话/JWT + 角色权限。
- **反向代理 + HTTPS**：Caddy（自动签发证书）。
- **容器化**：提供 `Dockerfile` + `docker-compose.yml`，SQLite 用挂载卷持久化，做到本地与 VPS 跑同一镜像、迁移近乎零成本。

---

## 3. 功能需求（要把「假数据」变成「真数据流」）

以下是必须实现的真实数据流，对应原型里目前还是演示/单机的部分：

**FR-1 询盘录入持久化**：录入弹框写入数据库，多人共享；列表与「有效询盘/A 级占比/有效率/总量」实时刷新；重启/换浏览器仍在。

**FR-2 SEO 周报录入**：录入本周点击/展现/均排名/Top10 占比/覆盖/新增收录/跳出率/停留 → 入库 → 自动刷新数据看板指标卡、趋势图，并回写 KPI 实际值；「自然流量环比」按上一周点击自动计算。

**FR-3 SEM 周报录入**：录入花费/展现/点击/转化/ROAS/质量分 → 入库 → CPC、CTR、每次转化费用自动计算 → 刷新指标卡 + 回写 KPI 实际值。

**FR-4 KPI 目标即时回写**：设置页编辑任一目标值 → 入库 → 重算公司/李/陈 评分、进度条、等级徽章。后端为权威数据源。

**FR-5 AI 真接入（按需）**：所有「重新诊断/研判/生成」「分析意图」「AI 合并建议」等按钮，点击时把当前页面真实数据上下文发给 `/api/ai`，返回真实建议；静态文案作为即时加载的默认值，点击才调用，避免每次都跑。

**FR-6 AI 结果一键采纳**：AI 弹框结果可一键「采纳到整改清单」，写入④整改清单并按 SEO/SEM 自动分派负责人（李/陈）。

**FR-7 否词库 / 广告创意库持久化**：新增、编辑、状态变更均入库共享。

**FR-8 关键词蚕食 / 站点机会 / 流量衰退**：列表数据入库可维护；机会词支持「每周排名快照」，积累 ≥2 周后显示排名升降趋势，用于验证整改效果。

**FR-9 关键词库可编辑持久化**：SEO/SEM/高价值/客户信息四个词库支持增删改并入库（原型中是静态 HTML）。

**FR-10 闭环数据持久化**：整改清单、测试登记、月度计划、任务看板、沉淀表的条目入库，支持跨会话保留与多人协作。

**FR-11 时间筛选**：第一期至少让数据看板趋势图按所选时间区间显示；后续逐步让更多表格联动。

---

## 4. 数据模型（SQLite 表，字段为建议）

| 表 | 主要字段 |
|---|---|
| `users` | id, username, password_hash, name, role(`seo`/`sem`/`sales`/`boss`), created_at |
| `inquiries` | id, date, country, region, channel, source, product, grade(A/B/C), note, created_by, created_at |
| `seo_weeks` | id, week_date, clicks, impressions, avg_position, top10_ratio, coverage, indexed_pages, bounce_rate, dwell_seconds |
| `sem_weeks` | id, week_date, cost, impressions, clicks, conversions, roas, quality_score, cpc, ctr, cost_per_conv |
| `neg_keywords` | id, word, match_type, added_date, reason, source_campaign, status |
| `ad_creatives` | id, title, description, ctr, ab_conclusion, status |
| `rank_snapshots` | id, snapshot_date, keyword, rank, url |
| `kpi_targets` | id, group(`total`/`seo`/`sem`), name, weight, target, actual, mode(`r`/`i`), unit |
| `keywords` | id, type(`seo`/`sem`/`high`/`customer`), keyword, attrs(JSON：等级/竞争/排名/落地页等), category |
| `fixes` | id, title, dept, detail, owner, due_date, status, source, created_at |
| `loop_items` | id, kind(`plan`/`test`/`deposit`/`task`), dept, content, owner, status, created_at |

> CPC/CTR/每次转化费用/自然流量环比这类派生值，由后端在写入或读取时计算，前端只展示。

---

## 5. API 设计（REST，需做角色鉴权）

- 鉴权：`POST /api/login`、`POST /api/logout`、`GET /api/me`
- 询盘：`GET/POST/PATCH/DELETE /api/inquiries`
- SEO 周报：`GET/POST /api/seo-weeks`
- SEM 周报：`GET/POST /api/sem-weeks`
- 否词：`GET/POST/PATCH /api/neg-keywords`
- 广告创意：`GET/POST/PATCH /api/ad-creatives`
- 排名快照：`GET/POST /api/rank-snapshots`
- KPI 目标/实际：`GET/PUT /api/kpi-targets`
- 关键词库：`GET/POST/PATCH/DELETE /api/keywords?type=`
- 闭环（整改/测试/计划/任务/沉淀）：`GET/POST/PATCH /api/fixes`、`/api/loop-items`
- AI 代理：`POST /api/ai`，请求体 `{ prompt, scope }`，后端拼接上下文（KPI 目标/实际、最新周报数据、关键词排名、蚕食组、SEM 层级、市场情报）后调用 Anthropic，返回 `{ text }`

---

## 6. 鉴权与角色

四种角色，权限在**后端强制校验**（不能只靠前端隐藏）：

| 角色 | 权限 |
|---|---|
| 李（seo） | SEO 相关模块可编辑，其余只读 |
| 陈（sem） | SEM 相关模块可编辑，其余只读 |
| 销售（sales） | 仅可录入询盘，其余只读 |
| 老板（boss） | 全部只读 |

---

## 7. AI 集成规格

- 模型：使用 Anthropic Messages API（`/v1/messages`），具体模型名由实现时确认最新可用版本。
- 密钥：仅存在后端 `.env` 的 `ANTHROPIC_API_KEY`，绝不出现在前端代码或返回体。
- 调用方式：**按需**——静态默认文案即时显示，用户点击按钮才真正调用，结果可渲染回原位或弹框。
- 上下文：后端基于数据库实时数据组装（见 §5 AI 代理），保证建议「基于本周真实数据」而非通用建议。
- 失败降级：API 不可用时前端给明确提示，不报错崩溃。

---

## 8. 非功能需求

- **持久化**：所有录入入库，服务重启、换设备、多人访问数据一致。
- **安全**：密钥/口令全部走环境变量；密码加盐哈希存储；后端做角色与输入校验。
- **HTTPS**：Caddy 自动签发并续期证书（需一个域名；纯局域网可用自签或仅 HTTP）。
- **备份**：每日定时复制 SQLite 数据库文件到备份目录（cron）。
- **可移植**：Docker 化，本地与 VPS 同一套 compose 启动。

---

## 9. 分期计划

**第一期（先让团队用起来）**
- 后端 + SQLite + REST API + 鉴权角色
- FR-1 ~ FR-11 全部用「手动录入」方式跑通（周报弹框已存在）
- AI 代理接入
- Docker 化 + Caddy + 自托管部署文档

**第二期（自动化数据源，单独立项）**
- 接 Google Search Console API：自动写入 `seo_weeks`、页面级数据、关键词排名（替代手动录入）
- 接 Google Ads API（需申请 developer token，审核较慢）：自动写入 `sem_weeks` 与系列层级
- 接 GA4 Data API：流量漏斗
- OAuth 授权 + 令牌存储 + 定时同步（cron/worker）

---

## 10. 我（业主）需要自行准备的

第一期：
- Anthropic API Key（console.anthropic.com 申请）
- 一台用于测试的电脑或一台云服务器 VPS（最低 1 核 1G 即可）+ SSH 访问
- 一个域名（用于 HTTPS；纯内网可暂不需要）
- 团队成员账号信息与角色分配（李/陈/销售/老板）
- 历史 GSC/Ads 数据 CSV（用于初始化，可选）

第二期额外：
- Google Cloud 项目，开通 GSC API / Google Ads API / GA4 Data API
- 配置 OAuth 同意屏幕；申请 Google Ads developer token（提前申请，审核慢）

---

## 11. 部署方式

**本地（测试）**：装 Docker → `git clone` → 填 `.env`（含 `ANTHROPIC_API_KEY`、登录口令）→ `docker compose up` → 浏览器访问。SQLite 用挂载卷持久化。

**云服务器 VPS（正式）**：
1. 装 Docker 与 Docker Compose
2. `git clone` 项目，填 `.env`
3. `docker compose up -d`
4. Caddy 服务绑定域名，自动 HTTPS（可作为 compose 内一个服务）
5. 配置每日数据库备份的 cron

从本地迁到 VPS：因已 Docker 化，基本是「clone + 拷贝 SQLite 卷 + compose up」，十几分钟内完成。

---

## 12. 验收标准（每条都要满足）

- 任一录入（询盘/SEO 周报/SEM 周报/否词/广告创意/排名快照/KPI 目标）保存后：界面即时刷新、**服务重启后仍在**、**另一台电脑/另一账号能看到**。
- 设置页改目标值后，总览三个评分与进度条立即重算并持久化。
- SEM 周报录入后，CPC/CTR/每次转化费用由后端自动算出且与手算一致。
- 点击任一 AI 按钮，返回的是基于当前真实数据的文本（密钥在后端，前端抓包看不到 key）。
- AI 弹框「采纳」后，整改清单新增对应条目并落库。
- 不同角色登录后权限符合 §6，且越权请求被后端拒绝（不止前端隐藏）。
- `docker compose up` 在本地与 VPS 均可一键启动，数据通过挂载卷保留。

---

## 13. 交给 Claude Code 的方式

1. 新建空文件夹，把 `ferr_ops_dashboard_v6.html` 和本需求文档放进去。
2. 在该文件夹启动 Claude Code，对它说：

> 请阅读本目录下的《FERR运营后台_需求文档.md》和 ferr_ops_dashboard_v6.html，按文档**第一期**范围实现：自托管（Node + SQLite + Caddy + Docker）、把前端的 window.storage 全部换成后端 REST + 数据库、实现登录与角色权限、加 /api/ai 代理（密钥走 .env，不进代码）、保留现有 UI 与交互。完成后给我：需要我手动执行的命令清单、需要我填写的 .env 变量清单、以及在 VPS 上部署的步骤。第二期的 Google API 同步先留占位、不要实现。

3. 第一期跑通后，再单独让它做第二期（GSC/Ads/GA4 OAuth + 定时同步）。
