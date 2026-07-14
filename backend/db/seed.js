const { getDb } = require('./database');
const { v4: uuidv4 } = require('uuid');

const db = getDb();

const KNOWLEDGE_ITEMS = [
  // أعمال الحفر والردم
  { code: 'EXC-001', name_ar: 'حفر أساسات', category: 'أعمال_حفر', unit: 'م3', typical_waste: 0.05, phase: 'أساسيات' },
  { code: 'EXC-002', name_ar: 'ردم حول الأساسات', category: 'أعمال_حفر', unit: 'م3', typical_waste: 0.1, phase: 'أساسيات' },
  { code: 'EXC-003', name_ar: 'نقل المخلفات', category: 'أعمال_حفر', unit: 'م3', typical_waste: 0, phase: 'أساسيات' },
  { code: 'EXC-004', name_ar: 'تسوية الموقع', category: 'أعمال_حفر', unit: 'م2', typical_waste: 0, phase: 'أساسيات' },
  { code: 'EXC-005', name_ar: 'دمك التربة', category: 'أعمال_حفر', unit: 'م2', typical_waste: 0, phase: 'أساسيات' },

  // أعمال الخرسانة
  { code: 'CON-001', name_ar: 'خرسانة عادية', category: 'أعمال_خرسانة', unit: 'م3', typical_waste: 0.03, phase: 'هيكل' },
  { code: 'CON-002', name_ar: 'خرسانة مسلحة', category: 'أعمال_خرسانة', unit: 'م3', typical_waste: 0.03, phase: 'هيكل' },
  { code: 'CON-003', name_ar: 'حديد تسليح', category: 'أعمال_خرسانة', unit: 'كجم', typical_waste: 0.05, phase: 'هيكل' },
  { code: 'CON-004', name_ar: 'صبة نظافة', category: 'أعمال_خرسانة', unit: 'م3', typical_waste: 0.02, phase: 'أساسيات' },
  { code: 'CON-005', name_ar: 'قواعد', category: 'أعمال_خرسانة', unit: 'م3', typical_waste: 0.03, phase: 'أساسيات' },
  { code: 'CON-006', name_ar: 'رقاب الأعمدة', category: 'أعمال_خرسانة', unit: 'م3', typical_waste: 0.03, phase: 'هيكل' },
  { code: 'CON-007', name_ar: 'أعمدة', category: 'أعمال_خرسانة', unit: 'م3', typical_waste: 0.03, phase: 'هيكل' },
  { code: 'CON-008', name_ar: 'جسور', category: 'أعمال_خرسانة', unit: 'م3', typical_waste: 0.03, phase: 'هيكل' },
  { code: 'CON-009', name_ar: 'سقف', category: 'أعمال_خرسانة', unit: 'م3', typical_waste: 0.03, phase: 'هيكل' },
  { code: 'CON-010', name_ar: 'سلالم', category: 'أعمال_خرسانة', unit: 'م3', typical_waste: 0.03, phase: 'هيكل' },
  { code: 'CON-011', name_ar: 'بلوك أسمنتي', category: 'أعمال_خرسانة', unit: 'م2', typical_waste: 0.05, phase: 'هيكل' },

  // أعمال الطوب والبناء
  { code: 'BLK-001', name_ar: 'طوب أحمر 20 سم', category: 'أعمال_بناء', unit: 'م2', typical_waste: 0.05, phase: 'هيكل' },
  { code: 'BLK-002', name_ar: 'طوب أحمر 10 سم', category: 'أعمال_بناء', unit: 'م2', typical_waste: 0.05, phase: 'هيكل' },
  { code: 'BLK-003', name_ar: 'بلوك أسمنتي 20 سم', category: 'أعمال_بناء', unit: 'م2', typical_waste: 0.05, phase: 'هيكل' },
  { code: 'BLK-004', name_ar: 'ملاط أسمنتي', category: 'أعمال_بناء', unit: 'م3', typical_waste: 0.1, phase: 'هيكل' },

  // أعمال اللياسة
  { code: 'PLA-001', name_ar: 'لياسة داخلية', category: 'أعمال_لياسة', unit: 'م2', typical_waste: 0.1, phase: 'تشطيب' },
  { code: 'PLA-002', name_ar: 'لياسة خارجية', category: 'أعمال_لياسة', unit: 'م2', typical_waste: 0.1, phase: 'تشطيب' },
  { code: 'PLA-003', name_ar: 'طرطشة', category: 'أعمال_لياسة', unit: 'م2', typical_waste: 0.1, phase: 'تشطيب' },

  // أعمال الأرضيات
  { code: 'FLR-001', name_ar: 'تجهيز سطح الأرضية', category: 'أعمال_أرضيات', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'FLR-002', name_ar: 'تسوية الأرضيات', category: 'أعمال_أرضيات', unit: 'م2', typical_waste: 0.08, phase: 'تشطيب' },
  { code: 'FLR-003', name_ar: 'عزل أرضيات', category: 'أعمال_أرضيات', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'FLR-004', name_ar: 'بلاط سيراميك', category: 'أعمال_أرضيات', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'FLR-005', name_ar: 'بلاط بورسلين', category: 'أعمال_أرضيات', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'FLR-006', name_ar: 'لاصق بلاط', category: 'أعمال_أرضيات', unit: 'كجم', typical_waste: 0.08, phase: 'تشطيب' },
  { code: 'FLR-007', name_ar: 'ترويبة بلاط', category: 'أعمال_أرضيات', unit: 'كجم', typical_waste: 0.1, phase: 'تشطيب' },
  { code: 'FLR-008', name_ar: 'وزرات', category: 'أعمال_أرضيات', unit: 'م.ط', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'FLR-009', name_ar: 'باركيه', category: 'أعمال_أرضيات', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },

  // أعمال الدهانات
  { code: 'PNT-001', name_ar: 'معالجة الشقوق', category: 'أعمال_دهانات', unit: 'م.ط', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'PNT-002', name_ar: 'صنفرة', category: 'أعمال_دهانات', unit: 'م2', typical_waste: 0, phase: 'تشطيب' },
  { code: 'PNT-003', name_ar: 'معجون', category: 'أعمال_دهانات', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'PNT-004', name_ar: 'دهان أساس', category: 'أعمال_دهانات', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'PNT-005', name_ar: 'دهان داخلي', category: 'أعمال_دهانات', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'PNT-006', name_ar: 'دهان خارجي', category: 'أعمال_دهانات', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'PNT-007', name_ar: 'دهان أسقف', category: 'أعمال_دهانات', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },

  // أعمال الكهرباء
  { code: 'ELC-001', name_ar: 'مواسير كهرباء', category: 'أعمال_كهرباء', unit: 'م.ط', typical_waste: 0.1, phase: 'تشطيب' },
  { code: 'ELC-002', name_ar: 'علب كهرباء', category: 'أعمال_كهرباء', unit: 'عدد', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'ELC-003', name_ar: 'أسلاك كهرباء', category: 'أعمال_كهرباء', unit: 'م.ط', typical_waste: 0.1, phase: 'تشطيب' },
  { code: 'ELC-004', name_ar: 'كابلات', category: 'أعمال_كهرباء', unit: 'م.ط', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'ELC-005', name_ar: 'لوحة توزيع رئيسية', category: 'أعمال_كهرباء', unit: 'عدد', typical_waste: 0, phase: 'تشطيب' },
  { code: 'ELC-006', name_ar: 'قاطع كهربائي', category: 'أعمال_كهرباء', unit: 'عدد', typical_waste: 0, phase: 'تشطيب' },
  { code: 'ELC-007', name_ar: 'مفاتيح كهرباء', category: 'أعمال_كهرباء', unit: 'عدد', typical_waste: 0.03, phase: 'تشطيب' },
  { code: 'ELC-008', name_ar: 'أفياش كهرباء', category: 'أعمال_كهرباء', unit: 'عدد', typical_waste: 0.03, phase: 'تشطيب' },
  { code: 'ELC-009', name_ar: 'نظام تأريض', category: 'أعمال_كهرباء', unit: 'نظام', typical_waste: 0, phase: 'تشطيب' },
  { code: 'ELC-010', name_ar: 'اختبارات كهرباء', category: 'أعمال_كهرباء', unit: 'نظام', typical_waste: 0, phase: 'تشغيل' },

  // أعمال السباكة
  { code: 'PLM-001', name_ar: 'مواسير مياه باردة', category: 'أعمال_سباكة', unit: 'م.ط', typical_waste: 0.1, phase: 'تشطيب' },
  { code: 'PLM-002', name_ar: 'مواسير مياه ساخنة', category: 'أعمال_سباكة', unit: 'م.ط', typical_waste: 0.1, phase: 'تشطيب' },
  { code: 'PLM-003', name_ar: 'مواسير صرف', category: 'أعمال_سباكة', unit: 'م.ط', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'PLM-004', name_ar: 'عزل مواسير', category: 'أعمال_سباكة', unit: 'م.ط', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'PLM-005', name_ar: 'محابس مياه', category: 'أعمال_سباكة', unit: 'عدد', typical_waste: 0, phase: 'تشطيب' },
  { code: 'PLM-006', name_ar: 'مضخة مياه', category: 'أعمال_سباكة', unit: 'عدد', typical_waste: 0, phase: 'تشطيب' },
  { code: 'PLM-007', name_ar: 'خزان مياه', category: 'أعمال_سباكة', unit: 'عدد', typical_waste: 0, phase: 'تشطيب' },
  { code: 'PLM-008', name_ar: 'أدوات صحية', category: 'أعمال_سباكة', unit: 'مجموعة', typical_waste: 0, phase: 'تشطيب' },
  { code: 'PLM-009', name_ar: 'اختبارات سباكة', category: 'أعمال_سباكة', unit: 'نظام', typical_waste: 0, phase: 'تشغيل' },

  // أعمال التكييف
  { code: 'HVAC-001', name_ar: 'مكيف سبليت', category: 'أعمال_تكييف', unit: 'عدد', typical_waste: 0, phase: 'تشطيب' },
  { code: 'HVAC-002', name_ar: 'مكيف مركزي', category: 'أعمال_تكييف', unit: 'نظام', typical_waste: 0, phase: 'تشطيب' },
  { code: 'HVAC-003', name_ar: 'مواسير فريون', category: 'أعمال_تكييف', unit: 'م.ط', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'HVAC-004', name_ar: 'مجاري هواء', category: 'أعمال_تكييف', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'HVAC-005', name_ar: 'عزل حراري', category: 'أعمال_تكييف', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },

  // أعمال الألمنيوم والزجاج
  { code: 'ALM-001', name_ar: 'شبابيك ألمنيوم', category: 'أعمال_ألمنيوم', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'ALM-002', name_ar: 'أبواب ألمنيوم', category: 'أعمال_ألمنيوم', unit: 'عدد', typical_waste: 0, phase: 'تشطيب' },
  { code: 'ALM-003', name_ar: 'زجاج شبابيك', category: 'أعمال_ألمنيوم', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'ALM-004', name_ar: 'واجهات زجاجية', category: 'أعمال_ألمنيوم', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },

  // أعمال النجارة
  { code: 'WOD-001', name_ar: 'أبواب خشب', category: 'أعمال_نجارة', unit: 'عدد', typical_waste: 0, phase: 'تشطيب' },
  { code: 'WOD-002', name_ar: 'إطارات أبواب', category: 'أعمال_نجارة', unit: 'عدد', typical_waste: 0, phase: 'تشطيب' },
  { code: 'WOD-003', name_ar: 'مطبخ خشب', category: 'أعمال_نجارة', unit: 'م.ط', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'WOD-004', name_ar: 'خزائن حائط', category: 'أعمال_نجارة', unit: 'م.ط', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'WOD-005', name_ar: 'ديكورات جبس', category: 'أعمال_نجارة', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },

  // أعمال العزل
  { code: 'INS-001', name_ar: 'عزل مائي للأسطح', category: 'أعمال_عزل', unit: 'م2', typical_waste: 0.08, phase: 'تشطيب' },
  { code: 'INS-002', name_ar: 'عزل حراري للجدران', category: 'أعمال_عزل', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },
  { code: 'INS-003', name_ar: 'عزل صوتي', category: 'أعمال_عزل', unit: 'م2', typical_waste: 0.05, phase: 'تشطيب' },

  // أعمال التشغيل والتسليم
  { code: 'OPR-001', name_ar: 'تشغيل كهرباء', category: 'تشغيل_وتسليم', unit: 'نظام', typical_waste: 0, phase: 'تشغيل' },
  { code: 'OPR-002', name_ar: 'تشغيل سباكة', category: 'تشغيل_وتسليم', unit: 'نظام', typical_waste: 0, phase: 'تشغيل' },
  { code: 'OPR-003', name_ar: 'تشغيل تكييف', category: 'تشغيل_وتسليم', unit: 'نظام', typical_waste: 0, phase: 'تشغيل' },
  { code: 'OPR-004', name_ar: 'تنظيف نهائي', category: 'تشغيل_وتسليم', unit: 'م2', typical_waste: 0, phase: 'تشغيل' },
  { code: 'OPR-005', name_ar: 'تسليم المشروع', category: 'تشغيل_وتسليم', unit: 'نظام', typical_waste: 0, phase: 'تشغيل' },

  // إنارة
  { code: 'LIG-001', name_ar: 'إنارة داخلية', category: 'إنارة', unit: 'عدد', typical_waste: 0.03, phase: 'تشطيب' },
  { code: 'LIG-002', name_ar: 'إنارة خارجية', category: 'إنارة', unit: 'عدد', typical_waste: 0.03, phase: 'تشطيب' },
  { code: 'LIG-003', name_ar: 'أضواء طوارئ', category: 'إنارة', unit: 'عدد', typical_waste: 0, phase: 'تشطيب' },
];

