import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  RefreshCw, AlertCircle, Building2, Home, Maximize2, Layers,
  DoorOpen, Palette, MapPin, FileText, ListChecks, Eye,
  FileDown, CheckSquare, Clock, Target, Loader2
} from 'lucide-react'
import api from '../utils/api'
import { formatCurrency, formatNumber, getStatusColor, getAccuracyLabel } from '../utils/helpers'

const infoFields = [
  { key: 'project_type', label: 'نوع المشروع', icon: Building2 },
  { key: 'building_type', label: 'نوع المبنى', icon: Home },
  { key: 'area', label: 'المساحة', icon: Maximize2, suffix: 'م²' },
  { key: 'floor_count', label: 'عدد الطوابق', icon: Layers },
  { key: 'room_count', label: 'عدد الغرف', icon: DoorOpen },
  { key: 'finish_level', label: 'مستوى التشطيب', icon: Palette },
  { key: 'city', label: 'المدينة', icon: MapPin },
]

function InfoCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-9 w-9 bg-gray-200 rounded-lg" />
        <div className="h-4 w-20 bg-gray-200 rounded" />
      </div>
      <div className="h-7 w-16 bg-gray-200 rounded" />
    </div>
  )
}

function RowSkeleton() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded" /></td>
      ))}
    </tr>
  )
}

function HeaderSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-64 bg-gray-200 rounded" />
          <div className="flex gap-3">
            <div className="h-5 w-16 bg-gray-200 rounded-full" />
            <div className="h-5 w-24 bg-gray-200 rounded" />
          </div>
        </div>
        <div className="h-4 w-32 bg-gray-200 rounded" />
      </div>
    </div>
  )
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchProject()
  }, [id])

  async function fetchProject() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get(`/projects/${id}`)
      setProject(data)
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل بيانات المشروع')
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <p className="text-lg text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchProject}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          إعادة المحاولة
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <HeaderSkeleton />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {Array.from({ length: 7 }).map((_, i) => <InfoCardSkeleton key={i} />)}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
          <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="h-5 w-32 bg-gray-200 rounded" />
          </div>
          <div className="p-4">
            <table className="w-full">
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <FileText className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-gray-500">لم يتم العثور على المشروع</p>
      </div>
    )
  }

  const accuracyLabel = getAccuracyLabel(project.accuracy_level)
  const items = project.items || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">{project.title || project.name}</h1>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                {project.status}
              </span>
              {accuracyLabel && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  <Target className="w-3 h-3" />
                  {accuracyLabel}
                </span>
              )}
              {project.item_prediction_model && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <Target className="w-3 h-3" />
                  نموذج البنود {project.item_prediction_model}
                </span>
              )}
              {project.space_state_model && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                  <DoorOpen className="w-3 h-3" />
                  نموذج الفراغات {project.space_state_model}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            <span>آخر تحديث: {project.updated_at ? new Date(project.updated_at + 'Z').toLocaleDateString('ar-SA') : '—'}</span>
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {infoFields.map(field => {
          const Icon = field.icon
          const value = project[field.key]
          return (
            <div key={field.key} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-primary-50">
                  <Icon className="w-5 h-5 text-primary-600" />
                </div>
                <span className="text-xs text-gray-500">{field.label}</span>
              </div>
              <p className="text-lg font-bold text-gray-900">
                {value != null ? `${formatNumber(value)}${field.suffix ? ` ${field.suffix}` : ''}` : '—'}
              </p>
            </div>
          )
        })}
      </div>

      {/* Description */}
      {project.description && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-600" />
            وصف المشروع
          </h2>
          <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{project.description}</p>
        </div>
      )}

      {/* Assumptions */}
      {project.assumptions && project.assumptions.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-primary-600" />
            الافتراضات
          </h2>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            {project.assumptions.map((a, i) => <li key={i}>{typeof a === 'string' ? a : a.text || a.title || JSON.stringify(a)}</li>)}
          </ul>
        </div>
      ) : null}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Link
          to={`/projects/${id}/review`}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <Eye className="w-4 h-4" />
          مراجعة البنود
        </Link>
        <Link
          to={`/projects/${id}/suggestions`}
          className="flex items-center gap-2 px-5 py-2.5 bg-secondary-600 text-white rounded-lg hover:bg-secondary-700 transition-colors text-sm font-medium"
        >
          <ListChecks className="w-4 h-4" />
          عرض الاقتراحات
        </Link>
        <Link
          to={`/projects/${id}/files`}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
        >
          <FileDown className="w-4 h-4" />
          إنشاء الملفات
        </Link>
        <Link
          to={`/projects/${id}/approval`}
          className="flex items-center gap-2 px-5 py-2.5 border-2 border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors text-sm font-medium"
        >
          <CheckSquare className="w-4 h-4" />
          الاعتماد
        </Link>
      </div>

      {/* Items table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">بنود المشروع</h2>
          <span className="text-sm text-gray-500">إجمالي {formatNumber(items.length)} بند</span>
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-center text-gray-400">لا توجد بنود بعد</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="text-right px-4 py-3 font-medium">الكود</th>
                  <th className="text-right px-4 py-3 font-medium">البند</th>
                  <th className="text-right px-4 py-3 font-medium">التصنيف</th>
                  <th className="text-right px-4 py-3 font-medium">الكمية</th>
                  <th className="text-right px-4 py-3 font-medium">الوحدة</th>
                  <th className="text-right px-4 py-3 font-medium">المصدر</th>
                  <th className="text-right px-4 py-3 font-medium">الثقة</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const sourceColors = {
                    يدوي: 'bg-blue-100 text-blue-700',
                    تلقائي: 'bg-orange-100 text-orange-700',
                    النظام: 'bg-purple-100 text-purple-700',
                  }
                  const source = item.source || item.mode || 'النظام'
                  const sourceColor = sourceColors[source] || 'bg-gray-100 text-gray-600'
                  return (
                    <tr key={item._id || item.id || idx} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900 font-mono text-xs">{item.code || '—'}</td>
                      <td className="px-4 py-3 text-gray-900 font-medium">{item.name_ar || item.name || item.title}</td>
                      <td className="px-4 py-3 text-gray-600">{item.category || '—'}</td>
                      <td className="px-4 py-3 text-gray-900">
                        {Number.isFinite(item.quantity) && item.quantity > 0 ? formatNumber(item.quantity) : (
                          <span className="text-amber-700 text-xs">معلّقة: {item.quantity_state || 'تحتاج معلومات'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.unit || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${sourceColor}`}>
                          {source}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {item.confidence != null ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary-500"
                                style={{ width: `${Math.min(item.confidence * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{Math.round(item.confidence * 100)}%</span>
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
