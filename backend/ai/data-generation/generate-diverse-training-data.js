const fs = require('fs');
const path = require('path');

const TRAINING_DIR = path.join(__dirname, '..', 'data', 'training');
const PROJECTS_DIR = path.join(__dirname, '..', 'data', 'projects');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

// ============================================================
// 1. PROJECT UNDERSTANDING EXAMPLES (1,500+)
// ============================================================
function generateUnderstandingExamples(count) {
  const examples = [];
  const formalPhrases = [
    '{rooms} غرف و{bathrooms} حمامات ومطبخ بمساحة {area} متر',
    'مشروع سكني مكون من {rooms} غرف نوم و{bathrooms} دورة مياه وصالة',
    'فيلا مساحتها {area} متر مربع تحتوي على {rooms} غرف و{bathrooms} حمام',
    'شقة للتمليك {rooms} غرف {bathrooms} حمامات صالة ومطبخ',
    'عمارة سكنية {floors} أدوار مساحة الدور {area} متر',
    '{building_type} مساحة {area} م٢ عدد الغرف {rooms} دورات المياه {bathrooms}',
  ];
  const colloquialPhrases = [
    '{rooms} غرف و{bathrooms} حمام ومطبخ المساحة {area} متر',
    'عندي {rooms} غرف و{bathrooms} حمامات عايز تشطيب',
    'بيت {rooms} غرف وحمامين وصالة المساحة {area}',
    '{rooms} غرف نوم و{bathrooms} دورة مياه المساحة التقريبية {area}',
  ];
  const typoPhrases = [
    '{rooms} غرف و{bathrooms} حممات ومساحة {area} متر',
    'شقه {rooms} غرفف و{bathrooms} حمامات',
    'فيلا {area} متر {rooms} غرفف {bathrooms} حممات',
  ];
  const numberWordsPhrases = [
    '{rooms_word} غرف و{bathrooms_word} حمامات ومطبخ مساحة {area_word} متر',
    'مشروع من {rooms_word} غرف و{bathrooms_word} حمامات',
  ];
  const incompletePhrases = [
    '{rooms} غرف وحمامين',
    'مساحة {area} متر',
    'فيلا دورين',
    'غرفتين وصالة وحمام',
    'شقة {rooms} غرف',
  ];
  const specificScopePhrases = [
    'تشطيب {building_type} قائمة {rooms} غرف {bathrooms} حمامات',
    'إنشاء {building_type} جديد مساحة {area} {rooms} غرف',
    'ترميم {building_type} قديمة {rooms} غرف {bathrooms} حمامات',
    'كهرباء فقط لـ {building_type} {rooms} غرف',
    'سباكة {building_type} {rooms} غرف {bathrooms} حمام',
    'دهانات {building_type} {rooms} غرف',
    'تشطيب كامل {building_type} {rooms} غرف {bathrooms} حمامات',
  ];

  const buildingTypes = ['شقة', 'فيلا', 'منزل', 'محل', 'مكتب', 'عمارة'];
  const numberWords = {
    1: 'واحد', 2: 'اثنتين', 3: 'ثلاث', 4: 'أربع', 5: 'خمس',
    6: 'ست', 7: 'سبع', 8: 'ثمان', 9: 'تسع', 10: 'عشر'
  };

  for (let i = 0; i < count; i++) {
    const rooms = 1 + Math.floor(Math.random() * 8);
    const bathrooms = 1 + Math.floor(Math.random() * 5);
    const area = 80 + Math.floor(Math.random() * 520);
    const floors = 1 + Math.floor(Math.random() * 4);
    const buildingType = buildingTypes[Math.floor(Math.random() * buildingTypes.length)];
    const kitchen = 1;

    let phrasePool;
    const r = Math.random();
    if (r < 0.3) phrasePool = formalPhrases;
    else if (r < 0.5) phrasePool = colloquialPhrases;
    else if (r < 0.6) phrasePool = typoPhrases;
    else if (r < 0.65) phrasePool = numberWordsPhrases;
    else if (r < 0.75) phrasePool = incompletePhrases;
    else phrasePool = specificScopePhrases;

    const template = phrasePool[Math.floor(Math.random() * phrasePool.length)];
    let input = template
      .replace('{rooms}', rooms)
      .replace('{bathrooms}', bathrooms)
      .replace('{area}', area)
      .replace('{floors}', floors)
      .replace('{building_type}', buildingType)
      .replace('{kitchen}', kitchen)
      .replace('{rooms_word}', numberWords[rooms] || rooms.toString())
      .replace('{bathrooms_word}', numberWords[bathrooms] || bathrooms.toString())
      .replace('{area_word}', area >= 1000 ? 'ألف' : (numberWords[area] || area.toString()));

    // Determine output based on whether scope is included
    const hasScope = /تشطيب|إنشاء|ترميم|كهرباء|سباكة|دهان/.test(input);
    const output = {
      explicit_values: {},
      missing_information: []
    };

    // Extract explicit values from input
    if (/\d+\s*متر/.test(input) || /\d+\s*م٢/.test(input) || /\d+\s*م\.?2/.test(input)) {
      const m = input.match(/(\d+)\s*م/);
      if (m) output.explicit_values.area = parseInt(m[1]);
    }
    const roomM = input.match(/(\d+)\s*غرف/);
    if (roomM) output.explicit_values.room_count = parseInt(roomM[1]);

    const bathM = input.match(/(\d+)\s*حم/);
    if (bathM) output.explicit_values.bathroom_count = parseInt(bathM[1]);

    if (/\d+\s*أدوار|\d+\s*دور/.test(input)) {
      const fM = input.match(/(\d+)\s*دور/);
      if (fM) output.explicit_values.floor_count = parseInt(fM[1]);
    }

    if (buildingTypes.some(bt => input.includes(bt))) {
      for (const bt of buildingTypes) {
        if (input.includes(bt)) {
          output.building_type = { value: bt, confidence: 0.7, requires_confirmation: true, reason: `ذكر ${bt}` };
          break;
        }
      }
    }

    // Scope handling
    if (hasScope) {
      let scopeValue = '';
      if (/تشطيب.*كامل|تشطيب.*قائم/.test(input)) scopeValue = 'تشطيب كامل';
      else if (/إنشاء/.test(input) || /جديد/.test(input)) scopeValue = 'إنشاء كامل';
      else if (/ترميم/.test(input)) scopeValue = 'ترميم شامل';
      else if (/كهرباء/.test(input) && !/سباكة/.test(input)) scopeValue = 'كهرباء فقط';
      else if (/سباكة/.test(input) && !/كهرباء/.test(input)) scopeValue = 'سباكة فقط';
      else if (/دهان/.test(input)) scopeValue = 'دهانات فقط';
      output.explicit_values.scope = scopeValue;
      output.status = 'ready';
    } else {
      output.status = 'awaiting_scope_confirmation';
      output.needs_scope_confirmation = true;
      output.missing_information.push('نطاق العمل');
    }

    if (!output.explicit_values.area && !/مساحة/.test(input)) {
      output.missing_information.push('المساحة');
    }
    if (!output.explicit_values.room_count) {
      output.missing_information.push('عدد الغرف');
    }
    if (!output.explicit_values.bathroom_count) {
      output.missing_information.push('عدد الحمامات');
    }

    examples.push({
      input,
      output,
      source_type: 'synthetic_seed',
      engineering_reviewed: false,
      approved_for_production: false
    });
  }
  return examples;
}

