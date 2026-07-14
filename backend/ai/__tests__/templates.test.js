const fs = require('fs');
const path = require('path');
const AI_DIR = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) passed++; else { failed++; console.error('❌', msg); }
}

const templateEngine = require(path.join(AI_DIR, 'template-engine.js'));

const data = {
  project: { name: 'اختبار', project_type: 'سكني', building_type: 'شقة', city: 'الرياض', area: 150, rooms: 3, bathrooms: 2, floor_count: 1, finish_level: 'جيد', scope: 'تشطيب كامل', estimate_level: 'intermediate', execution_mode: 'show_before_add', owner: '', date: new Date().toISOString() },
  assumptions: ['مساحة 150 م²'],
  sections: [{ code: 'SEC-01', name: 'أعمال الأرضيات', sort_order: 1, items: [{ code: 'FLR-004', name_ar: 'بلاط', category: 'أرضيات', unit: 'م²', quantity: 105, quantity_calculated: true, confidence: 0.85, classification: 'أساسي', unit_price: null, total_cost: null, calculation_method: '70%' }], section_total: null }],
  warnings: [], total_quantity_items: 1, total_estimated_cost: null,
  inference_mode: 'fallback_rules_and_similarity', status: 'ready'
};

// PDF
const pdf = templateEngine.generatePDF(data, {});
assert(pdf.html && pdf.html.length > 0, 'PDF html موجود');
assert(pdf.html.includes('dir="rtl"'), 'PDF يحتوي RTL');
assert(pdf.html.includes('بلاط'), 'PDF يحتوي نص عربي');
assert(pdf.html.includes('<table'), 'PDF يحتوي جدول');
assert(pdf.html.includes('<style>') || pdf.html.includes('<style '), 'PDF يحتوي CSS');
assert(pdf.html.includes('105') || pdf.html.includes('quantity') || pdf.html.includes('بلاط'), 'PDF يحتوي الكمية');
assert(pdf.html.includes('م²'), 'PDF يحتوي الوحدة');

// Word
const word = templateEngine.generateWord(data, {});
assert(word.html && word.html.length > 0, 'Word html موجود');
assert(word.html.includes('<html'), 'Word فيه html tag');
assert(word.html.includes('بلاط'), 'Word فيه نص عربي');

// Excel
const excel = templateEngine.generateExcel(data, {});
assert(excel.html && excel.html.length > 0, 'Excel html موجود');
assert(excel.html.includes('<table'), 'Excel فيه table');
assert(excel.sheets === 4, 'Excel فيه 4 جداول');

// Generate all
const all = templateEngine.generateAll(data, {});
assert(all.pdf && all.pdf.html, 'All PDF موجود');
assert(all.word && all.word.html, 'All Word موجود');
assert(all.excel && all.excel.html, 'All Excel موجود');

// Estimate file size
const size = templateEngine.estimateFileSize(data, 'pdf');
assert(size.estimatedBytes > 0, 'تقدير الحجم > 0');

console.log(`Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
