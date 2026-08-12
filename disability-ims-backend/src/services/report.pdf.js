// ─────────────────────────────────────────────────────────────
// report.pdf.js — renders a report description into a branded PDF.
//
// This is the format that gets printed, filed and tabled at a meeting, so it
// is laid out as a document rather than a screenshot of a table: a cover
// block with the mark, an at-a-glance panel, then each dataset as a real
// table with a repeating header, alternating row bands, wrapped cells and a
// footer carrying the page number and the confidentiality notice.
//
// The logo is drawn with vectors rather than shipped as an image file. That
// keeps the repository free of a binary asset, renders sharp at any zoom, and
// means the mark can never go missing from a deployment because a file was
// left out of the upload.
// ─────────────────────────────────────────────────────────────
import PDFDocument from 'pdfkit';
import { BRAND, hex, ORG, CONFIDENTIALITY } from './report.brand.js';

const PAGE = { size: 'A4', marginTop: 44, marginBottom: 54, marginX: 36 };

// ── The IDS mark: a rounded green tile with the italic monogram ──
function drawMark(doc, x, y, size = 26) {
  doc.save();
  doc.roundedRect(x, y, size, size, size * 0.28).fill(hex(BRAND.green));
  doc.fillColor(hex(BRAND.white))
    .font('Helvetica-BoldOblique')
    .fontSize(size * 0.42)
    .text(ORG.mark, x, y + size * 0.29, { width: size, align: 'center' });
  doc.restore();
}

function header(doc) {
  const { marginX } = PAGE;
  drawMark(doc, marginX, 24, 24);
  doc.fillColor(hex(BRAND.ink)).font('Helvetica-Bold').fontSize(10)
    .text(ORG.name, marginX + 32, 26);
  doc.fillColor(hex(BRAND.muted)).font('Helvetica').fontSize(7.5)
    .text(ORG.district.toUpperCase(), marginX + 32, 38, { characterSpacing: 0.8 });
  doc.moveTo(marginX, 56).lineTo(doc.page.width - marginX, 56)
    .lineWidth(0.7).strokeColor(hex(BRAND.border)).stroke();
}

// Drawing below the bottom margin makes PDFKit start a new page, which would
// mean every footer pushed the body onto a fresh sheet and left the previous
// one blank. Lifting the margin for the duration of the stamp is the way to
// write into that band deliberately.
function inBottomMargin(doc, draw) {
  const saved = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  draw();
  doc.page.margins.bottom = saved;
}

function footer(doc, report, pageNumber, pageCount) {
  const { marginX } = PAGE;
  const y = doc.page.height - 44;
  inBottomMargin(doc, () => {
    doc.moveTo(marginX, y - 8).lineTo(doc.page.width - marginX, y - 8)
      .lineWidth(0.7).strokeColor(hex(BRAND.border)).stroke();
    doc.fillColor(hex(BRAND.muted)).font('Helvetica').fontSize(7)
      .text(
        `${report.title}  ·  generated ${report.generatedAt.toISOString().slice(0, 16).replace('T', ' ')} by ${report.generatedBy}`,
        marginX, y, { width: doc.page.width - marginX * 2 - 70, lineBreak: false, ellipsis: true },
      );
    doc.text(`Page ${pageNumber} of ${pageCount}`, doc.page.width - marginX - 70, y,
      { width: 70, align: 'right', lineBreak: false });
  });
}

const contentTop = 70;
const contentBottom = (doc) => doc.page.height - PAGE.marginBottom;

// Header and footer are stamped onto every page at the end, once the total
// page count is known — that is what lets the footer say "Page 3 of 9", and it
// keeps the flowing content from having to know anything about furniture.
function stampPages(doc, report) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    header(doc);
    footer(doc, report, i - range.start + 1, range.count);
  }
}

function newPage(doc) {
  doc.addPage();
  doc.y = contentTop;
}

function ensureSpace(doc, state, report, needed) {
  if (doc.y + needed > contentBottom(doc)) newPage(doc);
}

function sectionTitle(doc, state, report, text) {
  ensureSpace(doc, state, report, 34);
  doc.fillColor(hex(BRAND.greenDark)).font('Helvetica-Bold').fontSize(12)
    .text(text, PAGE.marginX, doc.y);
  doc.moveDown(0.35);
}

