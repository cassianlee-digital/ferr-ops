// 可审计任务的规则（纯函数，不碰数据库 —— 可被 node --test 直接 import）。
//
// 背景（2026-10-10 经理反馈）：后台以前只记「做了多少事」，答不出「这件事的结果是什么、
// 证据在哪、它动了哪个页面/系列/关键词、之后数据变没变」。这里定三件事：
//   1. 哪些任务算「重要」—— 按客观规则判，不让执行人自己选；
//   2. 勾完成的门槛 —— 所有任务必须写完成结果，重要任务还必须有证据；
//   3. 关联键与证据链接长什么样才算合法 —— 存进去的东西第二阶段要拿去和 GSC/Ads 数据对账，
//      脏值在这里拦，不留到对账时才发现对不上。
//
// 门槛只能保证「填了」，保证不了「填得对」。证据是否真能支撑结论，由周度审核去查。

export const LINK_TYPES = ['page', 'campaign', 'keyword', 'kpi'];
export const MAX_LINKS = 20;
export const MAX_EVIDENCE = 10;
export const RESULT_MIN_CHARS = 4;   // 「好」「OK」不算完成结果；再短的句子也写不出发生了什么

/* 任务可以声明自己想推动哪个指标。
   review = 月度绩效考核里计分的指标（label 与 services/kpiReview.js 一致）；
   process = 过程指标，本期不计入考核，但任务总得说清自己想动的是哪个数。 */
export const TASK_KPIS = [
  { key: 'a_count', label: 'A 级询价数量', group: 'review' },
  { key: 'b_count', label: 'B 级询价数量', group: 'review' },
  { key: 'a_ratio', label: 'A 级询价占比', group: 'review' },
  { key: 'cost_a', label: 'A 级询价成本', group: 'review' },
  { key: 'cost_ab', label: 'A+B 有效询价成本', group: 'review' },
  { key: 'seo_clicks', label: '自然点击', group: 'process' },
  { key: 'seo_impressions', label: '自然曝光', group: 'process' },
  { key: 'seo_position', label: '关键词排名', group: 'process' },
  { key: 'sem_conversions', label: '广告转化', group: 'process' },
  { key: 'sem_cpa', label: '广告每转化成本', group: 'process' },
  { key: 'sem_cost', label: '广告花费', group: 'process' },
];
const KPI_LABEL = new Map(TASK_KPIS.map((k) => [k.key, k.label]));

export const IMPORTANT_REASON_LABEL = {
  manual: '人工标记',
  spend: '涉及花费',
  fix: '整改出身',
  multi_day: '跨天任务',
  was_multi_day: '原本是跨天任务（日期被改成了单日）',
  company: '公司派发',
};

export const isDone = (item) => !!item && (item.state === 'done' || item.status === 'done');
export const isMultiDay = (item) => !!(item && item.start_date && item.task_date && item.start_date < item.task_date);

/* ---------- 改动留痕 ---------- */
// 改了要留痕的字段 → 给人看的名字。别的列（备注、时段、思考框架…）改了不记：记得太多，真正要看的就被淹了。
export const TRACKED_FIELDS = {
  content: '任务内容', owner: '负责人', dept: '部门', project: '产品 / 项目',
  start_date: '开始日', task_date: '截止日', est_hours: '预估工时', important: '重要标记',
  result: '完成结果', task_actions: '具体动作', evidence: '证据链接', actual_hours: '实际用时',
};
export const CHANGE_LABEL = { ...TRACKED_FIELDS, done: '完成状态', multi_day: '跨天任务' };
// 这几项是「完成」这个动作本身填的：从空到有不算改动，有了之后再改才算
const FILLED_ON_COMPLETION = new Set(['result', 'task_actions', 'evidence', 'actual_hours']);
const asText = (v) => (v == null || v === '' ? null : String(v));

/* 一次更新（cur → next）里要记下的改动：[{ field, old_value, new_value }]。纯比较，不看是谁改的。 */
export function taskChanges(cur, next) {
  const out = [];
  for (const field of Object.keys(TRACKED_FIELDS)) {
    const o = asText(cur[field]); const n = asText(next[field]);
    if (o === n) continue;
    if (o === null && FILLED_ON_COMPLETION.has(field)) continue;
    out.push({ field, old_value: o, new_value: n });
  }
  if (isDone(cur) !== isDone(next)) out.push({ field: 'done', old_value: isDone(cur) ? '1' : '0', new_value: isDone(next) ? '1' : '0' });
  if (isMultiDay(cur) && !isMultiDay(next)) out.push({ field: 'multi_day', old_value: '1', new_value: '0' });
  return out;
}

/* 重要任务判定。满足任一条即是：
     manual    人工标了「重要」
     spend     名下挂了花费（外链 / 支出台账；由调用方查库后传入）
     fix       从整改清单排下来的 —— 整改本身带着数据依据，做完必须能对回去
     multi_day 跨天任务 —— 占了好几天的活不能只留一个勾
     company   公司派发 / 紧急任务（仅顶层：子任务的证据由它所属的大任务承载，逐条要证据只会逼人糊弄）
   返回 reasons 而不只是布尔值：界面要告诉执行人「为什么这条要交证据」。 */