// ============================================================
// 2. SCOPE CLASSIFICATION EXAMPLES (1,000+)
// ============================================================
function generateScopeExamples(count) {
  const examples = [];
  const scopes = [
    {
      scope: 'تشطيب كامل',
      phrases: ['تشطيب', 'تشطيب كامل', 'تشطيب شقة', 'تشطيب فيلا', 'تشطيب فاخر', 'تشطيبات داخلية'],
      allowed: ['SEC-FLR','SEC-PNT','SEC-CLG','SEC-WOD','SEC-ALM','SEC-ELC','SEC-PLM','SEC-HVAC','SEC-OPR'],
      forbidden: ['SEC-EXC','SEC-CON','SEC-BLK']
    },
    {
      scope: 'إنشاء كامل',
      phrases: ['إنشاء', 'بناء جديد', 'من الصفر', 'إنشاء كامل', 'بناء'], 
      allowed: ['SEC-PRE','SEC-EXC','SEC-CON','SEC-BLK','SEC-PLA','SEC-INS','SEC-FLR','SEC-PNT','SEC-ELC','SEC-PLM','SEC-HVAC','SEC-OPR'],
      forbidden: []
    },
    {
      scope: 'كهرباء فقط',
      phrases: ['كهرباء', 'تمديدات كهرباء', 'كهرباء فقط', 'أسلاك'],
      allowed: ['SEC-ELC','SEC-LIG','SEC-OPR'],
      forbidden: ['SEC-PLM','SEC-FLR','SEC-CON','SEC-PNT']
    },
    {
      scope: 'سباكة فقط',
      phrases: ['سباكة', 'تمديدات سباكة', 'سباكة فقط', 'مياه وصرف'],
      allowed: ['SEC-PLM','SEC-INS','SEC-OPR'],
      forbidden: ['SEC-ELC','SEC-FLR','SEC-CON']
    },
    {
      scope: 'دهانات فقط',
      phrases: ['دهان', 'دهانات', 'بوية', 'طلاء'],
      allowed: ['SEC-PNT','SEC-OPR'],
      forbidden: ['SEC-FLR','SEC-PLM','SEC-ELC']
    },
    {
      scope: 'ترميم شامل',
      phrases: ['ترميم', 'ترميم شامل', 'تجديد', 'إعادة تأهيل'],
      allowed: ['SEC-DEM','SEC-PLA','SEC-INS','SEC-FLR','SEC-PNT','SEC-ELC','SEC-PLM','SEC-HVAC','SEC-OPR'],
      forbidden: ['SEC-EXC','SEC-CON','SEC-BLK']
    }
  ];

  for (let i = 0; i < count; i++) {
    const scopeDef = scopes[Math.floor(Math.random() * scopes.length)];
    const phrase = scopeDef.phrases[Math.floor(Math.random() * scopeDef.phrases.length)];
    const input = `${scopeDef.scope === 'كهرباء فقط' || scopeDef.scope === 'سباكة فقط' || scopeDef.scope === 'دهانات فقط'
      ? '' : scopeDef.scope}
      ${phrase} ${Math.random() > 0.5 ? `لمشروع ${['سكني','تجاري','مكتبي'][Math.floor(Math.random()*3)]}` : ''}`.trim();

    examples.push({
      input,
      scope: scopeDef.scope,
      allowed_sections: scopeDef.allowed,
      forbidden_sections: scopeDef.forbidden,
      source_type: 'synthetic_seed',
      engineering_reviewed: false,
      approved_for_production: false
    });
  }
  return examples;
}

