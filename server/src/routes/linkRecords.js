// 外链记录 API：校验付费/免费登记字段、人员与归属站点目录。
import * as repo from '../db/repositories/linkRecords.js';
import { requireAuth, editor } from '../auth/middleware.js';
import { parseDateRange } from '../lib/parseDateRange.js';

const CATEGORIES = ['行业目录', '客座投稿', '新闻媒体', '博客文章', '论坛社区', '问答平台', '资源页', '合作伙伴', '社交媒体', '其他'];
const SITES = ['贝孚特-阀门', '贝孚特-管件', '贝孚特-管件-西语', '费尔瑞铸造', '电力金具', '费尔瑞铸造-西语'];
const PEOPLE = ['李', '陈', '赵', '孟'];
const str = (x) => typeof x === 'string' ? x.trim() : '';
function validate(body, kind) {
  const row = { kind, added_date: str(body?.added_date), site_name: str(body?.site_name), category: str(body?.category), link_form: str(body?.link_form), link_url: str(body?.link_url), anchor_text: str(body?.anchor_text), owner_site: str(body?.owner_site), registrant: str(body?.registrant), fee_record: kind === 'paid' ? str(body?.fee_record) : null, credential_record: kind === 'free' ? str(body?.credential_record) : null };
  const day = new Date(`${row.added_date}T00:00:00Z`);
  let parsedUrl; try { parsedUrl = new URL(row.link_url); } catch {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.added_date) || Number.isNaN(day.valueOf()) || day.toISOString().slice(0,10)!==row.added_date || !row.site_name || !CATEGORIES.includes(row.category) || !parsedUrl || !['http:','https:'].includes(parsedUrl.protocol) || !SITES.includes(row.owner_site) || !PEOPLE.includes(row.registrant)) return '请完整填写日期、站点名称、有效分类、HTTP(S) 链接、归属站点和登记人';
  if (row.link_url.length > 2000 || row.site_name.length > 200 || row.anchor_text.length > 500 || row.link_form.length > 100 || (row.fee_record || '').length > 1000 || (row.credential_record || '').length > 2000) return '字段长度超出限制';
  return row;
}
export async function linkRecordsRoutes(app) {
  app.get('/api/link-records/options', { preHandler: requireAuth }, async () => ({ categories: CATEGORIES, sites: SITES, registrants: PEOPLE }));
  app.get('/api/link-records', { preHandler: requireAuth }, async (req, reply) => {
    const kind = req.query?.kind;
    if (!['paid', 'free'].includes(kind)) return reply.code(400).send({ error: 'bad_kind' });
    const parsed = parseDateRange(req.query);
    if (parsed.error) return reply.code(400).send({ error: 'bad_date_range', detail: parsed.error });
    return { items: repo.list({ kind, ...(parsed.range || {}) }) };
  });
  app.get('/api/link-records/:id/credentials', { preHandler: requireAuth }, async (req, reply) => {
    const item=repo.get(Number(req.params.id));
    if (!item || item.kind!=='free') return reply.code(404).send({error:'not_found'});
    return { credential_record:item.credential_record };
  });
  app.post('/api/link-records', editor, async (req, reply) => {
    const kind = req.body?.kind;
    if (!['paid', 'free'].includes(kind)) return reply.code(400).send({ error: 'bad_kind' });
    const row = validate(req.body, kind);
    if (typeof row === 'string') return reply.code(400).send({ error: 'bad_field', detail: row });
    reply.code(201); return { item: repo.create(row, req.user?.id) };
  });
  app.patch('/api/link-records/:id', editor, async (req, reply) => {
    const current = repo.get(Number(req.params.id));
    if (!current) return reply.code(404).send({ error: 'not_found' });
    const row = validate({ ...current, ...req.body, kind: current.kind }, current.kind);
    if (typeof row === 'string') return reply.code(400).send({ error: 'bad_field', detail: row });
    return { item: repo.update(current.id, row) };
  });
  app.delete('/api/link-records/:id', editor, async (req, reply) => repo.remove(Number(req.params.id), req.user?.id) ? { ok: true } : reply.code(404).send({ error: 'not_found' }));
}
