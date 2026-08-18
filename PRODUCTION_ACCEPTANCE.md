# 生产环境真实验收

这一步只在部署后的服务器执行。它不会读取或打印密钥值，也不会把“已配置”冒充“已连通”。

## 1. 静态预检

```bash
docker compose exec -T app npm run verify:production
```

静态预检会检查生产模式、JWT、独立 `SETTINGS_SECRET`、Hermes Provider 配置、Google 配置与 OAuth 凭据可解密、历史同步与真实数据、数据库完整性。因为没有调用外部服务，正常退出结论应为 `not_verified`，退出码为 `2`。

## 2. 真实验收

```bash
docker compose exec -T app npm run verify:production -- --live
```

`--live` 会执行以下受控动作：

- 验证 Hermes Provider 密钥与配置模型真实可用；
- 对 GSC、GA4、Google Ads 各执行一天的真实同步，默认取三天前以避开 GSC 延迟；
- 创建临时 SQLite 在线备份，重新打开并执行 `integrity_check`，然后删除临时文件。

可固定验收日期：

```bash
docker compose exec -T app npm run verify:production -- --live --date=2026-08-15
```

只有输出满足以下条件才算通过：

- `verdict` 为 `pass`；
- `ready` 为 `true`；
- 进程退出码为 `0`；
- 所有 P0 检查均为 `pass`；
- Ads 搜索词、GA4 事件和 GSC 明细表存在真实数据证据。

`fail` 表示存在阻断项，退出码为 `1`；`not_verified` 表示尚未完成实时验证，退出码为 `2`。不要把二者当成验收通过。
