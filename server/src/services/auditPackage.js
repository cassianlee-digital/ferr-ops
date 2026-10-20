// 周度审核包：一段日期（通常是一周）里，某个人或整个部门「做了什么、证据在哪、数据变没变、钱花在哪、询盘怎么样」。
//
// 经理 2026-10-10 要的四样东西 —— 周度审核页、AI 按人审核、CSV/XLSX/JSON 导出、把数据开放给 AI ——
// 吃的是同一份数。所以只组装这一个包，四处都读它，不做四套各算各的（那样迟早对不上）。
//
// 这里只把已有的事实取齐、按人切开，不产生任何新的判断口径：
//   任务疑点     → services/auditRules.js
//   前后数据对比 → services/taskEffectData.js（与任务卡上的「数据变化」是同一个函数）
//   来源对账     → services/inquirySourceData.js
//   钱花在哪     → services/spend.js
//   GEO          → services/geoData.js
//   KPI          → services/kpiReview.js（月度考核口径，这里取「本月至今」）
import * as loopRepo from '../db/repositories/loopItems.js';
import * as changesRepo from '../db/repositories/loopItemChanges.js';
import * as fixesRepo from '../db/repositories/fixes.js';
import * as inqRepo from '../db/repositories/inquiries.js';
import * as leadsRepo from '../db/repositories/inquiryLeads.js';
import * as checkinRepo from '../db/repositories/taskCheckins.js';
import * as weeklyRepo from '../db/repositories/weeklyReports.js';
import * as backlinksRepo from '../db/repositories/backlinks.js';
import * as expensesRepo from '../db/repositories/expenses.js';
import * as effectRepo from '../db/repositories/taskEffect.js';
import { previousRange } from '../lib/parseDateRange.js';
import { readScope, resolveProject } from '../sync/googleClient.js';
import { listProjects } from '../db/repositories/googleSync.js';
import { leadSite } from './inquirySource.js';
import { FLAGS, PEOPLE, deptOfPerson, effectDigest, personOf, summarizeTasks, taskFlags, taskState } from './auditRules.js';
import { buildGeoSummary } from './geoData.js';
import { VERDICTS } from './inquirySource.js';
import { buildSourceChecks } from './inquirySourceData.js';
import { resolveSemSpend } from './kpiLedger.js';
import { buildReview } from './kpiReview.js';
import { sopStats } from './sopStats.js';
import { backlinkStats, summarizeSpend } from './spend.js';
import { CHANGE_LABEL, parseEvidence } from './taskAudit.js';
import { decorateTasks } from './taskAuditData.js';
import { addDays, businessDate, compare } from './taskEffect.js';
import { buildTaskEffect } from './taskEffectData.js';

export const AUDIT_EFFECT_DAYS = 14; // 审核包里前后对比统一用 14 天窗口；要看 7 / 28 天去任务的「数据变化」
export const MAX_RANGE_DAYS = 92;    // 审核是按周、最多按季看的；再长就该去看月度考核和总账了

const inRange = (d, range) => !!d && d >= range.start_date && d <= range.end_date;
const dayOf = (ts) => businessDate(ts); // 库里的时间戳是 UTC，统一按北京时间归日

function projectScope() {
  try { return resolveProject({}); } catch (e) { return {}; }
}

