const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

const estimationFormulas = {
  wallArea: {
    description: 'مساحة الجدران = مساحة الأرضية × 2.8 (متوسط للشقق)',
    factor: 2.8,
    unit: 'م²',
    note: 'يختلف المعامل حسب ارتفاع السقف وعدد الفتحات',
  },
  wallAreaDetailed: {
    description: 'مساحة الجدران مفصلة = (محيط الغرفة × ارتفاع السقف) - مساحة الفتحات',
    note: 'يحتاج أبعاد دقيقة للغرف',
  },
  ceilingArea: {
    description: 'مساحة السقف = مساحة الأرضية تقريباً',
    factor: 1.0,
    unit: 'م²',
    note: 'مساحة السقف تساوي مساحة الأرضية في الطابق الواحد',
  },
  concreteVolume: {
    villa: {
      description: 'كمية الخرسانة لفيلا = مساحة الأرض × 0.45 م³/م² (طابق أرضي + أول)',
      factor: 0.45,
      unit: 'م³',
      note: 'تقدير تقريبي لفيلا متوسطة',
    },
    apartment: {
      description: 'كمية الخرسانة لشقة = مساحة الأرض × 0.35 م³/م²',
      factor: 0.35,
      unit: 'م³',
      note: 'تقدير تقريبي للمباني السكنية',
    },
    commercial: {
      description: 'كمية الخرسانة لمبنى تجاري = مساحة الأرض × 0.5 م³/م²',
      factor: 0.5,
      unit: 'م³',
      note: 'تقدير تقريبي للمباني التجارية',
    },
    warehouse: {
      description: 'كمية الخرسانة لمستودع = مساحة الأرض × 0.25 م³/م²',
      factor: 0.25,
      unit: 'م³',
      note: 'تقدير تقريبي للمستودعات',
    },
  },
  steelRebar: {
    villa: { description: 'حديد التسليح ≈ 100-120 كجم/م³ خرسانة', factor: 110, unit: 'كجم', note: 'يختلف حسب التصميم الإنشائي' },
    apartment: { description: 'حديد التسليح ≈ 90-110 كجم/م³ خرسانة', factor: 100, unit: 'كجم', note: 'يختلف حسب التصميم الإنشائي' },
    commercial: { description: 'حديد التسليح ≈ 120-150 كجم/م³ خرسانة', factor: 135, unit: 'كجم', note: 'أحمال أعلى للمباني التجارية' },
    warehouse: { description: 'حديد التسليح ≈ 80-100 كجم/م³ خرسانة', factor: 90, unit: 'كجم', note: 'مستودعات بأحمال أقل' },
  },
  electricalPoints: {
    description: 'نقاط كهرباء = عدد الغرف × 10 نقاط',
    factor: 10,
    unit: 'نقطة',
    note: 'تشمل أفياش وإنارة وتوصيلات',
    perRoom: true,
  },
  electricalPointsDetailed: {
    room: { factor: 8, unit: 'نقطة', note: 'نقاط كهرباء للغرفة العادية' },
    livingRoom: { factor: 12, unit: 'نقطة', note: 'نقاط كهرباء لصالة المعيشة' },
    kitchen: { factor: 15, unit: 'نقطة', note: 'نقاط كهرباء للمطبخ' },
    bathroom: { factor: 4, unit: 'نقطة', note: 'نقاط كهرباء للحمام' },
  },
  plumbingPoints: {
    description: 'نقاط سباكة للحمام ≈ 8 نقاط',
    factor: 8,
    unit: 'نقطة',
    note: 'تشمل مغسلة، مرحاض، دش، توصيلات ماء ساخن وبارد',
    perBathroom: true,
  },
  paintingArea: {
    description: 'مساحة الدهان = مساحة الأرضية × 3 (شامل الجدران والسقف)',
    factor: 3.0,
    unit: 'م²',
    note: 'تقدير تقريبي شامل الجدران والأسقف',
  },
  tilingArea: {
    description: 'مساحة البلاط = مساحة الأرضية',
    factor: 1.0,
    unit: 'م²',
    note: 'مساحة البلاط للأرضيات',
  },
  brickVolume: {
    description: 'عدد الطوب = مساحة الأرض × 60 طوبة/م² (طوب 20×20×40)',
    factor: 60,
    unit: 'طوبة',
    note: 'تقريبي ويعتمد على سمك الجدران',
  },
  plasterArea: {
    description: 'مساحة المحارة = مساحة الأرضية × 2.8',
    factor: 2.8,
    unit: 'م²',
    note: 'تقدير تقريبي للمحارة الداخلية',
  },
  ceramicArea: {
    description: 'مساحة سيراميك الحمامات والمطابخ ≈ 20% من مساحة الأرض',
    factor: 0.2,
    unit: 'م²',
    note: 'نسبة تقريبية لحوائط الحمامات والمطابخ',
  },
};

