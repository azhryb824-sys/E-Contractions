import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  RefreshCw, AlertCircle, Save, Plus, Trash2, CheckSquare,
  X, Loader2, Package, ListChecks, Hash, FileText, Tags,
  Ruler, DollarSign, Wrench, ChevronLeft
} from 'lucide-react'
import api from '../utils/api'
import { formatCurrency, formatNumber, getStatusColor } from '../utils/helpers'

function TableSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 animate-pulse">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="h-5 w-40 bg-gray-200 rounded" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            {Array.from({ length: 10 }).map((_, j) => (
              <div key={j} className="h-4 flex-1 bg-gray-200 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
      <div className="flex gap-6">
        <div className="h-5 w-32 bg-gray-200 rounded" />
        <div className="h-5 w-40 bg-gray-200 rounded" />
      </div>
    </div>
  )
}

export default function ReviewItems() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [items, setItems] = useState([])
  const [originalItems, setOriginalItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [newItem, setNewItem] = useState({ name: '', category: '', unit: '', quantity: '' })

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const [projectData, itemsData] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/items/${id}`),
      ])
      setProject(projectData)
      const fetchedItems = Array.isArray(itemsData) ? itemsData : []
      setItems(fetchedItems)
      setOriginalItems(JSON.parse(JSON.stringify(fetchedItems)))
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  const hasChanges = useCallback(() => {
    if (items.length !== originalItems.length) return true
    return items.some((item, i) => {
      const orig = originalItems[i]
      return !orig || Number(item.quantity) !== Number(orig.quantity)
    })
  }, [items, originalItems])

  function handleQuantityChange(itemId, value) {
    setItems(prev => prev.map(item =>
      (item._id === itemId || item.id === itemId)
        ? { ...item, quantity: value === '' ? '' : Number(value) }
        : item
    ))
  }

  function getTotal(item) {
    const qty = Number(item.quantity) || 0
    const mat = Number(item.materialCost) || 0
    const lab = Number(item.laborCost) || 0
    return qty * (mat + lab)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        items: items.map(item => ({
          _id: item._id || item.id,
          quantity: Number(item.quantity) || 0,
        }))
      }
      await api.patch(`/items/${id}/batch`, payload)
      setOriginalItems(JSON.parse(JSON.stringify(items)))
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء حفظ التغييرات')
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirm() {
    setConfirming(true)
    setError(null)
    try {
      await api.post(`/items/${id}/confirm`, {})
      setProject(prev => ({ ...prev, status: 'قيد_المراجعة' }))
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء تأكيد البنود')
    } finally {
      setConfirming(false)
    }
  }

  async function handleDelete(itemId) {
    setError(null)
    try {
      await api.delete(`/items/${id}/${itemId}`)
      setItems(prev => prev.filter(item => (item._id !== itemId && item.id !== itemId)))
      setDeleteConfirm(null)
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء حذف البند')
    }
  }

  async function handleAddItem(e) {
    e.preventDefault()
    if (!newItem.name.trim()) {
      setError('يرجى إدخال اسم البند')
      return
    }
    setError(null)
    try {
      const result = await api.post(`/items/${id}`, {
        name: newItem.name,
        category: newItem.category,
        unit: newItem.unit,
        quantity: Number(newItem.quantity) || 0,
      })
      const created = result.item || result
      setItems(prev => [...prev, created])
      setShowAddModal(false)
      setNewItem({ name: '', category: '', unit: '', quantity: '' })
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء إضافة البند')
    }
  }

  const totalItems = items.length
  const totalCost = items.reduce((sum, item) => sum + getTotal(item), 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-7 w-56 bg-gray-200 rounded animate-pulse" />
        </div>
        <SummarySkeleton />
        <TableSkeleton />
      </div>
    )
  }

  if (error && !items.length) {
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
            <h1 className="text-2xl font-bold text-gray-900">مراجعة بنود المشروع</h1>
            <p className="text-sm text-gray-500">{project?.title || project?.name}</p>
          </div>
        </div>
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(project?.status)}`}>
          {project?.status}
        </span>
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
              <Hash className="w-4 h-4 text-primary-600" />
              <span>إجمالي البنود: <strong className="text-gray-900">{formatNumber(totalItems)}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>التكلفة التقديرية: <strong className="text-gray-900">{formatCurrency(totalCost)}</strong></span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              إضافة بند
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges()}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ التغييرات
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex items-center gap-1.5 px-4 py-2 border-2 border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
              تأكيد البنود
            </button>
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="bg-white rounded-xl border border-gray-200">
        {items.length === 0 ? (
          <div className="p-10 text-center">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">لا توجد بنود في هذا المشروع</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              إضافة أول بند
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                  <th className="text-center px-2 py-3 font-medium w-10">#</th>
                  <th className="text-right px-3 py-3 font-medium">الكود</th>
                  <th className="text-right px-3 py-3 font-medium">اسم البند</th>
                  <th className="text-right px-3 py-3 font-medium">التصنيف</th>
                  <th className="text-center px-3 py-3 font-medium">الكمية</th>
                  <th className="text-center px-3 py-3 font-medium">الوحدة</th>
                  <th className="text-right px-3 py-3 font-medium">سعر المادة</th>
                  <th className="text-right px-3 py-3 font-medium">سعر العمالة</th>
                  <th className="text-right px-3 py-3 font-medium">الإجمالي</th>
                  <th className="text-center px-3 py-3 font-medium">المصدر</th>
                  <th className="text-center px-3 py-3 font-medium">الثقة</th>
                  <th className="text-center px-2 py-3 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const source = item.source || item.mode || 'النظام'
                  const sourceColors = {
                    يدوي: 'bg-blue-100 text-blue-700',
                    تلقائي: 'bg-orange-100 text-orange-700',
                    النظام: 'bg-purple-100 text-purple-700',
                  }
                  const sourceColor = sourceColors[source] || 'bg-gray-100 text-gray-600'
                  const itemId = item._id || item.id
                  const total = getTotal(item)
                  const confidence = item.confidence != null ? Math.round(item.confidence * 100) : null
                  return (
                    <tr key={itemId || idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="text-center px-2 py-3 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-3 py-3 font-mono text-xs text-gray-500">{item.code || '—'}</td>
                      <td className="px-3 py-3 text-gray-900 font-medium">{item.name || item.title}</td>
                      <td className="px-3 py-3 text-gray-600">{item.category || '—'}</td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="number"
                          value={item.quantity ?? ''}
                          onChange={e => handleQuantityChange(itemId, e.target.value)}
                          min="0"
                          step="any"
                          className="w-20 px-2 py-1 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm"
                        />
                      </td>
                      <td className="px-3 py-3 text-center text-gray-600">{item.unit || '—'}</td>
                      <td className="px-3 py-3 text-gray-900 text-left dir-ltr">{formatCurrency(item.materialCost)}</td>
                      <td className="px-3 py-3 text-gray-900 text-left dir-ltr">{formatCurrency(item.laborCost)}</td>
                      <td className="px-3 py-3 text-gray-900 font-bold text-left dir-ltr">{formatCurrency(total)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${sourceColor}`}>
                          {source}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {confidence != null ? (
                          <span className="text-xs text-gray-500">{confidence}%</span>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-3 text-center">
                        {deleteConfirm === itemId ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(itemId)}
                              className="p-1 rounded text-red-500 hover:bg-red-50 transition-colors"
                              title="تأكيد الحذف"
                            >
                              <CheckSquare className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="p-1 rounded text-gray-400 hover:bg-gray-100 transition-colors"
                              title="إلغاء"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(itemId)}
                            className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="حذف البند"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add item modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">إضافة بند جديد</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  اسم البند <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={e => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="أدخل اسم البند"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">التصنيف</label>
                <input
                  type="text"
                  value={newItem.category}
                  onChange={e => setNewItem(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="أدخل التصنيف"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">الوحدة</label>
                  <input
                    type="text"
                    value={newItem.unit}
                    onChange={e => setNewItem(prev => ({ ...prev, unit: e.target.value }))}
                    placeholder="مثل: م², م³, عدد"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">الكمية</label>
                  <input
                    type="number"
                    value={newItem.quantity}
                    onChange={e => setNewItem(prev => ({ ...prev, quantity: e.target.value }))}
                    placeholder="0"
                    min="0"
                    step="any"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  إضافة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