/* ---------- 任务 ---------- */
function buildTasks(range, who, today) {
  // 先用原始行判状态，只给进审核的那几十条补关联键 / 证据截图（全量补会把历年任务都查一遍）
  const candidates = loopRepo.list('task', { view: 'all' })
    .map((t) => ({ row: t, state: taskState(t, range, today) }))
    .filter((x) => x.state && (!who || personOf(x.row) === who));
  const stateOf = new Map(candidates.map((x) => [x.row.id, x.state]));
  const checkins = new Map(checkinRepo.daysInRange(range.start_date, range.end_date).map((r) => [r.loop_item_id, r.days]));
  const deleters = loopRepo.deleterNames(candidates.filter((x) => x.state === 'deleted').map((x) => x.row.id));
  const changeLog = changesRepo.byItems(candidates.map((x) => x.row.id));

  return decorateTasks(candidates.map((x) => x.row)).map((t) => {
    const state = stateOf.get(t.id);
    const measurable = t.links.some((l) => l.type !== 'kpi');
    const effect = state === 'completed' && measurable ? buildTaskEffect(t, t.links, AUDIT_EFFECT_DAYS) : null;
    const checkinDays = checkins.get(t.id) || 0;
    return {
      id: t.id,
      content: t.content,
      dept: t.dept || null,
      owner: t.owner || null,
      person: personOf(t),
      parent_id: t.parent_id || null,
      project: t.project || null,
      start_date: t.start_date || null,
      task_date: t.task_date || null,
      done_date: dayOf(t.done_at),
      deleted_date: state === 'deleted' ? dayOf(t.deleted_at) : null,
      deleted_by: deleters[t.id] || null, // 这一列上线前删的没有人名
      // 改动流水里落在这个区间的那几条（疑点按全部流水判，见 taskFlags）；合成项 multi_day 不单列，它体现在疑点里
      changes: (changeLog[t.id] || []).filter((c) => c.field !== 'multi_day' && inRange(dayOf(c.changed_at), range)).map((c) => ({
        field: c.field, label: CHANGE_LABEL[c.field] || c.field, old: c.old_value, new: c.new_value, by: c.changed_by_name || null, date: dayOf(c.changed_at),
      })),
      audit_state: state,
      est_hours: t.est_hours,
      actual_hours: t.actual_hours,
      is_important: t.is_important,
      important_reason_text: t.important_reason_text,
      fix_id: t.fix_id || null,
      why: t.task_why || null,
      done_when: t.task_done_when || null,
      result: t.result || null,
      task_actions: t.task_actions || null,
      evidence: parseEvidence(t.evidence),
      evidence_images: t.evidence_images.map((im) => ({ id: im.id, name: im.name })),
      links: t.links,
      checkin_days: checkinDays,
      effect: effectDigest(effect),
      flags: taskFlags(t, { state, important: t.is_important, images: t.evidence_images.length, links: t.links, checkins: checkinDays, effect, changes: changeLog[t.id] || [] }),
    };
  });
}

/* ---------- 同步数据：区间 vs 上一等长区间 ---------- */
function trend(source, fetch, range) {
  const prev = previousRange(range);
  const cur = fetch(range); const before = fetch(prev);
  // n = 命中的行数，0 = 这段时间没同步，下面的数都不该被读成 0；days = 其中有数据的天数
  if (!cur.n) return { status: 'NOT_SYNCED', days_with_data: 0, range, previous_range: prev };
  const c = compare(source, before.n ? before : null, cur);
  return { status: 'OK', days_with_data: cur.days, range, previous_range: prev, current: c.after, previous: c.before, delta: c.delta };
}

const CONFIRMATION_LABEL = { confirmed: '已确认', proposed: '待确认', legacy: '历史未审' };

