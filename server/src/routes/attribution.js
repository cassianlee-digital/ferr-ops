// 询盘归因：把真实询盘(按渠道)与 Ads 花费打通，算「真实每有效询盘成本」+ 对比 Ads 自报转化。
import { requireAuth } from '../auth/middleware.js';
import * as inq from '../db/repositories/inquiries.js';
import { adsSummary } from '../db/repositories/googleSync.js';
import { normalizeRange, resolveProject } from '../sync/googleClient.js';

// 与前端 renderInqDonuts 同口径：channel 文案 → 规范渠道
function classify(ch) {
  const c = String(ch || '').trim();
  if (/SEO自然|SEO/i.test(c)) return 'SEO';
  if (/SEM付费|SEM/i.test(c)) return 'SEM';
  if (/直接/.test(c)) return 'direct';
  return 'other';
}

export async function attributionRoutes(app) {
  app.get('/api/attribution', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const project = resolveProject(request.query || {});
      const range = normalizeRange(request.query || {});
      const rows = inq.list({ start_date: range.start_date, end_date: range.end_date });

      const mk = () => ({ total: 0, effective: 0, a: 0 });
      const channels = { SEO: mk(), SEM: mk(), direct: mk(), other: mk() };
      for (const r of rows) {
        const k = classify(r.channel);
        channels[k].total++;
        if (r.grade === 'A' || r.grade === 'B') channels[k].effective++;
        if (r.grade === 'A') channels[k].a++;
      }

      const ads = adsSummary({ ...range, ads_customer_id: project.ads_customer_id });
      const costMicros = ads.totals ? ads.totals.costMicros || 0 : 0;
      const conversions = ads.totals ? ads.totals.conversions || 0 : 0;
      const sem = channels.SEM;
      const cost = costMicros / 1e6;

      return {
        range,
        channels,
        totals: { total: rows.length, effective: Object.values(channels).reduce((s, c) => s + c.effective, 0) },
        sem: {
          costMicros,
          adsConversions: conversions,           // Ads 自报转化（可能与真实询盘不一致）
          inquiriesTotal: sem.total,
          inquiriesEffective: sem.effective,
          inquiriesA: sem.a,
          costPerEffective: sem.effective > 0 ? cost / sem.effective : null,
          costPerA: sem.a > 0 ? cost / sem.a : null,
        },
      };
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'bad_request' });
    }
  });
}
