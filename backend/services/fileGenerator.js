const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const arabicReshaper = require('arabic-reshaper');

const FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'NotoNaskhArabic-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'NotoNaskhArabic-Bold.ttf');

function ar(text) {
  if (!text) return '';
  return arabicReshaper.convertArabic(String(text));
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function getSheetName(fileType) {
  const names = {
    quantity_sheet: 'جدول الكميات', price_sheet: 'جدول الأسعار',
    cost_sheet: 'كشف التكاليف', offer: 'عرض سعر',
    materials_list: 'قائمة المواد', labor_list: 'قائمة العمالة',
    equipment_list: 'قائمة المعدات', procurement_plan: 'خطة المشتريات',
    summary: 'ملخص المشروع',
  };
  return names[fileType] || fileType;
}

function buildHTML({ project, items, fileType, sheetName }) {
  const totalCost = items.reduce((s, i) => s + (i.total_cost || 0), 0);
  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });

  const headerRow = `<tr style="background:#1e3a5f;color:#fff;">
    <th style="padding:8px 6px;font-size:11px;border:1px solid #1e3a5f;">الرمز</th>
    <th style="padding:8px 6px;font-size:11px;border:1px solid #1e3a5f;">البند</th>
    <th style="padding:8px 6px;font-size:11px;border:1px solid #1e3a5f;">التصنيف</th>
    <th style="padding:8px 6px;font-size:11px;border:1px solid #1e3a5f;">الوحدة</th>
    <th style="padding:8px 6px;font-size:11px;border:1px solid #1e3a5f;">الكمية</th>
    <th style="padding:8px 6px;font-size:11px;border:1px solid #1e3a5f;">سعر الوحدة</th>
    <th style="padding:8px 6px;font-size:11px;border:1px solid #1e3a5f;">الإجمالي</th>
  </tr>`;

  let bodyRows = '';
  for (const item of items) {
    const unitPrice = (item.material_cost || 0) + (item.labor_cost || 0) + (item.equipment_cost || 0) + (item.transport_cost || 0);
    bodyRows += `<tr style="border-bottom:1px solid #e0e0e0;">
      <td style="padding:6px;font-size:10px;border:1px solid #e0e0e0;text-align:center;">${esc(item.code)}</td>
      <td style="padding:6px;font-size:10px;border:1px solid #e0e0e0;text-align:right;">${esc(item.name_ar)}</td>
      <td style="padding:6px;font-size:10px;border:1px solid #e0e0e0;text-align:center;">${esc(item.category)}</td>
      <td style="padding:6px;font-size:10px;border:1px solid #e0e0e0;text-align:center;">${esc(item.unit)}</td>
      <td style="padding:6px;font-size:10px;border:1px solid #e0e0e0;text-align:center;">${fmt(item.quantity)}</td>
      <td style="padding:6px;font-size:10px;border:1px solid #e0e0e0;text-align:center;">${fmt(unitPrice)}</td>
      <td style="padding:6px;font-size:10px;border:1px solid #e0e0e0;text-align:center;">${fmt(item.total_cost)}</td>
    </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap');
* { margin:0; padding:0; box-sizing:border-box; }
body {
  font-family: 'Noto Naskh Arabic', 'Traditional Arabic', 'Arial', sans-serif;
  direction: rtl; text-align: right;
  color: #1a1a1a; padding: 0; margin: 0;
  font-size: 11px; line-height: 1.6;
}
.page { width: 100%; min-height: 100%; position: relative; }
.header { background: #1e3a5f; color: #fff; padding: 20px 30px; text-align: center; }
.header h1 { font-size: 20px; margin-bottom: 4px; font-weight: 700; }
.header .sub { font-size: 12px; opacity: 0.85; }
.info-bar {
  background: #f5f7fa; padding: 12px 30px; border-bottom: 2px solid #1e3a5f;
  display: flex; flex-wrap: wrap; gap: 8px 20px; font-size: 11px;
}
.info-bar span { color: #555; }
.info-bar strong { color: #1a1a1a; }
.section-title {
  font-size: 14px; font-weight: 700; padding: 10px 30px 6px; color: #1e3a5f;
  border-bottom: 1px solid #d0d0d0; margin: 0;
}
table {
  width: 96%; margin: 8px auto; border-collapse: collapse; direction: rtl;
}
th { text-align: center; font-weight: 700; }
td { text-align: center; }
td:first-child, th:first-child { text-align: center; }
td:nth-child(2) { text-align: right; }
.total-row { background: #f0f4fa; font-weight: 700; }
.total-row td { padding: 8px 6px; border: 1px solid #c0d0e0; font-size: 11px; }
.signatures {
  display: flex; justify-content: space-around; margin: 40px 30px 20px;
  font-size: 11px;
}
.signatures div { text-align: center; }
.signatures .line { width: 180px; border-bottom: 1px solid #333; margin: 4px auto 2px; height: 24px; }
.footer {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: #f5f7fa; padding: 6px 20px; font-size: 9px; color: #888;
  text-align: center; border-top: 1px solid #e0e0e0;
  direction: ltr;
}
.footer span { margin: 0 10px; }
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .footer { position: fixed; bottom: 0; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>${esc(project.title)}</h1>
    <div class="sub">${esc(sheetName)}</div>
  </div>
  <div class="info-bar">
    <span>النوع: <strong>${esc(project.project_type || '—')}</strong></span>
    <span>المبنى: <strong>${esc(project.building_type || '—')}</strong></span>
    <span>المدينة: <strong>${esc(project.city || '—')}</strong></span>
    <span>المساحة: <strong>${project.area ? fmt(project.area) + ' م²' : '—'}</strong></span>
    <span>التشطيب: <strong>${esc(project.finish_level || '—')}</strong></span>
    <span>التاريخ: <strong>${esc(dateStr)}</strong></span>
    <span>الحالة: <strong>${esc(project.status || 'مسودة')}</strong></span>
  </div>
  <h2 class="section-title">${esc(sheetName)}</h2>
  <table>
    <thead>${headerRow}</thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <table style="width:96%;margin:4px auto;">
    <tr class="total-row">
      <td colspan="6" style="text-align:left;padding:8px;border:1px solid #c0d0e0;font-size:11px;">
        الإجمالي الكلي للمشروع
      </td>
      <td style="text-align:center;padding:8px;border:1px solid #c0d0e0;font-size:12px;">
        ${fmt(totalCost)} ريال
      </td>
    </tr>
  </table>
  <div class="signatures">
    <div><div class="line"></div>المهندس</div>
    <div><div class="line"></div>العميل</div>
    <div><div class="line"></div>التاريخ</div>
  </div>
  <div class="footer">
    <span>المقاول الإلكتروني</span>
    <span>|</span>
    <span>الإصدار: 1</span>
    <span>|</span>
    <span>الحالة: ${esc(project.status)}</span>
  </div>
</div>
</body>
</html>`;
}

