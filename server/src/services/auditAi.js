// 周度 AI 审核：把审核包交给 AI，让它按人写审核意见（纯函数：组装提示词、解析回答；调用在路由里）。
//
// 经理 2026-10-10：「现在的 AI 分析只针对网站可能出现的问题，无法去审核每个人的工作以及工作质量。」
// 这里的 AI 不是自己去找数据，而是只读审核包 —— 包里每条任务的疑点、前后数据对比、来源对账都已经是
// 确定性算好的事实。AI 的活是把它们串成人能读的审核意见，并指出该当面追问的问题。
//
// 三条约束写进提示词，也在这里尽量兜住：
//   1. 只能依据给它的数据；数据里没有的写「数据不足」，不许推测。
//   2. 每条结论都要带出处（任务编号 / 询盘编号），人能点回去核对。
//   3. 回答必须是约定的 JSON 结构（项目规则：AI 建议必须结构化，不能只是漂亮文字）。
//      解析不出来就原文显示并标注「未按结构返回」，不假装它是结构化的。

const MAX_TASKS = 60;
const MAX_INQUIRIES = 80;
const clip = (s, n) => (s == null ? null : String(s).length > n ? String(s).slice(0, n) + '…' : String(s));

/* 交给 AI 的精简包。两件事：控制体积；不带客户编码、业务员、联系人这类它用不上的信息（最小必要）。 */
export function auditAiPayload(pkg) {
  return {
    range: pkg.meta.range,
    person: pkg.meta.person,
    notes: pkg.meta.notes,
    flag_meanings: Object.fromEntries(Object.entries(pkg.meta.flags).map(([k, v]) => [k, v.label])),
    summary: pkg.summary,
    tasks_total: pkg.tasks.length,
    tasks: pkg.tasks.slice(0, MAX_TASKS).map((t) => ({
      id: t.id, person: t.person, dept: t.dept, project: t.project, content: clip(t.content, 160), state: t.audit_state,
      start: t.start_date, due: t.task_date, done: t.done_date, deleted: t.deleted_date, est_hours: t.est_hours, actual_hours: t.actual_hours,
      important: t.is_important ? t.important_reason_text : null,
      why: clip(t.why, 160), done_when: clip(t.done_when, 160), result: clip(t.result, 400), actions: clip(t.task_actions, 300),
      evidence_links: t.evidence.length, evidence_images: t.evidence_images.length,
      links: t.links.map((l) => l.type + ':' + (l.label || l.ref)),
      checkin_days: t.checkin_days,
      effect: t.effect.map((e) => ({
        object: e.type + ':' + (e.label || e.ref), source: e.source, status: e.status, days: e.days,
        metrics: e.metrics.map((m) => ({ metric: m.label, before: m.before, after: m.after, change_pct: m.delta && m.delta.pct != null ? Math.round(m.delta.pct * 100) : null })),
      })),
      flags: t.flags,
    })),
    sop: pkg.sop.items.map((s) => ({ title: clip(s.title, 80), dept: s.dept, freq: s.freq, expected: s.expected, done: s.done, missed: (s.missed_days || []).length })),
    seo: pkg.seo, sem: pkg.sem,
    geo: pkg.geo && { status: pkg.geo.status, totals: pkg.geo.totals, engines: (pkg.geo.engines || []).map((e) => ({ engine: e.label, sessions: e.sessions, prev: e.prevSessions })), inquiries: pkg.geo.inquiries, citations: pkg.geo.citations && pkg.geo.citations.totals },
    inquiries: {
      total: pkg.inquiries.total, by_grade: pkg.inquiries.by_grade, junk_ratio: pkg.inquiries.junk_ratio, by_channel: pkg.inquiries.by_channel,
      by_product: pkg.inquiries.by_product, by_source_verdict: pkg.inquiries.by_source_verdict, with_form_evidence: pkg.inquiries.with_form_evidence, deals: pkg.inquiries.deals, confirmation: pkg.inquiries.confirmation,
      items: pkg.inquiries.items.slice(0, MAX_INQUIRIES).map((i) => ({
        id: i.id, date: i.date, country: i.country, channel: i.channel, product: i.product, grade: i.grade, deal: i.deal_status,
        source: clip(i.source, 80), campaign: i.src_campaign, landing_page: i.src_landing_page, evidence: i.src_evidence, verdict: i.source_verdict_label, confirmed: i.confirmation_label, changes: i.attr_change_count,
      })),
    },
    leads: { total: pkg.leads.total, converted: pkg.leads.converted, ignored: pkg.leads.ignored, ignored_items: pkg.leads.items.filter((l) => l.state === 'ignored').slice(0, 40).map((l) => ({ reason: clip(l.ignore_reason, 80), keyword: l.keyword, campaign: l.campaign, landing_page: l.landing_page })) },
    fixes: pkg.fixes.map((f) => ({ id: f.id, title: clip(f.title, 100), owner: f.owner, status: f.status, due: f.due_date, planned: f.planned, planned_done: f.planned_done })),
    tests: pkg.tests.map((t) => ({ id: t.id, content: clip(t.content, 100), dept: t.dept, hypothesis: clip(t.hypothesis, 120), conclusion: clip(t.conclusion, 160) })),
    spend: { groups: pkg.spend.groups.map((g) => ({ label: g.label, amounts: g.amounts, count: g.count, source: g.source })), totals: pkg.spend.totals, backlinks: pkg.spend.backlink_stats, deleted_this_period: pkg.spend.deleted_items.map((d) => ({ kind: d.kind, what: clip(d.what, 80), amount: d.amount, currency: d.currency, deleted: d.deleted_date })) },
    kpi: pkg.kpi,
    weekly_reports: pkg.weekly_reports,
  };
}