export function importance(item, { spend = false, wasMultiDay = false } = {}) {
  const reasons = [];
  if (!item) return { important: false, reasons };
  if (Number(item.important) === 1) reasons.push('manual');
  if (spend) reasons.push('spend');
  if (item.fix_id) reasons.push('fix');
  if (isMultiDay(item)) reasons.push('multi_day');
  // 执行人把跨天任务改成单日，不能因此就不用交证据了（经理 / 老板改的不算，那是重新定范围）
  else if (wasMultiDay) reasons.push('was_multi_day');
  if (!item.parent_id && (item.dept === '公司' || Number(item.urgent) === 1)) reasons.push('company');
  return { important: reasons.length > 0, reasons };
}

// 证据文本 → 链接数组（一行一个，空行忽略）
export function parseEvidence(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function httpUrl(raw) {
  try {
    const u = new URL(String(raw));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch (e) {
    return null;
  }
}

/* 证据只收 http(s) 链接。
   「见截图」「已发群里」这类话不是证据 —— 截图请直接传图；而 javascript:/data: 这类 scheme
   存进去以后会被渲染成可点的 <a>，那是存储型 XSS，必须在入库前拦。 */
export function normalizeEvidence(input) {
  if (input == null || input === '') return { ok: true, value: null };
  if (typeof input !== 'string' && !Array.isArray(input)) {
    return { ok: false, detail: '证据链接需要是文本（一行一个链接）' };
  }
  const lines = Array.isArray(input) ? input.map((l) => String(l ?? '').trim()).filter(Boolean) : parseEvidence(input);
  if (lines.length > MAX_EVIDENCE) return { ok: false, detail: `证据链接最多 ${MAX_EVIDENCE} 条` };
  const out = [];
  for (const line of lines) {
    if (line.length > 500 || !httpUrl(line)) {
      return { ok: false, detail: `证据必须是 http(s) 链接，这一行不是：${line.slice(0, 60)}` };
    }
    if (!out.includes(line)) out.push(line);
  }
  return { ok: true, value: out.length ? out.join('\n') : null };
}

/* 完成门槛。返回缺了什么（空数组 = 可以完成）。
   attachments = 这条任务已上传的证据截图数；截图和链接任一即可算有证据。 */
export function completionMissing(item, { important = false, attachments = 0 } = {}) {
  const missing = [];
  if (String(item?.result || '').trim().length < RESULT_MIN_CHARS) missing.push('result');
  if (important && !parseEvidence(item?.evidence).length && !(attachments > 0)) missing.push('evidence');
  return missing;
}

export function gateDetail(missing) {
  const parts = [];
  if (missing.includes('result')) parts.push(`请写明完成结果（至少 ${RESULT_MIN_CHARS} 个字）`);
  if (missing.includes('evidence')) parts.push('这是重要任务，需要至少一条证据链接或一张证据截图');
  return parts.join('；');
}

const cleanKeyword = (v) => String(v).trim().toLowerCase().replace(/\s+/g, ' ');

/* 关联键校验与归一。campaigns = Map(campaign_id → 系列名)，由调用方从已同步的 Ads 数据里取：
   系列只收同步过的，因为手敲一个系列名对不上任何花费/转化数据，等于没关联。 */
export function normalizeLinks(input, { campaigns = new Map() } = {}) {
  if (input == null) return { ok: true, links: [] };
  if (!Array.isArray(input)) return { ok: false, detail: '关联对象需要是数组' };
  if (input.length > MAX_LINKS) return { ok: false, detail: `关联对象最多 ${MAX_LINKS} 个` };
  const links = [];
  const seen = new Set();
  for (const raw of input) {
    const type = raw && raw.type;
    if (!LINK_TYPES.includes(type)) return { ok: false, detail: '关联对象的类型不合法' };
    if (typeof raw.ref !== 'string' && typeof raw.ref !== 'number') return { ok: false, detail: '关联对象缺少内容' };
    let ref = String(raw.ref).trim();
    let label = null;
    if (!ref) return { ok: false, detail: '关联对象的内容不能为空' };
    if (type === 'page') {
      if (ref.length > 500 || !httpUrl(ref)) return { ok: false, detail: `页面要填完整网址（http/https 开头）：${ref.slice(0, 60)}` };
    } else if (type === 'keyword') {
      ref = cleanKeyword(ref);
      if (!ref || ref.length > 200) return { ok: false, detail: '关键词为空或过长' };
    } else if (type === 'campaign') {
      if (!campaigns.has(ref)) return { ok: false, detail: `广告系列不在已同步的 Ads 数据里：${ref.slice(0, 60)}` };
      label = campaigns.get(ref) || null;
    } else {
      if (!KPI_LABEL.has(ref)) return { ok: false, detail: `未知的 KPI：${ref.slice(0, 60)}` };
      label = KPI_LABEL.get(ref);
    }
    const key = type + '\u0000' + ref;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ type, ref, label });
  }
  return { ok: true, links };
}
