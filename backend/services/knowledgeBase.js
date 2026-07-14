const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

const itemRelationships = {
  'بلاط': ['لاصق بلاط', 'ترويبة بلاط', 'وزرة بلاط'],
  'سيراميك': ['لاصق سيراميك', 'ترويبة سيراميك', 'وزرة سيراميك'],
  'بورسلين': ['لاصق بورسلين', 'ترويبة بورسلين', 'وزرة بورسلين'],
  'دهان': ['معجون', 'صنفرة', 'سيلر', 'دهان أساس'],
  'دهان جدران': ['معجون جدران', 'صنفرة جدران', 'سيلر أكريليك', 'دهان جدران داخلي'],
  'جبس بورد': ['بروفيل جبس بورد', 'معجون جبس', 'شريط لاصق جبس', 'براغي جبس بورد'],
  'سباكة': ['مواسير مياه', 'مواسير صرف', 'تمديدات سباكة', 'عوازل سباكة'],
  'كهرباء': ['أسلاك كهربائية', 'علب توزيع', 'قواطع كهربائية', 'قنوات كهربائية'],
  'تكييف': ['مواسير نحاس', 'عوازل تكييف', 'مجاري هواء', 'تمديدات تكييف'],
  'أرضيات': ['عازل أرضيات', 'عازل رطوبة', 'مواد تسوية أرضية'],
  'عوازل': ['عازل حراري', 'عازل مائي', 'عازل صوتي'],
  'واجهات': ['حجر واجهات', 'غراء حجر', 'عازل واجهات'],
  'مطابخ': ['تمديدات مطبخ', 'توصيلات كهرباء مطبخ', 'توصيلات سباكة مطبخ'],
  'حمامات': ['عوازل حمامات', 'تمديدات حمامات', 'تهوية حمامات'],
  'أبواب': ['إطارات أبواب', 'مفصلات', 'أقفال', 'دهان أبواب'],
  'شبابيك': ['إطارات شبابيك', 'زجاج', 'سيلكون', 'مستلزمات تركيب'],
  'حدادة': ['حديد تسليح', 'أسلاك ربط', 'لحام'],
  'خرسانة': ['أسمنت', 'رمل', 'زلط', 'حديد تسليح', 'مواد معالجة خرسانة'],
  'طوب': ['أسمنت بناء', 'رمل بناء'],
  'عظم': ['خرسانة', 'حديد تسليح', 'طوب', 'أسمنت', 'رمل', 'زلط'],
};

const sectionTemplates = {
  'شقة': {
    categories: [
      'أعمال عظم',
      'أعمال بناء',
      'أعمال كهرباء',
      'أعمال سباكة',
      'أعمال تكييف',
      'أعمال دهان',
      'أعمال بلاط وسيراميك',
      'أعمال جبس بورد',
      'أعمال نجارة',
      'أعمال مطابخ',
      'أعمال كروم',
      'أعمال زجاج ومرايا',
      'أعمال ورق جدران',
      'أعمال تنظيف نهائي',
    ],
  },
  'فيلا': {
    categories: [
      'أعمال عظم',
      'أعمال بناء',
      'أعمال عوازل',
      'أعمال حدادة',
      'أعمال كهرباء',
      'أعمال سباكة',
      'أعمال تكييف',
      'أعمال تدفئة',
      'أعمال جبس بورد',
      'أعمال واجهات',
      'أعمال دهان',
      'أعمال بلاط وسيراميك وبورسلين',
      'أعمال أرضيات',
      'أعمال نجارة',
      'أعمال مطابخ',
      'أعمال غرف نوم',
      'أعمال كروم',
      'أعمال حمامات سباحة',
      'أعمال حدائق وتشجير',
      'أعمال زجاج',
      'أعمال ألمنيوم',
      'أعمال ستائر',
      'أعمال أنظمة أمان',
      'أعمال صوتيات',
    ],
  },
  'مبنى تجاري': {
    categories: [
      'أعمال عظم',
      'أعمال بناء',
      'أعمال واجهات زجاجية',
      'أعمال تكييف مركزي',
      'أعمال كهرباء تجارية',
      'أعمال سباكة تجارية',
      'أعمال مصاعد',
      'أعمال أنظمة حريق',
      'أعمال أنظمة أمن',
      'أعمال تشطيب تجاري',
      'أعمال إنارة',
      'أعمال لافتات',
    ],
  },
  'مستودع': {
    categories: [
      'أعمال عظم',
      'أعمال أرضيات صناعية',
      'أعمال هياكل معدنية',
      'أعمال كهرباء صناعية',
      'أعمال أنظمة إطفاء',
      'أعمال تهوية صناعية',
      'أعمال أرصفة تحميل',
      'أعمال أسوار',
    ],
  },
  'مكتب': {
    categories: [
      'أعمال بناء',
      'أعمال كهرباء',
      'أعمال تكييف',
      'أعمال جبس بورد',
      'أعمال دهان',
      'أعمال أرضيات',
      'أعمال زجاج وفواصل',
      'أعمال إنارة',
      'أعمال أثاث مكتبي',
    ],
  },
  'مشروع ترميم': {
    categories: [
      'أعمال هدم وإزالة',
      'أعمال ترميم هياكل',
      'أعمال ترميم واجهات',
      'أعمال ترميم كهرباء',
      'أعمال ترميم سباكة',
      'أعمال ترميم دهان',
      'أعمال ترميم أرضيات',
      'أعمال ترميم أسقف',
    ],
  },
};

