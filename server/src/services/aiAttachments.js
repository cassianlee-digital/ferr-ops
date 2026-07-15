import { MAX_TOTAL_DOCUMENT_BYTES, parseDocumentAttachment } from './documentParser.js';

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_TEXT = 10000;
const MAX_TOTAL_ATTACHMENT_TEXT = 20000;
const MAX_IMAGES = 3;
const MAX_IMAGE_DATA_URL = 900000;

const s = (v, n = 4000) => (v == null ? '' : String(v).slice(0, n));

export async function cleanAiAttachments(raw) {
  const items = Array.isArray(raw) ? raw.slice(0, MAX_ATTACHMENTS) : [];
  let textBudget = MAX_TOTAL_ATTACHMENT_TEXT;
  let documentBudget = MAX_TOTAL_DOCUMENT_BYTES;
  let imageCount = 0;
  const result = [];
  for (const item of items) {
    const base = {
      name: s(item?.name, 160) || 'unnamed',
      type: s(item?.type, 80),
      size: Number(item?.size) || 0,
      kind: s(item?.kind, 20),
    };
    if (base.kind === 'text' && textBudget > 0) {
      const text = s(item?.textContent, Math.min(MAX_ATTACHMENT_TEXT, textBudget));
      textBudget -= text.length;
      result.push({ ...base, textContent: text });
      continue;
    }
    if (base.kind === 'image' && imageCount < MAX_IMAGES) {
      const dataUrl = s(item?.imageDataUrl, MAX_IMAGE_DATA_URL);
      if (/^data:image\/(?:jpeg|png|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(dataUrl)) {
        imageCount += 1;
        result.push({ ...base, imageDataUrl: dataUrl.replace(/\s/g, '') });
        continue;
      }
    }
    if (base.kind === 'document') {
      const encoded = String(item?.fileDataBase64 || '').replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
      const estimatedBytes = encoded ? Math.floor((encoded.length * 3) / 4) : 0;
      if (!estimatedBytes || estimatedBytes > documentBudget) {
        result.push({ ...base, kind: 'unsupported', parseError: 'document_total_too_large' });
        continue;
      }
      try {
        const parsed = await parseDocumentAttachment(item);
        documentBudget -= estimatedBytes;
        const text = textBudget > 0 ? parsed.textContent.slice(0, Math.min(MAX_ATTACHMENT_TEXT, textBudget)) : '';
        textBudget -= text.length;
        result.push({ ...base, kind: 'text', sourceKind: parsed.format, textContent: text });
        continue;
      } catch (error) {
        result.push({ ...base, kind: 'unsupported', parseError: error.message || 'document_parse_failed' });
        continue;
      }
    }
    result.push({ ...base, kind: 'unsupported' });
  }
  return result;
}

export function attachmentPromptBlock(attachments) {
  const safe = Array.isArray(attachments) ? attachments : [];
  if (!safe.length) return '';
  const lines = ['[上传附件：服务端校验后可用内容]'];
  safe.forEach((item) => {
    lines.push(`- ${item.name} (${item.kind || 'unknown'}; ${item.type || 'unknown'}; ${item.size || 0} bytes)`);
    if (item.kind === 'text' && item.textContent) {
      lines.push('  内容摘录：');
      lines.push(item.textContent);
    } else if (item.kind === 'image' && item.imageDataUrl) {
      lines.push('  图片已作为视觉输入发送给模型；只有在模型实际支持图片时才能引用图片内容。');
    } else {
      lines.push('  该附件未解析，不能作为证据。');
    }
  });
  return '\n\n' + lines.join('\n');
}
