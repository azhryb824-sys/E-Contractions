import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  RefreshCw, AlertCircle, Loader2, CheckCircle, FileText, Table,
  DollarSign, Calculator, FileSpreadsheet, Package, Wrench, Truck,
  ShoppingCart, BarChart3, Download, BadgeCheck, X, FileDown,
  FileType, Clock
} from 'lucide-react'
import api from '../utils/api'
import { formatCurrency, formatNumber, getStatusColor } from '../utils/helpers'

const fileTypes = [
  {
    type: 'quantity_sheet',
    title: 'جدول كميات',
    desc: 'جدول كميات تفصيلي لبنود المشروع',
    icon: Table,
    color: 'text-blue-600', bg: 'bg-blue-50'
  },
  {
    type: 'price_sheet',
    title: 'جدول أسعار',
    desc: 'جدول أسعار المواد والعمالة والمعدات',
    icon: DollarSign,
    color: 'text-emerald-600', bg: 'bg-emerald-50'
  },
  {
    type: 'cost_sheet',
    title: 'جدول تكلفة',
    desc: 'تفصيل تكاليف المشروع الكاملة',
    icon: Calculator,
    color: 'text-orange-600', bg: 'bg-orange-50'
  },
  {
    type: 'offer',
    title: 'عرض سعر',
    desc: 'عرض سعر احترافي للعميل',
    icon: FileText,
    color: 'text-purple-600', bg: 'bg-purple-50'
  },
  {
    type: 'materials_list',
    title: 'جدول مواد',
    desc: 'قائمة المواد المطلوبة للمشروع',
    icon: Package,
    color: 'text-cyan-600', bg: 'bg-cyan-50'
  },
  {
    type: 'labor_list',
    title: 'جدول عمالة',
    desc: 'قائمة العمالة المطلوبة والتكاليف',
    icon: Wrench,
    color: 'text-rose-600', bg: 'bg-rose-50'
  },
  {
    type: 'equipment_list',
    title: 'جدول معدات',
    desc: 'قائمة المعدات والأدوات المطلوبة',
    icon: Truck,
    color: 'text-amber-600', bg: 'bg-amber-50'
  },
  {
    type: 'procurement_plan',
    title: 'خطة مشتريات',
    desc: 'خطة زمنية للمشتريات والتوريد',
    icon: ShoppingCart,
    color: 'text-indigo-600', bg: 'bg-indigo-50'
  },
  {
    type: 'summary',
    title: 'ملخص التكلفة',
    desc: 'ملخص إجمالي تكاليف المشروع',
    icon: BarChart3,
    color: 'text-teal-600', bg: 'bg-teal-50'
  },
]

const formatLabels = {
  pdf: 'PDF',
  excel: 'Excel',
  word: 'Word',
}

const formatIcons = {
  pdf: FileType,
  excel: FileSpreadsheet,
  word: FileText,
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 bg-gray-200 rounded-lg" />
        <div className="space-y-1.5 flex-1">
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="h-3 w-32 bg-gray-200 rounded" />
        </div>
      </div>
    </div>
  )
}

function RowSkeleton() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded" /></td>
      ))}
    </tr>
  )
}

