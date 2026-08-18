const EVENT_META = Object.freeze({
  form_submit: { label: '表单提交', category: 'lead' },
  generate_lead: { label: '生成线索', category: 'lead' },
  download: { label: '文件下载', category: 'download' },
  file_download: { label: '文件下载', category: 'download' },
  click_email: { label: '邮件点击', category: 'contact' },
  click_whatsapp: { label: 'WhatsApp 点击', category: 'contact' },
});

export function ga4EventMeta(eventName, keyEvents = 0) {
  const name = String(eventName || '').trim();
  const known = EVENT_META[name];
  if (known) return { name, ...known, known: true };
  return {
    name,
    label: Number(keyEvents || 0) > 0 ? '自定义关键事件' : '自定义事件',
    category: 'custom',
    known: false,
  };
}

export function isGa4ConversionCandidate(eventName, keyEvents = 0) {
  return Boolean(EVENT_META[String(eventName || '').trim()]) || Number(keyEvents || 0) > 0;
}

export const GA4_FOCUS_EVENT_NAMES = Object.freeze(Object.keys(EVENT_META));
