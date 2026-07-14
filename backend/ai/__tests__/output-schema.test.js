const path = require('path');
const AI_DIR = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) passed++; else { failed++; console.error('❌', msg); }
}

const { SCHEMA, validateOutput } = require(path.join(AI_DIR, 'json-schema.js'));

assert(typeof SCHEMA === 'object', 'SCHEMA موجود');
assert(typeof validateOutput === 'function', 'validateOutput موجودة');
assert(SCHEMA.type === 'object', 'SCHEMA type object');
assert(Array.isArray(SCHEMA.required), 'SCHEMA.required موجود');
assert(SCHEMA.required.includes('status'), 'status مطلوب');
assert(SCHEMA.required.includes('project'), 'project مطلوب');
assert(SCHEMA.required.includes('sections'), 'sections مطلوب');

const valid = {
  status: 'ready',
  inference_mode: 'fallback_rules_and_similarity',
  project: { project_type: 'سكني', building_type: 'شقة', scope: 'تشطيب كامل' },
  sections: [{ code: 'SEC-01', name: 'اختبار', sort_order: 1, items: [{ code: 'FLR-004', name_ar: 'بلاط', unit: 'م²', quantity: 100 }] }]
};
const r1 = validateOutput(valid);
assert(r1.valid, 'بيانات صالحة: ' + r1.errors.join(', '));

const invalid1 = { bad: 'data' };
const r2 = validateOutput(invalid1);
assert(!r2.valid, 'بيانات غير صالحة ترفض');
assert(r2.errors.some(e => e.includes('status')), 'خطأ عن missing status');

const invalid2 = { status: 'bad_status', project: { project_type: 'سكني', building_type: 'شقة', scope: 'تشطيب' }, sections: [] };
const r3 = validateOutput(invalid2);
assert(!r3.valid, 'status غير صحيح يرفض');

const invalid3 = { status: 'ready', inference_mode: 'trained_model', project: { project_type: 'سكني', building_type: 'شقة', scope: 'تشطيب' }, sections: [{ code: 'SEC-01', name: 'اختبار', items: [{ code: 'XXX', name_ar: 'غير موجود', unit: 'م²', quantity: -5 }] }] };
const r4 = validateOutput(invalid3);
assert(!r4.valid, 'quantity سالبة ترفض');

const sectionOnlyMissing = { status: 'ready', inference_mode: 'fallback_rules_and_similarity', project: { project_type: 'سكني', building_type: 'شقة', scope: 'تشطيب' } };
const r5 = validateOutput(sectionOnlyMissing);
assert(!r5.valid, 'missing sections ترفض');

const nullExecution = { status: 'ready', execution_mode: null, inference_mode: 'fallback_rules_and_similarity', project: { project_type: 'سكني', building_type: 'شقة', scope: 'تشطيب' }, sections: [] };
const r6 = validateOutput(nullExecution);
assert(r6.valid, 'null execution_mode مقبول');

const withModel = { status: 'ready', inference_mode: 'trained_model', project: { project_type: 'فيلا', building_type: 'فيلا', scope: 'تشطيب كامل' }, sections: [{ code: 'SEC-01', name: 'اختبار', items: [{ code: 'FLR-004', name_ar: 'بلاط', unit: 'م²', quantity: 100, quantity_source: 'model', ai_suggested: true, user_requested: false, requires_confirmation: false, price_status: 'missing', unit_price: null, total: null }] }], model: { version: 'v1', trained_at: '2024', data_version: '1', algorithm: 'co_occurrence' } };
const r7 = validateOutput(withModel);
assert(r7.valid, 'مع model ومصادر: ' + r7.errors.join(', '));

console.log(`Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
