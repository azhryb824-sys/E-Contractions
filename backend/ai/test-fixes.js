const path = require('path');
process.env.NODE_PATH = path.join(__dirname, '..') + path.delimiter + (process.env.NODE_PATH || '');
require('module').Module._initPaths();

const inferenceEngine = require('./inference-engine');
const quantityValidator = require('./quantity-validator');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    errors.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

console.log('\n🔍 ========== AI SYSTEM TESTS ==========\n');

// ============================================================
// Test 1: Project Understanding - Scope Confirmation
// ============================================================
console.log('\n📋 1. PROJECT UNDERSTANDING — SCOPE CONFIRMATION\n');

test('وصف غامض بدون نطاق يطلب تأكيد النطاق', () => {
  const result = inferenceEngine.understandProject({
    description: '3 غرف وحمامين ومطبخ مساحة 300 متر',
    area: 300,
    rooms: 3,
    bathrooms: 2
  });
  assert(result.status === 'awaiting_scope_confirmation',
    `يتوقع awaiting_scope_confirmation ولكن حصل ${result.status}`);
  assert(result.needs_scope_confirmation === true, 'يحتاج تأكيد نطاق');
  assert(result.explicit_values.area === 300, 'المساحة يجب أن تكون 300');
  assert(result.explicit_values.room_count === 3, 'عدد الغرف 3');
});

test('إنشاء كامل يعيد ready', () => {
  const result = inferenceEngine.understandProject({
    description: 'إنشاء فيلا دورين من الحفر حتى التسليم مساحة 500 متر',
    area: 500,
    rooms: 5,
    bathrooms: 4
  });
  assert(result.status === 'ready',
    `يتوقع ready ولكن حصل ${result.status}`);
  assert(result.inferred_values.scope.value === 'إنشاء كامل',
    `يتوقع إنشاء كامل ولكن حصل ${result.inferred_values.scope?.value}`);
});

test('تشطيب مبنى قائم لا يحتوي على نطاق إنشائي', () => {
  const result = inferenceEngine.understandProject({
    description: 'تشطيب شقة قائمة من ثلاث غرف وحمامين ومطبخ بمساحة 150 متر',
    area: 150,
    rooms: 3,
    bathrooms: 2,
    scope: 'تشطيب كامل'
  });
  assert(result.status === 'ready', 'يجب أن يكون ready مع نطاق محدد');
  assert(result.explicit_values.scope === 'تشطيب كامل', 'النطاق تشطيب كامل');
});

// ============================================================
// Test 2: Scope-Based Filtering
// ============================================================
console.log('\n📋 2. SCOPE-BASED ITEM FILTERING\n');

test('تشطيب كامل لا ينتج أعمال أساسات وخرسانة', () => {
  const boq = inferenceEngine.generateBoq({
    title: 'تشطيب شقة',
    description: 'تشطيب شقة قائمة',
    scope: 'تشطيب كامل',
    area: 150,
    rooms: 3,
    bathrooms: 2,
    building_type: 'شقة',
    floor_count: 1,
    finish_level: 'جيد'
  }, 'no_additions');

  assert(boq.status !== 'awaiting_scope_confirmation', 'يجب أن يكون ready');
  if (boq.status === 'ready') {
    const allCodes = [];
    for (const s of boq.sections) {
      for (const item of s.items) allCodes.push(item.code);
    }
    const structuralCodes = ['CON-001', 'CON-003', 'EXC-001'];
    const foundStructural = structuralCodes.filter(c => allCodes.includes(c));
    assert(foundStructural.length === 0,
      `تم العثور على بنود إنشائية في نطاق تشطيب: ${foundStructural.join(', ')}`);
  }
});

test('إنشاء كامل يسمح بالأعمال الإنشائية', () => {
  const boq = inferenceEngine.generateBoq({
    title: 'منزل جديد',
    description: 'إنشاء منزل من الصفر',
    scope: 'إنشاء كامل',
    area: 300,
    rooms: 4,
    bathrooms: 3,
    building_type: 'منزل',
    floor_count: 1,
    finish_level: 'جيد'
  }, 'no_additions');

  if (boq.status === 'ready') {
    const allCodes = [];
    for (const s of boq.sections) {
      for (const item of s.items) allCodes.push(item.code);
    }
    // Should have at least some construction sections
    const constructionSections = boq.sections.filter(s =>
      s.code === 'SEC-CON' || s.code === 'SEC-EXC' || s.code === 'SEC-BLK'
    );
    assert(constructionSections.length > 0, 'يجب أن يحتوي إنشاء كامل على أقسام إنشائية');
  } else {
    assert(boq.status === 'ready', `حالة غير متوقعة: ${boq.status}`);
  }
});