export default function GenerateFiles() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [selectedType, setSelectedType] = useState(null)
  const [selectedFormat, setSelectedFormat] = useState('pdf')

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
      const [projectData, filesData] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/files/${id}`),
      ])
      setProject(projectData)
      setFiles(Array.isArray(filesData) ? filesData : [])
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  function openGenerator(type) {
    setSelectedType(type)
    setSelectedFormat('pdf')
  }

  async function handleGenerate() {
    if (!selectedType) return
    setOperating(true)
    setError(null)
    try {
      const res = await api.post(`/files/${id}/generate`, {
        file_type: selectedType.type,
        file_format: selectedFormat,
      })
      const newFile = res.file || res.data || res
      if (newFile) {
        setFiles(prev => [newFile, ...prev])
      }
      showToast(`تم إنشاء ${selectedType.title} بنجاح`)
      setSelectedType(null)
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء إنشاء الملف', 'error')
    } finally {
      setOperating(false)
    }
  }

  async function handleDownload(file) {
    const fileId = file._id || file.id
    try {
      const res = await api.get(`/files/${id}/download/${fileId}`, {
        responseType: 'blob',
      })
      const blob = res instanceof Blob ? res : new Blob([res])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name || `${file.type || 'file'}.${selectedFormat || 'pdf'}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء تحميل الملف', 'error')
    }
  }

  async function handleApprove(file) {
    const fileId = file._id || file.id
    setOperating(true)
    try {
      await api.post(`/files/${id}/${fileId}/approve`)
      setFiles(prev => prev.map(f =>
        (f._id === fileId || f.id === fileId) ? { ...f, status: 'معتمد' } : f
      ))
      showToast('تم اعتماد الملف')
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء اعتماد الملف', 'error')
    } finally {
      setOperating(false)
    }
  }

  function getFileTypeMeta(type) {
    return fileTypes.find(ft => ft.type === type) || fileTypes[0]
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('ar-SA')
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-7 w-40 bg-gray-200 rounded animate-pulse" />
        <div className="h-5 w-56 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="h-5 w-32 bg-gray-200 rounded" />
          </div>
          <div className="p-4">
            <table className="w-full">
              <tbody>
                {Array.from({ length: 3 }).map((_, i) => <RowSkeleton key={i} />)}
              </tbody>
            </table>
          </div>
        </div>
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إنشاء الملفات</h1>
          <p className="text-sm text-gray-500">{project.title || project.name}</p>
        </div>
        {error && (
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            تحديث
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* File type cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fileTypes.map(ft => {
          const Icon = ft.icon
          return (
            <button
              key={ft.type}
              onClick={() => openGenerator(ft)}
              className="bg-white rounded-xl border border-gray-200 p-5 text-right hover:shadow-md hover:border-primary-300 transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-lg ${ft.bg} group-hover:scale-105 transition-transform`}>
                  <Icon className={`w-5 h-5 ${ft.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 text-sm">{ft.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">{ft.desc}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Format selection modal */}
      {selectedType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setSelectedType(null)} />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">اختيار صيغة الملف</h2>
              <button onClick={() => setSelectedType(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg ${selectedType.bg}`}>
                  <selectedType.icon className={`w-5 h-5 ${selectedType.color}`} />
                </div>
                <div>
                  <p className="font-bold text-gray-900">{selectedType.title}</p>
                  <p className="text-xs text-gray-500">{selectedType.desc}</p>
                </div>
              </div>

              <div className="space-y-3">
                {['pdf', 'excel', 'word'].map(format => {
                  const FormatIcon = formatIcons[format]
                  return (
                    <label
                      key={format}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedFormat === format
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="format"
                        value={format}
                        checked={selectedFormat === format}
                        onChange={() => setSelectedFormat(format)}
                        className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                      />
                      <FormatIcon className={`w-5 h-5 ${
                        selectedFormat === format ? 'text-primary-600' : 'text-gray-400'
                      }`} />
                      <span className={`text-sm font-medium ${
                        selectedFormat === format ? 'text-primary-700' : 'text-gray-700'
                      }`}>
                        {formatLabels[format]}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setSelectedType(null)}
                className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
              >
                إلغاء
              </button>
              <button
                onClick={handleGenerate}
                disabled={operating}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {operating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4" />
                )}
                إنشاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generated files section */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">الملفات المولدة</h2>
          <span className="text-sm text-gray-500">إجمالي {formatNumber(files.length)} ملف</span>
        </div>
        {files.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">لا توجد ملفات مولدة بعد</p>
            <p className="text-xs text-gray-400 mt-1">اختر نوع الملف أعلاه لإنشاء أول ملف</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                  <th className="text-right px-4 py-3 font-medium">اسم الملف</th>
                  <th className="text-right px-4 py-3 font-medium">النوع</th>
                  <th className="text-center px-4 py-3 font-medium">الحالة</th>
                  <th className="text-center px-4 py-3 font-medium">الإصدار</th>
                  <th className="text-right px-4 py-3 font-medium">تاريخ الإنشاء</th>
                  <th className="text-center px-4 py-3 font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file, idx) => {
                  const fileId = file._id || file.id
                  const ft = getFileTypeMeta(file.type || file.file_type)
                  const Icon = ft.icon
                  const isApproved = file.status === 'معتمد'

                  return (
                    <tr key={fileId || idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${ft.color}`} />
                          <span className="font-medium text-gray-900">{file.name || `${ft.title}.${file.format || 'pdf'}`}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{ft.title}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(file.status || 'مسودة')}`}>
                          {file.status || 'مسودة'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{file.version || 1}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(file.createdAt)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleDownload(file)}
                            className="p-1.5 rounded text-blue-500 hover:bg-blue-50 transition-colors"
                            title="تحميل"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {!isApproved && (
                            <button
                              onClick={() => handleApprove(file)}
                              disabled={operating}
                              className="p-1.5 rounded text-emerald-500 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              title="اعتماد"
                            >
                              <BadgeCheck className="w-4 h-4" />
                            </button>
                          )}
                        </div>
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
