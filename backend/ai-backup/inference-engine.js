const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;

let trainingData = [];
let itemRelationships = { relationship_groups: [] };
let itemDictionary = {};

try {
  trainingData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'training-data.json'), 'utf-8'));
  itemRelationships = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'item-relationships.json'), 'utf-8'));
  itemDictionary = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'item-dictionary.json'), 'utf-8'));
} catch (e) {
  console.error('Error loading AI data files:', e.message);
}

const PROJECT_TYPES = ['سكني', 'تجاري', 'مكتبي', 'صناعي', 'ترميم', 'تشطيب'];
const ESTIMATE_LEVELS = ['تقدير_أولي', 'تقدير_متوسط', 'حصر_تفصيلي'];
const EXECUTION_MODES = ['no_additions', 'auto_add', 'show_before_add'];

function classifyScope(description, title) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  if (/تشطيب\s*(كامل|فاخر)/i.test(text)) return 'تشطيب كامل';
  if (/ترميم\s*(شامل|كامل)/i.test(text)) return 'ترميم شامل';
  if (/هيكل/i.test(text)) return 'هيكل فقط';
  if (/كهرباء/i.test(text) && !/سباكة/i.test(text)) return 'كهرباء فقط';
  if (/سباكة/i.test(text) && !/كهرباء/i.test(text)) return 'سباكة فقط';
  if (/تشطيب/i.test(text)) return 'تشطيب كامل';
  if (/ترميم/i.test(text)) return 'ترميم شامل';
  return 'تشطيب كامل';
}

function classifyBuildingType(description, title) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  if (/فيلا/i.test(text)) return 'فيلا';
  if (/شقة/i.test(text)) return 'شقة';
  if (/محل/i.test(text) || /تجاري/i.test(text)) return 'محل';
  if (/مكتب/i.test(text)) return 'مكتب';
  if (/مستودع/i.test(text) || /صناعي/i.test(text)) return 'مستودع';
  if (/عمارة/i.test(text) || /سكني/i.test(text) && /دور/i.test(text)) return 'عمارة';
  if (/قصر/i.test(text)) return 'قصر';
  return 'شقة';
}

function classifyProjectType(description, title) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  if (/تجاري/i.test(text) || /محل/i.test(text) || /مكتب/i.test(text)) return 'تجاري';
  if (/صناعي/i.test(text) || /مستودع/i.test(text) || /مصنع/i.test(text)) return 'صناعي';
  if (/مكتب/i.test(text)) return 'مكتبي';
  if (/ترميم/i.test(text)) return 'ترميم';
  return 'سكني';
}

function findBestTemplate(request) {
  const reqType = request.project_type || classifyProjectType(request.description, request.title);
  const reqBuildingType = request.building_type || classifyBuildingType(request.description, request.title);
  const reqScope = request.scope || classifyScope(request.description, request.title);
  const reqArea = request.area || 0;
  const reqRooms = request.rooms || 0;

  let best = null;
  let bestScore = -1;

  for (const tmpl of trainingData) {
    if (tmpl.type !== 'project_example') continue;
    const p = tmpl.project;
    let score = 0;

    if (p.project_type === reqType) score += 50;
    else score += 10;

    if (p.building_type === reqBuildingType) score += 25;
    else if (reqBuildingType && p.building_type) {
      const btypes = ['شقة', 'فيلا', 'عمارة', 'محل', 'مكتب', 'مستودع'];
      const idx1 = btypes.indexOf(p.building_type);
      const idx2 = btypes.indexOf(reqBuildingType);
      if (idx1 >= 0 && idx2 >= 0) score += 15 - Math.abs(idx1 - idx2) * 3;
    }

    const scopeSimilarity = scopeSimilarityScore(p.scope, reqScope);
    score += scopeSimilarity * 20;

    if (reqArea > 0 && p.area > 0) {
      const ratio = Math.min(reqArea, p.area) / Math.max(reqArea, p.area);
      score += ratio * 15;
    }

    if (reqRooms > 0 && p.room_count > 0) {
      const ratio = Math.min(reqRooms, p.room_count) / Math.max(reqRooms, p.room_count);
      score += ratio * 10;
    }

    if (score > bestScore) {
      bestScore = score;
      best = tmpl;
    }
  }

  return best;
}

function scopeSimilarityScore(s1, s2) {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const n1 = s1.replace(/[^\w\u0600-\u06FF]/g, '').toLowerCase();
  const n2 = s2.replace(/[^\w\u0600-\u06FF]/g, '').toLowerCase();
  if (n1.includes(n2) || n2.includes(n1)) return 0.7;
  const words1 = s1.split(/[\s\-_]+/);
  const words2 = s2.split(/[\s\-_]+/);
  const common = words1.filter(w => words2.includes(w)).length;
  return common / Math.max(words1.length, words2.length);
}

