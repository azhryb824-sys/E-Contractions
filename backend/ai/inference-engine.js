const fs = require('fs');
const path = require('path');
const modelManager = require('./model-manager');
const similarityEngine = require('./similarity-engine');
const dataLoader = require('./data-loader');
const quantityValidator = require('./quantity-validator');
const projectSchema = require('./project-schema');
const { runBoqPipeline } = require('./boq-pipeline');
const specializedItemPredictor = require('./specialized/item-predictor');
const spaceStatePredictor = require('./specialized/space-state-predictor');
const candidateGenerator = require('./specialized/candidate-generator');

// Data state constants for distinguishing between missing, zero, and out-of-scope
const DATA_STATE = {
  MISSING: 'missing',           // Data not provided by user
  EXPLICIT_ZERO: 'explicit_zero', // User explicitly set value to 0
  INFERRED_ZERO: 'inferred_zero', // System inferred zero based on logic
  OUT_OF_SCOPE: 'out_of_scope',   // Not applicable for this project type/scope
  PROVIDED: 'provided'           // User provided a value
};

function getDataState(value, defaultValue, isExplicit) {
  if (isExplicit === false && value === 0) return DATA_STATE.EXPLICIT_ZERO;
  if (isExplicit === true && value === 0) return DATA_STATE.EXPLICIT_ZERO;
  if (value === undefined || value === null) return DATA_STATE.MISSING;
  if (value === 0 && !isExplicit) return DATA_STATE.INFERRED_ZERO;
  return DATA_STATE.PROVIDED;
}

const DATA_DIR = path.join(__dirname, 'data');
const CATALOGS_DIR = path.join(DATA_DIR, 'catalogs');
const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge');

let trainingData = [];
let itemRelationships = { relationship_groups: [] };
let itemDictionary = {};
let quantityRules = [];
let scopeRules = [];

