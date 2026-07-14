import { useState, useEffect } from 'react'
import { RefreshCw, AlertCircle, Save, Settings as SettingsIcon, Percent, Building2, Zap, FileImage, Globe } from 'lucide-react'
import api from '../utils/api'

const settingFields = [
  {
    section: 'الإعدادات العامة',
    icon: SettingsIcon,
    fields: [
      { key: 'profit_margin_default', label: 'هامش الربح الافتراضي (%)', type: 'number', icon: Percent },
      { key: 'vat_rate', label: 'نسبة الضريبة المضافة (%)', type: 'number', icon: Percent },
      {
        key: 'default_finish_level', label: 'مستوى التشطيب الافتراضي', type: 'select',
        options: ['اقتصادي', 'متوسط', 'جيد جداً', 'فاخر'], icon: Building2,
      },
      { key: 'default_city', label: 'المدينة الافتراضية', type: 'text', icon: Globe },
    ],
  },
  {
    section: 'السلوك الذكي',
    icon: Zap,
    fields: [
      { key: 'auto_suggestions', label: 'الإضافات التلقائية', type: 'toggle', icon: Zap },
      { key: 'show_optional_items', label: 'عرض البنود الاختيارية', type: 'toggle', icon: Zap },
      {
        key: 'default_suggestion_mode', label: 'وضع الاقتراحات الافتراضي', type: 'select',
        options: ['بدون إضافات', 'إضافات تلقائية', 'عرض قبل التنفيذ'], icon: Zap,
      },
    ],
  },
  {
    section: 'عرض الملفات',
    icon: FileImage,
    fields: [
      { key: 'organization_logo', label: 'شعار المؤسسة', type: 'file', icon: FileImage },
      { key: 'organization_name', label: 'اسم المؤسسة', type: 'text', icon: Globe },
    ],
  },
]

function ToggleSwitch({ checked, onChange }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600" />
    </label>
  )
}

export default function Settings() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  async function fetchSettings() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get('/settings')
      setSettings(data || {})
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل الإعدادات')
    } finally {
      setLoading(false)
    }
  }

  function handleChange(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave(key) {
    setSaving(true)
    try {
      await api.put('/settings', { key, value: settings[key] })
      setToast({ type: 'success', message: 'تم حفظ الإعداد بنجاح' })
      setTimeout(() => setToast(null), 3000)
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'فشل حفظ الإعداد' })
      setTimeout(() => setToast(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAll() {
    setSaving(true)
    try {
      const promises = settingFields.flatMap(s =>
        s.fields.map(f => api.put('/settings', { key: f.key, value: settings[f.key] }))
      )
      await Promise.all(promises)
      setToast({ type: 'success', message: 'تم حفظ جميع الإعدادات بنجاح' })
      setTimeout(() => setToast(null), 3000)
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'فشل حفظ الإعدادات' })
      setTimeout(() => setToast(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <p className="text-lg text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchSettings}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          إعادة المحاولة
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إعدادات النظام</h1>
          <p className="mt-1 text-gray-500">تخصيص إعدادات النظام وتفضيلات المستخدم</p>
        </div>
        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          <Save className="w-4 h-4" />
          {saving ? 'جاري الحفظ...' : 'حفظ الكل'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 p-4 rounded-lg border text-sm ${
          toast.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {toast.type === 'success' ? '✓' : <AlertCircle className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Sections */}
      {loading ? (
        <div className="space-y-6 animate-pulse">
          {[1, 2, 3].map(s => (
            <div key={s} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
              <div className="h-6 w-40 bg-gray-200 rounded" />
              {[1, 2, 3].map(f => (
                <div key={f} className="space-y-2">
                  <div className="h-4 w-32 bg-gray-200 rounded" />
                  <div className="h-10 bg-gray-200 rounded-lg" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        settingFields.map(section => {
          const SectionIcon = section.icon
          return (
            <section key={section.section} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                <SectionIcon className="w-5 h-5 text-primary-600" />
                <h2 className="text-lg font-bold text-gray-900">{section.section}</h2>
              </div>

              <div className="space-y-5">
                {section.fields.map(field => {
                  const FieldIcon = field.icon
                  const value = settings[field.key]
                  return (
                    <div key={field.key}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <FieldIcon className="w-4 h-4 text-gray-400" />
                        <label className="text-sm font-medium text-gray-700">{field.label}</label>
                      </div>

                      <div className="flex items-start gap-3">
                        {field.type === 'toggle' ? (
                          <div className="flex items-center justify-between w-full pt-1">
                            <span className="text-sm text-gray-500">
                              {value ? 'مفعل' : 'معطل'}
                            </span>
                            <ToggleSwitch
                              checked={!!value}
                              onChange={() => handleChange(field.key, !value)}
                            />
                          </div>
                        ) : field.type === 'select' ? (
                          <div className="flex-1 flex gap-2">
                            <select
                              value={value || ''}
                              onChange={e => handleChange(field.key, e.target.value)}
                              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors bg-white text-sm"
                            >
                              <option value="">اختر...</option>
                              {field.options.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleSave(field.key)}
                              disabled={saving}
                              className="px-3 py-2 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 disabled:opacity-50 transition-colors"
                              title="حفظ"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                          </div>
                        ) : field.type === 'file' ? (
                          <div className="flex-1 flex gap-2 items-center">
                            <div className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-500 truncate">
                              {value || 'لم يتم اختيار ملف'}
                            </div>
                            <button
                              onClick={() => {
                                const path = prompt('أدخل مسار الشعار:')
                                if (path) handleChange(field.key, path)
                              }}
                              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                            >
                              اختيار
                            </button>
                            <button
                              onClick={() => handleSave(field.key)}
                              disabled={saving}
                              className="px-3 py-2 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 disabled:opacity-50 transition-colors"
                              title="حفظ"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex-1 flex gap-2">
                            <input
                              type={field.type}
                              value={value || ''}
                              onChange={e => handleChange(field.key, e.target.value)}
                              placeholder={`أدخل ${field.label}`}
                              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm"
                            />
                            <button
                              onClick={() => handleSave(field.key)}
                              disabled={saving}
                              className="px-3 py-2 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 disabled:opacity-50 transition-colors"
                              title="حفظ"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
