// 周度审核 API：审核包（页面读它）、导出（JSON / XLSX / CSV）、AI 审核意见。三者吃同一个 buildAuditPackage。
import * as analyses from '../db/repositories/aiAnalyses.js';
import { requireAuth } from '../auth/middleware.js';
import { parseDateRange } from '../lib/parseDateRange.js';
import { callAnthropic } from '../services/anthropic.js';
import { aiErrorHttpStatus, publicAiError } from '../services/aiProvider.js';
import { AUDIT_AI_SYSTEM, auditAiPrompt, auditScopeKey, parseAuditAi } from '../services/auditAi.js';
import { auditSheets } from '../services/auditExport.js';
import { MAX_RANGE_DAYS, buildAuditPackage } from '../services/auditPackage.js';
import { PEOPLE } from '../services/auditRules.js';
import { toCsv, toXlsx } from '../services/exporters.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const PERSON_SLUG = { all: 'all', 李: 'li', 陈: 'chen' }; // 文件名只用 ASCII：中文名在 Content-Disposition 里各家浏览器处理不一

// 读并校验 区间 / 人员 / 今天。出错时已经回了 400，返回 null。
function readParams(source, reply) {
  const { range, error } = parseDateRange(source || {});
  const fail = (detail) => { reply.code(400).send({ error: 'bad_request', detail }); return null; };
  if (error) return fail(error);
  if (!range) return fail('start_date 和 end_date 必填');
  const days = Math.round((Date.parse(range.end_date) - Date.parse(range.start_date)) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) return fail(`审核区间最长 ${MAX_RANGE_DAYS} 天`);
  const person = source.person == null || source.person === '' ? 'all' : String(source.person);
  if (person !== 'all' && !PEOPLE.includes(person)) return fail('人员只能是：全部 / ' + PEOPLE.join(' / '));
  // 「今天」由前端按本地日期传（与打卡、SOP 同口径）：区间还没过完时，未来的日子不算逾期也不算漏做
  const today = DATE_RE.test(String(source.today || '')) ? String(source.today) : null;
  return { range, person, today };
}

function aiView(item) {
  if (!item) return null;
  return { id: item.id, text: item.result_text, parsed: parseAuditAi(item.result_text), updated_at: item.updated_at, history: (item.history || []).length };
}

export async function auditRoutes(app) {
  app.get('/api/audit/weekly', { preHandler: requireAuth }, async (request, reply) => {
    const p = readParams(request.query, reply);
    if (!p) return reply;
    return buildAuditPackage(p);
  });

  /* 导出。format=json 是整个审核包；xlsx 是所有表各一个工作表；csv 一次一张表（?section=，CSV 装不下多张表）。
     导出的就是页面上那份数据，不另算。 */
  app.get('/api/audit/weekly/export', { preHandler: requireAuth }, async (request, reply) => {
    const p = readParams(request.query, reply);
    if (!p) return reply;
    const format = String(request.query?.format || 'xlsx');
    const pkg = buildAuditPackage(p);
    const base = `ferr-audit-${p.range.start_date}_${p.range.end_date}-${PERSON_SLUG[p.person]}`;
    const send = (type, ext, body) => reply
      .header('Content-Type', type)
      .header('Content-Disposition', `attachment; filename="${base}${ext}"`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'no-store')
      .send(body);

    if (format === 'json') return send('application/json; charset=utf-8', '.json', JSON.stringify(pkg, null, 2));
    const sheets = auditSheets(pkg);
    if (format === 'xlsx') return send('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx', toXlsx(sheets));
    if (format === 'csv') {
      const sheet = sheets.find((s) => s.key === request.query?.section);
      if (!sheet) return reply.code(400).send({ error: 'bad_section', detail: 'CSV 一次导一张表，section 可选：' + sheets.map((s) => s.key).join(' / ') });
      return send('text/csv; charset=utf-8', `-${sheet.key}.csv`, toCsv(sheet.rows, sheet.columns));
    }
    return reply.code(400).send({ error: 'bad_format', detail: 'format 只支持 json / xlsx / csv' });
  });

  // 已有的 AI 审核意见（没跑过就是 null）
  app.get('/api/audit/weekly/ai', { preHandler: requireAuth }, async (request, reply) => {
    const p = readParams(request.query, reply);
    if (!p) return reply;
    return { item: aiView(analyses.getByScope(auditScopeKey(p.range, p.person))) };
  });

  /* 跑一次 AI 审核。AI 只读审核包（确定性算好的事实），输出约定的 JSON 结构；重跑时旧意见进历史不丢。
     AI 不可用时如实回失败原因 —— 审核页本身不依赖它。 */
  app.post('/api/audit/weekly/ai', { preHandler: requireAuth }, async (request, reply) => {
    const p = readParams(request.body, reply);
    if (!p) return reply;
    const pkg = buildAuditPackage(p);
    const prompt = auditAiPrompt(pkg);
    let text;
    try {
      text = await callAnthropic(AUDIT_AI_SYSTEM, prompt);
    } catch (e) {
      request.log.error({ err: e.message, status: e.status, code: e.code }, 'weekly audit ai failed');
      return reply.code(aiErrorHttpStatus(e)).send(publicAiError(e));
    }
    const scopeKey = auditScopeKey(p.range, p.person);
    const messages = [{ role: 'assistant', content: text, at: new Date().toISOString() }];
    const old = analyses.getByScope(scopeKey);
    const context = { range: p.range, person: p.person, generated_at: pkg.meta.generated_at };
    const item = old
      ? analyses.replaceResult(old.id, { result_text: text, messages, context, quality: null })
      : analyses.create({
        scope_key: scopeKey, scope_type: 'weekly_audit',
        title: `周度审核 ${p.range.start_date} ~ ${p.range.end_date} · ${p.person === 'all' ? '全部' : p.person}`,
        // 库里只留一句说明，不把整包数据再存一遍（它随时能按区间重新生成）
        prompt: `周度审核（${p.range.start_date} ~ ${p.range.end_date}，${p.person}）`,
        context, result_text: text, messages,
      });
    return { item: aiView(item) };
  });
}