const estimationPatterns = [
  {
    pattern: ['دهان', 'بوية', 'طلاء'],
    formulaKey: 'paintingArea',
    itemType: 'دهان',
    multiplier: 1,
  },
  {
    pattern: ['بلاط', 'أرضيات'],
    formulaKey: 'tilingArea',
    itemType: 'بلاط',
    multiplier: 1,
  },
  {
    pattern: ['سيراميك'],
    formulaKey: 'ceramicArea',
    itemType: 'سيراميك',
    multiplier: 1,
  },
  {
    pattern: ['خرسانة', 'صب'],
    formulaKey: 'concreteVolume',
    itemType: 'خرسانة',
    multiplier: 1,
  },
  {
    pattern: ['حديد', 'تسليح'],
    formulaKey: 'steelRebar',
    itemType: 'حديد',
    multiplier: 1,
  },
  {
    pattern: ['طوب', 'بلوك'],
    formulaKey: 'brickVolume',
    itemType: 'طوب',
    multiplier: 1,
  },
  {
    pattern: ['محارة', 'لياسة'],
    formulaKey: 'plasterArea',
    itemType: 'محارة',
    multiplier: 1,
  },
  {
    pattern: ['نقطة', 'كهرباء'],
    formulaKey: 'electricalPoints',
    itemType: 'كهرباء',
    multiplier: 1,
  },
  {
    pattern: ['سباكة', 'نقطة مياه', 'تمديدات مياه'],
    formulaKey: 'plumbingPoints',
    itemType: 'سباكة',
    multiplier: 1,
  },
  {
    pattern: ['جبس', 'أسقف معلقة'],
    formulaKey: 'ceilingArea',
    itemType: 'جبس بورد',
    multiplier: 1,
  },
  {
    pattern: ['عوازل', 'عزل'],
    formulaKey: 'ceilingArea',
    itemType: 'عوازل',
    multiplier: 1,
  },
];

