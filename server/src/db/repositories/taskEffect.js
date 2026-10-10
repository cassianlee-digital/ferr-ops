// 任务前后对比用的窗口聚合查询：某个页面 / 关键词 / 广告系列在一段日期里的同步数据。
// 只读已同步的 GSC / Ads 表。n = 命中的行数，用来区分「真的没数据」和「数据就是 0」。
import { db } from '../connection.js';

const GSC_AGG = `COUNT(*) n, COALESCE(SUM(clicks),0) clicks, COALESCE(SUM(impressions),0) impressions,
  CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) END position`; // 曝光加权排名，与看板同口径
const ADS_AGG = `COUNT(*) n, COALESCE(SUM(cost_micros),0) costMicros, COALESCE(SUM(clicks),0) clicks,
  COALESCE(SUM(impressions),0) impressions, COALESCE(SUM(conversions),0) conversions`;

const gscParams = (range, scope) => ({ start: range.start_date, end: range.end_date, siteUrl: scope?.gsc_site_url || null });
const adsParams = (range, scope) => ({ start: range.start_date, end: range.end_date, customerId: scope?.ads_customer_id || null });
const GSC_SCOPE = 'date BETWEEN @start AND @end AND (@siteUrl IS NULL OR site_url = @siteUrl)';
const ADS_SCOPE = 'date BETWEEN @start AND @end AND (@customerId IS NULL OR customer_id = @customerId)';

// 已同步到的最后一天。窗口能不能凑满，全看它。
export function latestDates(scope) {
  const gsc = db.prepare('SELECT MAX(date) d FROM gsc_daily WHERE (@siteUrl IS NULL OR site_url = @siteUrl)')
    .get({ siteUrl: scope?.gsc_site_url || null }).d;
  const ads = db.prepare('SELECT MAX(date) d FROM google_ads_campaign_daily WHERE (@customerId IS NULL OR customer_id = @customerId)')
    .get({ customerId: scope?.ads_customer_id || null }).d;
  return { gsc: gsc || null, ads: ads || null };
}

// 页面：GSC 里同一个页面有时带尾斜杠有时不带，两种写法都认
export function gscPage(url, range, scope) {
  const alt = url.endsWith('/') ? url.slice(0, -1) : url + '/';
  return db.prepare(`SELECT ${GSC_AGG} FROM gsc_query_daily WHERE ${GSC_SCOPE} AND page IN (@url, @alt)`)
    .get({ ...gscParams(range, scope), url, alt });
}

// 关键词（task_links 里已归一成小写；GSC 的 query 本身就是小写）
export function gscQuery(query, range, scope) {
  return db.prepare(`SELECT ${GSC_AGG} FROM gsc_query_daily WHERE ${GSC_SCOPE} AND query = @query`)
    .get({ ...gscParams(range, scope), query });
}

// 全站同期：给单个页面 / 关键词的变化当参照
export function gscSite(range, scope) {
  return db.prepare(`SELECT ${GSC_AGG} FROM gsc_daily WHERE ${GSC_SCOPE}`).get(gscParams(range, scope));
}

export function adsCampaign(campaignId, range, scope) {
  return db.prepare(`SELECT ${ADS_AGG} FROM google_ads_campaign_daily WHERE ${ADS_SCOPE} AND campaign_id = @campaignId`)
    .get({ ...adsParams(range, scope), campaignId });
}

export function adsKeyword(keyword, range, scope) {
  return db.prepare(`SELECT ${ADS_AGG} FROM google_ads_keyword_daily WHERE ${ADS_SCOPE} AND lower(keyword_text) = @keyword`)
    .get({ ...adsParams(range, scope), keyword });
}

// 全账户同期
export function adsAccount(range, scope) {
  return db.prepare(`SELECT ${ADS_AGG} FROM google_ads_campaign_daily WHERE ${ADS_SCOPE}`).get(adsParams(range, scope));
}
