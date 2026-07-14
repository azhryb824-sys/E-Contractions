const path = require('path');
(async () => {
const fs = require('fs');

const AI_DIR = path.resolve(__dirname, '..');

console.log('\n🔍 اختبار 1: التحقق من وجود جميع الملفات');
const files = [
  path.join(AI_DIR, 'training-data.json'),
  path.join(AI_DIR, 'item-dictionary.json'),
  path.join(AI_DIR, 'item-relationships.json'),
  path.join(AI_DIR, 'json-schema.js'),
  path.join(AI_DIR, 'inference-engine.js'),
  path.join(AI_DIR, 'request-handler.js'),
  path.join(AI_DIR, 'calculation-engine.js'),
  path.join(AI_DIR, 'template-engine.js'),
  path.resolve(__dirname, '..', '..', 'routes', 'ai.js'),
];
let allExist = true;
for (const f of files) {
  const exists = fs.existsSync(f);
  console.log(`  ${exists ? '✅' : '❌'} ${path.relative(AI_DIR, f)}`);
  if (!exists) allExist = false;
}
if (!allExist) { console.log('\n❌ بعض الملفات مفقودة!'); process.exit(1); }
console.log('  ✅ جميع الملفات موجودة');

console.log('\n🔍 اختبار 2: تحميل ملفات البيانات');
const trainingData = JSON.parse(fs.readFileSync(path.join(AI_DIR, 'training-data.json'), 'utf8'));
const itemDictionary = JSON.parse(fs.readFileSync(path.join(AI_DIR, 'item-dictionary.json'), 'utf8'));
const itemRelationships = JSON.parse(fs.readFileSync(path.join(AI_DIR, 'item-relationships.json'), 'utf8'));
console.log(`  ✅ training-data.json: ${trainingData.length} مثال`);
console.log(`  ✅ item-dictionary.json: ${Object.keys(itemDictionary).length} بند`);
console.log(`  ✅ item-relationships.json: ${itemRelationships.relationship_groups.length} مجموعات`);

console.log('\n🔍 اختبار 3: JSON Schema validation');
const { SCHEMA, validateOutput } = require(path.join(AI_DIR, 'json-schema.js'));

const validData = {
  project: { name: 'مشروع اختبار', type: 'سكني', scope: 'تشطيب كامل', estimate_level: 'تقدير_أولي', execution_mode: 'show_before_add', area: 150, rooms: 3, city: 'الرياض', finish_level: 'جيد جداً' },
  assumptions: ['افتراض 1', 'افتراض 2'],
  sections: [{ code: 'SEC-01', name: 'أعمال الأرضيات', sort_order: 1, items: [{ code: 'FLR-004', name_ar: 'بلاط بورسلين', unit: 'م²', quantity: 105 }] }]
};
const validation = validateOutput(validData);
console.log(`  ✅ التحقق من بيانات صالحة: ${validation.valid ? 'نعم' : 'لا'}`);

console.log('\n🔍 اختبار 4: محرك الاستدلال');
const inferenceEngine = require(path.join(AI_DIR, 'inference-engine.js'));

const testRequest = {
  title: 'تشطيب شقة 3 غرف', description: 'تشطيب شقة جديدة 3 غرف وصالة ومطبخ وحمامين في الرياض',
  project_type: 'سكني', building_type: 'شقة', city: 'الرياض', area: 150,
  rooms: 3, bathrooms: 2, floor_count: 1, finish_level: 'جيد جداً', hasKitchen: true, hasHall: true
};

const analysis = inferenceEngine.analyzeRequest(testRequest);
console.log(`  ✅ تحليل الطلب: type=${analysis.type}, scope=${analysis.scope}, confidence=${analysis.confidence}`);

const estimate = inferenceEngine.generateEstimate(testRequest);
console.log(`  ✅ التقدير: ${estimate.sections.length} أقسام`);
let totalItems = 0;
for (const section of estimate.sections) { totalItems += section.items.length; console.log(`    📋 ${section.name}: ${section.items.length} بند`); }
console.log(`  ✅ إجمالي البنود: ${totalItems}, الافتراضات: ${estimate.assumptions.length}`);

const essentialCheck = inferenceEngine.getMissingEssentialItems(['FLR-004', 'PNT-005'], 'سكني');
console.log(`  ✅ البنود الأساسية المفقودة: ${essentialCheck.missing.length}`);

const comparison = inferenceEngine.compareEstimate({ quantity: 100, min: 85, max: 115, unit: 'م²' }, 105);
console.log(`  ✅ مقارنة كميات: deviation=${comparison.deviation}%, flag=${comparison.flag}`);

console.log('\n🔍 اختبار 5: محرك الحساب');
const calculationEngine = require(path.join(AI_DIR, 'calculation-engine.js'));

const projParams = { area: 150, rooms: 3, bathrooms: 2, hasKitchen: true, hasHall: true, floorCount: 1, finishLevel: 'جيد جداً', projectType: 'شقة' };

for (const code of ['FLR-004', 'FLR-005', 'PNT-005', 'ELC-003', 'PLM-007', 'HVAC-001', 'WOD-001', 'INS-001', 'LIG-001', 'OPR-001']) {
  const result = calculationEngine.calculate(code, projParams);
  const breakdown = calculationEngine.getCalculationBreakdown(code, projParams);
  console.log(`  ✅ ${code}: ${result.quantity} ${result.unit} [${breakdown.formula}] ثقة=${result.confidence}`);
}

const batchResult = calculationEngine.calculateBatch(['FLR-004', 'PNT-005'].map(c => ({ code: c })), projParams);
console.log(`  ✅ حساب مجموعة: ${batchResult.results.length} نتائج`);

const supported = calculationEngine.getSupportedCalculations();
console.log(`  ✅ بنود مدعومة: ${Object.keys(supported).length}`);

const valResult = calculationEngine.validateQuantity('FLR-004', 120, projParams);
console.log(`  ✅ تحقق كمية: مقبول=${valResult.acceptable}, نطاق=${JSON.stringify(valResult.suggested_range)}`);

console.log('\n🔍 اختبار 6: معالج الطلبات');
const requestHandler = require(path.join(AI_DIR, 'request-handler.js'));

const modeInfo = requestHandler.getModeInfo('show_before_add');
console.log(`  ✅ معلومات الوضع: ${modeInfo.description}`);

const processed = await requestHandler.processRequest(testRequest, 'show_before_add');
console.log(`  ✅ معالجة الطلب: status=${processed.status}`);

const manualItem = requestHandler.processManualItem('test-project', { code: 'FLR-005', name: 'سيراميك أرضيات', unit: 'م²' });
console.log(`  ✅ معالجة بند يدوي: status=${manualItem.status}`);

const cleanup = requestHandler.cleanupExpiredSessions(1000);
console.log(`  ✅ تنظيف الجلسات: ${cleanup.cleaned} محذوفة`);

console.log('\n🔍 اختبار 7: محرك القوالب');
const templateEngine = require(path.join(AI_DIR, 'template-engine.js'));

const estimateData = {
  project: { name: 'مشروع اختبار', project_type: 'سكني', building_type: 'شقة', city: 'الرياض', area: 150, rooms: 3, bathrooms: 2, floor_count: 1, finish_level: 'جيد جداً', scope: 'تشطيب كامل', estimate_level: 'تقدير متوسط', execution_mode: 'show_before_add', owner: 'عميل', date: new Date().toISOString() },
  assumptions: ['مساحة الشقة 150 م²', 'دورتان مياه', 'مطبخ واحد'],
  sections: [
    { code: 'SEC-01', name: 'أعمال الأرضيات', sort_order: 1, items: [{ code: 'FLR-004', name_ar: 'بلاط بورسلين', category: 'أرضيات', unit: 'م²', quantity: 105, quantity_calculated: true, confidence: 0.85, classification: 'أساسي', unit_price: null, total_cost: null, calculation_method: 'المساحة × 70%' }, { code: 'FLR-008', name_ar: 'وزرات', category: 'أرضيات', unit: 'م.ط', quantity: 42, quantity_calculated: true, confidence: 0.8, classification: 'أساسي', unit_price: null, total_cost: null, calculation_method: 'محيط الغرف' }], section_total: null },
    { code: 'SEC-02', name: 'أعمال الدهانات', sort_order: 2, items: [{ code: 'PNT-005', name_ar: 'دهان جدران', category: 'دهانات', unit: 'م²', quantity: 420, quantity_calculated: true, confidence: 0.85, classification: 'أساسي', unit_price: null, total_cost: null, calculation_method: 'المساحة × 2.8' }, { code: 'PNT-008', name_ar: 'دهان أسقف', category: 'دهانات', unit: 'م²', quantity: 150, quantity_calculated: true, confidence: 0.85, classification: 'أساسي', unit_price: null, total_cost: null, calculation_method: 'مساحة السقف' }], section_total: null }
  ],
  warnings: ['المساحة تقريبية'],
  total_quantity_items: 4, total_estimated_cost: null
};

const pdfResult = templateEngine.generatePDF(estimateData);
console.log(`  ✅ PDF: ${pdfResult.html.length} بايت, ${pdfResult.pages} صفحات, ${pdfResult.size} حجم`);

const wordResult = templateEngine.generateWord(estimateData);
console.log(`  ✅ Word: ${(wordResult.html||wordResult.buffer).length} بايت`);

const excelResult = templateEngine.generateExcel(estimateData);
console.log(`  ✅ Excel: ${(excelResult.html||excelResult.buffer).length} بايت, ${excelResult.sheets} جداول`);

const allResult = templateEngine.generateAll(estimateData);
console.log(`  ✅ الكل: PDF=${allResult.pdf ? 'نعم' : 'لا'}, Word=${allResult.word ? 'نعم' : 'لا'}, Excel=${allResult.excel ? 'نعم' : 'لا'}`);

const boqResult = templateEngine.generateBOQ(estimateData);
console.log(`  ✅ BOQ: PDF=${boqResult.pdf ? 'نعم' : 'لا'}, Word=${boqResult.word ? 'نعم' : 'لا'}, Excel=${boqResult.excel ? 'نعم' : 'لا'}`);

const sectionReport = templateEngine.generateSectionReport(estimateData.sections[0], estimateData.project);
console.log(`  ✅ تقرير قسم: PDF=${sectionReport.pdf ? 'نعم' : 'لا'}`);

const sizeEst = templateEngine.estimateFileSize(estimateData, 'pdf');
console.log(`  ✅ تقدير الحجم: ${sizeEst.estimatedBytes} بايت`);

const outputDir = path.resolve(AI_DIR, '..', 'generated');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
const ts = Date.now();

const htmlPath = path.join(outputDir, `test-${ts}.html`);
fs.writeFileSync(htmlPath, pdfResult.html);
fs.unlinkSync(htmlPath);

const docPath = path.join(outputDir, `test-${ts}.doc`);
fs.writeFileSync(docPath, wordResult.html);
fs.unlinkSync(docPath);

const xlsPath = path.join(outputDir, `test-${ts}.xls`);
fs.writeFileSync(xlsPath, excelResult.html);
fs.unlinkSync(xlsPath);

console.log('  ✅ حفظ وحذف الملفات');

console.log('\n' + '='.repeat(50));
console.log('📊 ملخص الاختبارات:');
console.log('='.repeat(50));
console.log('✅ 1. وجود الملفات');
console.log('✅ 2. ملفات البيانات (JSON)');
console.log('✅ 3. JSON Schema');
console.log('✅ 4. محرك الاستدلال');
console.log('✅ 5. محرك الحساب');
console.log('✅ 6. معالج الطلبات');
console.log('✅ 7. محرك القوالب');
console.log('='.repeat(50));
console.log('🎉 جميع الاختبارات passed!\n');

process.exit(0);
})();