function estimateFromProject(projectId) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;

  const estimates = [];
  const { area, room_count, floor_count, project_type, finish_level } = project;
  const hasArea = area > 0;
  const hasRooms = room_count > 0;
  const totalArea = hasArea ? area * (floor_count || 1) : 0;

  if (!hasArea && !hasRooms) {
    return { estimates, project, message: 'بيانات غير كافية للتقدير - يرجى إدخال المساحة أو عدد الغرف', confidence: 'low' };
  }

  if (hasArea) {
    const formulasToUse = [];
    if (project_type === 'فيلا') {
      formulasToUse.push({ ...estimationFormulas.concreteVolume.villa, formulaKey: 'concreteVolume' });
      formulasToUse.push({ ...estimationFormulas.steelRebar.villa, formulaKey: 'steelRebar' });
    } else if (project_type === 'مبنى تجاري') {
      formulasToUse.push({ ...estimationFormulas.concreteVolume.commercial, formulaKey: 'concreteVolume' });
      formulasToUse.push({ ...estimationFormulas.steelRebar.commercial, formulaKey: 'steelRebar' });
    } else if (project_type === 'مستودع') {
      formulasToUse.push({ ...estimationFormulas.concreteVolume.warehouse, formulaKey: 'concreteVolume' });
      formulasToUse.push({ ...estimationFormulas.steelRebar.warehouse, formulaKey: 'steelRebar' });
    } else {
      formulasToUse.push({ ...estimationFormulas.concreteVolume.apartment, formulaKey: 'concreteVolume' });
      formulasToUse.push({ ...estimationFormulas.steelRebar.apartment, formulaKey: 'steelRebar' });
    }

    for (const f of formulasToUse) {
      const quantity = Math.round(totalArea * f.factor * 100) / 100;
      estimates.push({
        id: uuidv4(),
        item: getItemNameForKey(f.formulaKey, project_type),
        formulaKey: f.formulaKey,
        quantity,
        unit: f.unit,
        confidence: 0.6,
        source: f.description,
        note: f.note || '',
        projectArea: totalArea,
      });
    }

    const paintQty = Math.round(totalArea * estimationFormulas.paintingArea.factor * 100) / 100;
    estimates.push({
      id: uuidv4(),
      item: 'دهان جدران وأسقف',
      formulaKey: 'paintingArea',
      quantity: paintQty,
      unit: 'م²',
      confidence: 0.7,
      source: estimationFormulas.paintingArea.description,
      note: 'تقدير شامل',
      projectArea: totalArea,
    });

    const tileQty = Math.round(totalArea * estimationFormulas.tilingArea.factor * 100) / 100;
    estimates.push({
      id: uuidv4(),
      item: 'بلاط أرضيات',
      formulaKey: 'tilingArea',
      quantity: tileQty,
      unit: 'م²',
      confidence: 0.8,
      source: estimationFormulas.tilingArea.description,
      note: 'مساحة الأرضيات',
      projectArea: totalArea,
    });

    const ceramicQty = Math.round(totalArea * estimationFormulas.ceramicArea.factor * 100) / 100;
    estimates.push({
      id: uuidv4(),
      item: 'سيراميك حمامات ومطابخ',
      formulaKey: 'ceramicArea',
      quantity: ceramicQty,
      unit: 'م²',
      confidence: 0.5,
      source: estimationFormulas.ceramicArea.description,
      note: 'تقدير 20% من المساحة للحوائط',
      projectArea: totalArea,
    });

    const plasterQty = Math.round(totalArea * estimationFormulas.plasterArea.factor * 100) / 100;
    estimates.push({
      id: uuidv4(),
      item: 'محارة جدران',
      formulaKey: 'plasterArea',
      quantity: plasterQty,
      unit: 'م²',
      confidence: 0.65,
      source: estimationFormulas.plasterArea.description,
      note: 'تقدير تقريبي',
      projectArea: totalArea,
    });

    const brickQty = Math.round(totalArea * estimationFormulas.brickVolume.factor * 100) / 100;
    estimates.push({
      id: uuidv4(),
      item: 'طوب بناء',
      formulaKey: 'brickVolume',
      quantity: brickQty,
      unit: 'طوبة',
      confidence: 0.5,
      source: estimationFormulas.brickVolume.description,
      note: 'طوب مقاس 20×20×40',
      projectArea: totalArea,
    });

    if (project_type === 'فيلا') {
      const foundationConcrete = Math.round(totalArea * 0.15 * 100) / 100;
      estimates.push({
        id: uuidv4(),
        item: 'خرسانة أساسات',
        formulaKey: 'foundation',
        quantity: foundationConcrete,
        unit: 'م³',
        confidence: 0.4,
        source: 'تقدير أساسات = 15% من إجمالي الخرسانة',
        note: 'تقدير أولي يحتاج تصميم إنشائي',
        projectArea: totalArea,
      });
    }
  }

  if (hasRooms) {
    const electricalQty = room_count * estimationFormulas.electricalPoints.factor;
    estimates.push({
      id: uuidv4(),
      item: 'نقاط كهرباء',
      formulaKey: 'electricalPoints',
      quantity: electricalQty,
      unit: 'نقطة',
      confidence: 0.6,
      source: estimationFormulas.electricalPoints.description,
      note: `بناءً على ${room_count} غرفة`,
      roomCount: room_count,
    });

    const bathroomCount = Math.max(1, Math.round(room_count / 3));
    const plumbingQty = bathroomCount * estimationFormulas.plumbingPoints.factor;
    estimates.push({
      id: uuidv4(),
      item: 'نقاط سباكة',
      formulaKey: 'plumbingPoints',
      quantity: plumbingQty,
      unit: 'نقطة',
      confidence: 0.5,
      source: estimationFormulas.plumbingPoints.description,
      note: `تقدير ${bathroomCount} حمام`,
      bathroomCount,
    });
  }

  const avgConfidence = estimates.length > 0
    ? Math.round((estimates.reduce((s, e) => s + e.confidence, 0) / estimates.length) * 100) / 100
    : 0;

  const confidenceLevel = avgConfidence >= 0.7 ? 'مرتفع' : avgConfidence >= 0.4 ? 'متوسط' : 'منخفض';

  return { estimates, project, confidence: confidenceLevel, averageConfidence: avgConfidence };
}

