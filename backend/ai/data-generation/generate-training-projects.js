const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CATALOGS_DIR = path.join(DATA_DIR, 'catalogs');
const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const TRAINING_DIR = path.join(DATA_DIR, 'training');
const EVAL_DIR = path.join(DATA_DIR, 'evaluation');
const META_DIR = path.join(DATA_DIR, 'metadata');

// Load catalogs
const sections = JSON.parse(fs.readFileSync(path.join(CATALOGS_DIR, 'sections.json'), 'utf-8'));
const items = JSON.parse(fs.readFileSync(path.join(CATALOGS_DIR, 'items.json'), 'utf-8'));
const buildingTypes = JSON.parse(fs.readFileSync(path.join(CATALOGS_DIR, 'building-types.json'), 'utf-8'));
const finishingLevels = JSON.parse(fs.readFileSync(path.join(CATALOGS_DIR, 'finishing-levels.json'), 'utf-8'));
const quantityDrivers = JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, 'quantity-drivers.json'), 'utf-8'));
const spacePrograms = JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, 'space-programs.json'), 'utf-8'));
const archetypes = JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, 'project-archetypes.json'), 'utf-8'));
const scopeRules = JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, 'scope-rules.json'), 'utf-8'));
const negativeRules = JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, 'negative-rules.json'), 'utf-8'));

// Build lookup maps
const itemMap = {};
for (const item of items) itemMap[item.code] = item;

const sectionMap = {};
for (const s of sections) sectionMap[s.code] = s;

const btMap = {};
for (const bt of buildingTypes) btMap[bt.code] = bt;

const driverMap = {};
for (const d of quantityDrivers) driverMap[d.code] = d;

// Scope ↔ archetype lookup
const archetypeByScope = {};
for (const a of archetypes) {
  if (a.scope) archetypeByScope[a.scope] = a;
}

// Scope rule lookup
const scopeRuleByScope = {};
for (const sr of scopeRules) scopeRuleByScope[sr.scope] = sr;

// ---- Configuration Templates ----
const CITY_LIST = ['الرياض', 'جدة', 'مكة', 'المدينة', 'الدمام', 'الخبر', 'تبوك', 'أبها', 'بريدة', 'حائل', 'نجران', 'جازان', 'الطائف', 'ينبع', 'سكاكا', 'عرعر'];
const SCOPES = ['تشطيب كامل', 'إنشاء جديد', 'كهرباء فقط', 'سباكة فقط', 'دهانات فقط', 'ترميم شامل', 'تشطيب جزئي', 'أرضيات فقط', 'توسعة'];
const CONDITIONS = ['new', 'existing', 'renovation'];
const FINISH_LEVELS = ['اقتصادي', 'متوسط', 'جيد', 'جيد جداً', 'فاخر'];

// Building types grouped
const residentialTypes = buildingTypes.filter(bt => bt.category === 'سكني');
const commercialTypes = buildingTypes.filter(bt => bt.category === 'تجاري');
const industrialTypes = buildingTypes.filter(bt => bt.project_type === 'IND');

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max, dec) { const v = Math.random() * (max - min) + min; return dec ? Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec) : v; }
function seededRand(seed) { const s = seed % 2147483647; return ((s * 16807) % 2147483647) / 2147483647; }

// Generate project config
function generateProjectConfig(index) {
  const r = () => Math.random();
  const isResidential = r() < 0.55;
  const isCommercial = !isResidential && r() < 0.65;

  let bt;
  if (isResidential) bt = pick(residentialTypes);
  else if (isCommercial) bt = pick(commercialTypes);
  else bt = pick([...commercialTypes, ...industrialTypes]);

  const isNewConstruction = bt.name === 'فيلا' || bt.name === 'عمارة' || bt.name.match(/^(منزل|فيلا|عمارة|مجمع)/);
  const isApartment = bt.name.match(/^(شقة|استوديو|دوبلكس|بنتهاوس)/);

  // Scope logic
  let scope;
  if (bt.name.match(/^(محل|معرض|مكتب|عيادة|صيدلية|مطعم|مقهى|صالون)/)) {
    scope = pick(['تشطيب كامل', 'كهرباء فقط', 'دهانات فقط']);
  } else if (bt.name.match(/^(فيلا|منزل)/)) {
    scope = pick(['تشطيب كامل', 'إنشاء جديد', 'كهرباء فقط', 'سباكة فقط']);
  } else if (bt.name.match(/^(شقة|استوديو|دوبلكس|بنتهاوس)/)) {
    scope = pick(['تشطيب كامل', 'كهرباء فقط', 'سباكة فقط', 'دهانات فقط', 'ترميم شامل']);
  } else {
    scope = pick(['تشطيب كامل', 'إنشاء جديد', 'كهرباء فقط', 'ترميم شامل']);
  }

  const scopeRule = scopeRuleByScope[scope];
  const archetype = archetypeByScope[scope];

  const finishLevel = pick(FINISH_LEVELS);
  const condition = scope === 'ترميم شامل' || scope === 'توسعة' ? 'renovation' : (scope === 'إنشاء جديد' ? 'new' : pick(['existing', 'new']));
  const city = pick(CITY_LIST);

  // Generate rooms/spaces based on building type
  let roomCount = 0, bathroomCount = 0, kitchenCount = 1, floorCount = 1, livingRoomCount = 0;
  let area = 0;

  if (bt.name.match(/^استوديو/)) {
    roomCount = 0; bathroomCount = 1; area = randInt(25, 50);
  } else if (bt.name.match(/^شقة غرفة واحدة/)) {
    roomCount = 1; bathroomCount = 1; area = randInt(50, 80);
  } else if (bt.name.match(/^شقة غرفتين/)) {
    roomCount = 2; bathroomCount = randInt(1, 2); area = randInt(80, 120);
  } else if (bt.name.match(/^شقة ثلاث غرف/)) {
    roomCount = 3; bathroomCount = randInt(2, 3); area = randInt(120, 200);
  } else if (bt.name.match(/^شقة أربع غرف/)) {
    roomCount = 4; bathroomCount = randInt(2, 3); area = randInt(150, 250);
  } else if (bt.name.match(/^شقة خمس غرف/)) {
    roomCount = 5; bathroomCount = randInt(3, 4); area = randInt(200, 350);
  } else if (bt.name.match(/^(دوبلكس|بنتهاوس)/)) {
    roomCount = randInt(3, 6); bathroomCount = randInt(2, 4); floorCount = 2; area = randInt(150, 400);
  } else if (bt.name.match(/^منزل/)) {
    roomCount = randInt(2, 5); bathroomCount = randInt(2, 4); floorCount = randInt(1, 2); area = randInt(150, 400);
  } else if (bt.name.match(/^فيلا دور واحد/)) {
    roomCount = randInt(3, 5); bathroomCount = randInt(3, 5); floorCount = 1; area = randInt(250, 500);
  } else if (bt.name.match(/^فيلا دورين/)) {
    roomCount = randInt(4, 7); bathroomCount = randInt(4, 6); floorCount = 2; area = randInt(350, 600);
  } else if (bt.name.match(/^فيلا ثلاثة أدوار/)) {
    roomCount = randInt(5, 8); bathroomCount = randInt(5, 7); floorCount = 3; area = randInt(450, 800);
  } else if (bt.name.match(/^(محل|معرض)/)) {
    roomCount = 0; bathroomCount = randInt(1, 2); kitchenCount = 0; area = randInt(30, 300);
  } else if (bt.name.match(/^(مكتب|مبنى إداري)/)) {
    roomCount = randInt(2, 8); bathroomCount = randInt(1, 4); kitchenCount = 0; floorCount = randInt(1, 4); area = randInt(100, 1000);
  } else if (bt.name.match(/^(عيادة|مركز طبي)/)) {
    roomCount = randInt(2, 6); bathroomCount = randInt(1, 3); kitchenCount = 0; area = randInt(100, 500);
  } else if (bt.name.match(/^(مطعم|مقهى|مطبخ تجاري)/)) {
    roomCount = 0; bathroomCount = randInt(1, 3); kitchenCount = 1; area = randInt(50, 400);
  } else if (bt.name.match(/^(فندق|شقق فندقية)/)) {
    roomCount = randInt(10, 50); bathroomCount = randInt(10, 50); floorCount = randInt(3, 10); area = randInt(500, 5000);
  } else if (bt.name.match(/^(مستودع|ورشة)/)) {
    roomCount = randInt(0, 3); bathroomCount = randInt(1, 2); kitchenCount = 0; area = randInt(100, 2000);
  } else if (bt.name.match(/^(مدرسة|حضانة|مركز تدريب)/)) {
    roomCount = randInt(4, 20); bathroomCount = randInt(4, 10); kitchenCount = 0; floorCount = randInt(1, 3); area = randInt(200, 3000);
  } else if (bt.name.match(/^قاعة مناسبات/)) {
    roomCount = 0; bathroomCount = randInt(2, 6); kitchenCount = 1; area = randInt(200, 800);
  } else if (bt.name.match(/^(عمارة|مجمع)/)) {
    roomCount = randInt(8, 30); bathroomCount = randInt(8, 30); floorCount = randInt(2, 6); area = randInt(500, 3000);
  } else if (bt.name.match(/^استراحة/)) {
    roomCount = randInt(2, 4); bathroomCount = randInt(2, 3); area = randInt(100, 300);
  } else if (bt.name.match(/^سكن عمال/)) {
    roomCount = randInt(4, 12); bathroomCount = randInt(2, 6); floorCount = randInt(1, 3); area = randInt(200, 800);
  } else {
    roomCount = randInt(2, 5); bathroomCount = randInt(1, 3); area = randInt(100, 400);
  }

  livingRoomCount = Math.max(1, Math.floor(roomCount / 2));

  return {
    bt, scope, finishLevel, condition, city,
    roomCount, bathroomCount, kitchenCount, floorCount, livingRoomCount, area,
    scopeRule, archetype, isNewConstruction, isApartment
  };
}

