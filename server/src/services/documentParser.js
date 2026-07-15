import { createRequire } from 'node:module';
import * as XLSX from 'xlsx';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 20000;
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'xls', 'xlsx']);

function extension(name) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function decodeBase64(value) {
  const raw = String(value || '').replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (!raw || !/^[a-z0-9+/]+={0,2}$/i.test(raw)) throw new Error('document_base64_invalid');
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw new Error('document_empty');
  if (buffer.length > MAX_DOCUMENT_BYTES) throw new Error('document_too_large');
  return buffer;
}

function trimOutput(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_OUTPUT_CHARS);
}

async function parsePdf(buffer) {
  const result = await pdfParse(buffer);
  return trimOutput(result.text);
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sections = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    return `[Sheet: ${name}]\n${csv}`;
  }).filter((section) => section.trim());
  return trimOutput(sections.join('\n\n'));
}

export async function parseDocumentAttachment(item = {}) {
  const ext = extension(item.name);
  if (!DOCUMENT_EXTENSIONS.has(ext)) throw new Error('document_type_unsupported');
  const buffer = decodeBase64(item.fileDataBase64);
  const text = ext === 'pdf' ? await parsePdf(buffer) : parseWorkbook(buffer);
  if (!text) throw new Error('document_text_empty');
  return { textContent: text, format: ext };
}
