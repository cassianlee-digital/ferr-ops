// GEO（生成式引擎优化）的流量口径（纯函数，不碰数据库）。
//
// 经理 2026-10-10：「SEO 和 GEO 我们更要详细看到进展情况，而不是一无所知。」
// 能自动拿到的只有一样：访客从 AI 引擎的回答里点链接进站。GA4 的会话来源（sessionSourceMedium）里
// 能看到它的域名，按 aiEngines.js 的域名表归到各引擎。
//
// 必须写在界面上的局限：这只是「点了链接」的那部分。AI 回答里提到了我们、甚至推荐了我们，
// 但用户没点链接，流量数据里一条都不会有 —— 所以这里的数只会低估，不会高估 GEO 的实际影响。
// 被引用的情况要靠固定题库人工抽查，那是另一块（尚未建）。
import { AI_ENGINES, aiEngineOf } from './aiEngines.js';
import { leadAiEngine } from './inquirySource.js';

const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

// sources = [{ source: 'chatgpt.com / referral', sessions, users, keyEvents }]（GA4 的 source / medium 原值）
function byEngine(sources) {
  const map = new Map();
  for (const s of sources || []) {
    const engine = aiEngineOf(s.source);
    if (!engine) continue;
    if (!map.has(engine.key)) map.set(engine.key, { key: engine.key, label: engine.label, sessions: 0, users: 0, keyEvents: 0, sources: [] });
    const e = map.get(engine.key);
    e.sessions += s.sessions || 0;
    e.users += s.users || 0;
    e.keyEvents += s.keyEvents || 0;
    e.sources.push(s.source); // 原始来源值留着：归类归错了能一眼看出来
  }
  return map;
}

/* 输入：
     current / previous = { dataDays, sessions（全站）, sources }   两个等长区间
     inquiries = 区间内「表单证据」的询盘（只有它们带着可信的来路）
     leads     = 区间内的表单线索（含被忽略的）
   status：NOT_SYNCED = 区间内 GA4 一天数据都没有（此时所有数都不该显示成 0） */
export function summarizeGeo({ current, previous = null, inquiries = [], leads = [] } = {}) {
  const synced = (current?.dataDays || 0) > 0;
  const cur = byEngine(current?.sources);
  const prev = byEngine(previous?.sources);
  const prevSynced = (previous?.dataDays || 0) > 0;

  const engines = [...cur.values()]
    .map((e) => ({ ...e, keyEvents: round(e.keyEvents, 2), prevSessions: prevSynced ? (prev.get(e.key)?.sessions || 0) : null }))
    .sort((a, b) => b.sessions - a.sessions);
  // 上期有、本期没了的引擎也要列出来（0 次）：消失本身就是变化
  if (prevSynced) {
    for (const p of prev.values()) {
      if (!cur.has(p.key)) engines.push({ key: p.key, label: p.label, sessions: 0, users: 0, keyEvents: 0, sources: [], prevSessions: p.sessions });
    }
  }

  const sessions = engines.reduce((s, e) => s + e.sessions, 0);
  const prevSessions = prevSynced ? [...prev.values()].reduce((s, e) => s + e.sessions, 0) : null;
  const siteSessions = current?.sessions || 0;

  const fromAi = inquiries.map((r) => ({ row: r, engine: leadAiEngine(r) })).filter((x) => x.engine);
  const grade = (g) => fromAi.filter((x) => x.row.grade === g).length;
  const aiLeads = leads.map((l) => ({ row: l, engine: leadAiEngine(l) })).filter((x) => x.engine);

  return {
    status: synced ? 'OK' : 'NOT_SYNCED',
    data_days: current?.dataDays || 0,
    known_engines: AI_ENGINES.map((e) => e.label),
    totals: {
      sessions: synced ? sessions : null,
      site_sessions: synced ? siteSessions : null,
      share: synced && siteSessions > 0 ? round(sessions / siteSessions) : null,
      prev_sessions: prevSessions,
      key_events: synced ? round(engines.reduce((s, e) => s + e.keyEvents, 0), 2) : null,
    },
    engines: synced ? engines : [],
    // 询盘只数有表单证据的：人填的来源里没有可信的来路，数进来就是在编
    inquiries: { total: fromAi.length, a: grade('A'), b: grade('B'), c: grade('C') },
    leads: { total: aiLeads.length, ignored: aiLeads.filter((x) => x.row.state === 'ignored').length },
  };
}
