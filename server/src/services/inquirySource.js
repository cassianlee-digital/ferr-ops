// 询盘来源的规则（纯函数，不碰数据库）。
//
// 经理 2026-10-10：「来的询价需要明确知道从哪个途径来的，否则无法判定谁的工作起到了作用。」
// 来源有两种可信度，必须分开存、分开显示（inquiries.src_evidence）：
//   form   = 独立站表单提交时带回来的（落地页 / 来路 / utm / gclid / 系列 / 关键词）—— 机器证据，人改不了；
//   manual = 人填的 —— 只是主张，不是证据。
// 对手填的来源，这里不做「自动判定」（没有会话级数据，判不了），只做「对账」：
// 拿填的来源词去已同步的 Ads / GSC 点击数据里找，找得到 = 有据，找不到 = 存疑，对到另一边 = 冲突。
// 对账只是把疑点挑出来给人复核，它不改渠道，也不参与计分。
import { aiEngineOf, isSearchEngine } from './aiEngines.js';
import { classify } from './attribution.js';

export const LOOKBACK_DAYS = 30;   // 询盘日往前看几天的点击：外贸询盘常在点击后好几天才发
export const SOURCE_PLACEHOLDERS = new Set(['', '待补', '未知', '不详', '无', '-', '—']);

const s = (v, max) => {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t.slice(0, max) : null;
};
function httpUrl(raw) {
  try { const u = new URL(String(raw)); return u.protocol === 'http:' || u.protocol === 'https:' ? u : null; }
  catch (e) { return null; }
}
// 网址字段：不是合法 http(s) 就丢掉这个字段，而不是拒收整条线索 —— 不能因为 referrer 格式怪就丢一条询盘
const url = (v) => { const t = s(v, 500); return t && httpUrl(t) ? t : null; };

// 来源词归一：小写、压空格；占位写法一律当「没填」
export function sourceTerm(raw) {
  const t = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return SOURCE_PLACEHOLDERS.has(t) ? '' : t;
}

/* 表单线索：把站点发来的 JSON 归一成入库字段。
   唯一的硬要求是「能让人认出这是哪条询盘」—— 邮箱或留言至少有一个，否则存进来也没法和业务手里的询盘对上。 */
export function normalizeLead(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, detail: 'body must be a JSON object' };
  const lead = {
    submission_id: s(body.submission_id, 120),
    submitted_at: s(body.submitted_at, 40),
    contact_name: s(body.name, 120),
    contact_email: s(body.email, 200),
    contact_company: s(body.company, 200),
    country: s(body.country, 80),
    product: s(body.product, 80),
    message: s(body.message, 4000),
    page_url: url(body.page_url),
    landing_page: url(body.landing_page),
    referrer: url(body.referrer),
    gclid: s(body.gclid, 200),
    utm_source: s(body.utm_source, 200),
    utm_medium: s(body.utm_medium, 200),
    utm_campaign: s(body.utm_campaign, 200),
    utm_term: s(body.utm_term, 200),
    utm_content: s(body.utm_content, 200),
    campaign_id: s(body.campaign_id, 40),
    adgroup_id: s(body.adgroup_id, 40),
    keyword: s(body.keyword, 200),
    match_type: s(body.match_type, 20),
  };
  if (!lead.contact_email && !lead.message) return { ok: false, detail: 'email or message is required' };
  lead.suggested_channel = classifyLeadChannel(lead);
  return { ok: true, value: lead };
}

const PAID_MEDIUMS = new Set(['cpc', 'ppc', 'paid', 'paidsearch', 'paid_search', 'sem']);

/* 按机器证据给线索建议一个渠道（人在转为询盘时仍可改）。顺序即优先级：
   有广告点击标识 → SEM；来路是搜索引擎 → SEO；什么来路都没有 → 直接；其余（含 AI 引擎、社媒、外链）→ 其他。
   AI 引擎暂时归「其他」：渠道目录只有四个值，改目录会牵动考核口径，是要老板定的事；
   引擎本身记在 referrer / utm_source 里，GEO 统计按它数，不靠渠道字段。 */
export function classifyLeadChannel(lead) {
  if (lead.gclid || lead.campaign_id || PAID_MEDIUMS.has(String(lead.utm_medium || '').toLowerCase())) return 'SEM付费';
  const origin = lead.referrer || lead.utm_source || '';
  if (aiEngineOf(origin)) return '其他';
  if (isSearchEngine(origin) || String(lead.utm_medium || '').toLowerCase() === 'organic') return 'SEO自然';
  if (!lead.referrer && !lead.utm_source) return '直接';
  return '其他';
}

// 线索来自哪个 AI 引擎（没有则 null）。GEO 统计「AI 引擎带来的询盘」用它。
export function leadAiEngine(row) {
  return aiEngineOf(row?.src_referrer || row?.referrer) || aiEngineOf(row?.utm_source || utmSource(row?.src_utm));
}
function utmSource(json) {
  try { return JSON.parse(json || '{}').source || ''; } catch (e) { return ''; }
}

