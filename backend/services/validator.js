const { getDb } = require('../db/database');

const typicalRanges = {
  'خرسانة': { minPerSqm: 0.2, maxPerSqm: 0.8, unit: 'م³/م²' },
  'حديد تسليح': { minPerSqm: 80, maxPerSqm: 160, unit: 'كجم/م³' },
  'بلاط': { minPerSqm: 0.9, maxPerSqm: 1.2, unit: 'م²/م²' },
  'سيراميك': { minPerSqm: 0.9, maxPerSqm: 1.2, unit: 'م²/م²' },
  'بورسلين': { minPerSqm: 0.9, maxPerSqm: 1.2, unit: 'م²/م²' },
  'دهان': { minPerSqm: 2.0, maxPerSqm: 4.0, unit: 'م²/م²' },
  'طوب': { minPerSqm: 50, maxPerSqm: 70, unit: 'طوبة/م²' },
  'أسمنت': { minPerSqm: 5, maxPerSqm: 15, unit: 'كجم/م²' },
  'دهان جدران': { minPerSqm: 1.0, maxPerSqm: 3.5, unit: 'م²/م²' },
  'جبس بورد': { minPerSqm: 0.8, maxPerSqm: 1.1, unit: 'م²/م²' },
  'محارة': { minPerSqm: 1.0, maxPerSqm: 3.0, unit: 'م²/م²' },
  'عوازل': { minPerSqm: 0.9, maxPerSqm: 1.1, unit: 'م²/م²' },
};

const conflictingPairs = [
  ['بلاط عادي', 'بورسلين فاخر'],
  ['رخام', 'سيراميك عادي'],
  ['دهان زيتي', 'دهان مائي'],
  ['طوب أحمر', 'بلوك أبيض'],
  ['مواسير حديد', 'مواسير بي في سي'],
  ['أسلاك ألمنيوم', 'أسلاك نحاس'],
  ['واجهات حجر', 'واجهات زجاج'],
  ['سقف جبس', 'سقف معلق معدني'],
  ['أرضيات باركيه', 'أرضيات سيراميك'],
  ['دهان أساس مائي', 'دهان أساس زيتي'],
];

function validateProject(projectId) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return { valid: false, errors: ['المشروع غير موجود'], warnings: [] };

  const errors = [];
  const warnings = [];

  if (!project.title || project.title.trim() === '') {
    errors.push('عنوان المشروع مطلوب');
  }
  if (!project.project_type) {
    errors.push('نوع المشروع مطلوب');
  }
  if (project.area != null && project.area <= 0) {
    warnings.push('مساحة المشروع صفر أو سالبة');
  }
  if (project.area != null && project.area > 50000) {
    warnings.push('مساحة المشروع كبيرة جداً، يرجى التأكد من صحتها');
  }
  if (project.area == null || project.area <= 0) {
    warnings.push('مساحة المشروع غير مدخلة - يرجى إدخال المساحة للحصول على تقديرات دقيقة');
  }
  if (project.room_count != null && project.room_count <= 0) {
    warnings.push('عدد الغرف صفر أو سالب');
  }
  if (project.room_count == null) {
    warnings.push('عدد الغرف غير مدخل');
  }
  if (project.floor_count != null && project.floor_count > 30) {
    warnings.push('عدد الطوابق كبير جداً، يرجى التأكد من صحته');
  }
  if (project.finish_level && !['اقتصادي', 'متوسط', 'جيد', 'فاخر'].includes(project.finish_level)) {
    warnings.push(`مستوى التشطيب "${project.finish_level}" غير معروف`);
  }
  if (project.status && !['مسودة', 'قيد_المراجعة', 'معتمد', 'مرفوض', 'معلق'].includes(project.status)) {
    warnings.push(`حالة المشروع "${project.status}" غير معروفة`);
  }

  const items = db.prepare('SELECT * FROM project_items WHERE project_id = ?').all(projectId);

  if (items.length === 0) {
    warnings.push('لا توجد بنود في جدول الكميات');
  }

  const itemValidation = validateItems(items, project);
  errors.push(...itemValidation.errors);
  warnings.push(...itemValidation.warnings);

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    project,
    itemsCount: items.length,
    accuracyLevel: estimateAccuracyLevel(project, items.length),
  };
}

