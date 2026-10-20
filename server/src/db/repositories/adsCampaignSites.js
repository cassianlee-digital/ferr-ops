// 广告系列归到哪个站点（人指定）的数据访问层，以及给「建议归属」用的表单证据。
import { db } from '../connection.js';

// Map(系列编号 → 站点 id)
export function mapping() {
  return new Map(db.prepare('SELECT campaign_id, site_id FROM ads_campaign_sites').all().map((r) => [r.campaign_id, r.site_id]));
}

// siteId 为 null = 取消归属
export function set(campaignId, siteId, userId) {
  if (siteId == null) { db.prepare('DELETE FROM ads_campaign_sites WHERE campaign_id = ?').run(String(campaignId)); return; }
  db.prepare(
    `INSERT INTO ads_campaign_sites (campaign_id, site_id, set_by) VALUES (?, ?, ?)
     ON CONFLICT(campaign_id) DO UPDATE SET site_id = excluded.site_id, set_by = excluded.set_by, updated_at = datetime('now')`
  ).run(String(campaignId), siteId, userId ?? null);
}

// 表单带回来源的询盘里，每个系列落在每个站点几次。只数表单证据：手工填的系列和站点都是人的主张，拿来当「建议」等于自己证明自己
export function formEvidence() {
  return db.prepare(
    `SELECT src_campaign_id AS campaign_id, site_id, COUNT(*) AS n
     FROM inquiries
     WHERE src_evidence = 'form' AND src_campaign_id IS NOT NULL AND src_campaign_id <> '' AND site_id IS NOT NULL
     GROUP BY src_campaign_id, site_id`
  ).all();
}

// 归属里引用到、但已经停用的站点（它名下的系列和花费不能凭空消失，所以照样要列出来）
export function referencedInactiveSites() {
  return db.prepare(
    `SELECT DISTINCT p.id, p.name FROM ads_campaign_sites m JOIN google_projects p ON p.id = m.site_id WHERE p.active = 0`
  ).all();
}