const wasteRates = {
  'خرسانة': 0.03,
  'حديد تسليح': 0.07,
  'أسمنت': 0.05,
  'بلاط': 0.08,
  'سيراميك': 0.10,
  'بورسلين': 0.08,
  'دهان': 0.05,
  'جبس بورد': 0.08,
  'طوب': 0.05,
  'رمل': 0.10,
  'زلط': 0.05,
  'مواسير': 0.05,
  'أسلاك': 0.05,
  'زجاج': 0.05,
};

function getAll() {
  const db = getDb();
  return db.prepare('SELECT * FROM knowledge_items WHERE is_active = 1 ORDER BY category, name_ar').all();
}

function getById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(id);
}

function getByCategory(category) {
  const db = getDb();
  return db.prepare('SELECT * FROM knowledge_items WHERE category = ? AND is_active = 1 ORDER BY name_ar').all(category);
}

function getByPhase(phase) {
  const db = getDb();
  return db.prepare('SELECT * FROM knowledge_items WHERE phase = ? AND is_active = 1 ORDER BY name_ar').all(phase);
}

function searchByName(query) {
  const db = getDb();
  const like = `%${query}%`;
  return db.prepare('SELECT * FROM knowledge_items WHERE (name_ar LIKE ? OR name_en LIKE ?) AND is_active = 1 ORDER BY name_ar').all(like, like);
}

