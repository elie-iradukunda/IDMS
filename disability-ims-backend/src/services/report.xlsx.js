// ─────────────────────────────────────────────────────────────
// report.xlsx.js — renders a report description into a styled workbook.
//
// The aim is a spreadsheet somebody can actually work in, not a CSV with a
// different extension. So every sheet gets a branded title block, a real
// header row that stays put when you scroll, an auto-filter, sensible column
// widths, wrapped text where the content is prose, banded rows, and a footer
// stating who generated it and when.
//
// A "Summary" sheet always comes first, because the person opening a district
// report usually wants the four numbers on the front page, not row 1 of 400.
// ─────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs';
import { BRAND, argb, ORG, CONFIDENTIALITY } from './report.brand.js';

const TITLE_ROWS = 4;   // brandmark, title, subtitle, spacer

function paintTitleBlock(sheet, { title, subtitle, span }) {
  const last = Math.max(span, 2);
  const colLetter = (n) => {
    let s = '';
    let x = n;
    while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); }
    return s;
  };
  const end = colLetter(last);

  sheet.mergeCells(`A1:${end}1`);
  const brand = sheet.getCell('A1');
  brand.value = `${ORG.mark}   ${ORG.name}`;
  brand.font = { name: 'Calibri', size: 16, bold: true, color: { argb: argb(BRAND.white) } };
  brand.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(BRAND.green) } };
  brand.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(`A2:${end}2`);
  const t = sheet.getCell('A2');
  t.value = title;
  t.font = { name: 'Calibri', size: 13, bold: true, color: { argb: argb(BRAND.ink) } };
  t.alignment = { vertical: 'middle', indent: 1 };
  sheet.getRow(2).height = 22;

  sheet.mergeCells(`A3:${end}3`);
  const s = sheet.getCell('A3');
  s.value = subtitle;
  s.font = { name: 'Calibri', size: 10, italic: true, color: { argb: argb(BRAND.muted) } };
  s.alignment = { vertical: 'middle', indent: 1 };
  sheet.getRow(3).height = 18;

  sheet.getRow(4).height = 6;
}

// Columns whose content is prose rather than a value get wrapped text and a
// taller row; a support need truncated to "Inkoni y'abatabona (whi…" is not a
// support need anybody can act on.
const isProse = (col) => (col.width || 0) >= 34;

function addDataSheet(wb, sheet, report) {
  const ws = wb.addWorksheet(sheet.name.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: TITLE_ROWS + 1 }],
    pageSetup: {
      orientation: sheet.columns.length > 6 ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: {
        left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3,
      },
    },
    headerFooter: {
      oddFooter: `&L${ORG.name} · ${ORG.district}&C&P of &N&R${report.title}`,
    },
  });

  paintTitleBlock(ws, { title: report.title, subtitle: sheet.name, span: sheet.columns.length });

  // Header row
  const headerRow = ws.getRow(TITLE_ROWS + 1);
  sheet.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: argb(BRAND.white) } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(BRAND.greenDark) } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: argb(BRAND.green) } } };
    ws.getColumn(i + 1).width = col.width || 18;
  });
  headerRow.height = 26;

  // Data rows
  sheet.rows.forEach((row, r) => {
    const excelRow = ws.getRow(TITLE_ROWS + 2 + r);
    sheet.columns.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      const value = row[col.key];
      cell.value = value === undefined || value === null || value === '' ? null : value;
      if (col.type === 'number' && typeof value === 'number') cell.numFmt = '#,##0';
      cell.font = { name: 'Calibri', size: 10.5, color: { argb: argb(BRAND.ink) } };
      cell.alignment = {
        vertical: 'top',
        wrapText: isProse(col),
        horizontal: col.type === 'number' ? 'right' : 'left',
      };
      cell.border = { bottom: { style: 'hair', color: { argb: argb(BRAND.border) } } };
      if (r % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(BRAND.surfaceAlt) } };
      }
    });
  });

  // Filter + repeat the header on every printed page.
  if (sheet.rows.length) {
    ws.autoFilter = {
      from: { row: TITLE_ROWS + 1, column: 1 },
      to: { row: TITLE_ROWS + 1 + sheet.rows.length, column: sheet.columns.length },
    };
  } else {
    const empty = ws.getRow(TITLE_ROWS + 2).getCell(1);
    empty.value = 'No rows matched this report.';
    empty.font = { name: 'Calibri', size: 10.5, italic: true, color: { argb: argb(BRAND.muted) } };
  }
  ws.pageSetup.printTitlesRow = `${TITLE_ROWS + 1}:${TITLE_ROWS + 1}`;

  return ws;
}

function addSummarySheet(wb, report) {
  const ws = wb.addWorksheet('Summary', {
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  paintTitleBlock(ws, { title: report.title, subtitle: report.subtitle || '', span: 2 });
  ws.getColumn(1).width = 54;
  ws.getColumn(2).width = 26;

  let r = TITLE_ROWS + 1;
  const sectionHeading = (text) => {
    const cell = ws.getRow(r).getCell(1);
    ws.mergeCells(`A${r}:B${r}`);
    cell.value = text;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: argb(BRAND.greenDark) } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(BRAND.greenSoft) } };
    cell.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(r).height = 20;
    r += 1;
  };
  const pair = (label, value, { wrap = false } = {}) => {
    const row = ws.getRow(r);
    row.getCell(1).value = label;
    row.getCell(1).font = { name: 'Calibri', size: 10.5, color: { argb: argb(BRAND.muted) } };
    row.getCell(1).alignment = { vertical: 'top', wrapText: true, indent: 1 };
    row.getCell(2).value = value;
    row.getCell(2).font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: argb(BRAND.ink) } };
    row.getCell(2).alignment = { vertical: 'top', wrapText: wrap };
    row.getCell(1).border = { bottom: { style: 'hair', color: { argb: argb(BRAND.border) } } };
    row.getCell(2).border = { bottom: { style: 'hair', color: { argb: argb(BRAND.border) } } };
    if (wrap) row.height = 30;
    r += 1;
  };

  if (report.meta?.length) { sectionHeading('Record'); report.meta.forEach(([k, v]) => pair(k, v)); r += 1; }
  if (report.narrative?.length) {
    sectionHeading('What is recorded');
    report.narrative.forEach(([k, v]) => pair(k, v, { wrap: true }));
    r += 1;
  }
  if (report.summary?.length) { sectionHeading('At a glance'); report.summary.forEach(([k, v]) => pair(k, v)); r += 1; }
  if (report.notes?.length) {
    sectionHeading('What these numbers answer');
    report.notes.forEach(([k, v]) => pair(k, v, { wrap: true }));
    r += 1;
  }

  sectionHeading('About this report');
  pair('Generated', report.generatedAt.toISOString().slice(0, 16).replace('T', ' '));
  pair('Generated by', report.generatedBy);
  pair('System', `${ORG.name} · ${ORG.district}`);

  r += 1;
  ws.mergeCells(`A${r}:B${r}`);
  const note = ws.getRow(r).getCell(1);
  note.value = CONFIDENTIALITY;
  note.font = { name: 'Calibri', size: 9, italic: true, color: { argb: argb(BRAND.amber) } };
  note.alignment = { wrapText: true, vertical: 'top', indent: 1 };
  ws.getRow(r).height = 46;

  return ws;
}

export async function renderXlsx(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = ORG.name;
  wb.created = report.generatedAt;
  wb.title = report.title;
  wb.description = report.description || '';
  wb.company = ORG.district;

  addSummarySheet(wb, report);
  for (const sheet of report.sheets) addDataSheet(wb, sheet, report);

  return wb.xlsx.writeBuffer();
}
