# 费尔瑞 FERR · 运营指挥中心（自托管）

把单文件演示原型改造成自托管、有数据库、有真账号、AI 真接入的内部运营后台。

- 后端：Node.js + Fastify
- 数据库：SQLite（`better-sqlite3`，单文件）
- AI：后端代理 Anthropic Messages API（密钥仅在 `.env`）
- 鉴权：账号密码 + JWT(cookie) + 角色权限
- 反代/HTTPS：Caddy（自动证书）
- 容器化：Docker + docker-compose

## 角色（V7）

| 账号 | 角色 | 权限 |
|---|---|---|
| li | seo | 除「KPI 目标修改」外全部可编辑（含录询盘、无差别编辑所有关键词库） |
| chen | sem | 除「KPI 目标修改」外全部可编辑 |
| manager | manager | 全部可读可写（含 KPI 目标） |
| boss | boss | 全部可读可写（含 KPI 目标） |

> V7 已移除 sales 角色、新增 manager。**升级到 V7 时数据库会一次性清库重建**（按需求「清空所有 mock 数据，从 0 录入」）。务必在 `.env` 配好 `SEED_MANAGER_PASSWORD`，否则 manager 账号不会创建。

---

## 一、需要你先准备

1. **Anthropic API Key** — 在 https://console.anthropic.com 申请。
2. **Docker + Docker Compose** — 本地或 VPS 装好。
3. （正式环境）**一个域名**，把 A 记录解析到 VPS 公网 IP。纯内网/本地测试可不需要。
4. 团队四个账号的初始口令（自定，登录后可改）。

## 二、配置 `.env`

```bash
cp .env.example .env
```

编辑 `.env`，至少填写：

| 变量 | 说明 |
|---|---|
| `JWT_SECRET` | 随机长串，生成：`openssl rand -hex 32` |
| `SEED_LI_PASSWORD` / `SEED_CHEN_PASSWORD` / `SEED_MANAGER_PASSWORD` / `SEED_BOSS_PASSWORD` | 四个账号初始口令 |
| `ANTHROPIC_API_KEY` | Anthropic 密钥 |
| `ANTHROPIC_MODEL` | 可选，默认 `claude-sonnet-4-6` |
| `DOMAIN` | 本地填 `localhost`；正式填你的域名 |
| `ACME_EMAIL` | 正式环境填邮箱（证书续期通知） |

> `.env` 已被 `.gitignore`，**绝不会**进仓库；密钥只存在于服务器本机。

## 三、本地测试

```bash
docker compose up --build
```

浏览器访问 **https://localhost**（`DOMAIN=localhost` 时 Caddy 用本地 CA 自签，浏览器会提示一次，点继续即可）。
用 `li / chen / sales / boss` + 你在 `.env` 设的口令登录。

数据库文件落在 `./data/ferr.sqlite`（挂载卷，重启不丢）。

## 四、VPS 正式部署

```bash
# 1. 装 Docker 与 Compose（略）
# 2. 拉代码
git clone <your-repo> ferr-ops && cd ferr-ops
# 3. 配置
cp .env.example .env && vi .env          # 填 DOMAIN=your-domain.com、密钥、口令
# 4. 启动（后台）
docker compose up -d --build
```

Caddy 会自动向 Let's Encrypt 申请并续期 HTTPS 证书（需 80/443 端口可达、域名已解析）。
访问 `https://your-domain.com`。

### 从本地迁移到 VPS

因已 Docker 化：`git clone` → 拷贝 `./data` 目录（SQLite 卷）到 VPS 同位置 → `docker compose up -d`。十几分钟完成。

## 五、每日备份（cron）

在线备份脚本（安全、含 WAL）：

```bash
docker compose exec -T app node src/db/backup.js   # 输出到 ./backup/ferr-<时间>.sqlite
```

宿主机 crontab 每天凌晨 3 点备份并清理 14 天前的旧备份：

```cron
0 3 * * * cd /path/to/ferr-ops && docker compose exec -T app node src/db/backup.js && find ./backup -name 'ferr-*.sqlite' -mtime +14 -delete
```

## 六、常用运维

```bash
docker compose logs -f app      # 看后端日志
docker compose restart app      # 重启后端
docker compose down             # 停止
```

改密码：登录后调用 `POST /api/change-password`（或后续在设置页加入口）。

---

## 分期

- **第一期（本仓库）**：手动录入 + 鉴权角色 + AI 代理 + Docker 化。
- **第二期**：Google Search Console / Ads / GA4 自动同步 —— 当前仅占位，`/api/sync/*` 返回 `501 Not Implemented`，不实现。

## 数据流 / API 一览

鉴权 `POST /api/login` `POST /api/logout` `GET /api/me` `POST /api/change-password`
询盘 `GET/POST/PATCH/DELETE /api/inquiries`（写限 sales）
SEO 周报 `GET/POST /api/seo-weeks`（写限 li）
SEM 周报 `GET/POST /api/sem-weeks`（写限 chen，CPC/CTR/每转化后端算）
KPI `GET /api/kpi-targets`（含评分）/ `PUT`（改目标，限 boss）
否词 `GET/POST/PATCH /api/neg-keywords`（写限 chen）
广告创意 `GET/POST/PATCH /api/ad-creatives`（写限 chen）
排名快照 `GET/POST /api/rank-snapshots`（写限 li）
关键词库 `GET/POST/PATCH/DELETE /api/keywords?type=`（seo/high/customer 限 li，sem 限 chen）
整改 `GET/POST/PATCH /api/fixes`（写限 li/chen）
闭环 `GET/POST/PATCH /api/loop-items`（写限 li/chen）
AI 代理 `POST /api/ai`（密钥后端，上下文由 DB 实时组装）
第二期占位 `/api/sync/gsc|ads|ga4` → 501