function loadJSON(filepath) {
  try {
    if (!fs.existsSync(filepath)) return null;
    if (filepath.endsWith('.jsonl')) {
      const text = fs.readFileSync(filepath, 'utf-8').trim();
      if (!text) return [];
      return text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
    }
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function loadTrainingProjects() {
  const all = [];
  const files = [
    path.join(DATA_DIR, 'projects', 'seed-projects.json'),
    path.join(DATA_DIR, 'projects', 'synthetic-projects.jsonl'),
  ];
  for (const f of files) {
    if (fs.existsSync(f)) {
      const d = loadJSON(f);
      if (Array.isArray(d)) all.push(...d);
    }
  }
  return all;
}

try {
  trainingData = loadTrainingProjects();
  const itemsRaw = loadJSON(path.join(CATALOGS_DIR, 'items.json'));
  itemDictionary = {};
  if (Array.isArray(itemsRaw)) {
    for (const item of itemsRaw) {
      if (item && item.code) itemDictionary[item.code] = item;
    }
  }
  const relsRaw = loadJSON(path.join(KNOWLEDGE_DIR, 'item-relationships.json'));
  if (Array.isArray(relsRaw)) {
    itemRelationships = {
      relationship_groups: relsRaw.map(r => ({
        trigger_items: [r.trigger],
        name: r.reason || 'علاقة',
        essential_related: (r.required || []).map(rc => ({ item: rc, reason: r.reason || 'مطلوب', priority: 1 })),
        recommended: (r.recommended || []).map(rc => ({ item: rc, reason: r.reason || 'موصى به', classification: 'موصى_به' })),
        optional_related: []
      }))
    };
  }
  const qrRaw = loadJSON(path.join(KNOWLEDGE_DIR, 'quantity-rules.json'));
  quantityRules = Array.isArray(qrRaw) ? qrRaw : [];
  const srRaw = loadJSON(path.join(KNOWLEDGE_DIR, 'scope-rules.json'));
  scopeRules = Array.isArray(srRaw) ? srRaw : [];
} catch (e) {
  console.error('Error loading AI data files:', e.message);
}

let trainedModel = null;
let modelMetadata = null;
let inferenceMode = 'fallback_rules_and_similarity';

try {
  const loadResult = modelManager.loadModel();
  if (loadResult.success) {
    trainedModel = loadResult.model;
    modelMetadata = loadResult.metadata;
    inferenceMode = 'trained_model';
  }
} catch (e) {
  inferenceMode = 'fallback_rules_and_similarity';
}

// ============================================================
// 1. PROJECT UNDERSTANDING — EXPLICIT vs INFERRED
// ============================================================

function understandProject(request) {
  request = projectSchema.normalizeProjectRequest(request);
  const canonicalUnderstanding = projectSchema.parseProject(request);
  const result = {
    explicit_values: {},
    inferred_values: {},
    missing_information: [],
    status: 'awaiting_scope_confirmation',
    needs_scope_confirmation: false
  };

  // Collect explicit values
  if (request.area !== undefined && request.area !== null) result.explicit_values.area = request.area;
  if (request.rooms !== undefined && request.rooms !== null) result.explicit_values.room_count = request.rooms;
  if (request.room_count !== undefined && request.room_count !== null) result.explicit_values.room_count = request.room_count;
  if (request.bathrooms !== undefined && request.bathrooms !== null) result.explicit_values.bathroom_count = request.bathrooms;
  if (request.bathroom_count !== undefined && request.bathroom_count !== null) result.explicit_values.bathroom_count = request.bathroom_count;
  if (request.kitchen_count !== undefined && request.kitchen_count !== null) result.explicit_values.kitchen_count = request.kitchen_count;
  if (request.floor_count !== undefined && request.floor_count !== null) result.explicit_values.floor_count = request.floor_count;
  if (request.floors !== undefined && request.floors !== null && !result.explicit_values.floor_count) result.explicit_values.floor_count = request.floors;
  if (request.living_room_count !== undefined && request.living_room_count !== null) result.explicit_values.living_room_count = request.living_room_count;

  // Preserve zero, unknown, not-applicable and out-of-scope as distinct states.
  const spaceStates = spaceStatePredictor.inferSpaceStates(request);
  result.space_states = spaceStates;
  if (spaceStates.room_count.value !== null) result.explicit_values.room_count = spaceStates.room_count.value;
  if (spaceStates.bathroom_count.value !== null) result.explicit_values.bathroom_count = spaceStates.bathroom_count.value;

  // Infer project type
  const text = ((request.title || '') + ' ' + (request.description || '')).toLowerCase();
  if (request.project_type) {
    result.explicit_values.project_type = request.project_type;
  } else {
    let inferredType = 'سكني';
    let typeConfidence = 0.5;
    let typeReason = '';
    if (/تجاري|محل|مكتب/i.test(text)) {
      inferredType = 'تجاري'; typeConfidence = 0.7;
      typeReason = /تجاري/i.test(text) ? 'وصف المشروع تجاري' : /محل/i.test(text) ? 'ذكر محل' : 'ذكر مكتب';
    } else if (/صناعي|مستودع|مصنع/i.test(text)) {
      inferredType = 'صناعي'; typeConfidence = 0.7;
      typeReason = 'ذكر صناعي';
    } else if (/سكني|منزل|فيلا|شقة/i.test(text)) {
      inferredType = 'سكني'; typeConfidence = 0.8;
      typeReason = 'ذكر سكني';
    } else if (result.explicit_values.room_count || result.explicit_values.bathroom_count) {
      inferredType = 'سكني'; typeConfidence = 0.6;
      typeReason = 'وجود غرف وحمامات';
    }
    result.inferred_values.project_type = {
      value: inferredType,
      confidence: typeConfidence,
      requires_confirmation: typeConfidence < 0.7,
      reason: typeReason
    };
  }

  // Infer building type
  if (request.building_type) {
    result.explicit_values.building_type = request.building_type;
  } else {
    let inferredBT = null;
    let btConfidence = 0;
    let btReason = '';
    if (/فيلا/i.test(text)) { inferredBT = 'فيلا'; btConfidence = 0.8; btReason = 'ذكر فيلا'; }
    else if (/شقة/i.test(text)) { inferredBT = 'شقة'; btConfidence = 0.8; btReason = 'ذكر شقة'; }
    else if (/محل/i.test(text)) { inferredBT = 'محل'; btConfidence = 0.8; btReason = 'ذكر محل'; }
    else if (/مكتب/i.test(text)) { inferredBT = 'مكتب'; btConfidence = 0.7; btReason = 'ذكر مكتب'; }
    else if (/عمارة/i.test(text)) { inferredBT = 'عمارة'; btConfidence = 0.7; btReason = 'ذكر عمارة'; }
    else if (/منزل/i.test(text)) { inferredBT = 'منزل'; btConfidence = 0.7; btReason = 'ذكر منزل'; }
    else if (/قصر/i.test(text)) { inferredBT = 'قصر'; btConfidence = 0.8; btReason = 'ذكر قصر'; }
    else if (/مستودع/i.test(text)) { inferredBT = 'مستودع'; btConfidence = 0.8; btReason = 'ذكر مستودع'; }

    if (inferredBT) {
      result.inferred_values.building_type = {
        value: inferredBT,
        confidence: btConfidence,
        requires_confirmation: btConfidence < 0.7,
        reason: btReason
      };
    }
  }

  // Infer scope
  if (request.scope) {
    result.explicit_values.scope = request.scope;
    result.status = 'ready';
  } else {
    let inferredScope = null;
    let scopeConfidence = 0;
    let scopeReason = '';

    if (/إنشاء\s*(كامل|من الصفر|جديد)/i.test(text) || /من\s*(الحفر|الأساسات)/i.test(text)) {
      inferredScope = 'إنشاء كامل'; scopeConfidence = 0.85;
      scopeReason = 'ذكر إنشاء كامل';
    } else if (/تشطيب\s*(كامل|فاخر)/i.test(text)) {
      inferredScope = 'تشطيب كامل'; scopeConfidence = 0.8;
      scopeReason = 'ذكر تشطيب';
    } else if (/ترميم\s*(شامل|كامل)/i.test(text)) {
      inferredScope = 'ترميم شامل'; scopeConfidence = 0.8;
      scopeReason = 'ذكر ترميم';
    } else if (/كهرباء/i.test(text) && !/سباكة/i.test(text)) {
      inferredScope = 'كهرباء فقط'; scopeConfidence = 0.85;
      scopeReason = 'كهرباء فقط';
    } else if (/سباكة/i.test(text) && !/كهرباء/i.test(text)) {
      inferredScope = 'سباكة فقط'; scopeConfidence = 0.85;
      scopeReason = 'سباكة فقط';
    } else if (/دهان|بوية/i.test(text)) {
      inferredScope = 'دهانات فقط'; scopeConfidence = 0.7;
      scopeReason = 'ذكر دهانات';
    } else if (/تشطيب/i.test(text)) {
      inferredScope = 'تشطيب كامل'; scopeConfidence = 0.8;
      scopeReason = 'ذكر تشطيب';
    } else if (/ترميم/i.test(text)) {
      inferredScope = 'ترميم شامل'; scopeConfidence = 0.6;
      scopeReason = 'ذكر ترميم';
    }

    if (inferredScope && scopeConfidence >= 0.6) {
      result.inferred_values.scope = {
        value: inferredScope,
        confidence: scopeConfidence,
        requires_confirmation: scopeConfidence < 0.7,
        reason: scopeReason
      };
      result.status = scopeConfidence >= 0.7 ? 'ready' : 'awaiting_scope_confirmation';
    } else {
      result.needs_scope_confirmation = true;
      result.status = 'awaiting_scope_confirmation';
    }
  }

  // Infer finish level
  if (request.finish_level) {
    result.explicit_values.finish_level = request.finish_level;
  } else if (!request.finish_level) {
    if (/فاخر|عال/i.test(text)) {
      result.inferred_values.finish_level = { value: 'فاخر', confidence: 0.6, requires_confirmation: true, reason: 'وصف فاخر' };
    } else if (/اقتصادي|بسيط/i.test(text)) {
      result.inferred_values.finish_level = { value: 'اقتصادي', confidence: 0.6, requires_confirmation: true, reason: 'وصف اقتصادي' };
    } else if (/ديكور/i.test(text)) {
      result.inferred_values.finish_level = { value: 'جيد جداً', confidence: 0.5, requires_confirmation: true, reason: 'وجود ديكورات' };
    }
  }

  // Infer project condition
  if (request.project_condition) {
    result.explicit_values.project_condition = request.project_condition;
  } else {
    let condition = 'existing';
    let condConfidence = 0;
    let condReason = '';
    if (/قائم|موجود/i.test(text)) {
      condition = 'existing'; condConfidence = 0.8;
      condReason = 'وصف المبنى بقائم';
    } else if (/إنشاء|جديد|من الصفر/i.test(text) || /تشطيب/i.test(text)) {
      condition = 'new'; condConfidence = 0.6;
      condReason = 'وصف إنشاء جديد';
    }

    if (condConfidence > 0) {
      const requiresConf = condConfidence < 0.7 && !request.scope;
      result.inferred_values.project_condition = {
        value: condition,
        confidence: condConfidence,
        requires_confirmation: requiresConf,
        reason: condReason
      };
    }
  }

  // Collect missing info with data state tracking
  const areaState = getDataState(request.area, null, request.area_explicit);
  if (areaState === DATA_STATE.MISSING) {
    result.missing_information.push({ field: 'area', description: 'المساحة', state: DATA_STATE.MISSING });
  } else if (areaState === DATA_STATE.EXPLICIT_ZERO) {
    result.explicit_values.area = 0;
    result.missing_information.push({ field: 'area', description: 'المساحة', state: DATA_STATE.EXPLICIT_ZERO, note: 'تم تحديدها كصفر صراحة' });
  }
  
  if (spaceStates.room_count.state === 'unknown') {
    result.missing_information.push({ field: 'room_count', description: 'عدد الغرف', state: DATA_STATE.MISSING });
  } else if (spaceStates.room_count.state === 'explicit_zero') {
    result.explicit_values.room_count = 0;
    result.missing_information.push({ field: 'room_count', description: 'عدد الغرف', state: DATA_STATE.EXPLICIT_ZERO, note: 'تم تحديدها كصفر صراحة' });
  }
  
  if (spaceStates.bathroom_count.state === 'unknown') {
    result.missing_information.push({ field: 'bathroom_count', description: 'عدد الحمامات', state: DATA_STATE.MISSING });
  } else if (spaceStates.bathroom_count.state === 'explicit_zero') {
    result.explicit_values.bathroom_count = 0;
    result.missing_information.push({ field: 'bathroom_count', description: 'عدد الحمامات', state: DATA_STATE.EXPLICIT_ZERO, note: 'تم تحديدها كصفر صراحة' });
  }
  
  if (!request.finish_level && !result.explicit_values.finish_level && !result.inferred_values.finish_level) {
    result.missing_information.push({ field: 'finish_level', description: 'مستوى التشطيب', state: DATA_STATE.MISSING });
  }
  
  if (!request.city) {
    result.missing_information.push({ field: 'city', description: 'المدينة/الموقع', state: DATA_STATE.MISSING });
  }
  
  if (!request.building_type && !result.explicit_values.building_type && !result.inferred_values.building_type) {
    result.missing_information.push({ field: 'building_type', description: 'نوع المبنى', state: DATA_STATE.MISSING });
  }
  
  if (result.needs_scope_confirmation) {
    result.missing_information.push({ field: 'scope', description: 'نطاق العمل', state: DATA_STATE.MISSING });
  }

  result.confirmed_inferred_values = canonicalUnderstanding.confirmed_inferred_values;
  result.unconfirmed_inferred_values = canonicalUnderstanding.unconfirmed_inferred_values;
  result.questions = canonicalUnderstanding.questions;
  if (spaceStates.room_count.state === 'unknown') result.questions.push({ field: 'room_count', question: 'كم عدد الغرف أو الفراغات المغلقة الداخلة ضمن نطاق المشروع؟' });
  if (spaceStates.bathroom_count.state === 'unknown') result.questions.push({ field: 'bathroom_count', question: 'كم عدد الحمامات الداخلة ضمن نطاق المشروع؟' });
  result.canonical_schema = canonicalUnderstanding;
  return result;
}

function getScopeConfirmationOptions() {
  return [
    { value: 'إنشاء كامل', label: 'إنشاء كامل من الحفر والأساسات حتى التسليم' },
    { value: 'تشطيب كامل', label: 'تشطيب مبنى قائم' },
    { value: 'ترميم شامل', label: 'ترميم وتجديد مبنى قائم' },
    { value: 'كهرباء فقط', label: 'أعمال كهرباء فقط' },
    { value: 'سباكة فقط', label: 'أعمال سباكة فقط' },
    { value: 'دهانات فقط', label: 'أعمال دهانات فقط' },
    { value: 'أعمال محددة', label: 'نطاق مخصص (أعمال محددة)' }
  ];
}

// ============================================================
// 2. SCOPE-BASED SECTION FILTERING
// ============================================================

function getAllowedSectionsForScope(scope) {
  if (!scope) return [];
  const rule = scopeRules.find(r => r.scope === scope);
  if (rule && rule.allowed_sections) return rule.allowed_sections;
  return [];
}

function getForbiddenSectionsForScope(scope) {
  if (!scope) return [];
  const rule = scopeRules.find(r => r.scope === scope);
  if (rule && rule.forbidden_sections) return rule.forbidden_sections;
  return [];
}

function getForbiddenItemsForScope(scope) {
  if (!scope) return [];
  const rule = scopeRules.find(r => r.scope === scope);
  if (rule && rule.forbidden_items) return rule.forbidden_items;
  return [];
}

function getScopeRequiresStructuralDrawings(scope) {
  if (!scope) return false;
  const rule = scopeRules.find(r => r.scope === scope);
  return rule ? rule.requires_structural_drawings : false;
}

// ============================================================
// 3. REAL CONFIDENCE CALCULATION
// ============================================================

function calculateRealConfidence(itemCode, projectParams, extra) {
  const dict = itemDictionary[itemCode] || {};
  let score = 0;
  const factors = [];
  const penalties = [];

  // Factor 1: Data completeness (0-0.25)
  let dataScore = 0;
  const fields = [
    { key: 'area', weight: 0.07 },
    { key: 'room_count', weight: 0.04 },
    { key: 'bathroom_count', weight: 0.04 },
    { key: 'finish_level', weight: 0.03 },
    { key: 'city', weight: 0.02 },
    { key: 'project_type', weight: 0.03 },
    { key: 'building_type', weight: 0.02 }
  ];
  for (const f of fields) {
    if (projectParams[f.key]) dataScore += f.weight;
  }
  const completeness = Math.min(0.25, dataScore);
  score += completeness;
  factors.push({ factor: 'data_completeness', score: completeness });

  // Factor 2: Calculation rule strength (0-0.25)
  const rule = (quantityRules || []).find(r => r.item_codes && r.item_codes.includes(itemCode));
  let ruleScore = 0;
  if (rule) {
    if (rule.quantity_driver === 'fixed_per_project') ruleScore = 0.25;
    else if (rule.quantity_driver === 'bathroom_count' || rule.quantity_driver === 'kitchen_count' || rule.quantity_driver === 'entrance_count') ruleScore = 0.20;
    else if (rule.quantity_driver === 'room_count' || rule.quantity_driver === 'conditioned_space_count') ruleScore = 0.15;
    else if (rule.quantity_driver === 'usable_area' || rule.quantity_driver === 'wall_area' || rule.quantity_driver === 'ceiling_area') ruleScore = 0.12;
    else if (rule.quantity_driver === 'rate_by_space_type') ruleScore = 0.15;
    else if (rule.quantity_driver === 'drawing_measurement' || rule.quantity_driver === 'engineering_formula') ruleScore = 0.05;
    else ruleScore = 0.10;
  } else if (dict.quantity_driver) {
    if (dict.quantity_driver === 'fixed_per_project' || dict.quantity_driver === 'fixed_per_floor') ruleScore = 0.22;
    else if (dict.quantity_driver === 'bathroom_count' || dict.quantity_driver === 'kitchen_count') ruleScore = 0.18;
    else if (dict.quantity_driver === 'usable_area' || dict.quantity_driver === 'wall_area') ruleScore = 0.10;
    else if (dict.quantity_driver === 'rate_by_space_type') ruleScore = 0.12;
    else ruleScore = 0.08;
  }
  score += ruleScore;
  factors.push({ factor: 'rule_strength', score: ruleScore });

  // Factor 3: Drawings available (0-0.20)
  const hasDrawings = extra && (extra.drawings_available || extra.has_drawings);
  if (hasDrawings) {
    score += 0.20;
    factors.push({ factor: 'drawings_available', score: 0.20 });
  } else {
    factors.push({ factor: 'drawings_available', score: 0 });
    penalties.push('لا توجد مخططات');
  }

  // Factor 4: Similar projects quality (0-0.15)
  const similarCount = extra && extra.similar_project_count ? extra.similar_project_count : 0;
  const simScore = Math.min(0.15, similarCount * 0.03);
  score += simScore;
  factors.push({ factor: 'similar_projects_quality', score: simScore });

  // Factor 5: Similar projects count (0-0.10)
  const countScore = Math.min(0.10, similarCount * 0.02);
  score += countScore;
  factors.push({ factor: 'similar_projects_count', score: countScore });

  // Factor 6: Model + rule agreement (0-0.05)
  factors.push({ factor: 'model_rule_agreement', score: 0.03 });
  score += 0.03;

  // PENALTIES
  const scope = projectParams.scope || '';
  if (!scope) {
    score -= 0.15;
    penalties.push('نطاق المشروع غير محدد');
  }
  if (!projectParams.building_type) {
    score -= 0.10;
    penalties.push('نوع المبنى غير محدد');
  }
  if (!extra || !extra.drawings_available) {
    if (dict.requires_engineering_calculation) {
      score -= 0.20;
      penalties.push('بند يحتاج حساباً هندسياً');
    }
  }
  const hasInferredScope = extra && extra.has_inferred_scope;
  if (hasInferredScope) {
    score -= 0.08;
    penalties.push('استخدام نطاق مستنتج غير مؤكد');
  }
  if (extra && extra.seed_data_used) {
    score -= 0.10;
    penalties.push('استخدام بيانات Seed غير معتمدة');
  }

  // Additional penalties for structural items without drawings
  const isStructural = ['CON-001', 'CON-002', 'CON-003', 'CON-004', 'CON-005', 'EXC-001', 'BLK-001'].includes(itemCode);
  if (isStructural && !hasDrawings) {
    score -= 0.25;
    penalties.push('بند إنشائي دون مخططات');
  }

  // Boost for fixed_per_project items that don't depend on drawings
  const driver = dict.quantity_driver || rule?.quantity_driver || '';
  if (driver === 'fixed_per_project' || driver === 'fixed_per_floor') {
    score += 0.25;
    factors.push({ factor: 'fixed_item_driver', score: 0.25 });
  }

  // Boost for bathroom/kitchen count items (direct relationship)
  if (['bathroom_count', 'kitchen_count', 'entrance_count'].includes(driver)) {
    if (projectParams.bathroom_count || projectParams.kitchen_count) {
      score += 0.15;
      factors.push({ factor: 'direct_count_relationship', score: 0.15 });
    }
  }

  const conf = Math.max(0.05, Math.min(0.98, score));

  const level =
    conf < 0.4 ? 'منخفضة' :
    conf < 0.7 ? 'متوسطة' :
    conf < 0.9 ? 'جيدة' : 'عالية';

  return {
    confidence: Math.round(conf * 100) / 100,
    confidence_level: level,
    confidence_factors: factors,
    confidence_penalties: penalties
  };
}

// ============================================================
// 4. ITEM GENERATION WITH SOURCE TRACKING
// ============================================================

const INTEGER_UNITS = new Set(['عدد', 'قطعة', 'جهاز', 'نظام', 'لوحة', 'باب', 'مكيف', 'مرحاض', 'مغسلة', 'خلاط', 'مضخة', 'خزان', 'مصعد']);

function generateItemFromDict(itemCode, projectParams, extra) {
  const dict = itemDictionary[itemCode];
  if (!dict) return null;
  if (!extra) extra = {};

  const forbiddenItems = getForbiddenItemsForScope(projectParams.scope || '');
  if (forbiddenItems.includes(itemCode)) return null;

  const scope = projectParams.scope || '';
  const allowedSections = getAllowedSectionsForScope(scope);
  const forbiddenSections = getForbiddenSectionsForScope(scope);
  const requiresStructural = getScopeRequiresStructuralDrawings(scope);

  // Determine quantity
  let q = 0;
  let method = 'تقدير آلي';
  let source = 'seed_rule';
  let sourceDetails = { source: 'seed_rule', details: 'قاعدة افتراضية' };

  const rule = quantityRules.find(r => r.item_codes && r.item_codes.includes(itemCode));

  if (rule) {
    source = 'engineering_rule';
    sourceDetails = { rule_id: rule.rule_id, source: 'engineering_rule', details: rule.rule };

    // Calculate based on rule
    if (rule.quantity_driver === 'fixed_per_project' || rule.quantity_driver === 'fixed_per_floor') {
      if (rule.quantity_driver === 'fixed_per_floor' && projectParams.floor_count) {
        q = rule.default_quantity !== undefined ? rule.default_quantity * projectParams.floor_count : projectParams.floor_count;
      } else {
        // Don't default to 1 - mark as missing data instead
        if (rule.default_quantity !== undefined) {
          q = rule.default_quantity;
        } else {
          q = 0;
          method = 'بيانات مفقودة';
          source = 'missing_data';
          sourceDetails = { source: 'missing_data', details: 'الكمية الافتراضية غير محددة، يتطلب إدخال يدوي' };
        }
      }
      if (source !== 'missing_data') {
        method = rule.quantity_driver === 'fixed_per_floor' ? 'ثابت لكل دور' : 'ثابت لكل مشروع';
      }
    } else if (rule.quantity_driver === 'bathroom_count' && projectParams.bathroom_count) {
      q = projectParams.bathroom_count * (rule.default_per_bathroom || 1);
      method = `عدد الحمامات × ${rule.default_per_bathroom || 1}`;
      source = 'engineering_rule';
    } else if (rule.quantity_driver === 'kitchen_count' && projectParams.kitchen_count) {
      q = projectParams.kitchen_count;
      method = `عدد المطابخ × 1`;
    } else if (rule.quantity_driver === 'room_count' && projectParams.room_count) {
      const perRoom = rule.default_per_room || 1.2;
      q = Math.ceil(projectParams.room_count * perRoom);
      method = `عدد الغرف × ${perRoom}`;
    } else if (rule.quantity_driver === 'conditioned_space_count') {
      const roomCt = projectParams.room_count || 3;
      const livingCt = projectParams.living_room_count || 1;
      q = roomCt + livingCt;
      method = 'غرف + صالات';
    } else if (rule.quantity_driver === 'entrance_count') {
      // Don't default to 1 - mark as missing data instead
      if (rule.default_when_unknown !== undefined) {
        q = rule.default_when_unknown;
      } else {
        q = 0;
        method = 'بيانات مفقودة';
        source = 'missing_data';
        sourceDetails = { source: 'missing_data', details: 'عدد المداخل غير محدد، يتطلب إدخال يدوي' };
      }
      if (source !== 'missing_data') {
        method = 'عدد المداخل';
      }
    } else if (rule.quantity_driver === 'rate_by_space_type') {
      // Use the rule description to calculate
      if (itemCode === 'ELC-001') {
        q = (projectParams.room_count || 3) * 4 + (projectParams.bathroom_count || 2) * 2 + 3 + 1;
        method = 'غرف × 4 + حمامات × 2 + صالة + مطبخ';
      } else if (itemCode === 'ELC-003') {
        q = (projectParams.room_count || 3) * 6 + (projectParams.bathroom_count || 2) * 2 + 8 + 4 + 2;
        method = 'غرف × 6 + حمامات × 2 + صالة + مطبخ + ممر';
      } else if (itemCode === 'LIG-001') {
        q = Math.ceil((projectParams.area || 150) * 0.1);
        method = 'مساحة × 0.1';
      } else {
        q = (projectParams.room_count || 3) * 3;
        method = 'تقدير حسب الفراغات';
      }
    } else if (rule.quantity_driver === 'usable_area' || rule.quantity_driver === 'project_area') {
      const ratio = rule.default_coverage_ratio || 0.7;
      q = (projectParams.area || 150) * ratio;
      method = `مساحة × ${ratio}`;
    } else if (rule.quantity_driver === 'wall_area') {
      const factor = rule.default_wall_factor || 2.2;
      q = (projectParams.area || 150) * factor;
      method = `مساحة × ${factor}`;
    } else if (rule.quantity_driver === 'ceiling_area') {
      const ratio = rule.default_ceiling_ratio || 0.95;
      q = (projectParams.area || 150) * ratio;
      method = `مساحة × ${ratio}`;
    } else if (rule.quantity_driver === 'equipment_count') {
      const hvacCount = (projectParams.room_count || 3) + (projectParams.living_room_count || 1);
      const applianceCount = (projectParams.kitchen_count || 1) * 2;
      q = hvacCount + applianceCount;
      method = 'أجهزة تكييف + أجهزة مطبخ';
    } else if (rule.quantity_driver === 'door_count_from_spaces') {
      q = (projectParams.room_count || 3) + (projectParams.bathroom_count || 2) + (projectParams.kitchen_count || 1) + 1;
      method = 'غرف + حمامات + مطبخ + مدخل';
    } else if (rule.quantity_driver === 'drawing_measurement' || rule.quantity_driver === 'engineering_formula') {
      q = 0;
      method = 'يتطلب مخططات';
      source = 'unavailable_no_drawings';
      sourceDetails = { rule_id: rule.rule_id, source: 'unavailable', details: 'يتطلب حساباً هندسياً أو مخططات' };
    } else {
      q = (projectParams.area || 150) * 0.1;
      method = 'تقدير تقريبي';
    }
  } else if (dict.quantity_driver === 'linked_item' && Array.isArray(dict.linked_item_codes)) {
    source = 'linked_item_stub';
    sourceDetails = { source: 'linked_item_stub', linked_to: dict.linked_item_codes.join(', '), details: 'مرتبط ببند آخر، يحسب لاحقاً من البند المرتبط' };
    q = 0;
    method = 'مرتبط ببند آخر';
  } else if (dict.quantity_driver === 'fixed_per_project') {
    // Don't default to 1 - mark as missing data instead
    if (dict.default_quantity !== undefined) {
      q = dict.default_quantity;
      method = 'ثابت للمشروع';
      source = 'engineering_rule';
      sourceDetails = { source: 'engineering_rule', details: 'كمية ثابتة' };
    } else {
      q = 0;
      method = 'بيانات مفقودة';
      source = 'missing_data';
      sourceDetails = { source: 'missing_data', details: 'الكمية الافتراضية غير محددة، يتطلب إدخال يدوي' };
    }
  } else if (dict.quantity_driver === 'bathroom_count' && projectParams.bathroom_count) {
    q = projectParams.bathroom_count;
    method = 'عدد الحمامات';
    source = 'engineering_rule';
    sourceDetails = { source: 'engineering_rule', details: 'كمية = عدد الحمامات' };
  } else if (dict.quantity_driver === 'kitchen_count' && projectParams.kitchen_count) {
    q = projectParams.kitchen_count;
    method = 'عدد المطابخ';
    source = 'engineering_rule';
    sourceDetails = { source: 'engineering_rule', details: 'كمية = عدد المطابخ' };
  } else if (dict.quantity_driver === 'room_count' && projectParams.room_count) {
    q = projectParams.room_count;
    method = 'عدد الغرف';
    source = 'engineering_rule';
    sourceDetails = { source: 'engineering_rule', details: 'كمية = عدد الغرف' };
  } else if (dict.quantity_driver === 'project_area') {
    q = projectParams.area || 150;
    method = 'مساحة المشروع';
    source = 'seed_rule';
    sourceDetails = { source: 'seed_rule', details: 'تقدير من المساحة' };
  } else if (dict.quantity_driver === 'usable_area') {
    const ratio = 0.7;
    q = (projectParams.area || 150) * ratio;
    method = `مساحة × ${ratio}`;
    source = 'seed_rule';
    sourceDetails = { source: 'seed_rule', details: 'مساحة قابلة للاستخدام' };
  } else if (dict.quantity_driver === 'wall_area') {
    q = (projectParams.area || 150) * 2.2;
    method = 'مساحة × 2.2';
    source = 'seed_rule';
    sourceDetails = { source: 'seed_rule', details: 'مساحة جدران تقديرية' };
  } else if (dict.quantity_driver === 'ceiling_area') {
    q = (projectParams.area || 150) * 0.95;
    method = 'مساحة × 0.95';
    source = 'seed_rule';
    sourceDetails = { source: 'seed_rule', details: 'مساحة أسقف تقديرية' };
  } else if (dict.quantity_driver === 'rate_by_space_type') {
    if (itemCode === 'ELC-001') {
      q = (projectParams.room_count || 3) * 4 + (projectParams.bathroom_count || 2) * 2 + 3 + 1;
      method = 'غرف × 4 + حمامات × 2 + صالة + مطبخ';
    } else if (itemCode === 'ELC-003') {
      q = (projectParams.room_count || 3) * 6 + (projectParams.bathroom_count || 2) * 2 + 8 + 4 + 2;
      method = 'غرف × 6 + حمامات × 2 + صالة + مطبخ + ممر';
    } else {
      q = (projectParams.room_count || 3) * 3;
      method = 'تقدير حسب الفراغات';
    }
    source = 'engineering_rule';
    sourceDetails = { source: 'engineering_rule', details: 'معدل حسب نوع الفراغ' };
  } else if (dict.quantity_driver === 'equipment_count') {
    q = (projectParams.room_count || 3) + (projectParams.living_room_count || 1) + (projectParams.kitchen_count || 1);
    method = 'غرف + صالات + مطبخ';
    source = 'seed_rule';
    sourceDetails = { source: 'seed_rule', details: 'تقدير عدد الأجهزة' };
  } else if (dict.quantity_driver === 'fixed_per_floor' && projectParams.floor_count) {
    q = projectParams.floor_count;
    method = 'عدد الأدوار';
    source = 'engineering_rule';
    sourceDetails = { source: 'engineering_rule', details: 'لوحة لكل دور' };
  } else if (dict.quantity_driver === 'manual_confirmation') {
    source = 'manual_confirmation';
    sourceDetails = { source: 'manual_confirmation', details: 'يتطلب تأكيداً يدوياً' };
    q = 0;
    method = 'يتطلب تأكيداً يدوياً';
  } else if (dict.quantity_driver === 'room_perimeter') {
    const perimeterFactor = 12;
    q = Math.sqrt(projectParams.area || 150) * perimeterFactor;
    method = 'محيط الغرف';
    source = 'seed_rule';
    sourceDetails = { source: 'seed_rule', details: 'محيط الغرف التقديري' };
  } else if (dict.quantity_driver === 'fixture_count') {
    const perBathroom = 6;
    q = (projectParams.bathroom_count || 2) * perBathroom + (projectParams.kitchen_count || 1) * 2;
    method = 'عدد نقاط السباكة';
    source = 'seed_rule';
    sourceDetails = { source: 'seed_rule', details: 'عدد الحمامات × 6 + مطبخ × 2' };
  } else if (dict.quantity_driver === 'facade_area') {
    q = (projectParams.area || 150) * 0.4;
    method = 'مساحة × 0.4';
    source = 'seed_rule';
    sourceDetails = { source: 'seed_rule', details: 'مساحة الواجهات التقديرية' };
  } else if (dict.quantity_driver === 'bedroom_count') {
    q = Math.max(1, (projectParams.room_count || 3) - 1);
    method = 'غرف النوم';
    source = 'seed_rule';
    sourceDetails = { source: 'seed_rule', details: 'تقدير عدد غرف النوم' };
  } else {
    // Generic fallback: give at least a nominal quantity
    q = (projectParams.area || 150) * 0.05;
    method = 'تقدير افتراضي';
    source = 'seed_fallback';
    sourceDetails = { source: 'seed_fallback', details: 'تقدير افتراضي - قد يحتاج مراجعة' };
  }

  // Try model prediction but only for items where regression makes sense
  const driversNotOverridden = ['fixed_per_project', 'bathroom_count', 'kitchen_count', 'entrance_count', 'fixed_per_floor', 'door_count_from_spaces', 'conditioned_space_count', 'rate_by_space_type', 'project_area', 'usable_area', 'wall_area', 'ceiling_area', 'room_count', 'equipment_count', 'bedroom_count', 'room_perimeter', 'fixture_count', 'facade_area'];
  const shouldUseModel = inferenceMode === 'trained_model' && trainedModel
    && !driversNotOverridden.includes(dict.quantity_driver)
    && !driversNotOverridden.includes(rule?.quantity_driver)
    && q > 0; // Don't override if we already have a reasonable rule-based q
  if (shouldUseModel) {
    const modelPred = predictQuantityFromModel(itemCode, projectParams);
    if (modelPred && modelPred.quantity > 0 && modelPred.confidence > 0.7) {
      q = modelPred.quantity;
      source = 'trained_model';
      sourceDetails = { source: 'trained_model', details: `توقع من النموذج (ثقة ${Math.round(modelPred.confidence * 100)}%)` };
      method = 'توقع من النموذج';
    }
  }

  // Determine if scope is inferred
  const hasInferredScope = !projectParams.scope || (extra && extra.scope_inferred);
  const hasDrawings = extra && (extra.drawings_available || extra.has_drawings);
  const seedUsed = source === 'seed_rule' || source === 'seed_fallback';

  const realConf = calculateRealConfidence(itemCode, {
    ...projectParams,
    scope: projectParams.scope || '',
    building_type: projectParams.building_type || extra.building_type || '',
    finish_level: projectParams.finish_level || ''
  }, {
    drawings_available: hasDrawings,
    similar_project_count: extra.similar_project_count || 0,
    has_inferred_scope: hasInferredScope,
    seed_data_used: seedUsed
  });

  // Apply integer constraint
  const integerResult = quantityValidator.applyIntegerConstraint(q, { code: itemCode, unit: dict.unit, integer_required: dict.integer_required }, projectParams);
  const finalQ = integerResult.quantity;

  const isStructural = ['CON-001', 'CON-002', 'CON-003', 'CON-004', 'CON-005', 'EXC-001', 'BLK-001', 'BLK-002'].includes(itemCode);

  // Don't return items with zero quantity that are not linkable/fixed
  if (finalQ <= 0 && source !== 'linked_item_stub' && source !== 'manual_confirmation' && source !== 'unavailable_no_drawings') {
    return null;
  }

  return {
    code: itemCode,
    name_ar: dict.name_ar,
    description: dict.description || '',
    category: dict.category || '',
    unit: dict.unit,
    quantity: finalQ,
    raw_quantity: integerResult.raw_quantity,
    quantity_min: Math.round(finalQ * 0.85 * 100) / 100,
    quantity_max: Math.round(finalQ * 1.15 * 100) / 100,
    quantity_calculated: true,
    confidence: realConf.confidence,
    confidence_level: realConf.confidence_level,
    confidence_factors: realConf.confidence_factors,
    confidence_penalties: realConf.confidence_penalties,
    classification: dict.classification_default || 'أساسي',
    calculation_method: method,
    quantity_driver: dict.quantity_driver || rule?.quantity_driver || '',
    quantity_source: source === 'trained_model' ? 'model' : (source === 'similar_project' ? 'similar_projects' : 'rule'),
    integer_required: dict.integer_required || INTEGER_UNITS.has(dict.unit),
    rounding_applied: integerResult.rounding_applied,
    rounding_rule: integerResult.rounding_rule,
    source: source,
    source_details: sourceDetails,
    sources: [source],
    ai_suggested: true,
    user_requested: false,
    needs_confirmation: realConf.confidence < 0.55,
    requires_engineering_calculation: !!dict.requires_engineering_calculation || !!rule?.requires_engineering_calculation,
    requires_manual_confirmation: !!dict.requires_manual_confirmation,
    price_status: 'غير_مسعر',
    unit_price: null,
    total_cost: null,
    dependencies: dict.dependencies || [],
    assumptions: []
  };
}

function predictQuantityFromModel(itemCode, projectParams) {
  if (!trainedModel || !trainedModel.data || !trainedModel.data.quantity_models) return null;
  const qm = trainedModel.data.quantity_models[itemCode];
  if (!qm || qm.count === 0) return null;

  const area = projectParams.area || 0;
  let predictedQ = null;
  let confidence = 0;

  if (qm.regression && qm.regression.slope !== 0) {
    predictedQ = qm.regression.slope * area + qm.regression.intercept;
    confidence = Math.min(0.7, 0.3 + (qm.count * 0.02));
  }

  if (predictedQ === null || predictedQ <= 0) {
    if (qm.global_mean && qm.global_mean > 0) {
      predictedQ = qm.global_mean;
      confidence = 0.3;
    }
  }

  if (predictedQ === null || predictedQ <= 0) return null;

  return { quantity: Math.round(predictedQ * 100) / 100, confidence };
}

// ============================================================
// 5. SCOPE CLASSIFICATION
// ============================================================

function classifyScope(description, title) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  if (/إنشاء\s*(كامل|من الصفر|جديد)/i.test(text) || /من\s*(الحفر|الأساسات)/i.test(text)) return 'إنشاء كامل';
  if (/تشطيب\s*(كامل|فاخر)/i.test(text)) return 'تشطيب كامل';
  if (/ترميم\s*(شامل|كامل)/i.test(text)) return 'ترميم شامل';
  if (/هيكل/i.test(text)) return 'إنشاء كامل';
  if (/كهرباء/i.test(text) && !/سباكة/i.test(text)) return 'كهرباء فقط';
  if (/سباكة/i.test(text) && !/كهرباء/i.test(text)) return 'سباكة فقط';
  if (/دهان|بوية/i.test(text) && !/أرض|سباك|كهرباء/i.test(text)) return 'دهانات فقط';
  if (/تشطيب/i.test(text)) return 'تشطيب كامل';
  if (/ترميم/i.test(text)) return 'ترميم شامل';
  if (/توسعة/i.test(text)) return 'توسعة';
  if (/صيانة/i.test(text)) return 'صيانة';
  return null;
}

function classifyBuildingType(description, title) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  if (/فيلا/i.test(text)) return 'فيلا';
  if (/شقة/i.test(text)) return 'شقة';
  if (/محل/i.test(text) || /تجاري/i.test(text)) return 'محل';
  if (/مكتب/i.test(text)) return 'مكتب';
  if (/مستودع/i.test(text) || /صناعي/i.test(text)) return 'مستودع';
  if (/عمارة/i.test(text)) return 'عمارة';
  if (/قصر/i.test(text)) return 'قصر';
  if (/منزل/i.test(text) || /بيت/i.test(text)) return 'منزل';
  return null;
}