test('كهرباء فقط لا يحتوي على سباكة', () => {
  const boq = inferenceEngine.generateBoq({
    title: 'كهرباء فيلا',
    description: 'كهرباء فقط لفيلا دورين',
    scope: 'كهرباء فقط',
    area: 400,
    rooms: 5,
    bathrooms: 4,
    building_type: 'فيلا',
    floor_count: 2,
    finish_level: 'جيد'
  }, 'no_additions');

  if (boq.status === 'ready') {
    const forbiddenPlumbing = ['PLM-001', 'PLM-011', 'PLM-015'];
    const allCodes = [];
    for (const s of boq.sections) {
      for (const item of s.items) allCodes.push(item.code);
    }
    const foundPlumbing = forbiddenPlumbing.filter(c => allCodes.includes(c));
    assert(foundPlumbing.length === 0,
      `تم العثور على بنود سباكة في نطاق كهرباء فقط: ${foundPlumbing.join(', ')}`);
  }
});

// ============================================================
// Test 3: Integer Constraint
// ============================================================
console.log('\n📋 3. INTEGER CONSTRAINT FOR COUNT UNITS\n');

test('أداة صحية بكمية كسرية يتم تقريبها لعدد صحيح', () => {
  const result = quantityValidator.applyIntegerConstraint(2.7, { code: 'PLM-015', unit: 'عدد' }, { bathroom_count: 2 });
  assert(Number.isInteger(result.quantity), `الكمية ${result.quantity} يجب أن تكون عدداً صحيحاً`);
  assert(result.rounding_applied === true, 'يجب أن يتم تطبيق التقريب');
});

test('مساحة الأرضية لا يتم تقريبها', () => {
  const result = quantityValidator.applyIntegerConstraint(104.5, { code: 'FLR-004', unit: 'م²' }, { area: 150 });
  assert(result.quantity === 104.5, 'المساحة لا تحتاج تقريب');
  assert(result.rounding_applied === false, 'لا يجب تطبيق التقريب');
});

test('نظام اختبار ثابت بـ 1', () => {
  const result = quantityValidator.applyIntegerConstraint(1, { code: 'OPR-001', unit: 'نظام' }, {});
  assert(result.quantity === 1, 'نظام الاختبار يجب أن يكون 1');
});

test('عدد الأبواب يتم تقريبه لأقرب عدد صحيح', () => {
  const result = quantityValidator.applyIntegerConstraint(5.8, { code: 'WOD-001', unit: 'عدد' }, { room_count: 3, bathroom_count: 2 });
  assert(Number.isInteger(result.quantity), `الكمية ${result.quantity} يجب أن تكون عدداً صحيحاً`);
  assert(result.quantity >= Math.ceil(5.8), 'يجب تقريب الأعلى للبنود الأساسية');
});

// ============================================================
// Test 4: Real Confidence
// ============================================================
console.log('\n📋 4. REAL CONFIDENCE CALCULATION\n');

test('الثقة ليست ثابتة 95%', () => {
  const boq = inferenceEngine.generateBoq({
    title: 'اختبار ثقة',
    description: 'اختبار',
    scope: 'تشطيب كامل',
    area: 150,
    rooms: 3,
    bathrooms: 2,
    building_type: 'شقة',
    floor_count: 1,
    finish_level: 'جيد'
  }, 'no_additions');

  if (boq.status === 'ready') {
    const confidences = [];
    for (const s of boq.sections) {
      for (const item of s.items) {
        confidences.push(item.confidence);
      }
    }
    // Check no item has exactly 0.95
    const hasFixed95 = confidences.some(c => Math.abs(c - 0.95) < 0.01);
    assert(!hasFixed95, 'يوجد بند بثقة 95% بالضبط');

    // Check variation in confidence
    const uniqueConfidences = [...new Set(confidences.map(c => Math.round(c * 100)))];
    assert(uniqueConfidences.length > 2, 'يجب وجود تنوع في قيم الثقة (أكثر من قيمتين مختلفتين)');
  }
});

