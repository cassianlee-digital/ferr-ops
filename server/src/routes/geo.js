// GEO 概览 API：AI 引擎带来的流量与询盘。只读已同步的 GA4 数据和带表单证据的询盘。
import * as repo from '../db/repositories/geo.js';
import * as checksRepo from '../db/repositories/geoChecks.js';
import * as attachmentsRepo from '../db/repositories/attachments.js';
import { requireAuth, editor } from '../auth/middleware.js';
import {
  CHECK_ENGINES, MAX_ACTIVE_QUESTIONS, ROUND_INTERVAL_DAYS, summarizeRound, validateCheck, validateQuestion,
} from '../services/geoChecks.js';
import { parseDateRange, previousRange } from '../lib/parseDateRange.js';
import { resolveProject } from '../sync/googleClient.js';
import { summarizeGeo } from '../services/geo.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const bad = (reply, error, detail) => reply.code(400).send({ error, detail });

// 一轮抽查的汇总（没有这一轮就是 null）。总览卡和抽查页共用。
function roundSummary(roundDate) {
  if (!roundDate) return null;
  return { round_date: roundDate, ...summarizeRound(checksRepo.activeQuestionCount(), checksRepo.listRound(roundDate)) };
}

export async function geoRoutes(app) {
  /* ===== 引用抽查：固定题库 ===== */
  app.get('/api/geo/questions', { preHandler: requireAuth }, async () => ({
    items: checksRepo.listQuestions(), max_active: MAX_ACTIVE_QUESTIONS,
  }));

  app.post('/api/geo/questions', editor, async (request, reply) => {
    const v = validateQuestion(request.body);
    if (!v.ok) return bad(reply, 'bad_question', v.detail);
    if (checksRepo.findQuestion(v.value.question)) return reply.code(409).send({ error: 'duplicate_question', detail: '题库里已经有这个问题了（停用的也算；要重新启用请点「启用」）' });
    if (checksRepo.activeQuestionCount() >= MAX_ACTIVE_QUESTIONS) {
      return reply.code(409).send({ error: 'too_many_questions', detail: `启用中的问题最多 ${MAX_ACTIVE_QUESTIONS} 个，先停用不再需要的` });
    }
    reply.code(201);
    return { item: checksRepo.createQuestion(v.value.question, request.user?.id) };
  });

  // 只能启用 / 停用，不能改问题的文字（改了就不是同一个问题，之前各轮的结果会对不上）
  app.patch('/api/geo/questions/:id', editor, async (request, reply) => {
    const id = Number(request.params.id);
    const cur = checksRepo.getQuestion(id);
    if (!cur) return reply.code(404).send({ error: 'not_found' });
    if (typeof request.body?.active !== 'boolean') return bad(reply, 'bad_field', '只能启用或停用；要换问题请停用后另加一条');
    if (request.body.active && !cur.active && checksRepo.activeQuestionCount() >= MAX_ACTIVE_QUESTIONS) {
      return reply.code(409).send({ error: 'too_many_questions', detail: `启用中的问题最多 ${MAX_ACTIVE_QUESTIONS} 个` });
    }
    return { item: checksRepo.setQuestionActive(id, request.body.active) };
  });

  /* ===== 引用抽查：某一轮的记录 ===== */
  app.get('/api/geo/checks', { preHandler: requireAuth }, async (request, reply) => {
    const round = request.query?.round_date;
    if (typeof round !== 'string' || !DATE_RE.test(round)) return bad(reply, 'bad_date', 'round_date 需要是 YYYY-MM-DD');
    const checks = checksRepo.listRound(round);
    const images = attachmentsRepo.metaByOwners('geo_check', checks.map((c) => c.id));
    const prev = checksRepo.previousRound(round);
    return {
      round_date: round,
      engines: CHECK_ENGINES,
      interval_days: ROUND_INTERVAL_DAYS,
      rounds: checksRepo.rounds(),
      items: checks.map((c) => ({ ...c, evidence_images: images[c.id] || [] })),
      summary: summarizeRound(checksRepo.activeQuestionCount(), checks),
      previous: roundSummary(prev),
    };
  });

  app.put('/api/geo/checks', editor, async (request, reply) => {
    const v = validateCheck(request.body);
    if (!v.ok) return bad(reply, 'bad_check', v.detail);
    if (!checksRepo.getQuestion(v.value.question_id)) return reply.code(404).send({ error: 'question_not_found' });
    const item = checksRepo.upsertCheck(v.value, request.user?.id);
    return { item: { ...item, evidence_images: attachmentsRepo.listByOwner('geo_check', item.id) } };
  });

  app.delete('/api/geo/checks/:id', editor, async (request, reply) => {
    const id = Number(request.params.id);
    if (!checksRepo.getCheck(id)) return reply.code(404).send({ error: 'not_found' });
    checksRepo.removeCheck(id);
    attachmentsRepo.removeByOwner('geo_check', id); // 记录没了，截图留着就是孤儿
    return { ok: true };
  });

  app.get('/api/geo/summary', { preHandler: requireAuth }, async (request, reply) => {
    const { range, error } = parseDateRange(request.query || {});
    if (error) return reply.code(400).send({ error: 'bad_date_range', detail: error });
    if (!range) return reply.code(400).send({ error: 'bad_date_range', detail: 'start_date 和 end_date 必填' });
    let propertyId = null;
    try { propertyId = resolveProject(request.query || {}).ga4_property_id || null; } catch (e) { propertyId = null; }
    const prev = previousRange(range);
    // 引用抽查：取区间结束日（含）之前最近的一轮，及它的上一轮。没查过就是 null，不是 0。
    const round = checksRepo.latestRoundOnOrBefore(range.end_date);
    return {
      range,
      previous_range: prev,
      citations: roundSummary(round),
      citations_previous: roundSummary(round && checksRepo.previousRound(round)),
      ...summarizeGeo({
        current: repo.ga4Sources(range, propertyId),
        previous: repo.ga4Sources(prev, propertyId),
        inquiries: repo.formInquiries(range),
        leads: repo.leads(range),
      }),
    };
  });
}