// ============================================================
// 3. ITEM PREDICTION EXAMPLES (1,500+)
// ============================================================
function generateItemExamples(count) {
  const examples = [];
  const buildingScopes = [
    { building_type: 'شقة', scope: 'تشطيب كامل', rooms: 3, bathrooms: 2, required_sections: ['SEC-FLR','SEC-PNT','SEC-ELC','SEC-PLM'] },
    { building_type: 'فيلا', scope: 'إنشاء كامل', rooms: 5, bathrooms: 4, required_sections: ['SEC-CON','SEC-EXC','SEC-BLK','SEC-FLR','SEC-ELC','SEC-PLM'] },
    { building_type: 'محل', scope: 'كهرباء فقط', rooms: 2, bathrooms: 1, required_sections: ['SEC-ELC','SEC-LIG'] },
    { building_type: 'شقة', scope: 'سباكة فقط', rooms: 3, bathrooms: 2, required_sections: ['SEC-PLM'] },
    { building_type: 'منزل', scope: 'دهانات فقط', rooms: 4, bathrooms: 2, required_sections: ['SEC-PNT'] },
    { building_type: 'فيلا', scope: 'ترميم شامل', rooms: 5, bathrooms: 4, required_sections: ['SEC-DEM','SEC-FLR','SEC-PNT','SEC-ELC','SEC-PLM'] },
    { building_type: 'شقة', scope: 'تشطيب كامل', rooms: 2, bathrooms: 1, required_sections: ['SEC-FLR','SEC-PNT','SEC-ELC','SEC-PLM'] },
    { building_type: 'عمارة', scope: 'إنشاء كامل', rooms: 4, bathrooms: 3, required_sections: ['SEC-CON','SEC-EXC','SEC-BLK','SEC-ELC','SEC-PLM'] },
  ];

  for (let i = 0; i < count; i++) {
    const t = buildingScopes[Math.floor(Math.random() * buildingScopes.length)];
    const rooms = t.rooms + Math.floor(Math.random() * 4);
    const bathrooms = t.bathrooms + Math.floor(Math.random() * 2);

    const input = {
      building_type: t.building_type,
      scope: t.scope,
      room_count: rooms,
      bathroom_count: bathrooms,
      area: 100 + Math.floor(Math.random() * 400)
    };

    const sections = t.required_sections.length > 0 ? t.required_sections : ['SEC-OPR'];

    examples.push({
      input,
      required_sections: sections,
      source_type: 'synthetic_seed',
      engineering_reviewed: false,
      approved_for_production: false
    });
  }
  return examples;
}

