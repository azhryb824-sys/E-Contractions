const itemDictionary = require('./item-dictionary.json');

function normalizeParams(p) {
  return {
    area: p.area || 0,
    rooms: p.rooms || 0,
    bathrooms: p.bathrooms || 0,
    hasKitchen: p.hasKitchen !== false,
    hasHall: p.hasHall !== false,
    floorCount: p.floorCount || 1,
    hasRoof: p.hasRoof || false,
    projectType: p.projectType || 'شقة',
    finishLevel: p.finishLevel || 'جيد',
    wallHeight: p.wallHeight || 2.8,
    externalWalls: p.externalWalls || false,
    kitchen: p.hasKitchen !== false ? 1 : 0,
    hall: p.hasHall !== false ? 1 : 0
  };
}

function wallArea(p) {
  const rooms = p.rooms || 0;
  const hall = p.hall || 0;
  return (p.area || 0) * p.wallHeight * (rooms + hall);
}

function totalPoints(p) {
  return (p.rooms || 0) * 8 + (p.bathrooms || 0) * 3 + (p.kitchen || 0) * 6 + (p.hall || 0) * 5;
}

function calcBreakdown(itemCode, formula, value, unit, steps, p) {
  const q = Math.round(value * 100) / 100;
  const min = Math.round(q * 0.85 * 100) / 100;
  const max = Math.round(q * 1.15 * 100) / 100;
  let confidence;
  if (p.area && p.rooms && p.bathrooms) confidence = 0.9;
  else if (p.area || (p.rooms && p.bathrooms)) confidence = 0.75;
  else confidence = 0.55;
  return { quantity: q, min, max, unit, confidence, method: formula, breakdown: { itemCode, formula, steps, result: q, unit } };
}