/* ---------- 询盘（部门口径） ---------- */
function buildInquiries(range) {
  const rows = inqRepo.list(range);
  const checks = new Map(buildSourceChecks(rows).items.map((i) => [i.id, i.verdict]));
  const items = rows.map((r) => {
    const verdict = checks.get(r.id) || null;
    return {
      id: r.id, date: r.date, country: r.country, region: r.region, channel: r.channel, product: r.product,
      grade: r.grade, original_grade: r.original_grade, deal_status: r.deal_status, company: r.company,
      customer_code: r.customer_code, salesperson: r.salesperson,
      source: r.source, src_campaign: r.src_campaign || null, src_landing_page: r.src_landing_page || null,
      src_evidence: r.src_evidence || null,
      // 从哪个网站来的（表单带回的按域名认；手工录入的可能没标）
      site: r.site_name || null,
      source_verdict: verdict, source_verdict_label: verdict ? VERDICTS[verdict].label : null,
      // 渠道 / 等级有没有经过经理或老板确认；被改过几次
      confirmation: r.attribution_status || 'legacy',
      confirmation_label: CONFIRMATION_LABEL[r.attribution_status] || CONFIRMATION_LABEL.legacy,
      attr_change_count: r.attr_change_count || 0,
      followups: (r.feedbacks || []).length, note: r.note || null,
    };
  });
  const count = (fn) => { const m = {}; for (const i of items) { const k = fn(i) || '未填'; m[k] = (m[k] || 0) + 1; } return m; };
  const g = count((i) => i.grade);
  const effective = (g.A || 0) + (g.B || 0);
  return {
    total: items.length,
    by_grade: { A: g.A || 0, B: g.B || 0, C: g.C || 0 },
    effective,
    // C 级占比：「收到很多询价但都是垃圾」这句话对应的那个数
    junk_ratio: items.length ? Math.round(((g.C || 0) / items.length) * 10000) / 10000 : null,
    by_channel: count((i) => i.channel),
    by_product: count((i) => i.product),
    // 按站点：没标的单列「未标注」，不按公司去猜。老询盘都没标，所以这一行在刚上线时大多是未标注
    by_site: (() => { const m = {}; for (const i of items) { const k = i.site || '未标注'; m[k] = (m[k] || 0) + 1; } return m; })(),
    by_source_verdict: count((i) => i.source_verdict_label),
    with_form_evidence: items.filter((i) => i.src_evidence === 'form').length,
    // 等级是人评的。这些 A / B 里有多少是经理或老板确认过的，决定了上面这些数能信到什么程度
    confirmation: inqRepo.attributionCoverage(range),
    deals: items.filter((i) => i.deal_status === '已成交').length,
    // 上面的 deals 是「本期录入的询盘里有几条已成交」；这里是「本期被标为成交的」—— 询盘可能是几个月前来的
    deals_marked: inqRepo.dealsMarkedBetween(range).map((d) => ({
      id: d.id, inquiry_date: d.date, country: d.country, channel: d.channel, product: d.product, grade: d.grade,
      source: d.source, src_campaign: d.src_campaign || null, marked_date: d.marked_date, marked_by: d.marked_by_name || null,
    })),
    // 本期被归档的询盘：已经不在上面任何一个数里了
    archived_items: inqRepo.listArchivedBetween(range).map((r) => ({
      id: r.id, date: r.date, country: r.country, channel: r.channel, product: r.product, grade: r.grade, deal_status: r.deal_status,
      confirmation_label: CONFIRMATION_LABEL[r.attribution_status] || CONFIRMATION_LABEL.legacy,
      archived_date: dayOf(r.archived_at), archived_by: r.archived_by_name || null,
    })),
    items,
  };
}

/* ---------- 表单线索（部门口径；不带联系人与留言） ---------- */
function buildLeads(range) {
  const rows = leadsRepo.listBetween(range.start_date, range.end_date);
  const sites = listProjects();
  const items = rows.map((l) => ({
    id: l.id, received_date: dayOf(l.received_at), state: l.state, ignore_reason: l.ignore_reason || null,
    site: leadSite(l, sites)?.name || null,
    suggested_channel: l.suggested_channel, keyword: l.keyword || l.utm_term || null,
    campaign: l.campaign_id || l.utm_campaign || null, landing_page: l.landing_page || l.page_url || null,
    referrer: l.referrer || null, inquiry_id: l.inquiry_id || null,
  }));
  const n = (s) => items.filter((i) => i.state === s).length;
  return { total: items.length, new: n('new'), converted: n('converted'), ignored: n('ignored'), items };
}

