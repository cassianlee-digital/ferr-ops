# 费尔瑞 FERR · 运营指挥中心

> 状态：active

公司内部的 SEO / SEM 运营后台，自托管：记录数据、看数据、出诊断、排任务、验证结果、每周审核。

## 技术栈

- 后端：Node.js 20 + Fastify
- 数据库：SQLite（`better-sqlite3`，单文件；迁移只前进，升级不会清库）
- 前端：原生 JS，ES 模块经 esbuild 打包
- AI：后端代理，OpenRouter 或 Anthropic 二选一（密钥只在服务器的 `.env` 里）
- 鉴权：账号密码 + JWT（cookie）+ 角色权限
- 部署：Docker Compose，Caddy 反代并自动签发证书

## 角色

| 账号 | 角色 | 权限 |
|---|---|---|
| li | seo | 日常数据可编辑；不能改 KPI 目标，不能确认询盘的渠道与等级 |
| chen | sem | 同上 |
| manager | manager | 全部可读可写，含 KPI 目标、确认询盘 |
| boss | boss | 同 manager，另可彻底删除已归档的记录 |

## 从哪看起

| 想做什么 | 看哪里 |
|---|---|
| 部署、配置环境变量 | `DEPLOY_CHECKLIST.md`、`.env.example` |
| 部署后验收 | `PRODUCTION_ACCEPTANCE.md`、`docs/ACCEPTANCE_2026-10.md` |
| 改代码（人或 AI） | `AGENTS.md` —— 入口和规矩都在那里 |
| 仓库里现在有什么 | `docs/FACTS.md`（自动生成） |
| 某个模块的口径和踩过的坑 | `docs/modules/` |

## 本地运行

```bash
cp .env.example .env        # 按注释填
cd server && npm ci && npm start
```

改了 `public/src/` 之后要在仓库根目录运行 `npm run build:web` 重新打包。
提交前会自动跑测试；第一次克隆后先执行一次 `git config core.hooksPath .githooks`。