// Generate sections for a config
function generateSections(config) {
  const { scope, scopeRule, bt, finishLevel } = config;
  const includedSections = [];
  const excludedSections = [];

  if (scopeRule) {
    if (scopeRule.included_sections) includedSections.push(...scopeRule.included_sections);
    if (scopeRule.excluded_sections) excludedSections.push(...scopeRule.excluded_sections);
  }

  // Additional logic
  if (bt && bt.name.match(/^(شقة|استوديو|دوبلكس|بنتهاوس)/) && !scope.match(/^(إنشاء جديد|توسعة)/)) {
    if (!excludedSections.includes('SEC-EXC')) excludedSections.push('SEC-EXC');
    if (!excludedSections.includes('SEC-CON')) excludedSections.push('SEC-CON');
    if (!excludedSections.includes('SEC-PRE')) excludedSections.push('SEC-PRE');
  }

  if (scope === 'تشطيب كامل' || scope === 'دهانات فقط' || scope === 'أرضيات فقط') {
    if (!excludedSections.includes('SEC-EXC')) excludedSections.push('SEC-EXC');
    if (!excludedSections.includes('SEC-CON')) excludedSections.push('SEC-CON');
    if (!excludedSections.includes('SEC-PRE')) excludedSections.push('SEC-PRE');
    if (!excludedSections.includes('SEC-DEM')) excludedSections.push('SEC-DEM');
  }

  if (finishLevel === 'اقتصادي') {
    // Still include luxury items but mark as optional
  }

  // Default sections if none specified
  if (includedSections.length === 0) {
    includedSections.push('SEC-FLR', 'SEC-PNT', 'SEC-WOD', 'SEC-ELC', 'SEC-PLM', 'SEC-HVAC', 'SEC-OPR');
  }

  return { included: includedSections, excluded: excludedSections };
}