function build(p) {
  const np = normalizeParams(p);
  const registry = {

    // ==============================
    // أعمال الأرضيات (Flooring)
    // ==============================
    'FLR-001': () => {
      const v = np.area * 1.0;
      return calcBreakdown('FLR-001', 'area × 1.0', v, 'م²', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 1.0, factor: 'معامل التجهيز' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'FLR-002': () => {
      const v = np.area * 0.85;
      return calcBreakdown('FLR-002', 'area × 0.85', v, 'م²', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.85, factor: 'نسبة التسوية' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'FLR-004': () => {
      const v = np.area * 0.70;
      return calcBreakdown('FLR-004', 'area × 0.70', v, 'م²', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.70, factor: 'نسبة مساحة الأرضيات' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'FLR-005': () => {
      const v = np.area * 0.30;
      return calcBreakdown('FLR-005', 'area × 0.30', v, 'م²', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.30, factor: 'نسبة السيراميك (حمامات/مطبخ)' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'FLR-006': () => {
      const tiles = np.area * 0.70;
      const v = tiles * 0.05;
      return calcBreakdown('FLR-006', 'tiles_area × 0.05', v, 'كجم', [
        { step: 1, operation: 'tiles_area', value: tiles, unit: 'م²', note: 'مساحة البلاط = المساحة الإجمالية × 0.70' },
        { step: 2, operation: 'multiply', value: 0.05, factor: '5 كجم لكل م²' },
        { step: 3, result: v, unit: 'كجم' }
      ], np);
    },
    'FLR-007': () => {
      const tiles = np.area * 0.70;
      const v = tiles * 0.02;
      return calcBreakdown('FLR-007', 'tiles_area × 0.02', v, 'كجم', [
        { step: 1, operation: 'tiles_area', value: tiles, unit: 'م²', note: 'مساحة البلاط = المساحة الإجمالية × 0.70' },
        { step: 2, operation: 'multiply', value: 0.02, factor: '2 كجم لكل م²' },
        { step: 3, result: v, unit: 'كجم' }
      ], np);
    },
    'FLR-008': () => {
      const rooms = np.rooms || 1;
      const perimeter = Math.sqrt(np.area) * 4 * rooms;
      const v = perimeter * 0.7;
      return calcBreakdown('FLR-008', '(sqrt(area) × 4 × rooms) × 0.7', v, 'م', [
        { step: 1, operation: 'sqrt_area', value: Math.sqrt(np.area), unit: 'م', note: 'جذر المساحة التربيعي' },
        { step: 2, operation: 'perimeter', value: Math.sqrt(np.area) * 4, unit: 'م', note: 'محيط الغرفة التقريبي' },
        { step: 3, operation: 'multiply_rooms', value: Math.sqrt(np.area) * 4 * rooms, unit: 'م', note: `محيط × ${rooms} غرف` },
        { step: 4, operation: 'multiply', value: 0.7, factor: 'معامل الوزرات' },
        { step: 5, result: v, unit: 'م' }
      ], np);
    },

    // ==============================
    // أعمال الدهانات (Painting)
    // ==============================
    'PNT-001': () => {
      const wArea = wallArea(np);
      const v = wArea * 0.15;
      return calcBreakdown('PNT-001', 'wall_area × 0.15', v, 'م²', [
        { step: 1, operation: 'wall_area', value: wArea, unit: 'م²', note: 'مساحة الجدران الكلية' },
        { step: 2, operation: 'multiply', value: 0.15, factor: 'نسبة الشقوق 15%' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'PNT-002': () => {
      const wArea = wallArea(np);
      const v = wArea * 1.0;
      return calcBreakdown('PNT-002', 'wall_area × 1.0', v, 'م²', [
        { step: 1, operation: 'wall_area', value: wArea, unit: 'م²' },
        { step: 2, result: v, unit: 'م²' }
      ], np);
    },
    'PNT-003': () => {
      const wArea = wallArea(np);
      const v = wArea * 0.3;
      return calcBreakdown('PNT-003', 'wall_area × 0.3', v, 'كجم', [
        { step: 1, operation: 'wall_area', value: wArea, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.3, factor: '0.3 كجم لكل م²' },
        { step: 3, result: v, unit: 'كجم' }
      ], np);
    },
    'PNT-004': () => {
      const wArea = wallArea(np);
      const v = wArea * 1.0;
      return calcBreakdown('PNT-004', 'wall_area × 1.0', v, 'م²', [
        { step: 1, operation: 'wall_area', value: wArea, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 1.0, factor: 'كامل مساحة الجدران' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'PNT-005': () => {
      const wArea = wallArea(np);
      const v = wArea * 1.0;
      return calcBreakdown('PNT-005', 'wall_area × 1.0', v, 'م²', [
        { step: 1, operation: 'wall_area', value: wArea, unit: 'م²', note: 'مساحة الجدران = (الغرف + الصالات) × 2.8 × 2 × 2' },
        { step: 2, result: v, unit: 'م²' }
      ], np);
    },
    'PNT-006': () => {
      if (np.projectType !== 'فيلا') {
        const r = { quantity: 0, min: 0, max: 0, confidence: 1, method: 'external_wall_area', breakdown: null };
        return r;
      }
      const wArea = wallArea(np);
      const v = wArea * 0.4;
      return calcBreakdown('PNT-006', 'external_wall_area (للفيلا)', v, 'م²', [
        { step: 1, operation: 'wall_area', value: wArea, unit: 'م²' },
        { step: 2, operation: 'external_ratio', value: 0.4, factor: '40% من الجدران خارجية' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'PNT-008': () => {
      const v = np.area * 1.0;
      return calcBreakdown('PNT-008', 'area × 1.0', v, 'م²', [
        { step: 1, operation: 'ceil_area', value: np.area, unit: 'م²' },
        { step: 2, result: v, unit: 'م²' }
      ], np);
    },

    // ==============================
    // أعمال الكهرباء (Electrical)
    // ==============================
    'ELC-001': () => {
      const pts = totalPoints(np);
      const v = pts * 15;
      return calcBreakdown('ELC-001', 'total_points × 15', v, 'م', [
        { step: 1, operation: 'total_points', value: pts, unit: 'نقطة', note: 'غرف×8 + حمامات×3 + مطبخ×6 + صالة×5' },
        { step: 2, operation: 'multiply', value: 15, factor: '15 متر لكل نقطة' },
        { step: 3, result: v, unit: 'م' }
      ], np);
    },
    'ELC-002': () => {
      const v = (np.rooms || 0) + (np.bathrooms || 0) + 3;
      return calcBreakdown('ELC-002', 'rooms + bathrooms + 3', v, 'قطعة', [
        { step: 1, operation: 'rooms', value: np.rooms || 0, unit: '' },
        { step: 2, operation: 'add_bathrooms', value: (np.rooms || 0) + (np.bathrooms || 0), unit: '' },
        { step: 3, operation: 'add_constant', value: 3, factor: 'قاطع رئيسي + قاطع مطبخ + احتياطي' },
        { step: 4, result: v, unit: 'قطعة' }
      ], np);
    },
    'ELC-003': () => {
      const pts = totalPoints(np);
      const v = pts * 0.35;
      return calcBreakdown('ELC-003', 'total_points × 0.35', v, 'قطعة', [
        { step: 1, operation: 'total_points', value: pts, unit: 'نقطة' },
        { step: 2, operation: 'multiply', value: 0.35, factor: '35% من النقاط مفاتيح' },
        { step: 3, result: v, unit: 'قطعة' }
      ], np);
    },
    'ELC-004': () => {
      const pts = totalPoints(np);
      const v = pts * 0.45;
      return calcBreakdown('ELC-004', 'total_points × 0.45', v, 'قطعة', [
        { step: 1, operation: 'total_points', value: pts, unit: 'نقطة' },
        { step: 2, operation: 'multiply', value: 0.45, factor: '45% من النقاط أفياش' },
        { step: 3, result: v, unit: 'قطعة' }
      ], np);
    },
    'ELC-005': () => {
      const pts = totalPoints(np);
      const v = pts * 12;
      return calcBreakdown('ELC-005', 'total_points × 12', v, 'م', [
        { step: 1, operation: 'total_points', value: pts, unit: 'نقطة' },
        { step: 2, operation: 'multiply', value: 12, factor: '12 متر تمديدات لكل نقطة' },
        { step: 3, result: v, unit: 'م' }
      ], np);
    },
    'ELC-010': () => {
      const v = 1;
      return calcBreakdown('ELC-010', '1 (ثابت)', v, 'نظام', [
        { step: 1, result: v, unit: 'نظام', note: 'تمديد أرضي - نظام واحد للمشروع' }
      ], np);
    },
    'ELC-012': () => {
      const v = 1;
      return calcBreakdown('ELC-012', '1 (ثابت)', v, 'قطعة', [
        { step: 1, result: v, unit: 'قطعة', note: 'عداد كهرباء رئيسي واحد' }
      ], np);
    },

    // ==============================
    // أعمال السباكة (Plumbing)
    // ==============================
    'PLM-001': () => {
      const v = ((np.bathrooms || 0) + (np.kitchen || 0)) * 15;
      return calcBreakdown('PLM-001', '(bathrooms + kitchen) × 15', v, 'م', [
        { step: 1, operation: 'bathrooms', value: np.bathrooms || 0, unit: '' },
        { step: 2, operation: 'kitchen', value: np.kitchen || 0, unit: '' },
        { step: 3, operation: 'sum', value: (np.bathrooms || 0) + (np.kitchen || 0), unit: '' },
        { step: 4, operation: 'multiply', value: 15, factor: '15 متر لكل نقطة مياه ساخن' },
        { step: 5, result: v, unit: 'م' }
      ], np);
    },
    'PLM-002': () => {
      const v = ((np.bathrooms || 0) + (np.kitchen || 0)) * 15;
      return calcBreakdown('PLM-002', '(bathrooms + kitchen) × 15', v, 'م', [
        { step: 1, operation: 'bathrooms', value: np.bathrooms || 0 },
        { step: 2, operation: 'kitchen', value: np.kitchen || 0 },
        { step: 3, operation: 'sum', value: (np.bathrooms || 0) + (np.kitchen || 0) },
        { step: 4, operation: 'multiply', value: 15, factor: '15 متر لكل نقطة مياه بارد' },
        { step: 5, result: v, unit: 'م' }
      ], np);
    },
    'PLM-003': () => {
      const v = ((np.bathrooms || 0) + (np.kitchen || 0)) * 12;
      return calcBreakdown('PLM-003', '(bathrooms + kitchen) × 12', v, 'م', [
        { step: 1, operation: 'bathrooms', value: np.bathrooms || 0 },
        { step: 2, operation: 'kitchen', value: np.kitchen || 0 },
        { step: 3, operation: 'sum', value: (np.bathrooms || 0) + (np.kitchen || 0) },
        { step: 4, operation: 'multiply', value: 12, factor: '12 متر صرف لكل نقطة' },
        { step: 5, result: v, unit: 'م' }
      ], np);
    },
    'PLM-005': () => {
      const v = (np.bathrooms || 0) * 3 + (np.kitchen || 0) * 2;
      return calcBreakdown('PLM-005', 'bathrooms × 3 + kitchen × 2', v, 'قطعة', [
        { step: 1, operation: 'bathrooms_taps', value: (np.bathrooms || 0) * 3, unit: 'قطعة', note: '3 حنفيات لكل حمام' },
        { step: 2, operation: 'kitchen_taps', value: (np.kitchen || 0) * 2, unit: 'قطعة', note: '2 حنفية للمطبخ' },
        { step: 3, result: v, unit: 'قطعة' }
      ], np);
    },
    'PLM-006': () => {
      const v = (np.bathrooms || 0) * 2 + (np.kitchen || 0) * 1;
      return calcBreakdown('PLM-006', 'bathrooms × 2 + kitchen × 1', v, 'قطعة', [
        { step: 1, operation: 'bathroom_mixers', value: (np.bathrooms || 0) * 2, note: 'خلاط حوض + خلاط دش' },
        { step: 2, operation: 'kitchen_mixer', value: (np.kitchen || 0) * 1, note: 'خلاط مطبخ' },
        { step: 3, result: v, unit: 'قطعة' }
      ], np);
    },
    'PLM-007': () => {
      const v = (np.bathrooms || 0) * 1;
      return calcBreakdown('PLM-007', 'bathrooms × 1', v, 'قطعة', [
        { step: 1, operation: 'bathrooms', value: np.bathrooms || 0 },
        { step: 2, result: v, unit: 'قطعة', note: 'مرحاض لكل حمام' }
      ], np);
    },
    'PLM-008': () => {
      const v = (np.bathrooms || 0) * 1 + (np.kitchen || 0) * 1;
      return calcBreakdown('PLM-008', 'bathrooms × 1 + kitchen × 1', v, 'قطعة', [
        { step: 1, operation: 'bathroom_sinks', value: np.bathrooms || 0, note: 'مغسلة لكل حمام' },
        { step: 2, operation: 'kitchen_sink', value: np.kitchen || 0, note: 'مغسلة مطبخ' },
        { step: 3, result: v, unit: 'قطعة' }
      ], np);
    },
    'PLM-009': () => {
      const v = Math.ceil((np.bathrooms || 0) * 0.5);
      return calcBreakdown('PLM-009', 'bathrooms × 0.5', v, 'قطعة', [
        { step: 1, operation: 'bathrooms', value: np.bathrooms || 0 },
        { step: 2, operation: 'multiply', value: 0.5, factor: '50% من الحمامات' },
        { step: 3, result: v, unit: 'قطعة', note: 'كابينة حمام اختيارية' }
      ], np);
    },

    // ==============================
    // أعمال التكييف (AC/HVAC)
    // ==============================
    'HVAC-001': () => {
      const v = (np.rooms || 0) + 1;
      return calcBreakdown('HVAC-001', 'rooms + 1', v, 'وحدة', [
        { step: 1, operation: 'rooms', value: np.rooms || 0 },
        { step: 2, operation: 'add_living', value: 1, factor: 'وحدة للصالة' },
        { step: 3, result: v, unit: 'وحدة' }
      ], np);
    },
    'HVAC-002': () => {
      const v = ((np.rooms || 0) + 1) * 3;
      return calcBreakdown('HVAC-002', '(rooms + 1) × 3', v, 'م', [
        { step: 1, operation: 'units', value: (np.rooms || 0) + 1 },
        { step: 2, operation: 'multiply', value: 3, factor: '3 متر مجرى لكل وحدة' },
        { step: 3, result: v, unit: 'م' }
      ], np);
    },
    'HVAC-004': () => {
      const v = ((np.rooms || 0) + 1) * 2;
      return calcBreakdown('HVAC-004', '(rooms + 1) × 2', v, 'قطعة', [
        { step: 1, operation: 'units', value: (np.rooms || 0) + 1 },
        { step: 2, operation: 'multiply', value: 2, factor: '2 فلتر لكل وحدة' },
        { step: 3, result: v, unit: 'قطعة' }
      ], np);
    },
    'HVAC-006': () => {
      const v = ((np.rooms || 0) + 1) * 5;
      return calcBreakdown('HVAC-006', '(rooms + 1) × 5', v, 'م', [
        { step: 1, operation: 'units', value: (np.rooms || 0) + 1 },
        { step: 2, operation: 'multiply', value: 5, factor: '5 متر عزل لكل وحدة' },
        { step: 3, result: v, unit: 'م' }
      ], np);
    },

    // ==============================
    // أعمال النجارة (Woodwork)
    // ==============================
    'WOD-001': () => {
      const v = (np.rooms || 0) + (np.bathrooms || 0) + 1;
      return calcBreakdown('WOD-001', 'rooms + bathrooms + 1', v, 'باب', [
        { step: 1, operation: 'rooms', value: np.rooms || 0 },
        { step: 2, operation: 'bathrooms', value: np.bathrooms || 0 },
        { step: 3, operation: 'add_main', value: 1, factor: 'باب رئيسي داخلي' },
        { step: 4, result: v, unit: 'باب' }
      ], np);
    },
    'WOD-002': () => {
      const v = 2;
      return calcBreakdown('WOD-002', '2 (باب رئيسي + باب خلفي/جانبي)', v, 'باب', [
        { step: 1, result: v, unit: 'باب', note: 'باب رئيسي + باب خلفي أو جانبي' }
      ], np);
    },
    'WOD-003': () => {
      const v = 1;
      return calcBreakdown('WOD-003', '1 (طقم مطبخ)', v, 'طقم', [
        { step: 1, result: v, unit: 'طقم', note: 'مطبخ متكامل - طقم واحد' }
      ], np);
    },
    'WOD-004': () => {
      const v = (np.rooms || 0) * 2;
      return calcBreakdown('WOD-004', 'rooms × 2', v, 'قطعة', [
        { step: 1, operation: 'rooms', value: np.rooms || 0 },
        { step: 2, operation: 'multiply', value: 2, factor: 'خزنتين لكل غرفة نوم' },
        { step: 3, result: v, unit: 'قطعة' }
      ], np);
    },
    'WOD-007': () => {
      const v = (np.projectType === 'فيلا' || np.projectType === 'مبنى سكني') ? 1 : 0;
      return calcBreakdown('WOD-007', '1 (للفيلا/المدخل الرئيسي)', v, 'باب', [
        { step: 1, operation: 'project_type', value: np.projectType, note: 'باب أمان للفيلا أو المدخل الرئيسي' },
        { step: 2, result: v, unit: 'باب' }
      ], np);
    },

    // ==============================
    // أعمال ألمنيوم (Aluminum)
    // ==============================
    'ALM-001': () => {
      const v = ((np.rooms || 0) + 1) * 2;
      return calcBreakdown('ALM-001', '(rooms + 1) × 2', v, 'شباك', [
        { step: 1, operation: 'rooms', value: np.rooms || 0 },
        { step: 2, operation: 'add_hall', value: 1, factor: 'صالة' },
        { step: 3, operation: 'multiply', value: 2, factor: 'شباكين لكل غرفة' },
        { step: 4, result: v, unit: 'شباك' }
      ], np);
    },
    'ALM-002': () => {
      const v = 1;
      return calcBreakdown('ALM-002', '1 (باب شرفة/منزلق)', v, 'باب', [
        { step: 1, result: v, unit: 'باب', note: 'باب ألمنيوم منزلق للشرفة' }
      ], np);
    },
    'ALM-004': () => {
      const windows = ((np.rooms || 0) + 1) * 2;
      const v = windows * 1.5;
      return calcBreakdown('ALM-004', 'windows_count × 1.5', v, 'م²', [
        { step: 1, operation: 'windows_count', value: windows, unit: 'شباك' },
        { step: 2, operation: 'multiply', value: 1.5, factor: '1.5 م² زجاج لكل شباك' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },

    // ==============================
    // أعمال العزل (Insulation)
    // ==============================
    'INS-001': () => {
      const v = (np.bathrooms || 0) * 15 + (np.kitchen || 0) * 10;
      return calcBreakdown('INS-001', 'bathrooms × 15 + kitchen × 10', v, 'م²', [
        { step: 1, operation: 'bathrooms_area', value: (np.bathrooms || 0) * 15, unit: 'م²', note: '15 م² لكل حمام' },
        { step: 2, operation: 'kitchen_area', value: (np.kitchen || 0) * 10, unit: 'م²', note: '10 م² للمطبخ' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'INS-002': () => {
      const v = np.area * 0.5;
      return calcBreakdown('INS-002', 'area × 0.5', v, 'م²', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.5, factor: 'نسبة العزل الحراري 50%' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'INS-003': () => {
      const isLuxury = ['فاخر', 'ممتاز'].includes(np.finishLevel);
      const v = isLuxury ? (np.rooms || 0) * 12 : 0;
      return calcBreakdown('INS-003', 'rooms × 12 (للفاخر)', v, 'م²', [
        { step: 1, operation: 'rooms', value: np.rooms || 0 },
        { step: 2, operation: 'finish_check', value: np.finishLevel, note: 'عزل صوتي للفاخر/ممتاز فقط' },
        { step: 3, operation: 'multiply', value: 12, factor: '12 م² عزل صوتي لكل غرفة' },
        { step: 4, result: v, unit: 'م²' }
      ], np);
    },
    'INS-005': () => {
      const v = np.hasRoof ? np.area * 0.3 : 0;
      return calcBreakdown('INS-005', 'area × 0.3 (للسطح)', v, 'م²', [
        { step: 1, operation: 'has_roof', value: np.hasRoof, note: 'يوجد سطح؟' },
        { step: 2, operation: 'roof_area', value: np.area * 0.3, unit: 'م²', factor: '30% من المساحة للسطح' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },

    // ==============================
    // أعمال الإنارة (Lighting)
    // ==============================
    'LIG-001': () => {
      const v = (np.rooms || 0) * 2;
      return calcBreakdown('LIG-001', 'rooms × 2', v, 'قطعة', [
        { step: 1, operation: 'rooms', value: np.rooms || 0 },
        { step: 2, operation: 'multiply', value: 2, factor: 'نورتين لكل غرفة' },
        { step: 3, result: v, unit: 'قطعة' }
      ], np);
    },
    'LIG-002': () => {
      let v;
      if (np.area < 100) v = 2;
      else if (np.area < 200) v = 3;
      else v = 4;
      return calcBreakdown('LIG-002', '2-4 حسب المساحة', v, 'قطعة', [
        { step: 1, operation: 'area_check', value: np.area, unit: 'م²', note: 'صالة: 2-4 إنارة حسب المساحة' },
        { step: 2, result: v, unit: 'قطعة' }
      ], np);
    },
    'LIG-003': () => {
      const v = (np.kitchen || 0) * 3;
      return calcBreakdown('LIG-003', '3 (للمطبخ)', v, 'قطعة', [
        { step: 1, result: v, unit: 'قطعة', note: '3 إنارة للمطبخ' }
      ], np);
    },
    'LIG-004': () => {
      const v = (np.bathrooms || 0) * 2;
      return calcBreakdown('LIG-004', 'bathrooms × 2', v, 'قطعة', [
        { step: 1, operation: 'bathrooms', value: np.bathrooms || 0 },
        { step: 2, operation: 'multiply', value: 2, factor: 'نورتين لكل دورة مياه' },
        { step: 3, result: v, unit: 'قطعة' }
      ], np);
    },
    'LIG-005': () => {
      const v = Math.ceil(((np.rooms || 0) + (np.bathrooms || 0)) * 0.3);
      return calcBreakdown('LIG-005', '(rooms + bathrooms) × 0.3', v, 'قطعة', [
        { step: 1, operation: 'total_spaces', value: (np.rooms || 0) + (np.bathrooms || 0) },
        { step: 2, operation: 'multiply', value: 0.3, factor: '30% كشافات طوارئ' },
        { step: 3, result: v, unit: 'قطعة' }
      ], np);
    },

    // ==============================
    // أعمال التشغيل والتسليم
    // ==============================
    'OPR-001': () => calcBreakdown('OPR-001', '1 (ثابت)', 1, 'نظام', [{ step: 1, result: 1, unit: 'نظام', note: 'اختبارات كهرباء شاملة' }], np),
    'OPR-002': () => calcBreakdown('OPR-002', '1 (ثابت)', 1, 'نظام', [{ step: 1, result: 1, unit: 'نظام', note: 'اختبارات سباكة شاملة' }], np),
    'OPR-003': () => calcBreakdown('OPR-003', '1 (ثابت)', 1, 'نظام', [{ step: 1, result: 1, unit: 'نظام', note: 'تشغيل أنظمة المبنى' }], np),
    'OPR-004': () => {
      const v = np.area * 0.1;
      return calcBreakdown('OPR-004', 'area × 0.1', v, 'ساعة', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.1, factor: '0.1 ساعة عمل لكل م²' },
        { step: 3, result: v, unit: 'ساعة' }
      ], np);
    },
    'OPR-005': () => calcBreakdown('OPR-005', '1 (ثابت)', 1, 'نظام', [{ step: 1, result: 1, unit: 'نظام', note: 'تسليم الصيانة' }], np),
    'OPR-006': () => calcBreakdown('OPR-006', '1 (ثابت)', 1, 'نسخة', [{ step: 1, result: 1, unit: 'نسخة', note: 'دليل الصيانة' }], np),

    // ==============================
    // CON, EXC, BLK, PLA (Structural)
    // ==============================
    'CON-001': () => {
      const factors = { فيلا: 0.45, 'مبنى سكني': 0.35, مكتب: 0.35, 'محل تجاري': 0.5 };
      const f = factors[np.projectType] || 0.35;
      const v = np.area * f;
      return calcBreakdown('CON-001', `area × ${f}`, v, 'م³', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: f, factor: `معامل الخرسانة لـ ${np.projectType}` },
        { step: 3, result: v, unit: 'م³' }
      ], np);
    },
    'CON-002': () => {
      const v = np.area * 0.05;
      return calcBreakdown('CON-002', 'area × 0.05', v, 'م³', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.05, factor: 'خرسانة عادية للنظافة' },
        { step: 3, result: v, unit: 'م³' }
      ], np);
    },
    'CON-003': () => {
      const factors = { فيلا: 110, 'مبنى سكني': 100, مكتب: 100, 'محل تجاري': 135 };
      const f = factors[np.projectType] || 100;
      const concrete = np.area * (np.projectType === 'فيلا' ? 0.45 : 0.35);
      const v = concrete * f;
      return calcBreakdown('CON-003', `concrete_volume × ${f}`, v, 'كجم', [
        { step: 1, operation: 'concrete_volume', value: concrete, unit: 'م³', note: 'حجم الخرسانة' },
        { step: 2, operation: 'multiply', value: f, factor: `${f} كجم/م³` },
        { step: 3, result: v, unit: 'كجم' }
      ], np);
    },
    'CON-004': () => {
      const v = np.area * 60;
      return calcBreakdown('CON-004', 'area × 60', v, 'طوبة', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 60, factor: '60 طوبة/م²' },
        { step: 3, result: v, unit: 'طوبة' }
      ], np);
    },
    'CON-005': () => {
      const v = np.area;
      return calcBreakdown('CON-005', 'area × 1.0', v, 'م²', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, result: v, unit: 'م²', note: 'نفس مساحة الأرضية' }
      ], np);
    },
    'EXC-001': () => {
      const v = np.area * 0.2;
      return calcBreakdown('EXC-001', 'area × 0.2', v, 'م³', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.2, factor: 'عمق حفر تقديري 0.2 م³/م²' },
        { step: 3, result: v, unit: 'م³' }
      ], np);
    },
    'EXC-002': () => {
      const v = np.area * 0.1;
      return calcBreakdown('EXC-002', 'area × 0.1', v, 'م³', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.1, factor: 'ردم 0.1 م³/م²' },
        { step: 3, result: v, unit: 'م³' }
      ], np);
    },
    'EXC-003': () => {
      const v = np.area * 0.7;
      return calcBreakdown('EXC-003', 'area × 0.7', v, 'م²', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.7, factor: '70% من المساحة' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'EXC-004': () => {
      const wArea = wallArea(np);
      const v = wArea * 0.15;
      return calcBreakdown('EXC-004', 'wall_area × 0.15', v, 'م²', [
        { step: 1, operation: 'wall_area', value: wArea, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.15, factor: 'نسبة معالجة الشقوق' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'EXC-005': () => {
      const v = Math.max(10, np.area * 0.05);
      return calcBreakdown('EXC-005', 'max(10, area × 0.05)', v, 'م²', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.05, factor: '5% من المساحة' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'EXC-006': () => {
      const v = (np.bathrooms || 0) * 2;
      return calcBreakdown('EXC-006', 'bathrooms × 2', v, 'قطعة', [
        { step: 1, operation: 'bathrooms', value: np.bathrooms || 0 },
        { step: 2, operation: 'multiply', value: 2, factor: 'أدوات صحية لكل حمام' },
        { step: 3, result: v, unit: 'قطعة' }
      ], np);
    },
    'BLK-001': () => {
      const v = np.area * 25;
      return calcBreakdown('BLK-001', 'area × 25', v, 'طوبة', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 25, factor: '25 طوبة/م²' },
        { step: 3, result: v, unit: 'طوبة' }
      ], np);
    },
    'BLK-002': () => {
      const v = np.area * 10;
      return calcBreakdown('BLK-002', 'area × 10', v, 'قطعة', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 10, factor: '10 طوب/م²' },
        { step: 3, result: v, unit: 'قطعة' }
      ], np);
    },
    'BLK-003': () => {
      const v = np.area * 0.02;
      return calcBreakdown('BLK-003', 'area × 0.02', v, 'م³', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.02, factor: 'مونة أسمنتية' },
        { step: 3, result: v, unit: 'م³' }
      ], np);
    },
    'PLA-001': () => {
      const v = np.area * 2;
      return calcBreakdown('PLA-001', 'area × 2', v, 'م²', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 2, factor: 'معامل اللياسة' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'PLA-002': () => {
      const v = np.area * 0.6;
      return calcBreakdown('PLA-002', 'area × 0.6', v, 'م²', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.6, factor: '60% من المساحة' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'PLA-003': () => {
      const v = np.area * 0.3;
      return calcBreakdown('PLA-003', 'area × 0.3', v, 'م²', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.3, factor: '30% من المساحة' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'ALM-003': () => {
      const v = Math.round(np.area * 0.15);
      return calcBreakdown('ALM-003', 'area × 0.15', v, 'م²', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.15, factor: '15% واجهات ألمنيوم' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'ALM-005': () => {
      const v = Math.round(np.area * 0.25);
      return calcBreakdown('ALM-005', 'area × 0.25', v, 'م²', [
        { step: 1, operation: 'total_area', value: np.area, unit: 'م²' },
        { step: 2, operation: 'multiply', value: 0.25, factor: '25% كلادينج' },
        { step: 3, result: v, unit: 'م²' }
      ], np);
    },
    'ALM-006': () => {
      const v = Math.max(1, Math.round(((np.rooms || 0) + 1) / 3));
      return calcBreakdown('ALM-006', 'max(1, (rooms+1)÷3)', v, 'باب', [
        { step: 1, operation: 'total_spaces', value: (np.rooms || 0) + 1 },
        { step: 2, operation: 'divide', value: 3, factor: 'باب ألمنيوم لكل 3 غرف' },
        { step: 3, result: v, unit: 'باب' }
      ], np);
    },
    'ELC-006': () => calcBreakdown('ELC-006', '1 (ثابت)', 1, 'قطعة', [{ step: 1, result: 1, unit: 'قطعة', note: 'قاطع رئيسي واحد' }], np),
    'ELC-007': () => {
      const v = Math.max(1, np.floorCount || 1);
      return calcBreakdown('ELC-007', 'max(1, floorCount)', v, 'قطعة', [
        { step: 1, operation: 'floor_count', value: np.floorCount || 1 },
        { step: 2, result: v, unit: 'قطعة', note: 'لوحة توزيع لكل دور' }
      ], np);
    },
    'ELC-008': () => {
      const pts = totalPoints(np);
      const v = Math.ceil(pts / 4) + Math.ceil((np.rooms || 0) / 2);
      return calcBreakdown('ELC-008', 'ceil(points/4) + ceil(rooms/2)', v, 'قطعة', [
        { step: 1, operation: 'total_points', value: pts },
        { step: 2, operation: 'lighting_breakers', value: Math.ceil(pts / 4), note: 'قاطع لكل 4 دوائر' },
        { step: 3, operation: 'socket_breakers', value: Math.ceil((np.rooms || 0) / 2), note: 'قاطع لكل دائرتين أفياش' },
        { step: 4, result: v, unit: 'قطعة' }
      ], np);
    },
    'ELC-009': () => {
      const v = np.area * 0.1;
      return calcBreakdown('ELC-009', 'area × 0.1', v, 'م', [{ step: 1, operation: 'total_area', value: np.area, unit: 'م²' }, { step: 2, operation: 'multiply', value: 0.1, factor: '0.1 م/م²' }, { step: 3, result: v, unit: 'م' }], np);
    },
    'ELC-011': () => {
      const v = Math.ceil(np.area * 0.15);
      return calcBreakdown('ELC-011', 'ceil(area × 0.15)', v, 'قطعة', [{ step: 1, operation: 'total_area', value: np.area, unit: 'م²' }, { step: 2, operation: 'multiply', value: 0.15, factor: 'تأريض' }, { step: 3, result: v, unit: 'قطعة' }], np);
    },
    'ELC-013': () => calcBreakdown('ELC-013', '1 (ثابت)', 1, 'نظام', [{ step: 1, result: 1, unit: 'نظام', note: 'نظام جرس باب واحد' }], np),
    'ELC-014': () => {
      const v = Math.max(2, Math.round((np.rooms || 0) / 2));
      return calcBreakdown('ELC-014', 'max(2, rooms÷2)', v, 'كاميرا', [{ step: 1, operation: 'rooms', value: np.rooms || 0 }, { step: 2, operation: 'divide', value: 2, factor: 'كاميرا لكل غرفتين' }, { step: 3, result: v, unit: 'كاميرا' }], np);
    },
    'ELC-015': () => {
      const v = (np.rooms || 0) * 15;
      return calcBreakdown('ELC-015', 'rooms × 15', v, 'م', [{ step: 1, operation: 'rooms', value: np.rooms || 0 }, { step: 2, operation: 'multiply', value: 15, factor: '15 م كابل لكل غرفة' }, { step: 3, result: v, unit: 'م' }], np);
    },
    'ELC-016': () => calcBreakdown('ELC-016', '1 (ثابت)', 1, 'نظام', [{ step: 1, result: 1, unit: 'نظام', note: 'نظام إنذار واحد' }], np),
    'ELC-017': () => {
      const v = Math.max(2, Math.round(np.area / 100));
      return calcBreakdown('ELC-017', 'max(2, area÷100)', v, 'قطعة', [{ step: 1, operation: 'total_area', value: np.area, unit: 'م²' }, { step: 2, operation: 'divide', value: 100, factor: 'طفاية لكل 100 م²' }, { step: 3, result: v, unit: 'قطعة' }], np);
    },
    'ELC-018': () => calcBreakdown('ELC-018', '1 (ثابت)', 1, 'نظام', [{ step: 1, result: 1, unit: 'نظام', note: 'نظام منزل ذكي واحد' }], np),
    'ELC-019': () => calcBreakdown('ELC-019', '1 (ثابت)', 1, 'نظام', [{ step: 1, result: 1, unit: 'نظام', note: 'مصعد واحد' }], np),
    'PLM-004': () => calcBreakdown('PLM-004', '1 (ثابت)', 1, 'قطعة', [{ step: 1, result: 1, unit: 'قطعة', note: 'مضخة مياه رئيسية واحدة' }], np),
    'PLM-010': () => calcBreakdown('PLM-010', '1 (ثابت)', 1, 'قطعة', [{ step: 1, result: 1, unit: 'قطعة', note: 'خلاط مطبخ واحد' }], np),
    'PLM-011': () => {
      const v = (np.bathrooms || 0) * 1;
      return calcBreakdown('PLM-011', 'bathrooms × 1', v, 'قطعة', [{ step: 1, operation: 'bathrooms', value: np.bathrooms || 0 }, { step: 2, result: v, unit: 'قطعة', note: 'خلاط حوض لكل حمام' }], np);
    },
    'PLM-012': () => {
      const v = (np.bathrooms || 0) * 1;
      return calcBreakdown('PLM-012', 'bathrooms × 1', v, 'قطعة', [{ step: 1, operation: 'bathrooms', value: np.bathrooms || 0 }, { step: 2, result: v, unit: 'قطعة', note: 'خلاط دش لكل حمام' }], np);
    },
    'PLM-013': () => {
      const v = (np.bathrooms || 0) * 1;
      return calcBreakdown('PLM-013', 'bathrooms × 1', v, 'قطعة', [{ step: 1, operation: 'bathrooms', value: np.bathrooms || 0 }, { step: 2, result: v, unit: 'قطعة', note: 'مغسلة لكل حمام' }], np);
    },
    'PLM-014': () => calcBreakdown('PLM-014', '1 (ثابت)', 1, 'قطعة', [{ step: 1, result: 1, unit: 'قطعة', note: 'محبس غسالة واحد' }], np),
    'PLM-015': () => {
      const v = (np.bathrooms || 0) * 1;
      return calcBreakdown('PLM-015', 'bathrooms × 1', v, 'قطعة', [{ step: 1, operation: 'bathrooms', value: np.bathrooms || 0 }, { step: 2, result: v, unit: 'قطعة', note: 'مرحاض لكل حمام' }], np);
    },
    'PLM-016': () => {
      const v = 30 + ((np.floorCount || 1) - 1) * 20;
      return calcBreakdown('PLM-016', '30 + (floors-1) × 20', v, 'م', [{ step: 1, operation: 'base_length', value: 30, unit: 'م' }, { step: 2, operation: 'extra_floors', value: ((np.floorCount || 1) - 1) * 20, unit: 'م' }, { step: 3, result: v, unit: 'م' }], np);
    },
    'PLM-017': () => {
      const v = (np.floorCount || 1) > 1 ? (np.floorCount || 1) * 2 : 1;
      return calcBreakdown('PLM-017', 'floors×2 (لمتعدد) / 1', v, 'قطعة', [{ step: 1, operation: 'floor_count', value: np.floorCount || 1 }, { step: 2, result: v, unit: 'قطعة' }], np);
    },
    'PLM-018': () => {
      const v = (np.floorCount || 1) > 1 ? (np.floorCount || 1) * 2 : 1;
      return calcBreakdown('PLM-018', 'floors×2 (لمتعدد) / 1', v, 'قطعة', [{ step: 1, operation: 'floor_count', value: np.floorCount || 1 }, { step: 2, result: v, unit: 'قطعة' }], np);
    },
    'HVAC-003': () => {
      const v = Math.max(0, (np.rooms || 0) - 2);
      return calcBreakdown('HVAC-003', 'max(0, rooms-2)', v, 'وحدة', [{ step: 1, operation: 'rooms', value: np.rooms || 0 }, { step: 2, operation: 'subtract', value: 2, note: 'مكيفات صغيرة للغرف الصغيرة' }, { step: 3, result: v, unit: 'وحدة' }], np);
    },
    'HVAC-005': () => {
      const v = ((np.rooms || 0) + 1) * 5;
      return calcBreakdown('HVAC-005', '(rooms+1) × 5', v, 'م', [{ step: 1, operation: 'units', value: (np.rooms || 0) + 1 }, { step: 2, operation: 'multiply', value: 5, factor: '5 م مواسير لكل وحدة' }, { step: 3, result: v, unit: 'م' }], np);
    },
    'HVAC-007': () => {
      const v = Math.max(2, Math.round((np.rooms || 0) / 2));
      return calcBreakdown('HVAC-007', 'max(2, rooms÷2)', v, 'قطعة', [{ step: 1, operation: 'rooms', value: np.rooms || 0 }, { step: 2, operation: 'divide', value: 2, factor: 'منظم لكل منطقتين' }, { step: 3, result: v, unit: 'قطعة' }], np);
    },
    'HVAC-008': () => {
      const v = Math.ceil((np.rooms || 0) / 2);
      return calcBreakdown('HVAC-008', 'ceil(rooms÷2)', v, 'وحدة', [{ step: 1, operation: 'rooms', value: np.rooms || 0 }, { step: 2, operation: 'divide', value: 2, factor: 'كاسيت لكل غرفتين' }, { step: 3, result: v, unit: 'وحدة' }], np);
    },
    'WOD-005': () => {
      const v = (np.rooms || 0) * 3;
      return calcBreakdown('WOD-005', 'rooms × 3', v, 'م', [{ step: 1, operation: 'rooms', value: np.rooms || 0 }, { step: 2, operation: 'multiply', value: 3, factor: '3 م خزائن لكل غرفة' }, { step: 3, result: v, unit: 'م' }], np);
    },
    'WOD-006': () => {
      const v = np.area * 0.3;
      return calcBreakdown('WOD-006', 'area × 0.3', v, 'م²', [{ step: 1, operation: 'total_area', value: np.area, unit: 'م²' }, { step: 2, operation: 'multiply', value: 0.3, factor: '30% أسقف معلقة' }, { step: 3, result: v, unit: 'م²' }], np);
    },
    'WOD-008': () => {
      const v = np.area * 0.1;
      return calcBreakdown('WOD-008', 'area × 0.1', v, 'م²', [{ step: 1, operation: 'total_area', value: np.area, unit: 'م²' }, { step: 2, operation: 'multiply', value: 0.1, factor: '10% ديكور خشبي' }, { step: 3, result: v, unit: 'م²' }], np);
    },
    'WOD-009': () => {
      const v = Math.sqrt(np.area) * 4 * 0.5;
      return calcBreakdown('WOD-009', 'sqrt(area) × 4 × 0.5', v, 'م', [{ step: 1, operation: 'perimeter', value: Math.sqrt(np.area) * 4, unit: 'م' }, { step: 2, operation: 'multiply', value: 0.5, factor: '50% براويز' }, { step: 3, result: v, unit: 'م' }], np);
    },
    'WOD-010': () => {
      const v = np.area * 0.15;
      return calcBreakdown('WOD-010', 'area × 0.15', v, 'م²', [{ step: 1, operation: 'total_area', value: np.area, unit: 'م²' }, { step: 2, operation: 'multiply', value: 0.15, factor: '15% باركيه' }, { step: 3, result: v, unit: 'م²' }], np);
    },
    'INS-004': () => calcBreakdown('INS-004', '120 م² (نموذجي 8×4×2.5)', 120, 'م²', [{ step: 1, result: 120, unit: 'م²', note: 'مساحة مسبح نموذجية 8×4×2.5 م' }], np),
    'FLR-009': () => {
      const v = (np.bathrooms || 0) * 35;
      return calcBreakdown('FLR-009', 'bathrooms × 35', v, 'م²', [{ step: 1, operation: 'bathrooms', value: np.bathrooms || 0 }, { step: 2, operation: 'multiply', value: 35, factor: '35 م² سيراميك حوائط لكل حمام' }, { step: 3, result: v, unit: 'م²' }], np);
    },
    'FLR-010': () => {
      const v = np.area * 0.7;
      return calcBreakdown('FLR-010', 'area × 0.7', v, 'م²', [{ step: 1, operation: 'total_area', value: np.area, unit: 'م²' }, { step: 2, operation: 'multiply', value: 0.7, factor: '70% بلاط/سيراميك' }, { step: 3, result: v, unit: 'م²' }], np);
    },
    'FLR-011': () => {
      const v = Math.min(np.area * 0.05, 60);
      return calcBreakdown('FLR-011', 'min(area×0.05, 60)', v, 'م²', [{ step: 1, operation: 'total_area', value: np.area, unit: 'م²' }, { step: 2, operation: 'multiply', value: 0.05, factor: '5% للمداخل' }, { step: 3, result: v, unit: 'م²' }], np);
    },
    'FLR-012': () => {
      const v = Math.min(np.area * 0.03, 20);
      return calcBreakdown('FLR-012', 'min(area×0.03, 20)', v, 'م²', [{ step: 1, operation: 'total_area', value: np.area, unit: 'م²' }, { step: 2, operation: 'multiply', value: 0.03, factor: '3% رخام للمدخل' }, { step: 3, result: v, unit: 'م²' }], np);
    },
    'PNT-007': () => {
      const v = np.area;
      return calcBreakdown('PNT-007', 'area × 1.0', v, 'م²', [{ step: 1, operation: 'total_area', value: np.area, unit: 'م²' }, { step: 2, result: v, unit: 'م²', note: 'دهان أسقف = مساحة الأرضية' }], np);
    }
  };

  return registry;
}

function calculate(itemCode, projectParams) {
  const np = normalizeParams(projectParams);
  const reg = build(projectParams);
  const fn = reg[itemCode];
  if (!fn) return null;
  const result = fn();
  return { quantity: result.quantity, min: result.min, max: result.max, unit: result.unit || result.breakdown?.unit, confidence: result.confidence, method: result.method, breakdown: result.breakdown };
}

function calculateAll(items, projectParams) {
  const np = normalizeParams(projectParams);
  const reg = build(projectParams);
  const dict = itemDictionary || {};
  return items.map(item => {
    const isString = typeof item === 'string';
    const code = isString ? item : item.code || item.itemCode;
    const fn = reg[code];
    if (!fn) return { ...(isString ? {} : item), code, quantity: 0, quantity_calculated: false, error: 'No formula found' };
    const result = fn();
    const base = isString ? {} : Object.assign({}, item);
    return Object.assign(base, {
      itemCode: code,
      quantity: result.quantity,
      min: result.min,
      max: result.max,
      confidence: result.confidence,
      method: result.method,
      unit: result.breakdown.unit,
      quantity_calculated: true
    });
  });
}

function getCalculationBreakdown(itemCode, projectParams) {
  const reg = build(projectParams);
  const fn = reg[itemCode];
  if (!fn) return null;
  const result = fn();
  return {
    itemCode,
    formula: result.method,
    steps: result.breakdown.steps || [],
    result: result.quantity,
    unit: result.breakdown.unit
  };
}

const formulaMeta = {
  'FLR-001': { formula: 'area × 1.0', description: 'تجهيز الأرضية بالكامل', parameters: ['area'], unit: 'م²' },
  'FLR-002': { formula: 'area × 0.85', description: 'تسوية الأرضية (85% من المساحة)', parameters: ['area'], unit: 'م²' },
  'FLR-004': { formula: 'area × 0.70', description: 'بلاط بورسلين (70% من المساحة)', parameters: ['area'], unit: 'م²' },
  'FLR-005': { formula: 'area × 0.30', description: 'سيراميك (30% حمامات/مطبخ)', parameters: ['area'], unit: 'م²' },
  'FLR-006': { formula: 'tiles_area × 0.05', description: 'لاصق بلاط (5 كجم/م²)', parameters: ['area'], unit: 'كجم' },
  'FLR-007': { formula: 'tiles_area × 0.02', description: 'ترويبة (2 كجم/م²)', parameters: ['area'], unit: 'كجم' },
  'FLR-008': { formula: '(sqrt(area) × 4 × rooms) × 0.7', description: 'وزرات (محيط الغرف)', parameters: ['area', 'rooms'], unit: 'م' },
  'PNT-001': { formula: 'wall_area × 0.15', description: 'معالجة شقوق (15% من الجدران)', parameters: ['area', 'rooms', 'hasHall'], unit: 'م²' },
  'PNT-002': { formula: 'wall_area × 1.0', description: 'صنفرة الجدران بالكامل', parameters: ['area', 'rooms', 'hasHall'], unit: 'م²' },
  'PNT-003': { formula: 'wall_area × 0.3', description: 'معجون (0.3 كجم/م²)', parameters: ['area', 'rooms', 'hasHall'], unit: 'كجم' },
  'PNT-004': { formula: 'wall_area × 1.0', description: 'طبقة أساس للجدران', parameters: ['area', 'rooms', 'hasHall'], unit: 'م²' },
  'PNT-005': { formula: 'wall_area × 1.0', description: 'دهان جدران (مساحة الجدران كاملة)', parameters: ['area', 'rooms', 'hasHall'], unit: 'م²' },
  'PNT-006': { formula: 'external_wall_area (للفيلا)', description: 'دهان خارجي (للفيلا فقط)', parameters: ['area', 'projectType'], unit: 'م²' },
  'PNT-008': { formula: 'ceil_area = area × 1.0', description: 'دهان أسقف (نفس مساحة الأرضية)', parameters: ['area'], unit: 'م²' },
  'ELC-001': { formula: 'total_points × 15', description: 'كابلات نحاس (15 م لكل نقطة)', parameters: ['rooms', 'bathrooms', 'hasKitchen', 'hasHall'], unit: 'م' },
  'ELC-002': { formula: 'rooms + bathrooms + 3', description: 'قواطع كهرباء', parameters: ['rooms', 'bathrooms'], unit: 'قطعة' },
  'ELC-003': { formula: 'total_points × 0.35', description: 'مفاتيح كهرباء (35% من النقاط)', parameters: ['rooms', 'bathrooms', 'hasKitchen', 'hasHall'], unit: 'قطعة' },
  'ELC-004': { formula: 'total_points × 0.45', description: 'أفياش كهرباء (45% من النقاط)', parameters: ['rooms', 'bathrooms', 'hasKitchen', 'hasHall'], unit: 'قطعة' },
  'ELC-005': { formula: 'total_points × 12', description: 'تمديدات كهرباء (12 م لكل نقطة)', parameters: ['rooms', 'bathrooms', 'hasKitchen', 'hasHall'], unit: 'م' },
  'ELC-010': { formula: '1 (ثابت)', description: 'تمديد أرضي - نظام واحد', parameters: [], unit: 'نظام' },
  'ELC-012': { formula: '1 (ثابت)', description: 'عداد كهرباء رئيسي', parameters: [], unit: 'قطعة' },
  'PLM-001': { formula: '(bathrooms + kitchen) × 15', description: 'مواسير مياه ساخن', parameters: ['bathrooms', 'hasKitchen'], unit: 'م' },
  'PLM-002': { formula: '(bathrooms + kitchen) × 15', description: 'مواسير مياه بارد', parameters: ['bathrooms', 'hasKitchen'], unit: 'م' },
  'PLM-003': { formula: '(bathrooms + kitchen) × 12', description: 'مواسير صرف', parameters: ['bathrooms', 'hasKitchen'], unit: 'م' },
  'PLM-005': { formula: 'bathrooms × 3 + kitchen × 2', description: 'حنفيات', parameters: ['bathrooms', 'hasKitchen'], unit: 'قطعة' },
  'PLM-006': { formula: 'bathrooms × 2 + kitchen × 1', description: 'خلاطات', parameters: ['bathrooms', 'hasKitchen'], unit: 'قطعة' },
  'PLM-007': { formula: 'bathrooms × 1', description: 'مرحاض', parameters: ['bathrooms'], unit: 'قطعة' },
  'PLM-008': { formula: 'bathrooms × 1 + kitchen × 1', description: 'مغاسل', parameters: ['bathrooms', 'hasKitchen'], unit: 'قطعة' },
  'PLM-009': { formula: 'bathrooms × 0.5', description: 'كابينة حمام (50% من الحمامات)', parameters: ['bathrooms'], unit: 'قطعة' },
  'HVAC-001': { formula: 'rooms + 1', description: 'مكيفات سبليت (غرفة + صالة)', parameters: ['rooms'], unit: 'وحدة' },
  'HVAC-002': { formula: '(rooms + 1) × 3', description: 'مجاري هواء (3 م لكل وحدة)', parameters: ['rooms'], unit: 'م' },
  'HVAC-004': { formula: '(rooms + 1) × 2', description: 'فلاتر هواء (2 لكل وحدة)', parameters: ['rooms'], unit: 'قطعة' },
  'HVAC-006': { formula: '(rooms + 1) × 5', description: 'عزل مواسير التكييف', parameters: ['rooms'], unit: 'م' },
  'WOD-001': { formula: 'rooms + bathrooms + 1', description: 'أبواب داخلية', parameters: ['rooms', 'bathrooms'], unit: 'باب' },
  'WOD-002': { formula: '2', description: 'أبواب خارجية (رئيسي + خلفي)', parameters: [], unit: 'باب' },
  'WOD-003': { formula: '1', description: 'مطبخ (طقم متكامل)', parameters: [], unit: 'طقم' },
  'WOD-004': { formula: 'rooms × 2', description: 'خزائن غرف نوم', parameters: ['rooms'], unit: 'قطعة' },
  'WOD-007': { formula: '1 (للفيلا/المدخل)', description: 'باب أمان', parameters: ['projectType'], unit: 'باب' },
  'ALM-001': { formula: '(rooms + 1) × 2', description: 'شبابيك ألمنيوم', parameters: ['rooms'], unit: 'شباك' },
  'ALM-002': { formula: '1', description: 'باب ألمنيوم (شرفة)', parameters: [], unit: 'باب' },
  'ALM-004': { formula: 'windows_count × 1.5', description: 'زجاج شبابيك', parameters: ['rooms'], unit: 'م²' },
  'INS-001': { formula: 'bathrooms × 15 + kitchen × 10', description: 'عزل مائي للحمامات والمطبخ', parameters: ['bathrooms', 'hasKitchen'], unit: 'م²' },
  'INS-002': { formula: 'area × 0.5', description: 'عزل حراري (50% من المساحة)', parameters: ['area'], unit: 'م²' },
  'INS-003': { formula: 'rooms × 12 (للفاخر)', description: 'عزل صوتي (للتشطيب الفاخر)', parameters: ['rooms', 'finishLevel'], unit: 'م²' },
  'INS-005': { formula: 'area × 0.3 (للسطح)', description: 'عزل سطح (30% من المساحة)', parameters: ['area', 'hasRoof'], unit: 'م²' },
  'LIG-001': { formula: 'rooms × 2', description: 'إنارة غرف (نورتين لكل غرفة)', parameters: ['rooms'], unit: 'قطعة' },
  'LIG-002': { formula: '2-4 حسب المساحة', description: 'إنارة صالات', parameters: ['area'], unit: 'قطعة' },
  'LIG-003': { formula: '3 للمطبخ', description: 'إنارة مطبخ', parameters: ['hasKitchen'], unit: 'قطعة' },
  'LIG-004': { formula: 'bathrooms × 2', description: 'إنارة دورات مياه', parameters: ['bathrooms'], unit: 'قطعة' },
  'LIG-005': { formula: '(rooms + bathrooms) × 0.3', description: 'كشاف طوارئ', parameters: ['rooms', 'bathrooms'], unit: 'قطعة' },
  'OPR-001': { formula: '1 (ثابت)', description: 'اختبارات كهرباء', parameters: [], unit: 'نظام' },
  'OPR-002': { formula: '1 (ثابت)', description: 'اختبارات سباكة', parameters: [], unit: 'نظام' },
  'OPR-003': { formula: '1 (ثابت)', description: 'تشغيل أنظمة', parameters: [], unit: 'نظام' },
  'OPR-004': { formula: 'area × 0.1', description: 'تنظيف نهائي (0.1 ساعة/م²)', parameters: ['area'], unit: 'ساعة' },
  'OPR-005': { formula: '1 (ثابت)', description: 'تسليم الصيانة', parameters: [], unit: 'نظام' },
  'OPR-006': { formula: '1 (ثابت)', description: 'دليل الصيانة', parameters: [], unit: 'نسخة' }
};

function getSupportedCalculations() {
  return formulaMeta;
}

function validateQuantity(itemCode, userQuantity, projectParams) {
  const result = calculate(itemCode, projectParams);
  if (!result) return { acceptable: false, deviation: 0, suggested_range: null, error: 'Item not found' };
  const est = result.quantity;
  if (est === 0) return { acceptable: userQuantity === 0, deviation: 0, suggested_range: { min: 0, max: 0 } };
  const deviation = ((userQuantity - est) / est) * 100;
  const absDev = Math.abs(deviation);
  const acceptable = userQuantity >= result.min && userQuantity <= result.max;
  return {
    acceptable,
    deviation: Math.round(deviation * 100) / 100,
    suggested_range: { min: result.min, max: result.max }
  };
}

function calculateBatch(itemsData, projectParams) {
  const np = normalizeParams(projectParams);
  const reg = build(projectParams);
  const results = itemsData.map(item => {
    const code = item.itemCode || item.code;
    const fn = reg[code];
    if (!fn) return { ...item, quantity: 0, error: 'No formula found', success: false };
    const r = fn();
    return { ...item, itemCode: code, ...r, success: true };
  });
  const successful = results.filter(r => r.success);
  const totalItems = results.length;
  const calculatedCount = successful.length;
  const avgConfidence = calculatedCount > 0
    ? Math.round((successful.reduce((s, r) => s + r.confidence, 0) / calculatedCount) * 100) / 100
    : 0;
  const totalQuantity = successful.reduce((s, r) => s + r.quantity, 0);
  return {
    results,
    summary: {
      totalItems,
      calculatedCount,
      failedCount: totalItems - calculatedCount,
      averageConfidence: avgConfidence,
      totalQuantity: Math.round(totalQuantity * 100) / 100
    }
  };
}

module.exports = {
  calculate,
  calculateAll,
  getCalculationBreakdown,
  getSupportedCalculations,
  validateQuantity,
  calculateBatch
};
