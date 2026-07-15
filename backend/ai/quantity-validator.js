const fs = require('fs');
const path = require('path');

const ITEMS_PATH = path.join(__dirname, 'data', 'catalogs', 'items.json');
const SCOPE_RULES_PATH = path.join(__dirname, 'data', 'knowledge', 'scope-rules.json');

let itemDict = null;
let scopeRules = null;

function loadDict() {
  if (itemDict) return itemDict;
  try {
    const raw = JSON.parse(fs.readFileSync(ITEMS_PATH, 'utf-8'));
    const map = {};
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item && item.code) map[item.code] = item;
      }
    }
    itemDict = map;
    return map;
  } catch (e) { return {}; }
}

function loadScopeRules() {
  if (scopeRules) return scopeRules;
  try {
    scopeRules = JSON.parse(fs.readFileSync(SCOPE_RULES_PATH, 'utf-8'));
    return scopeRules;
  } catch (e) { return []; }
}

const INTEGER_UNITS = new Set(['عدد', 'قطعة', 'جهاز', 'نظام', 'لوحة', 'باب', 'مكيف', 'مرحاض', 'مغسلة', 'خلاط', 'مضخة', 'خزان', 'مصعد']);

function applyIntegerConstraint(rawQuantity, item, project) {
  const dict = loadDict();
  const itemDef = dict[item.code] || {};
  const unit = item.unit || itemDef.unit || '';
  const integerRequired = item.integer_required || itemDef.integer_required || INTEGER_UNITS.has(unit);

  if (!integerRequired || rawQuantity === undefined || rawQuantity === null) {
    return {
      raw_quantity: rawQuantity,
      quantity: rawQuantity,
      rounding_rule: null,
      rounding_applied: false
    };
  }

  let quantity = rawQuantity;
  let rule = null;

  // Ceil for required equipment (fixtures, devices).  Never turn missing/zero into one.
  if (itemDef.classification_default === 'أساسي' || itemDef.classification_default === 'ضروري') {
    quantity = Math.ceil(rawQuantity);
    rule = 'ceil_required_equipment';
  } else {
    quantity = Math.round(rawQuantity);
    rule = 'round_nearest';
  }

  // Fixed per project items should stay at their default
  if (itemDef.quantity_driver === 'fixed_per_project' && itemDef.default_quantity !== undefined) {
    quantity = itemDef.default_quantity;
    rule = 'fixed_per_project_default';
  }

  const applied = Math.abs(quantity - rawQuantity) > 0.01;

  return {
    raw_quantity: rawQuantity,
    quantity,
    rounding_rule: rule,
    rounding_applied: applied
  };
}

