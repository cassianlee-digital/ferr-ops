import { requireAuth } from '../auth/middleware.js';
import { config } from '../config.js';
import { buildContext } from '../services/aiContext.js';

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
    instructions: [
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
  };
}

function contextPayload(request) {
  try {
    const context = buildContext();
    const operator = resolveOperator(request);
    const session = latestSession(operator);
    const pageContext = latestPageContext(operator);
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

  app.get('/api/hermes/context', { preHandler: requireHermesContextAuth }, async (request) => contextPayload(request));
  app.post('/api/hermes/context', { preHandler: requireHermesContextAuth }, async (request) => contextPayload(request));
  app.get('/api/hermes/session', { preHandler: requireHermesContextAuth }, async (request) => sessionPayload(request));
  app.get('/api/hermes/page-context', { preHandler: requireHermesContextAuth }, async (request) => pageDetailPayload(request));

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