async function generatePDF({ projectId, fileType, outputDir }) {
  const PDFDocument = require('pdfkit');
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return { success: false, error: 'المشروع غير موجود' };

  const items = db.prepare('SELECT * FROM project_items WHERE project_id = ? AND is_approved = 1 AND quantity > 0 ORDER BY sort_order, category, name_ar').all(projectId);
  const sheetName = getSheetName(fileType);
  const outputPath = path.join(outputDir || path.join(__dirname, '..', 'generated'), `${project.title}_${fileType}_${Date.now()}.pdf`);
  ensureDir(path.dirname(outputPath));

  const hasFont = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);

  const doc = new PDFDocument({
    size: 'A4', margin: 40,
    info: { Title: project.title, Author: 'المقاول الإلكتروني' }
  });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  if (hasFont) {
    doc.registerFont('Arabic', FONT_REGULAR);
    doc.registerFont('Arabic-Bold', FONT_BOLD);
  }

  const FONT = hasFont ? 'Arabic' : 'Helvetica';
  const FONT_B = hasFont ? 'Arabic-Bold' : 'Helvetica';
  const pageW = doc.page.width - 80;
  const marginRight = 40;

  function t(text, opts = {}) {
    const str = String(text || '');
    const display = hasFont ? ar(str) : str;
    const defaults = { align: 'right', rtl: true, features: hasFont ? ['arab'] : [] };
    doc.font(opts.bold ? FONT_B : FONT)
      .fontSize(opts.size || 11)
      .fillColor(opts.color || '#000000')
      .text(display, marginRight, doc.y, { ...defaults, ...opts });
  }

  // Header
  doc.font(FONT_B).fontSize(18).fillColor('#1e3a5f')
    .text(ar(project.title), { align: 'right' });
  doc.moveDown(0.3);
  doc.font(FONT).fontSize(12).fillColor('#666')
    .text(ar(sheetName), { align: 'right' });
  doc.moveDown(0.5);

  // Info bar
  const infoItems = [
    `النوع: ${project.project_type || '—'}`,
    `المبنى: ${project.building_type || '—'}`,
    `المدينة: ${project.city || '—'}`,
    `المساحة: ${project.area ? fmt(project.area) + ' م²' : '—'}`,
    `التشطيب: ${project.finish_level || '—'}`,
    `الحالة: ${project.status || 'مسودة'}`,
  ];

  const yStart = doc.y;
  let xOff = pageW;
  doc.font(FONT).fontSize(8).fillColor('#555');
  for (const info of infoItems) {
    const textW = doc.widthOfString(ar(info));
    xOff -= textW + 15;
    if (xOff < 0) { doc.y += 10; xOff = pageW - textW; }
    doc.text(ar(info), marginRight + xOff, doc.y, { width: textW + 10, align: 'right' });
  }
  if (doc.y > yStart + 12) doc.y = Math.max(doc.y, yStart + 22);
  else doc.y = yStart + 14;

  doc.moveDown(0.3);
  const lineY = doc.y;
  doc.strokeColor('#1e3a5f').lineWidth(2).moveTo(marginRight, lineY).lineTo(marginRight + pageW, lineY).stroke();
  doc.moveDown(0.5);

  // Table
  const colDefs = [
    { key: 'code', label: 'الرمز', w: 50, align: 'center' },
    { key: 'name_ar', label: 'البند', w: 150, align: 'right' },
    { key: 'category', label: 'التصنيف', w: 80, align: 'center' },
    { key: 'unit', label: 'الوحدة', w: 50, align: 'center' },
    { key: 'qty', label: 'الكمية', w: 60, align: 'center' },
    { key: 'unit_price', label: 'سعر الوحدة', w: 70, align: 'center' },
    { key: 'total', label: 'الإجمالي', w: 80, align: 'center' },
  ];

  function drawHeader(y) {
    let x = marginRight;
    for (const c of colDefs) {
      doc.rect(x, y, c.w, 22).fill('#1e3a5f');
      doc.fillColor('#fff').font(FONT_B).fontSize(9)
        .text(ar(c.label), x + 2, y + 4, { width: c.w - 4, align: c.align });
      doc.fillColor('#000');
      x += c.w;
    }
  }

  function drawRow(item, y, fill) {
    let x = marginRight;
    if (fill) doc.rect(x, y, pageW, 18).fill(fill);
    const vals = [
      item.code, item.name_ar, item.category, item.unit,
      fmt(item.quantity),
      fmt((item.material_cost || 0) + (item.labor_cost || 0) + (item.equipment_cost || 0) + (item.transport_cost || 0)),
      fmt(item.total_cost)
    ];
    doc.font(FONT).fontSize(8).fillColor('#000');
    for (let i = 0; i < colDefs.length; i++) {
      const c = colDefs[i];
      doc.text(ar(vals[i] || ''), x + 2, y + 3, { width: c.w - 4, align: c.align, lineBreak: false });
      x += c.w;
    }
  }

  const tableTop = doc.y;
  const rowH = 18;
  const pageBottom = doc.page.height - 60;

  drawHeader(tableTop);
  let yPos = tableTop + 22;
  let totalSum = 0;

  for (const item of items) {
    if (yPos + rowH > pageBottom) {
      doc.addPage();
      yPos = 50;
      drawHeader(yPos);
      yPos += 22;
    }
    drawRow(item, yPos, yPos % 2 === 0 ? '#f8f9fa' : null);
    yPos += rowH;
    totalSum += item.total_cost || 0;
  }

  // Total row
  if (yPos + 22 > pageBottom) { doc.addPage(); yPos = 50; }
  yPos += 4;
  doc.rect(marginRight, yPos, pageW, 22).fill('#eef3f7');
  doc.fillColor('#000').font(FONT_B).fontSize(10);
  doc.text(ar('الإجمالي الكلي للمشروع'), marginRight + pageW - 350, yPos + 4, { width: 350, align: 'left' });
  doc.text(ar(`${fmt(totalSum)} ريال`), marginRight + 120, yPos + 4, { width: 200, align: 'center' });

  // Signatures
  yPos += 40;
  if (yPos + 60 > doc.page.height - 60) { doc.addPage(); yPos = 50; }
  doc.font(FONT_B).fontSize(10).fillColor('#333');
  doc.text(ar('الموافقات:'), marginRight, yPos, { align: 'right' });
  yPos += 22;
  const sigX = [marginRight, marginRight + 200, marginRight + 400];
  doc.font(FONT).fontSize(9);
  for (const label of ['المهندس', 'العميل', 'التاريخ']) {
    doc.text(ar(label + ': __________________'), sigX[0], yPos, { width: 180, align: 'center' });
    yPos += 20;
  }

  // Footer
  doc.font(FONT).fontSize(7).fillColor('#999');
  doc.text(ar(`تم الإنشاء بواسطة: المقاول الإلكتروني | الإصدار: 1 | الحالة: ${project.status}`),
    marginRight, doc.page.height - 40, { align: 'center' });

  doc.end();

  return new Promise((resolve) => {
    stream.on('finish', () => {
      saveGeneratedFile(projectId, fileType, outputPath);
      resolve({ success: true, filePath: outputPath, fileName: path.basename(outputPath) });
    });
    stream.on('error', (err) => resolve({ success: false, error: err.message }));
  });
}

