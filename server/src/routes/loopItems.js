// 闭环条目 API（FR-10）：月度计划/测试登记/沉淀表/任务看板 + 归档地基（state/archived/deleted）。写入限李/陈。
import * as repo from '../db/repositories/loopItems.js';
import * as fixesRepo from '../db/repositories/fixes.js';
import * as taskLinksRepo from '../db/repositories/taskLinks.js';
import * as attachmentsRepo from '../db/repositories/attachments.js';
import * as changesRepo from '../db/repositories/loopItemChanges.js';
import { isIsoDate } from '../lib/parseDateRange.js';
import { requireAuth, editor } from '../auth/middleware.js';
import {
  CHANGE_LABEL, TASK_KPIS, completionMissing, gateDetail, importance, isDone, normalizeEvidence, normalizeLinks, taskChanges,
} from '../services/taskAudit.js';
import {
  TASK_ATTACHMENT_OWNER, decorateTask, decorateTasks, evidenceImageCount, spendTaskIds,
} from '../services/taskAuditData.js';
import { DEFAULT_EFFECT_DAYS, EFFECT_DAYS } from '../services/taskEffect.js';
import { buildTaskEffect } from '../services/taskEffectData.js';

const KINDS = ['plan', 'test', 'deposit', 'task'];
const ARCHIVE_KINDS = ['sem', 'seo', 'company'];
const s = (v, n = 400) => (v == null ? null : String(v).slice(0, n));
const truthy = (v) => v === 1 || v === '1' || v === true;
const isManager = (request) => ['manager', 'boss'].includes(request.user?.role);

// 审计字段的长度上限（文本）。超长截断而不是报错：这些是人写的说明，截断不影响判定。
const AUDIT_TEXT = { project: 60, result: 2000, task_actions: 2000 };

function resolveView(q) {
  if (q?.archived === '1' || q?.view === 'archived') return 'archived';
  if (q?.deleted === '1' || q?.view === 'deleted') return 'deleted';
  if (q?.view === 'all') return 'all';
  return 'active'; // 默认排除 archived/deleted
}

const bad = (reply, error, detail, extra) => reply.code(400).send({ error, detail, ...extra });

// 工时：空 = 没填（null）；否则必须是 0~9999 的数字。返回 undefined 表示不合法。
function hours(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 9999 ? n : undefined;
}

/* 归一并校验任务的审计字段（就地改 body）。出错时已经回了响应，返回 false。
   必须在完成门槛之前跑：门槛要拿归一后的 result / evidence 去判，
   而一个对象类型的 result 会让 .trim() 直接抛 500，把客户端传错类型伪装成服务端故障。 */
function normalizeAuditFields(body, reply) {
  for (const [k, max] of Object.entries(AUDIT_TEXT)) {
    if (!(k in body) || body[k] == null) continue;
    if (typeof body[k] !== 'string') { bad(reply, 'bad_field', `字段 ${k} 需要字符串`); return false; }
    body[k] = body[k].trim().slice(0, max) || null;
  }
  for (const k of ['est_hours', 'actual_hours']) {
    if (!(k in body)) continue;
    const h = hours(body[k]);
    if (h === undefined) { bad(reply, 'bad_hours', '工时需要是 0~9999 之间的数字（小时）'); return false; }
    body[k] = h;
  }
  if ('evidence' in body) {
    const ev = normalizeEvidence(body.evidence);
    if (!ev.ok) { bad(reply, 'bad_evidence', ev.detail); return false; }
    body.evidence = ev.value;
  }
  return true;
}

/* 任务的三个日期：空 = 没填（null），否则必须是真实存在的 YYYY-MM-DD（就地归一 body）。
   以前什么字符串都收 —— 一个写成 10/12 的截止日比不过任何区间，这条任务就既不逾期也不在做，从周度审核里凭空消失。
   merged = 更新后的样子（新建时就是 body 自己）：请求动了起止日，才检查「开始日不晚于截止日」，老数据不追溯。 */
const TASK_DATE_FIELDS = { task_date: '截止日', start_date: '开始日', task_verify_date: '验证日' };
function normalizeTaskDates(body, reply, merged = body) {
  for (const [k, label] of Object.entries(TASK_DATE_FIELDS)) {
    if (!(k in body)) continue;
    if (body[k] == null || body[k] === '') { body[k] = null; continue; }
    if (!isIsoDate(body[k])) { bad(reply, 'invalid_date', `${label}要写成 YYYY-MM-DD`); return false; }
  }
  if ('task_date' in body || 'start_date' in body) {
    const start = 'start_date' in body ? body.start_date : merged.start_date;
    const due = 'task_date' in body ? body.task_date : merged.task_date;
    if (start && due && start > due) { bad(reply, 'bad_date_range', '开始日不能晚于截止日'); return false; }
  }
  return true;
}

