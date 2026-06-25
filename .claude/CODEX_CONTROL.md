# Codex Control — ferr-ops

## Mode

MVP 上线稳定版。少废话，少扫文件，只做上线有价值的稳定性工作。

## Current Task

核心数据录入闭环稳定性审计与修复。

只检查并修复这些闭环：

- 询盘
- SEO 周报
- SEM 周报
- 关键词库
- 否词库
- 广告创意库

## Acceptance

- 能新增
- 能显示
- 刷新后仍在
- 数据进入正确模块
- 保存失败有提示
- 不出现假成功
- 不出现 SEO 数据进 SEM / SEM 数据进 SEO

## Rules

- 先快速定位相关前端函数、路由、repo；不要全项目扫描。
- 只修阻断上线的 bug。
- 非阻断问题写 TODO，不修。
- 不做 GSC / GA4 / Ads OAuth。
- 不做前端模块化。
- 不做 UI 美化。
- 不处理用户删除的 `FERR运营后台_需求文档.md`。
- 不提交 `.claude/` 或 `AGENTS.md`。
- 本轮先不 commit、不 push；完成后等 Codex 复核。

## Handoff

完成后只用 5 行更新 `.claude/HANDOFF.md`：

```text
Task:
Changed files:
Checks:
Commit:
Blockers:
```