function seed() {
  const insertItem = db.prepare(`
    INSERT OR IGNORE INTO knowledge_items (id, code, name_ar, category, unit, typical_waste, phase)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertSupplier = db.prepare(`
    INSERT OR IGNORE INTO suppliers (id, name, category, phone, email)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO system_settings (key, value)
    VALUES (?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const item of KNOWLEDGE_ITEMS) {
      insertItem.run(uuidv4(), item.code, item.name_ar, item.category, item.unit, item.typical_waste, item.phase);
    }

    insertUser.run(uuidv4(), 'admin', 'admin123', 'مدير النظام', 'admin');
    insertUser.run(uuidv4(), 'engineer', 'eng123', 'مهندس المشروع', 'engineer');

    insertSupplier.run(uuidv4(), 'شركة السلام للتجارة', 'مواد بناء', '0555000111', 'info@alsalam.com');
    insertSupplier.run(uuidv4(), 'مؤسسة الفهد للكهرباء', 'كهرباء', '0555000222', 'info@alfahd.com');
    insertSupplier.run(uuidv4(), 'شركة الصحة للسباكة', 'سباكة', '0555000333', 'info@alseha.com');

    insertSetting.run('profit_margin_default', '0.15');
    insertSetting.run('vat_rate', '0.15');
    insertSetting.run('default_finish_level', 'متوسط');
    insertSetting.run('auto_suggestions', 'true');
    insertSetting.run('show_optional_items', 'true');
  });

  transaction();
  console.log('✅ تم بذر قاعدة البيانات بنجاح');
  console.log(`📦 عدد بنود المعرفة: ${KNOWLEDGE_ITEMS.length}`);
}

seed();