function classifyProjectType(description, title) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  if (/تجاري|محل/i.test(text)) return 'تجاري';
  if (/صناعي|مستودع|مصنع/i.test(text)) return 'صناعي';
  if (/مكتب/i.test(text)) return 'مكتبي';
  if (/سكني|منزل|فيلا|شقة/i.test(text)) return 'سكني';
  return 'سكني';
}

// ============================================================
// 6. MAIN ANALYSIS AND GENERATION
// ============================================================

function computeDataCompleteness(request) {
  let score = 0;
  const fields = [
    { key: 'area', weight: 0.20 },
    { key: 'rooms', weight: 0.12 }, { key: 'room_count', weight: 0.12 },
    { key: 'bathrooms', weight: 0.12 }, { key: 'bathroom_count', weight: 0.12 },
    { key: 'finish_level', weight: 0.10 },
    { key: 'city', weight: 0.08 },
    { key: 'project_type', weight: 0.10 },
    { key: 'building_type', weight: 0.08 },
    { key: 'scope', weight: 0.08 },
    { key: 'floor_count', weight: 0.06 }, { key: 'floors', weight: 0.06 }
  ];
  for (const f of fields) {
    if (request[f.key]) score += f.weight;
  }
  return Math.round(Math.min(1, score) * 100) / 100;
}

