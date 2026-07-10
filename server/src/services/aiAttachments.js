const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_TEXT = 10000;
const MAX_TOTAL_ATTACHMENT_TEXT = 20000;
const MAX_IMAGES = 3;
const MAX_IMAGE_DATA_URL = 900000;

const s = (v, n = 4000) => (v == null ? '' : String(v).slice(0, n));

export function cleanAiAttachments(raw) {
  const items = Array.isArray(raw) ? raw.slice(0, MAX_ATTACHMENTS) : [];
  let textBudget = MAX_TOTAL_ATTACHMENT_TEXT;
  let imageCount = 0;
  return items.map((item) => {
    const base = {
      name: s(item?.name, 160) || 'unnamed',
      type: s(item?.type, 80),
      size: Number(item?.size) || 0,
      kind: s(item?.kind, 20),
    };
    if (base.kind === 'text' && textBudget > 0) {
      const text = s(item?.textContent, Math.min(MAX_ATTACHMENT_TEXT, textBudget));
      textBudget -= text.length;
      return { ...base, textContent: text };
    }
    if (base.kind === 'image' && imageCount < MAX_IMAGES) {
      const dataUrl = s(item?.imageDataUrl, MAX_IMAGE_DATA_URL);
      if (/^data:image\/(?:jpeg|png|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(dataUrl)) {
        imageCount += 1;
        return { ...base, imageDataUrl: dataUrl.replace(/\s/g, '') };
      }
    }
    return { ...base, kind: 'unsupported' };
  });
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
