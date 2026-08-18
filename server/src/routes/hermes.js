import { editor, onlyManagerBoss, requireAuth } from '../auth/middleware.js';
import { config } from '../config.js';
import { buildContext } from '../services/aiContext.js';
import { aiErrorHttpStatus, publicAiError } from '../services/aiProvider.js';
import { attachmentPromptBlock, cleanAiAttachments } from '../services/aiAttachments.js';
import * as marketBrain from '../services/marketBrain.js';
import * as hermesMemoryRepo from '../db/repositories/hermesMemories.js';
import * as hermesConversationRepo from '../db/repositories/hermesConversations.js';
import { buildOpsDiagnosis, buildEnterpriseMemory, buildDailyLearningMemory, requestedRangeFromText } from '../services/hermesBrain.js';
import { executeTrustedReadAction } from '../services/hermesActions.js';
import { getHermesStatus } from '../services/hermesStatus.js';
import {
  buildHermesEvidenceCitationIndex,
  compactHermesEvidence,
  compactHermesMemories,
  compactHermesPageContext,
  serializeHermesPayload,
} from '../services/hermesPrompt.js';
import { generateVerifiedAiAnswer } from '../services/verifiedAiAnswer.js';
import { memoryTrustAssessment } from '../services/hermesMemoryPolicy.js';

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
  '默认自然回答，不要机械套模板；复杂分析才按结论、证据、动作、风险组织。',
  '禁止只给“优化关键词、提升落地页、持续观察”这种泛泛建议；每条动作必须能落到具体词、页面、计划、指标或任务。',
  '如果用户问“当前页/这张表/这个计划/这些关键词”，必须优先使用 pageContext；pageContext 为空时提醒先读取当前页或调用 ferr_page_detail。',
  '数据优先级：当前页 pageContext > ferr-ops 诊断/同步数据 > KPI/周报/关键词库 > 市场记忆。',
  '不要在正文暴露内部字段名或流程名，例如 assistantPlaybook、operatingPrinciples、opsDiagnosis、priorityCards、pageContext、responseContract。',
];

const hermesRefreshCache = new Map();
const HERMES_REFRESH_TTL_MS = 60 * 1000;

const OPERATING_PRINCIPLES = {
  source: '审查原理.docx',
  purpose: 'Hermes 所有分析、建议、任务拆解、复盘和工作流执行都必须遵循的底层方法论。',
  firstPrinciples: [
    '先定义真实问题，再设计方案：明确目标、对象、场景、输入、输出、约束、风险和成功标准。',
    '区分事实、假设、现象和根因；不要把行业惯例、历史做法或用户表述直接当成正确问题。',
    '从最基本事实重新推导：这个问题为什么存在，核心机制是什么，最小有效解是什么。',
    '优先解决根因，不堆补丁、不堆预算、不堆内容、不堆工具。',
    '选择能解决当前核心问题的最简单方案，只做必要修改，并保留可验证、可回滚路径。',
  ],
  adversarialReview: [
    '完成方案或动作前，必须站在反方审查：哪些假设可能错，哪些数据可能缺，哪些结论可能过度推断。',
    '主动寻找边界情况、异常输入、恶意使用、性能/安全/数据/业务风险。',
    '检查是否破坏已有成果：排名、广告数据、页面结构、任务流程、权限和数据可信度。',
    '检查是否存在更简单、成本更低、风险更小的替代方案。',
    '最终必须说明如何验证结果；没有验证，不能声称问题已经解决。',
  ],
  outputRule: [
    '第一性原理和对抗式审查是内部思考约束，默认不要把它们写成正文标题。',
    '普通问题直接回答；涉及分析、建议、执行、代码、SEO/SEM 或工作流时，必须先在内部完成“第一性原理 → 动作 → 对抗式审查 → 验证”。',
    '如果用户方案低效、复杂、高风险或偏离目标，必须直接指出，并给出替代方案和取舍。',
  ],
};