function analyzeRequest(request) {
  const type = request.project_type || classifyProjectType(request.description, request.title);
  const buildingType = request.building_type || classifyBuildingType(request.description, request.title);
  const scope = request.scope || classifyScope(request.description, request.title);

  const missingInfo = [];
  if (!request.area) missingInfo.push({ field: 'area', description: 'مساحة المشروع', impact: 'سيتم استخدام تقدير تقريبي' });
  if (!request.rooms && !request.room_count) missingInfo.push({ field: 'rooms', description: 'عدد الغرف', impact: 'تقدير تقريبي' });
  if (!request.bathrooms && !request.bathroom_count) missingInfo.push({ field: 'bathrooms', description: 'عدد الحمامات', impact: 'تقدير تقريبي' });
  if (!request.finish_level) missingInfo.push({ field: 'finish_level', description: 'مستوى التشطيب', impact: 'سيتم استخدام مستوى افتراضي' });
  if (!request.city) missingInfo.push({ field: 'city', description: 'الموقع/المدينة', impact: 'سيتم استخدام متوسط أسعار وطني' });
  if (!scope) missingInfo.push({ field: 'scope', description: 'نطاق العمل', impact: 'مطلوب لتحديد البنود' });

  const dataCompleteness = computeDataCompleteness(request);

  return {
    type,
    scope,
    buildingType,
    confidence: Math.max(0.3, Math.min(0.98, 0.45 + dataCompleteness * 0.5)),
    dataCompleteness,
    missingInfo
  };
}

