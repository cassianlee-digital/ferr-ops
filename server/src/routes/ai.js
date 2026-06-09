// AI 代理（FR-5）。后端拼接 DB 上下文后调用 Anthropic，返回 {text}。
// 密钥仅在后端 .env，前端抓包看不到 key。失败给明确状态码，前端降级提示。
import { requireAuth } from '../auth/middleware.js';
import { buildContext } from '../services/aiContext.js';
import { callAnthropic } from '../services/anthropic.js';
import { getSummary as getBrain } from '../services/marketBrain.js';

const SYS_PREFIX =
  '你是费尔瑞 FERR(外贸来图定制铸造/机加工厂)的运营分析助手。' +
  '回答要简短、可执行、按优先级，用中文，能落到具体动作。';

// 把市场记忆体（MARKET_BRAIN_SUMMARY）强制注入所有日常 AI 调用的 system，
// AI「睁眼自带」行业背景，无需每次重复打包市场资料（节约 token）。
function buildSystem() {
  const brain = getBrain();
  const brainBlock = brain
    ? `\n\n[市场记忆 · 常驻背景知识]\n${brain}`
    : '';
  return SYS_PREFIX + brainBlock + '\n\n[当前后台真实数据上下文]\n' + buildContext();
}

export async function aiRoutes(app) {
  app.post('/api/ai', { preHandler: requireAuth }, async (request, reply) => {
    const prompt = String(request.body?.prompt || '').slice(0, 4000);
    if (!prompt) return reply.code(400).send({ error: 'prompt_required' });
    const system = buildSystem();
    try {
      const text = await callAnthropic(system, prompt);
      return { text };
    } catch (e) {
      if (e.code === 'NO_KEY') return reply.code(503).send({ error: 'ai_unconfigured' });
      request.log.error({ err: e.message, status: e.status }, 'ai call failed');
      return reply.code(502).send({ error: 'ai_failed' });
    }
  });
}
