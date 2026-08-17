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
  const request = {
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
  };
  const timeoutMs = options.timeoutMs || cfg.requestTimeoutMs;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetchWithTimeout(`${cfg.baseUrl}/chat/completions`, request, {
      timeoutMs: attempt === 0 ? timeoutMs : Math.min(timeoutMs, 45_000),
      fetchImpl: options.fetchImpl,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw providerHttpError(response.status, detail, model);
    }
    let data;
    try {
      data = await parseJsonResponse(response);
    } catch (error) {
      if (attempt === 0 && error?.code === 'AI_INVALID_RESPONSE') continue;
      throw error;
    }
    const completion = extractOpenRouterCompletion(data);
    if (completion.text) return completion.text;
    if (attempt === 1 || completion.refused) throw openRouterEmptyResponseError(completion, attempt + 1);
  }

  throw createAiError('AI_EMPTY_RESPONSE', 'AI Provider 返回了空内容');
}

function extractOpenRouterCompletion(data) {
  const choice = data?.choices?.[0] || {};
  const message = choice.message || {};
  const content = message.content;
  const contentText = typeof content === 'string'
    ? content
    : (Array.isArray(content) ? content.map(openRouterTextBlock).filter(Boolean).join('\n') : '');
  const legacyText = typeof choice.text === 'string' ? choice.text : '';
  const reasoning = message.reasoning ?? message.reasoning_content;
  const refusal = message.refusal;
  return {
    text: String(contentText).trim() || String(legacyText).trim(),
    finishReason: String(choice.finish_reason || choice.native_finish_reason || 'unknown').slice(0, 40),
    contentType: Array.isArray(content) ? 'array' : typeof content,
    reasoningLength: textLength(reasoning),
    refused: Boolean(typeof refusal === 'string' ? refusal.trim() : refusal),
    choiceKeys: Object.keys(choice).slice(0, 12),
    messageKeys: Object.keys(message).slice(0, 12),
  };
}

function openRouterTextBlock(block) {
  if (typeof block === 'string') return block;
  if (!block || typeof block !== 'object') return '';
  if (block.type === 'text' || block.type === 'output_text') return String(block.text || '');
  return '';
}

function textLength(value) {
  if (typeof value === 'string') return value.length;
  if (!Array.isArray(value)) return 0;
  return value.reduce((total, block) => total + openRouterTextBlock(block).length, 0);
}

function openRouterEmptyResponseError(completion, attempts) {
  const detail = [
    `finish_reason=${completion.finishReason}`,
    `content_type=${completion.contentType}`,
    `reasoning_length=${completion.reasoningLength}`,
    `refused=${completion.refused}`,
    `choice_fields=${completion.choiceKeys.join(',') || 'none'}`,
    `message_fields=${completion.messageKeys.join(',') || 'none'}`,
  ].join('; ');
  const message = completion.refused
    ? 'AI Provider 拒绝生成可用内容'
    : (attempts > 1 ? 'AI Provider 连续返回空内容' : 'AI Provider 返回空内容');
  return createAiError('AI_EMPTY_RESPONSE', `${message}（${detail}）`, { detail });
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
  const contentType = String(response.headers?.get?.('content-type') || 'unknown')
    .replace(/[^a-z0-9_+./;= -]/gi, '')
    .slice(0, 80);
  let body = '';
  try {
    body = await response.text();
    return JSON.parse(body);
  } catch (error) {
    const detail = `content_type=${contentType || 'unknown'}; body_length=${body.length}`;
    throw createAiError('AI_INVALID_RESPONSE', `AI Provider 返回了无法解析的响应（${detail}）`, {
      cause: error,
      detail,
    });
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