// Item quantity estimation
function estimateQuantity(itemCode, config) {
  const item = itemMap[itemCode];
  if (!item) return { quantity: 0, min: 0, max: 0, confidence: 0.3, method: 'غير معروف' };

  const driver = item.quantity_driver || 'project_area';
  let q = 0, method = '', confidence = 0.6;

  switch (driver) {
    case 'usable_area': {
      const ratio = item.calculation_strategy === 'area_ratio' ? 0.7 : 0.85;
      q = config.area * ratio;
      method = `المساحة × ${ratio}`;
      confidence = 0.65 + (config.area > 0 ? 0.1 : 0);
      break;
    }
    case 'wall_area': {
      q = config.area * 2.2;
      method = 'المساحة × 2.2';
      confidence = 0.6;
      break;
    }
    case 'ceiling_area': {
      q = config.area * 0.9;
      method = 'المساحة × 0.9';
      confidence = 0.6;
      break;
    }
    case 'bathroom_count': {
      if (item.calculation_strategy === 'area_per_bathroom') {
        q = config.bathroomCount * 35;
        method = `الحمامات × 35 م²`;
        confidence = 0.75;
      } else if (item.calculation_strategy === 'wall_area_per_bathroom') {
        q = config.bathroomCount * 52;
        method = `الحمامات × 52 م²`;
        confidence = 0.7;
      } else {
        q = config.bathroomCount;
        method = `عدد الحمامات (${config.bathroomCount})`;
        confidence = 0.85;
      }
      break;
    }
    case 'room_count': {
      q = config.roomCount;
      method = 'عدد الغرف';
      confidence = 0.8;
      break;
    }
    case 'bedroom_count': {
      q = config.roomCount;
      method = 'عدد غرف النوم';
      confidence = 0.8;
      break;
    }
    case 'kitchen_count': {
      q = config.kitchenCount;
      method = 'عدد المطابخ';
      confidence = 0.85;
      break;
    }
    case 'floor_count': {
      q = config.floorCount;
      method = 'عدد الأدوار';
      confidence = 0.85;
      break;
    }
    case 'entrance_count': {
      q = Math.max(1, config.floorCount);
      method = 'عدد المداخل';
      confidence = 0.8;
      break;
    }
    case 'door_count_from_spaces': {
      q = config.roomCount + config.bathroomCount + config.kitchenCount + Math.max(0, config.livingRoomCount);
      method = 'الغرف + الحمامات + المطابخ';
      confidence = 0.75;
      break;
    }
    case 'conditioned_space_count': {
      q = config.roomCount + config.livingRoomCount;
      method = 'الغرف + الصالات';
      confidence = 0.7;
      break;
    }
    case 'fixed_per_project': {
      q = item.default_quantity || 1;
      method = 'ثابت لكل مشروع';
      confidence = 0.95;
      break;
    }
    case 'fixed_per_floor': {
      q = config.floorCount;
      method = 'واحدة لكل دور';
      confidence = 0.85;
      break;
    }
    case 'rate_by_space_type': {
      // Simplified: estimate based on room count + living rooms
      const bedrooms = Math.max(config.roomCount, 1);
      const living = Math.max(config.livingRoomCount, 1);
      let rate;
      if (itemCode.includes('ELC-001')) {
        rate = bedrooms * 3 + living * 2 + config.bathroomCount * 1 + config.kitchenCount * 2 + 2;
      } else if (itemCode.includes('ELC-003')) {
        rate = bedrooms * 5 + living * 6 + config.bathroomCount * 2 + config.kitchenCount * 4 + 2;
      } else {
        rate = bedrooms + living + 2;
      }
      q = rate;
      method = 'معدل حسب الفراغات';
      confidence = 0.65;
      break;
    }
    case 'equipment_count': {
      q = config.roomCount + config.kitchenCount + 2;
      method = 'عدد الأجهزة المقدر';
      confidence = 0.6;
      break;
    }
    case 'circuit_count': {
      const totalPoints = (config.roomCount + config.livingRoomCount) * 8 + config.bathroomCount * 2 + config.kitchenCount * 6;
      q = Math.ceil(totalPoints / 4) + Math.ceil((config.roomCount + config.livingRoomCount) / 2);
      method = 'تقدير عدد الدوائر';
      confidence = 0.55;
      break;
    }
    case 'fixture_count': {
      q = config.bathroomCount * 6 + config.kitchenCount * 3 + 1;
      method = 'الحمامات × 6 + المطبخ × 3';
      confidence = 0.6;
      break;
    }
    case 'linked_item': {
      q = 0;
      method = 'مرتبط ببند آخر';
      confidence = 0.5;
      break;
    }
    case 'room_perimeter': {
      const estRooms = config.roomCount + config.livingRoomCount;
      q = Math.sqrt(config.area / Math.max(1, estRooms)) * 4 * estRooms * 0.7;
      method = 'محيط الغرف المقدر';
      confidence = 0.55;
      break;
    }
    case 'project_area': {
      q = config.area;
      method = 'مساحة المشروع';
      confidence = 0.8;
      break;
    }
    case 'manual_confirmation': {
      q = 0;
      method = 'يتطلب تأكيد يدوي';
      confidence = 0.3;
      break;
    }
    case 'engineering_formula': {
      q = 0;
      method = 'يتطلب حساباً هندسياً';
      confidence = 0.2;
      break;
    }
    default: {
      q = config.area * 0.1;
      method = 'تقدير افتراضي';
      confidence = 0.3;
    }
  }

  // Integer rounding for count units
  const unitDef = driverMap[driver];
  if (unitDef && unitDef.integer_required) {
    q = Math.max(1, Math.round(q));
  }
  if (item.quantity_driver === 'linked_item') {
    q = Math.max(1, Math.round(config.area * 0.1));
    method = 'تقدير مرتبط';
    confidence = 0.4;
  }

  // Flooring for specific items
  if (itemCode === 'FLR-004' || itemCode === 'FLR-010') {
    q = Math.round(config.area * 0.7);
    method = '70% من المساحة';
    confidence = 0.7;
  }
  if (itemCode === 'FLR-009') {
    q = config.bathroomCount * 18;
    method = `${config.bathroomCount} حمام × 18 م²`;
    confidence = 0.75;
  }
  if (itemCode === 'FLR-013') {
    q = config.bathroomCount * 52;
    method = `${config.bathroomCount} حمام × 52 م² جدران`;
    confidence = 0.7;
  }
  if (itemCode === 'FLR-008') {
    const totalRooms = config.roomCount + config.bathroomCount + config.kitchenCount + config.livingRoomCount;
    q = Math.round(Math.sqrt(config.area / Math.max(1, totalRooms)) * 4 * totalRooms * 0.7);
    method = 'محيط الغرف';
    confidence = 0.6;
  }
  if (itemCode === 'FLR-001') {
    q = Math.round(config.area * 0.7);
    method = 'تجهيز 70% من المساحة';
    confidence = 0.7;
  }
  if (itemCode === 'FLR-ADH') {
    q = Math.round(config.area * 0.7 * 4);
    method = 'مساحة البلاط × 4 كجم';
    confidence = 0.6;
  }
  if (itemCode === 'FLR-GRT') {
    q = Math.round(config.area * 0.7 * 2);
    method = 'مساحة البلاط × 2 كجم';
    confidence = 0.6;
  }
  if (itemCode === 'PNT-005' || itemCode === 'PNT-003') {
    q = Math.round(config.area * 2.2);
    method = 'المساحة × 2.2';
    confidence = 0.65;
  }
  if (itemCode === 'PNT-006') {
    q = Math.round(config.area * 0.9);
    method = 'المساحة × 0.9';
    confidence = 0.65;
  }
  if (itemCode === 'PNT-001') {
    q = Math.round(Math.sqrt(config.area) * config.roomCount * 2);
    method = 'تقدير طول الشقوق';
    confidence = 0.4;
  }
  if (itemCode === 'HVAC-001') {
    q = Math.max(1, config.roomCount + config.livingRoomCount);
    method = 'الغرف + الصالات';
    confidence = 0.7;
  }
  if (itemCode === 'HVAC-005') {
    q = (config.roomCount + config.livingRoomCount) * 5;
    method = 'المكيفات × 5 م';
    confidence = 0.6;
  }
  if (itemCode === 'WOD-001') {
    q = config.roomCount + config.bathroomCount + config.kitchenCount + config.livingRoomCount;
    method = 'مجموع الفراغات';
    confidence = 0.75;
  }
  if (itemCode === 'WOD-002') {
    q = 1;
    method = 'باب رئيسي واحد';
    confidence = 0.95;
  }
  if (itemCode === 'WOD-005') {
    q = config.roomCount * 3;
    method = 'الغرف × 3 م';
    confidence = 0.6;
  }
  if (itemCode === 'PLM-011' || itemCode === 'PLM-012' || itemCode === 'PLM-015' || itemCode === 'PLM-BASIN') {
    q = config.bathroomCount;
    method = `واحد لكل حمام (${config.bathroomCount})`;
    confidence = 0.9;
  }
  if (itemCode === 'PLM-KITCHEN-SINK') {
    q = config.kitchenCount;
    method = `واحد لكل مطبخ (${config.kitchenCount})`;
    confidence = 0.9;
  }
  if (itemCode === 'ELC-007') {
    q = Math.max(1, config.floorCount);
    method = 'لوحة لكل دور';
    confidence = 0.85;
  }
  if (itemCode === 'ELC-EARTH') {
    q = 1;
    method = 'نظام تأريض واحد';
    confidence = 0.9;
  }
  if (itemCode === 'CON-001') {
    q = Math.round(config.area * 0.35);
    method = 'مساحة × 0.35 م³';
    confidence = 0.55;
  }
  if (itemCode === 'CON-003') {
    q = Math.round(config.area * 40);
    method = 'مساحة × 40 كجم';
    confidence = 0.55;
  }
  if (itemCode === 'BLK-001') {
    q = Math.round(config.area * 25);
    method = 'مساحة × 25';
    confidence = 0.55;
  }
  if (itemCode === 'PLA-001') {
    q = Math.round(config.area * 2);
    method = 'مساحة × 2';
    confidence = 0.55;
  }
  if (itemCode.indexOf('OPR-') === 0) {
    q = item.default_quantity || 1;
    method = 'اختبار واحد';
    confidence = 0.9;
  }
  if (itemCode === 'EXC-001') {
    q = Math.round(config.area * 0.2);
    method = 'مساحة × 0.2 م³';
    confidence = 0.55;
  }

  const margin = Math.max(1, Math.round(q * 0.15));
  const min = Math.max(0, q - margin);
  const max = q + margin;

  return {
    quantity: Math.max(1, Math.round(q * 100) / 100),
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    confidence: Math.min(0.95, Math.max(0.2, Math.round(confidence * 100) / 100)),
    method
  };
}