function validateItems(items, project) {
  const errors = [];
  const warnings = [];
  const itemNames = items.map(i => i.name_ar);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.name_ar || item.name_ar.trim() === '') {
      errors.push(`البند رقم ${i + 1} بدون اسم`);
    }
    if (!item.unit) {
      warnings.push(`البند "${item.name_ar}" بدون وحدة قياس`);
    }
    if (item.quantity != null && item.quantity <= 0) {
      warnings.push(`الكمية للبند "${item.name_ar}" صفر أو سالبة`);
    }
    if (item.quantity == null) {
      warnings.push(`الكمية للبند "${item.name_ar}" غير مدخلة`);
    }
    if (item.quantity != null && item.quantity > 0 && project.area > 0) {
      validateQuantityAgainstRange(item, project.area, warnings);
    }
  }

  for (const [a, b] of conflictingPairs) {
    if (itemNames.some(n => n.includes(a)) && itemNames.some(n => n.includes(b))) {
      warnings.push(`تعارض محتمل: "${a}" و "${b}" معاً في نفس المشروع`);
    }
  }

  return { errors, warnings };
}

function validateQuantityAgainstRange(item, area, warnings) {
  for (const [key, range] of Object.entries(typicalRanges)) {
    if ((item.name_ar || '').includes(key) || (item.category || '').includes(key)) {
      const expected = area * range.minPerSqm;
      const maxExpected = area * range.maxPerSqm;
      if (item.quantity > 0 && expected > 0) {
        const ratio = item.quantity / expected;
        if (ratio > 2) {
          warnings.push(`الكمية للبند "${item.name_ar}" (${item.quantity}) أعلى بكثير من المتوقع (${Math.round(expected)}) - يرجى المراجعة`);
        } else if (ratio < 0.3) {
          warnings.push(`الكمية للبند "${item.name_ar}" (${item.quantity}) أقل بكثير من المتوقع (${Math.round(expected)}) - يرجى المراجعة`);
        }
      }
      break;
    }
  }
}

function validatePrices(projectId) {
  const db = getDb();
  const items = db.prepare('SELECT * FROM project_items WHERE project_id = ?').all(projectId);
  const errors = [];
  const warnings = [];

  for (const item of items) {
    if (!item.item_id) {
      warnings.push(`البند "${item.name_ar}" غير مرتبط بعنصر في قاعدة المعرفة`);
      continue;
    }
    const price = db.prepare(`
      SELECT * FROM prices WHERE item_id = ? AND status = 'معتمد'
        AND (valid_until IS NULL OR valid_until >= datetime('now'))
      ORDER BY date_recorded DESC LIMIT 1
    `).get(item.item_id);

    if (!price) {
      warnings.push(`لا يوجد سعر معتمد للبند "${item.name_ar}"`);
      continue;
    }

    if (price.valid_until && new Date(price.valid_until) < new Date()) {
      warnings.push(`سعر "${item.name_ar}" منتهي الصلاحية`);
    }

    const total = (price.material_cost || 0) + (price.labor_cost || 0) + (price.equipment_cost || 0) + (price.transport_cost || 0);
    if (total > 0) {
      const avgPrice = db.prepare('SELECT AVG(material_cost) as avg FROM prices WHERE item_id = ? AND status = ? AND material_cost > 0').get(item.item_id, 'معتمد');
      if (avgPrice && avgPrice.avg) {
        const ratio = price.material_cost / avgPrice.avg;
        if (ratio > 3) warnings.push(`سعر المواد للبند "${item.name_ar}" أعلى بـ ${Math.round(ratio)} أضعاف من المتوسط`);
        if (ratio < 0.33 && ratio > 0) warnings.push(`سعر المواد للبند "${item.name_ar}" أقل من المتوسط بشكل كبير`);
      }
    }
  }

  return { errors, warnings };
}

function checkConflicts(projectId) {
  const db = getDb();
  const items = db.prepare('SELECT * FROM project_items WHERE project_id = ?').all(projectId);
  const itemNames = items.map(i => i.name_ar);
  const conflicts = [];

  for (const [a, b] of conflictingPairs) {
    const hasA = itemNames.some(n => n.includes(a));
    const hasB = itemNames.some(n => n.includes(b));
    if (hasA && hasB) {
      conflicts.push({
        type: 'تعارض',
        itemA: a,
        itemB: b,
        description: `تعارض محتمل بين "${a}" و "${b}" - يوصى باختيار أحدهما`,
      });
    }
  }

  return conflicts;
}

