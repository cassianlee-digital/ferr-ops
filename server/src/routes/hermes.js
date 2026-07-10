import { editor, requireAuth } from '../auth/middleware.js';
import { config } from '../config.js';
import { buildContext } from '../services/aiContext.js';
import { callAnthropic } from '../services/anthropic.js';
import { attachmentPromptBlock, cleanAiAttachments } from '../services/aiAttachments.js';
import * as marketBrain from '../services/marketBrain.js';
import * as kpiRepo from '../db/repositories/kpi.js';
import * as inqRepo from '../db/repositories/inquiries.js';
import * as seoRepo from '../db/repositories/seoWeeks.js';
import * as semRepo from '../db/repositories/semWeeks.js';
import * as kwRepo from '../db/repositories/keywords.js';
import * as marketResearchRepo from '../db/repositories/marketResearch.js';
import * as hermesMemoryRepo from '../db/repositories/hermesMemories.js';

const ROLE_PERSONAS = {
  seo: {
    label: 'SEO 运营',
    focus: '重点关注自然搜索增长、GSC 点击/展现/CTR/排名、内容资产、关键词机会、页面衰退和收录问题。',
    style: '反馈要偏 SEO 执行视角，优先给内容、页面、关键词和验证指标。',
  },
  sem: {
    label: 'SEM 运营',
    focus: '重点关注广告花费、有效询盘成本、关键词浪费、否词、创意、落地页和预算分配。',
    style: '反馈要偏 SEM 投放视角，优先给暂停、放量、否词、创意测试和验证指标。',
  },
  manager: {
    label: '运营主管',
    focus: '重点关注 SEO/SEM 协同、KPI 达成、资源优先级、整改闭环和周报复盘。',
    style: '反馈要偏管理视角，先讲优先级和风险，再分派到 SEO/SEM。',
  },
  boss: {
    label: '老板',
    focus: '重点关注投入产出、有效询盘、达标风险、关键瓶颈和需要拍板的事项。',
    style: '反馈要少术语，多结论、影响和下一步决策。',
  },
};

const RESPONSE_CONTRACT = [
  '你不是通用聊天机器人，而是 ferr-ops 里的运营助理。回答必须像在后台里和同事一起复盘数据。',
  '先说结论，但每个结论必须带数据证据；没有数据就明确说缺什么，不能编。',
  '默认输出结构：1) 结论 2) 证据 3) 优先级动作 4) 负责人/角色 5) 验证指标 6) 复盘时间。',
  '禁止只给“优化关键词、提升落地页、持续观察”这种泛泛建议；每条动作必须能落到具体词、页面、计划、指标或任务。',
  '如果用户问“当前页/这张表/这个计划/这些关键词”，必须优先使用 pageContext；pageContext 为空时提醒先读取当前页或调用 ferr_page_detail。',
  '数据优先级：当前页 pageContext > ferr-ops 诊断/同步数据 > KPI/周报/关键词库 > 市场记忆。',
];

const SEM_PLAYBOOK = [
  'SEM 判断优先级：先看有效询盘/转化，再看花费、CPC、CPA、CTR、质量分、ROAS。',
  '高花费零转化词：优先建议暂停、降价、收窄匹配或加入否词，并要求 3-7 天复盘。',
  'CPC 高于目标且转化不足：不要只说降 CPC，要指出应检查匹配方式、质量分、落地页相关性和搜索词浪费。',
  'CTR 达标但转化差：优先怀疑落地页、询盘表单、词意图不准或地区/设备流量质量。',
  'CTR 低且质量分低：优先建议重写创意、拆分广告组、提高关键词与落地页一致性。',
  '预算建议必须说明：加预算给什么，减预算从哪里减，预期用哪个指标验证。',
];

const SEO_PLAYBOOK = [
  'SEO 判断优先级：先看点击/展现/CTR/排名变化，再看页面衰退、机会词、关键词蚕食和收录。',
  '排名 11-20 且展现高的词：优先做标题、段落覆盖、内链和落地页强化。',
  '展现高 CTR 低：优先改标题/描述/搜索意图匹配，不要先大改正文。',
  '点击或排名衰退页面：先查是否内容过期、竞争页变强、关键词覆盖变窄、内链减少。',
  '关键词蚕食：要指出冲突页面，并建议主页面、合并/重定向/内链锚文本策略。',
  '内容建议必须绑定词、页面、预期指标和复盘周期。',
];

