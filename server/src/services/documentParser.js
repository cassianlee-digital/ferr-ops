import { createRequire } from 'node:module';
import readExcelFile from 'read-excel-file/node';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 20000;
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'xlsx']);

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

function csvCell(value) {
  if (value == null) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

async function parseWorkbook(buffer) {
  const workbook = await readExcelFile(buffer);
  const sections = workbook.map(({ sheet, data }) => {
    const csv = data
      .filter((row) => row.some((cell) => cell != null && cell !== ''))
      .map((row) => row.map(csvCell).join(','))
      .join('\n');
    return `[Sheet: ${sheet}]\n${csv}`;
  }).filter((section) => section.trim());
  return trimOutput(sections.join('\n\n'));
}

export async function parseDocumentAttachment(item = {}) {
  const ext = extension(item.name);
  if (!DOCUMENT_EXTENSIONS.has(ext)) throw new Error('document_type_unsupported');
  const buffer = decodeBase64(item.fileDataBase64);
  const text = ext === 'pdf' ? await parsePdf(buffer) : await parseWorkbook(buffer);
  if (!text) throw new Error('document_text_empty');
  return { textContent: text, format: ext };
}
