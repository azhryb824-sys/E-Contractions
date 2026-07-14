const BASIC_KEYWORDS = [
  'خرسانة', 'حديد', 'أسمنت', 'رمل', 'زلط', 'طوب', 'بلوك',
  'بلاط', 'سيراميك', 'بورسلين', 'دهان', 'جير', 'جبس', 'معجون',
  'عظم', 'بناء', 'صب',
];

const OPTIONAL_KEYWORDS = [
  'ديكور', 'زخرفة', 'إضاءة', 'ثريا', 'نجف', 'سبوت', 'ليد',
  'تحسين', 'تجميلي', 'خشب', 'باركيه', 'رخام', 'جرانيت',
  'كافيه', 'مطبخ', 'دولاب', 'مكتب', 'أثاث', 'ستارة',
];

const NECESSARY_KEYWORDS = [
  'سباكة', 'كهرباء', 'تمديدات', 'مواسير', 'تكييف',
  'عوازل', 'أبواب', 'شبابيك',
];

export function isBasicItem(name) {
  if (!name || typeof name !== 'string') return false;
  for (const kw of BASIC_KEYWORDS) {
    if (name.includes(kw)) return true;
  }
  return false;
}

export function isOptionalItem(name) {
  if (!name || typeof name !== 'string') return false;
  for (const kw of OPTIONAL_KEYWORDS) {
    if (name.includes(kw)) return true;
  }
  return false;
}

export function isNecessaryItem(name) {
  if (!name || typeof name !== 'string') return false;
  for (const kw of NECESSARY_KEYWORDS) {
    if (name.includes(kw)) return true;
  }
  return false;
}

export function classifyItem(name) {
  if (isBasicItem(name)) return 'أساسي';
  if (isNecessaryItem(name)) return 'ضروري';
  if (isOptionalItem(name)) return 'اختياري';
  return 'مرتبط';
}
