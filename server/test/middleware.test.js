// 权限矩阵回归测试。
// 存在理由：曾有 onlySeo/onlySem/seoOrSem/onlyBoss 四个别名全部指向 editor/onlyManagerBoss，
// 路由写着「onlySem」实际放行全部角色 —— 名字与行为脱节且无测试兜底。别名已删，这里把
// 两档的真实放行范围钉死：以后谁改动 editor/onlyManagerBoss 的角色集合，必须先改这个文件。
import test from 'node:test';
import assert from 'node:assert/strict';
import { editor, onlyManagerBoss, readAuth } from '../src/auth/middleware.js';

const ALL_ROLES = ['seo', 'sem', 'manager', 'boss'];

// 造一个已通过 JWT 校验、带指定角色的 request；reply 记录是否被短路。
function fakeReq(role) {
  return { jwtVerify: async () => {}, user: { role } };
}
function fakeReply() {
  return {
    sent: false,
    statusCode: 200,
    body: null,
    code(c) { this.statusCode = c; return this; },
    send(b) { this.sent = true; this.body = b; return this; },
  };
}

// 跑一个 guard，返回 reply（未短路 = 放行）。
async function run(guard, role) {
  const reply = fakeReply();
  await guard.preHandler(fakeReq(role), reply);
  return reply;
}

test('editor：四个角色全部放行', async () => {
  for (const role of ALL_ROLES) {
    const reply = await run(editor, role);
    assert.equal(reply.sent, false, `${role} 应被 editor 放行`);
  }
});

test('onlyManagerBoss：manager/boss 放行，seo/sem 拒绝 403', async () => {
  for (const role of ['manager', 'boss']) {
    const reply = await run(onlyManagerBoss, role);
    assert.equal(reply.sent, false, `${role} 应被 onlyManagerBoss 放行`);
  }
  for (const role of ['seo', 'sem']) {
    const reply = await run(onlyManagerBoss, role);
    assert.equal(reply.sent, true, `${role} 应被 onlyManagerBoss 拒绝`);
    assert.equal(reply.statusCode, 403);
    assert.equal(reply.body.error, 'forbidden');
  }
});

test('两档必须真的不同：onlyManagerBoss 严格窄于 editor', async () => {
  const editorPass = [];
  const managerBossPass = [];
  for (const role of ALL_ROLES) {
    if (!(await run(editor, role)).sent) editorPass.push(role);
    if (!(await run(onlyManagerBoss, role)).sent) managerBossPass.push(role);
  }
  assert.deepEqual(editorPass, ALL_ROLES);
  assert.deepEqual(managerBossPass, ['manager', 'boss']);
  assert.ok(managerBossPass.length < editorPass.length, '两档权限塌成同一档 = 化名幻觉复发');
});

test('未登录（jwtVerify 抛错）一律 401，不看角色', async () => {
  for (const guard of [readAuth, editor, onlyManagerBoss]) {
    const reply = fakeReply();
    await guard.preHandler({ jwtVerify: async () => { throw new Error('no token'); } }, reply);
    assert.equal(reply.sent, true);
    assert.equal(reply.statusCode, 401);
    assert.equal(reply.body.error, 'unauthorized');
  }
});
