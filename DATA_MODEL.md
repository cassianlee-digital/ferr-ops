# DATA_MODEL.md — ferr-ops 数据底座设计

> **设计文档,非现状。** 以下表/字段是后续阶段的目标数据模型,**当前数据库尚未实现**。
> 实际建表在对应 ROADMAP Phase 落地时进行,届时通过 `server/src/db/migrate.js` 增量迁移。
> 现有表见 `migrate.js`(users / inquiries / seo_weeks / sem_weeks / keywords / neg_keywords /
> ad_creatives / rank_snapshots / kpi_targets / fixes / loop_items / integrations /
> market_brain / market_research / monthly_snapshots / weekly_reports / content_assets)。

约定:所有密钥/令牌字段以 `_enc` 结尾,表示 **AES 加密存储**,绝不明文返回前端。

---

## oauth_tokens —— 第三方 API 授权

| 字段 | 说明 |
|---|---|
| id | 主键 |
| provider | gsc / ga4 / google_ads / anthropic / openai |
| account_label | 账号标签(便于多账号区分) |
| access_token_enc | 加密 access token |
| refresh_token_enc | 加密 refresh token |
| scope | 授权范围 |
| expiry_date | access token 过期时间 |
| status | 授权状态(active / expired / error / revoked) |
| last_error | 最近一次错误 |
| created_at / updated_at | 时间戳 |

---

## sync_runs —— 同步运行记录

| 字段 | 说明 |
|---|---|
| id | 主键 |
| provider | 同步来源 |
| sync_type | 同步类型(full / incremental / range) |
| date_start / date_end | 同步数据区间 |
| status | running / success / failed |
| rows_inserted / rows_updated | 写入统计 |
| started_at / finished_at | 起止时间 |
| error_message | 失败原因(供前端展示) |

---

## gsc_daily —— GSC Search Analytics

| 字段 | 说明 |
|---|---|
| id | 主键 |
| date | 日期 |
| site_url | GSC 资源 |
| page | 页面 URL |
| query | 搜索查询词 |
| country | 国家 |
| device | 设备 |
| clicks / impressions | 点击 / 展现 |
| ctr / position | 点击率 / 平均排名 |
| created_at | 入库时间 |

---

## ga4_daily / ga4_landing_daily —— GA4 数据

| 字段 | 说明 |
|---|---|
| id | 主键 |
| date | 日期 |
| property_id | GA4 property |
| source / medium / campaign | 流量来源 |
| country / device | 地区 / 设备 |
| landing_page | 落地页 |
| sessions / active_users / engaged_sessions | 会话指标 |
| engagement_rate / average_session_duration | 参与度 |
| key_events | 关键事件总数 |
| form_submit / file_download / click_email / click_whatsapp | 转化事件 |
| created_at | 入库时间 |

---

## ads_search_terms —— Google Ads 搜索词

| 字段 | 说明 |
|---|---|
| id | 主键 |
| date | 日期 |
| customer_id | Ads 客户 ID |
| campaign_id / campaign_name | 广告系列 |
| adgroup_id / adgroup_name | 广告组 |
| keyword | 关键词 |
| search_term | 实际搜索词 |
| match_type | 匹配类型 |
| country | 国家 |
| impressions / clicks / cost | 展现 / 点击 / 花费 |
| conversions / conversion_value | 转化 / 转化价值 |
| ctr / cpc / cpa | 点击率 / 单次点击 / 单次转化成本 |
| quality_score | 质量得分 |
| created_at | 入库时间 |

---

## inquiry attribution fields —— 询盘归因(补充到 inquiries 或关联表)

> 现有 inquiries 已有:date / country / region / channel / source / product / grade / note /
> customer_code(客户编码) / salesperson(业务员) / deal_status(是否成交:未成交 | 已成交) /
> tracking_feedback / original_grade。customer_name 已从录入与表格下线,列保留只为不丢历史数据。
> 以下为归因增强字段:

| 字段 | 说明 |
|---|---|
| source_channel | 来源渠道 |
| landing_page | 落地页 |
| referrer | 来源页 |
| keyword_or_search_term | 关键词 / 搜索词 |
| utm_source / utm_medium / utm_campaign / utm_term / utm_content | UTM 参数 |
| ads_campaign_id / ads_campaign_name | 关联广告系列 |
| ads_adgroup_id / ads_adgroup_name | 关联广告组 |
| ads_keyword / ads_search_term | 关联关键词 / 搜索词 |
| ga_client_id / ga_session_id | GA4 会话关联 |
| sales_stage | 销售阶段 |
| deal_value | 成交额 |
| invalid_reason | 无效原因(C 级反推) |
| grade_reason | 评级原因 |

---

## findings —— 自动诊断结果

| 字段 | 说明 |
|---|---|
| id | 主键 |
| rule_key | 诊断规则标识 |
| severity | 严重程度 |
| source_module | 来源模块(seo / sem / ga4 / inquiry) |
| entity_type / entity_id | 关联实体 |
| metric | 涉及指标 |
| evidence_json | **数据证据(每条诊断必须有)** |
| status | open / resolved / dismissed |
| detected_at / resolved_at | 时间 |
| created_task_id | 转出的任务 ID |

---

## recommendations —— AI / 规则生成的建议

| 字段 | 说明 |
|---|---|
| id | 主键 |
| finding_id | 关联诊断 |
| source_module | 来源模块 |
| problem_type | 问题类型 |
| recommendation_text | 建议内容 |
| priority | 优先级 |
| expected_impact | 预期影响 |
| owner | 负责人 |
| status | proposed / adopted / rejected |
| created_task_id | 转出的任务 ID |
| created_at / reviewed_at | 时间 |

---

## tasks —— 任务闭环

| 字段 | 说明 |
|---|---|
| id | 主键 |
| title | 标题 |
| source | 来源(finding / recommendation / manual) |
| related_entity_type / related_entity_id | 关联实体 |
| hypothesis | 假设 |
| action | 动作 |
| owner | 负责人 |
| priority | 优先级 |
| due_date / check_date | 截止 / 检查日期 |
| success_metric | 成功指标 |
| status | 状态 |
| result | 结果数据 |
| conclusion | 结论(动作是否有效) |
| sop_created | 是否已沉淀为 SOP |
