import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-risk-register-test-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite');

const { migrate } = await import('../src/db/migrate.js');
const { db } = await import('../src/db/connection.js');
const {
  loadLatestProductionReadinessReport,
  recordProductionReadinessReport,
} = await import('../src/services/productionReadiness.js');
const { buildRiskRegister } = await import('../src/services/riskRegister.js');

migrate();

test.after(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function check(id, status, title, evidence = {}) {
  return { id, severity: 'P0', status, title, detail: `${title} detail`, evidence };
}

function report(mode, checks, checkedAt = '2026-08-18T04:00:00.000Z') {
  return {
    version: 1,
    mode,
    checkedAt,
    acceptanceDate: '2026-08-15',
    checks,
  };
}

test('live production reports are sanitized before atomic meta persistence', () => {
  db.prepare("DELETE FROM meta WHERE key = 'production_readiness.latest_live'").run();
  const secret = 'sk-test-super-secret-value-123456';
  const saved = recordProductionReadinessReport(report('live', [
    check('hermes.live_probe', 'fail', 'Hermes 实时验证', {
      apiKey: secret,
      refresh_token: secret,
      response: `Authorization: Bearer ${secret}`,
      nested: { clientSecret: secret, message: `provider returned ${secret}` },
    }),
  ]), { db });
  const loaded = loadLatestProductionReadinessReport({ db });
  const serialized = JSON.stringify({ saved, loaded });

  assert.equal(saved.mode, 'live');
  assert.deepEqual(loaded, saved);
  assert.doesNotMatch(serialized, /sk-test-super-secret-value/);
  assert.doesNotMatch(serialized, /apiKey|refresh_token|clientSecret/);
  assert.match(serialized, /\[redacted\]/);
  assert.throws(
    () => recordProductionReadinessReport(report('static', []), { db }),
    /production_readiness_live_report_required/
  );
});

test('risk register merges only live checks and keeps current configuration failures authoritative', async () => {
  const secret = 'sk-test-another-secret-value-987654';
  recordProductionReadinessReport(report('live', [
    check('security.jwt_secret', 'pass', 'JWT 密钥'),
    check('hermes.live_probe', 'pass', 'Hermes 实时验证', {
      response: secret,
      configurationFingerprint: 'hermes-current',
    }),
    check('google.ads.live_sync', 'fail', 'Google Ads 真实同步', {
      configurationFingerprint: 'ads-current',
    }),
    check('database.backup_restore', 'pass', '备份恢复'),
  ], '2026-08-18T05:00:00.000Z'), { db });

  const currentChecks = [
    check('security.jwt_secret', 'fail', 'JWT 密钥'),
    check('hermes.provider_config', 'pass', 'Hermes 配置', { configurationFingerprint: 'hermes-current' }),
    check('hermes.live_probe', 'unverified', 'Hermes 实时验证'),
    check('google.ads.config', 'pass', 'Google Ads 配置', { configurationFingerprint: 'ads-current' }),
    check('google.ads.oauth', 'pass', 'Google Ads OAuth'),
    check('google.ads.live_sync', 'unverified', 'Google Ads 真实同步'),
    check('database.backup_restore', 'unverified', '备份恢复'),
    { ...check('operations.auto_sync', 'warn', '自动同步'), severity: 'P1' },
  ];
  const register = await buildRiskRegister({
    db,
    checkFn: async () => report('static', currentChecks, '2026-08-18T06:00:00.000Z'),
  });
  const byId = new Map(register.items.map((item) => [item.id, item]));

  assert.equal(byId.get('security.jwt_secret').status, 'fail');
  assert.equal(byId.get('security.jwt_secret').source, 'current_static');
  assert.equal(byId.get('security.jwt_secret').updatedAt, '2026-08-18T06:00:00.000Z');
  assert.equal(byId.get('hermes.live_probe').status, 'pass');
  assert.equal(byId.get('hermes.live_probe').source, 'production_live');
  assert.equal(byId.get('google.ads.live_sync').status, 'fail');
  assert.equal(byId.get('database.backup_restore').status, 'pass');
  assert.equal(register.summary.p0Open, 2);
  assert.equal(register.summary.p1Open, 1);
  assert.equal(register.latestLiveAcceptance.available, true);
  assert.ok(register.items.every((item) => (
    ['P0', 'P1'].includes(item.severity)
    && item.owner
    && item.updatedAt
    && item.nextAction
  )));
  assert.doesNotMatch(JSON.stringify(register), /sk-test-another-secret-value/);
});

test('live results become unverified after configuration or authorization changes', async () => {
  recordProductionReadinessReport(report('live', [
    check('hermes.live_probe', 'pass', 'Hermes 实时验证', { configurationFingerprint: 'old-config' }),
    check('google.ads.live_sync', 'pass', 'Google Ads 真实同步', { configurationFingerprint: 'ads-current' }),
  ]), { db });

  const register = await buildRiskRegister({
    db,
    checkFn: async () => report('static', [
      check('hermes.provider_config', 'pass', 'Hermes 配置', { configurationFingerprint: 'new-config' }),
      check('hermes.live_probe', 'unverified', 'Hermes 实时验证'),
      check('google.ads.config', 'pass', 'Google Ads 配置', { configurationFingerprint: 'ads-current' }),
      check('google.ads.oauth', 'fail', 'Google Ads OAuth'),
      check('google.ads.live_sync', 'unverified', 'Google Ads 真实同步'),
    ]),
  });
  const byId = new Map(register.items.map((item) => [item.id, item]));

  for (const id of ['hermes.live_probe', 'google.ads.live_sync']) {
    assert.equal(byId.get(id).status, 'unverified');
    assert.equal(byId.get(id).source, 'current_static');
    assert.match(byId.get(id).detail, /旧结果不再适用/);
  }
});

test('missing or corrupt live acceptance remains explicitly unverified', async () => {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES ('production_readiness.latest_live', '{bad json')
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run();
  assert.equal(loadLatestProductionReadinessReport({ db }), null);

  const register = await buildRiskRegister({
    db,
    checkFn: async () => report('static', [
      check('hermes.live_probe', 'unverified', 'Hermes 实时验证'),
    ]),
  });
  assert.equal(register.latestLiveAcceptance.available, false);
  assert.equal(register.items[0].status, 'unverified');
  assert.equal(register.items[0].source, 'current_static');
});
