import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  RefreshCw, AlertCircle, Loader2, CheckSquare, FileText, X,
  ClipboardCheck, FileCheck, MessageSquareText, Send, Edit3,
  BadgeCheck, Clock, Target, ListChecks, Package, DollarSign,
  Files, ChevronLeft
} from 'lucide-react'
import api from '../utils/api'
import { formatCurrency, formatNumber, getStatusColor, getAccuracyLabel } from '../utils/helpers'

const checklistItems = [
  { key: 'items', label: 'تمت مراجعة البنود', icon: ListChecks },
  { key: 'quantities', label: 'تم التحقق من الكميات', icon: Package },
  { key: 'prices', label: 'تم مراجعة الأسعار', icon: DollarSign },
  { key: 'files', label: 'تم اعتماد الملفات', icon: FileCheck },
]

function SectionSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse space-y-4">
      <div className="h-5 w-40 bg-gray-200 rounded" />
      <div className="h-4 w-full bg-gray-200 rounded" />
      <div className="h-4 w-3/4 bg-gray-200 rounded" />
    </div>
  )
}

export default function Approval() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [items, setItems] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [checklist, setChecklist] = useState({
    items: false,
    quantities: false,
    prices: false,
    files: false,
  })
  const [notes, setNotes] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const [projectData, itemsData, filesData] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/items/${id}`),
        api.get(`/files/${id}`),
      ])
      setProject(projectData)
      setItems(Array.isArray(itemsData) ? itemsData : [])
      setFiles(Array.isArray(filesData) ? filesData : [])
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  function toggleChecklist(key) {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const allChecked = Object.values(checklist).every(Boolean)

  const approvedItems = items.filter(item => item.status === 'معتمد' || item.approved)
  const approvedFiles = files.filter(f => f.status === 'معتمد')

  const totalCost = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0
    const mat = Number(item.materialCost) || 0
    const lab = Number(item.laborCost) || 0
    return sum + qty * (mat + lab)
  }, 0)

  async function handleApprove() {
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/projects/${id}/approve`, {
        notes: notes.trim(),
        checklist,
      })
      setProject(prev => ({ ...prev, status: 'معتمد' }))
      setShowConfirm(false)
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء اعتماد المشروع')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRequestModification() {
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/projects/${id}/request-modification`, {
        notes: notes.trim(),
        checklist,
      })
      setProject(prev => ({ ...prev, status: 'قيد_المراجعة' }))
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء طلب التعديل')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-7 w-56 bg-gray-200 rounded animate-pulse" />
        </div>
        <SectionSkeleton />
        <SectionSkeleton />
        <SectionSkeleton />
        <SectionSkeleton />
      </div>
    )
  }

  if (error && !project) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <p className="text-lg text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          إعادة المحاولة
        </button>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/projects/${id}`)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">المراجعة والاعتماد</h1>
            <p className="text-sm text-gray-500">{project.title || project.name}</p>
          </div>
        </div>
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
          {project.status}
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* 1. Project Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary-600" />
          حالة المشروع
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">الحالة الحالية</p>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(project.status)}`}>
              {project.status}
            </span>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <Target className="w-3 h-3" />
              مستوى الدقة
            </p>
            <p className="text-sm font-bold text-gray-900">
              {getAccuracyLabel(project.accuracyLevel) || '—'}
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              آخر تحديث
            </p>
            <p className="text-sm font-bold text-gray-900">
              {project.updatedAt
                ? new Date(project.updatedAt).toLocaleDateString('ar-SA', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })
                : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Items Summary */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary-600" />
            بنود المشروع
          </h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 border border-gray-200 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{formatNumber(items.length)}</p>
              <p className="text-xs text-gray-500 mt-1">إجمالي البنود</p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg text-center">
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalCost)}</p>
              <p className="text-xs text-gray-500 mt-1">إجمالي التكلفة</p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg text-center">
              <p className="text-2xl font-bold text-primary-600">{formatNumber(approvedItems.length)}</p>
              <p className="text-xs text-gray-500 mt-1">البنود المعتمدة</p>
            </div>
          </div>

          {items.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500">
                    <th className="text-right px-3 py-2 font-medium">الكود</th>
                    <th className="text-right px-3 py-2 font-medium">اسم البند</th>
                    <th className="text-center px-3 py-2 font-medium">الكمية</th>
                    <th className="text-center px-3 py-2 font-medium">الوحدة</th>
                    <th className="text-left px-3 py-2 font-medium">التكلفة</th>
                    <th className="text-center px-3 py-2 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 10).map((item, idx) => {
                    const qty = Number(item.quantity) || 0
                    const mat = Number(item.materialCost) || 0
                    const lab = Number(item.laborCost) || 0
                    const cost = qty * (mat + lab)
                    const isApproved = item.status === 'معتمد' || item.approved
                    return (
                      <tr key={item._id || item.id || idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-3 py-2 font-mono text-xs text-gray-500">{item.code || '—'}</td>
                        <td className="px-3 py-2 text-gray-900 font-medium">{item.name || item.title}</td>
                        <td className="px-3 py-2 text-center text-gray-900">{formatNumber(qty)}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{item.unit || '—'}</td>
                        <td className="px-3 py-2 text-left text-gray-900 dir-ltr">{formatCurrency(cost)}</td>
                        <td className="px-3 py-2 text-center">
                          {isApproved ? (
                            <BadgeCheck className="w-4 h-4 text-green-500 inline" />
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {items.length > 10 && (
                <p className="text-center text-xs text-gray-400 mt-3">... وعرض {formatNumber(items.length - 10)} بند إضافي</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. Generated Files */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Files className="w-5 h-5 text-primary-600" />
            الملفات المولدة
          </h2>
        </div>
        {files.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">لا توجد ملفات مولدة</div>
        ) : (
          <div className="p-6 space-y-3">
            {files.map((file, idx) => {
              const fileId = file._id || file.id || idx
              const isApproved = file.status === 'معتمد'
              return (
                <div
                  key={fileId}
                  className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                    isApproved
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className={`w-4 h-4 flex-shrink-0 ${isApproved ? 'text-green-600' : 'text-gray-400'}`} />
                    <span className="text-sm text-gray-900 truncate">
                      {file.name || file.title || `ملف ${fileId}`}
                    </span>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(file.status || 'مسودة')}`}>
                    {isApproved && <BadgeCheck className="w-3 h-3" />}
                    {file.status || 'مسودة'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 4. Review Checklist */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-primary-600" />
          المراجعة
        </h2>
        <div className="space-y-3">
          {checklistItems.map(item => {
            const Icon = item.icon
            const checked = checklist[item.key]
            return (
              <label
                key={item.key}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  checked
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleChecklist(item.key)}
                  className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <Icon className={`w-5 h-5 ${checked ? 'text-primary-600' : 'text-gray-400'}`} />
                <span className={`text-sm font-medium ${checked ? 'text-primary-700' : 'text-gray-700'}`}>
                  {item.label}
                </span>
                {checked && <BadgeCheck className="w-4 h-4 text-green-500 mr-auto" />}
              </label>
            )
          })}
        </div>
      </div>

      {/* 5. Review Notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <MessageSquareText className="w-5 h-5 text-primary-600" />
          ملاحظات المراجعة
        </h2>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="أدخل ملاحظات المراجعة هنا..."
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm resize-y"
        />
      </div>

      {/* 6. Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <BadgeCheck className="w-5 h-5 text-primary-600" />
          إجراءات الاعتماد
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!allChecked || submitting}
            className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            اعتماد المشروع
          </button>
          <button
            onClick={handleRequestModification}
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Edit3 className="w-4 h-4" />
            )}
            طلب تعديل
          </button>
        </div>
        {!allChecked && (
          <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            يجب التأكد من جميع نقاط المراجعة قبل الاعتماد
          </p>
        )}
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowConfirm(false)} />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">تأكيد الاعتماد</h2>
              <button onClick={() => setShowConfirm(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">تأكيد اعتماد المشروع</p>
                  <p className="text-xs text-amber-700 mt-1">
                    بعد الاعتماد، سيتم تغيير حالة المشروع إلى <strong>معتمد</strong>. هذا الإجراء نهائي.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-600">تفاصيل الاعتماد:</p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li className="flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4 text-green-500" />
                  {items.length} بند في المشروع
                </li>
                <li className="flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4 text-green-500" />
                  {approvedItems.length} بند معتمد
                </li>
                <li className="flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4 text-green-500" />
                  {files.length} ملف مولَد
                </li>
              </ul>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
              >
                إلغاء
              </button>
              <button
                onClick={handleApprove}
                disabled={submitting}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <BadgeCheck className="w-4 h-4" />
                )}
                تأكيد الاعتماد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
