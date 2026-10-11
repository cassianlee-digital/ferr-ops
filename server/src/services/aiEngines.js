// AI 引擎来源识别（纯函数）。两处共用：GEO 流量拆分（GA4 的 sessionSourceMedium）、表单线索的来路判断。
//
// 只认「来源域名」这一种证据：访客从 AI 引擎的回答里点链接过来时，referrer / utm_source 是它的域名
// （ChatGPT 还会自己加 utm_source=chatgpt.com）。这只覆盖「点了链接」的那部分 ——
// AI 回答里提到了我们但没人点，流量数据里是看不到的；那部分靠固定题库人工抽查，不在这里。
//
// 加新引擎：只改下面这张表。域名用后缀匹配（chat.openai.com 命中 openai.com）。

export const AI_ENGINES = [
  { key: 'chatgpt', label: 'ChatGPT', domains: ['chatgpt.com', 'openai.com'] },
  { key: 'perplexity', label: 'Perplexity', domains: ['perplexity.ai'] },
  { key: 'gemini', label: 'Gemini', domains: ['gemini.google.com', 'bard.google.com'] },
  { key: 'copilot', label: 'Copilot', domains: ['copilot.microsoft.com'] },
  { key: 'claude', label: 'Claude', domains: ['claude.ai'] },
  { key: 'deepseek', label: 'DeepSeek', domains: ['deepseek.com'] },
  { key: 'doubao', label: '豆包', domains: ['doubao.com'] },
  { key: 'kimi', label: 'Kimi', domains: ['kimi.com', 'moonshot.cn'] },
  { key: 'you', label: 'You.com', domains: ['you.com'] },
  { key: 'poe', label: 'Poe', domains: ['poe.com'] },
  { key: 'meta', label: 'Meta AI', domains: ['meta.ai'] },
  { key: 'grok', label: 'Grok', domains: ['grok.com', 'x.ai'] },
];

// 任意写法 → 裸域名：完整网址、"chatgpt.com / referral"（GA4 的 source / medium）、带 www 的都行
export function hostOf(raw) {
  let s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  s = s.split(' / ')[0].trim();          // GA4：source / medium
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // 协议
  s = s.split(/[/?#]/)[0];               // 路径
  s = s.replace(/:\d+$/, '').replace(/^www\./, '');
  return s;
}

// 命中返回引擎对象，否则 null。后缀匹配必须卡在域名边界上：evilchatgpt.com 不算 chatgpt.com
export function aiEngineOf(raw) {
  const host = hostOf(raw);
  if (!host) return null;
  for (const e of AI_ENGINES) {
    if (e.domains.some((d) => host === d || host.endsWith('.' + d))) return e;
  }
  return null;
}

/* 看起来像 AI 引擎、但没被上面那张表认出来的来源。
   域名表是照着 GA4「来源 / 媒介」的通用写法写的，没法保证覆盖了生产里的每一种写法（比如只写了 chatgpt 没带 .com），
   也没法保证不漏新的引擎。以前靠「上线后人工逐个悬停核对」；现在让它自己报出来 —— 认不出的东西不该安静地被算成「不是 AI」。
   这是提示不是结论：命中的可能只是名字里带 ai 的普通站，所以只列出来请人看，不计入 AI 引擎的会话数。 */
const AI_HINTS = ['gpt', 'openai', 'perplex', 'gemini', 'bard', 'copilot', 'claude', 'anthropic', 'deepseek', 'doubao', 'kimi', 'moonshot',
  'grok', 'mistral', 'phind', 'qwen', 'tongyi', 'yuanbao', 'wenxin', 'yiyan', 'ernie', 'llm', 'chatbot'];
export function looksLikeAi(raw) {
  const host = hostOf(raw);
  if (!host || aiEngineOf(host) || isSearchEngine(host)) return false;
  return AI_HINTS.some((h) => host.includes(h)) || host.endsWith('.ai') || /(^|[.-])ai([.-]|$)/.test(host);
}

const SEARCH_ENGINES = ['google.', 'bing.com', 'baidu.com', 'yandex.', 'duckduckgo.com', 'yahoo.', 'sogou.com', 'so.com', 'naver.com', 'ecosia.org'];
// 传统搜索引擎（判自然搜索用）。Gemini 在 gemini.google.com，要先排除 AI 引擎再看这里。
export function isSearchEngine(raw) {
  const host = hostOf(raw);
  if (!host || aiEngineOf(host)) return false;
  return SEARCH_ENGINES.some((d) => (d.endsWith('.') ? host.startsWith(d) || host.includes('.' + d) : host === d || host.endsWith('.' + d)));
}
