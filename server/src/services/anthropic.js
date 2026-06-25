// AI 文本生成客户端。密钥仅在后端，浏览器永不接触。
// 支持两种 provider（按 env AI_PROVIDER 切换；默认 openrouter）：
//   - openrouter：OpenAI 兼容接口，可自由选模型（如 DeepSeek）。读 OPENROUTER_API_KEY / OPENROUTER_MODEL。
//   - anthropic ：直连 Anthropic Messages API。读 config.anthropic（ANTHROPIC_API_KEY / ANTHROPIC_MODEL）。
// 注意：OpenRouter 配置直接读 process.env（不经 config.js），是为避免与并行开发的 config.js 改动冲突；
//       仍只来自环境变量、绝不写死密钥。
import { config } from '../config.js';

const provider = () => (process.env.AI_PROVIDER || 'openrouter').toLowerCase();

// 导出名保持 callAnthropic 不变，调用方（routes/ai.js、services/marketBrain.js）无需改动。
export async function callAnthropic(system, userPrompt) {
  return provider() === 'anthropic'
    ? callAnthropicNative(system, userPrompt)
    : callOpenRouter(system, userPrompt);
}

// ---- OpenRouter（OpenAI 兼容）----
async function callOpenRouter(system, userPrompt) {
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  const model = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash';
  const maxTokens = Number(process.env.OPENROUTER_MAX_TOKENS || process.env.ANTHROPIC_MAX_TOKENS || 1200);
  if (!apiKey) {
    const e = new Error('OPENROUTER_API_KEY 未配置');
    e.code = 'NO_KEY';
    throw e;
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const e = new Error('openrouter_http_' + res.status);
    e.status = res.status;
    e.detail = detail;
    throw e;
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

// ---- Anthropic 原生 ----
async function callAnthropicNative(system, userPrompt) {
  if (!config.anthropic.apiKey) {
    const e = new Error('ANTHROPIC_API_KEY 未配置');
    e.code = 'NO_KEY';
    throw e;
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.anthropic.model,
      max_tokens: config.anthropic.maxTokens,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const e = new Error('anthropic_http_' + res.status);
    e.status = res.status;
    e.detail = detail;
    throw e;
  }
  const data = await res.json();
  return (data.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('\n').trim();
}
