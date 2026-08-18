import { requireAuth, editor } from '../auth/middleware.js';
import { buildContext } from '../services/aiContext.js';
import { callAnthropic } from '../services/anthropic.js';
import { aiErrorHttpStatus, publicAiError } from '../services/aiProvider.js';
import { attachmentPromptBlock, cleanAiAttachments } from '../services/aiAttachments.js';
import { getSummary as getBrain } from '../services/marketBrain.js';
import { buildEnterpriseMemory, buildOpsDiagnosis } from '../services/hermesBrain.js';
import { buildHermesEvidenceCitationIndex, compactHermesEvidence, serializeHermesPayload } from '../services/hermesPrompt.js';
import { evidenceSupportsClaim } from '../services/hermesEvidence.js';
import { generateVerifiedAiAnswer } from '../services/verifiedAiAnswer.js';
import * as analyses from '../db/repositories/aiAnalyses.js';

const SYS_PREFIX =
  '你是费尔瑞 FERR（外贸来图定制铸造/机加工厂）的运营分析助手。' +
  '所有建议必须基于后台真实数据、当前页面/当前行内容、市场分析记忆综合判断。' +
  '禁止编造未接入的数据；若数据缺失，要明确写“当前缺失什么数据”。' +
  '回答必须结构化、短句、按优先级，且每条建议都要包含：证据、判断、动作、验证指标。';

const s = (v, n = 4000) => (v == null ? '' : String(v).slice(0, n));
const AI_PROMPT_LIMIT = 28000;

function buildSystem() {
  const brain = getBrain();
  const brainBlock = brain ? `\n\n[市场记忆]\n${brain}` : '';
  return SYS_PREFIX + brainBlock + '\n\n[当前后台真实数据上下文]\n' + buildContext();
}