function estimateForItem({ area, roomCount, floorCount, projectType, finishLevel, itemName, itemCategory }) {
  const effectiveArea = area * (floorCount || 1);
  const effectiveRooms = roomCount || 1;

  for (const pat of estimationPatterns) {
    if (pat.pattern.some(p => (itemName || '').includes(p) || (itemCategory || '').includes(p))) {
      let formula;
      if (pat.formulaKey === 'concreteVolume' || pat.formulaKey === 'steelRebar') {
        if (projectType === 'فيلا') {
          formula = estimationFormulas[pat.formulaKey].villa;
        } else if (projectType === 'مبنى تجاري') {
          formula = estimationFormulas[pat.formulaKey].commercial;
        } else if (projectType === 'مستودع') {
          formula = estimationFormulas[pat.formulaKey].warehouse;
        } else {
          formula = estimationFormulas[pat.formulaKey].apartment;
        }
      } else {
        formula = estimationFormulas[pat.formulaKey];
      }

      if (!formula) continue;

      if (pat.formulaKey === 'electricalPoints') {
        const qty = effectiveRooms * formula.factor;
        return { quantity: qty, unit: formula.unit, source: formula.description, note: formula.note, confidence: 0.6 };
      }

      if (pat.formulaKey === 'plumbingPoints') {
        const bathrooms = Math.max(1, Math.round(effectiveRooms / 3));
        const qty = bathrooms * formula.factor;
        return { quantity: qty, unit: formula.unit, source: formula.description, note: `تقدير ${bathrooms} حمام`, confidence: 0.5 };
      }

      if (effectiveArea > 0) {
        let qty = effectiveArea * formula.factor;
        if (pat.multiplier) qty *= pat.multiplier;
        qty = Math.round(qty * 100) / 100;
        return { quantity: qty, unit: formula.unit, source: formula.description, note: formula.note || '', confidence: 0.65 };
      }

      return { quantity: 0, unit: formula.unit, source: formula.description, note: 'يحتاج مساحة الأرضية للتقدير', confidence: 0.1 };
    }
  }

  return null;
}

function getEstimationFormulas() {
  return estimationFormulas;
}

function getEstimationPatterns() {
  return estimationPatterns;
}

function getItemNameForKey(formulaKey, projectType) {
  const map = {
    concreteVolume: projectType === 'فيلا' ? 'خرسانة جاهزة (فيلا)' :
                    projectType === 'مبنى تجاري' ? 'خرسانة جاهزة (تجاري)' :
                    projectType === 'مستودع' ? 'خرسانة جاهزة (مستودع)' : 'خرسانة جاهزة (سكني)',
    steelRebar: projectType === 'فيلا' ? 'حديد تسليح (فيلا)' :
                projectType === 'مبنى تجاري' ? 'حديد تسليح (تجاري)' :
                projectType === 'مستودع' ? 'حديد تسليح (مستودع)' : 'حديد تسليح (سكني)',
    paintingArea: 'دهان جدران وأسقف',
    tilingArea: 'بلاط أرضيات',
    ceramicArea: 'سيراميك حوائط',
    plasterArea: 'محارة جدران',
    brickVolume: 'طوب بناء',
    electricalPoints: 'نقاط كهرباء',
    plumbingPoints: 'نقاط سباكة',
    ceilingArea: 'أسقف معلقة',
    foundation: 'خرسانة أساسات',
  };
  return map[formulaKey] || formulaKey;
}

module.exports = {
  estimateFromProject,
  estimateForItem,
  getEstimationFormulas,
  getEstimationPatterns,
};
