# DEPLOY_CHECKLIST — ferr-ops 上线前验收清单

> MVP 上线稳定版。部署由用户在服务器执行；本文件只做核对，不含密钥。
> 服务器项目目录(已知)：`/opt/ferr-ops`（`docker-compose.yml` 在此）。

## 1. 启动步骤

**服务器（Docker，正式）**
```bash
cd /opt/ferr-ops
sudo git pull origin main
sudo docker compose up -d --build   # public/ 打进镜像，前端改动必须 --build
sudo docker compose logs -f app      # 看启动日志（可选）
```
> 仓库属 root：git 命令用 `sudo`；首次报 dubious ownership 时先 `sudo git config --global --add safe.directory /opt/ferr-ops`。

**本地开发（无 Docker，可选）**
```bash
cd server && npm install
cp ../.env.example ../.env   # 填好后
npm start                    # node src/index.js，默认 :3000
```

## 2. 必需 .env 变量（复制 .env.example 填写，勿提交 .env）
- `JWT_SECRET`：长随机串（`openssl rand -hex 32`）——必填，签名会话。
- `SEED_LI_PASSWORD` / `SEED_CHEN_PASSWORD` / `SEED_MANAGER_PASSWORD` / `SEED_BOSS_PASSWORD`：四个初始账号口令（用户名 li/chen/manager/boss）。
- `ANTHROPIC_API_KEY`：AI 建议必需；未填时 AI 接口返回 503，前端显示「AI 暂不可用」（非崩溃）。
- `DOMAIN`：有域名填域名（Caddy 自动 HTTPS）；纯 IP 填 `:80`。
- `COOKIE_SECURE`：HTTPS 部署 `true`；纯 HTTP（`DOMAIN=:80`）**必须 `false`**，否则无法登录。
- 可选：`PORT`(默认3000)、`NODE_ENV`、`SESSION_HOURS`(默认72)、`ANTHROPIC_MODEL`、`ANTHROPIC_MAX_TOKENS`、`ACME_EMAIL`(有域名签证书)、`SETTINGS_SECRET`(不填则从 JWT_SECRET 派生)。

## 3. 首次部署步骤
1. 把代码放到 `/opt/ferr-ops`（git clone 或已存在则 `git pull`）。
2. `cp .env.example .env`，填好第 2 节变量（尤其 `JWT_SECRET`、四个 SEED 口令、`DOMAIN`、`COOKIE_SECURE`）。
3. `sudo docker compose up -d --build`。
4. **建表 + 初始账号自动完成**：启动时 `seed()` 幂等执行（无需手动 migrate/seed），生成 li/chen/manager/boss 四个账号。
5. 浏览器访问 `DOMAIN`，用 boss 账号登录，按第 5 节手测。

## 4. 数据库持久化与备份
- SQLite 库与备份通过卷持久化：`./data`（库）、`./backup`（备份输出）——**重建/升级不丢数据**。
- **切勿删除 `/opt/ferr-ops/data`**；迁移服务器时连同 `data/` 一起带走。
- 手动备份：`sudo docker compose exec app npm run backup`（输出到 `./backup`）；建议定期 `cron` + 异地留存。
- `seed()` 幂等：重启不会覆盖已有业务数据，只补缺失的初始账号/KPI/市场调研。

## 5. 上线后必须手测的核心闭环（每项：新增 → 刷新后仍在）
- [ ] **登录**：四个角色（li/chen/manager/boss）能登录；错误口令被拒；登出正常。
- [ ] **询盘**：录入一条 → 列表/统计更新 → 刷新仍在；切换时间范围列表随之过滤。
- [ ] **SEO 周报**：录入一周 → 顶部卡片+SEO折线图更新+KPI 重算 → 刷新仍在。
- [ ] **SEM 周报**：录入一周 → CPC/CTR/每询盘成本后端算出 → 刷新仍在。
- [ ] **关键词库**（4 子表）：加词 → 单元格编辑入库 → 刷新仍在；列对齐无错位；type 不串库。
- [ ] **否词库**：加一行 → 编辑词/原因 → 刷新仍在。
- [ ] **广告创意库**：加一行 → 编辑标题/描述/结论 → 刷新仍在。
- [ ] **AI 建议采纳**：触发 AI（需 `ANTHROPIC_API_KEY`）→ 点「采纳」→ 进整改清单+沉淀表 → 刷新仍在；AI 失败有明确提示、采纳失败提示「未入库」（不假成功）。
- [ ] 全程 Console 无报错；保存失败均有 toast 报因。

## 6. 已知非阻断 TODO（不影响 MVP 上线，后续迭代）
- **GSC / GA4 / Google Ads 自动同步未接入**：`sync/*` 为占位，周报靠人工录入；数据源状态卡如实显示「未配置/同步未实现(Phase 2)」。
- **部分看板为静态/空状态**：仪表盘 mini 图与两个 donut 真实模式下为空状态（非假数据）；GA4 看板为骨架+空状态；SEM 看板不消费时间范围（已加提示）。
- **`loadClosedLoop` 加载失败暂静默**：整改/沉淀的加载 `catch{}` 未提示（与已修的核心 loader 同类，后续补失败 toast）。
- **SEO「近6周」列现为可编辑文本**（非 sparkline，数据本应来自 GSC）。
- **询盘写入角色为 editor**（非仅销售）；如需收紧再调权限。
- 时间筛选仅作用于询盘 + SEO 折线图；KPI/总览/SEM看板/GA4/整改/任务/复盘不受影响（前端已加边界提示）。