function checkCompleteness(projectId) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return { level: 'غير_متوفر', percentage: 0, missing: ['المشروع غير موجود'] };

  const fields = {
    title: { label: 'عنوان المشروع', weight: 10 },
    project_type: { label: 'نوع المشروع', weight: 15 },
    building_type: { label: 'نوع البناء', weight: 10 },
    city: { label: 'المدينة', weight: 5 },
    area: { label: 'المساحة', weight: 15 },
    floor_count: { label: 'عدد الطوابق', weight: 5 },
    room_count: { label: 'عدد الغرف', weight: 10 },
    finish_level: { label: 'مستوى التشطيب', weight: 10 },
  };

  let score = 0;
  const missing = [];

  for (const [key, field] of Object.entries(fields)) {
    if (project[key] != null && project[key] !== '') {
      score += field.weight;
    } else {
      missing.push(field.label);
    }
  }

  const items = db.prepare('SELECT COUNT(*) as cnt FROM project_items WHERE project_id = ?').get(projectId);
  if (items.cnt > 0) {
    score += 20;
  } else {
    missing.push('بنود المشروع (جدول الكميات)');
  }

  const percentage = Math.min(100, score);

  let level;
  if (percentage >= 90) level = 'كامل';
  else if (percentage >= 70) level = 'كافي';
  else if (percentage >= 40) level = 'جزئي';
  else level = 'غير_كافي';

  return { level, percentage, missing };
}

function estimateAccuracyLevel(project, itemsCount) {
  const hasArea = project.area > 0;
  const hasRooms = project.room_count > 0;
  const hasFloorCount = project.floor_count > 0;
  const hasItems = itemsCount > 0;
  const hasType = !!project.project_type;
  const hasFinishLevel = !!project.finish_level;
  const hasBuildingType = !!project.building_type;

  const points = [hasArea, hasRooms, hasFloorCount, hasItems, hasType, hasFinishLevel, hasBuildingType].filter(Boolean).length;

  if (points >= 6 && hasArea && hasItems) return 'دقيق';
  if (points >= 4 && hasArea) return 'تقدير_تفصيلي';
  if (points >= 2) return 'تقدير_أولي';
  return 'غير_كافي';
}

function validateProjectData(data) {
  const errors = [];
  const warnings = [];

  if (!data.title || data.title.trim() === '') {
    errors.push('عنوان المشروع مطلوب');
  }
  if (!data.project_type) {
    errors.push('نوع المشروع مطلوب');
  }
  if (data.area != null && isNaN(data.area)) {
    errors.push('المساحة يجب أن تكون رقماً');
  }
  if (data.area != null && data.area < 0) {
    errors.push('المساحة لا يمكن أن تكون سالبة');
  }
  if (data.room_count != null && isNaN(data.room_count)) {
    errors.push('عدد الغرف يجب أن يكون رقماً');
  }
  if (data.floor_count != null && isNaN(data.floor_count)) {
    errors.push('عدد الطوابق يجب أن يكون رقماً');
  }
  if (data.floor_count != null && data.floor_count < 0) {
    errors.push('عدد الطوابق لا يمكن أن يكون سالباً');
  }
  if (data.finish_level && !['اقتصادي', 'متوسط', 'جيد', 'فاخر'].includes(data.finish_level)) {
    warnings.push(`مستوى التشطيب "${data.finish_level}" غير معروف، سيتم استخدام "متوسط"`);
  }
  if (data.city && data.city.trim().length > 100) {
    warnings.push('اسم المدينة طويل جداً');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function getTypicalRanges() {
  return { ...typicalRanges };
}

function getConflictingPairs() {
  return [...conflictingPairs];
}

module.exports = {
  validateProject,
  validateItems,
  validatePrices,
  checkConflicts,
  checkCompleteness,
  estimateAccuracyLevel,
  validateProjectData,
  getTypicalRanges,
  getConflictingPairs,
};
