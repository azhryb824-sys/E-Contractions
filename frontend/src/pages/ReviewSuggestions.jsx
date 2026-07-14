import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Lightbulb, RefreshCw, AlertCircle, CheckCircle, XCircle,
  Loader2, CheckSquare, X, ArrowLeft, ListChecks, Hash,
  FileText, Tag, Ruler, Package, Layers, Link2
} from 'lucide-react'
import api from '../utils/api'
import { formatCurrency, formatNumber, getSuggestionTypeColor } from '../utils/helpers'

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 animate-pulse p-5 space-y-3">
      <div className="h-5 w-48 bg-gray-200 rounded" />
      <div className="h-4 w-32 bg-gray-200 rounded" />
      <div className="h-4 w-full bg-gray-200 rounded" />
      <div className="flex gap-4">
        <div className="h-4 w-24 bg-gray-200 rounded" />
        <div className="h-4 w-24 bg-gray-200 rounded" />
      </div>
    </div>
  )
}

export default function ReviewSuggestions() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    fetchData()
  }, [id])

  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const [projectData, suggestionsData] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/suggestions/${id}`),
      ])
      setProject(projectData)
      const raw = suggestionsData?.suggestions || suggestionsData?.data?.suggestions || suggestionsData
      const fetched = (Array.isArray(raw) ? raw : []).map(s => ({
        ...s,
        type: s.classification || s.type || 'اقتراح',
        estimatedQuantity: s.quantity || s.estimatedQuantity || 0,
        itemName: s.itemName || s.name,
      }))
      setSuggestions(fetched)
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل الاقتراحات')
    } finally {
      setLoading(false)
    }
  }

  async function handleAcceptAll() {
    setOperating(true)
    setError(null)
    try {
      await api.post(`/suggestions/${id}/accept-all`)
      setSuggestions(prev => prev.map(s => ({ ...s, status: 'مقبول' })))
      showToast('تم قبول جميع الاقتراحات')
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء قبول الاقتراحات', 'error')
    } finally {
      setOperating(false)
    }
  }

  async function handleRejectAll() {
    setOperating(true)
    setError(null)
    try {
      await api.post(`/suggestions/${id}/reject-all`)
      setSuggestions(prev => prev.map(s => ({ ...s, status: 'مرفوض' })))
      showToast('تم رفض جميع الاقتراحات')
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء رفض الاقتراحات', 'error')
    } finally {
      setOperating(false)
    }
  }

  async function handleGenerate() {
    setOperating(true)
    setError(null)
    try {
      const res = await api.post(`/suggestions/${id}/generate`)
      const raw = res?.suggestions || res?.data?.suggestions || res
      const fetched = (Array.isArray(raw) ? raw : []).map(s => ({
        ...s,
        type: s.classification || s.type || 'اقتراح',
        estimatedQuantity: s.quantity || s.estimatedQuantity || 0,
        itemName: s.itemName || s.name,
      }))
      setSuggestions(fetched)
      showToast('تم تحديث الاقتراحات بنجاح')
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء تحديث الاقتراحات', 'error')
    } finally {
      setOperating(false)
    }
  }

  async function handleAccept(suggestionId) {
    setError(null)
    try {
      await api.post(`/suggestions/${id}/${suggestionId}/accept`)
      setSuggestions(prev => prev.map(s =>
        (s._id === suggestionId || s.id === suggestionId) ? { ...s, status: 'مقبول' } : s
      ))
      showToast('تم قبول الاقتراح')
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء قبول الاقتراح', 'error')
    }
  }

  async function handleReject(suggestionId) {
    setError(null)
    try {
      await api.post(`/suggestions/${id}/${suggestionId}/reject`)
      setSuggestions(prev => prev.map(s =>
        (s._id === suggestionId || s.id === suggestionId) ? { ...s, status: 'مرفوض' } : s
      ))
      showToast('تم رفض الاقتراح')
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء رفض الاقتراح', 'error')
    }
  }

  const acceptedCount = suggestions.filter(s => s.status === 'مقبول').length

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-7 w-56 bg-gray-200 rounded animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  if (error && !suggestions.length) {
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

  return (
    <div className="space-y-6" dir="rtl">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
            toast.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/projects/${id}`)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">الاقتراحات الذكية</h1>
            <p className="text-sm text-gray-500">
              تحليل ذكي باستخدام الذكاء الاصطناعي لاقتراح البنود المناسبة لمشروعك بناءً على البيانات والمعرفة السابقة
            </p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Summary bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <span>
                عدد الاقتراحات:{' '}
                <strong className="text-gray-900">{formatNumber(suggestions.length)}</strong>{' '}
                مقترحاً
              </span>
            </div>
            {acceptedCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle className="w-4 h-4" />
                <span>
                  تم قبول:{' '}
                  <strong>{formatNumber(acceptedCount)}</strong>
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {acceptedCount > 0 && (
              <button
                onClick={() => navigate(`/projects/${id}/review`)}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
              >
                <ListChecks className="w-4 h-4" />
                الانتقال إلى مراجعة البنود
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            يمكنك قبول أو رفض الاقتراحات بشكل فردي أو جماعي
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleGenerate}
              disabled={operating}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {operating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              تحديث الاقتراحات
            </button>
            <button
              onClick={handleRejectAll}
              disabled={operating || suggestions.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {operating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              رفض الكل
            </button>
            <button
              onClick={handleAcceptAll}
              disabled={operating || suggestions.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {operating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              قبول الكل
            </button>
          </div>
        </div>
      </div>

      {/* Suggestions grid */}
      {suggestions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Lightbulb className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">لا توجد اقتراحات حالياً</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {suggestions.map((suggestion, idx) => {
            const sId = suggestion._id || suggestion.id || idx
            const isAccepted = suggestion.status === 'مقبول'
            const isRejected = suggestion.status === 'مرفوض'
            return (
              <div
                key={sId}
                className={`bg-white rounded-xl border transition-all ${
                  isAccepted
                    ? 'border-emerald-200 ring-1 ring-emerald-100'
                    : isRejected
                    ? 'border-red-200 ring-1 ring-red-100 opacity-60'
                    : 'border-gray-200 hover:shadow-md'
                }`}
              >
                <div className="p-5 space-y-3">
                  {/* Status badge */}
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getSuggestionTypeColor(suggestion.type)}`}
                    >
                      <Tag className="w-3 h-3" />
                      {suggestion.type || 'اقتراح'}
                    </span>
                    {isAccepted && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        <CheckCircle className="w-3 h-3" />
                        مقبول
                      </span>
                    )}
                    {isRejected && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        <XCircle className="w-3 h-3" />
                        مرفوض
                      </span>
                    )}
                  </div>

                  {/* Item name */}
                  <div>
                    <h3 className="text-base font-bold text-gray-900">
                      {suggestion.itemName || suggestion.name || 'بند غير محدد'}
                    </h3>
                    {suggestion.category && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        <span className="font-medium">الفئة:</span> {suggestion.category}
                      </p>
                    )}
                  </div>

                  {/* Reason */}
                  {suggestion.reason && (
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <FileText className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
                      <span>{suggestion.reason}</span>
                    </div>
                  )}

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {(suggestion.estimatedQuantity != null || suggestion.quantity != null) && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Ruler className="w-3.5 h-3.5 text-gray-400" />
                        <span>
                          الكمية المقترحة:{' '}
                          <strong className="text-gray-700">
                            {formatNumber(suggestion.estimatedQuantity ?? suggestion.quantity)}
                          </strong>
                        </span>
                      </div>
                    )}
                    {suggestion.unit && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Package className="w-3.5 h-3.5 text-gray-400" />
                        <span>
                          الوحدة: <strong className="text-gray-700">{suggestion.unit}</strong>
                        </span>
                      </div>
                    )}
                    {suggestion.category && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Layers className="w-3.5 h-3.5 text-gray-400" />
                        <span>
                          الفئة: <strong className="text-gray-700">{suggestion.category}</strong>
                        </span>
                      </div>
                    )}
                    {suggestion.parentName || suggestion.parentItemName || suggestion.relatedTo ? (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Link2 className="w-3.5 h-3.5 text-gray-400" />
                        <span>
                          مرتبط بـ:{' '}
                          <strong className="text-gray-700">
                            {suggestion.parentName || suggestion.parentItemName || suggestion.relatedTo}
                          </strong>
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    {!isAccepted && !isRejected && (
                      <>
                        <button
                          onClick={() => handleReject(sId)}
                          disabled={operating}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                        >
                          <X className="w-4 h-4" />
                          رفض
                        </button>
                        <button
                          onClick={() => handleAccept(sId)}
                          disabled={operating}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                        >
                          <CheckCircle className="w-4 h-4" />
                          قبول
                        </button>
                      </>
                    )}
                    {(isAccepted || isRejected) && (
                      <span className="flex-1 text-center text-xs text-gray-400 py-2">
                        {isAccepted ? 'تم قبول هذا الاقتراح' : 'تم رفض هذا الاقتراح'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
