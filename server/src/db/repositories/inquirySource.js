// 询盘来源对账用的批量查询：一批来源词在一段日期里的点击命中、数据源的同步覆盖。只读已同步的 Ads / GSC 表。
import { db } from '../connection.js';

const CHUNK = 400; // IN (...) 分批，别赌 SQLite 的变量上限

// Ads：既看投放的关键词，也看实际触发的搜索词（来源词可能填的是任一种）。只认有点击的日子。
const ADS_SQL = [
  `SELECT lower(keyword_text) term, date FROM google_ads_keyword_daily
    WHERE date BETWEEN ? AND ? AND clicks > 0 AND lower(keyword_text) IN (@IN)`,
  `SELECT lower(search_term) term, date FROM google_ads_search_term_daily
    WHERE date BETWEEN ? AND ? AND clicks > 0 AND lower(search_term) IN (@IN)`,
];
const GSC_SQL = ['SELECT query term, date FROM gsc_query_daily WHERE date BETWEEN ? AND ? AND clicks > 0 AND query IN (@IN)'];

// 一批词在 [start, end] 里有点击的日期：Map(term → Set(date))。多张表的结果并在一起，每张表每批只扫一次。
function hitDates(sqls, terms, start, end) {
  const map = new Map();
  for (let i = 0; i < terms.length; i += CHUNK) {
    const part = terms.slice(i, i + CHUNK);
    const ph = part.map(() => '?').join(',');
    for (const sql of sqls) {
      for (const r of db.prepare(sql.replace('@IN', ph)).all(start, end, ...part)) {
        if (!map.has(r.term)) map.set(r.term, new Set());
        map.get(r.term).add(r.date);
      }
    }
  }
  return map;
}
export const adsHitDates = (terms, start, end) => hitDates(ADS_SQL, terms, start, end);
export const gscHitDates = (terms, start, end) => hitDates(GSC_SQL, terms, start, end);

// 数据源在 [start, end] 里哪些天有同步数据。没同步的日子不能当成「没有点击」。
const covered = (table) => (start, end) => new Set(
  db.prepare(`SELECT DISTINCT date FROM ${table} WHERE date BETWEEN ? AND ?`).all(start, end).map((r) => r.date),
);
export const adsCoveredDates = covered('google_ads_campaign_daily');
export const gscCoveredDates = covered('gsc_daily');