function calculateConfidence(projectParams, itemCode) {
  const dict = itemDictionary[itemCode];
  let base = 0.7;

  if (!projectParams.area) base -= 0.15;
  if (!projectParams.rooms) base -= 0.1;
  if (!projectParams.bathrooms) base -= 0.1;
  if (!projectParams.finish_level) base -= 0.05;

  if (dict) {
    if (dict.commonly_forgotten) base -= 0.1;
    if (dict.requires_specialist) base += 0.05;
    if (dict.classification_default === 'تحسيني') base -= 0.1;
  }

  return Math.max(0.3, Math.min(0.98, base));
}

const ITEM_QUANTITY_ESTIMATORS = {
  'FLR-004': (p) => ({ q: p.area * 0.7, m: 'مساحة الأرضية × 0.7 (70% من المساحة)' }),
  'FLR-010': (p) => ({ q: p.area * 0.7, m: 'مساحة الأرضية × 0.7 (70% من المساحة)' }),
  'FLR-008': (p) => ({ q: Math.sqrt(p.area) * 4 * (p.rooms || 3) * 0.7, m: 'محيط الغرف × 0.7' }),
  'FLR-009': (p) => ({ q: (p.bathrooms || 2) * 35, m: 'عدد الحمامات × 35 م²' }),
  'FLR-006': (p) => ({ q: p.area * 0.7 * 3, m: 'مساحة البلاط × 3 كجم/م²' }),
  'FLR-007': (p) => ({ q: p.area * 0.7 * 1, m: 'مساحة البلاط × 1 كجم/م²' }),
  'FLR-001': (p) => ({ q: p.area * 0.7, m: 'مساحة الأرضيات' }),
  'FLR-002': (p) => ({ q: p.area * 0.7, m: 'مساحة الأرضيات' }),
  'FLR-011': (p) => ({ q: Math.min(p.area * 0.05, 60), m: '5% من المساحة للمداخل (حد أقصى 60 م²)' }),
  'FLR-012': (p) => ({ q: Math.min(p.area * 0.03, 20), m: '3% من المساحة للمدخل' }),
  'PNT-005': (p) => ({ q: p.area * 2.8, m: 'مساحة الأرضية × 2.8 (ارتفاع الجدار)' }),
  'PNT-003': (p) => ({ q: p.area * 2.8, m: 'نفس مساحة الدهان' }),
  'PNT-004': (p) => ({ q: Math.ceil(p.area * 2.8 / 8), m: 'مساحة الدهان ÷ 8 لتر/م²' }),
  'PNT-001': (p) => ({ q: Math.sqrt(p.area) * (p.rooms || 3) * 2, m: 'تقدير طول الشقوق' }),
  'PNT-007': (p) => ({ q: p.area, m: 'نفس مساحة الأرضية' }),
  'PNT-002': (p) => ({ q: p.area * 2.8, m: 'نفس مساحة الدهان' }),
  'PNT-006': (p) => ({ q: p.area * 0.6, m: 'مساحة × 0.6 للواجهات' }),
  'PNT-008': (p) => ({ q: (p.rooms || 3) * 2, m: 'تقدير مساحة الأخشاب' }),
  'ELC-001': (p) => ({ q: (p.rooms || 3) * 4 + (p.bathrooms || 2) * 2 + 3, m: 'غرف × 4 + حمامات × 2 + مطبخ + ممر' }),
  'ELC-003': (p) => ({ q: (p.rooms || 3) * 6 + (p.bathrooms || 2) * 2 + 6, m: 'غرف × 6 + حمامات × 2 + مطبخ + صالة' }),
  'ELC-005': (p) => ({ q: (p.rooms || 3) + (p.bathrooms || 2) + 2, m: 'عدد الغرف + الحمامات + 2' }),
  'ELC-002': (p) => ({ q: (p.rooms || 3) + 2, m: 'غرف + 2' }),
  'ELC-010': (p) => ({ q: p.area * 2.5, m: 'مساحة × 2.5 م/م²' }),
  'ELC-006': () => ({ q: 1, m: 'قاطع رئيسي واحد' }),
  'ELC-007': (p) => ({ q: Math.max(1, p.floors || 1), m: 'لوحة لكل دور' }),
  'ELC-008': (p) => ({ q: Math.ceil(((p.rooms || 3) * 4 + (p.bathrooms || 2) * 2 + 6) / 4) + Math.ceil((p.rooms || 3) / 2), m: 'قاطع لكل 4 دوائر إنارة + قاطع لكل دائرتين أفياش' }),
  'ELC-009': (p) => ({ q: p.area * 0.1, m: 'مساحة × 0.1' }),
  'ELC-011': (p) => ({ q: Math.ceil(p.area * 0.15), m: 'مساحة × 0.15' }),
  'ELC-012': (p) => ({ q: (p.bathrooms || 2), m: 'مروحة لكل حمام' }),
  'ELC-015': (p) => ({ q: (p.rooms || 3) * 15, m: 'غرف × 15 م' }),
  'ELC-013': () => ({ q: 1, m: 'نظام جرس واحد' }),
  'ELC-014': (p) => ({ q: Math.max(2, Math.round((p.rooms || 3) / 2)), m: 'كاميرا لكل غرفتين' }),
  'PLM-001': (p) => ({ q: p.area * 0.4 + (p.bathrooms || 2) * 5, m: 'مساحة × 0.4 + حمامات × 5' }),
  'PLM-002': (p) => ({ q: p.area * 0.3 + (p.bathrooms || 2) * 5, m: 'مساحة × 0.3 + حمامات × 5' }),
  'PLM-003': (p) => ({ q: (p.floors || 1) > 1 ? 2 : 1, m: (p.floors || 1) > 1 ? 'خزانان للمباني المتعددة' : 'خزان واحد' }),
  'PLM-004': () => ({ q: 1, m: 'مضخة واحدة' }),
  'PLM-005': (p) => ({ q: (p.bathrooms || 2), m: 'سخان لكل حمام' }),
  'PLM-006': () => ({ q: 2, m: 'محبس رئيسي + محبس فرعي' }),
  'PLM-007': (p) => ({ q: (p.bathrooms || 2) * 3 + 2, m: 'حمامات × 3 + مطبخ + غسالة' }),
  'PLM-008': (p) => ({ q: p.area * 0.1, m: 'مساحة × 0.1' }),
  'PLM-009': () => ({ q: 1, m: 'حوض مطبخ واحد' }),
  'PLM-010': () => ({ q: 1, m: 'خلاط مطبخ واحد' }),
  'PLM-011': (p) => ({ q: (p.bathrooms || 2), m: 'خلاط حوض لكل حمام' }),
  'PLM-012': (p) => ({ q: (p.bathrooms || 2), m: 'خلاط دش لكل حمام' }),
  'PLM-013': (p) => ({ q: (p.bathrooms || 2), m: 'مغسلة لكل حمام' }),
  'PLM-014': () => ({ q: 1, m: 'محبس غسالة واحد' }),
  'PLM-015': (p) => ({ q: (p.bathrooms || 2), m: 'مرحاض لكل حمام' }),
  'PLM-016': (p) => ({ q: 30 + ((p.floors || 1) - 1) * 20, m: 'تمديدات الغاز' }),
  'PLM-017': (p) => ({ q: (p.floors || 1) > 1 ? (p.floors || 1) * 2 : 1, m: 'محبس أمان لكل شقة' }),
  'PLM-018': (p) => ({ q: (p.floors || 1) > 1 ? (p.floors || 1) * 2 : 1, m: 'كاشف لكل شقة' }),
  'HVAC-001': (p) => ({ q: (p.rooms || 3) + 1, m: 'غرف + 1 للصالة' }),
  'HVAC-002': (p) => ({ q: Math.max(1, Math.floor((p.rooms || 3) / 3)), m: 'مكيف كبير للمجالس' }),
  'HVAC-003': (p) => ({ q: Math.max(0, (p.rooms || 3) - 2), m: 'مكيف صغير للغرف الصغيرة' }),
  'HVAC-005': (p) => ({ q: ((p.rooms || 3) + 1) * 5, m: 'مكيفات × 5 م' }),
  'HVAC-004': (p) => ({ q: p.area > 400 ? 2 : 1, m: p.area > 400 ? 'نظامان للتكييف المركزي' : 'نظام تكييف مركزي واحد' }),
  'HVAC-006': (p) => ({ q: p.area * 0.3, m: 'مساحة × 0.3 لمجاري الهواء' }),
  'HVAC-007': (p) => ({ q: Math.max(2, Math.round((p.rooms || 3) / 2)), m: 'منظم لكل منطقتين' }),
  'HVAC-008': (p) => ({ q: Math.ceil((p.rooms || 3) / 2), m: 'كاسيت لكل غرفتين' }),
  'WOD-001': (p) => ({ q: (p.rooms || 3) + (p.bathrooms || 2) + 2, m: 'غرف + حمامات + مطبخ + رئيسي' }),
  'WOD-004': (p) => ({ q: p.area > 300 ? 8 : p.area > 150 ? 5 : 4, m: 'طول المطبخ حسب المساحة' }),
  'WOD-005': (p) => ({ q: (p.rooms || 3) * 3, m: 'غرف × 3 م' }),
  'WOD-002': () => ({ q: 1, m: 'باب رئيسي واحد' }),
  'WOD-003': (p) => ({ q: p.area > 300 ? 10 : p.area > 150 ? 6 : 4, m: 'دواليب علوية حسب المساحة' }),
  'WOD-006': (p) => ({ q: p.area * 0.3, m: '30% من المساحة للأسقف المعلقة' }),
  'WOD-007': (p) => ({ q: p.area * 0.1, m: '10% من المساحة للديكور الخشبي' }),
  'WOD-008': (p) => ({ q: p.area * 0.1, m: '10% من المساحة' }),
  'WOD-009': (p) => ({ q: Math.sqrt(p.area) * 4 * 0.5, m: 'محيط الأسقف' }),
  'WOD-010': (p) => ({ q: p.area * 0.15, m: '15% من المساحة' }),
  'LIG-001': (p) => ({ q: Math.round(p.area * 0.15), m: 'مساحة × 0.15' }),
  'LIG-002': (p) => ({ q: Math.max(1, Math.round((p.rooms || 3) / 3)), m: 'ثريا لكل 3 غرف' }),
  'LIG-003': (p) => ({ q: Math.round(p.area * 0.05), m: 'مساحة × 0.05' }),
  'LIG-004': (p) => ({ q: Math.round(p.area * 0.06), m: 'مساحة × 0.06' }),
  'LIG-005': (p) => ({ q: Math.min(3, Math.max(1, Math.round((p.rooms || 3) / 3))), m: 'ثريا كريستال للصالات' }),
  'INS-001': (p) => ({ q: (p.bathrooms || 2) * 12, m: 'حمامات × 12 م²' }),
  'INS-002': (p) => ({ q: p.area > 200 ? p.area * 0.3 : p.area * 0.5, m: 'مساحة السطح' }),
  'INS-003': (p) => ({ q: p.area > 200 ? p.area * 0.3 : p.area * 0.5, m: 'مساحة السطح' }),
  'INS-004': () => ({ q: 120, m: 'مساحة المسبح النموذجية 8×4×2.5 م' }),
  'INS-005': (p) => ({ q: p.area * 0.5, m: '50% من المساحة' }),
  'OPR-001': () => ({ q: 1, m: 'نظام اختبار واحد' }),
  'OPR-002': () => ({ q: 1, m: 'نظام فحص واحد' }),
  'OPR-003': () => ({ q: 1, m: 'اختبار مصعد واحد' }),
  'OPR-004': (p) => ({ q: p.area, m: 'كامل المساحة' }),
  'OPR-005': () => ({ q: 1, m: 'نظام تقارير واحد' }),
  'OPR-006': () => ({ q: 1, m: 'شهادة إتمام بناء' }),
  'CON-001': (p) => ({ q: p.area * 0.35, m: 'مساحة × 0.35 م³/م²' }),
  'CON-002': (p) => ({ q: p.area * 0.05, m: 'مساحة × 0.05' }),
  'CON-003': (p) => ({ q: p.area * 40, m: 'مساحة × 40 كجم/م²' }),
  'CON-004': (p) => ({ q: p.area, m: 'نفس مساحة الأرضية' }),
  'CON-005': (p) => ({ q: p.area, m: 'نفس مساحة الأرضية' }),
  'EXC-001': (p) => ({ q: p.area * 0.2, m: 'مساحة × 0.2 م³/م²' }),
  'EXC-002': (p) => ({ q: p.area * 0.1, m: 'مساحة × 0.1' }),
  'EXC-003': (p) => ({ q: p.area * 0.7, m: 'مساحة الأرضيات' }),
  'EXC-004': (p) => ({ q: p.area * 2.8, m: 'مساحة الأرضية × 2.8' }),
  'EXC-005': (p) => ({ q: Math.max(10, p.area * 0.05), m: 'تقدير 5% للمساحة' }),
  'EXC-006': (p) => ({ q: (p.bathrooms || 2) * 2, m: 'حمامات × 2' }),
  'BLK-001': (p) => ({ q: p.area * 25, m: 'مساحة × 25 طوبة/م²' }),
  'BLK-002': (p) => ({ q: p.area * 10, m: 'مساحة × 10' }),
  'BLK-003': (p) => ({ q: p.area * 0.02, m: 'مساحة × 0.02' }),
  'PLA-001': (p) => ({ q: p.area * 2, m: 'مساحة × 2' }),
  'PLA-002': (p) => ({ q: p.area * 0.6, m: 'مساحة × 0.6' }),
  'PLA-003': (p) => ({ q: p.area * 0.3, m: 'مساحة × 0.3' }),
  'ALM-001': (p) => ({ q: Math.max(3, Math.round((p.rooms || 3) * 1.5)), m: 'غرف × 1.5' }),
  'ALM-002': (p) => ({ q: Math.max(3, Math.round((p.rooms || 3) * 1.5)), m: 'غرف × 1.5' }),
  'ALM-003': (p) => ({ q: Math.round(p.area * 0.15), m: 'مساحة × 0.15' }),
  'ALM-004': () => ({ q: 1, m: 'باب أتوماتيكي واحد' }),
  'ALM-005': (p) => ({ q: Math.round(p.area * 0.25), m: 'مساحة × 0.25' }),
  'ALM-006': (p) => ({ q: Math.max(1, Math.round((p.rooms || 3) / 3)), m: 'باب ألمنيوم لكل 3 غرف' }),
  'ELC-016': () => ({ q: 1, m: 'نظام إنذار واحد' }),
  'ELC-017': (p) => ({ q: Math.max(2, Math.round(p.area / 100)), m: 'طفاية لكل 100 م²' }),
  'ELC-018': () => ({ q: 1, m: 'نظام منزل ذكي واحد' }),
  'ELC-019': () => ({ q: 1, m: 'مصعد واحد' })
};

