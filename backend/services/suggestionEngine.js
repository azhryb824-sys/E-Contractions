const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const kb = require('./knowledgeBase');

if (typeof kb.isBasicItem !== 'function') {
  throw new TypeError('KnowledgeBase initialization failed: isBasicItem is not a function. Check knowledgeBase.js exports.');
}
if (typeof kb.isNecessaryItem !== 'function') {
  throw new TypeError('KnowledgeBase initialization failed: isNecessaryItem is not a function.');
}
if (typeof kb.isRelatedItem !== 'function') {
  throw new TypeError('KnowledgeBase initialization failed: isRelatedItem is not a function.');
}

const projectTypeItems = {
  'شقة': [
    { name: 'بلاط وسيراميك', reason: 'أساسي لتشطيب شقة سكنية' },
    { name: 'دهان جدران', reason: 'أساسي لدهان الشقة' },
    { name: 'تمديدات كهرباء', reason: 'ضروري لتوصيل الكهرباء' },
    { name: 'تمديدات سباكة', reason: 'ضروري لتوصيل المياه والصرف' },
    { name: 'جبس بورد أسقف', reason: 'لإنهاء الأسقف' },
    { name: 'أبواب داخلية', reason: 'ضروري لتركيب الأبواب' },
    { name: 'مطبخ', reason: 'أساسي لأي شقة سكنية' },
    { name: 'حمامات', reason: 'أساسي لتجهيز الحمامات' },
  ],
  'فيلا': [
    { name: 'بلاط وبورسلين', reason: 'أساسي للأرضيات في الفيلا' },
    { name: 'دهان جدران', reason: 'لدهان جميع جدران الفيلا' },
    { name: 'تمديدات كهرباء', reason: 'تمديدات كهرباء شاملة' },
    { name: 'تمديدات سباكة', reason: 'شبكة سباكة كاملة' },
    { name: 'تكييف مركزي', reason: 'ضروري لتكييف فيلا' },
    { name: 'عوازل', reason: 'عوازل حرارية ومائية للفيلا' },
    { name: 'جبس بورد', reason: 'أسقف جبس بورد وديكورات' },
    { name: 'واجهات', reason: 'تشطيب واجهات الفيلا' },
    { name: 'أعمال حديقة', reason: 'تشجير وتنسيق حديقة الفيلا' },
    { name: 'مطبخ', reason: 'مطبخ مجهز بالكامل' },
    { name: 'غرف نوم', reason: 'نجارة غرف نوم' },
    { name: 'حمامات', reason: 'تجهيز حمامات فاخرة' },
  ],
  'مبنى تجاري': [
    { name: 'واجهات زجاجية', reason: 'تشطيب واجهات المبنى التجاري' },
    { name: 'تكييف مركزي', reason: 'نظام تكييف مركزي للمبنى' },
    { name: 'مصاعد', reason: 'تركيب مصاعد للمبنى' },
    { name: 'أنظمة حريق', reason: 'شبكة إنذار وإطفاء حريق' },
    { name: 'كهرباء تجارية', reason: 'تمديدات كهرباء ثلاثية الطور' },
    { name: 'سباكة تجارية', reason: 'شبكة سباكة تجارية' },
    { name: 'أرضيات تجارية', reason: 'أرضيات مناسبة للاستخدام التجاري' },
    { name: 'إنارة', reason: 'أنظمة إنارة تجارية' },
  ],
  'مستودع': [
    { name: 'أرضيات صناعية', reason: 'أرضيات تتحمل الأحمال الثقيلة' },
    { name: 'هياكل معدنية', reason: 'هياكل معدنية للمستودع' },
    { name: 'كهرباء صناعية', reason: 'تمديدات كهرباء صناعية' },
    { name: 'تهوية صناعية', reason: 'أنظمة تهوية للمستودع' },
    { name: 'أنظمة إطفاء', reason: 'أنظمة إطفاء حريق صناعية' },
  ],
  'مكتب': [
    { name: 'فواصل زجاجية', reason: 'فواصل زجاجية للمكاتب' },
    { name: 'إنارة مكتبية', reason: 'أنظمة إنارة للمكاتب' },
    { name: 'تكييف', reason: 'تكييف مناسب للمكاتب' },
    { name: 'أرضيات', reason: 'أرضيات مكتبية مناسبة' },
    { name: 'دهان', reason: 'دهان جدران المكاتب' },
  ],
};

const finishLevelItems = {
  'اقتصادي': ['دهان عادي', 'بلاط عادي', 'سيراميك عادي', 'أبواب عادية', 'مطبخ عادي', 'مواصفات قياسية'],
  'متوسط': ['دهان جدران', 'بلاط', 'سيراميك', 'بورسلين', 'جبس بورد', 'دهان زيتي', 'أبواب خشب', 'مطبخ متوسط'],
  'جيد': ['دهان أكريليك', 'بورسلين فاخر', 'جرانيت', 'جبس بورد ديكور', 'أبواب خشب فاخر', 'مطبخ راقي', 'كروم فاخر', 'عوازل حرارية'],
  'فاخر': [
    'رخام', 'جرانيت', 'دهانات ديكورية فاخرة', 'أبواب خشب زان', 'مطبخ إيطالي',
    'غرف نوم مودرن', 'واجهات حجر', 'زجاج سيكوريت', 'ألمنيوم فاخر', 'أنظمة أمان',
    'حمامات جاكوزي', 'تدفئة أرضية', 'ستائر كهربائية', 'نظام صوتي', 'أنظمة أتمتة',
  ],
};

