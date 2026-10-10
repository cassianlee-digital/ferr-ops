// 表格导出：CSV 与 XLSX（纯函数，零依赖）。
//
// 为什么自己写 XLSX 而不装库：后端只有一个读 Excel 的依赖，没有写的；而这里要的只是「几张纯数据的表」，
// 不要样式、公式、图表。XLSX 就是一个 ZIP 里放几份 XML，用 Node 自带的 zlib 就能写，
// 比为此引入一个几 MB 的依赖更划算。产物由测试用 read-excel-file 读回来校验。
//
// 两个安全点：
//   - CSV 公式注入：单元格以 = + - @ 开头时，Excel 会把它当公式执行。导出的内容里有大量人填的文字
//     （任务名、备注、留言），所以这类单元格前面加一个单引号让它变成纯文本。
//   - XML 里不合法的控制字符会让整个文件打不开，写入前滤掉。
import { deflateRawSync } from 'node:zlib';

/* ---------- CSV ---------- */
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(v) {
  if (v == null) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  // 数字原样导出（负数以 - 开头，但它不是人填的文字，不能加引号前缀破坏数值）
  if (typeof v !== 'number' && FORMULA_START.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// columns: [{ key, label }]。带 UTF-8 BOM —— 没有它，Excel 打开中文 CSV 是乱码。
export function toCsv(rows, columns) {
  const lines = [columns.map((c) => csvCell(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c.key])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/* ---------- ZIP（只实现写、只用 deflate，够装 XLSX） ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files) {
  const locals = []; const centrals = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const body = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);        // 解压所需版本
    local.writeUInt16LE(0x0800, 6);    // 文件名为 UTF-8
    local.writeUInt16LE(8, 8);         // deflate
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); // 固定的修改时间：同样的输入产出同样的文件
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const centralSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/* ---------- XLSX ---------- */
// XML 1.0 不允许的控制字符（制表、换行、回车除外）
const xmlText = (s) => String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// 数字写成数值单元格（能求和、能排序），其余一律是内联字符串 —— 字符串不会被当成公式执行
function xlsxCell(ref, v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlText(s)}</t></is></c>`;
}

function sheetXml(rows, columns) {
  const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'];
  const line = (cells, n) => `<row r="${n}">${cells.map((v, i) => xlsxCell(colName(i) + n, v)).join('')}</row>`;
  out.push(line(columns.map((c) => c.label), 1));
  rows.forEach((r, i) => out.push(line(columns.map((c) => r[c.key]), i + 2)));
  out.push('</sheetData></worksheet>');
  return out.join('');
}

// 工作表名：Excel 限 31 字，且不能含 \ / ? * [ ] :
const sheetName = (name) => String(name).replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';

/* sheets: [{ name, columns: [{key,label}], rows: [...] }] → XLSX 文件的 Buffer */
export function toXlsx(sheets) {
  const list = sheets.length ? sheets : [{ name: 'Sheet1', columns: [], rows: [] }];
  const used = new Set();
  const names = list.map((s, i) => {
    let n = sheetName(s.name || 'Sheet' + (i + 1));
    while (used.has(n)) n = sheetName(n.slice(0, 28) + '_' + (i + 1));
    used.add(n);
    return n;
  });
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + names.map((n, i) => `<sheet name="${xmlText(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
      + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + '</Relationships>' },
    ...list.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows || [], s.columns || []) })),
  ];
  return zip(files);
}