// Generate a single project example
function generateProjectExample(config, index) {
  const { bt, scope, finishLevel, condition, city, roomCount, bathroomCount, kitchenCount, floorCount, livingRoomCount, area } = config;

  const sections = generateSections(config);
  const projectSections = [];

  // Pick items from catalog for each included section
  for (const secCode of sections.included) {
    const secObj = sectionMap[secCode];
    if (!secObj) continue;
    const secItems = items.filter(i => {
      const dictSection = i.section || '';
      // Map item categories to sections
      const sectionToCategory = {
        'SEC-FLR': ['أعمال الأرضيات', 'أرضيات'],
        'SEC-PNT': ['أعمال الدهانات', 'دهانات'],
        'SEC-ELC': ['أعمال الكهرباء', 'كهرباء'],
        'SEC-PLM': ['أعمال السباكة', 'سباكة'],
        'SEC-HVAC': ['التكييف والتهوية', 'تكييف'],
        'SEC-WOD': ['الأبواب والنجارة', 'نجارة', 'أبواب'],
        'SEC-CON': ['الخرسانة والهيكل', 'خرسانة'],
        'SEC-EXC': ['الحفر والردم', 'حفر'],
        'SEC-BLK': ['المباني'],
        'SEC-PLA': ['اللياسة والمعالجة', 'لياسة'],
        'SEC-INS': ['أعمال العزل', 'عزل'],
        'SEC-CLG': ['الأسقف والجبس', 'أسقف'],
        'SEC-ALM': ['الألمنيوم والزجاج', 'ألمنيوم'],
        'SEC-LIG': ['أعمال الإنارة', 'إنارة'],
        'SEC-LVC': ['التيار الخفيف'],
        'SEC-WCL': ['تكسية الجدران'],
        'SEC-FIR': ['الحريق والسلامة', 'حريق'],
        'SEC-EXT': ['الأعمال الخارجية'],
        'SEC-OPR': ['الاختبار والتشغيل', 'تسليم', 'اختبار']
      };
      const cats = sectionToCategory[secCode] || [];
      return cats.some(c => (i.category || '').includes(c) || (i.section || '').includes(c));
    });

    // Generate items for this section
    const generatedItems = [];
    const itemLimit = secCode === 'SEC-OPR' || secCode === 'SEC-FIR' || secCode === 'SEC-EXT' ? 5 : 8;

    // Make sure essential items are included
    const essentialItemCodes = [
      'FLR-004', 'FLR-009', 'FLR-013', 'FLR-001', 'FLR-ADH', 'FLR-GRT',
      'PNT-005', 'PNT-003', 'PNT-004', 'PNT-006',
      'ELC-001', 'ELC-003', 'ELC-007', 'ELC-010',
      'PLM-001', 'PLM-002', 'PLM-011', 'PLM-012', 'PLM-015', 'PLM-BASIN',
      'HVAC-001', 'HVAC-005',
      'WOD-001', 'WOD-002',
      'OPR-001', 'OPR-002', 'OPR-003', 'OPR-004',
      'CON-001', 'CON-003',
      'EXC-001',
      'BLK-001', 'PLA-001',
      'ELC-EARTH',
      'PLM-KITCHEN-SINK'
    ];

    const itemsForSection = secItems.length > 0 ? secItems : items.filter(i => {
      // Fallback: use section code prefix matching
      return i.code && i.code.startsWith(secCode.replace('SEC-', ''));
    });

    const shuffledItems = [...itemsForSection].sort(() => Math.random() - 0.5);
    const selectedItems = [];
    const selectedCodes = new Set();

    // First add essential items in this section
    for (const ec of essentialItemCodes) {
      const found = items.find(i => i.code === ec);
      if (found && !selectedCodes.has(ec)) {
        const eq = estimateQuantity(ec, config);
        if (eq.quantity > 0) {
          // Only include items that fit within the scope
          selectedItems.push({
            code: ec,
            name_ar: found.name_ar,
            unit: found.unit,
            quantity: eq.quantity,
            quantity_min: eq.min,
            quantity_max: eq.max,
            classification: found.classification_default || 'أساسي',
            is_essential: true,
            calculation_method: eq.method,
            confidence: eq.confidence,
            requires_engineer_review: eq.confidence < 0.7
          });
          selectedCodes.add(ec);
        }
      }
    }

    // Then add additional items from catalog
    for (const si of shuffledItems) {
      if (selectedItems.length >= itemLimit) break;
      if (selectedCodes.has(si.code)) continue;
      // Skip items that are too specific
      if (si.requires_engineering_calculation && Math.random() > 0.3) continue;
      
      const eq = estimateQuantity(si.code, config);
      if (eq.quantity <= 0) continue;

      // Don't add luxury items for economic finish
      if (finishLevel === 'اقتصادي' && (si.classification_default === 'تحسيني' || si.classification_default === 'فاخر')) {
        if (Math.random() > 0.2) continue;
      }

      selectedItems.push({
        code: si.code,
        name_ar: si.name_ar,
        unit: si.unit,
        quantity: eq.quantity,
        quantity_min: eq.min,
        quantity_max: eq.max,
        classification: si.classification_default || 'مرتبط',
        is_essential: (si.classification_default === 'أساسي' || si.classification_default === 'ضروري'),
        calculation_method: eq.method,
        confidence: eq.confidence,
        requires_engineer_review: eq.confidence < 0.7
      });
      selectedCodes.add(si.code);
    }

    if (selectedItems.length > 0) {
      // Sort: essential items first, then by code
      selectedItems.sort((a, b) => {
        if (a.is_essential && !b.is_essential) return -1;
        if (!a.is_essential && b.is_essential) return 1;
        return a.code.localeCompare(b.code);
      });

      projectSections.push({
        code: secCode,
        name: secObj.name,
        sort_order: projectSections.length + 1,
        items: selectedItems
      });
    }
  }

  // Sort sections by their natural order
  projectSections.sort((a, b) => sections.included.indexOf(a.code) - sections.included.indexOf(b.code));

  const assumptions = [
    `نوع المبنى: ${bt.name}`,
    `نطاق العمل: ${scope}`,
    `مستوى التشطيب: ${finishLevel}`,
    city ? `الموقع: ${city}` : null,
    area > 0 ? `المساحة التقريبية: ${area} م²` : null,
    roomCount > 0 ? `عدد الغرف: ${roomCount}` : null,
    bathroomCount > 0 ? `عدد الحمامات: ${bathroomCount}` : null,
    floorCount > 1 ? `عدد الأدوار: ${floorCount}` : null
  ].filter(Boolean);

  const missingInfo = [];
  if (!area) missingInfo.push('المساحة');
  if (!roomCount) missingInfo.push('عدد الغرف');
  if (!bathroomCount) missingInfo.push('عدد الحمامات');

  return {
    id: `generated-${String(index).padStart(6, '0')}`,
    type: 'project_example',
    source_type: 'synthetic_seed',
    engineering_reviewed: false,
    approved_for_production: false,
    validation: {
      schema_validated: true,
      logically_validated: false,
      engineering_reviewed: false,
      approved_for_training: false,
      reviewed_by: null,
      reviewed_at: null,
      notes: ['بيانات مبدئية مولدة بالقواعد - تحتاج مراجعة مهندس']
    },
    project: {
      name: `${scope} - ${bt.name} مساحة ${area} م²`,
      project_type: bt.project_type === 'RES' ? 'سكني' : (bt.project_type === 'COM' ? 'تجاري' : (bt.project_type === 'IND' ? 'صناعي' : 'تجاري')),
      building_type: bt.name,
      city,
      area,
      floor_count: floorCount,
      room_count: roomCount,
      bathroom_count: bathroomCount,
      kitchen_count: kitchenCount,
      finish_level: finishLevel,
      scope,
      project_condition: condition
    },
    assumptions,
    missing_information: missingInfo,
    sections: projectSections
  };
}

