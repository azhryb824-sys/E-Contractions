export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '—';
  return new Intl.NumberFormat('ar-SA', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2
  }).format(amount);
}

export function formatNumber(num) {
  if (num == null || isNaN(num)) return '—';
  return new Intl.NumberFormat('ar-SA').format(num);
}

export function getStatusColor(status) {
  const colors = {
    'مسودة': 'bg-gray-100 text-gray-700',
    'قيد_المراجعة': 'bg-yellow-100 text-yellow-700',
    'معتمد': 'bg-green-100 text-green-700',
    'مرفوض': 'bg-red-100 text-red-700',
    'complete': 'bg-green-100 text-green-700',
    'تقدير_أولي': 'bg-yellow-50 text-yellow-600',
    'تقدير_متوسط': 'bg-blue-50 text-blue-600',
    'حصر_تفصيلي': 'bg-green-50 text-green-600',
    'حصر_مراجع': 'bg-purple-50 text-purple-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-600';
}

export function getAccuracyLabel(level) {
  const labels = {
    'تقدير_أولي': 'تقدير أولي',
    'تقدير_متوسط': 'تقدير متوسط الدقة',
    'حصر_تفصيلي': 'حصر تفصيلي',
    'حصر_مراجع': 'حصر مراجع',
  };
  return labels[level] || level;
}

export function getSuggestionTypeColor(type) {
  const colors = {
    'أساسي': 'bg-red-100 text-red-700 border-red-200',
    'ضروري': 'bg-orange-100 text-orange-700 border-orange-200',
    'مرتبط': 'bg-blue-100 text-blue-700 border-blue-200',
    'موصى_به': 'bg-green-100 text-green-700 border-green-200',
    'تحسين_جودة': 'bg-purple-100 text-purple-700 border-purple-200',
    'تقليل_مخاطر': 'bg-yellow-100 text-yellow-700 border-yellow-200',
    'اختياري': 'bg-gray-100 text-gray-600 border-gray-200',
    'يحتاج_تأكيد': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  };
  return colors[type] || 'bg-gray-100 text-gray-600';
}