test('بند إنشائي دون مخططات ثقته أقل من 50%', () => {
  const boq = inferenceEngine.generateBoq({
    title: 'إنشاء منزل',
    description: 'إنشاء كامل',
    scope: 'إنشاء كامل',
    area: 300,
    rooms: 4,
    bathrooms: 3,
    building_type: 'منزل',
    floor_count: 1,
    finish_level: 'جيد'
  }, 'no_additions');

  if (boq.status === 'ready') {
    for (const s of boq.sections) {
      for (const item of s.items) {
        if (['CON-001', 'CON-003', 'EXC-001'].includes(item.code)) {
          assert(item.confidence < 0.50,
            `البند ${item.code} ثقته ${item.confidence} يجب أن تكون < 0.5 بدون مخططات`);
        }
      }
    }
  }
});

test('اختبارات التسليم ثقتها عالية', () => {
  const boq = inferenceEngine.generateBoq({
    title: 'تشطيب',
    description: 'تشطيب كامل',
    scope: 'تشطيب كامل',
    area: 150,
    rooms: 3,
    bathrooms: 2,
    building_type: 'شقة',
    floor_count: 1,
    finish_level: 'جيد'
  }, 'no_additions');

  if (boq.status === 'ready') {
    for (const s of boq.sections) {
      for (const item of s.items) {
        if (item.code === 'OPR-001' || item.code === 'OPR-002') {
          assert(item.confidence > 0.7,
            `البند ${item.code} (${item.name_ar}) ثقته ${item.confidence} يجب أن تكون > 0.7`);
        }
      }
    }
  }
});

// ============================================================
// Test 5: Quantity Validation
// ============================================================
console.log('\n📋 5. QUANTITY VALIDATION\n');

test('كشف كمية كسرية لوحدة عدد', () => {
  const issues = quantityValidator.validateItem({
    code: 'PLM-015',
    name_ar: 'مرحاض',
    unit: 'عدد',
    quantity: 2.7
  }, { bathroom_count: 2, scope: 'تشطيب كامل' }, []);
  const fracIssue = issues.find(i => i.code === 'FRACTIONAL_COUNT_UNIT');
  assert(fracIssue, 'يجب كشف الكمية الكسرية لوحدة عدد');
});

test('أعمال إنشائية في نطاق تشطيب', () => {
  const issues = quantityValidator.validateItem({
    code: 'CON-001',
    name_ar: 'خرسانة أساسات',
    quantity: 50
  }, { scope: 'تشطيب كامل', bathroom_count: 2 }, []);
  const structIssue = issues.find(i => i.code === 'STRUCTURAL_IN_FINISHING');
  assert(structIssue, 'يجب كشف الأعمال الإنشائية في نطاق تشطيب');
});

test('اختبار نظام بكمية غير 1', () => {
  const issues = quantityValidator.validateItem({
    code: 'OPR-001',
    name_ar: 'اختبار تمديدات',
    unit: 'نظام',
    quantity: 3
  }, { scope: 'تشطيب كامل' }, []);
  const testIssue = issues.find(i => i.code === 'TEST_QUANTITY_NOT_ONE');
  assert(testIssue, 'يجب كشف نظام اختبار بكمية غير 1');
});

test('عدد أدوات صحية أقل من الحمامات', () => {
  const issues = quantityValidator.validateItem({
    code: 'PLM-011',
    name_ar: 'خلاط حوض',
    unit: 'عدد',
    quantity: 1
  }, { bathroom_count: 3, scope: 'تشطيب كامل' }, []);
  const fixtureIssue = issues.find(i => i.code === 'FIXTURE_LESS_THAN_BATHROOMS');
  assert(fixtureIssue, 'يجب كشف نقص الأدوات الصحية');
});

// ============================================================
// Test 6: Explicit vs Inferred Values
// ============================================================
console.log('\n📋 6. EXPLICIT VS INFERRED VALUES\n');

