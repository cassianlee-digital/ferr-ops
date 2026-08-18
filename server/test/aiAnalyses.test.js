import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'ferr-ai-analyses-'));
process.env.DB_FILE = join(tmpDir, 'test.sqlite');

const { migrate } = await import('../src/db/migrate.js');
const repo = await import('../src/db/repositories/aiAnalyses.js');
const { db } = await import('../src/db/connection.js');
migrate();

test.after(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

const quality = (level, score) => ({
  confidenceAssessment: { applicable: true, level, score, label: level, decision: level },
  evidenceAudit: { status: level === 'low' ? 'weak' : 'supported', evidence: [] },
  answerQualityRepair: { attempted: false, used: false, error: '' },
  missingData: [],
});

test('AI 分析的当前评分、历史评分和追问评分都会持久化', () => {
  const first = repo.create({
    scope_key: 'test:quality', scope_type: 'seo', title: '测试', prompt: '分析', result_text: '第一次',
    messages: [{ role: 'assistant', content: '第一次' }], quality: quality('high', 88),
  });
  assert.equal(first.quality.confidenceAssessment.score, 88);

  const second = repo.replaceResult(first.id, {
    result_text: '第二次', messages: [{ role: 'assistant', content: '第二次' }], context: null, quality: quality('low', 30),
  });
  assert.equal(second.quality.confidenceAssessment.level, 'low');
  assert.equal(second.history[0].quality.confidenceAssessment.score, 88);

  const third = repo.appendMessages(first.id, [{ role: 'assistant', content: '追问结果' }], quality('medium', 68));
  assert.equal(third.result_text, '追问结果');
  assert.equal(third.quality.confidenceAssessment.score, 68);
});
