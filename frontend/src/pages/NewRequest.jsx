import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, AlertCircle, Loader2, Info } from 'lucide-react'
import api from '../utils/api'

const projectTypes = ['سكني', 'تجاري', 'مكتبي', 'صناعي', 'ترميم', 'تشطيب']
const buildingTypes = ['شقة', 'فيلا', 'عمارة سكنية', 'مبنى سكني', 'مبنى تجاري', 'مستودع', 'مخزن', 'أخرى']
const finishingLevels = ['اقتصادي', 'متوسط', 'جيد جداً', 'فاخر']

const executionOptions = [
  {
    value: 'basic',
    label: 'التنفيذ دون إضافات',
    desc: 'ينفذ الطلب كما هو دون إضافة بنود جديدة',
  },
  {
    value: 'auto',
    label: 'التنفيذ مع الإضافات الذكية',
    desc: 'يحلل النظام الهدف ويضيف البنود الضرورية تلقائياً',
  },
  {
    value: 'review',
    label: 'عرض الإضافات قبل التنفيذ',
    desc: 'يعرض النظام الإضافات المقترحة للموافقة',
  },
]

const initialForm = {
  title: '',
  description: '',
  projectType: '',
  buildingType: '',
  city: '',
  area: '',
  floors: '',
  rooms: '',
  finishingLevel: '',
  clientName: '',
  clientPhone: '',
  executionMode: 'basic',
}

export default function NewRequest() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  function setExecutionMode(value) {
    setForm(prev => ({ ...prev, executionMode: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('يرجى إدخال عنوان المشروع')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const payload = {
        title: form.title,
        description: form.description,
        project_type: form.projectType,
        building_type: form.buildingType,
        city: form.city,
        area: form.area ? Number(form.area) : undefined,
        floor_count: form.floors ? Number(form.floors) : undefined,
        room_count: form.rooms ? Number(form.rooms) : undefined,
        finish_level: form.finishingLevel,
      }
      const result = await api.post('/projects', payload)
      navigate(`/projects/${result.id}`)
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء إنشاء الطلب')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">إنشاء طلب جديد</h1>
        <p className="mt-1 text-gray-500">قم بتعبئة البيانات لإنشاء مشروع جديد وتحليل بنوده</p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic info */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-lg font-bold text-gray-900">معلومات المشروع</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              عنوان المشروع <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="أدخل عنوان المشروع"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">وصف المشروع</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={4}
              placeholder="أدخل وصفاً تفصيلياً للمشروع"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors resize-y"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">نوع المشروع</label>
              <select
                name="projectType"
                value={form.projectType}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors bg-white"
              >
                <option value="">اختر النوع</option>
                {projectTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">نوع المبنى</label>
              <select
                name="buildingType"
                value={form.buildingType}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors bg-white"
              >
                <option value="">اختر نوع المبنى</option>
                {buildingTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">المدينة</label>
              <input
                type="text"
                name="city"
                value={form.city}
                onChange={handleChange}
                placeholder="أدخل اسم المدينة"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">المساحة التقريبية</label>
              <div className="relative">
                <input
                  type="number"
                  name="area"
                  value={form.area}
                  onChange={handleChange}
                  placeholder="0"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">م2</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">عدد الطوابق</label>
              <input
                type="number"
                name="floors"
                value={form.floors}
                onChange={handleChange}
                placeholder="0"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">عدد الغرف</label>
              <input
                type="number"
                name="rooms"
                value={form.rooms}
                onChange={handleChange}
                placeholder="0"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">مستوى التشطيب</label>
              <select
                name="finishingLevel"
                value={form.finishingLevel}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors bg-white"
              >
                <option value="">اختر المستوى</option>
                {finishingLevels.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Client info */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-lg font-bold text-gray-900">بيانات العميل</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">اسم العميل</label>
              <input
                type="text"
                name="clientName"
                value={form.clientName}
                onChange={handleChange}
                placeholder="أدخل اسم العميل"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">هاتف العميل</label>
              <input
                type="text"
                name="clientPhone"
                value={form.clientPhone}
                onChange={handleChange}
                placeholder="05XXXXXXXX"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
              />
            </div>
          </div>
        </section>

        {/* Execution mode */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">خيارات التنفيذ</h2>
            <Info className="w-4 h-4 text-gray-400" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {executionOptions.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setExecutionMode(opt.value)}
                className={`text-right p-4 rounded-xl border-2 transition-all ${
                  form.executionMode === opt.value
                    ? 'border-primary-500 bg-primary-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    form.executionMode === opt.value ? 'border-primary-500' : 'border-gray-300'
                  }`}>
                    {form.executionMode === opt.value && (
                      <div className="w-2.5 h-2.5 rounded-full bg-primary-500" />
                    )}
                  </div>
                  <span className={`font-bold text-sm ${
                    form.executionMode === opt.value ? 'text-primary-700' : 'text-gray-900'
                  }`}>
                    {opt.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 pr-8">{opt.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-base"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            {loading ? 'جاري إنشاء المشروع...' : 'إنشاء المشروع وتحليل'}
          </button>
        </div>
      </form>
    </div>
  )
}