// Generate understanding examples (NL → structured)
function generateUnderstandingExample(config, index) {
  const { bt, scope, finishLevel, condition, city, roomCount, bathroomCount, kitchenCount, floorCount, area, livingRoomCount } = config;

  // Create natural language variations
  const templates = [
    // Direct
    `${bt.name} ${scope.toLowerCase()} مساحة ${area} م² ${city ? 'في ' + city : ''}${roomCount > 0 ? ` عدد الغرف ${roomCount}` : ''}${bathroomCount > 0 ? ` الحمامات ${bathroomCount}` : ''}`,
    `${scope} ${bt.name.toLowerCase()} ${area} متر ${city || ''}`,
    `أريد ${scope} لـ ${bt.name.toLowerCase()} بمساحة ${area}`,
    // Missing info
    `تشطيب ${bt.name.toLowerCase()} ${roomCount > 0 ? roomCount + ' غرف' : ''}${bathroomCount > 0 ? ' و' + bathroomCount + ' حمامات' : ''}`,
    `${scope == 'كهرباء فقط' ? 'أعمال كهرباء' : scope} ${bt.name.toLowerCase()} مساحتها ${area}`,
    `${bt.name} ${floorCount > 1 ? floorCount + ' أدوار' : 'دور واحد'} ${finishLevel}`,
    // Variations
    `مطلوب ${scope} لـ ${bt.name.toLowerCase()} ${roomCount > 0 ? 'بـ ' + roomCount + ' غرف' : ''}`,
    `${bt.name} ${area} م ${city || ''} ${finishLevel.toLowerCase()} ${scope.toLowerCase()}`,
    // Missing data
    `تشطيب ${bt.name.toLowerCase()}`,
    `${scope} ${bt.name.toLowerCase()}`,
    // With features
    `فيلا ${floorCount > 1 ? floorCount + ' أدوار' : ''} ${bathroomCount > 2 ? bathroomCount + ' حمامات' : ''} ${finishLevel.toLowerCase()} ${scope.toLowerCase()}`,
    `شقة ${roomCount > 0 ? roomCount + ' غرف' : ''} ${bathroomCount > 0 ? bathroomCount + ' حمامات' : ''}`,
    // Dialect variants
    `ابغى ${scope} شقة ${roomCount} غرف ${area} متر`,
    `عايز ${scope} ${bt.name.toLowerCase()} ${area} متر`,
    `بدي ${scope.toLowerCase()} لبيت ${roomCount} غرف`,
    // Short forms
    `${scope} - ${area}م - ${roomCount}غ`,
    `ت${scope == 'تشطيب كامل' ? 'شطيب' : 'رميم'} ${bt.name.toLowerCase()} ${area}م`,
    // With extras
    `تشطيب شقة ٣ غرف وصالة وحمامين ${city || ''}`,
    `دهانات فقط لشقة ١٢٠ متر ${city || ''}`,
    `${bt.name.toLowerCase()} ${roomCount} bedroom ${bathroomCount} bathroom ${finishLevel} ${scope}`,
  ];

  const input = templates[index % templates.length];

  const output = {
    building_type: bt.name,
    project_type: bt.project_type === 'RES' ? 'سكني' : (bt.project_type === 'COM' ? 'تجاري' : 'مكتبي'),
    scope,
    finish_level: finishLevel,
    area,
    city: city || undefined,
    room_count: roomCount > 0 ? roomCount : undefined,
    bathroom_count: bathroomCount > 0 ? bathroomCount : undefined,
    floor_count: floorCount > 1 ? floorCount : undefined,
    kitchen_count: kitchenCount || undefined
  };

  // Identify missing info
  const missing = [];
  if (!area) missing.push('area');
  if (!roomCount) missing.push('room_count');
  if (!bathroomCount) missing.push('bathroom_count');
  if (!city) missing.push('city');
  if (!finishLevel) missing.push('finish_level');
  if (missing.length > 0) output.missing_information = missing;

  return {
    input,
    output,
    source_type: 'synthetic_seed',
    engineering_reviewed: false
  };
}