/* 表单线索 → 询盘的来源字段。campaignNames = Map(campaign_id → 已同步到的系列名)。
   关键词：线索里有就用线索的（机器证据），没有才留人填的那个，所以没有时这里不回 source 字段。 */
export function leadSource(lead, campaignNames = new Map()) {
  const utm = {};
  for (const k of ['source', 'medium', 'campaign', 'term', 'content']) if (lead['utm_' + k]) utm[k] = lead['utm_' + k];
  const out = {
    src_campaign_id: lead.campaign_id || null,
    src_campaign: (lead.campaign_id && campaignNames.get(String(lead.campaign_id))) || lead.utm_campaign || null,
    src_landing_page: lead.landing_page || lead.page_url || null,
    src_referrer: lead.referrer || null,
    src_gclid: lead.gclid || null,
    src_utm: Object.keys(utm).length ? JSON.stringify(utm) : null,
    src_evidence: 'form',
    lead_id: lead.id,
  };
  const term = lead.keyword || lead.utm_term;
  if (term) out.source = term;
  return out;
}

/* 人手填的来源（系列 / 落地页）。只处理 body 里出现的字段；返回 { ok, value } 或 { ok:false, detail }。
   系列只收已同步过的 campaign_id：手敲的名字对不上任何花费数据。 */
export function manualSource(body, campaignNames = new Map()) {
  const out = {};
  if ('src_campaign_id' in body) {
    const id = body.src_campaign_id == null ? '' : String(body.src_campaign_id).trim();
    if (id && !campaignNames.has(id)) return { ok: false, detail: '广告系列不在已同步的 Ads 数据里' };
    out.src_campaign_id = id || null;
    out.src_campaign = id ? (campaignNames.get(id) || null) : null;
  }
  if ('src_landing_page' in body) {
    const page = body.src_landing_page == null ? '' : String(body.src_landing_page).trim();
    if (page && (page.length > 500 || !httpUrl(page))) return { ok: false, detail: '落地页要填完整网址（http/https 开头）' };
    out.src_landing_page = page || null;
  }
  return { ok: true, value: out };
}

export const VERDICTS = {
  FORM: { label: '表单来源', tone: 'good', hint: '独立站表单提交时带回的来源，机器证据' },
  SUPPORTED: { label: '有据', tone: 'good', hint: '填的来源词在对应渠道近期有真实点击' },
  AMBIGUOUS: { label: '两边都有', tone: 'warn', hint: '这个词在广告和自然搜索里近期都有点击，光凭词分不出是哪边带来的' },
  CONFLICT: { label: '对不上', tone: 'bad', hint: '填的渠道里找不到这个词的点击，另一个渠道里却有' },
  UNSUPPORTED: { label: '存疑', tone: 'bad', hint: '填的来源词在 Ads 和 GSC 近期的点击里都找不到' },
  HINT: { label: '可能填错', tone: 'warn', hint: '渠道填的是直接 / 其他，但这个词近期在 Ads 或 GSC 有点击' },
  NO_SOURCE: { label: '未填来源', tone: 'warn', hint: '没有填来源词，无从对账' },
  NO_DATA: { label: '无法对账', tone: 'muted', hint: '这段时间没有对应的同步数据，不能据此说它对或不对' },
  NOT_APPLICABLE: { label: '', tone: 'muted', hint: '' },
};

/* 对账结论。row = {channel, source, src_evidence}；
   evidence = { ads: {covered, hit}, gsc: {covered, hit} }
     covered = 询盘日前 LOOKBACK_DAYS 天里，这个数据源有没有同步数据（没同步就不能说「找不到」）
     hit     = 这个词在那段时间有没有带来点击 */
export function sourceVerdict(row, evidence) {
  if (row.src_evidence === 'form') return 'FORM';
  const term = sourceTerm(row.source);
  const ch = classify(row.channel); // SEO | SEM | direct | other —— 与归因、总账同一个分类函数
  const ads = evidence?.ads || {}; const gsc = evidence?.gsc || {};
  if (!term) return ch === 'SEO' || ch === 'SEM' ? 'NO_SOURCE' : 'NOT_APPLICABLE';
  if (ch === 'SEM' || ch === 'SEO') {
    const own = ch === 'SEM' ? ads : gsc; const other = ch === 'SEM' ? gsc : ads;
    if (own.hit) return other.hit ? 'AMBIGUOUS' : 'SUPPORTED';
    if (!own.covered) return 'NO_DATA';      // 自己这边压根没数据：不能因为「没同步」就说人家填错了
    return other.hit ? 'CONFLICT' : 'UNSUPPORTED';
  }
  return ads.hit || gsc.hit ? 'HINT' : 'NOT_APPLICABLE';
}