function generateEstimate(request) {
  request = projectSchema.normalizeProjectRequest(request);
  const canonicalRequest = { ...request };
  request = projectSchema.toLegacyRequest(request);
  const understanding = understandProject(request);

  // If scope is not clear, return scope confirmation
  if (understanding.status === 'awaiting_scope_confirmation' && !request.scope) {
    return {
      status: 'awaiting_scope_confirmation',
      understood_project: {
        explicit_values: understanding.explicit_values,
        inferred_values: understanding.inferred_values,
        missing_information: understanding.missing_information
      },
      question: 'ما نطاق المشروع المطلوب؟',
      options: getScopeConfirmationOptions()
    };
  }

  const scope = request.scope || understanding.inferred_values.scope?.value || classifyScope(request.description, request.title);
  const analysis = analyzeRequest(request);

  const projectParams = {
    area: request.area || 150,
    room_count: understanding.space_states.room_count.value,
    bathroom_count: understanding.space_states.bathroom_count.value,
    kitchen_count: request.kitchen_count || 1,
    floor_count: request.floors || request.floor_count || 1,
    living_room_count: request.living_room_count || 1,
    finish_level: request.finish_level || 'جيد',
    city: request.city || '',
    building_type: request.building_type || understanding.inferred_values.building_type?.value || analysis.buildingType || '',
    project_type: request.project_type || understanding.inferred_values.project_type?.value || analysis.type || 'سكني',
    scope: scope || 'تشطيب كامل'
  };

  const allowedSectionCodes = getAllowedSectionsForScope(projectParams.scope);
  const forbiddenSectionCodes = getForbiddenSectionsForScope(projectParams.scope);
  const forbiddenItemCodes = getForbiddenItemsForScope(projectParams.scope);

  // Load section definitions from catalog
  const sectionsCatalog = loadJSON(path.join(CATALOGS_DIR, 'sections.json')) || [];
  const sectionMap = {};
  for (const s of sectionsCatalog) {
    sectionMap[s.code] = s;
  }

  // Get items per section from the catalog
  const itemsCatalog = loadJSON(path.join(CATALOGS_DIR, 'items.json')) || [];
  const sectionItemsMap = {};
  for (const item of itemsCatalog) {
    if (item && item.code) {
      // Find which section this item belongs to
      // Items have "section" field
      const secCode = item.section || '';
      if (secCode) {
        if (!sectionItemsMap[secCode]) sectionItemsMap[secCode] = [];
        sectionItemsMap[secCode].push(item.code);
      }
    }
  }

  // Map item codes to their source section in sections.json
  // We infer section from item data
  const itemToSectionMap = {};
  for (const item of itemsCatalog) {
    if (item && item.code && item.section) {
      // Map section name to section code
      for (const sec of sectionsCatalog) {
        if (sec.name === item.section) {
          itemToSectionMap[item.code] = sec.code;
          break;
        }
      }
    }
  }

  // Build the list of sections that match the scope
  const sections = [];
  const existingItemCodes = [];
  const allowedFilteredSections = sectionsCatalog.filter(s => allowedSectionCodes.includes(s.code));

  // Attempt 1: Match items to sections using section name
  for (const secDef of allowedFilteredSections) {
    const sectionItems = itemsCatalog.filter(item => {
      const matchesSection = item.section === secDef.name;
      if (!matchesSection) return false;
      if (forbiddenItemCodes.includes(item.code)) return false;
      return true;
    });

    const generatedItems = [];
    for (const itemDef of sectionItems) {
      const item = generateItemFromDict(itemDef.code, projectParams, {
        similar_project_count: 0,
        scope_inferred: !!understanding.inferred_values.scope,
        drawings_available: false,
        building_type: projectParams.building_type
      });
      if (item) {
        generatedItems.push(item);
        existingItemCodes.push(itemDef.code);
      }
    }

    if (generatedItems.length > 0) {
      sections.push({
        code: secDef.code,
        name: secDef.name,
        sort_order: secDef.sort_order || sections.length + 1,
        items: generatedItems
      });
    }
  }

  // Attempt 2: Fall back to using section name matching again (same as attempt 1 but deduplicates)
  if (sections.length === 0) {
    const seenCodes = new Set();
    for (const secDef of allowedFilteredSections) {
      const items = [];
      const candidates = itemsCatalog.filter(item => item.section === secDef.name);
      for (const itemDef of candidates) {
        if (forbiddenItemCodes.includes(itemDef.code)) continue;
        if (seenCodes.has(itemDef.code)) continue;
        seenCodes.add(itemDef.code);
        const item = generateItemFromDict(itemDef.code, projectParams, {
          similar_project_count: 0,
          scope_inferred: !!understanding.inferred_values.scope,
          drawings_available: false,
          building_type: projectParams.building_type
        });
        if (item) {
          items.push(item);
          existingItemCodes.push(itemDef.code);
        }
      }
      if (items.length > 0) {
        sections.push({
          code: secDef.code,
          name: secDef.name,
          sort_order: secDef.sort_order || sections.length + 1,
          items
        });
      }
    }
  }

  // Attempt 3: Ultimate fallback - generate all non-forbidden items into sections
  if (sections.length === 0) {
    for (const secDef of allowedFilteredSections) {
      const items = [];
      for (const itemDef of itemsCatalog) {
        if (forbiddenItemCodes.includes(itemDef.code)) continue;
        if (itemDef.section !== secDef.name) continue;
        const item = generateItemFromDict(itemDef.code, projectParams, {
          similar_project_count: 0,
          scope_inferred: !!understanding.inferred_values.scope,
          drawings_available: false,
          building_type: projectParams.building_type
        });
        if (item) {
          items.push(item);
          existingItemCodes.push(itemDef.code);
        }
      }
      if (items.length > 0) {
        sections.push({
          code: secDef.code,
          name: secDef.name,
          sort_order: secDef.sort_order || sections.length + 1,
          items
        });
      }
    }
  }

  const warnings = [];
  if (understanding.missing_information.length > 0) {
    warnings.push(`معلومات مفقودة: ${understanding.missing_information.join('، ')}`);
  }
  if (!request.scope && understanding.inferred_values.scope) {
    warnings.push(`تم استنتاج نطاق العمل: ${understanding.inferred_values.scope.value} (يرجى التأكيد)`);
  }
  if (!request.city) {
    warnings.push('لم يتم تحديد المدينة، قد تختلف الأسعار حسب المنطقة');
  }
  if (projectParams.scope === 'إنشاء كامل') {
    warnings.push('هذا المشروع يتطلب مخططات إنشائية للكميات الدقيقة');
  }

  const totalItems = existingItemCodes.length;
  const totalSections = sections.length;
  const lowConfItems = sections.reduce((sum, s) => sum + s.items.filter(i => i.confidence < 0.55).length, 0);
  const essentialItems = sections.reduce((sum, s) => sum + s.items.filter(i => i.classification === 'أساسي' || i.classification === 'ضروري').length, 0);

  const hasInferredScope = !request.scope && !!understanding.inferred_values.scope;

  return {
    status: 'ready',
    request_summary: request.title || '',
    inference_mode: inferenceMode,
    project: {
      project_type: projectParams.project_type,
      building_type: canonicalRequest.building_type || projectSchema.canonicalBuildingType(projectParams.building_type) || projectParams.building_type,
      city: projectParams.city,
      area: projectParams.area,
      floor_count: projectParams.floor_count,
      room_count: projectParams.room_count,
      bathroom_count: projectParams.bathroom_count,
      kitchen_count: projectParams.kitchen_count,
      finish_level: projectParams.finish_level,
      scope: canonicalRequest.scope || projectParams.scope
    },
    understanding: {
      explicit_values: understanding.explicit_values,
      inferred_values: understanding.inferred_values,
      missing_information: understanding.missing_information,
      space_states: understanding.space_states,
      questions: understanding.questions
    },
    data_completeness: computeDataCompleteness(request),
    assumptions: [
      `مساحة المشروع: ${projectParams.area} م²`,
      `${projectParams.room_count} غرف، ${projectParams.bathroom_count} حمامات`,
      projectParams.floor_count > 1 ? `${projectParams.floor_count} أدوار` : 'دور واحد',
      `نوع المبنى: ${projectParams.building_type}`,
      `نطاق العمل: ${projectParams.scope}`,
      `مستوى التشطيب: ${projectParams.finish_level}`
    ],
    missing_information: understanding.missing_information,
    sections,
    warnings: [...new Set(warnings)],
    review_required: lowConfItems > 0 || understanding.missing_information.length > 0,
    scope_confirmed: !!request.scope,
    has_inferred_values: Object.keys(understanding.inferred_values).length > 0,
    inference_mode: inferenceMode,
    model: inferenceMode === 'trained_model' ? {
      version: modelMetadata ? modelMetadata.model_version : null,
      trained_at: modelMetadata ? modelMetadata.trained_at : null,
      data_version: trainedModel ? trainedModel.feature_schema_version : null,
      algorithm: trainedModel ? trainedModel.algorithm : null
    } : null,
    suggestions_summary: `تم إنشاء ${totalSections} أقسام بإجمالي ${totalItems} بند، منها ${essentialItems} بند أساسي`
  };
}

