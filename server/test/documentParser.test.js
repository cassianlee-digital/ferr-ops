import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseDocumentAttachment } from '../src/services/documentParser.js';

test('parses xlsx sheets into bounded text', async () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['日期', '点击', '转化'],
    ['2026-07-15', 12, 3],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Ads');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const result = await parseDocumentAttachment({
    name: 'ads.xlsx',
    fileDataBase64: buffer.toString('base64'),
  });

  assert.equal(result.format, 'xlsx');
  assert.match(result.textContent, /\[Sheet: Ads\]/);
  assert.match(result.textContent, /2026-07-15/);
  assert.match(result.textContent, /12/);
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