const HERMES_SKILLS = {
  auto: {
    label: '自动判断',
    instruction: '先判断用户问题属于 SEO、SEM、复盘、任务还是 SOP，再选择对应分析方式。',
  },
  seo_diagnosis: {
    label: 'SEO 诊断',
    instruction: '优先使用 SEO playbook，输出页面、关键词、内容、内链、收录和验证指标。',
  },
  sem_waste: {
    label: 'SEM 浪费排查',
    instruction: '优先使用 SEM playbook，识别高花费低转化、否词、匹配方式、创意和落地页问题。',
  },
  weekly_review: {
    label: '周报复盘',
    instruction: '输出本周结论、证据、已做动作、下周动作、负责人和复盘指标。',
  },
  sop_draft: {
    label: 'SOP 草稿',
    instruction: '把经验沉淀成可复用 SOP：触发条件、检查步骤、判断标准、输出物、复盘频率。',
  },
};

const HERMES_WORKFLOWS = {
  answer: {
    label: '直接回答',
    instruction: '直接回答用户问题，但必须引用 Hermes 上下文证据。',
  },
  diagnose_to_action: {
    label: '诊断到动作',
    instruction: '按“发现问题 → 证据 → 根因判断 → 整改动作 → 验证指标 → 复盘时间”输出。',
  },
  learn_to_memory: {
    label: '学习沉淀',
    instruction: '回答后追加“可沉淀记忆”，写清 Hermes 应记住的事实、判断规则和适用场景。',
  },
};

function assistantPlaybook(operator) {
  const role = operator.role || 'manager';
  const roleRule = {
    boss: '老板视角：少讲过程，多讲投入产出、风险、瓶颈、需要拍板的动作。',
    manager: '主管视角：先排优先级，再拆给 SEO/SEM，强调闭环、负责人和复盘。',
    seo: 'SEO 视角：重点给页面、关键词、内容、内链、收录和验证指标。',
    sem: 'SEM 视角：重点给预算、关键词、否词、创意、落地页、转化成本和验证指标。',
  }[role] || '按当前角色给出可执行建议。';

  return {
    identity: 'FERR SEO/SEM 运营指挥中心内置助手',
    responseContract: RESPONSE_CONTRACT,
    roleRule,
    semPlaybook: SEM_PLAYBOOK,
    seoPlaybook: SEO_PLAYBOOK,
    evidenceRules: [
      '引用数字时说明来源：当前页、KPI、周报、GSC、Ads、询盘或市场记忆。',
      '如果 GSC/GA4/Ads 未接入或为空，必须明说，不能假装有数据。',
      '如果只有全局上下文，没有当前页，要标注“基于全局数据，不是当前页表格”。',
    ],
    actionTemplate: {
      title: '动作标题',
      evidence: '用到的数据证据',
      judgment: '为什么这么判断',
      action: '具体怎么做',
      owner: '老板/主管/SEO/SEM',
      verifyMetric: '复盘时看什么指标',
      reviewWindow: '建议复盘时间',
    },
  };
}

function assistantBrief(operator) {
  const label = operator.persona?.label || operator.role || '运营';
  return [
    '你现在不是通用 GPT，你是 ferr-ops 后台里的 FERR 运营助理。',
    `当前服务对象：${label}。回答要符合这个角色视角。`,
    '回答前先判断用户是在问当前页，还是问全局经营数据。',
    '如果问当前页、这张表、这个计划、这些关键词：必须先看 pageContext；没有 pageContext 就要求先读取当前页。',
    '如果问 SEO/SEM/KPI/经营判断：必须基于 ferr_full_context 的真实数据，不允许凭经验编。',
    '输出必须短而硬：结论、证据、判断、动作、负责人、验证指标、复盘时间。',
    '每条建议都必须能落地成后台任务；不能只说“持续优化、提升质量、关注数据”。',
    '数据不足时要直接说缺什么数据，以及缺数据会影响哪一类判断。',
  ].join('\n');
}