/* ---------- 花费（部门口径） ---------- */
function buildSpend(range) {
  const backlinks = backlinksRepo.list(range);
  const expenses = expensesRepo.list(range);
  return {
    ...summarizeSpend({ ads: resolveSemSpend(range), backlinks, expenses }),
    backlink_stats: backlinkStats(backlinks),
    backlink_items: backlinks.map((b) => ({
      id: b.id, acquired_date: b.acquired_date, source_url: b.source_url, source_domain: b.source_domain, target_url: b.target_url,
      anchor: b.anchor, method: b.method, rel: b.rel, cost: b.cost, currency: b.currency, vendor: b.vendor, dr: b.dr, traffic: b.traffic,
      status: b.status, checked_date: b.checked_date, auto_status: b.auto_status, auto_detail: b.auto_detail, quality_note: b.quality_note, owner: b.owner, task_id: b.task_id, task_content: b.task_content,
    })),
    expense_items: expenses.map((e) => ({
      id: e.id, spend_date: e.spend_date, category: e.category, amount: e.amount, currency: e.currency, vendor: e.vendor,
      purpose: e.purpose, owner: e.owner, task_id: e.task_id, task_content: e.task_content, evidence: e.evidence, note: e.note,
    })),
    // 本期被删掉的花费记录：已经不在上面的合计里了，单独列出来给人问一句「为什么删」
    deleted_items: [
      ...backlinksRepo.listDeletedPaid(range).map((b) => ({
        kind: 'backlink', id: b.id, date: b.acquired_date, what: b.source_domain || b.source_url,
        amount: b.cost, currency: b.currency, vendor: b.vendor, owner: b.owner, deleted_date: dayOf(b.deleted_at), deleted_by: b.deleted_by_name || null,
      })),
      ...expensesRepo.listDeleted(range).map((e) => ({
        kind: 'expense', id: e.id, date: e.spend_date, what: e.category + (e.purpose ? ' · ' + e.purpose : ''),
        amount: e.amount, currency: e.currency, vendor: e.vendor, owner: e.owner, deleted_date: dayOf(e.deleted_at), deleted_by: e.deleted_by_name || null,
      })),
    ],
  };
}

/* ---------- KPI：月度考核口径，取「本月至今」 ----------
   月度目标拿一周的实际去比没有意义（一周的 A 级数量永远远低于月目标），所以这里固定看区间结束日所在月份的月初到结束日。 */
// 考核状态码 → 给人看的话（页面和导出都用这一份）
const KPI_STATUS_LABEL = { GRADED: '已出分', CONFIG_INCOMPLETE: '考核目标未设全', INSUFFICIENT_COVERAGE: '有效指标覆盖不足', NO_VALID_DATA: '没有可计分的数据' };
const KPI_METRIC_LABEL = { VALID: '计分', NO_TARGET: '目标待定', MISSING_DATA: '缺数据', NOT_APPLICABLE: '不适用', NO_BASELINE: '本期无此类事项' };

function buildKpi(range, who) {
  const mtd = { start_date: range.end_date.slice(0, 8) + '01', end_date: range.end_date };
  const scope = who === '李' ? 'seo' : (who === '陈' ? 'sem' : 'department');
  const r = buildReview(mtd, scope);
  return {
    range: mtd, scope, scope_label: r.scope_label, status: r.status, status_label: KPI_STATUS_LABEL[r.status] || r.status, gradable: r.gradable,
    score: r.score, provisional_score: r.provisionalScore, coverage: r.coverage,
    band: r.band ? r.band.label : null,
    metrics: r.metrics.map((m) => ({ key: m.key, label: m.label, weight: m.weight, actual: m.actual, target: m.target, unit: m.unit, status: m.status, status_label: KPI_METRIC_LABEL[m.status] || m.status, score: m.score, note: m.note })),
  };
}

function buildWeeklyReports(range, dept) {
  // week_key 是那一周的周一；区间与那一周有重叠就算
  return weeklyRepo.list()
    .filter((w) => w.week_key <= range.end_date && addDays(w.week_key, 6) >= range.start_date && (!dept || w.dept === dept))
    .map((w) => ({ week_key: w.week_key, dept: w.dept, summary: w.summary, problems: w.problems, analysis: w.analysis, next_plan: w.next_plan }));
}

function buildFixes(range, who) {
  const plans = new Map(loopRepo.planStatusByFix().map((r) => [r.fix_id, r]));
  return fixesRepo.list({ view: 'all' })
    .filter((f) => f.state !== 'deleted' && (inRange(f.due_date, range) || inRange(dayOf(f.created_at), range)))
    .filter((f) => !who || f.owner === who || (!f.owner && deptOfPerson(who) === f.dept))
    .map((f) => {
      const p = plans.get(f.id);
      return {
        id: f.id, title: f.title, dept: f.dept, owner: f.owner, status: f.status, due_date: f.due_date, source: f.source,
        evidence: f.evidence, detail: f.detail, created_date: dayOf(f.created_at), archived: f.state === 'archived',
        planned: !!p, planned_done: p ? !!p.done : false,
      };
    });
}

