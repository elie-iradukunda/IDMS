// ─────────────────────────────────────────────────────────────
// CSV export. District reporting does not happen inside this app: the
// numbers end up in a monthly return, a council paper or a spreadsheet
// somebody reconciles by hand. Without an export the only way to get data
// out is to retype it from the screen, which is how a registry acquires a
// second, divergent copy of itself.
// ─────────────────────────────────────────────────────────────

// Quote anything that would otherwise break the row, and neutralise the
// leading =, +, - and @ that spreadsheet software executes as a formula —
// a beneficiary's name is data, never a command.
function cell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns, rows) {
  const head = columns.map((c) => cell(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => cell(c.value(row))).join(','));
  return [head, ...body].join('\r\n');
}

// Trigger a download of `rows` as a CSV file. The BOM makes Excel open a
// UTF-8 file as UTF-8, without which Kinyarwanda text arrives mangled.
export function downloadCsv(filename, columns, rows) {
  const blob = new Blob(['﻿', toCsv(columns, rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// "registry-2026-08-04.csv"
export const stamped = (base) => `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
