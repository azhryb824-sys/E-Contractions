import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, AlertCircle, Search, PlusCircle, FolderOpen,
  Calendar, Home, Maximize2, DoorOpen, ListChecks, FileText
} from 'lucide-react'
import api from '../utils/api'
import { getStatusColor, getAccuracyLabel, formatNumber } from '../utils/helpers'

const statusFilters = ['الكل', 'نشط', 'مكتمل', 'قيد_المراجعة']

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse space-y-3">
      <div className="h-5 w-3/4 bg-gray-200 rounded" />
      <div className="flex gap-2">
        <div className="h-5 w-16 bg-gray-200 rounded-full" />
        <div className="h-5 w-20 bg-gray-200 rounded-full" />
      </div>
      <div className="flex gap-4">
        <div className="h-4 w-24 bg-gray-200 rounded" />
        <div className="h-4 w-20 bg-gray-200 rounded" />
      </div>
      <div className="flex gap-4 pt-2 border-t border-gray-100">
        <div className="h-4 w-16 bg-gray-200 rounded" />
        <div className="h-4 w-16 bg-gray-200 rounded" />
        <div className="h-4 w-16 bg-gray-200 rounded" />
      </div>
    </div>
  )
}

export default function PastProjects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('الكل')

  useEffect(() => {
    fetchProjects()
  }, [])

  async function fetchProjects() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get('/projects')
      setProjects(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل المشاريع')
    } finally {
      setLoading(false)
    }
  }

  const filtered = projects.filter(p => {
    const title = (p.title || p.name || '').toLowerCase()
    const matchesSearch = title.includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'الكل' || p.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <p className="text-lg text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchProjects}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          إعادة المحاولة
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المشاريع السابقة</h1>
          <p className="mt-1 text-gray-500">جميع المشاريع المسجلة في النظام</p>
        </div>
        <button
          onClick={() => navigate('/new-request')}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <PlusCircle className="w-4 h-4" />
          إنشاء مشروع جديد
        </button>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث عن مشروع..."
            className="w-full pr-10 pl-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {statusFilters.map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-primary-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Projects grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <FolderOpen className="w-16 h-16 text-gray-300 mb-4" />
          <p className="text-lg text-gray-500 mb-2">لا توجد مشاريع بعد</p>
          <p className="text-sm text-gray-400 mb-6">
            {search || statusFilter !== 'الكل' ? 'حاول تغيير معايير البحث' : 'قم بإنشاء مشروع جديد للبدء'}
          </p>
          {!search && statusFilter === 'الكل' && (
            <button
              onClick={() => navigate('/new-request')}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              <PlusCircle className="w-4 h-4" />
              إنشاء مشروع جديد
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(project => (
            <button
              key={project._id || project.id}
              onClick={() => navigate(`/projects/${project._id || project.id}`)}
              className="bg-white rounded-xl border border-gray-200 p-5 text-right hover:shadow-md hover:border-primary-200 transition-all group"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="text-base font-bold text-gray-900 group-hover:text-primary-600 transition-colors line-clamp-2">
                  {project.title || project.name}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-3">
                {project.type && (
                  <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-medium">
                    {project.type}
                  </span>
                )}
                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                  {project.status}
                </span>
                {project.accuracyLevel && (
                  <span className="text-xs bg-purple-50 text-purple-600 px-2.5 py-1 rounded-full">
                    {getAccuracyLabel(project.accuracyLevel)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 text-xs text-gray-400 mb-3">
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  {project.createdAt
                    ? new Date(project.createdAt).toLocaleDateString('ar-SA')
                    : '—'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
                {project.area != null && (
                  <span className="flex items-center gap-1">
                    <Maximize2 className="w-3.5 h-3.5" />
                    {formatNumber(project.area)} م²
                  </span>
                )}
                {project.rooms != null && (
                  <span className="flex items-center gap-1">
                    <DoorOpen className="w-3.5 h-3.5" />
                    {formatNumber(project.rooms)} غرف
                  </span>
                )}
                {project.itemsCount != null && (
                  <span className="flex items-center gap-1">
                    <ListChecks className="w-3.5 h-3.5" />
                    {formatNumber(project.itemsCount)} بند
                  </span>
                )}
                {(project.itemsCount == null && (project.items?.length || project.bocItems?.length)) && (
                  <span className="flex items-center gap-1">
                    <ListChecks className="w-3.5 h-3.5" />
                    {formatNumber(project.items?.length || project.bocItems?.length)} بند
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