const RESPONSE_STYLE = [
  '像一个懂业务的运营顾问说话，不像审查表、说明书或系统日志。',
  '不要每次大张旗鼓展示技能、工作流、第一性原理、对抗式审查；这些放在内部完成。',
  '只有用户明确要求“审查、复盘、展开过程、给我框架”时，才显式展开方法论。',
  '简单确认类问题用 1-3 段自然回答；不要强行列 6 个标题。',
  '复杂运营问题默认输出：直接判断、关键依据、下一步怎么做、主要风险。标题要少而有用。',
  '不要解释你调用了哪些内部上下文；只说“我看到的数据/当前页/记忆里显示什么”。',
  '禁止输出内部实现名：assistantPlaybook、operatingPrinciples、opsDiagnosis、priorityCards、pageContext、responseContract、Hermes Gateway。',
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
    operatingPrinciples: OPERATING_PRINCIPLES,
    responseStyle: RESPONSE_STYLE,
    roleRule,
    semPlaybook: SEM_PLAYBOOK,
    seoPlaybook: SEO_PLAYBOOK,
    evidenceRules: [
      '引用数字时说明来源：当前页、KPI、周报、GSC、Ads、询盘或市场记忆。',
      '如果 GSC/GA4/Ads 未接入或为空，必须明说，不能假装有数据。',
      '如果只有全局上下文，没有当前页，要标注“基于全局数据，不是当前页表格”。',
      '根据 evidencePack 的 dataRole 判断证据边界：target_only 只能说明目标差距，不能证明真实表现；manual_weekly_report 必须标注人工周报口径；data_gap 只能支持“缺数据/先核验同步”的判断；keyword_registry 只能支持具体词存在，不能证明词的效果。',
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
    '所有复杂问题都要在内部先按第一性原理定义真实目标、事实、假设、约束和成功标准；输出前做对抗式审查，但默认不要把这些方法论当标题写出来。',
    '回答要像业务顾问自然沟通，不要暴露 assistantPlaybook、operatingPrinciples、opsDiagnosis、priorityCards 等内部字段名。',
    '回答前先判断用户是在问当前页，还是问全局经营数据。',
    '如果问当前页、这张表、这个计划、这些关键词：必须先看 pageContext；没有 pageContext 就要求先读取当前页。',
    '如果问 SEO/SEM/KPI/经营判断：必须基于 ferr_full_context 的真实数据，不允许凭经验编。',
    '输出必须短而硬：结论、证据、判断、动作、负责人、验证指标、复盘时间。',
    '每条建议都必须能落地成后台任务；不能只说“持续优化、提升质量、关注数据”。',
    '数据不足时要直接说缺什么数据，以及缺数据会影响哪一类判断。',
  ].join('\n');
}

function beijingDayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const pageContexts = new Map();
const sessions = new Map();

