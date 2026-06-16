// Tiny RFC4180-ish CSV helpers - no external dependency.

// Parse CSV text into an array of row objects keyed by the header row.
// Handles quoted fields, embedded commas/newlines, and doubled "" quotes.
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  // Normalise newlines and strip a UTF-8 BOM if present.
  text = text.replace(/^﻿/, '');

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c === '\r') {
      // ignore; newline handled by \n
    } else {
      field += c;
    }
  }
  // Flush the final field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  // Drop fully-empty trailing rows.
  const cleaned = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (cleaned.length === 0) return [];

  const headers = cleaned[0].map((h) => h.trim());
  return cleaned.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

function escapeCell(value) {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Turn an array of objects into CSV text given an ordered list of columns
// ([{ key, label }] or plain string keys).
function toCsv(columns, rows) {
  const cols = columns.map((c) => (typeof c === 'string' ? { key: c, label: c } : c));
  const head = cols.map((c) => escapeCell(c.label)).join(',');
  const body = rows.map((r) => cols.map((c) => escapeCell(r[c.key])).join(',')).join('\n');
  return head + '\n' + body + '\n';
}

module.exports = { parseCsv, toCsv };
