import { requireAuth, editor } from '../auth/middleware.js';
import { buildContext } from '../services/aiContext.js';
import { callAnthropic } from '../services/anthropic.js';
import { aiErrorHttpStatus, publicAiError } from '../services/aiProvider.js';
import { attachmentPromptBlock, cleanAiAttachments } from '../services/aiAttachments.js';
import { getSummary as getBrain } from '../services/marketBrain.js';
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
      const text = await callAnthropic(buildSystem(), fullPrompt, { attachments });
      return { text };
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
    if (old && b.force !== true) return { item: old, cached: true };

    const context = b.context && typeof b.context === 'object' ? b.context : null;
    const payload = {
      prompt,
      title: s(b.title, 200),
      scope_type: s(b.scope_type, 80),
      context,
    };

    try {
      const text = await callAnthropic(buildSystem(), analysisPrompt(payload));
      const messages = [{ role: 'assistant', content: text, at: new Date().toISOString() }];
      const item = old
        ? analyses.replaceResult(old.id, { result_text: text, messages, context })
        : analyses.create({ ...payload, scope_key, result_text: text, messages });
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
      const text = await callAnthropic(buildSystem(), chatPrompt(row, message, attachments));
      const now = new Date().toISOString();
      const item = analyses.appendMessages(row.id, [
        { role: 'user', content: message, attachments, at: now },
        { role: 'assistant', content: text, at: now },
      ]);
      return { item, text };
    } catch (e) {
      return aiError(e, request, reply);
    }
  });

  app.post('/api/ai/analyses/:id/action', editor, async (request, reply) => {
    const row = analyses.setAction(Number(request.params.id), s(request.body?.action, 40));
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
    const sourceText = s(row.result_text, 8000);
    if (!sourceText) return reply.code(400).send({ error: 'no_result_to_split' });
    const splitPrompt = [
      '把下面这段运营分析结论，拆解成可执行的整改动作清单。',
      '严格只输出一个 JSON 数组，不要任何额外文字/代码块标记。',
      '每个元素是对象，字段：',
      '- title：动作标题（≤30字，动词开头，如“暂停高花费零转化词”）',
      '- detail：具体怎么做（含涉及的关键词/系列/页面等，1-3句）',
      '- evidence：支撑该动作的数据依据（来自下方结论里的数字）',
      '- dept：仅 "SEO" 或 "SEM"',
      '只保留有明确数据支撑、可落地的动作；最多 8 条。',
      '',
      '[分析标题] ' + (row.title || ''),
      '[分析结论]',
      sourceText,
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
          dept: /SEM/i.test(s(a && a.dept, 10)) ? 'SEM' : 'SEO',
        }))
        .filter((a) => a.title)
        .slice(0, 8);
      return { actions };
    } catch (e) {
      return aiError(e, request, reply);
    }
  });
}