function generateBoq(request, executionMode) {
  request = projectSchema.normalizeProjectRequest(request);
  const mode = executionMode || request.execution_mode || 'no_additions';
  const understanding = understandProject(request);

  if (understanding.status === 'awaiting_scope_confirmation' && !request.scope) {
    return {
      document_type: 'quantity_sheet',
      status: 'awaiting_scope_confirmation',
      understood_project: {
        explicit_values: understanding.explicit_values,
        inferred_values: understanding.inferred_values,
        missing_information: understanding.missing_information
      },
      question: 'ما نطاق المشروع المطلوب؟',
      options: getScopeConfirmationOptions()
    };
  }

  const estimate = generateEstimate(request);
  if (estimate.status !== 'ready') return estimate;

  let sections = estimate.sections || [];
  const existingItemCodes = [];
  for (const s of sections) {
    for (const item of s.items || []) {
      existingItemCodes.push(item.code);
    }
  }

  // Apply item relationships
  const related = getRelatedItems(existingItemCodes, mode);
  if (mode === 'show_before_add' || mode === 'auto_add') {
    const addedItems = [];
    const addedCodes = new Set();
    let relatedList = [];
    if (Array.isArray(related)) {
      relatedList = related;
    } else if (related && typeof related === 'object') {
      relatedList = [...(related.essential || []), ...(related.recommended || []), ...(related.optional || [])];
    }
    const forbiddenItems = getForbiddenItemsForScope(estimate.project.scope || '');
    relatedList.forEach(r => {
      if (addedCodes.has(r.item)) return;
      if (forbiddenItems.includes(r.item)) return;
      const dict = itemDictionary[r.item];
      if (!dict) return;
      const item = generateItemFromDict(r.item, {
        area: estimate.project.area || 150,
        room_count: estimate.project.room_count || 3,
        bathroom_count: estimate.project.bathroom_count || 2,
        kitchen_count: estimate.project.kitchen_count || 1,
        floor_count: estimate.project.floor_count || 1,
        finish_level: estimate.project.finish_level || 'جيد',
        building_type: estimate.project.building_type || '',
        project_type: estimate.project.project_type || '',
        scope: estimate.project.scope || ''
      }, {
        scope_inferred: estimate.has_inferred_values,
        drawings_available: false,
        similar_project_count: 0
      });
      if (item) {
        item.classification = 'مرتبط';
        item.needs_confirmation = mode === 'show_before_add';
        item.assumptions = [r.reason || 'مشتق من علاقات العناصر'];
        item.ai_suggested = mode === 'show_before_add';
        addedItems.push(item);
        addedCodes.add(r.item);
      }
    });

    if (addedItems.length > 0) {
      sections.push({
        code: 'SEC-REL',
        name: 'عناصر مقترحة مرتبطة',
        sort_order: sections.length + 1,
        items: addedItems
      });
    }
  }

  const totalItems = existingItemCodes.length;
  const lowConfItems = sections.reduce((sum, s) => sum + s.items.filter(i => i.confidence < 0.55).length, 0);
  const warnings = estimate.warnings || [];

  // Validate the result
  const validationIssues = quantityValidator.validateAllItems(sections, estimate.project || {});
  const criticalErrors = quantityValidator.hasCriticalErrors(validationIssues);
  for (const issue of validationIssues) {
    warnings.push(issue.message);
  }

  if (totalItems === 0) {
    return {
      document_type: 'quantity_sheet',
      status: 'error',
      error: 'فشل التوقع: لم يتم إنشاء أي بند لجدول الكميات'
    };
  }

  let pipeline = runBoqPipeline(sections, estimate.project, request);
  sections = pipeline.sections;
  
  // Use new candidate generator for better item coverage
  const candidateResult = candidateGenerator.generateAndClassifyItems(estimate.project, request);
  
  // Merge candidate results with existing sections
  if (candidateResult.classified && candidateResult.classified.length > 0) {
    const existingCodes = new Set(sections.flatMap(section => (section.items || []).map(item => item.code)));
    const candidateItems = [];
    
    // Candidates are visible for review, then pass through the same quantity and approval gate.
    for (const candidate of candidateResult.classified) {
      if (!existingCodes.has(candidate.item_code)) {
        const dict = itemDictionary[candidate.item_code];
        if (dict) {
          const item = generateItemFromDict(candidate.item_code, {
            area: estimate.project.area ?? null,
            room_count: estimate.project.room_count ?? null,
            bathroom_count: estimate.project.bathroom_count ?? null,
            kitchen_count: estimate.project.kitchen_count ?? null,
            floor_count: estimate.project.floor_count ?? null,
            finish_level: estimate.project.finish_level || 'جيد',
            building_type: estimate.project.building_type || '',
            project_type: estimate.project.project_type || '',
            scope: estimate.project.scope || ''
          }, {
            scope_inferred: estimate.has_inferred_values,
            drawings_available: false,
            similar_project_count: 0
          });
          
          if (item) {
            item.classification = candidate.classification;
            item.requires_confirmation = candidate.requires_confirmation;
            item.section_status = candidate.section_status;
            item.section_reason = candidate.section_reason;
            item.source = candidate.source || 'candidate_generator';
            candidateItems.push(item);
          }
        }
      }
    }
    if (candidateItems.length) {
      sections.push({ code: 'SEC-CAND', name: 'بنود مقترحة للمراجعة', sort_order: sections.length + 1, items: candidateItems });
      pipeline = runBoqPipeline(sections, estimate.project, request);
      sections = pipeline.sections;
    }
  }
  
  const inferredCondition = request.project_condition || (request.scope === 'full_construction' ? 'new_construction' : request.scope === 'renovation' ? 'renovation' : 'existing_building_fitout');
  const specializedPrediction = specializedItemPredictor.predict(request, { ...estimate.project, project_condition: inferredCondition, ownership_scope: request.ownership_scope || (estimate.project.building_type === 'apartment' ? 'single_unit_only' : '') });
  const spaceStates = estimate.understanding?.space_states || spaceStatePredictor.inferSpaceStates(request);
  const spaceSafety = spaceStatePredictor.applyToPredictions(specializedPrediction?.items || [], spaceStates);
  if (specializedPrediction) {
    specializedPrediction.items = spaceSafety.items;
    specializedPrediction.questions = [...(specializedPrediction.questions || []), ...spaceSafety.questions];
  }
  
  // REMOVED: Strict filtering that only kept 'core' items
  // Now we keep all classifications: required, recommended, conditional, optional, etc.
  // pipeline.approvedBoq = pipeline.approvedBoq.filter(item => predictedByCode.get(item.code)?.classification === 'core');
  const result = {
    document_type: 'quantity_sheet',
    status: criticalErrors ? 'validation_errors' : 'ready',
    request_summary: request.title || '',
    execution_mode: mode,
    inference_mode: inferenceMode,
    project: estimate.project,
    understanding: estimate.understanding,
    data_completeness: estimate.data_completeness,
    assumptions: estimate.assumptions || [],
    missing_information: estimate.missing_information || [],
    sections,
    approvedBoq: pipeline.approvedBoq,
    // The review list is intentionally independent of quantity readiness.
    reviewableItems: pipeline.reviewableItems,
    quantityResults: pipeline.quantityResults,
    itemPredictionSnapshot: pipeline.itemPredictionSnapshot,
    deletedItemAudit: pipeline.deletedItemAudit,
    sectionCoverage: pipeline.sectionCoverage,
    itemPreservationGate: pipeline.itemPreservationGate,
    item_predictions: specializedPrediction ? specializedPrediction.items : [],
    item_prediction_model: specializedPrediction ? specializedPrediction.model_version : null,
    space_state_model: spaceStatePredictor.load()?.model_version || null,
    space_states: spaceStates,
    confirmation_questions: spaceSafety.questions,
    pipeline_trace: pipeline.pipeline_trace,
    exclusive_conflicts: pipeline.exclusiveConflicts,
    missing_required_inputs: pipeline.missingInputs,
    requires_specialist_review: pipeline.requires_specialist_review,
    warnings: [...new Set(warnings)],
    validation_issues: validationIssues,
    review_required: lowConfItems > 0 || criticalErrors || (estimate.missing_information && estimate.missing_information.length > 0),
    scope_confirmed: !!request.scope,
    has_inferred_values: estimate.has_inferred_values,
    model: estimate.model,
    suggestions_summary: `تم إنشاء ${sections.length} أقسام بإجمالي ${totalItems} بند`
  };

  result.item_count = totalItems;
  return result;
}