// ── Key/value panel used for the cover figures and the record block ──
function panel(doc, state, report, rows, { labelWidth = 210 } = {}) {
  const width = doc.page.width - PAGE.marginX * 2;
  for (const [label, value] of rows) {
    const valueWidth = width - labelWidth - 16;
    const h = Math.max(
      doc.font('Helvetica').fontSize(9).heightOfString(String(label ?? ''), { width: labelWidth }),
      doc.font('Helvetica-Bold').fontSize(9).heightOfString(String(value ?? ''), { width: valueWidth }),
    ) + 9;
    ensureSpace(doc, state, report, h);
    const top = doc.y;
    doc.fillColor(hex(BRAND.muted)).font('Helvetica').fontSize(9)
      .text(String(label ?? ''), PAGE.marginX + 4, top + 3, { width: labelWidth });
    doc.fillColor(hex(BRAND.ink)).font('Helvetica-Bold').fontSize(9)
      .text(String(value ?? ''), PAGE.marginX + labelWidth + 12, top + 3, { width: valueWidth });
    doc.moveTo(PAGE.marginX, top + h - 2).lineTo(doc.page.width - PAGE.marginX, top + h - 2)
      .lineWidth(0.5).strokeColor(hex(BRAND.border)).stroke();
    doc.y = top + h;
  }
  doc.moveDown(0.6);
}

// ── Tables ──
// Column widths come from the same `width` hints the spreadsheet uses, scaled
// to the printable area, so the two formats stay visually consistent.
const MIN_COL = 40;   // narrow enough for a date, wide enough to read one

function layoutColumns(doc, columns) {
  const avail = doc.page.width - PAGE.marginX * 2;
  const hint = columns.map((c) => c.width || 18);
  const total = hint.reduce((a, b) => a + b, 0);

  // Scale the spreadsheet's width hints onto the printable area, then floor
  // the narrow ones so a date does not wrap onto three lines. Flooring adds
  // width back, so the excess has to be reclaimed from the columns that have
  // room to give it up — otherwise the total overruns the page and the last
  // column is silently clipped off the right edge.
  let w = hint.map((x) => Math.max(MIN_COL, (x / total) * avail));
  const overflow = w.reduce((a, b) => a + b, 0) - avail;
  if (overflow > 0) {
    const slack = w.map((x) => Math.max(0, x - MIN_COL));
    const slackTotal = slack.reduce((a, b) => a + b, 0);
    if (slackTotal > 0) w = w.map((x, i) => x - (slack[i] / slackTotal) * overflow);
  }
  return w;
}

const headerHeight = (doc, columns, widths) => Math.max(
  20,
  ...columns.map((col, i) => doc.font('Helvetica-Bold').fontSize(7.5)
    .heightOfString(col.header, { width: widths[i] - 8 })),
) + 8;

// A header that wraps to two lines inside a fixed-height band loses its second
// line, which is how "Delivered" becomes "Deliver". The band is sized to its
// tallest label instead.
function tableHeader(doc, columns, widths) {
  const h = headerHeight(doc, columns, widths);
  const top = doc.y;
  doc.rect(PAGE.marginX, top, doc.page.width - PAGE.marginX * 2, h).fill(hex(BRAND.greenDark));
  let x = PAGE.marginX;
  columns.forEach((col, i) => {
    doc.fillColor(hex(BRAND.white)).font('Helvetica-Bold').fontSize(7.5)
      .text(col.header, x + 4, top + 4, {
        width: widths[i] - 8,
        align: col.type === 'number' ? 'right' : 'left',
      });
    x += widths[i];
  });
  doc.y = top + h;
}

function table(doc, state, report, sheet) {
  const columns = sheet.columns;
  const widths = layoutColumns(doc, columns);

  ensureSpace(doc, state, report, 60);
  tableHeader(doc, columns, widths);

  if (!sheet.rows.length) {
    doc.fillColor(hex(BRAND.muted)).font('Helvetica-Oblique').fontSize(9)
      .text('No rows matched this report.', PAGE.marginX + 4, doc.y + 8);
    doc.moveDown(1.4);
    return;
  }

  sheet.rows.forEach((row, r) => {
    const cells = columns.map((c) => {
      const v = row[c.key];
      return v === null || v === undefined ? '' : String(v);
    });
    const h = Math.max(
      ...cells.map((text, i) => doc.font('Helvetica').fontSize(7.5)
        .heightOfString(text, { width: widths[i] - 8 })),
      11,
    ) + 7;

    if (doc.y + h > contentBottom(doc)) {
      newPage(doc);
      tableHeader(doc, columns, widths);   // the header repeats on every page
    }

    const top = doc.y;
    if (r % 2 === 1) {
      doc.rect(PAGE.marginX, top, doc.page.width - PAGE.marginX * 2, h).fill(hex(BRAND.surfaceAlt));
    }
    let x = PAGE.marginX;
    cells.forEach((text, i) => {
      doc.fillColor(hex(BRAND.ink)).font('Helvetica').fontSize(7.5)
        .text(text, x + 4, top + 4, {
          width: widths[i] - 8,
          align: columns[i].type === 'number' ? 'right' : 'left',
        });
      x += widths[i];
    });
    doc.moveTo(PAGE.marginX, top + h).lineTo(doc.page.width - PAGE.marginX, top + h)
      .lineWidth(0.4).strokeColor(hex(BRAND.border)).stroke();
    doc.y = top + h;
  });
  doc.moveDown(1.2);
}

