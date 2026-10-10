// GEO 取数：GA4 会话来源、带表单证据的询盘、表单线索。归到哪个 AI 引擎由 services/geo.js 判，这里只取原值。
import { db } from '../connection.js';

// 区间内 GA4 的全站会话数、有数据的天数，以及各会话来源（source / medium 原值）的会话
export function ga4Sources(range, propertyId) {
  const params = { start: range.start_date, end: range.end_date, propertyId: propertyId || null };
  const total = db.prepare(
    `SELECT COUNT(DISTINCT date) dataDays, COALESCE(SUM(sessions),0) sessions
       FROM ga4_daily WHERE date BETWEEN @start AND @end AND (@propertyId IS NULL OR property_id = @propertyId)`
  ).get(params);
  const sources = db.prepare(
    `SELECT dimension_value source, SUM(sessions) sessions, SUM(active_users) users, SUM(key_events) keyEvents
       FROM ga4_dimension_daily
      WHERE date BETWEEN @start AND @end AND dimension_type = 'source_medium'
        AND (@propertyId IS NULL OR property_id = @propertyId)
      GROUP BY dimension_value`
  ).all(params);
  return { dataDays: total.dataDays || 0, sessions: total.sessions || 0, sources };
}

// 有表单证据的询盘（未归档）：只有它们的来路是机器带回的
export function formInquiries(range) {
  return db.prepare(
    `SELECT id, grade, src_referrer, src_utm FROM inquiries
      WHERE (state IS NULL OR state <> 'archived') AND src_evidence = 'form'
        AND date BETWEEN @start_date AND @end_date`
  ).all(range);
}

// 区间内收到的表单线索（received_at 是 UTC，按日期部分粗取；含已忽略的）
export function leads(range) {
  return db.prepare(
    `SELECT id, state, referrer, utm_source FROM inquiry_leads
      WHERE date(received_at) BETWEEN @start_date AND @end_date`
  ).all(range);
}
