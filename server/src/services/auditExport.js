// 周度审核包 → 一组二维表（纯函数）。XLSX 把它们各放一个工作表，CSV 一次导其中一张，JSON 直接给整个包。
// 列的顺序和中文表头在这里定一次；页面上看到的、导出来的、经理拿去和别处对比的，是同一批字段。
import { FLAGS } from './auditRules.js';

const STATE_LABEL = { completed: '已完成', in_progress: '进行中', overdue: '逾期未完成', abandoned: '未完成即归档', deleted: '已删除' };
const LINK_LABEL = { page: '页面', campaign: '系列', keyword: '关键词', kpi: 'KPI' };
const EFFECT_STATUS = { OK: '完整', PARTIAL: '数据未满', PENDING: '待数据', NOT_SYNCED: '未同步', NO_DATA: '无数据' };
const EVIDENCE_LABEL = { form: '表单（机器证据）', manual: '人填' };
const LEAD_STATE = { new: '待处理', converted: '已转询盘', ignored: '已忽略' };
const FREQ_LABEL = { daily: '每日', weekly: '每周', monthly: '每月' };
const CURRENCY_LABEL = { ADS_ACCOUNT: 'Ads 账户币种' };

const cols = (pairs) => pairs.map(([key, label]) => ({ key, label }));
const yes = (v) => (v ? '是' : '否');
const pct = (d) => (d && d.pct != null ? Math.round(d.pct * 1000) / 10 : null);
const lines = (arr) => (arr || []).join('\n');
const amounts = (a) => Object.entries(a || {}).map(([c, v]) => (CURRENCY_LABEL[c] || c) + ' ' + v).join(' ｜ ');
// 「完成状态：0 → 1」对人没有意义，翻成话
const DONE_TEXT = { 0: '未完成', 1: '已完成' };
const changeValue = (c, v) => (v == null ? '（空）' : c.field === 'done' ? DONE_TEXT[v] || v : c.field === 'important' ? '已标重要' : v);
export const changeText = (c) => `${c.label}：${changeValue(c, c.old)} → ${changeValue(c, c.new)}（${c.by || '未记录'} ${c.date}）`;
const flagText = (flags) => (flags || []).map((f) => FLAGS[f]?.label || f).join('；');

// 一条任务的数据变化压成一格文字（详细的逐指标行在「数据变化」那张表）
function effectText(effect) {
  return (effect || []).map((e) => {
    const head = (LINK_LABEL[e.type] || e.type) + ' ' + (e.label || e.ref) + '［' + (EFFECT_STATUS[e.status] || e.status) + (e.days ? ' ' + e.days + '天' : '') + '］';
    const body = e.metrics.filter((m) => m.delta).map((m) => m.label + ' ' + m.before + '→' + m.after).join('，');
    return body ? head + ' ' + body : head;
  }).join('\n');
}

function summaryRow(name, s) {
  return {
    name, completed: s.completed, in_progress: s.in_progress, overdue: s.overdue, abandoned: s.abandoned, deleted: s.deleted,
    with_result: s.with_result, with_evidence: s.with_evidence, with_links: s.with_links, with_effect_data: s.with_effect_data,
    est_hours: s.est_hours, actual_hours: s.actual_hours, hours_known: s.hours_known, flagged: s.flagged,
  };
}

function trendRows(name, t, metricLabels) {
  if (!t) return [];
  if (t.status !== 'OK') return [{ source: name, metric: '（这段时间没有同步数据）' }];
  return Object.keys(t.current).map((k) => ({
    source: name, metric: metricLabels[k] || k, current: t.current[k], previous: t.previous ? t.previous[k] : null,
    change: t.delta[k] ? t.delta[k].abs : null, change_pct: pct(t.delta[k]), days: t.days_with_data,
  }));
}

