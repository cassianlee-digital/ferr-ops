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

Latest pushed commit:

- `9611775 chore: clarify time range scope`

## Known Local Difference

- `FERR运营后台_需求文档.md` 是用户主动删除的旧文件，不要恢复。
- 是否提交这个删除由用户单独决定，不要混入功能任务。
- `.claude/` 是本机协作文件，不作为正式项目状态来源。

## Next Task

MVP 核心数据录入闭环稳定性审计与修复。

Scope:

- 询盘
- SEO 周报
- SEM 周报
- 关键词库
- 否词库
- 广告创意库

Acceptance:

- 能新增
- 能显示
- 刷新后仍在
- 数据进入正确模块
- 保存失败有提示
- 不出现假成功
- 不动无关模块
- 不做 UI 美化或重构

## New Machine Startup Prompt

新电脑或新会话中，先让 Codex / Claude 读取：

```text
请读取 PROJECT_STATUS.md、AGENTS.md、CLAUDE.md、ROADMAP.md。
按 PROJECT_STATUS.md 的 MVP 上线稳定版继续，不要做过度优化。
当前下一步是 MVP 核心数据录入闭环稳定性审计与修复。
完成后只用 5 行交接：Task / Changed files / Checks / Commit / Blockers。
```

