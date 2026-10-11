// 可审计任务的数据组装：给任务行补上关联键、证据截图、是否重要。
// 规则本身是纯函数（taskAudit.js）；这里只负责去库里把规则要的事实取回来。
// 凡是把任务行交给前端的路由都该过一遍 decorateTasks —— 否则前端拿到的卡不知道自己「重不重要」，
// 完成弹框就会少要证据，等提交时才被后端打回。
import * as taskLinksRepo from '../db/repositories/taskLinks.js';
import * as attachmentsRepo from '../db/repositories/attachments.js';
import * as backlinksRepo from '../db/repositories/backlinks.js';
import * as expensesRepo from '../db/repositories/expenses.js';
import * as changesRepo from '../db/repositories/loopItemChanges.js';
import { IMPORTANT_REASON_LABEL, importance } from './taskAudit.js';

export const TASK_ATTACHMENT_OWNER = 'task';
const CHUNK = 500;

function evidenceImages(ids) {
  const map = {};
  for (let i = 0; i < ids.length; i += CHUNK) {
    Object.assign(map, attachmentsRepo.metaByOwners(TASK_ATTACHMENT_OWNER, ids.slice(i, i + CHUNK)));
  }
  return map;
}

// 名下挂了花费的任务：付费外链或支出台账里指向它的。花了钱的活必须交证据，所以它是「重要」的一条判据。
export function spendTaskIds() {
  return new Set([...backlinksRepo.paidTaskIds(), ...expensesRepo.spendTaskIds()]);
}

// 任务已上传的证据截图数（完成门槛用）
export function evidenceImageCount(id) {
  return attachmentsRepo.bytesForOwner(TASK_ATTACHMENT_OWNER, id).count;
}

export function decorateTasks(items) {
  const ids = items.filter((it) => it && it.kind === 'task').map((it) => it.id);
  if (!ids.length) return items;
  const links = taskLinksRepo.byItems(ids);
  const images = evidenceImages(ids);
  const spend = spendTaskIds();
  const shortened = changesRepo.shortenedIds(ids);
  const changeCounts = changesRepo.counts(ids);
  return items.map((it) => {
    if (!it || it.kind !== 'task') return it;
    const imp = importance(it, { spend: spend.has(it.id), wasMultiDay: shortened.has(it.id) });
    return {
      ...it,
      links: links[it.id] || [],
      evidence_images: images[it.id] || [],
      change_count: changeCounts[it.id] || 0, // 被改过几次（内容 / 日期 / 工时 / 结果…），卡片上的「改 N」
      is_important: imp.important,
      important_reasons: imp.reasons,
      important_reason_text: imp.reasons.map((r) => IMPORTANT_REASON_LABEL[r]).join(' · '), // 界面直接显示，前端不再抄一份文案
    };
  });
}

export const decorateTask = (item) => (item ? decorateTasks([item])[0] : item);
