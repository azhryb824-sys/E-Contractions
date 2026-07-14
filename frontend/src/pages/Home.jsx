import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  HardHat, Activity, Truck, Database, DollarSign,
  PlusCircle, FolderOpen, Settings, RefreshCw, AlertCircle
} from 'lucide-react'
import api from '../utils/api'
import { formatNumber, getStatusColor, getAccuracyLabel } from '../utils/helpers'

const statCards = [
  { key: 'projectCount', label: 'عدد المشاريع', icon: HardHat, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'activeProjects', label: 'المشاريع النشطة', icon: Activity, color: 'text-green-600', bg: 'bg-green-50' },
  { key: 'supplierCount', label: 'الموردون', icon: Truck, color: 'text-orange-600', bg: 'bg-orange-50' },
  { key: 'itemsCount', label: 'بنود المعرفة', icon: Database, color: 'text-purple-600', bg: 'bg-purple-50' },
  { key: 'approvedPrices', label: 'الأسعار المعتمدة', icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
]

const quickActions = [
  { label: 'طلب جديد', path: '/new-request', icon: PlusCircle, color: 'bg-primary-600 hover:bg-primary-700 text-white' },
  { label: 'عرض المشاريع', path: '/projects', icon: FolderOpen, color: 'bg-secondary-600 hover:bg-secondary-700 text-white' },
  { label: 'إدارة الأسعار', path: '/prices', icon: Settings, color: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
]

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-10 w-10 bg-gray-200 rounded-lg" />
        <div className="h-4 w-16 bg-gray-200 rounded" />
      </div>
      <div className="h-8 w-24 bg-gray-200 rounded mt-2" />
    </div>
  )
}

export default function Home() {
  const [stats, setStats] = useState(null)
  const [recentProjects, setRecentProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchDashboard()
  }, [])

  async function fetchDashboard() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get('/dashboard/stats')
      setStats(data || {})
      setRecentProjects(data.recentProjects || [])
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل البيانات')
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
          onClick={fetchDashboard}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          إعادة المحاولة
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div className="text-center lg:text-right">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
          مرحباً بك في <span className="text-primary-600">المقاول الإلكتروني</span>
        </h1>
        <p className="mt-2 text-gray-500 text-lg">نظام إدارة جداول الكميات والتكاليف</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
          : statCards.map(card => {
              const Icon = card.icon
              const value = stats[card.key]
              return (
                <div key={card.key} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`p-2.5 rounded-lg ${card.bg}`}>
                      <Icon className={`w-5 h-5 ${card.color}`} />
                    </div>
                    <span className="text-sm text-gray-500">{card.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {value != null ? formatNumber(value) : '—'}
                  </p>
                </div>
              )
            })
        }
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        {quickActions.map(action => {
          const Icon = action.icon
          return (
            <Link
              key={action.path}
              to={action.path}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-colors text-sm font-medium ${action.color}`}
            >
              <Icon className="w-4 h-4" />
              {action.label}
            </Link>
          )
        })}
      </div>

      {/* Recent projects */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">آخر المشاريع</h2>
        </div>
        {loading ? (
          <div className="p-6 space-y-4 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-4 flex-1 bg-gray-200 rounded" />
                <div className="h-4 w-20 bg-gray-200 rounded" />
                <div className="h-4 w-20 bg-gray-200 rounded" />
                <div className="h-4 w-24 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : recentProjects.length === 0 ? (
          <div className="p-6 text-center text-gray-400">لا توجد مشاريع بعد</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="text-right px-6 py-3 font-medium">اسم المشروع</th>
                  <th className="text-right px-6 py-3 font-medium">النوع</th>
                  <th className="text-right px-6 py-3 font-medium">الحالة</th>
                  <th className="text-right px-6 py-3 font-medium">مستوى الدقة</th>
                  <th className="text-right px-6 py-3 font-medium">آخر تحديث</th>
                </tr>
              </thead>
              <tbody>
                {recentProjects.map(project => (
                  <tr key={project._id || project.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <Link to={`/projects/${project._id || project.id}`} className="text-primary-600 hover:underline font-medium">
                        {project.name || project.title}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{project.type || '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                        {project.status || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{getAccuracyLabel(project.accuracyLevel)}</td>
                    <td className="px-6 py-3 text-gray-400 text-xs">
                      {project.updated_at ? new Date(project.updated_at).toLocaleDateString('ar-SA') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
