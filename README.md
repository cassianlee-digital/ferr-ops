# 费尔瑞 FERR · 运营指挥中心（自托管）

把单文件演示原型改造成自托管、有数据库、有真账号、AI 真接入的内部运营后台。

- 后端：Node.js + Fastify
- 数据库：SQLite（`better-sqlite3`，单文件）
- AI：后端代理 Anthropic Messages API（密钥仅在 `.env`）
- 鉴权：账号密码 + JWT(cookie) + 角色权限
- 反代/HTTPS：Caddy（自动证书）
- 容器化：Docker + docker-compose

> 详细部署步骤（本地 / VPS / 备份）见本文末「部署」章节（Step 14 补全）。

## 快速开始（本地）

```bash
cp .env.example .env      # 填写 JWT_SECRET / 各账号口令 / ANTHROPIC_API_KEY
docker compose up         # 浏览器访问 http://localhost
```

## 角色

| 账号 | 角色 | 权限 |
|---|---|---|
| li | seo | SEO 相关模块可编辑，其余只读 |
| chen | sem | SEM 相关模块可编辑，其余只读 |
| sales | sales | 仅可录入询盘，其余只读 |
| boss | boss | 只读；唯一可编辑 KPI 考核目标 |

## 分期

- 第一期：手动录入 + 鉴权 + AI 代理 + Docker 化（本仓库）
- 第二期：Google Search Console / Ads / GA4 自动同步（当前仅占位 `/api/sync/*` 返回 501）
