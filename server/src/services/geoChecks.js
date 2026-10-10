// GEO 引用抽查的规则（纯函数，不碰数据库）。
//
// 流量数据只看得到「从 AI 回答里点链接进站」的访问；AI 回答里有没有提到我们、有没有引用我们的页面，
// 没有任何接口能自动拿到，只能人去问、去看。为了让这种人工抽查前后可比，定三条死规矩：
//   1. 固定题库：每一轮问的是同一批问题。问题的文字不能改（改了就不是同一个问题了），只能停用后另加一条；
//   2. 固定引擎：每一轮查的是同一批引擎（下面这张表）。改这张表会让之前的轮次失去可比性，要改得是有意的决定；
//   3. 要有截图：没截图的记录只是一句话。不拦着保存（先记下再补图是正常流程），但汇总里单独数出来。
import { AI_ENGINES } from './aiEngines.js';

// 抽查的引擎。海外 B2B 采购最常用的几个；键与 aiEngines.js 一致，标签从那里取，不各写一份。
export const CHECK_ENGINE_KEYS = ['chatgpt', 'perplexity', 'gemini', 'copilot'];
export const CHECK_ENGINES = CHECK_ENGINE_KEYS.map((k) => {
  const e = AI_ENGINES.find((x) => x.key === k);
  return { key: k, label: e ? e.label : k };
});
export const MAX_ACTIVE_QUESTIONS = 30; // 题库再大就没人能每两周查完一遍了
export const ROUND_INTERVAL_DAYS = 14;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (detail) => ({ ok: false, detail });
const flag = (v) => v === true || v === 1 || v === '1';

function httpUrl(raw) {
  try { const u = new URL(String(raw)); return u.protocol === 'http:' || u.protocol === 'https:' ? u : null; }
  catch (e) { return null; }
}

export function validateQuestion(body) {
  const q = typeof body?.question === 'string' ? body.question.trim().replace(/\s+/g, ' ') : '';
  if (q.length < 6) return fail('问题太短：要写成客户真会拿去问 AI 的一句完整的话');
  if (q.length > 300) return fail('问题太长（最多 300 字）');
  return { ok: true, value: { question: q } };
}

/* 一条抽查记录：某一轮（round_date）里，某个问题在某个引擎上的结果。
   mentioned = 回答里提到了我们的品牌 / 公司；cited = 回答引用或链接了我们的页面。两者互不包含：
   可能提了品牌但链接给的是别人的页面，也可能引用了我们的文章却没提品牌名。 */
export function validateCheck(body) {
  if (!body || typeof body !== 'object') return fail('请求内容不合法');
  const questionId = Number(body.question_id);
  if (!Number.isInteger(questionId) || questionId <= 0) return fail('缺少问题');
  if (!CHECK_ENGINE_KEYS.includes(body.engine)) return fail('引擎只能是：' + CHECK_ENGINES.map((e) => e.label).join(' / '));
  const round = body.round_date;
  if (typeof round !== 'string' || !DATE_RE.test(round) || Number.isNaN(Date.parse(round + 'T00:00:00Z'))) return fail('抽查日期需要是 YYYY-MM-DD');
  const cited = flag(body.cited);
  let citedUrl = body.cited_url == null ? '' : String(body.cited_url).trim();
  if (citedUrl && (citedUrl.length > 500 || !httpUrl(citedUrl))) return fail('被引用的页面要填完整网址（http/https 开头）');
  if (!cited) citedUrl = ''; // 没被引用就没有「被引用的页面」，免得留下一个对不上的网址
  const note = body.note == null ? '' : String(body.note).trim().slice(0, 1000);
  return {
    ok: true,
    value: { question_id: questionId, engine: body.engine, round_date: round, mentioned: flag(body.mentioned) ? 1 : 0, cited: cited ? 1 : 0, cited_url: citedUrl || null, note: note || null },
  };
}

/* 一轮的汇总。questionCount = 这一轮应该查的题数（当前启用的题）；checks = 这一轮已有的记录（带 images 数）。
   分母用「已查的」而不是「应查的」来算提及率，同时把「还有几格没查」报出来 ——
   没查的格子既不能算没提到，也不能悄悄不提。 */
export function summarizeRound(questionCount, checks) {
  const engines = CHECK_ENGINES.map((e) => {
    const rows = checks.filter((c) => c.engine === e.key);
    return {
      key: e.key, label: e.label,
      checked: rows.length,
      expected: questionCount,
      mentioned: rows.filter((c) => c.mentioned).length,
      cited: rows.filter((c) => c.cited).length,
      no_screenshot: rows.filter((c) => !(c.images > 0)).length,
    };
  });
  const sum = (k) => engines.reduce((s, e) => s + e[k], 0);
  return {
    engines,
    totals: { checked: sum('checked'), expected: questionCount * CHECK_ENGINES.length, mentioned: sum('mentioned'), cited: sum('cited'), no_screenshot: sum('no_screenshot') },
  };
}
