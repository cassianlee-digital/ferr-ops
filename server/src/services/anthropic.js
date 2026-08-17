// AI 文本生成客户端。配置、超时和 Provider 错误统一由 aiProvider.js 管理。
import {
  createAiError,
  fetchWithTimeout,
  providerHttpError,
  recordAiProviderFailure,
  recordAiProviderSuccess,
  requireAiProviderConfig,
} from './aiProvider.js';

// 导出名保持 callAnthropic 不变，避免影响现有调用方。
export async function callAnthropic(system, userPrompt, options = {}) {
  try {
    const cfg = requireAiProviderConfig(options.env || process.env);
    const text = cfg.provider === 'anthropic'
      ? await callAnthropicNative(cfg, system, userPrompt, options)
      : await callOpenRouter(cfg, system, userPrompt, options);
    if (!text) throw createAiError('AI_EMPTY_RESPONSE', 'AI Provider 返回了空内容');
    recordAiProviderSuccess();
    return text;
  } catch (error) {
    recordAiProviderFailure(error);
    throw error;
  }
}

async function callOpenRouter(cfg, system, userPrompt, options) {
  const hasImages = imageAttachments(options.attachments).length > 0;
  const model = hasImages ? cfg.visionModel : cfg.model;
  if (!model) throw createAiError('AI_UNCONFIGURED', 'OpenRouter 视觉模型未配置');
  const response = await fetchWithTimeout(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: cfg.maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: openRouterUserContent(userPrompt, options.attachments) },
      ],
    }),
    signal: options.signal,
  }, {
    timeoutMs: options.timeoutMs || cfg.requestTimeoutMs,
    fetchImpl: options.fetchImpl,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw providerHttpError(response.status, detail, model);
  }
  const data = await parseJsonResponse(response);
  return String(data?.choices?.[0]?.message?.content || '').trim();
}

async function callAnthropicNative(cfg, system, userPrompt, options) {
  const response = await fetchWithTimeout(`${cfg.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      system,
      messages: [{ role: 'user', content: anthropicUserContent(userPrompt, options.attachments) }],
    }),
    signal: options.signal,
  }, {
    timeoutMs: options.timeoutMs || cfg.requestTimeoutMs,
    fetchImpl: options.fetchImpl,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw providerHttpError(response.status, detail, cfg.model);
  }
  const data = await parseJsonResponse(response);
  return (Array.isArray(data?.content) ? data.content : [])
    .map((block) => (block?.type === 'text' ? block.text : ''))
    .join('\n')
    .trim();
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    throw createAiError('AI_INVALID_RESPONSE', 'AI Provider 返回了无法解析的响应', { cause: error });
  }
}

function imageAttachments(attachments) {
  return (Array.isArray(attachments) ? attachments : [])
    .filter((item) => item && item.kind === 'image' && item.imageDataUrl);
}

function openRouterUserContent(userPrompt, attachments) {
  const images = imageAttachments(attachments);
  if (!images.length) return userPrompt;
  return [
    { type: 'text', text: userPrompt },
    ...images.map((item) => ({
      type: 'image_url',
      image_url: { url: item.imageDataUrl },
    })),
  ];
}

function anthropicUserContent(userPrompt, attachments) {
  const images = imageAttachments(attachments);
  if (!images.length) return userPrompt;
  return [
    { type: 'text', text: userPrompt },
    ...images.map((item) => {
      const match = String(item.imageDataUrl).match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i);
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: match ? match[1].toLowerCase() : 'image/jpeg',
          data: match ? match[2] : '',
        },
      };
    }).filter((item) => item.source.data),
  ];
}
