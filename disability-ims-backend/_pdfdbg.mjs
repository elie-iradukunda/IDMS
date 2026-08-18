import PDFDocument from 'pdfkit';
const doc = new PDFDocument({ size: 'A4', compress: false, bufferPages: true,
  margins: { top: 44, bottom: 54, left: 36, right: 36 } });
const chunks = []; doc.on('data', c => chunks.push(c));
doc.on('end', () => {
  const s = Buffer.concat(chunks).toString('latin1');
  for (const probe of ['HEADERTEXT', 'BODYTEXT', 'FOOTERTEXT']) {
    console.log(probe, s.includes(probe) ? 'PRESENT' : 'MISSING');
  }
});
// mimic the real order: header, footer, then body
doc.fontSize(10).text('HEADERTEXT', 36, 26);
doc.fontSize(7).text('FOOTERTEXT', 36, doc.page.height - 44);
console.log('doc.y after footer =', doc.y, '| page height =', doc.page.height);
doc.y = 70;
console.log('doc.y forced to', doc.y);
doc.fontSize(19).text('BODYTEXT', 36, doc.y);
console.log('doc.y after body =', doc.y, '| pages created =', doc.bufferedPageRange().count);
doc.end();