const SECTION_DEFINITIONS = {
  'أساسي': {
    'شقة': [
      { code: 'SEC-01', name: 'أعمال الأرضيات', items: ['FLR-004', 'FLR-008', 'FLR-006', 'FLR-007'] },
      { code: 'SEC-02', name: 'أعمال الدهانات', items: ['PNT-005', 'PNT-003', 'PNT-004', 'PNT-001', 'PNT-007'] },
      { code: 'SEC-03', name: 'أعمال الكهرباء', items: ['ELC-001', 'ELC-003', 'ELC-005', 'ELC-006', 'ELC-007', 'ELC-008', 'ELC-010', 'ELC-009', 'ELC-011'] },
      { code: 'SEC-04', name: 'أعمال السباكة', items: ['PLM-001', 'PLM-002', 'PLM-005', 'PLM-006', 'PLM-007', 'PLM-009', 'PLM-010', 'PLM-011', 'PLM-012', 'PLM-013', 'PLM-015', 'PLM-014'] },
      { code: 'SEC-05', name: 'أعمال التكييف', items: ['HVAC-001', 'HVAC-005'] },
      { code: 'SEC-06', name: 'أعمال النجارة', items: ['WOD-001', 'WOD-004'] },
      { code: 'SEC-07', name: 'أعمال التشغيل والتسليم', items: ['OPR-001', 'OPR-002', 'OPR-004'] }
    ],
    'فيلا': [
      { code: 'SEC-01', name: 'أعمال الخرسانة والهيكل', items: ['CON-001', 'CON-003', 'EXC-001', 'CON-005'] },
      { code: 'SEC-02', name: 'أعمال البناء واللياسة', items: ['BLK-001', 'PLA-001', 'PLA-002'] },
      { code: 'SEC-03', name: 'أعمال الأرضيات', items: ['FLR-004', 'FLR-008', 'FLR-006', 'FLR-007'] },
      { code: 'SEC-04', name: 'أعمال الدهانات', items: ['PNT-005', 'PNT-003', 'PNT-004', 'PNT-001'] },
      { code: 'SEC-05', name: 'أعمال الكهرباء', items: ['ELC-001', 'ELC-003', 'ELC-005', 'ELC-006', 'ELC-007', 'ELC-008', 'ELC-010', 'ELC-009', 'ELC-011', 'ELC-012'] },
      { code: 'SEC-06', name: 'أعمال السباكة', items: ['PLM-001', 'PLM-002', 'PLM-003', 'PLM-004', 'PLM-005', 'PLM-006', 'PLM-007', 'PLM-009', 'PLM-010', 'PLM-011', 'PLM-012', 'PLM-013', 'PLM-015', 'PLM-014'] },
      { code: 'SEC-07', name: 'أعمال التكييف', items: ['HVAC-001', 'HVAC-005'] },
      { code: 'SEC-08', name: 'أعمال النجارة', items: ['WOD-001', 'WOD-004', 'WOD-005'] },
      { code: 'SEC-09', name: 'أعمال التشغيل والتسليم', items: ['OPR-001', 'OPR-002', 'OPR-004'] }
    ],
    'تجاري': [
      { code: 'SEC-01', name: 'أعمال الأرضيات', items: ['FLR-004', 'FLR-008', 'FLR-006', 'FLR-007'] },
      { code: 'SEC-02', name: 'أعمال الألمنيوم والواجهات', items: ['ALM-003', 'ALM-001', 'ALM-004', 'ALM-005'] },
      { code: 'SEC-03', name: 'أعمال الكهرباء', items: ['ELC-001', 'ELC-003', 'ELC-005', 'ELC-006', 'ELC-007', 'ELC-008', 'ELC-010'] },
      { code: 'SEC-04', name: 'أعمال السباكة', items: ['PLM-001', 'PLM-002', 'PLM-006', 'PLM-011'] },
      { code: 'SEC-05', name: 'أعمال التكييف', items: ['HVAC-004', 'HVAC-006'] },
      { code: 'SEC-06', name: 'أمان وحماية', items: ['ELC-014', 'ELC-016', 'ELC-017'] },
      { code: 'SEC-07', name: 'أعمال التشغيل والتسليم', items: ['OPR-001', 'OPR-002', 'OPR-004'] }
    ]
  },
  'ترميم': [
    { code: 'SEC-01', name: 'أعمال إزالة وهدم', items: ['EXC-003', 'EXC-004', 'EXC-005', 'EXC-006'] },
    { code: 'SEC-02', name: 'أعمال البناء والترميم', items: ['PLA-003', 'PNT-001', 'INS-001', 'INS-002'] },
    { code: 'SEC-03', name: 'أعمال التشطيب الجديدة', items: ['FLR-010', 'PNT-005', 'ELC-010', 'PLM-001'] },
    { code: 'SEC-04', name: 'أعمال النجارة', items: ['WOD-001', 'WOD-004'] },
    { code: 'SEC-05', name: 'أعمال التسليم', items: ['OPR-001', 'OPR-004'] }
  ]
};

