import { editor, onlyManagerBoss, requireAuth } from '../auth/middleware.js';
import * as actionRepo from '../db/repositories/hermesActions.js';
import {
  SUPPORTED_ACTIONS,
  actionErrorStatus,
  cancelAction,
  executeAction,
  proposeAction,
  verifyAction,
} from '../services/hermesActions.js';

function userId(request) {
  return Number(request.user?.id || 0);
}

function actionId(request) {
  const id = Number(request.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function sendError(reply, error) {
  return reply.code(actionErrorStatus(error)).send({
    error: error.message || 'action_failed',
    actionId: error.actionId || undefined,
    missing: Array.isArray(error.missing) ? error.missing : undefined,
  });
}

export async function hermesActionsRoutes(app) {
  app.get('/api/hermes/actions', { preHandler: requireAuth }, async (request) => {
    const isManager = ['manager', 'boss'].includes(request.user?.role);
    return {
      actions: actionRepo.list({
        userId: isManager ? null : userId(request),
        status: request.query?.status || null,
        limit: request.query?.limit,
      }),
      supportedActions: SUPPORTED_ACTIONS,
    };
  });

  app.get('/api/hermes/actions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const id = actionId(request);
    const action = id ? actionRepo.get(id) : null;
    if (!action) return reply.code(404).send({ error: 'action_not_found' });
    const isManager = ['manager', 'boss'].includes(request.user?.role);
    if (!isManager && action.user_id !== userId(request)) return reply.code(403).send({ error: 'forbidden' });
    return { action };
  });

  app.post('/api/hermes/actions', editor, async (request, reply) => {
    try {
      const body = request.body || {};
      const action = proposeAction({
        userId: userId(request),
        loopItemId: body.loop_item_id,
        actionType: body.action_type,
        title: body.title,
        input: body.input,
      });
      return reply.code(201).send({ action });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/hermes/actions/:id/approve', onlyManagerBoss, async (request, reply) => {
    const id = actionId(request);
    if (!id) return reply.code(400).send({ error: 'bad_action_id' });
    const action = actionRepo.approve(id, userId(request));
    if (!action) return reply.code(409).send({ error: 'action_not_proposable' });
    return { action };
  });

  app.post('/api/hermes/actions/:id/execute', onlyManagerBoss, async (request, reply) => {
    const id = actionId(request);
    if (!id) return reply.code(400).send({ error: 'bad_action_id' });
    try {
      return { action: await executeAction(id, userId(request)) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/hermes/actions/:id/verify', editor, async (request, reply) => {
    const id = actionId(request);
    if (!id) return reply.code(400).send({ error: 'bad_action_id' });
    try {
      return { action: verifyAction(id, userId(request), request.body || {}) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/hermes/actions/:id/cancel', editor, async (request, reply) => {
    const id = actionId(request);
    if (!id) return reply.code(400).send({ error: 'bad_action_id' });
    const current = actionRepo.get(id);
    const isManager = ['manager', 'boss'].includes(request.user?.role);
    if (!current) return reply.code(404).send({ error: 'action_not_found' });
    if (!isManager && current.user_id !== userId(request)) return reply.code(403).send({ error: 'forbidden' });
    try {
      return { action: cancelAction(id) };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
