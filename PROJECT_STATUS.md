# ferr-ops Project Status

## Current Mode

MVP 上线稳定版。

目标是尽快上线一个可用、稳定、可信的 SEO / SEM 运营后台，让团队先开始录入数据、查看数据、分析问题、生成整改建议。

不要陷入过度优化。当前阶段不追求完整自动化和精细化，只守住核心数据闭环不能出错。

## Working Rules

- 只做对上线有直接价值的事。
- 优先保证核心数据闭环：能新增、能显示、刷新后仍在、数据进入正确模块、失败有提示、不出现假成功。
- 重点避免低级错误：SEO 数据进 SEM、SEM 数据进 SEO、保存后丢失、刷新后消失、API 失败却显示成功。
- AI 建议必须基于真实数据库上下文，能说明问题、证据、建议动作、负责人或验证指标。
- 非阻断问题只记录 TODO，不现场修。
- 不做 GSC / GA4 / Google Ads OAuth，除非用户明确切到自动数据源阶段。
- 不做前端模块化、UI 美化、无关重构。
- 不为“更优雅”改已经能稳定工作的代码。
- Claude / Codex 交接只用 5 行：Task / Changed files / Checks / Commit / Blockers。

## Completed

- Phase 1e-a: `/api/inquiries` 支持 `start_date` / `end_date`，前端时间范围影响询盘。
- Phase 1e-b: `/api/seo-weeks`、`/api/sem-weeks` 支持日期区间；前端仅 SEO 折线图消费区间数据。
- Phase 1e-c: 前端增加时间范围作用边界提示，明确 KPI、SEM 看板、GA4、整改等暂不受时间范围影响。
- 核心数据 loader 失败提示：API 加载失败不再静默残留旧数据，给 toast + 清表。
- 关键词库修复：删除残留静态示例行，列对齐、单元格可真实录入入库。
- 闭环审计通过：核心数据录入 6 模块 + AI 建议采纳到整改/任务，均「新增→刷新仍在、失败有提示、无假成功」。
- 已生成 `DEPLOY_CHECKLIST.md`（启动/.env/首次部署/备份/手测/已知 TODO）。

## MVP Validation

- 已按 `DEPLOY_CHECKLIST.md` 完成上线前手测，结果：**登录、询盘、SEO 周报、SEM 周报、关键词、否词、广告创意、AI 建议采纳到整改/任务 —— 均无阻断问题**。
- 结论：**MVP 可进入部署 / 试用阶段。**

Latest pushed commit:

- `a55e623 docs: add deploy checklist`

## Known Local Difference

- `FERR运营后台_需求文档.md` 是用户主动删除的旧文件，不要恢复。
- 是否提交这个删除由用户单独决定，不要混入功能任务。
- `.claude/` 是本机协作文件，不作为正式项目状态来源。

## Next Task

部署 / 试用收口：上线后只处理**阻断 MVP 使用的 bug**。

Rules:

- 只修上线阻断问题（登录/录入/保存/刷新丢失/数据串模块/假成功这类）。
- 不做 GSC / GA4 / Google Ads OAuth。
- 不做 UI 美化。
- 不做前端模块化。
- 非阻断问题只记 TODO，不现场修。

## Known TODO（非阻断，后续迭代）

- 自动数据源：GSC / GA4 / Google Ads 同步未接入（周报靠人工录入；状态卡如实显示未配置/同步未实现）。
- 部分静态看板真实化：仪表盘 mini 图/donut、GA4 看板等空状态或骨架，待接真实聚合。
- `loadClosedLoop` 加载失败仍静默 catch{}，待补失败提示（与核心 loader 同类）。
- 前端模块化：`public/index.html` 仍是单文件，后续拆分降低维护成本。
- SEO「近 6 周」列现为可编辑文本（非 sparkline）；询盘写入角色为 editor（非仅销售）。

## New Machine Startup Prompt

新电脑或新会话中，先让 Codex / Claude 读取：

```text
请读取 PROJECT_STATUS.md、AGENTS.md、CLAUDE.md、ROADMAP.md。
按 PROJECT_STATUS.md 的 MVP 上线稳定版继续，不要做过度优化。
当前下一步是 MVP 核心数据录入闭环稳定性审计与修复。
完成后只用 5 行交接：Task / Changed files / Checks / Commit / Blockers。
```