function generateQuotation(boqResult, prices) {
  if (!boqResult || !boqResult.sections || boqResult.sections.length === 0) {
    return {
      document_type: 'quotation',
      status: 'error',
      error: 'تعذر إنشاء عرض السعر: بيانات جدول الكميات غير موجودة',
      sections: [],
      subtotal: 0,
      tax: 0,
      grand_total: 0,
      unpriced_items: [],
      review_required: true
    };
  }

  const project = boqResult.project || {};
  const sections = [];
  let subtotal = 0;
  const unpricedItems = [];

  for (const section of boqResult.sections) {
    const items = [];
    let sectionTotal = 0;

    for (const item of section.items || []) {
      if (!item.code) continue;
      const dict = itemDictionary[item.code];
      let unitPrice = null;
      let priceStatus = 'missing';

      if (prices && prices[item.code] && typeof prices[item.code] === 'number') {
        unitPrice = prices[item.code];
        priceStatus = 'available';
      } else if (dict && dict.unit_price_riyal !== undefined && dict.unit_price_riyal !== null) {
        unitPrice = dict.unit_price_riyal;
        priceStatus = 'available';
      }

      const quantity = item.quantity || 0;
      const total = unitPrice !== null ? Math.round(quantity * unitPrice * 100) / 100 : null;

      if (priceStatus === 'missing') {
        unpricedItems.push({ code: item.code, name_ar: item.name_ar, unit: item.unit, quantity });
      }
      if (total !== null) sectionTotal += total;

      items.push({
        code: item.code,
        name_ar: item.name_ar || '',
        unit: item.unit || '',
        quantity,
        confidence: item.confidence,
        confidence_level: item.confidence_level,
        source: item.source,
        classification: item.classification,
        price_status: priceStatus,
        unit_price: unitPrice,
        total
      });
    }

    sections.push({
      code: section.code,
      name: section.name || '',
      sort_order: section.sort_order || sections.length + 1,
      items,
      section_total: Math.round(sectionTotal * 100) / 100
    });
    subtotal += sectionTotal;
  }

  const taxRate = 0.15;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const grandTotal = Math.round((subtotal + tax) * 100) / 100;

  return {
    document_type: 'quotation',
    status: unpricedItems.length > 0 ? 'incomplete' : 'draft',
    project,
    sections,
    subtotal: Math.round(subtotal * 100) / 100,
    tax,
    grand_total: grandTotal,
    tax_rate: taxRate,
    unpriced_items: unpricedItems,
    review_required: unpricedItems.length > 0,
    warnings: unpricedItems.length > 0
      ? [`عرض السعر غير مكتمل لوجود ${unpricedItems.length} بند غير مسعر`]
      : []
  };
}