// links 不是 loop_items 的列，单独校验后整组替换。没传 = 不动；返回 false = 已回 400。
function readLinks(body, reply) {
  if (!('links' in body)) return null;
  const r = normalizeLinks(body.links, { campaigns: taskLinksRepo.campaignNames() });
  if (!r.ok) { bad(reply, 'bad_links', r.detail); return false; }
  return r.links;
}

export async function loopItemsRoutes(app) {
  app.get('/api/loop-items', { preHandler: requireAuth }, async (request) => {
    const kind = request.query?.kind;
    const onlyUrgent = request.query?.urgent === '1';
    const all = repo.list(KINDS.includes(kind) ? kind : undefined, { view: resolveView(request.query) });
    return { items: decorateTasks(onlyUrgent ? all.filter((r) => r.urgent === 1) : all) };
  });

  // 任务弹框「关联对象」的候选：已同步数据里真实出现过的页面 / 系列 / 关键词 + 可选 KPI
  app.get('/api/loop-items/link-options', { preHandler: requireAuth }, async () => ({
    ...taskLinksRepo.options(),
    kpis: TASK_KPIS,
  }));

  // 任务完成前后的数据对比：按它关联的页面 / 系列 / 关键词，取完成日前后各 N 天的同步数据。
  // 只读、现算，不落库 —— 同步数据会补齐（GSC 有延迟），今天算的「数据未满」过几天就该变成完整窗口。
  app.get('/api/loop-items/:id/effect', { preHandler: requireAuth }, async (request, reply) => {
    const id = Number(request.params.id);
    const task = repo.get(id);
    if (!task || task.kind !== 'task') return reply.code(404).send({ error: 'not_found' });
    const days = request.query?.days == null ? DEFAULT_EFFECT_DAYS : Number(request.query.days);
    if (!EFFECT_DAYS.includes(days)) return bad(reply, 'bad_days', `对比窗口只支持 ${EFFECT_DAYS.join(' / ')} 天`);
    return buildTaskEffect(task, taskLinksRepo.byItems([id])[id] || [], days);
  });

  app.post('/api/loop-items', editor, async (request, reply) => {
    const b = { ...(request.body || {}) };
    if (!KINDS.includes(b.kind)) return reply.code(400).send({ error: 'bad_kind' });
    const isTask = b.kind === 'task';
    // 任务不能「生来就是完成的」：那等于绕过完成门槛（不写结果、不交证据）
    if (isTask && b.status === 'done') {
      return bad(reply, 'create_done_forbidden', '任务要先建出来再勾完成（完成时需要填写结果）');
    }
    let links = null;
    if (isTask) {
      if (!normalizeAuditFields(b, reply)) return reply;
      if (!normalizeTaskDates(b, reply)) return reply;
      links = readLinks(b, reply);
      if (links === false) return reply;
    }
    const item = repo.create({
      kind: b.kind,
      dept: s(b.dept, 10),
      content: s(b.content, 400) || '',
      owner: s(b.owner, 20),
      status: s(b.status, 20) || '',
      task_date: s(b.task_date, 20),
      start_date: s(b.start_date, 20),
      task_hour: s(b.task_hour, 10),
      note: s(b.note, 400),
      urgent: truthy(b.urgent) ? 1 : null,
      parent_id: Number.isFinite(Number(b.parent_id)) && Number(b.parent_id) > 0 ? Number(b.parent_id) : null,
      task_why: s(b.task_why, 400),
      task_done_when: s(b.task_done_when, 400),
      task_verify_date: s(b.task_verify_date, 20),
      task_verify_how: s(b.task_verify_how, 400),
      project: isTask ? b.project ?? null : null,
      est_hours: isTask ? b.est_hours ?? null : null,
      important: isTask && truthy(b.important) ? 1 : null,
    });
    if (links && links.length) taskLinksRepo.replace(item.id, links);
    reply.code(201);
    return { item: decorateTask(item) };
  });

  // 回写：任务勾完 → 它出身的那条整改项自动变「已改」，撤销则回「进行中」。
  // 闭环的最后一步；靠人去整改清单里手动改状态，那条状态就永远是脏的。
  app.patch('/api/loop-items/:id', editor, async (request, reply) => {
    const id = Number(request.params.id);
    const body = { ...(request.body || {}) };
    const cur = repo.get(id);
    if (!cur) return reply.code(404).send({ error: 'not_found' });

    let links = null;
    let changes = [];
    if (cur.kind === 'task') {
      if (!normalizeAuditFields(body, reply)) return reply;
      if (!normalizeTaskDates(body, reply, cur)) return reply;
      if ('important' in body) {
        const want = truthy(body.important) ? 1 : null;
        // 「重要」可以谁都加，但只有经理/老板能摘：否则被要求交证据的人自己把标记去掉就行了
        if (want === null && Number(cur.important) === 1 && !isManager(request)) {
          return reply.code(403).send({ error: 'important_locked', detail: '「重要」标记只能由经理或老板取消' });
        }
        body.important = want;
      }
      links = readLinks(body, reply);
      if (links === false) return reply;

      /* 完成门槛：所有任务必须写完成结果；重要任务还必须有证据（链接或截图）。
         判的是「更新之后的样子」。除了「未完成→完成」这一下，已完成的任务再改 result / evidence 也要过，
         否则先随便填一句勾完成、再把它清空，门槛就形同虚设。
         老的已完成任务（门槛上线前勾的，没有结果）改别的字段不受影响 —— 不追溯。 */
      const next = { ...cur };
      for (const k of repo.UPDATABLE) if (k in body) next[k] = body[k];
      /* 改动留痕（规则见 taskAudit.taskChanges）。其中一项特别：执行人把跨天任务改成单日 → 记一个「曾经跨天」的记号，
         这条任务照旧按重要任务要证据（以前改一下日期就躲过去了）。经理 / 老板改的不记，那是重新定范围。 */
      changes = taskChanges(cur, next);
      if (isManager(request)) changes = changes.filter((c) => c.field !== 'multi_day');
      const wasMultiDay = changes.some((c) => c.field === 'multi_day') || changesRepo.shortenedIds([id]).has(id);
      if (isDone(next) && (!isDone(cur) || 'result' in body || 'evidence' in body)) {
        const imp = importance(next, { spend: spendTaskIds().has(id), wasMultiDay });
        const missing = completionMissing(next, { important: imp.important, attachments: evidenceImageCount(id) });
        if (missing.length) {
          return bad(reply, 'completion_incomplete', gateDetail(missing), { missing, important_reasons: imp.reasons });
        }
      }
    }

    let item = repo.updateWithLog(id, body, changes, request.user?.id);
    if (links) taskLinksRepo.replace(id, links);
    if (item && ('state' in body || 'status' in body)) {
      item = repo.stampDone(id, isDone(item)); // 记完成时刻，日计划回放要用
    }
    if (item && item.fix_id && ('state' in body || 'status' in body)) {
      const fix = fixesRepo.get(item.fix_id);
      // 已归档/已放弃的整改项不被任务状态牵着走
      if (fix && fix.state !== 'archived' && fix.state !== 'deleted' && fix.status !== '放弃') {
        const nextStatus = isDone(item) ? '已改' : '进行中';
        if (fix.status !== nextStatus) fixesRepo.update(fix.id, { status: nextStatus });
      }
    }
    return { item: decorateTask(item) };
  });

  // 这条任务被改过什么：谁、什么时候、从什么改成什么
  app.get('/api/loop-items/:id/changes', { preHandler: requireAuth }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!repo.get(id)) return reply.code(404).send({ error: 'not_found' });
    return { items: changesRepo.byItem(id).map((c) => ({ ...c, label: CHANGE_LABEL[c.field] || c.field })) };
  });

  // 归档：服务端打时间戳、推导 archive_kind；幂等。前端调这个最稳。
  app.post('/api/loop-items/:id/archive', editor, async (request, reply) => {
    const id = Number(request.params.id);
    const ak = s(request.body?.archive_kind, 20);
    const kind = ARCHIVE_KINDS.includes(ak) ? ak : null;
    /* 测试登记的门槛：没写结论不能归档。测试的全部价值就是那句结论 —— 归档时没有它，
       这条记录以后只说明「试过」，说明不了「试出了什么」。放弃的测试同样要写（写明为什么放弃）。
       已经归档的不受影响（归档是幂等的，老数据不追溯）。 */
    const cur = repo.get(id);
    if (cur && cur.kind === 'test' && cur.state !== 'archived' && !String(cur.conclusion || '').trim()) {
      return bad(reply, 'conclusion_required', '测试要先写结论再归档；放弃的测试也请写明为什么放弃');
    }
    const item = repo.archive(id, kind);
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { item };
  });

  // 恢复：archived → todo
  app.post('/api/loop-items/:id/restore', editor, async (request, reply) => {
    const item = repo.restore(Number(request.params.id));
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return { item };
  });

  // DELETE：默认软删；?hard=1 物理删（保留给归档页彻底清除）
  app.delete('/api/loop-items/:id', editor, async (request, reply) => {
    const id = Number(request.params.id);
    if (request.query?.hard === '1') {
      // 彻底删除会把完成结果、关联键、证据截图一起抹掉。界面一直只给老板显示这个按钮，接口却谁都能调
      if (request.user?.role !== 'boss') {
        return reply.code(403).send({ error: 'hard_delete_forbidden', detail: '彻底删除只有老板可以做' });
      }
      repo.hardDelete(id);
      // 行都没了，它的关联键和证据截图留着只会成为取不到宿主的孤儿
      taskLinksRepo.removeByItem(id);
      changesRepo.removeByItem(id);
      attachmentsRepo.removeByOwner(TASK_ATTACHMENT_OWNER, id);
      return { ok: true, hard: true };
    }
    const item = repo.softDelete(id, request.user?.id);
    return { ok: true, item };
  });
}
