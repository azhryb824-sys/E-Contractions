const path = require('path');
const fs = require('fs');

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtInt(n) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 0 }).format(n);
}

function arDate(d) {
  if (!d) d = new Date();
  if (typeof d === 'string') d = new Date(d);
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function mergeOptions(opts) {
  return {
    format: 'pdf',
    font: 'Arial',
    fontSize: 11,
    headerColor: '#1a5276',
    showPrices: false,
    showConfidence: true,
    showCalculationMethod: true,
    classificationFilter: [],
    pageSize: 'A4',
    orientation: 'portrait',
    margins: { top: 15, bottom: 15, left: 20, right: 20 },
    watermark: null,
    dateFormat: 'dd/mm/yyyy',
    numberFormat: '#,##0.00',
    language: 'ar',
    ...opts,
  };
}

const COMPANY_NAME = 'المقاول الإلكتروني';
const COMPANY_TAGLINE = 'نظام إدارة المقاولات الذكي';

function classifyItems(items, filters) {
  if (!filters || filters.length === 0) return items;
  return items.filter(i => filters.includes(i.classification));
}

function estimatePages(html, pageSize) {
  const approxCharsPerPage = pageSize === 'A3' ? 6000 : 4000;
  return Math.max(1, Math.ceil(html.length / approxCharsPerPage));
}

// ─── PDF: Generate HTML with print CSS ────────────────────────────────

function generatePDF(data, options) {
  const opts = mergeOptions(options);
  const html = buildFullHTML(data, opts);
  const pages = estimatePages(html, opts.pageSize);
  const buf = Buffer.from(html, 'utf-8');
  const filename = `${sanitizeFilename(data.project.name)}_تقرير_${Date.now()}.pdf`;
  return { buffer: buf, filename, pages, size: buf.length, html };
}

// ─── Word: HTML with Word META tags (saved as .doc) ──────────────────

function generateWord(data, options) {
  const opts = mergeOptions(options);
  const html = buildWordHTML(data, opts);
  const buf = Buffer.from(html, 'utf-8');
  const filename = `${sanitizeFilename(data.project.name)}_تقرير_${Date.now()}.doc`;
  return { buffer: buf, filename, size: buf.length, html };
}

// ─── Excel: HTML table with Excel META tags (saved as .xls) ──────────

function generateExcel(data, options) {
  const opts = mergeOptions(options);
  const html = buildExcelHTML(data, opts);
  const buf = Buffer.from(html, 'utf-8');
  const filename = `${sanitizeFilename(data.project.name)}_جدول_الكميات_${Date.now()}.xls`;
  return { buffer: buf, filename, size: buf.length, html, sheets: 4 };
}

// ─── Generate all three ──────────────────────────────────────────────

function generateAll(data, options) {
  const pdf = generatePDF(data, options);
  const word = generateWord(data, options);
  const excel = generateExcel(data, options);
  return { pdf, word, excel };
}

// ─── Bill of Quantities ──────────────────────────────────────────────

function generateBOQ(data, options) {
  const opts = mergeOptions({ ...options, format: 'all' });
  const pdf = generatePDF(data, opts);
  const word = generateWord(data, opts);
  const excel = generateExcel(data, opts);
  return { pdf, word, excel };
}

// ─── Single-section report ───────────────────────────────────────────

function generateSectionReport(section, projectInfo, options) {
  const opts = mergeOptions(options);
  const wrappedData = {
    project: projectInfo,
    assumptions: [],
    sections: [section],
    warnings: [],
    total_quantity_items: section.items ? section.items.length : 0,
    total_estimated_cost: section.section_total || null,
  };
  const pdf = generatePDF(wrappedData, opts);
  const word = generateWord(wrappedData, opts);
  return { pdf, word };
}

// ─── Estimate file size ──────────────────────────────────────────────

function estimateFileSize(data, type) {
  const opts = mergeOptions({});
  const itemCount = data.sections ? data.sections.reduce((s, sec) => s + (sec.items ? sec.items.length : 0), 0) : 0;
  const pages = Math.max(1, Math.ceil(itemCount / 25));
  let estimatedBytes = 0;
  if (type === 'pdf') estimatedBytes = pages * 25000 + 5000;
  else if (type === 'word') estimatedBytes = pages * 18000 + 3000;
  else if (type === 'excel') estimatedBytes = itemCount * 200 + 8000;
  else if (type === 'all') estimatedBytes = (pages * 25000 + 5000) + (pages * 18000 + 3000) + (itemCount * 200 + 8000);
  else estimatedBytes = pages * 20000;
  return { estimatedBytes, pages, rows: itemCount };
}

// ─── Cleanup ─────────────────────────────────────────────────────────

function cleanup(allFiles) {
  let deleted = 0;
  const errors = [];
  if (!Array.isArray(allFiles)) allFiles = [allFiles];
  for (const f of allFiles) {
    if (f && f.buffer) continue;
    const fp = typeof f === 'string' ? f : (f && f.filePath ? f.filePath : null);
    if (!fp) continue;
    try {
      if (fs.existsSync(fp)) { fs.unlinkSync(fp); deleted++; }
    } catch (e) {
      errors.push({ file: fp, error: e.message });
    }
  }
  return { deleted, errors };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function sanitizeFilename(name) {
  return String(name).replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').slice(0, 100);
}

function getSectionTotal(section) {
  if (section.section_total != null) return section.section_total;
  if (!section.items) return 0;
  return section.items.reduce((s, i) => s + (i.total_cost || 0), 0);
}

function getGrandTotal(data) {
  if (data.total_estimated_cost != null) return data.total_estimated_cost;
  if (!data.sections) return 0;
  return data.sections.reduce((s, sec) => s + getSectionTotal(sec), 0);
}

function getTotalItems(data) {
  if (data.total_quantity_items != null) return data.total_quantity_items;
  if (!data.sections) return 0;
  return data.sections.reduce((s, sec) => s + (sec.items ? sec.items.length : 0), 0);
}

function getFilteredSections(data, opts) {
  if (!data.sections) return [];
  if (!opts.classificationFilter || opts.classificationFilter.length === 0) return data.sections;
  return data.sections.map(sec => ({
    ...sec,
    items: classifyItems(sec.items || [], opts.classificationFilter),
  })).filter(sec => sec.items.length > 0);
}

// ─── Tabulate items for reuse ────────────────────────────────────────

function itemsTableRows(items, opts, showTotalCost) {
  let rows = '';
  let idx = 0;
  for (const item of items) {
    idx++;
    const bg = idx % 2 === 0 ? '#f8f9fa' : '#ffffff';
    rows += `<tr style="background:${bg};border-bottom:1px solid #e0e0e0;">
      <td style="padding:5px 4px;font-size:${opts.fontSize - 1}px;border:1px solid #e0e0e0;text-align:center;">${esc(item.code)}</td>
      <td style="padding:5px 4px;font-size:${opts.fontSize - 1}px;border:1px solid #e0e0e0;text-align:right;">${esc(item.name_ar)}</td>
      <td style="padding:5px 4px;font-size:${opts.fontSize - 1}px;border:1px solid #e0e0e0;text-align:center;">${esc(item.category || '-')}</td>
      <td style="padding:5px 4px;font-size:${opts.fontSize - 1}px;border:1px solid #e0e0e0;text-align:center;">${esc(item.unit || '-')}</td>
      <td style="padding:5px 4px;font-size:${opts.fontSize - 1}px;border:1px solid #e0e0e0;text-align:center;">${fmt(item.quantity)}</td>`;
    if (opts.showConfidence) {
      rows += `<td style="padding:5px 4px;font-size:${opts.fontSize - 1}px;border:1px solid #e0e0e0;text-align:center;">${item.confidence != null ? Math.round(item.confidence * 100) + '%' : '—'}</td>`;
    }
    if (opts.showPrices) {
      rows += `<td style="padding:5px 4px;font-size:${opts.fontSize - 1}px;border:1px solid #e0e0e0;text-align:center;">${item.unit_price != null ? fmt(item.unit_price) : '—'}</td>`;
    }
    if (showTotalCost && opts.showPrices) {
      rows += `<td style="padding:5px 4px;font-size:${opts.fontSize - 1}px;border:1px solid #e0e0e0;text-align:center;">${item.total_cost != null ? fmt(item.total_cost) : '—'}</td>`;
    }
    if (opts.showCalculationMethod) {
      rows += `<td style="padding:5px 4px;font-size:${opts.fontSize - 2}px;border:1px solid #e0e0e0;text-align:right;color:#666;">${esc(item.calculation_method || '-')}</td>`;
    }
    rows += '</tr>';
  }
  return rows;
}

function itemsTableHeaders(opts, showTotalCost) {
  let cols = `
    <th style="padding:6px 4px;font-size:${opts.fontSize}px;border:1px solid ${opts.headerColor};background:${opts.headerColor};color:#fff;text-align:center;">الرمز</th>
    <th style="padding:6px 4px;font-size:${opts.fontSize}px;border:1px solid ${opts.headerColor};background:${opts.headerColor};color:#fff;text-align:center;">البند</th>
    <th style="padding:6px 4px;font-size:${opts.fontSize}px;border:1px solid ${opts.headerColor};background:${opts.headerColor};color:#fff;text-align:center;">التصنيف</th>
    <th style="padding:6px 4px;font-size:${opts.fontSize}px;border:1px solid ${opts.headerColor};background:${opts.headerColor};color:#fff;text-align:center;">الوحدة</th>
    <th style="padding:6px 4px;font-size:${opts.fontSize}px;border:1px solid ${opts.headerColor};background:${opts.headerColor};color:#fff;text-align:center;">الكمية</th>`;
  if (opts.showConfidence) {
    cols += `<th style="padding:6px 4px;font-size:${opts.fontSize}px;border:1px solid ${opts.headerColor};background:${opts.headerColor};color:#fff;text-align:center;">الثقة</th>`;
  }
  if (opts.showPrices) {
    cols += `<th style="padding:6px 4px;font-size:${opts.fontSize}px;border:1px solid #2e86c1;background:#2e86c1;color:#fff;text-align:center;">سعر الوحدة</th>`;
  }
  if (showTotalCost && opts.showPrices) {
    cols += `<th style="padding:6px 4px;font-size:${opts.fontSize}px;border:1px solid #2e86c1;background:#2e86c1;color:#fff;text-align:center;">الإجمالي</th>`;
  }
  if (opts.showCalculationMethod) {
    cols += `<th style="padding:6px 4px;font-size:${opts.fontSize}px;border:1px solid ${opts.headerColor};background:${opts.headerColor};color:#fff;text-align:center;">طريقة الحساب</th>`;
  }
  return cols;
}

// ─── CSS styles ──────────────────────────────────────────────────────

function getBaseCSS(opts) {
  return `
    @page { size: ${opts.pageSize} ${opts.orientation}; margin: ${opts.margins.top}mm ${opts.margins.right}mm ${opts.margins.bottom}mm ${opts.margins.left}mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: '${opts.font}', 'Traditional Arabic', 'Times New Roman', 'Arial', sans-serif;
      direction: rtl; text-align: right;
      color: #1a1a1a; font-size: ${opts.fontSize}px; line-height: 1.7;
      background: #fff;
    }
    .page { width: 100%; min-height: 100%; position: relative; }
    .cover-page {
      display: flex; flex-direction: column; justify-content: center; align-items: center;
      height: 100vh; page-break-after: always;
      background: linear-gradient(135deg, #1a5276 0%, #2e86c1 100%);
      color: #fff; text-align: center; padding: 40px;
    }
    .cover-page .logo { font-size: 48px; font-weight: 700; margin-bottom: 10px; letter-spacing: 2px; }
    .cover-page .logo-sub { font-size: 18px; opacity: 0.85; margin-bottom: 40px; }
    .cover-page .project-name { font-size: 28px; font-weight: 700; margin-bottom: 20px; border-bottom: 2px solid rgba(255,255,255,0.3); padding-bottom: 15px; display: inline-block; }
    .cover-page .project-info { font-size: 14px; line-height: 2.2; opacity: 0.9; }
    .cover-page .project-info span { display: block; }
    .cover-page .footer-text { margin-top: 60px; font-size: 12px; opacity: 0.6; }
    .toc-page { page-break-after: always; padding: 30px; }
    .toc-page h2 { font-size: 22px; color: ${opts.headerColor}; margin-bottom: 20px; border-bottom: 2px solid ${opts.headerColor}; padding-bottom: 8px; }
    .toc-page ul { list-style: none; padding: 0; }
    .toc-page ul li { padding: 6px 0; font-size: 13px; border-bottom: 1px dotted #ddd; display: flex; justify-content: space-between; }
    .toc-page ul li a { color: #2e86c1; text-decoration: none; }
    .section-header {
      background: ${opts.headerColor}; color: #fff; padding: 10px 20px; margin: 20px 0 10px;
      font-size: 16px; font-weight: 700; border-radius: 4px;
    }
    .section-header .sec-code { font-size: 12px; opacity: 0.7; margin-right: 10px; }
    .summary-box {
      background: #eef3f7; border: 1px solid #d0ddee; border-radius: 6px;
      padding: 15px 20px; margin: 15px 0; font-size: 13px;
    }
    .summary-box table { width: 100%; border-collapse: collapse; }
    .summary-box td { padding: 5px 8px; border-bottom: 1px solid #d0ddee; }
    .summary-box td:first-child { font-weight: 700; color: ${opts.headerColor}; }
    table.items-table {
      width: 100%; border-collapse: collapse; margin: 5px 0 15px; direction: rtl;
      font-size: ${opts.fontSize - 1}px;
    }
    table.items-table th { font-weight: 700; white-space: nowrap; }
    table.items-table td, table.items-table th { padding: 5px 4px; }
    .total-row { background: #e8f0fe; font-weight: 700; }
    .total-row td { padding: 7px 6px; border: 1px solid #c0d0e0; font-size: ${opts.fontSize}px; }
    .grand-total {
      background: ${opts.headerColor}; color: #fff; font-size: ${opts.fontSize + 2}px;
      padding: 10px 20px; border-radius: 4px; margin: 10px 0; text-align: center;
    }
    .assumptions-list { padding: 0 20px; margin: 10px 0; }
    .assumptions-list li { padding: 4px 0; font-size: ${opts.fontSize - 1}px; color: #555; }
    .warnings-list { padding: 0 20px; margin: 10px 0; }
    .warnings-list li { padding: 4px 0; font-size: ${opts.fontSize - 1}px; color: #c0392b; }
    .signatures {
      display: flex; justify-content: space-around; margin: 50px 20px 30px; page-break-inside: avoid;
    }
    .signatures div { text-align: center; min-width: 180px; }
    .signatures .line { width: 180px; border-bottom: 2px solid #333; margin: 4px auto 2px; height: 30px; }
    .signatures .label { font-size: 11px; color: #888; margin-top: 2px; }
    .page-footer {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: #f5f7fa; padding: 4px 15px; font-size: 8px; color: #999;
      text-align: center; border-top: 1px solid #e0e0e0; direction: ltr;
    }
    .page-footer .page-number:before { content: "صفحة "; }
    .page-footer .page-number:after { content: ""; }
    .watermark {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 80px; opacity: 0.06; color: #333; pointer-events: none; z-index: 999;
      font-weight: 700; white-space: nowrap;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      .page-footer { position: fixed; bottom: 0; }
      .no-break { page-break-inside: avoid; }
      .cover-page { page-break-after: always; }
      .toc-page { page-break-after: always; }
    }
  `;
}

// ─── Build main HTML ─────────────────────────────────────────────────

function buildFullHTML(data, opts) {
  const filteredSections = getFilteredSections(data, opts);
  const grandTotal = getGrandTotal(data);
  const totalItems = getTotalItems(data);
  const showCost = opts.showPrices;
  const now = arDate();
  const sections = data.sections || [];

  let tocItems = '';
  sections.forEach((sec, i) => {
    const secTotal = getSectionTotal(sec);
    tocItems += `<li><a href="#sec-${i + 1}">${esc(sec.name)} <span style="color:#999;font-size:11px;">(${sec.items ? sec.items.length : 0} بند)</span></a> <span>${showCost && secTotal != null ? fmt(secTotal) : ''}</span></li>`;
  });

  let sectionsHTML = '';
  sections.forEach((sec, i) => {
    const items = filteredSections.length ? (filteredSections.find(s => s.code === sec.code) || sec).items : sec.items;
    if (!items || items.length === 0) return;
    const secTotal = getSectionTotal(sec);
    const rows = itemsTableRows(items, opts, showCost);
    const headers = itemsTableHeaders(opts, showCost);
    sectionsHTML += `
      <div id="sec-${i + 1}" class="no-break">
        <div class="section-header">
          ${esc(sec.name)} <span class="sec-code">${esc(sec.code)}</span>
          ${showCost && secTotal != null ? `<span style="float:left;font-size:13px;">${fmt(secTotal)} ريال</span>` : ''}
        </div>
        <table class="items-table">
          <thead><tr>${headers}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${showCost && secTotal != null ? `
        <table class="items-table" style="margin-top:-10px;">
          <tr class="total-row">
            <td colspan="${showCost ? (opts.showConfidence ? (opts.showCalculationMethod ? '6' : '5') : (opts.showCalculationMethod ? '5' : '4')) : (opts.showConfidence ? (opts.showCalculationMethod ? '4' : '3') : (opts.showCalculationMethod ? '3' : '2'))}" style="text-align:left;padding:6px 8px;border:1px solid #c0d0e0;">
              إجمالي ${esc(sec.name)}
            </td>
            <td style="text-align:center;padding:6px 8px;border:1px solid #c0d0e0;">${fmt(secTotal)} ريال</td>
          </tr>
        </table>` : ''}
      </div>`;
  });

  let assumptionsHTML = '';
  if (data.assumptions && data.assumptions.length > 0) {
    assumptionsHTML = `
      <div class="no-break">
        <div class="section-header">الافتراضات المعتمدة</div>
        <ul class="assumptions-list">
          ${data.assumptions.map(a => `<li>• ${esc(a)}</li>`).join('')}
        </ul>
      </div>`;
  }

  let warningsHTML = '';
  if (data.warnings && data.warnings.length > 0) {
    warningsHTML = `
      <div class="no-break">
        <div class="section-header" style="background:#c0392b;">ملاحظات وتحذيرات</div>
        <ul class="warnings-list">
          ${data.warnings.map(w => `<li>⚠ ${esc(w)}</li>`).join('')}
        </ul>
      </div>`;
  }

  let summaryRows = '';
  let summaryItems = [];
  let grandTotalItems = 0;
  sections.forEach(sec => {
    const cnt = sec.items ? sec.items.length : 0;
    const st = getSectionTotal(sec);
    summaryItems.push({ name: sec.name, code: sec.code, count: cnt, total: st });
    grandTotalItems += cnt;
  });
  summaryItems.forEach(si => {
    summaryRows += `<tr><td>${esc(si.name)}</td><td style="text-align:center;">${si.count}</td>${showCost ? `<td style="text-align:center;">${si.total != null ? fmt(si.total) : '—'}</td>` : ''}</tr>`;
  });

  let costSummaryHTML = '';
  if (showCost) {
    costSummaryHTML = `
      <div class="no-break">
        <div class="section-header">ملخص التكاليف</div>
        <div class="summary-box">
          <table>
            <tr><td>إجمالي البنود</td><td>${fmtInt(grandTotalItems)} بند</td></tr>
            <tr><td>إجمالي التكلفة التقديرية</td><td style="font-weight:700;font-size:16px;">${grandTotal != null ? fmt(grandTotal) : '—'} ريال</td></tr>
          </table>
        </div>
      </div>`;
  }

  const watermarkHTML = opts.watermark ? `<div class="watermark">${esc(opts.watermark)}</div>` : '';

  // Cover page and TOC
  const coverPage = `
    <div class="cover-page">
      <div class="logo">🏗️</div>
      <div class="logo-sub">${COMPANY_TAGLINE}</div>
      <div class="project-name">${esc(data.project.name)}</div>
      <div class="project-info">
        <span>📋 نوع المشروع: ${esc(data.project.project_type || '—')}</span>
        <span>🏢 نوع المبنى: ${esc(data.project.building_type || '—')}</span>
        <span>📍 الموقع: ${esc(data.project.city || '—')}</span>
        <span>📐 المساحة: ${data.project.area ? fmt(data.project.area) + ' م²' : '—'}</span>
        ${data.project.rooms ? `<span>🛏️ عدد الغرف: ${data.project.rooms}</span>` : ''}
        ${data.project.bathrooms ? `<span>🚿 عدد الحمامات: ${data.project.bathrooms}</span>` : ''}
        ${data.project.floor_count ? `<span>🏗️ عدد الأدوار: ${data.project.floor_count}</span>` : ''}
        <span>🎯 مستوى التشطيب: ${esc(data.project.finish_level || '—')}</span>
        <span>📊 نطاق العمل: ${esc(data.project.scope || '—')}</span>
        ${data.project.owner ? `<span>👤 المالك: ${esc(data.project.owner)}</span>` : ''}
        <span>📅 التاريخ: ${now}</span>
      </div>
      <div class="footer-text">${COMPANY_NAME} © ${new Date().getFullYear()}</div>
    </div>`;

  const tocPage = tocItems ? `
    <div class="toc-page">
      <h2>فهرس المحتويات</h2>
      <ul>${tocItems}</ul>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="author" content="${COMPANY_NAME}">
<meta name="generator" content="${COMPANY_NAME} v1.0">
<title>${esc(data.project.name)} - تقرير كميات</title>
<style>${getBaseCSS(opts)}</style>
</head>
<body>
${watermarkHTML}
${coverPage}
${tocPage}
<div style="padding: 0 10px;">
  ${costSummaryHTML}
  ${summaryRows ? `
  <div class="no-break">
    <div class="section-header">ملخص الأقسام</div>
    <div class="summary-box">
      <table>
        <tr><th style="text-align:right;">القسم</th><th style="text-align:center;">عدد البنود</th>${showCost ? '<th style="text-align:center;">الإجمالي</th>' : ''}</tr>
        ${summaryRows}
      </table>
    </div>
  </div>` : ''}
  ${sectionsHTML}
  ${grandTotal != null && showCost ? `<div class="grand-total">الإجمالي الكلي للمشروع: ${fmt(grandTotal)} ريال</div>` : ''}
  ${assumptionsHTML}
  ${warningsHTML}
  <div class="signatures">
    <div><div class="line"></div><div class="label">المهندس</div></div>
    <div><div class="line"></div><div class="label">العميل</div></div>
    <div><div class="line"></div><div class="label">التاريخ</div></div>
  </div>
</div>
<div class="page-footer">
  <span>${COMPANY_NAME}</span>
  <span>|</span>
  <span>${esc(data.project.name)}</span>
  <span>|</span>
  <span class="page-number"></span>
  <span>|</span>
  <span>${now}</span>
</div>
</body>
</html>`;
}

// ─── Word HTML ───────────────────────────────────────────────────────

function buildWordHTML(data, opts) {
  const sections = data.sections || [];
  const grandTotal = getGrandTotal(data);
  const showCost = opts.showPrices;

  let body = '';
  sections.forEach(sec => {
    const items = sec.items || [];
    const rows = itemsTableRows(items, opts, showCost);
    const headers = itemsTableHeaders(opts, showCost);
    const secTotal = getSectionTotal(sec);
    body += `
      <h2 style="color:${opts.headerColor};border-bottom:2px solid ${opts.headerColor};padding-bottom:5px;">${esc(sec.name)} (${esc(sec.code)})</h2>
      <table border="1" cellpadding="4" cellspacing="0" style="width:100%;border-collapse:collapse;direction:rtl;font-family:${opts.font};font-size:${opts.fontSize - 1}px;">
        <thead><tr style="background:${opts.headerColor};color:#fff;">${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${showCost && secTotal != null ? `<p style="text-align:left;font-weight:700;">إجمالي ${esc(sec.name)}: ${fmt(secTotal)} ريال</p>` : ''}
    `;
  });

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40" lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="${COMPANY_NAME}">
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
    <w:Bidi>
      <w:RTL/>
    </w:Bidi>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page { size: ${opts.pageSize} ${opts.orientation}; margin: ${opts.margins.top}mm ${opts.margins.right}mm ${opts.margins.bottom}mm ${opts.margins.left}mm; mso-page-orientation: ${opts.orientation === 'landscape' ? 'landscape' : 'portrait'}; }
  body { font-family: '${opts.font}', 'Traditional Arabic', 'Times New Roman', sans-serif; direction: rtl; text-align: right; font-size: ${opts.fontSize}pt; line-height: 1.6; }
  table { direction: rtl; }
  th { text-align: center; font-weight: 700; }
  td { text-align: center; }
  td:nth-child(2) { text-align: right; }
  h1 { color: ${opts.headerColor}; font-size: 22pt; }
  h2 { font-size: 16pt; }
  .footer { text-align: center; font-size: 8pt; color: #999; border-top: 1px solid #ddd; padding-top: 4px; margin-top: 20px; }
  @page Section1 { mso-header-margin: 0; mso-footer-margin: 0; }
</style>
</head>
<body>
  <h1 style="text-align:center;">${esc(data.project.name)}</h1>
  <p style="text-align:center;color:#666;font-size:12pt;">${COMPANY_NAME} - ${COMPANY_TAGLINE}</p>
  <table style="width:100%;direction:rtl;font-size:10pt;margin:10px 0;border-collapse:collapse;">
    <tr><td style="padding:3px 6px;"><strong>نوع المشروع:</strong> ${esc(data.project.project_type || '—')}</td>
        <td style="padding:3px 6px;"><strong>المبنى:</strong> ${esc(data.project.building_type || '—')}</td>
        <td style="padding:3px 6px;"><strong>المدينة:</strong> ${esc(data.project.city || '—')}</td></tr>
    <tr><td style="padding:3px 6px;"><strong>المساحة:</strong> ${data.project.area ? fmt(data.project.area) + ' م²' : '—'}</td>
        <td style="padding:3px 6px;"><strong>التشطيب:</strong> ${esc(data.project.finish_level || '—')}</td>
        <td style="padding:3px 6px;"><strong>التاريخ:</strong> ${arDate()}</td></tr>
  </table>
  <hr style="border:1px solid ${opts.headerColor};">
  ${body}
  ${grandTotal != null && showCost ? `<h3 style="text-align:center;background:${opts.headerColor};color:#fff;padding:10px;">الإجمالي الكلي للمشروع: ${fmt(grandTotal)} ريال</h3>` : ''}
  ${data.assumptions && data.assumptions.length > 0 ? `
  <h2 style="color:${opts.headerColor};margin-top:20px;">الافتراضات</h2>
  <ul>${data.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
  <p style="text-align:center;margin-top:30px;">
    المهندس: __________________ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
    العميل: __________________ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
    التاريخ: __________________
  </p>
  <div class="footer">
    <p>${COMPANY_NAME} © ${new Date().getFullYear()} | ${esc(data.project.name)} | ${arDate()}</p>
  </div>
</body>
</html>`;
}

// ─── Excel HTML ──────────────────────────────────────────────────────

function buildExcelHTML(data, opts) {
  const showCost = opts.showPrices;
  const sections = data.sections || [];
  const grandTotal = getGrandTotal(data);

  // Sheet 1: Bill of quantities
  function buildBOQSheet() {
    let sheet1 = '<table border="1" cellpadding="3" cellspacing="0" style="direction:rtl;font-size:10pt;">';
    sheet1 += `<tr style="background:${opts.headerColor};color:#fff;font-weight:700;">
      <th>الرمز</th><th>البند</th><th>التصنيف</th><th>الوحدة</th><th>الكمية</th>`;
    if (opts.showConfidence) sheet1 += '<th>نسبة الثقة</th>';
    if (showCost) sheet1 += '<th>سعر الوحدة</th><th>الإجمالي</th>';
    if (opts.showCalculationMethod) sheet1 += '<th>طريقة الحساب</th>';
    sheet1 += '</tr>';

    let idx = 0;
    for (const sec of sections) {
      const items = sec.items || [];
      for (const item of items) {
        idx++;
        const bg = idx % 2 === 0 ? '#f2f2f2' : '#ffffff';
        sheet1 += `<tr style="background:${bg};">
          <td style="text-align:center;">${esc(item.code)}</td>
          <td style="text-align:right;">${esc(item.name_ar)}</td>
          <td style="text-align:center;">${esc(item.category || '-')}</td>
          <td style="text-align:center;">${esc(item.unit || '-')}</td>
          <td style="text-align:center;">${fmt(item.quantity)}</td>`;
        if (opts.showConfidence) sheet1 += `<td style="text-align:center;">${item.confidence != null ? Math.round(item.confidence * 100) + '%' : '—'}</td>`;
        if (showCost) {
          sheet1 += `<td style="text-align:center;">${item.unit_price != null ? fmt(item.unit_price) : '—'}</td>`;
          sheet1 += `<td style="text-align:center;">${item.total_cost != null ? fmt(item.total_cost) : '—'}</td>`;
        }
        if (opts.showCalculationMethod) sheet1 += `<td style="text-align:right;color:#666;">${esc(item.calculation_method || '-')}</td>`;
        sheet1 += '</tr>';
      }
    }
    sheet1 += '</table>';
    return sheet1;
  }

  // Sheet 2: Summary
  function buildSummarySheet() {
    let s = '<table border="1" cellpadding="4" cellspacing="0" style="direction:rtl;font-size:11pt;">';
    s += `<tr style="background:${opts.headerColor};color:#fff;font-weight:700;"><th>القسم</th><th>الكود</th><th>عدد البنود</th>${showCost ? '<th>الإجمالي</th>' : ''}</tr>`;
    let totalItems = 0;
    for (const sec of sections) {
      const items = sec.items || [];
      const st = getSectionTotal(sec);
      totalItems += items.length;
      s += `<tr>
        <td style="text-align:right;">${esc(sec.name)}</td>
        <td style="text-align:center;">${esc(sec.code)}</td>
        <td style="text-align:center;">${items.length}</td>
        ${showCost ? `<td style="text-align:center;">${st != null ? fmt(st) : '—'}</td>` : ''}
      </tr>`;
    }
    s += `<tr style="font-weight:700;background:#e8f0fe;">
      <td colspan="2" style="text-align:left;">الإجمالي</td>
      <td style="text-align:center;">${totalItems}</td>
      ${showCost ? `<td style="text-align:center;">${grandTotal != null ? fmt(grandTotal) : '—'}</td>` : ''}
    </tr>`;
    s += '</table>';
    return s;
  }

  // Sheet 3: Assumptions
  function buildAssumptionsSheet() {
    const items = data.assumptions || [];
    let s = '<table border="1" cellpadding="4" cellspacing="0" style="direction:rtl;font-size:11pt;">';
    s += `<tr style="background:${opts.headerColor};color:#fff;font-weight:700;"><th>م</th><th>الافتراض</th></tr>`;
    items.forEach((a, i) => {
      s += `<tr><td style="text-align:center;">${i + 1}</td><td style="text-align:right;">${esc(a)}</td></tr>`;
    });
    s += '</table>';
    return s;
  }

  // Sheet 4: Items by category
  function buildByCategorySheet() {
    const catMap = {};
    for (const sec of sections) {
      const items = sec.items || [];
      for (const item of items) {
        const cat = item.category || 'أخرى';
        if (!catMap[cat]) catMap[cat] = [];
        catMap[cat].push(item);
      }
    }
    let s = '<table border="1" cellpadding="3" cellspacing="0" style="direction:rtl;font-size:10pt;">';
    s += `<tr style="background:${opts.headerColor};color:#fff;font-weight:700;">
      <th>التصنيف</th><th>الرمز</th><th>البند</th><th>الوحدة</th><th>الكمية</th>`;
    if (showCost) s += '<th>الإجمالي</th>';
    s += '</tr>';

    const sortedCats = Object.keys(catMap).sort();
    for (const cat of sortedCats) {
      const items = catMap[cat];
      let catTotal = 0;
      items.forEach(item => { catTotal += item.total_cost || 0; });
      let first = true;
      for (const item of items) {
        s += `<tr>
          <td style="text-align:center;font-weight:${first ? '700' : 'normal'};">${first ? esc(cat) : ''}</td>
          <td style="text-align:center;">${esc(item.code)}</td>
          <td style="text-align:right;">${esc(item.name_ar)}</td>
          <td style="text-align:center;">${esc(item.unit || '-')}</td>
          <td style="text-align:center;">${fmt(item.quantity)}</td>
          ${showCost ? `<td style="text-align:center;">${item.total_cost != null ? fmt(item.total_cost) : '—'}</td>` : ''}
        </tr>`;
        first = false;
      }
      if (showCost) {
        s += `<tr style="font-weight:700;background:#f0f4fa;">
          <td colspan="${showCost ? '5' : '4'}" style="text-align:left;">إجمالي ${esc(cat)}</td>
          <td style="text-align:center;">${fmt(catTotal)}</td>
        </tr>`;
      }
    }
    s += '</table>';
    return s;
  }

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40" lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="ProgId" content="Excel.Sheet">
<meta name="Generator" content="${COMPANY_NAME}">
<!--[if gte mso 9]>
<xml>
  <x:ExcelWorkbook>
    <x:ExcelWorksheets>
      <x:ExcelWorksheet>
        <x:Name>جدول الكميات</x:Name>
        <x:WorksheetOptions>
          <x:DefaultRowHeight>300</x:DefaultRowHeight>
          <x:FreezePanes/>
          <x:FreezeRows>1</x:FreezeRows>
        </x:WorksheetOptions>
      </x:ExcelWorksheet>
      <x:ExcelWorksheet>
        <x:Name>الملخص</x:Name>
        <x:WorksheetOptions><x:DefaultRowHeight>300</x:DefaultRowHeight></x:WorksheetOptions>
      </x:ExcelWorksheet>
      <x:ExcelWorksheet>
        <x:Name>الافتراضات</x:Name>
        <x:WorksheetOptions><x:DefaultRowHeight>300</x:DefaultRowHeight></x:WorksheetOptions>
      </x:ExcelWorksheet>
      <x:ExcelWorksheet>
        <x:Name>البنود حسب التصنيف</x:Name>
        <x:WorksheetOptions><x:DefaultRowHeight>300</x:DefaultRowHeight>
        <x:FreezePanes/><x:FreezeRows>1</x:FreezeRows>
        </x:WorksheetOptions>
      </x:ExcelWorksheet>
    </x:ExcelWorksheets>
    <x:WindowHeight>10000</x:WindowHeight>
    <x:WindowWidth>15000</x:WindowWidth>
    <x:ProtectStructure>False</x:ProtectStructure>
    <x:ProtectWindows>False</x:ProtectWindows>
  </x:ExcelWorkbook>
  <x:ExcelName>
    <x:Name>_FilterDatabase</x:Name>
    <x:Hidden/>
  </x:ExcelName>
</xml>
<![endif]-->
<style>
  @page { size: ${opts.pageSize} landscape; margin: 10mm; }
  body { font-family: '${opts.font}', 'Traditional Arabic', 'Arial', sans-serif; direction: rtl; text-align: right; font-size: 10pt; }
  table { border-collapse: collapse; direction: rtl; }
  th { background: ${opts.headerColor}; color: #fff; font-weight: 700; text-align: center; padding: 4px 6px; border: 1px solid #999; }
  td { padding: 3px 5px; border: 1px solid #ccc; text-align: center; }
  td:nth-child(2) { text-align: right; }
  h2 { color: ${opts.headerColor}; }
  .sheet-title { font-size: 16pt; font-weight: 700; text-align: center; margin: 10px 0; }
  .auto-filter { display: none; }
  br { mso-data-placement: same-cell; }
</style>
</head>
<body>
  <div class="sheet-title">${esc(data.project.name)}</div>
  <p style="text-align:center;color:#666;">${COMPANY_NAME} | ${arDate()}</p>

  <!-- Sheet 1 -->
  <h2>جدول الكميات</h2>
  ${buildBOQSheet()}

  <br><br>

  <!-- Sheet 2 -->
  <h2>الملخص</h2>
  ${buildSummarySheet()}

  <br><br>

  <!-- Sheet 3 -->
  <h2>الافتراضات</h2>
  ${buildAssumptionsSheet()}

  <br><br>

  <!-- Sheet 4 -->
  <h2>البنود حسب التصنيف</h2>
  ${buildByCategorySheet()}

  <p style="text-align:center;margin-top:20px;color:#999;font-size:8pt;">
    تم الإنشاء بواسطة ${COMPANY_NAME} © ${new Date().getFullYear()}
  </p>
</body>
</html>`;
}

module.exports = {
  generatePDF,
  generateWord,
  generateExcel,
  generateAll,
  generateBOQ,
  generateSectionReport,
  estimateFileSize,
  cleanup,
};