const buildingTypeItems = {
  'هيكل خرساني': { items: ['خرسانة جاهزة', 'حديد تسليح', 'طوب بناء', 'أسمنت'], reason: 'أساسيات الهيكل الخرساني' },
  'هيكل حديدي': { items: ['حديد إنشائي', 'أسياخ حديد', 'لحام', 'طوب بناء'], reason: 'أساسيات الهيكل الحديدي' },
  'هيكل مختلط': { items: ['خرسانة جاهزة', 'حديد تسليح', 'حديد إنشائي', 'طوب بناء'], reason: 'أساسيات الهيكل المختلط' },
};

function suggest({ projectDescription, projectType, buildingType, finishLevel, existingItems = [], existingItemIds = [], mode = 'show_before_add' }) {
  const db = getDb();
  const suggestions = [];
  const existingNames = existingItems.map(i => (typeof i === 'string' ? i : i.name_ar || i.name || '')).filter(Boolean);
  const existingIdSet = new Set(existingItemIds.map(id => (typeof id === 'string' ? id : id)));

  const knownItems = db.prepare('SELECT * FROM knowledge_items WHERE is_active = 1').all();
  const knownItemMap = {};
  for (const ki of knownItems) {
    knownItemMap[ki.name_ar] = ki;
  }

  function classifySuggestion(name) {
    const n = name.trim();
    if (kb.isBasicItem(n)) return 'أساسي';
    if (kb.isNecessaryItem(n)) return 'ضروري';
    if (kb.isRelatedItem(n)) return 'مرتبط';
    return 'موصى_به';
  }

  function isAlreadyAdded(name) {
    for (const en of existingNames) {
      if (en.includes(name) || name.includes(en)) return true;
    }
    return false;
  }

  function addSuggestion(name, reason, classification) {
    if (isAlreadyAdded(name)) return;
    for (const s of suggestions) {
      if (s.name === name) return;
    }
    const ki = knownItemMap[name];
    suggestions.push({
      id: uuidv4(),
      name,
      item_id: ki ? ki.id : null,
      reason: reason || '',
      classification: classification || classifySuggestion(name),
      category: ki ? ki.category : 'عام',
      unit: ki ? ki.unit : null,
      confidence: ki ? 0.9 : 0.5,
    });
  }

  if (projectType && projectTypeItems[projectType]) {
    for (const item of projectTypeItems[projectType]) {
      addSuggestion(item.name, item.reason, 'أساسي');
    }
  }

  if (buildingType && buildingTypeItems[buildingType]) {
    const bt = buildingTypeItems[buildingType];
    for (const item of bt.items) {
      addSuggestion(item, bt.reason, 'أساسي');
    }
  }

  if (finishLevel && finishLevelItems[finishLevel]) {
    for (const item of finishLevelItems[finishLevel]) {
      const classification = classifySuggestion(item);
      const reason = finishLevel === 'فاخر' ? 'موصى به للتشطيب الفاخر' :
                     finishLevel === 'جيد' ? 'موصى به للتشطيب الجيد' :
                     finishLevel === 'متوسط' ? 'يناسب التشطيب المتوسط' :
                     'خيار اقتصادي مناسب';
      addSuggestion(item, reason, classification);
    }
  }

  for (const existingName of existingNames) {
    const related = kb.suggestRelatedByItemName(existingName);
    for (const relName of related) {
      addSuggestion(relName, `مرتبط بـ ${existingName}`, 'مرتبط');
    }
    const ki = knownItemMap[existingName];
    if (ki) {
      let relatedIds;
      try {
        relatedIds = JSON.parse(ki.related_items);
      } catch {
        relatedIds = [];
      }
      if (Array.isArray(relatedIds)) {
        for (const rid of relatedIds) {
          const ri = knownItems.find(k => k.id === rid);
          if (ri) addSuggestion(ri.name_ar, `مرتبط بـ ${ki.name_ar}`, 'مرتبط');
        }
      }
    }
  }

  if (projectDescription) {
    const desc = projectDescription;
    const keywords = {
      'ترميم': { item: 'أعمال هدم وإزالة', reason: 'مطلوب لأعمال الترميم', classification: 'أساسي' },
      'توسعة': { item: 'خرسانة جاهزة', reason: 'مطلوب لأعمال التوسعة', classification: 'أساسي' },
      'سطح': { item: 'عوازل سطح', reason: 'عزل السطح ضروري', classification: 'ضروري' },
      'حديقة': { item: 'أعمال تنسيق حديقة', reason: 'لتنسيق الحديقة', classification: 'اختياري' },
      'مسبح': { item: 'حمام سباحة', reason: 'مطلوب لتنفيذ المسبح', classification: 'ضروري' },
      'مواقف': { item: 'أرضيات مواقف', reason: 'أرضيات مقاومة للمواقف', classification: 'ضروري' },
      'ملحق': { item: 'بناء ملحق', reason: 'أساسي لبناء الملحق', classification: 'أساسي' },
      'ديكورات': { item: 'دهانات ديكورية', reason: 'للديكورات الداخلية', classification: 'تحسين_جودة' },
      'إضاءة': { item: 'أنظمة إضاءة', reason: 'نظام إضاءة متكامل', classification: 'ضروري' },
      'أمن': { item: 'كاميرات مراقبة', reason: 'نظام أمن ومراقبة', classification: 'اختياري' },
      'ذكي': { item: 'أنظمة أتمتة', reason: 'نظام منزل ذكي', classification: 'موصى_به' },
      'صحي': { item: 'عوازل صحية', reason: 'عوازل صحية للحمامات', classification: 'ضروري' },
    };
    for (const [kw, sug] of Object.entries(keywords)) {
      if (desc.includes(kw)) {
        addSuggestion(sug.item, sug.reason, sug.classification);
      }
    }
  }

  const sections = kb.getSectionTemplates();
  if (projectType && sections[projectType]) {
    const template = sections[projectType];
    for (const cat of template.categories) {
      const itemsInCategory = knownItems.filter(k => k.category === cat);
      if (itemsInCategory.length === 0) continue;
      let addedInCategory = 0;
      for (const ki of itemsInCategory) {
        if (!isAlreadyAdded(ki.name_ar)) {
          if (addedInCategory < 2) {
            addSuggestion(ki.name_ar, `مقترح من قسم ${cat}`, classifySuggestion(ki.name_ar));
            addedInCategory++;
          }
        }
      }
    }
  }

  if (!projectType && !buildingType && !finishLevel && existingNames.length === 0) {
    const commonItems = [
      { name: 'خرسانة جاهزة', reason: 'أساسي للمشاريع الإنشائية', classification: 'أساسي' },
      { name: 'حديد تسليح', reason: 'أساسي للهيكل الخرساني', classification: 'أساسي' },
      { name: 'طوب بناء', reason: 'أساسي لأعمال البناء', classification: 'أساسي' },
      { name: 'أسمنت', reason: 'مادة أساسية للبناء', classification: 'أساسي' },
      { name: 'دهان جدران', reason: 'لتشطيب الجدران', classification: 'ضروري' },
      { name: 'تمديدات كهرباء', reason: 'أساسي لأي مشروع', classification: 'أساسي' },
    ];
    for (const item of commonItems) {
      addSuggestion(item.name, item.reason, item.classification);
    }
  }

  const sorted = sortSuggestions(suggestions);

  if (mode === 'no_additions') return { suggestions: [], mode, count: 0 };
  if (mode === 'auto_add') return { suggestions: sorted.filter(s => s.classification !== 'اختياري' && s.classification !== 'يحتمل_تأكيد'), mode, count: sorted.length };
  return { suggestions: sorted, mode, count: sorted.length };
}

