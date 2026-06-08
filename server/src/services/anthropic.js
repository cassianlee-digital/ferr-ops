// Anthropic Messages API 客户端。密钥仅在后端，浏览器永不接触。
import { config } from '../config.js';

export async function callAnthropic(system, userPrompt) {
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