function numericValue(value) {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function kpiDirection(name) {
  const text = String(name || '').toLowerCase();
  if (/cpc|成本|费用|跳出|cost|bounce/.test(text)) return 'lower';
  return 'higher';
}

function makeCard({ area, severity = 'medium', title, evidence, judgment, action, owner, verifyMetric, reviewWindow, source }) {
  return { area, severity, title, evidence, judgment, action, owner, verifyMetric, reviewWindow, source };
}

function buildOpsDiagnosis(operator) {
  const cards = [];
  const missing = [];

  try {
    const rows = kpiRepo.list();
    for (const row of rows) {
      const target = numericValue(row.target);
      const actual = numericValue(row.actual);
      if (target == null || actual == null) continue;
      const direction = kpiDirection(row.name);
      const offTarget = direction === 'lower' ? actual > target : actual < target;
      if (!offTarget) continue;
      const gap = direction === 'lower' ? actual - target : target - actual;
      cards.push(makeCard({
        area: row.grp || 'kpi',
        severity: gap / Math.max(Math.abs(target), 1) >= 0.3 ? 'high' : 'medium',
        title: `${row.name} 未达标`,
        evidence: `KPI ${row.name}: target=${row.target}, actual=${row.actual}`,
        judgment: direction === 'lower' ? '该指标越低越好，当前实际值高于目标。' : '该指标越高越好，当前实际值低于目标。',
        action: '优先定位影响该 KPI 的页面、关键词、计划或询盘来源，并拆成 1-2 个本周可执行动作。',
        owner: row.grp === 'seo' ? 'SEO' : row.grp === 'sem' ? 'SEM' : '主管/老板',
        verifyMetric: row.name,
        reviewWindow: '下一次周报或 7 天后复盘',
        source: 'kpi_targets',
      }));
    }
  } catch {
    missing.push('KPI targets');
  }

  try {
    const s = inqRepo.stats();
    cards.push(makeCard({
      area: 'inquiry',
      severity: s.valid > 0 ? 'medium' : 'high',
      title: '询盘质量基线',
      evidence: `total=${s.total}, valid=${s.valid}, A=${s.a}, B=${s.b}, C=${s.c}, validRate=${s.rate}%, ARatio=${s.aRatio}%`,
      judgment: s.valid > 0 ? '已有有效询盘，可用来校验 SEO/SEM 动作是否带来真实业务结果。' : '当前缺少有效询盘，投放和内容建议都需要先验证线索质量。',
      action: '所有 SEO/SEM 优化动作都要绑定有效询盘或 A/B 级询盘变化，不只看流量或点击。',
      owner: '主管/SEO/SEM',
      verifyMetric: '有效询盘数、A 级询盘占比、有效率',
      reviewWindow: '每周复盘',
      source: 'inquiries.stats',
    }));
  } catch {
    missing.push('inquiries');
  }

  try {
    const sem = semRepo.latest();
    if (sem) {
      if (numericValue(sem.cost) > 0 && numericValue(sem.conversions) === 0) {
        cards.push(makeCard({
          area: 'sem',
          severity: 'high',
          title: 'SEM 有花费但无转化',
          evidence: `week=${sem.week_date}, cost=${sem.cost}, clicks=${sem.clicks}, conversions=${sem.conversions}`,
          judgment: '已产生点击成本但没有转化，优先怀疑关键词意图、匹配方式、落地页或询盘入口。',
          action: '先暂停或降价高花费低转化词；检查搜索词并补否词；同步检查落地页和表单。',
          owner: 'SEM',
          verifyMetric: 'conversions, cost_per_conv, valid inquiries',
          reviewWindow: '3-7 天复盘',
          source: 'sem_weeks.latest',
        }));
      }
      if (numericValue(sem.cpc) != null && numericValue(sem.ctr) != null) {
        cards.push(makeCard({
          area: 'sem',
          severity: 'medium',
          title: 'SEM 周报关键指标',
          evidence: `week=${sem.week_date}, CPC=${sem.cpc}, CTR=${sem.ctr}, quality_score=${sem.quality_score}, ROAS=${sem.roas}, cost_per_conv=${sem.cost_per_conv}`,
          judgment: '这组指标应用来判断是流量质量问题、创意相关性问题，还是转化链路问题。',
          action: '按 CPC/CTR/质量分/转化成本拆分计划和关键词，优先处理高成本低转化组合。',
          owner: 'SEM',
          verifyMetric: 'CPC, CTR, quality_score, cost_per_conv, conversions',
          reviewWindow: '每周复盘',
          source: 'sem_weeks.latest',
        }));
      }
    } else {
      missing.push('SEM weekly report');
    }
  } catch {
    missing.push('SEM weekly report');
  }

  try {
    const seoWeeks = seoRepo.latestTwo();
    const latest = seoWeeks[0];
    const prev = seoWeeks[1];
    if (latest) {
      if (prev && numericValue(latest.clicks) != null && numericValue(prev.clicks) != null && Number(latest.clicks) < Number(prev.clicks)) {
        cards.push(makeCard({
          area: 'seo',
          severity: 'high',
          title: 'SEO 点击下滑',
          evidence: `latest=${latest.week_date} clicks=${latest.clicks}; prev=${prev.week_date} clicks=${prev.clicks}`,
          judgment: '自然点击较上期下降，需要优先排查衰退页面、机会词和标题 CTR。',
          action: '找点击下滑页面；优先改展现高 CTR 低页面标题/描述；给排名 11-20 机会词补内容和内链。',
          owner: 'SEO',
          verifyMetric: 'GSC clicks, CTR, avg_position',
          reviewWindow: '7-14 天复盘',
          source: 'seo_weeks.latestTwo',
        }));
      }
      cards.push(makeCard({
        area: 'seo',
        severity: 'medium',
        title: 'SEO 周报关键指标',
        evidence: `week=${latest.week_date}, clicks=${latest.clicks}, impressions=${latest.impressions}, avg_position=${latest.avg_position}, top10_ratio=${latest.top10_ratio}, coverage=${latest.coverage}, indexed_pages=${latest.indexed_pages}`,
        judgment: '这组指标应用来判断是排名问题、CTR 问题、收录问题，还是关键词覆盖不足。',
        action: '按展现高低、排名区间和页面类型拆 SEO 任务，不要只写泛泛内容建议。',
        owner: 'SEO',
        verifyMetric: 'clicks, impressions, CTR, avg_position, indexed_pages',
        reviewWindow: '每周复盘',
        source: 'seo_weeks.latest',
      }));
    } else {
      missing.push('SEO weekly report');
    }
  } catch {
    missing.push('SEO weekly report');
  }

  try {
    const semKeywords = kwRepo.list('sem').slice(0, 12).map((k) => k.keyword);
    const seoKeywords = kwRepo.list('seo').slice(0, 12).map((k) => k.keyword);
    if (semKeywords.length || seoKeywords.length) {
      cards.push(makeCard({
        area: 'keywords',
        severity: 'medium',
        title: '关键词库可用于落地动作',
        evidence: `sem=${semKeywords.join(', ') || '-'}; seo=${seoKeywords.join(', ') || '-'}`,
        judgment: '关键词库能把建议落到具体词，但是否浪费/机会仍需结合 Ads/GSC 明细。',
        action: '让 Hermes 输出建议时必须引用具体关键词，并说明要暂停、扩展、否定、改内容还是改落地页。',
        owner: 'SEO/SEM',
        verifyMetric: 'keyword rank, CTR, CPC, conversions',
        reviewWindow: '7-14 天复盘',
        source: 'keywords',
      }));
    }
  } catch {
    missing.push('keywords');
  }

  return {
    generatedAt: new Date().toISOString(),
    role: operator.role,
    priorityCards: cards.slice(0, 10),
    missingData: [...new Set(missing)],
    usage: 'Use priorityCards as the first evidence pool. Do not replace them with generic marketing advice.',
  };
}

function safeJson(value) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

function buildEnterpriseMemory() {
  let brainState = null;
  let marketSummary = '';
  let marketRows = [];
  let longTermMemories = [];
  const missing = [];

  try {
    brainState = marketBrain.checkState();
    marketSummary = marketBrain.getSummary();
  } catch {
    missing.push('market_brain');
  }

  try {
    marketRows = marketResearchRepo.list().slice(0, 80).map((r) => ({
      section: r.section || '',
      question: r.question || '',
      answers: safeJson(r.answers) || r.answers || '',
    }));
  } catch {
    missing.push('market_research');
  }

  try {
    longTermMemories = hermesMemoryRepo.list({ activeOnly: true, limit: 30 });
  } catch {
    missing.push('hermes_memories');
  }

  return {
    generatedAt: new Date().toISOString(),
    purpose: 'Long-lived enterprise memory for Hermes. Use this before generic marketing assumptions.',
    marketBrain: {
      state: brainState,
      summary: marketSummary,
      instruction: marketSummary
        ? 'Treat this market summary as FERR company background and customer reality.'
        : 'Market research exists but AI memory summary is empty or not refreshed. Ask user to click Sync / Update AI memory on Market Analysis.',
    },
    marketResearch: {
      totalRows: marketRows.length,
      sampleRows: marketRows.slice(0, 12),
      instruction: 'Use market research rows as customer/ICP evidence. Do not quote rows not present in this payload.',
    },
    longTermMemories,
    missingData: missing,
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function buildDailyLearningMemory(operator) {
  const diagnosis = buildOpsDiagnosis(operator);
  const enterpriseMemory = buildEnterpriseMemory();
  const day = todayKey();
  const cards = diagnosis.priorityCards || [];
  const high = cards.filter((c) => c.severity === 'high');
  const focus = (high.length ? high : cards).slice(0, 5);
  const missing = [
    ...(diagnosis.missingData || []),
    ...(enterpriseMemory.missingData || []),
  ];

  const content = [
    `日期：${day}`,
    `角色视角：${operator.role}`,
    `今日核心判断：${focus.length ? '优先盯住 ' + focus.map((c) => c.title).join('；') : '当前没有足够诊断卡，需要先补数据。'}`,
    '',
    '今日优先动作：',
    ...(focus.length ? focus.map((c, i) => `${i + 1}. ${c.title}｜${c.action}｜负责人：${c.owner}｜验证：${c.verifyMetric}｜复盘：${c.reviewWindow}`) : ['1. 补齐 KPI/SEO/SEM/询盘数据后再生成诊断。']),
    '',
    `市场记忆状态：${enterpriseMemory.marketBrain?.summary ? '已有市场分析摘要' : '市场分析摘要未生成或需更新'}`,
    missing.length ? `缺失/需补充数据：${[...new Set(missing)].join('、')}` : '缺失/需补充数据：暂无',
  ].join('\n');

  const evidence = focus.map((c) => `${c.title}: ${c.evidence}`).join('\n');
  const item = hermesMemoryRepo.upsertBySourceTitle({
    kind: 'learning',
    title: `每日运营学习 ${day}`,
    content,
    evidence,
    source: 'hermes_daily_learning',
    importance: 5,
  });

  return { item, diagnosis, enterpriseMemory };
}

const pageContexts = new Map();
const sessions = new Map();

function publicStatus(extra = {}) {
  return {
    configured: Boolean(config.hermes.url),
    url: config.hermes.url,
    checkedAt: new Date().toISOString(),
    ...extra,
  };
}

function bearerToken(request) {
  const raw = request.headers.authorization || '';
  const m = String(raw).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

async function requireHermesContextAuth(request, reply) {
  const token = bearerToken(request);
  if (token && config.hermes.sharedSecret && token === config.hermes.sharedSecret) return;
  return requireAuth(request, reply);
}

function safeRole(v) {
  const role = String(v || '').toLowerCase();
  return ROLE_PERSONAS[role] ? role : '';
}

function resolveOperator(request) {
  const authRole = safeRole(request.user?.role);
  const hintedRole = safeRole(request.query?.role || request.headers['x-ferr-role']);
  const role = authRole || hintedRole || 'manager';
  return {
    role,
    name: request.user?.name || '',
    username: request.user?.username || '',
    persona: ROLE_PERSONAS[role],
  };
}

function contextKeys(operator) {
  return [
    operator.username ? 'user:' + operator.username : '',
    operator.role ? 'role:' + operator.role : '',
    'latest',
  ].filter(Boolean);
}

function latestPageContext(operator) {
  for (const key of contextKeys(operator)) {
    const item = pageContexts.get(key);
    if (item) return item;
  }
  return null;
}

function latestSession(operator) {
  for (const key of contextKeys(operator)) {
    const item = sessions.get(key);
    if (item) return item;
  }
  return null;
}

function trimText(value, max = 12000) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeChoice(value, dict, fallback) {
  const key = String(value || '').trim();
  return dict[key] ? key : fallback;
}

function chatHistoryBlock(history) {
  const rows = Array.isArray(history) ? history.slice(-8) : [];
  return rows
    .map((m) => `${m?.role === 'assistant' ? 'AI' : '用户'}：${trimText(m?.content, 1600)}`)
    .filter((line) => line.replace(/^.*?：/, '').trim())
    .join('\n');
}

function hermesSystem(context) {
  const operator = context.operator;
  return [
    '你是 Hermes for ferr-ops，不是普通大模型聊天。',
    '你必须使用 ferr-ops 的长期记忆、诊断卡、角色 playbook、当前页上下文和用户附件来回答。',
    '你可以学习：当用户要求沉淀、复盘、SOP 或工作流时，要输出可写入 Hermes 记忆的结构化内容。',
    '你可以执行技能：根据 selectedSkill 使用对应 playbook，不要泛泛回答。',
    '你可以执行工作流：根据 selectedWorkflow 把答案组织成可闭环的步骤。',
    '所有建议必须能追溯到证据；没有数据时要明确说缺什么。',
    '禁止把 GSC、GA4、Google Ads 未接入的数据当成事实。',
    `当前角色：${operator.persona.label}`,
    `角色关注：${operator.persona.focus}`,
    `反馈风格：${operator.persona.style}`,
  ].join('\n');
}

function hermesChatPrompt({ context, message, history, attachments, skillKey, workflowKey }) {
  const skill = HERMES_SKILLS[skillKey] || HERMES_SKILLS.auto;
  const workflow = HERMES_WORKFLOWS[workflowKey] || HERMES_WORKFLOWS.answer;
  const memory = context.enterpriseMemory || {};
  const diagnosis = context.opsDiagnosis || {};
  const payload = {
    operator: context.operator,
    session: context.session,
    pageContext: context.pageContext,
    opsDiagnosis: diagnosis,
    enterpriseMemory: {
      marketBrain: memory.marketBrain,
      longTermMemories: memory.longTermMemories,
      missingData: memory.missingData,
    },
    assistantPlaybook: context.assistantPlaybook,
    backendContext: trimText(context.context, 12000),
  };

  return [
    '[Hermes 本轮技能]',
    `${skill.label}: ${skill.instruction}`,
    '',
    '[Hermes 本轮工作流]',
    `${workflow.label}: ${workflow.instruction}`,
    '',
    history ? '[最近对话]\n' + history : '',
    '[Hermes 上下文]',
    JSON.stringify(payload, null, 2).slice(0, 26000),
    attachmentPromptBlock(attachments),
    '',
    '[用户问题]',
    trimText(message, 5000),
    '',
    '输出要求：',
    '1. 先用一行说明本次使用了哪个 Hermes 技能/工作流。',
    '2. 正文按：结论、证据、判断、动作、负责人、验证指标、复盘时间。',
    '3. 如果适合沉淀，最后追加“可沉淀记忆”，但不要声称已经写入，除非用户点击沉淀。',
  ].filter(Boolean).join('\n');
}

function sanitizeSession(body) {
  const panels = Array.isArray(body?.panels) ? body.panels : [];
  return {
    syncedAt: new Date().toISOString(),
    url: trimText(body?.url, 500),
    tab: trimText(body?.tab, 80),
    nav: trimText(body?.nav, 120),
    subtabs: Array.isArray(body?.subtabs) ? body.subtabs.slice(0, 8).map((x) => trimText(x, 120)).filter(Boolean) : [],
    panels: panels.slice(0, 4).map((p) => ({
      id: trimText(p?.id, 80),
      title: trimText(p?.title, 160),
      subtitle: trimText(p?.subtitle, 300),
    })),
  };
}

function sanitizePageContext(body) {
  const panels = Array.isArray(body?.panels) ? body.panels : [];
  const tables = Array.isArray(body?.tables) ? body.tables : [];
  return {
    capturedAt: new Date().toISOString(),
    url: trimText(body?.url, 500),
    tab: trimText(body?.tab, 80),
    nav: trimText(body?.nav, 120),
    subtabs: Array.isArray(body?.subtabs) ? body.subtabs.slice(0, 8).map((x) => trimText(x, 120)).filter(Boolean) : [],
    panels: panels.slice(0, 4).map((p) => ({
      id: trimText(p?.id, 80),
      title: trimText(p?.title, 160),
      subtitle: trimText(p?.subtitle, 300),
      visibleText: trimText(p?.visibleText, 6000),
    })),
    tables: tables.slice(0, 6).map((t) => ({
      title: trimText(t?.title, 160),
      headers: Array.isArray(t?.headers) ? t.headers.slice(0, 10).map((x) => trimText(x, 80)) : [],
      rows: Array.isArray(t?.rows)
        ? t.rows.slice(0, 10).map((row) => Array.isArray(row) ? row.slice(0, 10).map((x) => trimText(x, 160)) : [])
        : [],
    })),
  };
}

function sessionPayload(request) {
  const operator = resolveOperator(request);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: 'ferr-ops',
    mode: 'session_state_lite',
    operator: {
      role: operator.role,
      name: operator.name,
      username: operator.username,
      persona: operator.persona,
    },
    session: latestSession(operator),
    hasPageDetail: Boolean(latestPageContext(operator)),
    assistantBrief: assistantBrief(operator),
    assistantPlaybook: assistantPlaybook(operator),
    instructions: [
      'When the user asks for SEO/SEM/KPI analysis, call ferr_full_context before answering.',
      'When the user asks about the current page/table/plan/keywords, call ferr_page_detail before answering.',
      'Follow assistantPlaybook: evidence first, then judgment, action, owner, verification metric, and review window.',
      '这是轻量会话状态，只用于判断用户当前在哪个页面。',
      '如果用户要求分析“当前页面/这里/这张表/这个计划/这些关键词”，请再调用 page detail 接口读取当前页面详情。',
    ],
  };
}

function pageDetailPayload(request) {
  const operator = resolveOperator(request);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: 'ferr-ops',
    mode: 'page_detail_on_demand',
    operator: {
      role: operator.role,
      name: operator.name,
      username: operator.username,
      persona: operator.persona,
    },
    pageContext: latestPageContext(operator),
    assistantBrief: assistantBrief(operator),
    assistantPlaybook: assistantPlaybook(operator),
    instructions: [
      'Use this payload for current page/table/plan/keyword analysis.',
      'If pageContext is null, tell the user to click “读取当前页” in ferr-ops before analyzing the current page.',
      'Do not invent fields that are not present in pageContext.',
    ],
  };
}

function contextPayload(request) {
  try {
    const context = buildContext();
    const operator = resolveOperator(request);
    const session = latestSession(operator);
    const pageContext = latestPageContext(operator);
    const opsDiagnosis = buildOpsDiagnosis(operator);
    const enterpriseMemory = buildEnterpriseMemory();
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      source: 'ferr-ops',
      mode: 'read_only_context',
      operator: {
        role: operator.role,
        name: operator.name,
        username: operator.username,
        persona: operator.persona,
      },
      session,
      pageContext,
      opsDiagnosis,
      enterpriseMemory,
      assistantBrief: assistantBrief(operator),
      assistantPlaybook: assistantPlaybook(operator),
      assistantInstructions: [
        'Do not answer like a generic GPT assistant.',
        'For SEM: prioritize spend, conversions, CPC, CPA, CTR, quality score, ROAS, negative keywords, and budget allocation.',
        'For SEO: prioritize clicks, impressions, CTR, ranking, decay pages, opportunity keywords, cannibalization, and content tasks.',
        'Use opsDiagnosis.priorityCards as the first evidence pool before giving recommendations.',
        'Use enterpriseMemory.marketBrain and enterpriseMemory.longTermMemories as FERR company/customer background.',
        'Market Analysis is first-party business research. Treat it as higher priority than generic web/LLM knowledge.',
        'The system can persist a daily learning memory via /api/hermes/memories/daily-learning so future analysis becomes more company-specific.',
        'Every action must include evidence, judgment, concrete action, owner, verification metric, and review window.',
        'If pageContext exists, mention which current page/table evidence you used.',
      ],
      system: [
        '你是 FERR 内部 SEO / SEM 运营助理。',
        '所有建议必须基于 ferr-ops 返回的真实数据上下文。',
        'session 是轻量当前页面状态；pageContext 只有用户要求理解当前页面时才会存在。',
        '如果用户问“当前页面/这里/这张表/这个计划/这些关键词”，但 pageContext 为空，要提示先读取当前页详情。',
        '如果上下文缺少 GSC、GA4、Google Ads 或某项业务数据，必须明确说明缺什么，禁止编造。',
        '输出建议时按「证据、判断、动作、验证指标」组织。',
        `当前对话对象：${operator.persona.label}。`,
        `关注重点：${operator.persona.focus}`,
        `反馈风格：${operator.persona.style}`,
      ].join('\n'),
      context,
    };
  } catch (e) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      source: 'ferr-ops',
      mode: 'read_only_context',
      error: 'context_build_failed',
      detail: e?.message || 'Unable to build Hermes context.',
    };
  }
}

