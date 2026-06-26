# SEO/SEM 周报自动聚合方案(待实施)

> 背景:GSC / GA4 / Google Ads 三个真实数据同步已经打通(2026-06-26 完成,见 `google_sync_runs` 有真实记录)。
> 但 SEO 看板 / SEM 看板读取的是 `seo_weeks` / `sem_weeks` 两张表,这两张表目前**只能靠后台"录入本周数据"按钮人工填**,
> 不会因为 GSC/GA4/Ads 同步成功而自动更新。本方案是把"人工录入"换成"从已同步的明细表自动按周聚合"。

## 现状(开始前必读)

- 已有真实明细表(自动同步,见 `server/src/sync/gsc.js` `server/src/sync/ga4.js` `server/src/sync/ads.js`):
  - `gsc_daily`(date, site_url, clicks, impressions, ctr, position)
  - `gsc_query_daily`(date, site_url, query, page, clicks, impressions, ctr, position)
  - `ga4_daily` / `ga4_dimension_daily`
  - `google_ads_campaign_daily`(date, customer_id, campaign_id, campaign_name, cost_micros, impressions, clicks, conversions, ctr, average_cpc_micros, cost_per_conversion_micros)
  - `google_ads_keyword_daily`
- 周报汇总表(目前人工录入,字段在 `server/src/db/migrate.js:52-81`):
  - `seo_weeks(week_date, clicks, impressions, avg_position, top10_ratio, coverage, indexed_pages, bounce_rate, dwell_seconds)`
  - `sem_weeks(week_date, cost, impressions, clicks, conversions, roas, quality_score, cpc, ctr, cost_per_conv)`
- 手动录入入口:`server/src/routes/dataSources.js` 里 `seo_weeks`/`sem_weeks` 标记为 `manualSource('人工周报', ...)`,前端按钮"录入本周GSC数据"。
- 已知遗留问题(`CLAUDE.md`):前端时间筛选只停留在 `window._timeRange`,没有真正传后端重算 —— 这次顺手验证一下聚合接口是否支持 `start_date`/`end_date`,但不强制本次解决。

## 目标

1. 新增一个聚合任务/函数:从 `gsc_daily`(+`google_ads_campaign_daily`)按 ISO 周聚合,写入/更新 `seo_weeks`/`sem_weeks` 对应周的行(upsert,不重复插入)。
2. 触发方式:
   - 至少支持手动触发一个接口,如 `POST /api/sync/seo-weeks/aggregate`、`POST /api/sync/sem-weeks/aggregate`(或合并成一个)。
   - 可选:GSC/Ads 同步成功后(`syncGsc`/`syncAds` 跑完)自动顺带触发一次聚合,这样用户点"立即同步"就既更新明细表又更新周报。
3. 字段映射规则(本次先做能直接算的,算不出的字段允许留空,不能编造):
   - `seo_weeks.clicks/impressions` ← `gsc_daily` 按周 SUM
   - `seo_weeks.avg_position` ← `gsc_daily` 按周加权平均(按 impressions 加权,不要简单平均)
   - `seo_weeks.top10_ratio` ← 需要从 `gsc_query_daily` 按 page+query 算排名 <=10 占比,本次可以先留空或标注"待规则引擎阶段(Phase 6)实现",不要硬编一个假比例
   - `seo_weeks.coverage` / `indexed_pages` / `bounce_rate` / `dwell_seconds` ← 当前没有数据源能产出真实值,保持人工录入或留空,**不要用 0 或随意默认值冒充**
   - `sem_weeks.cost` ← `google_ads_campaign_daily.cost_micros` 按周 SUM / 1_000_000
   - `sem_weeks.impressions/clicks/conversions` ← 按周 SUM
   - `sem_weeks.ctr` ← SUM(clicks)/SUM(impressions)
   - `sem_weeks.cpc` ← SUM(cost)/SUM(clicks)
   - `sem_weeks.cost_per_conv` ← SUM(cost)/SUM(conversions)(conversions=0 时留空,不要除零）
   - `sem_weeks.roas` / `quality_score` ← 当前没有数据源,保持人工录入或留空
4. 前端:
   - 看板顶部"录入本周GSC数据"按钮可以保留作为**人工补录/纠错入口**(不是必须删除,见此前讨论:自动聚合上线前不能删,上线后建议保留为覆盖手段而不是唯一手段)。
   - 看板默认展示自动聚合结果;如果某周存在人工录入记录,以人工记录为准还是自动聚合为准,需要定义优先级(建议:自动聚合结果不覆盖已有人工修改过的字段,或者加一个 `source` 字段区分 `manual`/`auto`)。

## 实施步骤建议

1. 读 `DATA_MODEL.md` 确认 `gsc_daily`/`google_ads_campaign_daily` 等表的真实字段名(本文档字段名以代码现状为准,如有出入以代码为准)。
2. 在 `server/src/db/repositories/` 新增聚合查询函数(如 `aggregateSeoWeek(weekStart, weekEnd)` / `aggregateSemWeek(...)`)。
3. 在 `server/src/sync/`(或新建 `server/src/services/weeklyAggregate.js`)写聚合逻辑 + upsert 到 `seo_weeks`/`sem_weeks`。
4. 加路由触发入口(`server/src/routes/sync.js` 或新文件),复用 `requireAuth`/`editor` 中间件,参考现有 `/api/sync/:src` 写法。
5. 跑一次真实同步过的数据,人工核对聚合结果是否合理(不要只看接口 200,要看数字对不对)。
6. 前端接入:看板请求自动聚合后的 `seo_weeks`/`sem_weeks`,确认折线图、KPI 卡不再是"暂无真实数据"。
7. 跑相关测试/检查,commit,等待用户在服务器部署验证。

## 验收标准

- 不需要点"录入本周数据"按钮,GSC/Ads 同步成功后周报能自动出现合理的真实数字。
- 留空字段(top10_ratio/coverage/bounce_rate/roas/quality_score 等)明确显示"暂无数据/待人工补充",不显示假值。
- 时间筛选(如果顺手验证)对聚合接口生效,不强制本次解决前端历史遗留的全局时间筛选问题。
- 改动范围:后端聚合逻辑 + 路由 + 必要的前端展示调整,不重构无关模块。
