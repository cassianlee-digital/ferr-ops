import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseDocumentAttachment } from '../src/services/documentParser.js';

test('parses xlsx sheets into bounded text', async () => {
  const buffer = await readFile(fileURLToPath(new URL('./ads.fixture.xlsx', import.meta.url)));

  const result = await parseDocumentAttachment({
    name: 'ads.xlsx',
    fileDataBase64: buffer.toString('base64'),
  });

  assert.equal(result.format, 'xlsx');
  assert.match(result.textContent, /\[Sheet: Ads\]/);
  assert.match(result.textContent, /2026-07-15/);
  assert.match(result.textContent, /12/);
});

test('rejects legacy xls files instead of parsing them with the vulnerable SheetJS package', async () => {
  await assert.rejects(
    () => parseDocumentAttachment({
      name: 'legacy.xls',
      fileDataBase64: Buffer.from('not-an-xls').toString('base64'),
    }),
    /document_type_unsupported/,
  );
});

test('rejects documents above the size limit', async () => {
  await assert.rejects(
    () => parseDocumentAttachment({
      name: 'too-large.pdf',
      fileDataBase64: Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64'),
    }),
    /document_too_large/,
  );
});