function getRelatedItems(itemId) {
  const db = getDb();
  const item = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(itemId);
  if (!item) return [];
  let relatedIds;
  try {
    relatedIds = JSON.parse(item.related_items);
  } catch {
    relatedIds = [];
  }
  if (!Array.isArray(relatedIds) || relatedIds.length === 0) return [];
  const placeholders = relatedIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM knowledge_items WHERE id IN (${placeholders}) AND is_active = 1`).all(...relatedIds);
}

function getTypicalWasteRate(itemId) {
  const db = getDb();
  const item = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(itemId);
  if (!item) return null;
  if (item.typical_waste != null) return item.typical_waste;
  for (const [key, rate] of Object.entries(wasteRates)) {
    if (item.name_ar.includes(key)) return rate;
  }
  return 0.05;
}

function getItemRelationships() {
  return { ...itemRelationships };
}

function suggestRelatedByItemName(itemName) {
  const results = [];
  for (const [item, related] of Object.entries(itemRelationships)) {
    if (itemName.includes(item) || item.includes(itemName)) {
      results.push(...related);
    }
  }
  for (const [item, related] of Object.entries(itemRelationships)) {
    for (const rel of related) {
      if (itemName.includes(rel) || rel.includes(itemName)) {
        if (!results.includes(item)) results.push(item);
      }
    }
  }
  return [...new Set(results)];
}

function classifyItems(itemNames) {
  const basic = [];
  const necessary = [];
  const related = [];
  const optional = [];
  for (const name of itemNames) {
    if (!name) continue;
    const n = name.trim();
    if (isBasicItem(n)) basic.push(n);
    else if (isNecessaryItem(n)) necessary.push(n);
    else if (isRelatedItem(n)) related.push(n);
    else optional.push(n);
  }
  return { basic, necessary, related, optional };
}

function isBasicItem(name) {
  if (!name || typeof name !== 'string') return false;
  const basicKeywords = [
    'خرسانة', 'حديد', 'أسمنت', 'رمل', 'زلط', 'طوب', 'بلوك',
    'بلاط', 'سيراميك', 'بورسلين', 'دهان', 'جير', 'جبس', 'معجون',
    'عظم', 'بناء', 'صب',
  ];
  for (const kw of basicKeywords) {
    if (name.includes(kw)) return true;
  }
  return false;
}

function isNecessaryItem(name) {
  if (!name || typeof name !== 'string') return false;
  const necessaryKeywords = [
    'سباكة', 'كهرباء', 'تمديدات', 'مواسير', 'أسلاك', 'تكييف',
    'عوازل', 'لاصق', 'ترويبة', 'وزرة', 'سيلر', 'بروفيل',
    'علب', 'قواطع', 'مفاتيح', 'أفياش', 'خلاطات', 'مغاسل',
    'أبواب', 'شبابيك', 'مطابخ', 'أرضيات',
  ];
  for (const kw of necessaryKeywords) {
    if (name.includes(kw)) return true;
  }
  return false;
}

function isRelatedItem(name) {
  if (!name || typeof name !== 'string') return false;
  const relatedKeywords = [
    'نجارة', 'زجاج', 'مرايا', 'ستائر', 'كروم', 'ألمنيوم',
    'إطارات', 'مفصلات', 'أقفال', 'واجهات', 'حجر',
    'ورق جدران', 'برادي', 'مظلات', 'سواتر',
  ];
  for (const kw of relatedKeywords) {
    if (name.includes(kw)) return true;
  }
  return false;
}

function getSectionTemplates() {
  return { ...sectionTemplates };
}

function getCategories() {
  const db = getDb();
  return db.prepare('SELECT DISTINCT category FROM knowledge_items WHERE is_active = 1 ORDER BY category').all().map(r => r.category);
}

function getPhases() {
  const db = getDb();
  return db.prepare('SELECT DISTINCT phase FROM knowledge_items WHERE is_active = 1 AND phase IS NOT NULL ORDER BY phase').all().map(r => r.phase);
}

function create(data) {
  const db = getDb();
  const id = uuidv4();
  const code = data.code || `ITEM-${Date.now()}`;
  const relatedItems = typeof data.related_items === 'string' ? data.related_items : JSON.stringify(data.related_items || []);
  const suggestedSections = typeof data.suggested_sections === 'string' ? data.suggested_sections : JSON.stringify(data.suggested_sections || []);
  db.prepare(`
    INSERT INTO knowledge_items (id, code, name_ar, name_en, category, parent_id, unit, description, typical_waste, related_items, suggested_sections, phase)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, code, data.name_ar, data.name_en || null, data.category, data.parent_id || null, data.unit, data.description || null, data.typical_waste ?? 0.05, relatedItems, suggestedSections, data.phase || null);
  return db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(id);
}

function update(id, data) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(id);
  if (!existing) return null;
  const fields = [];
  const values = [];
  for (const key of ['name_ar', 'name_en', 'category', 'parent_id', 'unit', 'description', 'phase', 'code']) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (data.typical_waste !== undefined) {
    fields.push('typical_waste = ?');
    values.push(data.typical_waste);
  }
  if (data.related_items !== undefined) {
    fields.push('related_items = ?');
    values.push(typeof data.related_items === 'string' ? data.related_items : JSON.stringify(data.related_items));
  }
  if (data.suggested_sections !== undefined) {
    fields.push('suggested_sections = ?');
    values.push(typeof data.suggested_sections === 'string' ? data.suggested_sections : JSON.stringify(data.suggested_sections));
  }
  if (data.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(data.is_active ? 1 : 0);
  }
  if (fields.length === 0) return existing;
  values.push(id);
  db.prepare(`UPDATE knowledge_items SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(id);
}

function remove(id) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(id);
  if (!existing) return null;
  db.prepare('UPDATE knowledge_items SET is_active = 0 WHERE id = ?').run(id);
  return existing;
}

module.exports = {
  getAll,
  getById,
  getByCategory,
  getByPhase,
  searchByName,
  getRelatedItems,
  getTypicalWasteRate,
  getItemRelationships,
  suggestRelatedByItemName,
  classifyItems,
  getSectionTemplates,
  getCategories,
  getPhases,
  create,
  update,
  remove,
  isBasicItem,
  isNecessaryItem,
  isRelatedItem,
};