// Generate item prediction examples
function generateItemPredictionExample(config, index) {
  const { bt, scope, finishLevel, city, roomCount, bathroomCount, kitchenCount, floorCount, area, livingRoomCount } = config;

  const input = {
    building_type: bt.name,
    project_type: bt.project_type,
    scope,
    finish_level: finishLevel,
    area,
    room_count: roomCount,
    bathroom_count: bathroomCount,
    kitchen_count: kitchenCount || 1,
    floor_count: floorCount,
    living_room_count: livingRoomCount,
    city: city || ''
  };

  const sections = generateSections(config);
  const requiredItems = [];

  // Get essential items for the scope
  for (const secCode of sections.included) {
    const secObj = sectionMap[secCode];
    if (!secObj) continue;
    
    const essentialForSection = items.filter(i => {
      const cats = {
        'SEC-FLR': ['أعمال الأرضيات', 'أرضيات'],
        'SEC-PNT': ['أعمال الدهانات', 'دهانات'],
        'SEC-ELC': ['أعمال الكهرباء', 'كهرباء'],
        'SEC-PLM': ['أعمال السباكة', 'سباكة'],
        'SEC-HVAC': ['التكييف والتهوية', 'تكييف'],
        'SEC-WOD': ['الأبواب والنجارة', 'نجارة', 'أبواب'],
        'SEC-CON': ['الخرسانة والهيكل', 'خرسانة'],
        'SEC-EXC': ['الحفر والردم', 'حفر'],
        'SEC-BLK': ['المباني'],
        'SEC-PLA': ['اللياسة والمعالجة', 'لياسة'],
        'SEC-INS': ['أعمال العزل', 'عزل'],
        'SEC-CLG': ['الأسقف والجبس', 'أسقف'],
        'SEC-ALM': ['الألمنيوم والزجاج', 'ألمنيوم'],
        'SEC-LIG': ['أعمال الإنارة', 'إنارة'],
        'SEC-LVC': ['التيار الخفيف'],
        'SEC-OPR': ['الاختبار والتشغيل', 'تسليم', 'اختبار']
      }[secCode] || [];
      return cats.some(c => (i.category || '').includes(c) || (i.section || '').includes(c));
    });

    for (const it of essentialForSection) {
      if (it.classification_default === 'أساسي' || it.classification_default === 'ضروري') {
        if (!requiredItems.includes(it.code)) requiredItems.push(it.code);
      }
    }
  }

  // Ensure some key items are always included
  const alwaysInclude = ['FLR-004', 'PNT-005', 'ELC-001', 'ELC-003', 'PLM-001', 'PLM-011', 'PLM-015', 'WOD-001', 'OPR-001'];
  for (const ac of alwaysInclude) {
    if (items.find(i => i.code === ac) && !requiredItems.includes(ac)) {
      requiredItems.push(ac);
    }
  }

  // Optional items based on finish level
  const optionalItems = [];
  if (finishLevel === 'فاخر' || finishLevel === 'جيد جداً') {
    optionalItems.push('أسقف جبسية', 'دواليب مطبخ', 'كاميرات مراقبة');
    if (finishLevel === 'فاخر') optionalItems.push('رخام فاخر', 'منزل ذكي', 'ثريات كريستال');
  } else if (finishLevel === 'جيد') {
    optionalItems.push('أسقف جبس', 'دواليب مطبخ');
  } else if (finishLevel === 'اقتصادي') {
    optionalItems.push('أسقف جبس جزئية', 'كاميرات مراقبة أساسية');
  }

  // Forbidden sections
  const forbiddenSections = sections.excluded || [];

  const result = {
    input,
    required_sections: sections.included,
    required_items: requiredItems,
    optional_items: optionalItems,
    forbidden_sections: sections.excluded,
    source_type: 'synthetic_seed',
    engineering_reviewed: false
  };

  if (forbiddenSections.length > 0) result.forbidden_sections = forbiddenSections;

  return result;
}

// Generate negative examples
function generateNegativeExample(config, index) {
  const examples = [
    { input: 'تشطيب شقة قائمة', forbidden_sections: ['SEC-EXC', 'SEC-CON'], reason: 'لا توجد أعمال أساسات أو هيكل في شقة قائمة' },
    { input: 'تشطيب اقتصادي', optional_not_required: ['رخام فاخر', 'منزل ذكي', 'ثريات كريستال', 'جبس زخرفي معقد'], reason: 'لا تتناسب مع التشطيب الاقتصادي' },
    { input: 'حمامان ومساحة المشروع تضاعفت', rule: 'لا تضاعف عدد المراحيض والخلاطات إذا لم يتغير عدد الحمامات', reason: 'عدد الأدوات الصحية يعتمد على عدد الحمامات لا المساحة' },
    { input: 'دور واحد', rule: 'لا تضف أكثر من لوحة توزيع رئيسية دون سبب فني', reason: 'لوحة واحدة تكفي للدور الواحد' },
    { input: 'شقة مستقلة', forbidden_items: ['مصعد', 'مسبح'], reason: 'لا تقترح في شقة إلا بطلب صريح' },
    { input: 'كهرباء فقط', forbidden_sections: ['SEC-PLM', 'SEC-FLR', 'SEC-CON'], reason: 'خارج نطاق المستخدم' },
    { input: 'دهانات فقط', forbidden_items: ['أعمال الأرضيات', 'أعمال السباكة'], reason: 'نطاق العمل يقتصر على الدهانات' },
    { input: 'سباكة فقط', forbidden_sections: ['SEC-ELC', 'SEC-FLR', 'SEC-CON'], reason: 'نطاق العمل يقتصر على السباكة' },
    { input: 'ترميم شامل', forbidden_items: ['مسبح جديد', 'مصعد جديد', 'خزان جديد'], reason: 'الترميم لا يشمل إضافات كبيرة دون طلب' },
    { input: 'كمية بند بوحدة عدد', rule: 'الكمية يجب أن تكون عدداً صحيحاً', reason: 'وحدات العد تتطلب أرقاماً صحيحة' },
    { input: 'سعر غير موجود', rule: 'لا تخترع سعراً ولا تحول السعر إلى صفر', reason: 'الأسعار تجلب من قاعدة الأسعار المعتمدة' },
    { input: 'فيلا بمسبح في منطقة سكنية عادية', rule: 'تأكد من توفر المساحة والتصريح قبل اقتراح المسبح', reason: 'المسبح يحتاج مساحة إضافية وتصريح' }
  ];

  const ex = examples[index % examples.length];
  ex.source_type = 'synthetic_seed';
  ex.engineering_reviewed = false;
  return ex;
}

// Generate quantity prediction examples
function generateQuantityExample(config, index) {
  const { bt, scope, finishLevel, area, roomCount, bathroomCount, kitchenCount, floorCount, livingRoomCount } = config;

  // Pick a random item and estimate its quantity
  const eligibleItems = items.filter(i => 
    i.quantity_driver && 
    i.quantity_driver !== 'manual_confirmation' && 
    i.quantity_driver !== 'engineering_formula'
  );
  const item = eligibleItems[index % eligibleItems.length];
  if (!item) return null;

  const eq = estimateQuantity(item.code, config);
  if (eq.quantity <= 0) return null;

  return {
    input: {
      building_type: bt.name,
      project_type: bt.project_type,
      scope,
      finish_level: finishLevel,
      item_code: item.code,
      item_name: item.name_ar,
      unit: item.unit,
      quantity_driver: item.quantity_driver,
      project_area: area,
      room_count: roomCount,
      bathroom_count: bathroomCount,
      kitchen_count: kitchenCount || 1,
      floor_count: floorCount,
      living_room_count: livingRoomCount
    },
    output: {
      quantity: eq.quantity,
      quantity_min: eq.min,
      quantity_max: eq.max,
      confidence: eq.confidence,
      calculation_method: eq.method
    },
    source_type: 'synthetic_seed',
    engineering_reviewed: false
  };
}