export function renderPdf(report) {
  return new Promise((resolve, reject) => {
    // A twelve-column table on portrait A4 gives every column about 40pt,
    // which turns each cell into a column of single words. Wide reports go
    // landscape so the rows stay readable.
    const widest = Math.max(...report.sheets.map((s) => s.columns.length), 0);
    const layout = widest >= 8 ? 'landscape' : 'portrait';

    const doc = new PDFDocument({
      size: PAGE.size,
      layout,
      margins: { top: PAGE.marginTop, bottom: PAGE.marginBottom, left: PAGE.marginX, right: PAGE.marginX },
      bufferPages: true,
      info: {
        Title: report.title,
        Author: ORG.name,
        Subject: report.description || '',
        Creator: `${ORG.name} · ${ORG.district}`,
      },
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const state = { page: 1 };
    doc.y = contentTop;

    // ── Cover block ──
    const coverTop = doc.y;
    drawMark(doc, PAGE.marginX, coverTop, 40);
    const coverX = PAGE.marginX + 52;
    const coverW = doc.page.width - PAGE.marginX * 2 - 52;
    doc.fillColor(hex(BRAND.ink)).font('Helvetica-Bold').fontSize(19)
      .text(report.title, coverX, coverTop, { width: coverW });
    if (report.subtitle) {
      doc.fillColor(hex(BRAND.muted)).font('Helvetica').fontSize(10)
        .text(report.subtitle, coverX, doc.y + 3, { width: coverW });
    }
    // The mark is 40pt tall; the text block may be shorter than that, so the
    // cursor has to clear whichever of the two is lower.
    doc.y = Math.max(doc.y, coverTop + 40) + 16;

    if (report.description) {
      doc.fillColor(hex(BRAND.muted)).font('Helvetica').fontSize(9)
        .text(report.description, PAGE.marginX, doc.y, { width: doc.page.width - PAGE.marginX * 2 });
      doc.moveDown(1);
    }

    if (report.meta?.length) { sectionTitle(doc, state, report, 'Record'); panel(doc, state, report, report.meta); }
    if (report.narrative?.length) {
      sectionTitle(doc, state, report, 'What is recorded');
      panel(doc, state, report, report.narrative, { labelWidth: 150 });
    }
    if (report.summary?.length) { sectionTitle(doc, state, report, 'At a glance'); panel(doc, state, report, report.summary); }
    if (report.notes?.length) {
      sectionTitle(doc, state, report, 'What these numbers answer');
      panel(doc, state, report, report.notes, { labelWidth: 150 });
    }

    // ── One table per dataset ──
    for (const sheet of report.sheets) {
      ensureSpace(doc, state, report, 90);
      sectionTitle(doc, state, report, `${sheet.name}  (${sheet.rows.length})`);
      table(doc, state, report, sheet);
    }

    // ── Confidentiality notice, on its own at the end ──
    ensureSpace(doc, state, report, 70);
    const top = doc.y;
    const w = doc.page.width - PAGE.marginX * 2;
    const h = doc.font('Helvetica-Oblique').fontSize(8).heightOfString(CONFIDENTIALITY, { width: w - 16 }) + 14;
    doc.rect(PAGE.marginX, top, w, h).fill(hex(BRAND.greenSoft));
    doc.fillColor(hex(BRAND.greenDark)).font('Helvetica-Oblique').fontSize(8)
      .text(CONFIDENTIALITY, PAGE.marginX + 8, top + 7, { width: w - 16 });

    stampPages(doc, report);
    doc.end();
  });
}