function sortSuggestions(suggestions) {
  const order = { 'أساسي': 0, 'ضروري': 1, 'مرتبط': 2, 'موصى_به': 3, 'تحسين_جودة': 4, 'تقليل_مخاطر': 5, 'اختياري': 6, 'يحتاج_تأكيد': 7 };
  return suggestions.sort((a, b) => {
    const oa = order[a.classification] ?? 99;
    const ob = order[b.classification] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name, 'ar');
  });
}

function getSuggestedItemsForProject(projectId, mode = 'show_before_add') {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;

  const items = db.prepare('SELECT * FROM project_items WHERE project_id = ?').all(projectId);
  const existingNames = items.map(i => i.name_ar);

  return suggest({
    projectDescription: project.description,
    projectType: project.project_type,
    buildingType: project.building_type,
    finishLevel: project.finish_level,
    existingItems: existingNames,
    existingItemIds: items.filter(i => i.item_id).map(i => i.item_id),
    mode,
  });
}

function getMissingCriticalItems(projectId) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return [];
  const items = db.prepare('SELECT * FROM project_items WHERE project_id = ?').all(projectId);
  const existingNames = new Set(items.map(i => i.name_ar));

  const result = suggest({
    projectDescription: project.description,
    projectType: project.project_type,
    buildingType: project.building_type,
    finishLevel: project.finish_level,
    existingItems: [...existingNames],
    mode: 'show_before_add',
  });

  const critical = result.suggestions.filter(s => s.classification === 'أساسي' || s.classification === 'ضروري');
  return critical;
}

module.exports = {
  suggest,
  getSuggestedItemsForProject,
  getMissingCriticalItems,
};