function resolveSectionDefs(projectType, buildingType, scope) {
  const scope_lower = (scope || '').toLowerCase();

  if (scope_lower.includes('كهرباء فقط')) {
    return [
      { code: 'SEC-01', name: 'أعمال الكهرباء', items: ['ELC-001', 'ELC-002', 'ELC-003', 'ELC-005', 'ELC-006', 'ELC-007', 'ELC-008', 'ELC-010', 'ELC-009', 'ELC-011', 'ELC-012', 'ELC-015'] }
    ];
  }
  if (scope_lower.includes('سباكة فقط')) {
    return [
      { code: 'SEC-01', name: 'أعمال السباكة', items: ['PLM-001', 'PLM-002', 'PLM-003', 'PLM-004', 'PLM-005', 'PLM-006', 'PLM-007', 'PLM-009', 'PLM-010', 'PLM-011', 'PLM-012', 'PLM-013', 'PLM-015', 'PLM-014'] }
    ];
  }

  if (projectType === 'ترميم') {
    return SECTION_DEFINITIONS['ترميم'];
  }

  const byBuilding = SECTION_DEFINITIONS['أساسي'];
  if (projectType === 'تجاري' || projectType === 'مكتبي') {
    return byBuilding['تجاري'];
  }
  if (buildingType === 'فيلا') {
    return byBuilding['فيلا'];
  }
  return byBuilding['شقة'];
}