export const AUDIT_AI_SYSTEM = [
  '你是 FERR 运营部的周度审核助手，替经理审核 SEO（李）和 SEM（陈）这段时间的工作与工作质量。',
  '你只能依据用户消息里的 JSON 数据下结论。数据里没有的就写「数据不足」，绝不推测、绝不补数字。',
  '每一条结论都必须带出处：任务写 task_id，询盘写 inquiry_id。没有出处的话不要写。',
  '数据里的 flags 是系统按规则算出的事实（含义见 flag_meanings），你可以引用，但不要把它升级成对人的定性：',
  '「实际用时超出预估」可能只是估少了，要写成需要追问的问题，而不是结论。',
  '前后数据对比（effect）只说明「之后变了」，不能证明「因此变了」；status 不是 OK 的对比不能当证据。',
  '判断「产生了可验证的数据变化」时，必须是 status=OK 的对比，并对照 seo / sem 里的全站、全账户同期变化：',
  '全站都涨的时候，单个页面跟着涨不算这条任务的功劳。',
  '询盘、线索、花费、KPI 是部门口径，不要把它们归到某个人头上。',
  '只输出一个 JSON 对象，不要任何解释文字，不要 Markdown 代码块。',
].join('\n');

const SCHEMA = `{
  "overview": "三句话以内：这段时间整体做成了什么、最大的问题是什么",
  "people": [{
    "person": "李 或 陈",
    "did": [{"task_id": 1, "what": "做了什么（一句话）"}],
    "verified_changes": [{"task_id": 1, "evidence": "哪个指标从多少到多少，全站同期如何", "confidence": "高|中|低"}],
    "unverified": [{"task_id": 1, "why": "为什么还不能算数（没关联对象 / 数据未满 / 没证据…）"}],
    "time": "工时是否合理的总体判断，引用具体 task_id",
    "quality": "工作质量的总体判断，引用具体 task_id",
    "questions": ["需要当面问他的具体问题，带 task_id"]
  }],
  "inquiries": {"finding": "询盘质量与来源的判断，引用 inquiry_id", "junk_causes": ["垃圾询盘可能的来源（系列 / 关键词 / 落地页），仅当数据支持"], "actions": ["建议动作"]},
  "spend": {"finding": "钱花在哪、哪笔值得追问", "actions": ["建议动作"]},
  "next_week": [{"action": "具体动作", "owner": "李|陈|部门", "metric": "用哪个数验证", "based_on": "task_id / inquiry_id / 数据项"}],
  "data_gaps": ["这次审核因为缺什么数据而下不了结论的地方"]
}`;

export function auditAiPrompt(pkg) {
  const truncated = [];
  if (pkg.tasks.length > MAX_TASKS) truncated.push(`任务共 ${pkg.tasks.length} 条，只给了前 ${MAX_TASKS} 条`);
  if (pkg.inquiries.items.length > MAX_INQUIRIES) truncated.push(`询盘共 ${pkg.inquiries.items.length} 条，只给了前 ${MAX_INQUIRIES} 条明细（汇总数是全量的）`);
  return [
    '下面是 ' + pkg.meta.range.start_date + ' ~ ' + pkg.meta.range.end_date + ' 的审核数据（人员：' + (pkg.meta.person === 'all' ? '李和陈' : pkg.meta.person) + '）。',
    truncated.length ? '注意：' + truncated.join('；') + '。' : '',
    '请严格按下面的结构输出一个 JSON 对象；每个数组最多 6 项，字符串尽量短：',
    SCHEMA,
    '数据：',
    JSON.stringify(auditAiPayload(pkg)),
  ].filter(Boolean).join('\n');
}

/* 把 AI 的回答解析成结构。AI 偶尔会包一层 ```json 代码块或在前后加一句话，尽量剥掉；
   真解析不出来返回 null，由界面原文显示并标注「未按结构返回」。 */
export function parseAuditAi(text) {
  const raw = String(text || '').trim();
  const candidates = [raw, raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')];
  const a = raw.indexOf('{'); const b = raw.lastIndexOf('}');
  if (a >= 0 && b > a) candidates.push(raw.slice(a, b + 1));
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      if (obj && typeof obj === 'object' && !Array.isArray(obj) && (Array.isArray(obj.people) || typeof obj.overview === 'string')) return obj;
    } catch (e) { /* 试下一个 */ }
  }
  return null;
}

// 同一个区间 + 人员的审核意见只留一份当前的（重跑时旧的进历史）
export const auditScopeKey = (range, person) => `weekly_audit:${range.start_date}:${range.end_date}:${person || 'all'}`;