test('القيم الصريحة منفصلة عن المستنتجة', () => {
  const result = inferenceEngine.understandProject({
    description: '3 غرف وحمامين ومطبخ',
    area: 300,
    rooms: 3,
    bathrooms: 2
  });
  assert(typeof result.explicit_values === 'object', 'يجب وجود explicit_values');
  assert(typeof result.inferred_values === 'object', 'يجب وجود inferred_values');
  assert(result.explicit_values.area === 300, 'المساحة صريحة');
  assert(result.explicit_values.room_count === 3, 'الغرف صريحة');
  assert(result.explicit_values.bathroom_count === 2, 'الحمامات صريحة');
});

test('البند يحتوي على source_details', () => {
  const boq = inferenceEngine.generateBoq({
    title: 'تشطيب',
    description: 'تشطيب شقة',
    scope: 'تشطيب كامل',
    area: 150,
    rooms: 3,
    bathrooms: 2,
    building_type: 'شقة',
    floor_count: 1,
    finish_level: 'جيد'
  }, 'no_additions');

  if (boq.status === 'ready') {
    let foundWithSource = false;
    for (const s of boq.sections) {
      for (const item of s.items) {
        if (item.source_details) {
          foundWithSource = true;
          break;
        }
      }
    }
    assert(foundWithSource, 'يجب أن يكون لبعض البنود source_details');
  }
});

// ============================================================
// Test 7: Quantity Drivers
// ============================================================
console.log('\n📋 7. QUANTITY DRIVERS\n');

test('مضاعفة المساحة لا تضاعف عدد المراحيض', () => {
  const boq1 = inferenceEngine.generateBoq({
    title: 'شقة صغيرة',
    description: 'تشطيب',
    scope: 'تشطيب كامل',
    area: 100, rooms: 2, bathrooms: 2,
    building_type: 'شقة', floor_count: 1, finish_level: 'جيد'
  }, 'no_additions');

  const boq2 = inferenceEngine.generateBoq({
    title: 'شقة كبيرة',
    description: 'تشطيب',
    scope: 'تشطيب كامل',
    area: 500, rooms: 2, bathrooms: 2,
    building_type: 'شقة', floor_count: 1, finish_level: 'جيد'
  }, 'no_additions');

  if (boq1.status === 'ready' && boq2.status === 'ready') {
    const getToiletQty = (boq) => {
      for (const s of boq.sections) {
        for (const item of s.items) {
          if (item.code === 'PLM-015') return item.quantity;
        }
      }
      return null;
    };

    const q1 = getToiletQty(boq1);
    const q2 = getToiletQty(boq2);
    assert(q1 !== null && q2 !== null, 'يجب إيجاد المراحيض في كلا المشروعين');
    assert(q1 === q2,
      `عدد المراحيض يجب ألا يتغير عند مضاعفة المساحة: ${q1} vs ${q2}`);
  }
});

test('حمامان ينتجان كميات صحيحة للأدوات الصحية', () => {
  const boq = inferenceEngine.generateBoq({
    title: 'شقة',
    description: 'تشطيب شقة بحمامين',
    scope: 'تشطيب كامل',
    area: 150, rooms: 3, bathrooms: 2,
    building_type: 'شقة', floor_count: 1, kitchen_count: 1, finish_level: 'جيد'
  }, 'no_additions');

  if (boq.status === 'ready') {
    const items = {};
    for (const s of boq.sections) {
      for (const item of s.items) {
        items[item.code] = item;
      }
    }

    const fixtures = ['PLM-011', 'PLM-012', 'PLM-015', 'PLM-BASIN'];
    for (const code of fixtures) {
      if (items[code]) {
        assert(items[code].quantity >= 1,
          `${code} (${items[code].name_ar}) كميته ${items[code].quantity} يجب أن تكون ≥ 1`);
        assert(Number.isInteger(items[code].quantity) || items[code].unit !== 'عدد',
          `${code} يجب أن تكون كمية صحيحة (وحدة: ${items[code].unit})`);
      }
    }
  }
});

// ============================================================
// SUMMARY
// ============================================================
console.log('\n📊 ========== TEST SUMMARY ==========');
console.log(`  ✅ Passed: ${passed}`);
console.log(`  ❌ Failed: ${failed}`);
console.log(`  📊 Total:  ${passed + failed}`);

if (failed > 0) {
  console.log('\n❌ FAILURES:');
  for (const err of errors) {
    console.log(`  - ${err.name}: ${err.error}`);
  }
  process.exit(1);
} else {
  console.log('\n🎉 جميع الاختبارات نجحت!');
  process.exit(0);
}
