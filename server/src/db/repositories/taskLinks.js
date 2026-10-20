// 任务关联键数据访问层：任务 ↔ 页面 / 广告系列 / 关键词 / KPI。
import { db } from '../connection.js';

const CHUNK = 500; // IN (...) 分批：归档视图会一次拿回历年全部任务，别赌 SQLite 的变量上限

// 批量取：{loop_item_id: [{type, ref, label}…]}，列表页一次查完，避免 N+1
export function byItems(ids) {
  const map = {};
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const rows = db
      .prepare(`SELECT loop_item_id, link_type AS type, ref, label FROM task_links
                 WHERE loop_item_id IN (${part.map(() => '?').join(',')}) ORDER BY id ASC`)
      .all(...part);
    for (const r of rows) (map[r.loop_item_id] ||= []).push({ type: r.type, ref: r.ref, label: r.label });
  }
  return map;
}

// 整组替换（事务）：前端提交的是「这条任务现在关联了哪些」，不是增量。
export const replace = db.transaction((itemId, links) => {
  db.prepare('DELETE FROM task_links WHERE loop_item_id = ?').run(itemId);
  const ins = db.prepare('INSERT INTO task_links (loop_item_id, link_type, ref, label) VALUES (?,?,?,?)');
  for (const l of links) ins.run(itemId, l.type, l.ref, l.label ?? null);
});

// 任务被物理删除时清掉，不留指向空任务的关联
export function removeByItem(itemId) {
  db.prepare('DELETE FROM task_links WHERE loop_item_id = ?').run(itemId);
}

// 已同步过的广告系列：campaign_id → 最近一次同步到的名字。关联校验与下拉候选共用。
export function campaignNames() {
  const rows = db.prepare(
    `SELECT c.campaign_id AS id, c.campaign_name AS name
       FROM google_ads_campaign_daily c
       JOIN (SELECT campaign_id, MAX(date) AS d FROM google_ads_campaign_daily GROUP BY campaign_id) m
         ON m.campaign_id = c.campaign_id AND m.d = c.date
      GROUP BY c.campaign_id`
  ).all();
  return new Map(rows.map((r) => [String(r.id), r.name || '']));
}

/* 关联候选：只列同步数据里真实出现过的页面 / 系列 / 关键词（近 90 天，按点击或花费排序）。
   从候选里选出来的值天然能和数据对上；页面与关键词也允许手填（新页面还没数据时也要能关联）。 */
export function options() {
  const campaigns = db.prepare(
    `SELECT campaign_id AS id, MAX(campaign_name) AS name, SUM(cost_micros) AS cost, MAX(date) AS last_date
       FROM google_ads_campaign_daily
      GROUP BY campaign_id
      ORDER BY last_date DESC, cost DESC
      LIMIT 200`
  ).all().map((r) => ({ id: String(r.id), name: r.name || '' }));
  const names = campaignNames();
  for (const c of campaigns) c.name = names.get(c.id) || c.name;

  const pages = db.prepare(
    `SELECT page FROM gsc_query_daily
      WHERE page <> '' AND date >= date('now','-90 day')
      GROUP BY page
      ORDER BY SUM(clicks) DESC, SUM(impressions) DESC
      LIMIT 300`
  ).all().map((r) => r.page);

  const seen = new Set();
  const keywords = [];
  const push = (v) => {
    const k = String(v || '').trim().toLowerCase();
    if (k && !seen.has(k)) { seen.add(k); keywords.push(k); }
  };
  db.prepare(
    `SELECT query FROM gsc_query_daily
      WHERE date >= date('now','-90 day')
      GROUP BY query
      ORDER BY SUM(clicks) DESC, SUM(impressions) DESC
      LIMIT 200`
  ).all().forEach((r) => push(r.query));
  db.prepare(
    `SELECT keyword_text FROM google_ads_keyword_daily
      WHERE keyword_text IS NOT NULL AND date >= date('now','-90 day')
      GROUP BY keyword_text
      ORDER BY SUM(cost_micros) DESC
      LIMIT 200`
  ).all().forEach((r) => push(r.keyword_text));

  return { campaigns, pages, keywords };
}