// Generate edge case
function generateEdgeCase(config, index) {
  const templates = [
    { scenario: 'مساحة صغيرة جداً', area: randInt(15, 30), roomCount: 0, bathroomCount: 1 },
    { scenario: 'مساحة كبيرة جداً', area: randInt(5000, 10000), roomCount: randInt(20, 50), bathroomCount: randInt(10, 30), floorCount: randInt(5, 15) },
    { scenario: 'بدون معلومات المساحة', area: 0, roomCount: randInt(1, 5), bathroomCount: randInt(1, 3) },
    { scenario: 'بدون معلومات الغرف', area: randInt(100, 300), roomCount: 0, bathroomCount: randInt(1, 3) },
    { scenario: 'عدد كبير من الحمامات', area: randInt(100, 300), roomCount: randInt(1, 3), bathroomCount: randInt(6, 10) },
    { scenario: 'تشطيب فاخر جداً', finishLevel: 'فاخر', area: randInt(200, 600), roomCount: randInt(4, 8), bathroomCount: randInt(4, 8) },
    { scenario: 'أرضيات فقط لمساحة ضخمة', scope: 'أرضيات فقط', area: randInt(2000, 5000) },
    { scenario: 'كهرباء فقط مع مساحة صغيرة', scope: 'كهرباء فقط', area: randInt(20, 50), roomCount: randInt(1, 2) },
    { scenario: 'ترميم مع إضافة مسبح', scope: 'ترميم شامل', includes_pool: true },
    { scenario: 'مشروع متعدد الاستخدامات', scope: 'إنشاء جديد', is_mixed: true }
  ];

  const tmpl = templates[index % templates.length];
  return {
    ...tmpl,
    description: `حالة حدية: ${tmpl.scenario}`,
    source_type: 'synthetic_seed',
    engineering_reviewed: false,
    expected_behavior: 'يجب أن يتعامل النظام مع هذا السيناريو دون أخطاء'
  };
}