async function generateExcel({ projectId, fileType, outputDir }) {
  const ExcelJS = require('exceljs');
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return { success: false, error: 'المشروع غير موجود' };

  const items = db.prepare('SELECT * FROM project_items WHERE project_id = ? AND is_approved = 1 AND quantity > 0 ORDER BY sort_order, category, name_ar').all(projectId);
  const sheetName = getSheetName(fileType);
  const outputPath = path.join(outputDir || path.join(__dirname, '..', 'generated'), `${project.title}_${fileType}_${Date.now()}.xlsx`);
  ensureDir(path.dirname(outputPath));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'المقاول الإلكتروني';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });

  // Title
  sheet.mergeCells('A1:G1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = project.title;
  titleCell.font = { bold: true, size: 16, name: 'Noto Naskh Arabic' };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 35;

  // Info line
  const dateStr = new Date().toLocaleDateString('ar-SA');
  sheet.mergeCells('A2:G2');
  const infoCell = sheet.getCell('A2');
  infoCell.value = `النوع: ${project.project_type || '—'} | التشطيب: ${project.finish_level || '—'} | المساحة: ${project.area || '—'} م² | التاريخ: ${dateStr}`;
  infoCell.font = { size: 10, name: 'Noto Naskh Arabic', color: { argb: 'FF666666' } };
  infoCell.alignment = { horizontal: 'center' };
  sheet.getRow(2).height = 22;

  // Column headers
  sheet.columns = [
    { header: 'الرمز', key: 'code', width: 14 },
    { header: 'البند', key: 'name_ar', width: 40 },
    { header: 'التصنيف', key: 'category', width: 18 },
    { header: 'الوحدة', key: 'unit', width: 10 },
    { header: 'الكمية', key: 'quantity', width: 12 },
    { header: 'سعر الوحدة', key: 'unit_price', width: 14 },
    { header: 'الإجمالي', key: 'total_cost', width: 16 },
  ];

  const headerRow = sheet.getRow(3);
  headerRow.font = { bold: true, size: 11, name: 'Noto Naskh Arabic', color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 28;

  let totalSum = 0;
  for (const item of items) {
    const unitPrice = (item.material_cost || 0) + (item.labor_cost || 0) + (item.equipment_cost || 0) + (item.transport_cost || 0);
    const row = sheet.addRow({
      code: item.code,
      name_ar: item.name_ar,
      category: item.category,
      unit: item.unit,
      quantity: item.quantity,
      unit_price: unitPrice,
      total_cost: item.total_cost || 0,
    });
    row.alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('name_ar').alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
    totalSum += item.total_cost || 0;
  }

  const summaryRow = sheet.addRow({
    name_ar: 'الإجمالي الكلي',
    total_cost: totalSum,
  });
  summaryRow.font = { bold: true, size: 11, name: 'Noto Naskh Arabic' };
  summaryRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
  summaryRow.alignment = { horizontal: 'center', vertical: 'middle' };
  summaryRow.getCell('name_ar').alignment = { horizontal: 'left', vertical: 'middle' };

  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, paperSize: 9, margins: { top: 0.5, bottom: 0.5, left: 0.3, right: 0.3 } };

  await workbook.xlsx.writeFile(outputPath);
  saveGeneratedFile(projectId, fileType, outputPath);
  return { success: true, filePath: outputPath, fileName: path.basename(outputPath) };
}