function validateItem(item, project, sections) {
  const issues = [];
  const dict = loadDict();
  const itemDef = dict[item.code] || {};
  const unit = item.unit || itemDef.unit || '';
  const integerRequired = item.integer_required || itemDef.integer_required || INTEGER_UNITS.has(unit);

  // 1. Fractional quantity for count unit
  if (integerRequired && item.quantity !== undefined && item.quantity !== null) {
    if (!Number.isInteger(item.quantity) && !(item.quantity % 1 === 0)) {
      issues.push({
        severity: 'error',
        code: 'FRACTIONAL_COUNT_UNIT',
        message: `الكمية ${item.quantity} للبند ${item.code} (${item.name_ar}) كسرية والوحدة ${unit} يجب أن تكون عدداً صحيحاً`,
        item_code: item.code
      });
    }
  }

  // 2. Structural items in finishing-only scope
  const scope = project.scope || '';
  if (scope.includes('تشطيب') && !scope.includes('إنشاء')) {
    const structuralCodes = ['CON-001', 'CON-002', 'CON-003', 'CON-004', 'CON-005', 'EXC-001', 'EXC-002', 'BLK-001', 'BLK-002'];
    if (structuralCodes.includes(item.code)) {
      issues.push({
        severity: 'error',
        code: 'STRUCTURAL_IN_FINISHING',
        message: `البند ${item.code} (${item.name_ar}) من الأعمال الإنشائية ولا ينتمي إلى نطاق تشطيب`,
        item_code: item.code
      });
    }
  }

  // 3. Demolition in new construction without reason
  if (project.project_condition === 'new') {
    const demolitionCodes = ['DEM-001', 'DEM-002', 'DEM-003', 'EXC-003', 'EXC-004'];
    if (demolitionCodes.includes(item.code)) {
      issues.push({
        severity: 'warning',
        code: 'DEMOLITION_IN_NEW',
        message: `البند ${item.code} (${item.name_ar}) أعمال إزالة في مشروع جديد، تأكد من الحاجة`,
        item_code: item.code
      });
    }
  }

  // 4. Sanitary fixtures not matching bathroom count
  const bathroomItems = ['PLM-011', 'PLM-012', 'PLM-015', 'PLM-BASIN'];
  if (bathroomItems.includes(item.code) && project.bathroom_count > 0) {
    if (item.quantity < project.bathroom_count) {
      issues.push({
        severity: 'warning',
        code: 'FIXTURE_LESS_THAN_BATHROOMS',
        message: `عدد ${item.name_ar} (${item.quantity}) أقل من عدد الحمامات (${project.bathroom_count})`,
        item_code: item.code
      });
    }
    if (item.quantity > project.bathroom_count * 3) {
      issues.push({
        severity: 'warning',
        code: 'FIXTURE_EXCESSIVE',
        message: `عدد ${item.name_ar} (${item.quantity}) كبير جداً مقارنة بعدد الحمامات (${project.bathroom_count})`,
        item_code: item.code
      });
    }
  }

  // 5. Doors not matching rooms
  if (item.code === 'WOD-001' && project.room_count > 0 && project.bathroom_count > 0) {
    const expectedMin = project.room_count + Math.min(1, project.bathroom_count);
    if (item.quantity > 0 && item.quantity < expectedMin) {
      issues.push({
        severity: 'warning',
        code: 'DOORS_TOO_FEW',
        message: `عدد الأبواب الداخلية (${item.quantity}) قد لا يكفي ${expectedMin} فراغاً`,
        item_code: item.code
      });
    }
  }

  // 6. More than one distribution board per floor without reason
  if (item.code === 'ELC-007' && project.floor_count > 0) {
    const expectedPerFloor = Math.ceil(item.quantity / project.floor_count);
    if (expectedPerFloor > 1.5) {
      issues.push({
        severity: 'warning',
        code: 'MULTIPLE_BOARDS_PER_FLOOR',
        message: `أكثر من لوحة توزيع لكل دور (${expectedPerFloor.toFixed(1)})، تأكد من المبرر التصميمي`,
        item_code: item.code
      });
    }
  }

  // 7. Test item quantity not 1
  if (['OPR-001', 'OPR-002', 'OPR-003', 'OPR-005', 'OPR-006'].includes(item.code)) {
    if (item.quantity !== undefined && item.quantity !== null && item.quantity !== 1) {
      issues.push({
        severity: 'error',
        code: 'TEST_QUANTITY_NOT_ONE',
        message: `البند ${item.code} (${item.name_ar}) نظام اختبار وكميته ${item.quantity} بدلاً من 1`,
        item_code: item.code
      });
    }
  }

  // 8. Confidence 95% without drawings
  if (item.confidence > 0.9 && !project.drawings_available) {
    issues.push({
      severity: 'warning',
      code: 'HIGH_CONF_NO_DRAWINGS',
      message: `البند ${item.code} (${item.name_ar}) ثقة ${(item.confidence * 100).toFixed(0)}% دون وجود مخططات`,
      item_code: item.code
    });
  }

  // 9. HVAC capacity without load calculation
  if (item.code === 'HVAC-001' && item.capacity_confirmed && !item.load_calculation_done) {
    issues.push({
      severity: 'warning',
      code: 'HVAC_NO_LOAD_CALC',
      message: `سعة التكييف مؤكدة دون حساب حمل حراري`,
      item_code: item.code
    });
  }

  // 10. Concrete/rebar without structural drawings
  if (['CON-001', 'CON-003', 'EXC-001'].includes(item.code) && !project.has_structural_drawings) {
    if (item.confidence > 0.5) {
      issues.push({
        severity: 'warning',
        code: 'STRUCTURAL_HIGH_CONF_NO_DRAWINGS',
        message: `البند ${item.code} (${item.name_ar}) ثقة ${(item.confidence * 100).toFixed(0)}% دون مخططات إنشائية`,
        item_code: item.code
      });
    }
  }

  // 11. Luxury item in economical finish
  if (['فاخر', 'تحسيني'].includes(itemDef.classification_default) && project.finish_level === 'اقتصادي') {
    if (itemDef.classification_default === 'فاخر') {
      issues.push({
        severity: 'warning',
        code: 'LUXURY_IN_ECONOMICAL',
        message: `البند ${item.code} (${item.name_ar}) فاخر في مشروع اقتصادي`,
        item_code: item.code
      });
    }
  }

  // 12. Cleaning quantity doesn't match area
  if (item.code === 'OPR-004' && project.area > 0) {
    const expectedCleaning = project.area * 0.8;
    if (item.quantity > 0 && Math.abs(item.quantity - expectedCleaning) / expectedCleaning > 0.5) {
      issues.push({
        severity: 'warning',
        code: 'CLEANING_AREA_MISMATCH',
        message: `كمية التنظيف (${item.quantity}) لا تتناسب مع مساحة المشروع (${project.area})`,
        item_code: item.code
      });
    }
  }

  // 13. Inferred value used as confirmed
  if (item.source === 'inferred' && item.confirmed === true) {
    issues.push({
      severity: 'error',
      code: 'INFERRED_AS_CONFIRMED',
      message: `القيمة المستنتجة للبند ${item.code} تستخدم كقيمة مؤكدة`,
      item_code: item.code
    });
  }

  return issues;
}

function validateAllItems(sections, project) {
  const allIssues = [];
  const sectionItemCodes = new Set();
  for (const section of sections) {
    for (const item of section.items || []) {
      if (item.code) sectionItemCodes.add(item.code);
      if (typeof item.quantity === 'number') {
        const issues = validateItem(item, project, sections);
        allIssues.push(...issues);
      }
    }
  }
  // Only return errors (structural issues that block generation), not warnings
  // Warnings pass through, errors are flagged for review
  return allIssues;
}

function hasCriticalErrors(issues) {
  return issues.some(i => i.severity === 'error');
}

function hasBlockingErrors(issues) {
  // Only errors that prevent generation entirely
  const blockingCodes = ['STRUCTURAL_IN_FINISHING', 'FRACTIONAL_COUNT_UNIT', 'TEST_QUANTITY_NOT_ONE', 'INFERRED_AS_CONFIRMED'];
  return issues.some(i => i.severity === 'error' && blockingCodes.includes(i.code));
}

module.exports = {
  validateItem,
  validateAllItems,
  hasCriticalErrors,
  applyIntegerConstraint
};