// ============================================================
// 4. NEGATIVE EXAMPLES (1,000+)
// ============================================================
function generateNegativeExamples(count) {
  const examples = [];
  const rules = [
    { desc: 'أعمال إنشائية في تشطيب', scope: 'تشطيب كامل', forbidden: ['حفر الأساسات','خرسانة الأساسات','حديد تسليح الهيكل'], reason: 'المبنى قائم' },
    { desc: 'سباكة في نطاق كهرباء', scope: 'كهرباء فقط', forbidden: ['أعمال السباكة','البلاط','الخرسانة'], reason: 'خارج النطاق' },
    { desc: 'عدد 2 حمام لا يعطي 3 أدوات', bathrooms: 2, rule: 'لا يتغير عدد الأدوات الصحية إذا لم يتغير عدد الحمامات' },
    { desc: 'لوحة توزيع زائدة لدور واحد', floors: 1, rule: 'لا تتجاوز لوحة التوزيع الأساسية لوحة واحدة دون مبرر تصميمي' },
    { desc: 'كمية كسرية في وحدة عدد', unit: 'عدد', rule: 'يمنع إخراج كمية كسرية' },
    { desc: 'نظام بكمية كسرية', unit: 'نظام', rule: 'يمنع إخراج كمية كسرية' },
    { desc: 'بدون نطاق', scope: null, rule: 'يجب سؤال المستخدم عن النطاق قبل توقع الأقسام' },
    { desc: 'بند إنشائي دون مخططات', drawings: false, item_type: 'structural', rule: 'لا تعط ثقة عالية لكميات إنشائية' },
    { desc: 'بند فاخر في اقتصادي', finish: 'اقتصادي', optional: ['رخام فاخر','منزل ذكي','ديكورات معقدة'], rule: 'لا تضف بنوداً فاخرة تلقائياً' },
    { desc: 'تكييف بحمل حراري غير محسوب', rule: 'لا تعرض سعة مؤكدة دون حساب حمل حراري' },
    { desc: 'سعر مولّد في النموذج', rule: 'الأسعار تجلب من قاعدة الأسعار، لا تُولّد' },
    { desc: 'ثقة ثابتة 95%', rule: 'لا يوجد بند بثقة 95% دون مبرر' },
  ];

  for (let i = 0; i < count; i++) {
    const rule = rules[Math.floor(Math.random() * rules.length)];
    examples.push({
      input: {
        scope: rule.scope || (Math.random() > 0.5 ? 'تشطيب كامل' : 'إنشاء كامل'),
        bathroom_count: rule.bathrooms || 2,
        floor_count: rule.floors || 1,
        drawings_available: false,
        finish_level: rule.finish || 'جيد'
      },
      rule: rule.rule,
      reason: rule.reason || '',
      forbidden: rule.forbidden || [],
      source_type: 'synthetic_seed',
      engineering_reviewed: false,
      approved_for_production: false
    });
  }
  return examples;
}

// ============================================================
// MAIN
// ============================================================
function saveJSONL(data, filepath) {
  const lines = data.map(d => JSON.stringify(d)).join('\n');
  fs.writeFileSync(filepath, lines, 'utf-8');
  console.log(`  ✅ ${filepath}: ${data.length} examples`);
}

console.log('📦 Generating diverse training data...\n');

ensureDir(TRAINING_DIR);

const understanding = generateUnderstandingExamples(1500);
saveJSONL(understanding, path.join(TRAINING_DIR, 'project-understanding.jsonl'));

const scope = generateScopeExamples(1000);
saveJSONL(scope, path.join(TRAINING_DIR, 'scope-classification.jsonl'));

const items = generateItemExamples(1500);
saveJSONL(items, path.join(TRAINING_DIR, 'item-prediction.jsonl'));

const negative = generateNegativeExamples(1000);
saveJSONL(negative, path.join(TRAINING_DIR, 'negative-examples.jsonl'));

const total = understanding.length + scope.length + items.length + negative.length;
console.log(`\n📊 Total: ${total} training examples generated`);
console.log('   All data is synthetic_seed, not approved for production.\n');