/* 返回 [{ key, name, columns, rows }]。key 用于 CSV 的 ?section=，name 是工作表名。 */
export function auditSheets(pkg) {
  const sheets = [];
  const add = (key, name, columns, rows) => sheets.push({ key, name, columns: cols(columns), rows });

  add('summary', '概要', [
    ['name', '人员'], ['completed', '已完成'], ['in_progress', '进行中'], ['overdue', '逾期未完成'], ['abandoned', '未完成即归档'], ['deleted', '区间内被删除'],
    ['with_result', '有完成结果'], ['with_evidence', '有证据'], ['with_links', '有可量化关联'], ['with_effect_data', '有完整前后数据'],
    ['est_hours', '预估工时合计'], ['actual_hours', '实际工时合计'], ['hours_known', '工时两项都填了的条数'], ['flagged', '有严重疑点的条数'],
  ], [summaryRow('全部', pkg.summary.all), ...pkg.summary.people.map((p) => summaryRow(p.person + '（' + p.dept + '）', p))]);

  add('tasks', '任务', [
    ['id', '编号'], ['person', '归属'], ['owner', '负责人'], ['dept', '部门'], ['project', '产品/项目'], ['content', '任务'], ['state', '状态'],
    ['start_date', '开始日'], ['task_date', '截止日'], ['done_date', '完成日'], ['deleted_date', '删除日'], ['deleted_by', '删除人'], ['est_hours', '预估工时'], ['actual_hours', '实际工时'],
    ['important', '重要任务'], ['important_reason', '重要原因'], ['why', '目的'], ['done_when', '完成标准'], ['result', '完成结果'], ['task_actions', '具体动作'],
    ['evidence', '证据链接'], ['images', '证据截图数'], ['links', '关联对象'], ['checkin_days', '区间内推进天数'], ['effect', '数据变化'], ['changes', '区间内的改动'], ['flags', '疑点'],
  ], pkg.tasks.map((t) => ({
    ...t, state: STATE_LABEL[t.audit_state] || t.audit_state, important: yes(t.is_important), important_reason: t.important_reason_text,
    evidence: lines(t.evidence), images: t.evidence_images.length,
    links: t.links.map((l) => (LINK_LABEL[l.type] || l.type) + ':' + (l.label || l.ref)).join('\n'),
    effect: effectText(t.effect), flags: flagText(t.flags), changes: t.changes.map(changeText).join('\n'),
  })));

  const effectRows = [];
  for (const t of pkg.tasks) {
    for (const e of t.effect || []) {
      const head = { task_id: t.id, task: t.content, person: t.person, type: LINK_LABEL[e.type] || e.type, ref: e.label || e.ref, source: { ads: '广告', ga4: '落地页（GA4）' }[e.source] || '自然搜索', status: EFFECT_STATUS[e.status] || e.status, days: e.days };
      if (!e.metrics.length) effectRows.push(head);
      for (const m of e.metrics) effectRows.push({ ...head, metric: m.label, before: m.before, after: m.after, change: m.delta ? m.delta.abs : null, change_pct: pct(m.delta) });
    }
  }
  add('effects', '数据变化', [
    ['task_id', '任务编号'], ['task', '任务'], ['person', '归属'], ['type', '对象类型'], ['ref', '对象'], ['source', '数据源'], ['status', '数据状态'], ['days', '前后各几天'],
    ['metric', '指标'], ['before', '之前'], ['after', '之后'], ['change', '变化'], ['change_pct', '变化%'],
  ], effectRows);

  add('trend', '数据概览', [
    ['source', '数据源'], ['metric', '指标'], ['current', '本期'], ['previous', '上期'], ['change', '变化'], ['change_pct', '变化%'], ['days', '本期有数据的天数'],
  ], [
    ...trendRows('自然搜索（GSC）', pkg.seo, { clicks: '点击', impressions: '曝光', position: '平均排名' }),
    ...trendRows('广告（Ads，账户币种）', pkg.sem, { cost: '花费', clicks: '点击', conversions: '转化', cpa: '每转化成本' }),
  ]);

  const geo = pkg.geo;
  add('geo', 'GEO', [
    ['engine', 'AI 引擎'], ['sessions', '带来的访问'], ['prev_sessions', '上期'], ['key_events', '关键事件'], ['sources', 'GA4 来源值'],
    ['checked', '抽查已查'], ['mentioned', '抽查提到我们'], ['cited', '抽查引用我们'],
  ], !geo ? [] : (() => {
    const cite = new Map(((geo.citations && geo.citations.engines) || []).map((e) => [e.label, e]));
    const seen = new Set();
    const rows = (geo.engines || []).map((e) => {
      seen.add(e.label); const c = cite.get(e.label);
      return { engine: e.label, sessions: e.sessions, prev_sessions: e.prevSessions, key_events: e.keyEvents, sources: e.sources.join('、'), checked: c ? c.checked : null, mentioned: c ? c.mentioned : null, cited: c ? c.cited : null };
    });
    for (const [label, c] of cite) if (!seen.has(label)) rows.push({ engine: label, checked: c.checked, mentioned: c.mentioned, cited: c.cited });
    if (geo.status !== 'OK') rows.unshift({ engine: '（这段时间 GA4 没有同步数据，访问数为空不代表 0）' });
    return rows;
  })());

  add('inquiries', '询盘', [
    ['id', '编号'], ['date', '日期'], ['country', '国家'], ['region', '大区'], ['channel', '渠道'], ['product', '产品'], ['grade', '等级'], ['original_grade', '原始等级'],
    ['deal_status', '是否成交'], ['company', '公司'], ['customer_code', '客户编码'], ['salesperson', '业务员'], ['source', '来源词'], ['src_campaign', '广告系列'],
    ['src_landing_page', '落地页'], ['evidence', '来源证据'], ['source_verdict_label', '对账结论'], ['confirmation_label', '渠道等级确认'], ['attr_change_count', '渠道等级被改次数'], ['followups', '跟进次数'], ['note', '备注'],
  ], pkg.inquiries.items.map((i) => ({ ...i, evidence: EVIDENCE_LABEL[i.src_evidence] || '无' })));

  add('leads', '表单线索', [
    ['id', '编号'], ['received_date', '收到日期'], ['state', '状态'], ['ignore_reason', '忽略原因'], ['suggested_channel', '建议渠道'], ['keyword', '关键词'],
    ['campaign', '系列'], ['landing_page', '落地页'], ['referrer', '来路'], ['inquiry_id', '转成的询盘编号'],
  ], pkg.leads.items.map((l) => ({ ...l, state: LEAD_STATE[l.state] || l.state })));

  add('fixes', '整改', [
    ['id', '编号'], ['title', '问题'], ['dept', '部门'], ['owner', '负责人'], ['status', '结果'], ['due_date', '截止日'], ['created_date', '登记日'], ['source', '来源'],
    ['evidence', '依据'], ['detail', '动作'], ['planned', '已排入日计划'], ['planned_done', '任务已完成'], ['archived', '已归档'],
  ], pkg.fixes.map((f) => ({ ...f, planned: yes(f.planned), planned_done: yes(f.planned_done), archived: yes(f.archived) })));

  add('tests', '测试', [
    ['id', '编号'], ['content', '测试'], ['dept', '部门'], ['owner', '负责人'], ['hypothesis', '假设'], ['variable', '变量'], ['period', '起止'], ['conclusion', '结论'],
    ['created_date', '登记日'], ['created_in_range', '本期新登记'],
  ], pkg.tests.map((t) => ({ ...t, created_in_range: yes(t.created_in_range) })));

  add('sop', 'SOP', [
    ['title', 'SOP'], ['dept', '部门'], ['freq', '频率'], ['expected', '应做次数'], ['done', '已做次数'], ['missed', '漏了哪几天'],
  ], pkg.sop.items.map((s) => ({ ...s, freq: FREQ_LABEL[s.freq] || s.freq, missed: (s.missed_days || []).join('、') })));

  add('spend', '花费汇总', [['label', '去向'], ['amounts', '金额（不同币种不相加）'], ['count', '笔数'], ['source', '数据来源']], [
    ...pkg.spend.groups.map((g) => ({ label: g.label, amounts: amounts(g.amounts) || (g.key === 'ads' ? '没有数据' : '本期没有'), count: g.count, source: g.source })),
    { label: '合计', amounts: amounts(pkg.spend.totals) || '没有任何支出记录' },
  ]);
  add('backlinks', '外链', [
    ['id', '编号'], ['acquired_date', '日期'], ['source_url', '外链所在页面'], ['source_domain', '来源站'], ['target_url', '指向页面'], ['anchor', '锚文本'], ['method', '方式'],
    ['rel', '属性'], ['cost', '费用'], ['currency', '币种'], ['vendor', '卖家'], ['dr', 'DR'], ['traffic', '月流量'], ['status', '状态'], ['checked_date', '最近核查'], ['auto', '自动核查'], ['auto_detail', '自动核查说明'],
    ['quality_note', '质量判断'], ['owner', '负责人'], ['task_id', '任务编号'], ['task_content', '任务'],
  ], pkg.spend.backlink_items.map((b) => ({ ...b, auto: { found: '找到链接', not_found: '没找到链接', unreachable: '页面没取到' }[b.auto_status] || '' })));
  add('expenses', '其它支出', [
    ['id', '编号'], ['spend_date', '日期'], ['category', '类别'], ['amount', '金额'], ['currency', '币种'], ['vendor', '付给谁'], ['purpose', '用途'], ['owner', '负责人'],
    ['task_id', '任务编号'], ['task_content', '任务'], ['evidence', '凭证'], ['note', '备注'],
  ], pkg.spend.expense_items);
  add('deals_marked', '本期标为成交', [
    ['id', '询盘编号'], ['inquiry_date', '询盘日期'], ['country', '国家'], ['channel', '渠道'], ['product', '产品'], ['grade', '等级'],
    ['source', '来源词'], ['src_campaign', '系列'], ['marked_date', '标记成交日'], ['marked_by', '标记人'],
  ], pkg.inquiries.deals_marked);
  add('inquiries_archived', '本期归档的询盘', [
    ['id', '询盘编号'], ['date', '询盘日期'], ['country', '国家'], ['channel', '渠道'], ['product', '产品'], ['grade', '等级'],
    ['deal_status', '是否成交'], ['confirmation_label', '归档前的确认状态'], ['archived_date', '归档日'], ['archived_by', '归档人'],
  ], pkg.inquiries.archived_items);
  add('spend_deleted', '已删除的花费记录', [
    ['kind', '台账'], ['id', '编号'], ['date', '花费日期'], ['what', '内容'], ['amount', '金额'], ['currency', '币种'], ['vendor', '付给谁'], ['owner', '负责人'], ['deleted_date', '删除日'], ['deleted_by', '删除人'],
  ], pkg.spend.deleted_items.map((d) => ({ ...d, kind: d.kind === 'backlink' ? '外链' : '其它支出' })));

  add('kpi', 'KPI本月至今', [['label', '指标'], ['weight', '权重'], ['actual', '实际'], ['target', '目标'], ['unit', '单位'], ['status_label', '状态'], ['score', '得分'], ['note', '说明']], [
    ...pkg.kpi.metrics,
    { label: '合计（' + pkg.kpi.scope_label + '，' + pkg.kpi.range.start_date + ' ~ ' + pkg.kpi.range.end_date + '）', score: pkg.kpi.score ?? pkg.kpi.provisional_score, status_label: pkg.kpi.status_label, note: pkg.kpi.gradable ? '' : '参考分，未出正式分' },
  ]);

  add('reports', '周报', [['week_key', '周一'], ['dept', '部门'], ['summary', '本周工作总结'], ['problems', '遇到的问题'], ['analysis', '分析'], ['next_plan', '下周计划']],
    pkg.weekly_reports.map((w) => ({ ...w, summary: lines(w.summary), problems: lines(w.problems), analysis: lines(w.analysis), next_plan: lines(w.next_plan) })));

  add('notes', '口径说明', [['note', '读这份数据之前要知道的口径']], [
    { note: '区间：' + pkg.meta.range.start_date + ' ~ ' + pkg.meta.range.end_date + '；人员：' + (pkg.meta.person === 'all' ? '全部' : pkg.meta.person) + '；生成时间：' + pkg.meta.generated_at },
    ...pkg.meta.notes.map((note) => ({ note })),
  ]);
  return sheets;
}