function generateItemFromDict(itemCode, projectParams) {
  const dict = itemDictionary[itemCode];
  if (!dict) return null;

  const estimator = ITEM_QUANTITY_ESTIMATORS[itemCode];
  let q = 0, method = 'تقدير آلي';

  if (estimator) {
    const result = estimator(projectParams);
    q = result.q;
    method = result.m;
  } else if (dict.typical_quantity_per_m2_building > 0) {
    q = projectParams.area * dict.typical_quantity_per_m2_building;
    method = `مساحة × ${dict.typical_quantity_per_m2_building}`;
  }

  const confidence = calculateConfidence(projectParams, itemCode);
  const qRound = Math.round(q * 100) / 100;

  return {
    code: itemCode,
    name_ar: dict.name_ar,
    description: dict.description || '',
    category: dict.category || '',
    unit: dict.unit,
    quantity: qRound,
    quantity_min: Math.round(qRound * 0.85 * 100) / 100,
    quantity_max: Math.round(qRound * 1.15 * 100) / 100,
    quantity_calculated: true,
    confidence,
    classification: dict.classification_default || 'أساسي',
    calculation_method: method,
    ai_suggested: true,
    user_requested: false,
    needs_confirmation: confidence < 0.6,
    price_status: 'غير_مسعر',
    unit_price: null,
    total_cost: null,
    dependencies: dict.dependencies || [],
    assumptions: []
  };
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

function analyzeRequest(request) {
  const type = request.project_type || classifyProjectType(request.description, request.title);
  const scope = request.scope || classifyScope(request.description, request.title);
  const buildingType = request.building_type || classifyBuildingType(request.description, request.title);

  const missingInfo = [];
  if (!request.area) missingInfo.push({ field: 'area', description: 'مساحة المشروع', impact: 'سيتم استخدام تقدير تقريبي للكميات' });
  if (!request.rooms) missingInfo.push({ field: 'rooms', description: 'عدد الغرف', impact: 'سيتم استخدام تقدير تقريبي' });
  if (!request.bathrooms) missingInfo.push({ field: 'bathrooms', description: 'عدد الحمامات', impact: 'سيتم استخدام تقدير تقريبي' });
  if (!request.finish_level) missingInfo.push({ field: 'finish_level', description: 'مستوى التشطيب', impact: 'سيتم استخدام مستوى افتراضي' });
  if (!request.city) missingInfo.push({ field: 'city', description: 'الموقع/المدينة', impact: 'سيتم استخدام متوسط أسعار وطني' });

  const hasArea = !!request.area;
  const hasRooms = !!request.rooms;
  const hasBathrooms = !!request.bathrooms;
  const infoCount = [hasArea, hasRooms, hasBathrooms].filter(Boolean).length;
  const confidence = 0.3 + infoCount * 0.2;

  return {
    type,
    scope,
    buildingType,
    confidence: Math.min(0.95, confidence),
    missingInfo
  };
}

function generateEstimate(request) {
  const analysis = analyzeRequest(request);
  const projectParams = {
    area: request.area || 150,
    rooms: request.rooms || 3,
    bathrooms: request.bathrooms || 2,
    floors: request.floors || 1,
    finish_level: request.finish_level || 'جيد',
    city: request.city || ''
  };

  const template = findBestTemplate(request);
  const templateArea = template ? template.project.area : projectParams.area;
  const areaRatio = templateArea > 0 ? projectParams.area / templateArea : 1;

  const project = {
    name: request.title || (template ? template.project.name : 'مشروع إنشائي'),
    type: analysis.type,
    scope: analysis.scope,
    estimate_level: request.estimate_level || 'تقدير_أولي',
    execution_mode: request.execution_mode || 'show_before_add',
    building_type: analysis.buildingType,
    city: request.city || (template ? template.project.city : ''),
    area: projectParams.area,
    floor_count: projectParams.floors,
    room_count: projectParams.rooms,
    finish_level: projectParams.finish_level
  };

  const assumptions = [
    `مساحة المشروع ${projectParams.area} م²`,
    `${projectParams.rooms} غرف، ${projectParams.bathrooms} حمامات`,
    projectParams.floors > 1 ? `${projectParams.floors} أدوار` : 'دور واحد',
    `نوع المشروع: ${analysis.type}`,
    `نوع المبنى: ${analysis.buildingType}`,
    `مستوى التشطيب: ${projectParams.finish_level}`
  ];

  if (template) {
    template.assumptions.forEach(a => {
      if (!assumptions.includes(a)) assumptions.push(a);
    });
  }

  const sectionDefs = resolveSectionDefs(analysis.type, analysis.buildingType, analysis.scope);

  const existingItemCodes = [];
  const sections = sectionDefs.map((def, idx) => {
    const items = [];
    for (const itemCode of def.items) {
      let item = null;

      if (template) {
        for (const ts of template.sections) {
          const found = ts.items.find(ti => ti.code === itemCode);
          if (found) {
            item = JSON.parse(JSON.stringify(found));
            item.quantity = Math.round(item.quantity * areaRatio * 100) / 100;
            item.quantity_min = item.quantity_min ? Math.round(item.quantity_min * areaRatio * 100) / 100 : null;
            item.quantity_max = item.quantity_max ? Math.round(item.quantity_max * areaRatio * 100) / 100 : null;
            item.ai_suggested = true;
            item.user_requested = false;
            item.quantity_calculated = true;
            item.assumptions = item.assumptions || [];
            break;
          }
        }
      }

      if (!item) {
        item = generateItemFromDict(itemCode, projectParams);
      }

      if (item) {
        item.needs_confirmation = item.confidence < 0.55;
        items.push(item);
        existingItemCodes.push(itemCode);
      }
    }

    return {
      code: def.code,
      name: def.name,
      sort_order: idx + 1,
      items
    };
  });

  const mode = request.execution_mode || 'show_before_add';
  const related = getRelatedItems(existingItemCodes, mode);

  const warnings = [];
  if (analysis.missingInfo.length > 0) {
    analysis.missingInfo.forEach(m => {
      warnings.push(`معلومات مفقودة: ${m.description} - ${m.impact}`);
    });
  }
  if (template && areaRatio < 0.5) {
    warnings.push('مساحة المشروع أصغر بكثير من القالب المرجعي، قد تحتاج الكميات إلى مراجعة يدوية');
  }
  if (template && areaRatio > 2) {
    warnings.push('مساحة المشروع أكبر بكثير من القالب المرجعي، قد تحتاج الكميات إلى مراجعة يدوية');
  }
  if (!request.city) {
    warnings.push('لم يتم تحديد المدينة، قد تختلف الأسعار حسب المنطقة');
  }

  if (mode === 'show_before_add' || mode === 'auto_add') {
    const addedItems = [];
    if (Array.isArray(related)) {
      related.forEach(r => {
        const item = generateItemFromDict(r.item, projectParams);
        if (item) {
          item.classification = 'مرتبط';
          item.needs_confirmation = true;
          item.assumptions = [r.reason || 'مشتق من علاقات العناصر'];
          item.ai_suggested = true;
          item.dependencies = item.dependencies || [];
          addedItems.push(item);
          existingItemCodes.push(r.item);
        }
      });
    }

    if (addedItems.length > 0) {
      const secCodes = sections.map(s => s.code);
      const relationsSection = {
        code: 'SEC-REL',
        name: 'عناصر مقترحة مرتبطة',
        sort_order: sections.length + 1,
        items: addedItems
      };

      if (!secCodes.includes('SEC-REL')) {
        sections.push(relationsSection);
      }
    }

    if (mode === 'auto_add') {
      warnings.push(`تمت إضافة ${addedItems.length} عنصراً مقترحاً تلقائياً`);
    } else {
      warnings.push(`تم اقتراح ${addedItems.length} عنصراً إضافياً للمراجعة`);
    }
  }

  const totalEssentialItems = sections.reduce((sum, s) =>
    sum + s.items.filter(i => i.classification === 'أساسي' || i.classification === 'ضروري').length, 0
  );
  const lowConfItems = sections.reduce((sum, s) =>
    sum + s.items.filter(i => i.confidence < 0.55).length, 0
  );

  return {
    project,
    assumptions: [...new Set(assumptions)],
    missing_information: analysis.missingInfo,
    sections,
    warnings: [...new Set(warnings)],
    review_required: lowConfItems > 0 || analysis.missingInfo.length > 0,
    suggestions_summary: `تم إنشاء ${sections.length} أقسام بإجمالي ${existingItemCodes.length} عنصر، منها ${totalEssentialItems} عنصر أساسي`
  };
}

function getSuggestions(projectId, mode) {
  const actualMode = mode || 'show_before_add';
  return {
    suggestions: [],
    mode: actualMode,
    count: 0
  };
}

function applySuggestions(projectId, suggestionIds) {
  return {
    added: [],
    count: 0
  };
}

function getMissingEssentialItems(existingItems, projectType) {
  const existingCodes = new Set((existingItems || []).map(i => i.code || i));
  const missing = [];

  const bType = projectType === 'فيلا' ? 'فيلا' : (projectType === 'تجاري' ? 'تجاري' : 'شقة');
  const defs = SECTION_DEFINITIONS['أساسي'][bType] || SECTION_DEFINITIONS['أساسي']['شقة'];

  for (const sec of defs) {
    for (const itemCode of sec.items) {
      if (!existingCodes.has(itemCode)) {
        const dict = itemDictionary[itemCode];
        if (dict && dict.classification_default === 'أساسي') {
          if (!missing.includes(itemCode)) {
            missing.push(itemCode);
          }
        }
      }
    }
  }

  return { missing };
}

function estimateQuantity(itemCode, projectParams) {
  const params = {
    area: (projectParams && projectParams.area) || 150,
    rooms: (projectParams && projectParams.rooms) || 3,
    bathrooms: (projectParams && projectParams.bathrooms) || 2,
    floors: (projectParams && projectParams.floors) || 1,
    finish_level: (projectParams && projectParams.finish_level) || 'جيد',
    city: (projectParams && projectParams.city) || ''
  };

  const dict = itemDictionary[itemCode];
  if (!dict) return null;

  const estimator = ITEM_QUANTITY_ESTIMATORS[itemCode];
  let q = 0, method = 'تقدير آلي';

  if (estimator) {
    const result = estimator(params);
    q = result.q;
    method = result.m;
  } else if (dict.typical_quantity_per_m2_building > 0) {
    q = params.area * dict.typical_quantity_per_m2_building;
    method = `مساحة × ${dict.typical_quantity_per_m2_building}`;
  } else {
    return null;
  }

  const confidence = calculateConfidence(params, itemCode);
  const qRound = Math.round(q * 100) / 100;

  return {
    quantity: qRound,
    min: Math.round(qRound * 0.85 * 100) / 100,
    max: Math.round(qRound * 1.15 * 100) / 100,
    confidence,
    method
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

  return {
    deviation: Math.round(deviation * 100) / 100,
    flag
  };
}

module.exports = {
  analyzeRequest,
  generateEstimate,
  getSuggestions,
  applySuggestions,
  getMissingEssentialItems,
  estimateQuantity,
  compareEstimate
};