export async function hermesRoutes(app) {
  app.get('/api/hermes/status', { preHandler: requireAuth }, async () => {
    if (!config.hermes.url) {
      return publicStatus({
        connected: false,
        error: 'hermes_url_missing',
        detail: 'HERMES_AGENT_URL is not configured on the server.',
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    try {
      const res = await fetch(config.hermes.url, {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
      });

      return publicStatus({
        connected: res.ok,
        statusCode: res.status,
        statusText: res.statusText,
        contentType: res.headers.get('content-type') || '',
        error: res.ok ? '' : 'hermes_http_' + res.status,
      });
    } catch (e) {
      return publicStatus({
        connected: false,
        error: e?.name === 'AbortError' ? 'hermes_timeout' : 'hermes_connect_failed',
        detail: e?.message || 'Hermes Agent is unreachable.',
      });
    } finally {
      clearTimeout(timer);
    }
  });

  app.get('/api/hermes/capabilities', { preHandler: requireAuth }, async () => ({
    ok: true,
    mode: 'ferr_hermes_gateway',
    skills: Object.entries(HERMES_SKILLS).map(([id, item]) => ({ id, label: item.label, instruction: item.instruction })),
    workflows: Object.entries(HERMES_WORKFLOWS).map(([id, item]) => ({ id, label: item.label, instruction: item.instruction })),
    note: '当前使用 ferr-ops 本地 Hermes 记忆、playbook、诊断卡和上下文网关；官方 Hermes 控制台仍作为高级模式入口。',
  }));

  app.post('/api/hermes/chat', { preHandler: requireAuth }, async (request, reply) => {
    const message = trimText(request.body?.message, 5000);
    if (!message) return reply.code(400).send({ error: 'message_required' });

    const skillKey = safeChoice(request.body?.skill, HERMES_SKILLS, 'auto');
    const workflowKey = safeChoice(request.body?.workflow, HERMES_WORKFLOWS, 'answer');
    const attachments = cleanAiAttachments(request.body?.attachments);
    const history = chatHistoryBlock(request.body?.history);
    const context = contextPayload(request);

    if (!context.ok) return reply.code(500).send({ error: context.error || 'hermes_context_failed', detail: context.detail || '' });

    try {
      const text = await callAnthropic(
        hermesSystem(context),
        hermesChatPrompt({ context, message, history, attachments, skillKey, workflowKey }),
        { attachments },
      );
      return {
        text,
        hermes: {
          mode: 'ferr_hermes_gateway',
          skill: { id: skillKey, label: HERMES_SKILLS[skillKey].label },
          workflow: { id: workflowKey, label: HERMES_WORKFLOWS[workflowKey].label },
          usedMemory: Boolean(context.enterpriseMemory?.longTermMemories?.length),
          usedPageContext: Boolean(context.pageContext),
          missingData: [
            ...(context.opsDiagnosis?.missingData || []),
            ...(context.enterpriseMemory?.missingData || []),
          ],
        },
      };
    } catch (e) {
      request.log.error({ err: e.message, status: e.status }, 'hermes chat failed');
      return reply.code(e.code === 'NO_KEY' ? 503 : 502).send({
        error: e.code === 'NO_KEY' ? 'ai_unconfigured' : (e.message || 'hermes_chat_failed'),
        detail: trimText(e.detail, 400),
      });
    }
  });

  app.get('/api/hermes/context', { preHandler: requireHermesContextAuth }, async (request) => contextPayload(request));
  app.post('/api/hermes/context', { preHandler: requireHermesContextAuth }, async (request) => contextPayload(request));
  app.get('/api/hermes/session', { preHandler: requireHermesContextAuth }, async (request) => sessionPayload(request));
  app.get('/api/hermes/page-context', { preHandler: requireHermesContextAuth }, async (request) => pageDetailPayload(request));
  app.get('/api/hermes/memories', { preHandler: requireAuth }, async () => ({
    items: hermesMemoryRepo.list({ activeOnly: true, limit: 100 }),
  }));
  app.post('/api/hermes/memories', editor, async (request, reply) => {
    const item = hermesMemoryRepo.create(request.body || {});
    if (!item) return reply.code(400).send({ error: 'title_and_content_required' });
    reply.code(201);
    return { item };
  });
  app.patch('/api/hermes/memories/:id', editor, async (request, reply) => {
    const item = hermesMemoryRepo.update(Number(request.params.id), request.body || {});
    if (!item) return reply.code(400).send({ error: 'title_and_content_required_or_not_found' });
    return { item };
  });
  app.post('/api/hermes/memories/daily-learning', editor, async (request) => {
    const operator = resolveOperator(request);
    return buildDailyLearningMemory(operator);
  });
  app.delete('/api/hermes/memories/:id', editor, async (request, reply) => {
    const item = hermesMemoryRepo.deactivate(Number(request.params.id));
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { item };
  });

  app.post('/api/hermes/page-context', { preHandler: requireAuth }, async (request) => {
    const operator = resolveOperator(request);
    const item = sanitizePageContext(request.body || {});
    for (const key of contextKeys(operator)) pageContexts.set(key, item);
    return { ok: true, capturedAt: item.capturedAt };
  });

  app.post('/api/hermes/session-sync', { preHandler: requireAuth }, async (request) => {
    const operator = resolveOperator(request);
    const item = sanitizeSession(request.body || {});
    for (const key of contextKeys(operator)) sessions.set(key, item);
    return { ok: true, syncedAt: item.syncedAt };
  });
}