function hashEvidence(value) {
  let hash = 0;
  for (const char of String(value || '')) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

function scopeDomain(scopeType) {
  const value = String(scopeType || '').toLowerCase();
  if (/sem|ads|广告/.test(value)) return 'sem';
  if (/seo|gsc|自然/.test(value)) return 'seo';
  if (/inquir|询盘/.test(value)) return 'inquiry';
  if (/kpi/.test(value)) return 'kpi';
  return '';
}

function pageGranularity(context) {
  if (!context?.row) return 'page';
  const keys = Object.keys(context.row.cells || {}).join(' ');
  if (/搜索词|query/i.test(keys)) return 'query';
  if (/关键词|keyword/i.test(keys)) return 'keyword';
  if (/广告组|ad\s*group/i.test(keys)) return 'ad_group';
  if (/系列|campaign/i.test(keys)) return 'campaign';
  if (/页面|url/i.test(keys)) return 'page';
  return 'row';
}

function pageEvidence(context, scopeType) {
  if (!context || typeof context !== 'object') return [];
  const value = JSON.stringify(context).slice(0, 5000);
  if (!value || value === '{}') return [];
  return [{
    id: `EV-page-context-${hashEvidence(value)}`,
    source: 'current_page',
    dataRole: 'client_page_context',
    granularity: pageGranularity(context),
    domain: scopeDomain(scopeType),
    label: context.row ? '当前页面所选行' : '当前页面内容',
    summary: value,
    metric: 'current_page_context',
    date: new Date().toISOString().slice(0, 10),
    freshness: 'fresh',
    value,
  }];
}

function verifiedContext(request, text, context, scopeType) {
  const operator = { role: request.user?.role || 'manager' };
  const opsDiagnosis = buildOpsDiagnosis(operator, text);
  const enterpriseMemory = buildEnterpriseMemory();
  const evidencePack = compactHermesEvidence([
    ...pageEvidence(context, scopeType),
    ...(opsDiagnosis.evidencePack || []),
    ...(enterpriseMemory.evidencePack || []),
  ], 36);
  return {
    operator,
    pageContext: context,
    opsDiagnosis,
    enterpriseMemory,
    evidencePack,
    missingData: [...new Set([
      ...(opsDiagnosis.missingData || []),
      ...(enterpriseMemory.missingData || []),
    ])],
  };
}

function verifiedPrompt(prompt, context) {
  return [
    prompt,
    '',
    '[本轮审计上下文]',
    serializeHermesPayload({
      operator: context.operator,
      pageContext: context.pageContext,
      opsDiagnosis: {
        priorityCards: (context.opsDiagnosis?.priorityCards || []).slice(0, 8),
        missingData: context.opsDiagnosis?.missingData || [],
      },
      enterpriseMemory: {
        missingData: context.enterpriseMemory?.missingData || [],
      },
      evidencePack: context.evidencePack,
    }),
    '',
    '[本轮可引用证据]',
    buildHermesEvidenceCitationIndex(context.evidencePack, 36) || '无可用证据编号；所有数据型结论和动作只能写入“待验证”。',
    '',
    '强制输出要求：',
    '1. 严格按 <hermes_basis>...</hermes_basis><hermes_answer>...</hermes_answer> 输出。',
    '2. 每条数据事实、判断和动作必须在同一句绑定匹配的 [EV-...]；不能绑定的统一放入“待验证”。',
    '3. 汇总数据不能推出具体关键词、页面、系列或根因；KPI 目标不能冒充实际表现。',
    '4. 数字、时间范围和实体名称必须与所引证据一致；少而准确，不要补写示例数据。',
  ].join('\n');
}

function qualityPayload(generated, context) {
  return {
    evidenceAudit: generated.audit,
    confidenceAssessment: generated.confidenceAssessment,
    answerQualityRepair: generated.answerQualityRepair,
    missingData: context.missingData || [],
  };
}

function executableResultText(value) {
  return String(value || '')
    .split(/(?:^|\n)\s*待验证\s*[：:]\s*/i)[0]
    .split('\n')
    .filter((line) => !/待验证|不能作为已验证结论执行|需要补充更细的数据/.test(line))
    .join('\n')
    .trim();
}

function contextBlock(context) {
  if (!context || typeof context !== 'object') return '';
  return '\n\n[当前触发位置/页面内容]\n' + JSON.stringify(context, null, 2).slice(0, 8000);
}

function analysisPrompt({ prompt, title, scope_type, context }) {
  return [
    `[分析标题] ${s(title, 200) || 'AI 分析'}`,
    `[分析范围] ${s(scope_type, 80) || 'general'}`,
    '[用户要求]',
    s(prompt, 4000),
    contextBlock(context),
    '',
    '输出格式：',
    '1. 先写“证据摘要”：列出使用了哪些当前页面数据/后台数据/市场记忆。',
    '2. 再写“优先级建议”：每条包含【证据】【判断】【动作】【验证指标】。',
    '3. 若用户已写了整改、测试或标题思路，要指出哪里跑偏、如何改。',
  ].join('\n');
}

function chatPrompt(row, message, attachments) {
  const history = (row.messages || [])
    .slice(-8)
    .map((m) => `${m.role === 'assistant' ? 'AI' : '用户'}：${m.content}`)
    .join('\n');
  const attach = (attachments || []).length
    ? '\n\n[本轮附件备注]\n' + attachments.map((a) => `- ${s(a.name, 120)} (${s(a.type, 80) || 'unknown'})`).join('\n')
    : '';
  return [
    `[分析标题] ${row.title || 'AI 分析'}`,
    '[原始分析要求]',
    row.prompt || '',
    contextBlock(row.context),
    row.result_text ? '\n[上次分析结论]\n' + row.result_text : '',
    history ? '\n[最近对话]\n' + history : '',
    '\n[用户追问]\n' + s(message, 4000),
    attach,
    '',
    '请延续上文回答，仍然给出证据、判断、动作、验证指标；不要重复整篇旧结论。',
  ].join('\n');
}

function aiError(e, request, reply) {
  request.log.error({ err: e.message, status: e.status }, 'ai call failed');
  return reply.code(aiErrorHttpStatus(e)).send(publicAiError(e));
}

export async function aiRoutes(app) {
  app.post('/api/ai', { preHandler: requireAuth }, async (request, reply) => {
    const prompt = s(request.body?.prompt, AI_PROMPT_LIMIT);
    if (!prompt) return reply.code(400).send({ error: 'prompt_required' });
    const attachments = await cleanAiAttachments(request.body?.attachments);
    const fullPrompt = prompt + attachmentPromptBlock(attachments);
    try {
      const context = verifiedContext(request, prompt, null, 'general');
      const generated = await generateVerifiedAiAnswer({
        system: buildSystem(), prompt: verifiedPrompt(fullPrompt, context), context, attachments, forceEvidence: true,
      });
      return { text: generated.text, quality: qualityPayload(generated, context) };
    } catch (e) {
      return aiError(e, request, reply);
    }
  });

  app.get('/api/ai/analyses', { preHandler: requireAuth }, async (request) => {
    const scopeKey = s(request.query?.scope_key, 300);
    if (scopeKey) return { item: analyses.getByScope(scopeKey) };
    return { items: analyses.list({ includeArchived: request.query?.archived === '1' }) };
  });

  app.post('/api/ai/analyze', { preHandler: requireAuth }, async (request, reply) => {
    const b = request.body || {};
    const scope_key = s(b.scope_key, 300);
    const prompt = s(b.prompt, 4000);
    if (!scope_key) return reply.code(400).send({ error: 'scope_key_required' });
    if (!prompt) return reply.code(400).send({ error: 'prompt_required' });

    const old = analyses.getByScope(scope_key);
    if (old && old.quality?.confidenceAssessment && b.force !== true) return { item: old, cached: true };

    const context = b.context && typeof b.context === 'object' ? b.context : null;
    const payload = {
      prompt,
      title: s(b.title, 200),
      scope_type: s(b.scope_type, 80),
      context,
    };

    try {
      const auditContext = verifiedContext(request, `${payload.title}\n${payload.prompt}`, context, payload.scope_type);
      const generated = await generateVerifiedAiAnswer({
        system: buildSystem(), prompt: verifiedPrompt(analysisPrompt(payload), auditContext), context: auditContext, forceEvidence: true,
      });
      const text = generated.text;
      const quality = qualityPayload(generated, auditContext);
      const messages = [{ role: 'assistant', content: text, at: new Date().toISOString() }];
      const item = old
        ? analyses.replaceResult(old.id, { result_text: text, messages, context, quality })
        : analyses.create({ ...payload, scope_key, result_text: text, messages, quality });
      return { item, cached: false };
    } catch (e) {
      return aiError(e, request, reply);
    }
  });

  app.post('/api/ai/analyses/:id/chat', { preHandler: requireAuth }, async (request, reply) => {
    const row = analyses.get(Number(request.params.id));
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const message = s(request.body?.message, 4000);
    if (!message) return reply.code(400).send({ error: 'message_required' });
    const attachments = Array.isArray(request.body?.attachments) ? request.body.attachments.slice(0, 5) : [];

    try {
      const auditContext = verifiedContext(request, `${row.title || ''}\n${message}`, row.context, row.scope_type);
      const generated = await generateVerifiedAiAnswer({
        system: buildSystem(), prompt: verifiedPrompt(chatPrompt(row, message, attachments), auditContext),
        context: auditContext, attachments, forceEvidence: true,
      });
      const text = generated.text;
      const quality = qualityPayload(generated, auditContext);
      const now = new Date().toISOString();
      const item = analyses.appendMessages(row.id, [
        { role: 'user', content: message, attachments, at: now },
        { role: 'assistant', content: text, quality, at: now },
      ], quality);
      return { item, text };
    } catch (e) {
      return aiError(e, request, reply);
    }
  });

  app.post('/api/ai/analyses/:id/action', editor, async (request, reply) => {
    const current = analyses.get(Number(request.params.id));
    if (!current) return reply.code(404).send({ error: 'not_found' });
    const action = s(request.body?.action, 40);
    const confidence = current.quality?.confidenceAssessment;
    if (['adopted', 'deposited'].includes(action) && (!confidence || confidence.level === 'low')) {
      return reply.code(409).send({ error: 'low_confidence_not_actionable' });
    }
    const row = analyses.setAction(current.id, action);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return { item: row };
  });

  app.post('/api/ai/analyses/:id/archive', editor, async (request, reply) => {
    const row = analyses.archive(Number(request.params.id));
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return { item: row };
  });

  // 把一段分析结论拆成可逐条采纳的整改动作（结构化 JSON）。
  app.post('/api/ai/analyses/:id/actions', { preHandler: requireAuth }, async (request, reply) => {
    const row = analyses.get(Number(request.params.id));
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const confidence = row.quality?.confidenceAssessment;
    if (!confidence || confidence.level === 'low') {
      return { actions: [], blocked: true, reason: confidence ? 'low_confidence' : 'unscored_analysis' };
    }
    const sourceText = s(executableResultText(row.result_text), 8000);
    if (!sourceText) return reply.code(400).send({ error: 'no_result_to_split' });
    const auditedEvidence = row.quality?.evidenceAudit?.evidence || [];
    const splitPrompt = [
      '把下面这段运营分析结论，拆解成可执行的整改动作清单。',
      '严格只输出一个 JSON 数组，不要任何额外文字/代码块标记。',
      '每个元素是对象，字段：',
      '- title：动作标题（≤30字，动词开头，如“暂停高花费零转化词”）',
      '- detail：具体怎么做（含涉及的关键词/系列/页面等，1-3句）',
      '- evidence：支撑该动作的数据依据（来自下方结论里的数字）',
      '- evidence_ids：支撑该动作的证据编号数组，只能使用下方“可用证据”中的编号',
      '- dept：仅 "SEO" 或 "SEM"',
      '只保留有明确数据支撑、可落地的动作；最多 8 条。',
      '',
      '[分析标题] ' + (row.title || ''),
      '[分析结论]',
      sourceText,
      '[可用证据]',
      JSON.stringify(auditedEvidence),
    ].join('\n');
    try {
      const text = await callAnthropic(buildSystem(), splitPrompt);
      let actions = [];
      try {
        const m = text.match(/\[[\s\S]*\]/);
        actions = JSON.parse(m ? m[0] : text);
      } catch { actions = []; }
      actions = (Array.isArray(actions) ? actions : [])
        .map((a) => ({
          title: s(a && a.title, 60),
          detail: s(a && a.detail, 500),
          evidence: s(a && a.evidence, 500),
          evidence_ids: Array.isArray(a?.evidence_ids) ? a.evidence_ids.map((id) => s(id, 80).toUpperCase()).slice(0, 8) : [],
          dept: /SEM/i.test(s(a && a.dept, 10)) ? 'SEM' : 'SEO',
        }))
        .filter((a) => {
          if (!a.title || !a.evidence || /待验证/i.test(`${a.title} ${a.detail} ${a.evidence}`)) return false;
          const ids = new Set(a.evidence_ids);
          const cited = auditedEvidence.filter((item) => ids.has(String(item?.id || '').toUpperCase()));
          return cited.length > 0 && evidenceSupportsClaim(`${a.title}。${a.detail}。${a.evidence}`, cited);
        })
        .map((a) => ({ ...a, confidence: row.quality?.confidenceAssessment || null }))
        .slice(0, 8);
      return { actions };
    } catch (e) {
      return aiError(e, request, reply);
    }
  });
}