function aiFailureReply(error, request, reply, label) {
  request.log.error({ err: error.message, status: error.status, code: error.code }, label);
  return reply.code(aiErrorHttpStatus(error)).send(publicAiError(error));
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

function canManageCompanyMemory(request) {
  return request.user?.role === 'manager' || request.user?.role === 'boss';
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

function dataGapTaskFor(name) {
  const key = String(name || '').trim();
  if (!key) return null;
  const map = {
    kpi_targets: {
      dept: '公司',
      owner: '',
      content: '补齐 KPI 目标配置，确保 Hermes 能判断月度达标风险',
      note: '来源：Hermes 缺失数据 kpi_targets。补齐后再生成 KPI/经营判断。',
    },
    inquiries: {
      dept: '公司',
      owner: '',
      content: '补录或校验询盘数据，至少包含总量、有效询盘和 A/B/C 等级',
      note: '来源：Hermes 缺失数据 inquiries。没有询盘质量，SEO/SEM 建议无法验证业务结果。',
    },
    sem_weeks: {
      dept: 'SEM',
      owner: '陈',
      content: '补录本周 SEM 周报指标：花费、点击、转化、CPC、CTR、质量分、转化成本',
      note: '来源：Hermes 缺失数据 sem_weeks。未接入 Google Ads 同步前，先用人工周报维持判断。',
    },
    google_ads_sync: {
      dept: 'SEM',
      owner: '陈',
      content: '检查 Google Ads 同步链路，确认授权、同步任务和昨日数据是否写入系统',
      note: '来源：Hermes 缺失数据 google_ads_sync。没有 Ads 同步证据时，不能分析真实投放表现。',
    },
    seo_weeks: {
      dept: 'SEO',
      owner: '李',
      content: '补录本周 SEO 周报指标：点击、展现、排名、Top10 占比、收录页数',
      note: '来源：Hermes 缺失数据 seo_weeks。未接入 GSC 同步前，先用人工周报维持判断。',
    },
    gsc_sync: {
      dept: 'SEO',
      owner: '李',
      content: '检查 GSC 同步链路，确认授权、数据延迟和指定日期是否写入系统',
      note: '来源：Hermes 缺失数据 gsc_sync。没有 GSC 同步证据时，不能分析真实自然搜索表现。',
    },
    keywords: {
      dept: '公司',
      owner: '',
      content: '补齐关键词库，区分 SEO 机会词、SEM 投放词和否词',
      note: '来源：Hermes 缺失数据 keywords。没有关键词资产，建议无法落到具体词。',
    },
    market_research: {
      dept: '公司',
      owner: '',
      content: '补齐市场分析和客户事实，作为 Hermes 判断客户意图的事实地基',
      note: '来源：Hermes 缺失数据 market_research。避免使用通用营销假设替代公司事实。',
    },
    hermes_memories: {
      dept: '公司',
      owner: '',
      content: '沉淀一条已验证的 Hermes 运营记忆，说明事实、证据和适用场景',
      note: '来源：Hermes 缺失数据 hermes_memories。长期记忆不足会让回答更像通用模型。',
    },
  };
  const fallback = {
    dept: '公司',
    owner: '',
    content: `补齐 ${key} 数据，避免 Hermes 在该范围内凭经验判断`,
    note: `来源：Hermes 缺失数据 ${key}。补齐后重新生成诊断。`,
  };
  const task = map[key] || fallback;
  return {
    key,
    kind: 'task',
    status: '待办',
    task_date: beijingDayKey(),
    ...task,
  };
}

function buildDataGapTasks(missing) {
  return [...new Set((missing || []).filter(Boolean))]
    .map(dataGapTaskFor)
    .filter(Boolean)
    .slice(0, 6);
}

function currentUserId(request) {
  return Number(request.user?.id || 0);
}

function publicAttachmentSummary(attachments) {
  return (attachments || []).slice(0, 5).map((item) => ({
    name: item.name,
    type: item.type,
    size: item.size,
    kind: item.kind,
  }));
}

function conversationTitle(message) {
  return trimText(message, 40) || '新对话';
}

function extractAutoPreferenceMemory(message) {
  const raw = trimText(message, 500);
  if (!raw) return null;
  if (!/(以后|今后|从现在开始|记住|下次|以后都)/.test(raw)) return null;
  if (!/(叫你|喊你|称呼你|你叫|你的名字|称为|叫做)/.test(raw)) return null;

  const patterns = [
    /(?:以后|今后|从现在开始|以后都|下次).*?(?:叫你|喊你|称呼你)(?:为|做|作)?[“"']?([\u4e00-\u9fa5A-Za-z0-9_-]{1,20})[”"']?/,
    /(?:记住).*?(?:你叫|你的名字是|称为|叫做)[“"']?([\u4e00-\u9fa5A-Za-z0-9_-]{1,20})[”"']?/,
    /(?:以后|今后|从现在开始).*?(?:你叫|你的名字是|称为|叫做)[“"']?([\u4e00-\u9fa5A-Za-z0-9_-]{1,20})[”"']?/,
  ];
  const blocked = new Set(['什么', '谁', '可以吗', '吗', '行吗', '名字']);
  for (const pattern of patterns) {
    const m = raw.match(pattern);
    const alias = trimText(m?.[1] || '', 20).replace(/[，。！？,.!?].*$/, '');
    if (!alias || blocked.has(alias)) continue;
    return {
      kind: 'preference',
      title: '称呼偏好：Hermes 名称',
      content: `用户希望在 ferr-ops 后台对话中把 Hermes 称呼为“${alias}”；新对话也应识别“${alias}”指 Hermes 智能体，并自然回应这个称呼。`,
      evidence: `用户原话：${raw}`,
      source: 'hermes_auto_preference:assistant_alias',
      importance: 5,
    };
  }
  return null;
}

function memorySection(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/可沉淀记忆[：:\s]*([\s\S]*)$/);
  return trimText(m ? m[1] : raw, 3000);
}

function conversationLearningPayload(conversation, note = '') {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  if (!lastUser || !lastAssistant) return null;

  const reusable = memorySection(lastAssistant.content);
  const content = [
    '适用场景：' + (conversation.title || 'Hermes 对话沉淀'),
    '用户问题：' + trimText(lastUser.content, 1200),
    '',
    '可复用判断/规则：',
    reusable || trimText(lastAssistant.content, 1800),
  ];
  if (note) content.push('', '人工补充：' + trimText(note, 800));

  const evidence = [
    `来源：Hermes 对话 #${conversation.id}`,
    conversation.role ? `角色：${conversation.role}` : '',
    conversation.skill ? `技能：${conversation.skill}` : '',
    conversation.workflow ? `工作流：${conversation.workflow}` : '',
    lastAssistant.basis ? '判断依据：' + trimText(lastAssistant.basis, 1200) : '',
  ].filter(Boolean).join('\n');

  return {
    kind: 'learning',
    title: '对话沉淀：' + conversationTitle(conversation.title),
    content: content.join('\n'),
    evidence,
    source: 'hermes_conversation:' + conversation.id,
    importance: 4,
  };
}

function conversationFeedbackPayload(conversation, input = {}) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const index = Number(input.messageIndex);
  const assistant = Number.isInteger(index) ? messages[index] : null;
  if (!assistant || assistant.role !== 'assistant') return null;

  const previousUser = messages
    .slice(0, index)
    .reverse()
    .find((m) => m.role === 'user');
  const result = ['adopted', 'generic', 'wrong'].includes(input.result) ? input.result : 'adopted';
  const label = {
    adopted: '有用',
    generic: '太泛',
    wrong: '不准',
  }[result];
  const kind = result === 'wrong' ? 'risk' : (result === 'generic' ? 'preference' : 'learning');
  const importance = result === 'adopted' ? 3 : 4;
  const rule = {
    adopted: '这类回答方式后续可以复用：保留其问题拆解、证据组织和动作表达方式。',
    generic: '后续遇到类似问题时不要泛泛回答，必须补充具体数据证据、判断边界、负责人和验证指标。',
    wrong: '后续遇到类似问题时先复核事实与假设，避免沿用这次被标记为不准的判断路径。',
  }[result];

  return {
    kind,
    title: `回答反馈：${label} #${conversation.id}-${index}`,
    content: [
      '反馈结果：' + label,
      '适用场景：' + (conversation.title || 'Hermes 对话反馈'),
      previousUser ? '用户问题：' + trimText(previousUser.content, 1200) : '',
      '',
      '后续规则：',
      rule,
      '',
      '被反馈回答摘要：',
      trimText(assistant.content, 1600),
    ].filter(Boolean).join('\n'),
    evidence: [
      `来源：Hermes 对话 #${conversation.id} 第 ${index + 1} 条回答`,
      conversation.role ? `角色：${conversation.role}` : '',
      assistant.basis ? '原判断依据：' + trimText(assistant.basis, 1200) : '',
    ].filter(Boolean).join('\n'),
    source: `hermes_feedback:${conversation.id}:${index}:${result}`,
    importance,
  };
}

function hermesSystem(context) {
  const operator = context.operator;
  return [
    '你是 Hermes for ferr-ops，不是普通大模型聊天。',
    '你必须使用 ferr-ops 的长期记忆、诊断卡、角色 playbook、当前页上下文和用户附件来回答。',
    '第一性原理和对抗式审查是你的内部思考约束：先定义真实问题并推导最小有效方案，再检查假设、边界、风险、替代方案和验证方式。',
    '不要默认把内部思考过程写成“第一性原理分析”“对抗式审查”等标题；只有用户明确要求审查/展开过程时才显式展示。',
    '不要在正文暴露内部实现名：assistantPlaybook、operatingPrinciples、opsDiagnosis、priorityCards、pageContext、responseContract、Hermes Gateway。',
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
  const evidencePack = compactHermesEvidence(context.evidencePack || diagnosis.evidencePack || []);
  const payload = {
    operator: context.operator,
    session: context.session,
    pageContext: compactHermesPageContext(context.pageContext),
    opsDiagnosis: {
      generatedAt: diagnosis.generatedAt,
      priorityCards: (diagnosis.priorityCards || []).slice(0, 4),
      missingData: diagnosis.missingData,
      usage: diagnosis.usage,
    },
    evidencePack,
    enterpriseMemory: {
      marketBrain: memory.marketBrain,
      longTermMemories: compactHermesMemories(memory.trustedLongTermMemories || memory.longTermMemories),
      missingData: memory.missingData,
    },
    assistantPlaybook: context.assistantPlaybook,
    backendContext: trimText(context.context, 2500),
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
    serializeHermesPayload(payload),
    attachmentPromptBlock(attachments),
    '',
    '[用户问题]',
    trimText(message, 5000),
    '',
    '[本轮可引用证据]',
    buildHermesEvidenceCitationIndex(evidencePack) || '无可用证据编号；数据型结论只能写成待验证。',
    '',
    '输出要求：',
    '1. 严格按下面两个 XML 风格标签输出，标签外不要写任何内容：',
    '<hermes_basis>这里写 2-5 条判断依据摘要：用了哪些数据、排除了什么、主要不确定性是什么。不要写内部字段名。</hermes_basis>',
    '<hermes_answer>这里写给用户看的最终回答。默认自然回答，先给判断，再给必要依据和下一步；不要先声明使用了什么技能/工作流。</hermes_answer>',
    '2. 把第一性原理和对抗式审查用于内部判断，不要机械输出同名标题。',
    '3. 简单问题用短段落；复杂运营问题才使用少量标题：判断、依据、下一步、风险。',
    '4. 如果用户方案有问题，直接指出问题、后果、替代方案和取舍。',
    '5. 如果适合沉淀，最终回答里可追加“可沉淀记忆”，但不要声称已经写入，除非用户点击沉淀。',
    '6. 运营判断必须引用 evidencePack 里的证据编号，例如 [EV-...]；没有证据编号支撑的内容只能写成假设、风险或缺失数据。',
    '7. 每条运营判断、建议或动作必须在同一句/同一条里绑定有效 [EV-...]；无法绑定证据的内容统一放进“待验证”，不得混在已验证结论里。',
    '8. 一条只写一个可核验判断。严格分开“数据事实”“原因假设”“建议动作”；不要用“说明、证明、必然、根因”把相关性写成因果。',
    '9. 汇总数据只能支持汇总结论；要评价或操作具体关键词、查询词、页面、系列、广告组，必须引用相同层级的明细证据。',
    '10. KPI target_only 只代表目标值，不能把 actual=0 或缺失值当实际表现；公司特色、客户偏好和认证判断必须引用 market_research 或可信长期记忆。',
    '11. 优先少而准确；证据只能支持一个判断时就只回答一个，不要为了凑结构扩写。',
  ].filter(Boolean).join('\n');
}

function morningBriefPrompt(context) {
  const diagnosis = context.opsDiagnosis || {};
  const memory = context.enterpriseMemory || {};
  const missing = [
    ...(diagnosis.missingData || []),
    ...(memory.missingData || []),
  ];
  const evidencePack = compactHermesEvidence(context.evidencePack || diagnosis.evidencePack || [], 20);
  const payload = {
    date: beijingDayKey(),
    operator: context.operator,
    session: context.session,
    priorityCards: (diagnosis.priorityCards || []).slice(0, 8),
    evidencePack,
    missingData: [...new Set(missing)],
    enterpriseMemory: {
      marketBrain: memory.marketBrain,
      longTermMemories: compactHermesMemories(memory.trustedLongTermMemories || memory.longTermMemories),
    },
    backendContext: trimText(context.context, 2500),
  };

  return [
    '[任务]',
    '生成今天的 Hermes 今日早报。它不是普通总结，而是当天运营开工前的判断简报。',
    '',
    '[要求]',
    '1. 按当前角色过滤重点：SEO 账号优先 SEO，SEM 账号优先 SEM，主管/老板看公司整体和跨部门风险。',
    '2. 必须先给今日最重要判断，再给证据、风险、今天动作、验证指标。',
    '3. 必须引用 payload 中的真实证据；缺少 GSC、GA4、Google Ads 或周报时直接说明，不得编造。',
    '4. 不要写空泛建议，例如“持续优化”“加强关注”。每个动作必须可执行、可复盘。',
    '5. 简报要慎重，宁可说数据不足，也不要做没有证据的判断。',
    '6. 每个关键判断都要引用 evidencePack 的 [EV-...] 编号；没有编号支撑时必须标成待验证。',
    '7. 汇总数据不能直接推出具体关键词、页面或根因；事实、假设和动作必须分开写。',
    '7. 每条今日动作必须能追溯到同一句/同一条里的有效 [EV-...]；无法追溯的动作只能放入“待验证”。',
    '',
    '[Hermes 上下文]',
    serializeHermesPayload(payload),
    '',
    '[本轮可引用证据]',
    buildHermesEvidenceCitationIndex(evidencePack, 20) || '无可用证据编号；所有运营结论只能写成待验证。',
    '',
    '输出要求：',
    '严格按下面两个 XML 风格标签输出，标签外不要写任何内容：',
    '<hermes_basis>2-5 条早报判断依据摘要：引用了哪些真实数据、缺什么、为什么这样排优先级。</hermes_basis>',
    '<hermes_answer>面向用户的今日早报。建议结构：今日判断、关键证据、今天先做、风险提醒、复盘指标。</hermes_answer>',
  ].join('\n');
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

function refreshProvidersForMessage(message) {
  const raw = String(message || '');
  if (!/(昨天|昨日|今天|今日|近\s*7\s*天|过去\s*7\s*天|最近\s*7\s*天|yesterday|today|last\s*7\s*days)/i.test(raw)) return [];
  const wantsGa4 = /(GA4|Google Analytics|Analytics|会话|活跃用户|浏览量|关键事件|表单|下载|邮件点击|WhatsApp|落地页)/i.test(raw);
  const wantsAds = /(SEM|广告|Ads|花费|投放|CPC|CPA|ROAS)/i.test(raw) || (!wantsGa4 && /(点击|转化)/i.test(raw));
  const wantsGsc = /(SEO|GSC|自然|排名|收录|展现|流量|CTR)/i.test(raw);
  if (!wantsAds && !wantsGsc && !wantsGa4 && !/(数据|指标|报表|表现|效果|异常|分析|趋势|运营)/i.test(raw)) return [];
  const providers = [];
  if (wantsAds) providers.push('ads');
  if (wantsGsc) providers.push('gsc');
  if (wantsGa4) providers.push('ga4');
  return providers.length ? providers : ['ads', 'gsc', 'ga4'];
}

async function refreshHermesProvider(provider, range, userId) {
  const key = `${provider}:${range.start_date}:${range.end_date}`;
  const cached = hermesRefreshCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const actionType = { ads: 'sync_ads', gsc: 'sync_gsc', ga4: 'sync_ga4' }[provider];
  if (!actionType) throw new Error('unsupported_google_provider');
  const result = executeTrustedReadAction({
    userId,
    actionType,
    title: `Hermes 自动刷新 ${provider.toUpperCase()} 数据`,
    input: range,
  })
    .then((data) => ({ provider, status: 'synced', actionId: data.id, rowsWritten: Number(data.result?.rowsWritten || 0), range }))
    .catch((error) => ({
      provider,
      status: 'failed',
      actionId: error.actionId || null,
      error: String(error?.message || 'sync_failed'),
      missing: Array.isArray(error?.missing) ? error.missing : [],
      range,
    }));
  hermesRefreshCache.set(key, { expiresAt: Date.now() + HERMES_REFRESH_TTL_MS, result });
  return result;
}

async function refreshHermesRequestedData(message, userId) {
  const providers = refreshProvidersForMessage(message);
  if (!providers.length) return null;
  const range = requestedRangeFromText(message);
  const results = await Promise.all(providers.map((provider) => refreshHermesProvider(provider, range, userId)));
  return { requestedRange: range, providers: results };
}

function contextPayload(request, options = {}) {
  try {
    const message = request.body?.message || request.query?.message || '';
    const context = buildContext({ message });
    const operator = resolveOperator(request);
    const session = latestSession(operator);
    const pageContext = latestPageContext(operator);
    const opsDiagnosis = buildOpsDiagnosis(operator, message);
    const enterpriseMemory = buildEnterpriseMemory();
    const allEvidence = [
      ...(opsDiagnosis.evidencePack || []),
      ...(enterpriseMemory.evidencePack || []),
    ];
    const focusDomain = /(客户|市场|特色|认证|资质|采购)/i.test(message) ? 'market'
      : /(GA4|Google Analytics|Analytics|会话|活跃用户|浏览量|关键事件|事件|表单|下载|邮件点击|WhatsApp|落地页)/i.test(message) ? 'analytics'
      : /(SEM|Ads|广告|投放|花费|预算|CPC|CPA|ROAS)/i.test(message) ? 'sem'
        : /(SEO|GSC|自然|排名|收录|页面|查询词)/i.test(message) ? 'seo'
          : /(询盘|线索)/i.test(message) ? 'inquiry' : '';
    const evidencePack = allEvidence.slice().sort((a, b) => {
      if (!focusDomain) return 0;
      return Number(b.domain === focusDomain) - Number(a.domain === focusDomain);
    }).slice(0, 40);
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
      evidencePack,
      closureAudit: enterpriseMemory.closureAudit,
      dataRefresh: options.dataRefresh || null,
      operatingPrinciples: OPERATING_PRINCIPLES,
      responseStyle: RESPONSE_STYLE,
      assistantBrief: assistantBrief(operator),
      assistantPlaybook: assistantPlaybook(operator),
      assistantInstructions: [
        'Do not answer like a generic GPT assistant.',
        'Apply operatingPrinciples internally; do not expose them as rigid headings unless the user explicitly asks for review or reasoning structure.',
        'Do not expose internal field names such as assistantPlaybook, operatingPrinciples, opsDiagnosis, priorityCards, pageContext, or responseContract.',
        'For SEM: prioritize spend, conversions, CPC, CPA, CTR, quality score, ROAS, negative keywords, and budget allocation.',
        'For SEO: prioritize clicks, impressions, CTR, ranking, decay pages, opportunity keywords, cannibalization, and content tasks.',
        'For GA4: use campaign, landing-page, and event-level evidence. A GA4 event is a tracked site behavior, not proof of a valid inquiry; verify it against CRM inquiry records before recommending action.',
        'Use the combined evidencePack ids as citation anchors before giving recommendations, including market research and trusted company memory when the question concerns FERR characteristics.',
        'If dataRefresh exists, report the requested range and sync result accurately; synced with rowsWritten=0 means no rows were written, not that business data exists.',
        'Unsupported claims must be labeled as assumptions, risks, or missing data.',
        'Use enterpriseMemory.longTermMemories as FERR company/customer background. Conflicting memories are excluded until a human confirms the valid candidate.',
        'Use closureAudit as a read-only control report: do not silently choose between conflicting memories, do not call an action closed without a result and verification metric, and surface overdue actions or missing review sections when relevant.',
        'Market Analysis is first-party business research. Treat it as higher priority than generic web/LLM knowledge.',
        'The system can persist a daily learning memory via /api/hermes/memories/daily-learning so future analysis becomes more company-specific.',
        'Every action must include evidence, judgment, concrete action, owner, verification metric, and review window.',
        'If pageContext exists, mention which current page/table evidence you used.',
      ],
      system: [
        '你是 FERR 内部 SEO / SEM 运营助理。',
        '所有建议必须基于 ferr-ops 返回的真实数据上下文。',
        '所有分析、建议、执行和复盘必须在内部遵循 operatingPrinciples：第一性原理负责生成，对抗式审查负责验证；默认不要把方法论写成正文标题。',
        'session 是轻量当前页面状态；pageContext 只有用户要求理解当前页面时才会存在。',
        '如果用户问“当前页面/这里/这张表/这个计划/这些关键词”，但 pageContext 为空，要提示先读取当前页详情。',
        '如果上下文缺少 GSC、GA4、Google Ads 或某项业务数据，必须明确说明缺什么，禁止编造。',
        '如果 dataRefresh 显示同步完成但写入 0 行，只能说已尝试同步且当前没有可用明细，不能说已经抓到数据。',
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
  app.get('/api/hermes/status', { preHandler: requireAuth }, async (request) => {
    const force = request.query?.force === '1' || request.query?.force === 'true';
    return getHermesStatus({ force, logger: request.log });
  });

  app.get('/api/hermes/capabilities', { preHandler: requireAuth }, async () => ({
    ok: true,
    mode: 'ferr_hermes_gateway',
    operatingPrinciples: OPERATING_PRINCIPLES,
    responseStyle: RESPONSE_STYLE,
    skills: Object.entries(HERMES_SKILLS).map(([id, item]) => ({ id, label: item.label, instruction: item.instruction })),
    workflows: Object.entries(HERMES_WORKFLOWS).map(([id, item]) => ({ id, label: item.label, instruction: item.instruction })),
    note: '当前使用 ferr-ops 本地 Hermes、记忆、playbook、诊断卡和上下文网关。',
  }));

  app.post('/api/hermes/morning-brief', editor, async (request, reply) => {
    const userId = currentUserId(request);
    if (!userId) return reply.code(401).send({ error: 'unauthorized' });
    const context = contextPayload(request);
    if (!context.ok) return reply.code(500).send({ error: context.error || 'hermes_context_failed', detail: context.detail || '' });

    const role = context.operator?.role || resolveOperator(request).role;
    const day = beijingDayKey();
    const requestedConversationId = Number(request.body?.conversationId || 0);
    const existingConversation = requestedConversationId
      ? hermesConversationRepo.getForUser(requestedConversationId, userId)
      : null;
    const activeConversation = existingConversation?.state === 'active' ? existingConversation : null;

    try {
      const generated = await generateVerifiedAiAnswer({
        system: hermesSystem(context),
        prompt: morningBriefPrompt(context),
        context,
        forceEvidence: true,
      });
      const { parsed, responseText, audit, confidenceAssessment, answerQualityRepair } = generated;
      const missing = [
        ...(context.opsDiagnosis?.missingData || []),
        ...(context.enterpriseMemory?.missingData || []),
      ];
      const missingData = [...new Set(missing)];
      const hermes = {
        mode: 'ferr_hermes_morning_brief',
        skill: { id: 'auto', label: '今日早报' },
        workflow: { id: 'diagnose_to_action', label: '诊断到动作' },
        usedMemory: Boolean((context.enterpriseMemory?.trustedLongTermMemories || context.enterpriseMemory?.longTermMemories)?.length),
        usedPageContext: Boolean(context.pageContext),
        missingData,
        dataGapTasks: buildDataGapTasks(missingData),
        evidenceAudit: audit,
        confidenceAssessment,
        answerQualityRepair,
        closureAudit: context.closureAudit || context.enterpriseMemory?.closureAudit || null,
      };
      const memory = canManageCompanyMemory(request) ? hermesMemoryRepo.upsertBySourceTitle({
        kind: 'learning',
        title: `今日早报 ${day} ${role}`,
        content: parsed.answer || responseText,
        evidence: parsed.basis,
        source: `hermes_morning_brief:${role}`,
        importance: 5,
      }) : null;
      const now = new Date().toISOString();
      const additions = [
        { role: 'user', content: '生成今日早报', at: now },
        { role: 'assistant', content: parsed.answer || responseText, basis: parsed.basis, hermes, at: now },
      ];
      const conversation = activeConversation
        ? hermesConversationRepo.appendForUser(activeConversation.id, userId, additions, { skill: 'auto', workflow: 'diagnose_to_action' })
        : hermesConversationRepo.createForUser({
          user_id: userId,
          role,
          title: `今日早报 ${day}`,
          messages: additions,
          skill: 'auto',
          workflow: 'diagnose_to_action',
        });

      return {
        text: responseText,
        hermes,
        briefing: { day, role, memoryId: memory?.id || null },
        conversation: conversation ? {
          id: conversation.id,
          title: conversation.title,
          state: conversation.state,
          updated_at: conversation.updated_at,
        } : null,
      };
    } catch (e) {
      return aiFailureReply(e, request, reply, 'hermes morning brief failed');
    }
  });

  app.get('/api/hermes/conversations', { preHandler: requireAuth }, async (request) => {
    const userId = currentUserId(request);
    return {
      items: hermesConversationRepo.listForUser(userId, {
        archived: request.query?.archived === '1' || request.query?.archived === 'true',
        limit: request.query?.limit,
      }),
    };
  });

  app.get('/api/hermes/conversations/latest', { preHandler: requireAuth }, async (request) => ({
    conversation: hermesConversationRepo.latestForUser(currentUserId(request)),
  }));

  app.get('/api/hermes/conversations/:id', { preHandler: requireAuth }, async (request, reply) => {
    const item = hermesConversationRepo.getForUser(Number(request.params.id), currentUserId(request));
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { conversation: item };
  });

  app.post('/api/hermes/conversations', { preHandler: requireAuth }, async (request, reply) => {
    const userId = currentUserId(request);
    if (!userId) return reply.code(401).send({ error: 'unauthorized' });
    const operator = resolveOperator(request);
    const item = hermesConversationRepo.createForUser({
      user_id: userId,
      role: operator.role,
      title: trimText(request.body?.title, 40) || '新对话',
      skill: safeChoice(request.body?.skill, HERMES_SKILLS, 'auto'),
      workflow: safeChoice(request.body?.workflow, HERMES_WORKFLOWS, 'answer'),
      messages: [],
    });
    reply.code(201);
    return { conversation: item };
  });

  app.post('/api/hermes/conversations/:id/archive', { preHandler: requireAuth }, async (request, reply) => {
    const item = hermesConversationRepo.archiveForUser(Number(request.params.id), currentUserId(request));
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { conversation: item };
  });

  app.post('/api/hermes/conversations/:id/learn', onlyManagerBoss, async (request, reply) => {
    const conversation = hermesConversationRepo.getForUser(Number(request.params.id), currentUserId(request));
    if (!conversation) return reply.code(404).send({ error: 'not_found' });
    const payload = conversationLearningPayload(conversation, request.body?.note);
    if (!payload) return reply.code(400).send({ error: 'conversation_not_learnable' });
    const item = hermesMemoryRepo.upsertBySourceTitle(payload);
    if (!item) return reply.code(400).send({ error: 'memory_save_failed' });
    return { item };
  });

  app.post('/api/hermes/conversations/:id/feedback', onlyManagerBoss, async (request, reply) => {
    const conversation = hermesConversationRepo.getForUser(Number(request.params.id), currentUserId(request));
    if (!conversation) return reply.code(404).send({ error: 'not_found' });
    const payload = conversationFeedbackPayload(conversation, request.body || {});
    if (!payload) return reply.code(400).send({ error: 'feedback_target_required' });
    const item = hermesMemoryRepo.upsertBySourceTitle(payload);
    if (!item) return reply.code(400).send({ error: 'feedback_save_failed' });
    return { item };
  });

  app.post('/api/hermes/chat', { preHandler: requireAuth }, async (request, reply) => {
    const message = trimText(request.body?.message, 5000);
    if (!message) return reply.code(400).send({ error: 'message_required' });
    const userId = currentUserId(request);
    if (!userId) return reply.code(401).send({ error: 'unauthorized' });

    const skillKey = safeChoice(request.body?.skill, HERMES_SKILLS, 'auto');
    const workflowKey = safeChoice(request.body?.workflow, HERMES_WORKFLOWS, 'answer');
    const attachments = await cleanAiAttachments(request.body?.attachments);
    const requestedConversationId = Number(request.body?.conversationId || 0);
    const existingConversation = requestedConversationId
      ? hermesConversationRepo.getForUser(requestedConversationId, userId)
      : null;
    const activeConversation = existingConversation?.state === 'active' ? existingConversation : null;
    const history = chatHistoryBlock(activeConversation?.messages || request.body?.history);
    const dataRefresh = await refreshHermesRequestedData(message, userId);
    const context = contextPayload(request, { dataRefresh });

    if (!context.ok) return reply.code(500).send({ error: context.error || 'hermes_context_failed', detail: context.detail || '' });

    try {
      const generated = await generateVerifiedAiAnswer({
        system: hermesSystem(context),
        prompt: hermesChatPrompt({ context, message, history, attachments, skillKey, workflowKey }),
        context,
        attachments,
      });
      const { parsed, responseText, audit, confidenceAssessment, answerQualityRepair } = generated;
      const hermes = {
        mode: 'ferr_hermes_gateway',
        skill: { id: skillKey, label: HERMES_SKILLS[skillKey].label },
        workflow: { id: workflowKey, label: HERMES_WORKFLOWS[workflowKey].label },
        usedMemory: Boolean((context.enterpriseMemory?.trustedLongTermMemories || context.enterpriseMemory?.longTermMemories)?.length),
        usedPageContext: Boolean(context.pageContext),
        missingData: [
          ...(context.opsDiagnosis?.missingData || []),
          ...(context.enterpriseMemory?.missingData || []),
        ],
        dataRefresh: context.dataRefresh || null,
        evidenceAudit: audit,
        confidenceAssessment,
        answerQualityRepair,
        closureAudit: context.closureAudit || context.enterpriseMemory?.closureAudit || null,
      };
      hermes.missingData = [...new Set(hermes.missingData)];
      hermes.dataGapTasks = buildDataGapTasks(hermes.missingData);
      const now = new Date().toISOString();
      const additions = [
        { role: 'user', content: message, attachments: publicAttachmentSummary(attachments), at: now },
        { role: 'assistant', content: parsed.answer || responseText, basis: parsed.basis, hermes, at: now },
      ];
      const conversation = activeConversation
        ? hermesConversationRepo.appendForUser(activeConversation.id, userId, additions, { skill: skillKey, workflow: workflowKey })
        : hermesConversationRepo.createForUser({
          user_id: userId,
          role: resolveOperator(request).role,
          title: conversationTitle(message),
          messages: additions,
          skill: skillKey,
          workflow: workflowKey,
        });
      const autoMemoryPayload = canManageCompanyMemory(request) ? extractAutoPreferenceMemory(message) : null;
      const autoMemory = autoMemoryPayload ? hermesMemoryRepo.upsertBySourceTitle(autoMemoryPayload) : null;
      return {
        text: responseText,
        hermes,
        memory: autoMemory ? { id: autoMemory.id, kind: autoMemory.kind, title: autoMemory.title } : null,
        conversation: conversation ? {
          id: conversation.id,
          title: conversation.title,
          state: conversation.state,
          updated_at: conversation.updated_at,
        } : null,
      };
    } catch (e) {
      return aiFailureReply(e, request, reply, 'hermes chat failed');
    }
  });

  app.get('/api/hermes/context', { preHandler: requireHermesContextAuth }, async (request) => contextPayload(request));
  app.post('/api/hermes/context', { preHandler: requireHermesContextAuth }, async (request) => contextPayload(request));
  app.get('/api/hermes/session', { preHandler: requireHermesContextAuth }, async (request) => sessionPayload(request));
  app.get('/api/hermes/page-context', { preHandler: requireHermesContextAuth }, async (request) => pageDetailPayload(request));
  app.get('/api/hermes/memories', { preHandler: requireAuth }, async () => ({
    items: hermesMemoryRepo.list({ activeOnly: true, limit: 100 }).map((memory) => ({
      ...memory,
      trust: memoryTrustAssessment(memory),
    })),
  }));
  app.post('/api/hermes/memories', onlyManagerBoss, async (request, reply) => {
    const item = hermesMemoryRepo.create(request.body || {});
    if (!item) return reply.code(400).send({ error: 'title_and_content_required' });
    reply.code(201);
    return { item };
  });
  app.patch('/api/hermes/memories/:id', onlyManagerBoss, async (request, reply) => {
    const item = hermesMemoryRepo.update(Number(request.params.id), request.body || {});
    if (!item) return reply.code(400).send({ error: 'title_and_content_required_or_not_found' });
    return { item };
  });
  app.post('/api/hermes/memories/daily-learning', onlyManagerBoss, async (request) => {
    const operator = resolveOperator(request);
    return buildDailyLearningMemory(operator);
  });
  app.delete('/api/hermes/memories/:id', onlyManagerBoss, async (request, reply) => {
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