// ---- Main Generation ----
function generateAll() {
  console.log('='.repeat(48));
  console.log('توليد بيانات التدريب');
  console.log('='.repeat(48));
  console.log();

  const seed = crypto.randomBytes(4).readUInt32BE();
  const rng = () => {
    let s = seed;
    return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return s / 0xffffffff; };
  };
  const r = rng();

  const COUNT_UNDERSTANDING = 1000;
  const COUNT_ITEM_PREDICTION = 1000;
  const COUNT_QUANTITY = 2000;
  const COUNT_NEGATIVE = 500;
  const COUNT_EDGE = 300;
  const COUNT_MISSING = 200;
  const COUNT_RENOVATION = 200;
  const COUNT_SPECIALIZED = 200;

  const totalExamples = COUNT_UNDERSTANDING + COUNT_ITEM_PREDICTION + COUNT_QUANTITY + COUNT_NEGATIVE + COUNT_EDGE + COUNT_MISSING + COUNT_RENOVATION + COUNT_SPECIALIZED;

  console.log(`إجمالي الأمثلة المطلوبة: ${totalExamples}`);
  console.log();

  // Generate project configs
  const projectConfigs = [];
  for (let i = 0; i < Math.max(COUNT_UNDERSTANDING, COUNT_ITEM_PREDICTION, COUNT_QUANTITY); i++) {
    projectConfigs.push(generateProjectConfig(i));
  }

  console.log('[1] توليد أمثلة فهم الطلب...');
  const understandingExamples = [];
  for (let i = 0; i < COUNT_UNDERSTANDING; i++) {
    const cfg = projectConfigs[i % projectConfigs.length];
    understandingExamples.push(generateUnderstandingExample(cfg, i));
  }
  console.log(`    ✅ ${understandingExamples.length} مثال`);

  console.log('[2] توليد أمثلة توقع البنود...');
  const itemPredictionExamples = [];
  for (let i = 0; i < COUNT_ITEM_PREDICTION; i++) {
    const cfg = projectConfigs[i % projectConfigs.length];
    itemPredictionExamples.push(generateItemPredictionExample(cfg, i));
  }
  console.log(`    ✅ ${itemPredictionExamples.length} مثال`);

  console.log('[3] توليد أمثلة توقع الكميات...');
  const quantityExamples = [];
  for (let i = 0; i < COUNT_QUANTITY; i++) {
    const cfg = projectConfigs[i % projectConfigs.length];
    const ex = generateQuantityExample(cfg, i);
    if (ex) quantityExamples.push(ex);
  }
  console.log(`    ✅ ${quantityExamples.length} مثال`);

  console.log('[4] توليد الأمثلة السلبية...');
  const negativeExamples = [];
  for (let i = 0; i < COUNT_NEGATIVE; i++) {
    const cfg = projectConfigs[i % projectConfigs.length];
    negativeExamples.push(generateNegativeExample(cfg, i));
  }
  console.log(`    ✅ ${negativeExamples.length} مثال`);

  console.log('[5] توليد الحالات الحدية...');
  const edgeCases = [];
  for (let i = 0; i < COUNT_EDGE; i++) {
    const cfg = projectConfigs[i % projectConfigs.length];
    edgeCases.push(generateEdgeCase(cfg, i));
  }
  console.log(`    ✅ ${edgeCases.length} حالة`);

  console.log('[6] توليد أمثلة ببيانات ناقصة...');
  const missingExamples = [];
  for (let i = 0; i < COUNT_MISSING; i++) {
    const cfg = projectConfigs[i % projectConfigs.length];
    // Intentionally remove some data
    const partialCfg = { ...cfg, area: Math.random() > 0.5 ? 0 : cfg.area, roomCount: Math.random() > 0.5 ? 0 : cfg.roomCount, bathroomCount: Math.random() > 0.5 ? 0 : cfg.bathroomCount, city: Math.random() > 0.7 ? '' : cfg.city, finishLevel: Math.random() > 0.7 ? '' : cfg.finishLevel };
    const ex = generateUnderstandingExample(partialCfg, i + COUNT_UNDERSTANDING);
    ex.input = 'معلومات ناقصة: ' + ex.input;
    missingExamples.push(ex);
  }
  console.log(`    ✅ ${missingExamples.length} مثال`);

  console.log('[7] توليد أمثلة ترميم...');
  const renovationExamples = [];
  for (let i = 0; i < COUNT_RENOVATION; i++) {
    const cfg = { ...projectConfigs[i % projectConfigs.length], scope: 'ترميم شامل', condition: 'renovation' };
    renovationExamples.push(generateProjectExample(cfg, i + 10000));
  }
  console.log(`    ✅ ${renovationExamples.length} مثال`);

  console.log('[8] توليد أمثلة أعمال متخصصة...');
  const specializedExamples = [];
  const specializedScopes = ['كهرباء فقط', 'سباكة فقط', 'دهانات فقط', 'أرضيات فقط'];
  for (let i = 0; i < COUNT_SPECIALIZED; i++) {
    const cfg = { ...projectConfigs[i % projectConfigs.length], scope: specializedScopes[i % specializedScopes.length] };
    specializedExamples.push(generateProjectExample(cfg, i + 20000));
  }
  console.log(`    ✅ ${specializedExamples.length} مثال`);

  // ---- Write output files ----
  console.log();
  console.log('[9] كتابة ملفات التدريب...');

  // Write JSONL files
  function writeJSONL(filename, data) {
    const filepath = path.join(TRAINING_DIR, filename);
    const lines = data.map(d => JSON.stringify(d)).join('\n');
    fs.writeFileSync(filepath, lines, 'utf-8');
    const size = fs.statSync(filepath).size;
    return { path: filepath, size };
  }

  const files = [
    writeJSONL('project-understanding.jsonl', understandingExamples),
    writeJSONL('item-prediction.jsonl', itemPredictionExamples),
    writeJSONL('quantity-prediction.jsonl', quantityExamples),
    writeJSONL('addition-classification.jsonl', negativeExamples),
    writeJSONL('negative-examples.jsonl', negativeExamples),
  ];

  for (const f of files) {
    console.log(`    ✅ ${path.basename(f.path)} - ${(f.size / 1024).toFixed(1)} كيلوبايت`);
  }

  // Write evaluation files
  console.log();
  console.log('[10] كتابة ملفات التقييم...');

  // Split: 70% train, 15% val, 15% test
  function splitData(data) {
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    const total = shuffled.length;
    const trainEnd = Math.floor(total * 0.7);
    const valEnd = trainEnd + Math.floor(total * 0.15);
    return { train: shuffled.slice(0, trainEnd), val: shuffled.slice(trainEnd, valEnd), test: shuffled.slice(valEnd) };
  }

  const splitUnderstanding = splitData(understandingExamples);
  const splitItems = splitData(itemPredictionExamples);
  const splitQuantity = splitData(quantityExamples);

  // Validation set
  const validationSet = [
    ...splitUnderstanding.val,
    ...splitItems.val,
    ...splitQuantity.val
  ];

  // Test set
  const testSet = [
    ...splitUnderstanding.test,
    ...splitItems.test,
    ...splitQuantity.test,
    ...edgeCases.slice(0, 100)
  ];

  fs.writeFileSync(path.join(EVAL_DIR, 'validation-set.jsonl'), validationSet.map(d => JSON.stringify(d)).join('\n'), 'utf-8');
  fs.writeFileSync(path.join(EVAL_DIR, 'test-set.jsonl'), testSet.map(d => JSON.stringify(d)).join('\n'), 'utf-8');
  fs.writeFileSync(path.join(EVAL_DIR, 'edge-cases.jsonl'), edgeCases.map(d => JSON.stringify(d)).join('\n'), 'utf-8');

  console.log(`    ✅ validation-set.jsonl - ${validationSet.length} مثال`);
  console.log(`    ✅ test-set.jsonl - ${testSet.length} مثال`);
  console.log(`    ✅ edge-cases.jsonl - ${edgeCases.length} حالة`);

  // Write project JSON files (for the existing training loader)
  console.log();
  console.log('[11] توليد مشاريع التدريب الأساسية...');

  // Generate 500 full project examples for the training system
  const totalProjectExamples = Math.min(500, itemPredictionExamples.length);
  const projectExamples = [];
  for (let i = 0; i < totalProjectExamples; i++) {
    const cfg = projectConfigs[i % projectConfigs.length];
    projectExamples.push(generateProjectExample(cfg, i + 50000));
  }

  // Write JSONL project files by type
  const residentialProjects = projectExamples.filter(p => p.project.project_type === 'سكني');
  const commercialProjects = projectExamples.filter(p => p.project.project_type === 'تجاري');
  const renovationProjects = projectExamples.filter(p => p.project.scope === 'ترميم شامل' || p.project.project_condition === 'renovation');
  const syntheticProjects = projectExamples;

  function writeJSON(filename, data) {
    const filepath = path.join(PROJECTS_DIR, filename);
    // data might be string (JSONL content) or object (JSON content)
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    fs.writeFileSync(filepath, content, 'utf-8');
    const size = fs.statSync(filepath).size;
    return { path: filepath, size };
  }

  const resContent = residentialProjects.map(d => JSON.stringify(d)).join('\n');
  writeJSON('residential-projects.jsonl', resContent);
  const comContent = commercialProjects.map(d => JSON.stringify(d)).join('\n');
  writeJSON('commercial-projects.jsonl', comContent);
  const renContent = renovationProjects.map(d => JSON.stringify(d)).join('\n');
  writeJSON('renovation-projects.jsonl', renContent);
  const specContent = specializedExamples.map(d => JSON.stringify(d)).join('\n');
  writeJSON('specialized-projects.jsonl', specContent);
  const synthContent = syntheticProjects.map(d => JSON.stringify(d)).join('\n');
  writeJSON('synthetic-projects.jsonl', synthContent);

  console.log(`    ✅ residential-projects.jsonl - ${residentialProjects.length} مشروع`);
  console.log(`    ✅ commercial-projects.jsonl - ${commercialProjects.length} مشروع`);
  console.log(`    ✅ renovation-projects.jsonl - ${renovationProjects.length} مشروع`);
  console.log(`    ✅ specialized-projects.jsonl - ${specializedExamples.length} مشروع`);
  console.log(`    ✅ synthetic-projects.jsonl - ${syntheticProjects.length} مشروع`);

  // Update data-version.json
  const versionPath = path.join(META_DIR, 'data-version.json');
  const version = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
  version.version = '1.1.0';
  version.generated_at = new Date().toISOString();
  version.data_sources[0].count = totalExamples + projectExamples.length;
  fs.writeFileSync(versionPath, JSON.stringify(version, null, 2), 'utf-8');

  // Update training manifest
  const manifestPath = path.join(META_DIR, 'training-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  manifest.data_version = version.version;
  manifest.total_projects = projectExamples.length;
  manifest.total_training_examples = totalExamples;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  // ---- Summary ----
  console.log();
  console.log('='.repeat(48));
  console.log('✅ اكتمل التوليد');
  console.log('='.repeat(48));
  console.log();
  console.log('ملخص التوليد:');
  console.log(`  فهم الطلب:     ${understandingExamples.length}`);
  console.log(`  توقع البنود:   ${itemPredictionExamples.length}`);
  console.log(`  توقع الكميات:  ${quantityExamples.length}`);
  console.log(`  أمثلة سلبية:   ${negativeExamples.length}`);
  console.log(`  حالات حدية:    ${edgeCases.length}`);
  console.log(`  بيانات ناقصة:  ${missingExamples.length}`);
  console.log(`  ترميم:         ${renovationExamples.length}`);
  console.log(`  متخصصة:        ${specializedExamples.length}`);
  console.log(`  مشاريع كاملة:  ${projectExamples.length}`);
  console.log(`  ───────────────────`);
  console.log(`  الإجمالي:      ${totalExamples + projectExamples.length}`);
  console.log();
  console.log('أنواع المباني المغطاة:');
  const btCounts = {};
  for (const cfg of projectConfigs) {
    const name = cfg.bt.name;
    btCounts[name] = (btCounts[name] || 0) + 1;
  }
  for (const [name, count] of Object.entries(btCounts).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  - ${name}: ${count}`);
  }
  console.log(`  ...و ${Object.keys(btCounts).length - 15} نوعاً آخر`);
}

generateAll();