async function generateDocx({ projectId, fileType, outputDir }) {
  try {
    const docx = require('docx');
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return { success: false, error: 'المشروع غير موجود' };

    const items = db.prepare('SELECT * FROM project_items WHERE project_id = ? AND is_approved = 1 AND quantity > 0 ORDER BY sort_order, category, name_ar').all(projectId);
    const sheetName = getSheetName(fileType);
    const outputPath = path.join(outputDir || path.join(__dirname, '..', 'generated'), `${project.title}_${fileType}_${Date.now()}.docx`);
    ensureDir(path.dirname(outputPath));

    const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, TabStopPosition, TabStopType, BorderStyle } = docx;
    const dateStr = new Date().toLocaleDateString('ar-SA');
    const totalCost = items.reduce((s, i) => s + (i.total_cost || 0), 0);

    const headerCells = ['الرمز', 'البند', 'التصنيف', 'الوحدة', 'الكمية', 'سعر الوحدة', 'الإجمالي'].map(h =>
      new TableCell({
        children: [new Paragraph({ text: h, alignment: AlignmentType.CENTER, bold: true, rtl: true })],
        width: { size: 14, type: WidthType.PERCENTAGE },
        shading: { fill: '1E3A5F', type: 'clear' },
      })
    );

    const headerRow = new TableRow({
      tableHeader: true,
      children: headerCells,
    });

    const dataRows = items.map(item => {
      const unitPrice = (item.material_cost || 0) + (item.labor_cost || 0) + (item.equipment_cost || 0) + (item.transport_cost || 0);
      return new TableRow({
        children: [item.code, item.name_ar, item.category, item.unit, String(item.quantity), String(unitPrice.toFixed(2)), String((item.total_cost || 0).toFixed(2))].map((v, i) =>
          new TableCell({
            children: [new Paragraph({ text: v || '', alignment: i === 0 ? AlignmentType.CENTER : AlignmentType.RIGHT, rtl: true })],
            width: { size: 14, type: WidthType.PERCENTAGE },
          })
        ),
      });
    });

    const totalRow = new TableRow({
      children: ['', '', '', '', '', 'الإجمالي الكلي', totalCost.toFixed(2)].map((v, i) =>
        new TableCell({
          children: [new Paragraph({ text: v || '', alignment: AlignmentType.CENTER, bold: i >= 5, rtl: true })],
          width: { size: 14, type: WidthType.PERCENTAGE },
          shading: i >= 5 ? { fill: 'E8F0FE', type: 'clear' } : undefined,
        })
      ),
    });

    const doc = new Document({
      sections: [{
        properties: {
          bidi: true,
          rtl: true,
          defaultTabStop: 500,
        },
        children: [
          new Paragraph({ text: project.title, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, rtl: true, spacing: { after: 100 } }),
          new Paragraph({ text: sheetName, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, rtl: true, spacing: { after: 200 } }),
          new Paragraph({
            text: `النوع: ${project.project_type || '—'} | المبنى: ${project.building_type || '—'} | المدينة: ${project.city || '—'} | المساحة: ${project.area || '—'} م² | التشطيب: ${project.finish_level || '—'} | التاريخ: ${dateStr} | الحالة: ${project.status || 'مسودة'}`,
            alignment: AlignmentType.CENTER, rtl: true, spacing: { after: 200 },
          }),
          new Table({ rows: [headerRow, ...dataRows, totalRow], width: { size: 100, type: WidthType.PERCENTAGE } }),
          new Paragraph({ spacing: { before: 400 }, rtl: true }),
          new Paragraph({ text: 'الموافقات:', bold: true, alignment: AlignmentType.RIGHT, rtl: true, spacing: { after: 200 } }),
          new Paragraph({ text: 'المهندس: __________________', alignment: AlignmentType.RIGHT, rtl: true }),
          new Paragraph({ text: 'العميل: __________________', alignment: AlignmentType.RIGHT, rtl: true }),
          new Paragraph({ text: `التاريخ: ${dateStr}`, alignment: AlignmentType.RIGHT, rtl: true }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);
    saveGeneratedFile(projectId, fileType, outputPath);
    return { success: true, filePath: outputPath, fileName: path.basename(outputPath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function generateFile({ projectId, fileType, format = 'xlsx', outputDir }) {
  if (format === 'xlsx') return generateExcel({ projectId, fileType, outputDir });
  if (format === 'pdf') return generatePDF({ projectId, fileType, outputDir });
  if (format === 'docx') return generateDocx({ projectId, fileType, outputDir });
  return { success: false, error: 'صيغة غير مدعومة' };
}

function saveGeneratedFile(projectId, fileType, filePath) {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO generated_files (id, project_id, file_name, file_type, file_path, status, version)
      VALUES (?, ?, ?, ?, ?, 'مسودة', 1)
    `).run(uuidv4(), projectId, path.basename(filePath), fileType, filePath);
  } catch (e) {
    console.error('Failed to save generated file record:', e.message);
  }
}

function generateHTMLString({ projectId, fileType }) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;
  const items = db.prepare('SELECT * FROM project_items WHERE project_id = ? AND is_approved = 1 AND quantity > 0 ORDER BY sort_order, category, name_ar').all(projectId);
  return buildHTML({ project, items, fileType, sheetName: getSheetName(fileType) });
}

module.exports = {
  generateExcel, generatePDF, generateDocx, generateFile, generateHTMLString,
};
