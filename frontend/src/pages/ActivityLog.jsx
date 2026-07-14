import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  RefreshCw, AlertCircle, Loader2, Filter, RotateCcw, Clock,
  User, Tag, FileText, FolderOpen, ChevronDown, ChevronUp,
  Search, CalendarDays, History
} from 'lucide-react'
import api from '../utils/api'
import { formatNumber } from '../utils/helpers'

const actionTypes = [
  { value: '', label: 'الكل' },
  { value: 'إنشاء', label: 'إنشاء', color: 'bg-blue-100 text-blue-700' },
  { value: 'تعديل', label: 'تعديل', color: 'bg-amber-100 text-amber-700' },
  { value: 'حذف', label: 'حذف', color: 'bg-red-100 text-red-700' },
  { value: 'اعتماد', label: 'اعتماد', color: 'bg-green-100 text-green-700' },
  { value: 'رفع_ملف', label: 'رفع ملف', color: 'bg-purple-100 text-purple-700' },
  { value: 'إنشاء_ملف', label: 'إنشاء ملف', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'اقتراح', label: 'اقتراح', color: 'bg-teal-100 text-teal-700' },
  { value: 'رفض', label: 'رفض', color: 'bg-rose-100 text-rose-700' },
]

function getActionTypeMeta(type) {
  return actionTypes.find(a => a.value === type) || { label: type || '—', color: 'bg-gray-100 text-gray-600' }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('ar-SA', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
}

function LogSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-gray-200 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 bg-gray-200 rounded" />
              <div className="h-3 w-32 bg-gray-200 rounded" />
              <div className="h-3 w-64 bg-gray-200 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ActivityLog() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [expanded, setExpanded] = useState({})
  const [filters, setFilters] = useState({
    action_type: searchParams.get('action_type') || '',
    project_id: searchParams.get('project_id') || '',
    date_from: searchParams.get('date_from') || '',
    date_to: searchParams.get('date_to') || '',
  })

  useEffect(() => {
    setPage(1)
    setLogs([])
    fetchLogs(1, true)
  }, [filters])

  async function fetchLogs(pageNum = 1, reset = false) {
    if (reset) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }
    setError(null)
    try {
      const params = { page: pageNum, limit: 20 }
      if (filters.action_type) params.action_type = filters.action_type
      if (filters.project_id) params.project_id = filters.project_id
      if (filters.date_from) params.date_from = filters.date_from
      if (filters.date_to) params.date_to = filters.date_to

      const data = await api.get('/logs', { params })
      const fetchedLogs = Array.isArray(data) ? data : (data.logs || [])
      const pagination = data.pagination || {}
      setTotalPages(pagination.totalPages || pagination.total_pages || 1)

      if (reset) {
        setLogs(fetchedLogs)
      } else {
        setLogs(prev => [...prev, ...fetchedLogs])
      }
      setPage(pageNum)
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل السجل')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  function handleFilter(e) {
    e.preventDefault()
    setPage(1)
    setLogs([])
    fetchLogs(1, true)
  }

  function handleReset() {
    setFilters({ action_type: '', project_id: '', date_from: '', date_to: '' })
    setSearchParams({})
  }

  function loadMore() {
    if (page < totalPages && !loadingMore) {
      fetchLogs(page + 1, false)
    }
  }

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const hasMore = page < totalPages

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <History className="w-6 h-6 text-primary-600" />
          سجل العمليات
        </h1>
        <p className="text-sm text-gray-500 mt-1">تتبع جميع العمليات والتعديلات في النظام</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <form onSubmit={handleFilter} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <Tag className="w-3.5 h-3.5 inline ml-1" />
                نوع العملية
              </label>
              <select
                value={filters.action_type}
                onChange={e => setFilters(prev => ({ ...prev, action_type: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm bg-white"
              >
                {actionTypes.map(at => (
                  <option key={at.value} value={at.value}>{at.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <FolderOpen className="w-3.5 h-3.5 inline ml-1" />
                رقم المشروع
              </label>
              <input
                type="text"
                value={filters.project_id}
                onChange={e => setFilters(prev => ({ ...prev, project_id: e.target.value }))}
                placeholder="اختياري - أدخل معرف المشروع"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <CalendarDays className="w-3.5 h-3.5 inline ml-1" />
                من تاريخ
              </label>
              <input
                type="date"
                value={filters.date_from}
                onChange={e => setFilters(prev => ({ ...prev, date_from: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <CalendarDays className="w-3.5 h-3.5 inline ml-1" />
                إلى تاريخ
              </label>
              <input
                type="date"
                value={filters.date_to}
                onChange={e => setFilters(prev => ({ ...prev, date_to: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              <Filter className="w-4 h-4" />
              تصفية
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              <RotateCcw className="w-4 h-4" />
              إعادة تعيين
            </button>
          </div>
        </form>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
          <p className="text-lg text-red-600 mb-4">{error}</p>
          <button
            onClick={() => fetchLogs(1, true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && <LogSkeleton />}

      {/* Logs list */}
      {!loading && !error && (
        <>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-200">
              <History className="w-16 h-16 text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">لا توجد عمليات مسجلة</p>
              <p className="text-gray-400 text-sm mt-1">لم يتم تسجيل أي عمليات بعد</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log, idx) => {
                const logId = log._id || log.id || idx
                const meta = getActionTypeMeta(log.action_type || log.type)
                const isExpanded = expanded[logId]
                const details = log.details || log.metadata || log.changes
                const hasDetails = details && typeof details === 'object' && Object.keys(details).length > 0

                return (
                  <div
                    key={logId}
                    className={`bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow ${
                      idx % 2 === 1 ? 'bg-gray-50/40' : ''
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Timeline dot */}
                      <div className="hidden sm:flex flex-col items-center flex-shrink-0 pt-1">
                        <div className={`w-3 h-3 rounded-full ${meta.color.split(' ')[0]} ring-2 ring-white`} />
                        {idx < logs.length - 1 && (
                          <div className="w-0.5 h-full min-h-[3rem] bg-gray-200 mt-1" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${meta.color}`}>
                              {meta.label}
                            </span>
                            {log.project_id && (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                <FolderOpen className="w-3 h-3" />
                                {typeof log.project_id === 'object'
                                  ? log.project_id.title || log.project_id.name || log.project_id._id
                                  : log.project_name || log.project_title || log.project_id}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
                            <Clock className="w-3 h-3" />
                            {formatDateTime(log.createdAt || log.date || log.timestamp)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          <span className="flex items-center gap-1.5 text-sm text-gray-700">
                            <User className="w-3.5 h-3.5 text-gray-400" />
                            {log.user_name || log.user?.name || log.user?.email || '—'}
                          </span>
                        </div>

                        <p className="text-sm text-gray-600 leading-relaxed">
                          {log.description || log.message || log.action || '—'}
                        </p>

                        {hasDetails && (
                          <div className="mt-3">
                            <button
                              onClick={() => toggleExpand(logId)}
                              className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                              {isExpanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
                            </button>
                            {isExpanded && (
                              <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
                                {JSON.stringify(details, null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
                  >
                    {loadingMore ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    {loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'}
                  </button>
                </div>
              )}

              {!hasMore && logs.length > 0 && (
                <p className="text-center text-xs text-gray-400 pt-2">جميع العمليات معروضة</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