function getSuggestions(projectId, mode) {
  const actualMode = mode || 'show_before_add';
  return { suggestions: [], mode: actualMode, count: 0 };
}

function applySuggestions(projectId, suggestionIds) {
  return { added: [], count: 0 };
}

function getMissingEssentialItems(existingItems, projectType) {
  const existingCodes = new Set((existingItems || []).map(i => i.code || i));
  const missing = [];

  const allItems = loadJSON(path.join(CATALOGS_DIR, 'items.json')) || [];
  for (const item of allItems) {
    if ((item.classification_default === 'أساسي' || item.classification_default === 'ضروري') && !existingCodes.has(item.code)) {
      if (!missing.includes(item.code)) missing.push(item.code);
    }
  }

  return { missing };
}

function estimateQuantity(itemCode, projectParams) {
  const params = {
    area: projectParams?.area || 150,
    room_count: projectParams?.rooms || projectParams?.room_count || 3,
    bathroom_count: projectParams?.bathrooms || projectParams?.bathroom_count || 2,
    kitchen_count: projectParams?.kitchen_count || 1,
    floor_count: projectParams?.floors || projectParams?.floor_count || 1,
    living_room_count: projectParams?.living_room_count || 1,
    finish_level: projectParams?.finish_level || 'جيد',
    city: projectParams?.city || '',
    building_type: projectParams?.building_type || '',
    project_type: projectParams?.project_type || '',
    scope: projectParams?.scope || ''
  };

  const dict = itemDictionary[itemCode];
  if (!dict) return null;

  const item = generateItemFromDict(itemCode, params, {
    similar_project_count: 0,
    drawings_available: false,
    building_type: params.building_type
  });
  if (!item) return null;

  return {
    quantity: item.quantity,
    raw_quantity: item.raw_quantity,
    min: item.quantity_min,
    max: item.quantity_max,
    confidence: item.confidence,
    confidence_level: item.confidence_level,
    source: item.source,
    source_details: item.source_details,
    method: item.calculation_method,
    quantity_driver: item.quantity_driver
  };
}

function compareEstimate(estimated, userValue) {
  if (!estimated || userValue === undefined || userValue === null) {
    return { deviation: 0, flag: 'insufficient_data' };
  }
  const est = estimated.quantity || estimated;
  if (est === 0) return { deviation: 0, flag: 'no_estimate' };

  const deviation = ((userValue - est) / est) * 100;
  const absDev = Math.abs(deviation);

  let flag = 'normal';
  if (absDev > 50) flag = 'critical';
  else if (absDev > 25) flag = 'significant';
  else if (absDev > 10) flag = 'minor';

  return { deviation: Math.round(deviation * 100) / 100, flag };
}

function getRelatedItems(itemCodes, mode) {
  const related = { essential: [], optional: [], recommended: [] };
  const existingSet = new Set(itemCodes);

  for (const group of itemRelationships.relationship_groups || []) {
    const hasTrigger = group.trigger_items.some(t => existingSet.has(t));
    if (!hasTrigger) continue;

    for (const rel of group.essential_related || []) {
      if (!existingSet.has(rel.item)) {
        const dict = itemDictionary[rel.item];
        if (dict) related.essential.push({ item: rel.item, reason: rel.reason, priority: rel.priority, dict });
      }
    }
    for (const rel of group.optional_related || []) {
      if (!existingSet.has(rel.item)) {
        const dict = itemDictionary[rel.item];
        if (dict) related.optional.push({ item: rel.item, reason: rel.reason, dict });
      }
    }
    for (const rel of group.recommended || []) {
      if (!existingSet.has(rel.item)) {
        const dict = itemDictionary[rel.item];
        if (dict) related.recommended.push({ item: rel.item, reason: rel.reason, classification: rel.classification, dict });
      }
    }
  }

  related.essential.sort((a, b) => a.priority - b.priority);

  if (mode === 'auto_add') {
    return [...related.essential, ...related.recommended];
  }
  if (mode === 'show_before_add') {
    return related;
  }
  return [];
}

function getSimilarProjects(request, k) {
  const requestFeatures = {
    project_type: request.project_type || request.type || '',
    building_type: request.building_type || '',
    scope: request.scope || '',
    area: request.area || 0,
    rooms: request.rooms || request.room_count || 0,
    bathrooms: request.bathrooms || request.bathroom_count || 0
  };
  const results = similarityEngine.findSimilarProjects(requestFeatures, trainingData, k || 5);
  return results.map(r => ({
    project_id: r.project.id || r.project.project_id || r.project.project?.id || '',
    similarity_score: Math.round(r.similarityScore * 100) / 100,
    similarity_reasons: (r.reasons || []).map(rs => ({
      aspect: rs.aspect,
      match: typeof rs.match === 'string' ? rs.match : (rs.match ? 'متطابق' : 'غير متطابق'),
      score: rs.score
    }))
  }));
}

module.exports = {
  understandProject,
  analyzeRequest,
  generateEstimate,
  generateBoq,
  generateQuotation,
  getSuggestions,
  applySuggestions,
  getMissingEssentialItems,
  estimateQuantity,
  compareEstimate,
  getScopeConfirmationOptions
};
