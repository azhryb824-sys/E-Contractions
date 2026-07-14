import { useState, useEffect } from 'react'
import {
  DollarSign, Plus, RefreshCw, AlertCircle, Search, Download,
  CheckCircle, XCircle, Edit3, X, Loader2, Filter,
  CheckSquare, Package, MapPin, Building2, Calendar,
  Wrench, Truck, Layers, Hash
} from 'lucide-react'
import api from '../utils/api'
import { formatCurrency, formatNumber, getStatusColor } from '../utils/helpers'

function TableSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 animate-pulse overflow-hidden">
      <div className="p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            {Array.from({ length: 8 }).map((_, j) => (
              <div key={j} className="h-4 flex-1 bg-gray-200 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

const initialFormState = {
  itemId: '',
  itemName: '',
  materialCost: '',
  laborCost: '',
  equipmentCost: '',
  transportCost: '',
  supplier: '',
  city: '',
  validUntil: '',
}

export default function PriceManagement() {
  const [prices, setPrices] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(initialFormState)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const [pricesData, suppliersData] = await Promise.all([
        api.get('/prices'),
        api.get('/suppliers'),
      ])
      setPrices(Array.isArray(pricesData) ? pricesData : [])
      setSuppliers(Array.isArray(suppliersData) ? suppliersData : [])
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  function openAddModal() {
    setEditingId(null)
    setForm(initialFormState)
    setError(null)
    setShowModal(true)
  }

  function openEditModal(price) {
    setEditingId(price._id || price.id)
    setForm({
      itemId: price.itemId?._id || price.itemId || '',
      itemName: price.itemName || price.item?.name || '',
      materialCost: price.materialCost ?? '',
      laborCost: price.laborCost ?? '',
      equipmentCost: price.equipmentCost ?? '',
      transportCost: price.transportCost ?? '',
      supplier: price.supplier?._id || price.supplierId || price.supplier || '',
      city: price.city || '',
      validUntil: price.validUntil ? price.validUntil.slice(0, 10) : '',
    })
    setError(null)
    setShowModal(true)
  }

  function handleFormChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleItemSelect(e) {
    const id = e.target.value
    const selected = items.find(i => (i._id === id || i.id === id))
    handleFormChange('itemId', id)
    handleFormChange('itemName', selected ? (selected.name || selected.title) : '')
  }

  function validateForm() {
    if (!form.itemId) return 'يرجى اختيار البند'
    if (!form.materialCost && !form.laborCost && !form.equipmentCost && !form.transportCost) return 'يرجى إدخال تكلفة واحدة على الأقل'
    if (!form.supplier) return 'يرجى اختيار المورد'
    if (!form.city) return 'يرجى إدخال المدينة'
    if (!form.validUntil) return 'يرجى إدخال تاريخ الصلاحية'
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    setOperating(true)
    setError(null)
    try {
      const payload = {
        itemId: form.itemId,
        materialCost: Number(form.materialCost) || 0,
        laborCost: Number(form.laborCost) || 0,
        equipmentCost: Number(form.equipmentCost) || 0,
        transportCost: Number(form.transportCost) || 0,
        supplier: form.supplier,
        city: form.city,
        validUntil: form.validUntil,
      }
      if (editingId) {
        await api.patch(`/prices/${editingId}`, payload)
        showToast('تم تحديث السعر بنجاح')
      } else {
        await api.post('/prices', payload)
        showToast('تم إضافة السعر بنجاح')
      }
      setShowModal(false)
      setForm(initialFormState)
      setEditingId(null)
      fetchData()
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء حفظ السعر')
    } finally {
      setOperating(false)
    }
  }

  async function handleApprove(priceId) {
    setOperating(true)
    try {
      await api.post(`/prices/${priceId}/approve`)
      setPrices(prev => prev.map(p =>
        (p._id === priceId || p.id === priceId) ? { ...p, status: 'معتمد' } : p
      ))
      showToast('تم اعتماد السعر')
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء اعتماد السعر', 'error')
    } finally {
      setOperating(false)
    }
  }

  async function handleReject(priceId) {
    setOperating(true)
    try {
      await api.post(`/prices/${priceId}/reject`)
      setPrices(prev => prev.map(p =>
        (p._id === priceId || p.id === priceId) ? { ...p, status: 'مرفوض' } : p
      ))
      showToast('تم رفض السعر')
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء رفض السعر', 'error')
    } finally {
      setOperating(false)
    }
  }

  async function handleExport() {
    setOperating(true)
    try {
      const res = await api.get('/prices/export')
      const blob = res instanceof Blob ? res : new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'prices-export.json'
      a.click()
      URL.revokeObjectURL(url)
      showToast('تم تصدير الأسعار بنجاح')
    } catch (err) {
      showToast(err.message || 'حدث خطأ أثناء تصدير الأسعار', 'error')
    } finally {
      setOperating(false)
    }
  }

  const cities = [...new Set(prices.map(p => p.city).filter(Boolean))]
  const filteredPrices = prices.filter(p => {
    const name = p.itemName || p.item?.name || p.name || ''
    if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (statusFilter && p.status !== statusFilter) return false
    if (cityFilter && p.city !== cityFilter) return false
    return true
  })

  function getTotal(price) {
    return (Number(price.materialCost) || 0)
      + (Number(price.laborCost) || 0)
      + (Number(price.equipmentCost) || 0)
      + (Number(price.transportCost) || 0)
  }

  function getSupplierName(price) {
    if (typeof price.supplier === 'string') return price.supplier
    return price.supplier?.name || price.supplierName || '—'
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 flex-1 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <TableSkeleton />
      </div>
    )
  }

  if (error && !prices.length) {
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة الأسعار</h1>
          <p className="text-sm text-gray-500">إدارة أسعار المواد والعمالة والمعدات والنقل</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExport}
            disabled={operating || prices.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {operating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            تصدير الأسعار
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            إضافة سعر جديد
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث بالبند..."
              className="w-full pr-9 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm min-w-[140px]"
          >
            <option value="">جميع الحالات</option>
            <option value="معتمد">معتمد</option>
            <option value="قيد_المراجعة">قيد المراجعة</option>
            <option value="منتهي">منتهي</option>
            <option value="مرفوض">مرفوض</option>
          </select>
          <select
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm min-w-[140px]"
          >
            <option value="">جميع المدن</option>
            {cities.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Prices table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filteredPrices.length === 0 ? (
          <div className="p-10 text-center">
            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">
              {prices.length === 0 ? 'لا توجد أسعار مسجلة حالياً' : 'لا توجد نتائج للبحث'}
            </p>
            {prices.length === 0 && (
              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                إضافة أول سعر
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                  <th className="text-right px-3 py-3 font-medium whitespace-nowrap">#</th>
                  <th className="text-right px-3 py-3 font-medium whitespace-nowrap">البند</th>
                  <th className="text-right px-3 py-3 font-medium whitespace-nowrap">سعر المادة</th>
                  <th className="text-right px-3 py-3 font-medium whitespace-nowrap">العمالة</th>
                  <th className="text-right px-3 py-3 font-medium whitespace-nowrap">المعدات</th>
                  <th className="text-right px-3 py-3 font-medium whitespace-nowrap">النقل</th>
                  <th className="text-right px-3 py-3 font-medium whitespace-nowrap">السعر الإجمالي</th>
                  <th className="text-right px-3 py-3 font-medium whitespace-nowrap">المورد</th>
                  <th className="text-right px-3 py-3 font-medium whitespace-nowrap">المدينة</th>
                  <th className="text-center px-3 py-3 font-medium whitespace-nowrap">الحالة</th>
                  <th className="text-right px-3 py-3 font-medium whitespace-nowrap">تاريخ التسجيل</th>
                  <th className="text-center px-3 py-3 font-medium whitespace-nowrap">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredPrices.map((price, idx) => {
                  const pId = price._id || price.id
                  const isApproved = price.status === 'معتمد'
                  const isRejected = price.status === 'مرفوض'
                  const total = getTotal(price)
                  return (
                    <tr key={pId || idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-3 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-3 py-3 text-gray-900 font-medium whitespace-nowrap">
                        {price.itemName || price.item?.name || price.name || '—'}
                      </td>
                      <td className="px-3 py-3 text-gray-900 text-left dir-ltr whitespace-nowrap">
                        {formatCurrency(price.materialCost)}
                      </td>
                      <td className="px-3 py-3 text-gray-900 text-left dir-ltr whitespace-nowrap">
                        {formatCurrency(price.laborCost)}
                      </td>
                      <td className="px-3 py-3 text-gray-900 text-left dir-ltr whitespace-nowrap">
                        {formatCurrency(price.equipmentCost)}
                      </td>
                      <td className="px-3 py-3 text-gray-900 text-left dir-ltr whitespace-nowrap">
                        {formatCurrency(price.transportCost)}
                      </td>
                      <td className="px-3 py-3 text-gray-900 font-bold text-left dir-ltr whitespace-nowrap">
                        {formatCurrency(total)}
                      </td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{getSupplierName(price)}</td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{price.city || '—'}</td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(price.status)}`}>
                          {price.status || 'قيد_المراجعة'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {price.createdAt ? new Date(price.createdAt).toLocaleDateString('ar-SA') : '—'}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {!isApproved && !isRejected && (
                            <>
                              <button
                                onClick={() => handleApprove(pId)}
                                disabled={operating}
                                className="p-1.5 rounded text-emerald-500 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="اعتماد"
                              >
                                <CheckSquare className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleReject(pId)}
                                disabled={operating}
                                className="p-1.5 rounded text-red-400 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="رفض"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => openEditModal(price)}
                            className="p-1.5 rounded text-blue-500 hover:bg-blue-50 transition-colors"
                            title="تعديل"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
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

      {/* Add/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'تعديل السعر' : 'إضافة سعر جديد'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  اختر البند <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.itemId}
                  onChange={handleItemSelect}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                >
                  <option value="">-- اختر البند --</option>
                  {items.map(item => (
                    <option key={item._id || item.id} value={item._id || item.id}>
                      {item.name || item.title || item.itemName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1">
                      <Wrench className="w-3.5 h-3.5" /> تكلفة المادة
                      <span className="text-red-500">*</span>
                    </span>
                  </label>
                  <input
                    type="number"
                    value={form.materialCost}
                    onChange={e => handleFormChange('materialCost', e.target.value)}
                    placeholder="0"
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1">
                      <Package className="w-3.5 h-3.5" /> تكلفة العمالة
                      <span className="text-red-500">*</span>
                    </span>
                  </label>
                  <input
                    type="number"
                    value={form.laborCost}
                    onChange={e => handleFormChange('laborCost', e.target.value)}
                    placeholder="0"
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5" /> تكلفة المعدات
                    </span>
                  </label>
                  <input
                    type="number"
                    value={form.equipmentCost}
                    onChange={e => handleFormChange('equipmentCost', e.target.value)}
                    placeholder="0"
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> تكلفة النقل
                    </span>
                  </label>
                  <input
                    type="number"
                    value={form.transportCost}
                    onChange={e => handleFormChange('transportCost', e.target.value)}
                    placeholder="0"
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" /> المورد
                      <span className="text-red-500">*</span>
                    </span>
                  </label>
                  <select
                    value={form.supplier}
                    onChange={e => handleFormChange('supplier', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                  >
                    <option value="">-- اختر المورد --</option>
                    {suppliers.map(supplier => (
                      <option key={supplier._id || supplier.id} value={supplier._id || supplier.id}>
                        {supplier.name || supplier.companyName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> المدينة
                      <span className="text-red-500">*</span>
                    </span>
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => handleFormChange('city', e.target.value)}
                    placeholder="أدخل المدينة"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> تاريخ الصلاحية
                    <span className="text-red-500">*</span>
                  </span>
                </label>
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={e => handleFormChange('validUntil', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={operating}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {operating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : editingId ? (
                    <Edit3 className="w-4 h-4" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {editingId ? 'حفظ التعديلات' : 'إضافة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
