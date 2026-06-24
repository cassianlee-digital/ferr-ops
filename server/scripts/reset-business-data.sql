-- ============================================================
-- 业务数据清空脚本（上线前清测试/假数据，准备录入真实数据）
-- 用法（在服务器，容器内 DB 路径 /app/data/ferr.sqlite）：
--   sudo docker compose exec app sh -lc "sqlite3 /app/data/ferr.sqlite < /app/server/scripts/reset-business-data.sql"
--   （若容器内没有 sqlite3，可先 apk add sqlite，或把本文件内容贴进 sqlite3 交互执行）
-- 强烈建议先备份：
--   sudo docker compose exec app sh -lc "cp /app/data/ferr.sqlite /app/data/ferr.backup.$(date +%F-%H%M).sqlite"
--
-- 保留：users（账号）、integrations（加密 API 密钥 / Google token）
-- 清空：下方「业务数据」段
-- 可选：market_research / market_brain / kpi_targets（默认注释掉，需要才取消注释）
-- ============================================================

BEGIN TRANSACTION;

-- ---- 业务数据（测试期录入的内容，全部清空） ----
DELETE FROM inquiries;
DELETE FROM keywords;
DELETE FROM neg_keywords;
DELETE FROM ad_creatives;
DELETE FROM fixes;
DELETE FROM loop_items;       -- 月度计划 / 测试登记 / 沉淀表 / 任务卡
DELETE FROM seo_weeks;
DELETE FROM sem_weeks;
DELETE FROM rank_snapshots;
DELETE FROM weekly_reports;
DELETE FROM content_assets;
DELETE FROM sop_definitions;  -- SOP 设置（测试时建的，重新录真实 SOP）
DELETE FROM sop_completions;
DELETE FROM monthly_snapshots;-- 总览环比快照（会随新数据自动重建）

-- ---- 可选：默认保留，需要清再取消注释 ----
-- DELETE FROM market_research;  -- 市场调研问卷（孟雪/王璐平/燕敏）—— 若是真实基线请勿删
-- DELETE FROM market_brain;     -- AI 市场记忆体（删后下次会重新学习）
-- DELETE FROM kpi_targets;      -- KPI 目标值/权重（设置页配置，通常保留）

-- ---- 可选：把自增 ID 归零，让新数据从 1 开始（纯洁癖，可不执行） ----
DELETE FROM sqlite_sequence WHERE name IN (
  'inquiries','keywords','neg_keywords','ad_creatives','fixes','loop_items',
  'seo_weeks','sem_weeks','rank_snapshots','weekly_reports','content_assets',
  'sop_definitions','sop_completions'
);

COMMIT;
VACUUM;