function buildTests(range, dept) {
  // 区间内新登记的，加上还开着的（没归档、还没写结论的测试是「正在跑」的，每周都该被看到）
  return loopRepo.list('test', { view: 'all' })
    .filter((t) => t.state !== 'deleted' && (!dept || t.dept === dept))
    .map((t) => ({ row: t, created: dayOf(t.created_at) }))
    .filter(({ row, created }) => inRange(created, range) || (row.state !== 'archived' && !String(row.conclusion || '').trim()))
    .map(({ row, created }) => ({
      id: row.id, content: row.content, dept: row.dept, owner: row.owner, hypothesis: row.hypothesis, variable: row.variable,
      period: row.period, conclusion: row.conclusion, created_date: created, created_in_range: inRange(created, range),
    }));
}

export function buildAuditPackage({ range, person = 'all', today = null }) {
  const who = PEOPLE.includes(person) ? person : null;
  const dept = who ? deptOfPerson(who) : null;
  const scope = projectScope();
  // 登记了两个以上站点时，自然搜索按站点分列（每个站一行本期对上期）。seo 那一项仍是默认站点的，给只认它的老读者
  const sites = listProjects();
  const seoSites = sites.length >= 2 && (!who || who === '李')
    ? sites.filter((s) => s.gsc_site_url).map((s) => ({ site: s.name, is_default: s.is_default, ...trend('gsc', (r) => effectRepo.gscSite(r, readScope(s)), range) }))
    : [];

  const tasks = buildTasks(range, who, today);
  const sop = sopStats(range.start_date, range.end_date, today);
  const sopItems = sop.items.filter((s) => !dept || s.dept === dept);

  return {
    meta: {
      generated_at: new Date().toISOString(),
      range,
      person: who || 'all',
      today,
      effect_days: AUDIT_EFFECT_DAYS,
      flags: FLAGS,
      // 读这份数据之前必须知道的口径。导出给人、交给 AI 时这几句都跟着走。
      notes: [
        '任务按「北京时间的完成日」归入区间；标了完成却没有完成时刻的老任务不计入任何一周。',
        '前后数据对比取完成日前后各 ' + AUDIT_EFFECT_DAYS + ' 天（数据不满时两边等量缩短）。它只说明「之后变了」，不能证明「因此变了」。',
        '询盘、线索、花费、KPI 是部门口径，不按人拆：询盘渠道多数是人工填的，按它拆等于用手填字段决定谁的功劳。',
        '疑点只陈述事实（没填、超时、没证据），不是结论；用时超出预估可能只是估少了。',
        'KPI 是月度考核口径，这里显示的是区间结束日所在月份的「本月至今」。',
        ...(seoSites.length ? ['登记了多个站点：自然搜索按站点分列（seo_sites）；广告是整个账户的、询盘和考核是部门口径，不按站点拆。询盘上的站点只有表单带回的是机器认的，手工录入的可能没标。'] : []),
      ],
    },
    summary: {
      all: summarizeTasks(tasks),
      people: (who ? [who] : PEOPLE).map((p) => ({ person: p, dept: deptOfPerson(p), ...summarizeTasks(tasks.filter((t) => t.person === p)) })),
    },
    tasks,
    sop: { counted_to: sop.counted_to, items: sopItems.map((s) => ({ id: s.id, title: s.title, dept: s.dept, freq: s.freq, expected: s.expected, done: s.done, missed_days: s.missed_days })) },
    seo: !who || who === '李' ? { site: scope.id != null ? scope.name : null, ...trend('gsc', (r) => effectRepo.gscSite(r, scope), range) } : null,
    seo_sites: seoSites,
    sem: !who || who === '陈' ? trend('ads', (r) => effectRepo.adsAccount(r, scope), range) : null,
    geo: !who || who === '李' ? buildGeoSummary(range) : null,
    inquiries: buildInquiries(range),
    leads: buildLeads(range),
    tests: buildTests(range, dept),
    fixes: buildFixes(range, who),
    spend: buildSpend(range),
    kpi: buildKpi(range, who),
    weekly_reports: buildWeeklyReports(range, dept),
  };
}
