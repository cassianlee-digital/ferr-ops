import * as actionRepo from '../db/repositories/hermesActions.js';
import * as loopItemsRepo from '../db/repositories/loopItems.js';
import { syncAds } from '../sync/ads.js';
import { syncGa4 } from '../sync/ga4.js';
import { syncGsc } from '../sync/gsc.js';

const MAX_TITLE = 200;
const MAX_NOTE = 1000;

const ACTION_EXECUTORS = Object.freeze({
  create_task: async (input) => {
    const item = loopItemsRepo.create({
      kind: 'task',
      dept: input.dept || '公司',
      content: input.content,
      owner: input.owner || '',
      status: input.status || '待办',
      task_date: input.task_date || '',
      task_hour: input.task_hour || '',
      note: input.note || '',
      urgent: input.urgent ? 1 : null,
    });
    return { kind: 'task', loopItemId: item.id, item };
  },
  sync_gsc: (input) => syncGsc(input),
  sync_ga4: (input) => syncGa4(input),
  sync_ads: (input) => syncAds(input),
});

export const SUPPORTED_ACTIONS = Object.freeze(Object.keys(ACTION_EXECUTORS));

function text(value, max) {
  return value == null ? '' : String(value).trim().slice(0, max);
}

function badAction(message, status = 400) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}

function normalizeInput(actionType, raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw badAction('action_input_invalid');
  if (actionType === 'create_task') {
    const content = text(raw.content, 400);
    if (!content) throw badAction('action_task_content_required');
    return {
      dept: text(raw.dept || '公司', 10),
      content,
      owner: text(raw.owner, 20),
      status: text(raw.status || '待办', 20),
      task_date: text(raw.task_date, 20),
      task_hour: text(raw.task_hour, 10),
      note: text(raw.note, 400),
      urgent: Boolean(raw.urgent),
    };
  }
  return {
    ...(raw.project_id == null ? {} : { project_id: Number(raw.project_id) }),
    ...(raw.start_date ? { start_date: text(raw.start_date, 10) } : {}),
    ...(raw.end_date ? { end_date: text(raw.end_date, 10) } : {}),
  };
}

function publicSyncResult(result) {
  return {
    provider: result.provider,
    runId: result.runId,
    range: result.range,
    rowsWritten: result.rowsWritten,
    project: result.project ? { id: result.project.id, name: result.project.name } : undefined,
  };
}

export function proposeAction({ userId, loopItemId = null, actionType, title, input = {} }) {
  if (!SUPPORTED_ACTIONS.includes(actionType)) throw badAction('action_type_not_supported');
  const linkedLoopItemId = loopItemId == null || loopItemId === '' ? null : Number(loopItemId);
  if (linkedLoopItemId != null && (!Number.isInteger(linkedLoopItemId) || linkedLoopItemId < 1)) {
    throw badAction('loop_item_id_invalid');
  }
  if (linkedLoopItemId != null && !loopItemsRepo.get(linkedLoopItemId)) {
    throw badAction('loop_item_not_found', 404);
  }
  const normalizedInput = normalizeInput(actionType, input);
  const safeTitle = text(title, MAX_TITLE) || actionType;
  return actionRepo.create({
    userId,
    loopItemId: linkedLoopItemId,
    actionType,
    title: safeTitle,
    input: normalizedInput,
  });
}

export async function executeAction(id, actorId) {
  const current = actionRepo.get(id);
  if (!current) throw badAction('action_not_found', 404);
  if (current.status !== 'approved') throw badAction('action_not_approved', 409);
  const running = actionRepo.claim(id);
  if (!running) throw badAction('action_already_running_or_finished', 409);
  try {
    const rawResult = await ACTION_EXECUTORS[running.action_type](running.input || {});
    const result = running.action_type.startsWith('sync_') ? publicSyncResult(rawResult) : rawResult;
    return actionRepo.succeed(id, { ...result, executedBy: actorId });
  } catch (error) {
    actionRepo.fail(id, error.message || 'action_failed');
    throw error;
  }
}

// Hermes 可主动触发的只读同步：仍然写入动作台账，但不把低风险数据刷新变成人工审批步骤。
export async function executeTrustedReadAction({ userId, actionType, title, input = {} }) {
  if (!['sync_gsc', 'sync_ga4', 'sync_ads'].includes(actionType)) {
    throw badAction('trusted_action_not_allowed');
  }
  const proposed = proposeAction({ userId, actionType, title, input });
  const approved = actionRepo.approve(proposed.id, userId);
  if (!approved) throw badAction('trusted_action_approval_failed', 500);
  try {
    return await executeAction(approved.id, userId);
  } catch (error) {
    error.actionId = approved.id;
    throw error;
  }
}

export function verifyAction(id, verifiedBy, verification = {}) {
  const current = actionRepo.get(id);
  if (!current) throw badAction('action_not_found', 404);
  if (current.status !== 'succeeded') throw badAction('action_not_succeeded', 409);
  const note = text(verification.note, MAX_NOTE);
  const result = actionRepo.verify(id, verifiedBy, {
    note,
    checkedAt: new Date().toISOString(),
  });
  if (!result) throw badAction('action_already_verified', 409);
  if (result.loop_item_id && note) {
    loopItemsRepo.update(result.loop_item_id, {
      status: '已验证',
      conclusion: note,
      analysis: `Hermes 动作 #${result.id} 已完成结果验证。`,
    });
  }
  return result;
}

export function cancelAction(id) {
  const result = actionRepo.cancel(id);
  if (!result) throw badAction('action_not_cancellable', 409);
  return result;
}

export function actionErrorStatus(error) {
  return Number(error?.statusCode) || (error?.message === 'google_config_missing' ? 400 : 502);
}
