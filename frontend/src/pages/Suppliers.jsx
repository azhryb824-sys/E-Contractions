import { useState, useEffect } from 'react'
import {
  Building2, Plus, RefreshCw, AlertCircle, Search, Edit3, X, Loader2,
  CheckCircle, XCircle, Phone, Mail, MapPin, User, Star, StarHalf,
  FileText, Tag, Package, ChevronDown, ChevronUp
} from 'lucide-react'
import api from '../utils/api'
import { formatCurrency, formatNumber, getStatusColor } from '../utils/helpers'

const categories = [
  'مواد بناء', 'كهرباء', 'سباكة', 'تكييف', 'ألمنيوم', 'دهانات', 'أدوات صحية', 'إنارة', 'أخرى'
]

const initialFormState = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  category: '',
  notes: '',
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-gray-200 rounded-lg" />
          <div className="space-y-2">
            <div className="h-4 w-28 bg-gray-200 rounded" />
            <div className="h-3 w-20 bg-gray-200 rounded" />
          </div>
        </div>
        <div className="h-6 w-14 bg-gray-200 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-32 bg-gray-200 rounded" />
        <div className="h-3 w-24 bg-gray-200 rounded" />
        <div className="h-3 w-36 bg-gray-200 rounded" />
      </div>
    </div>
  )
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [supplierPrices, setSupplierPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(initialFormState)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    fetchSuppliers()
  }, [])

  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function fetchSuppliers() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get('/suppliers')
      const list = Array.isArray(data) ? data : []
      setSuppliers(list)
      list.forEach(s => fetchSupplierPrices(s.id))
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل الموردين')
    } finally {
      setLoading(false)
    }
  }

  async function fetchSupplierPrices(supplierId) {
    try {
      const data = await api.get(`/prices?supplierId=${supplierId}`)
      setSupplierPrices(prev => ({ ...prev, [supplierId]: Array.isArray(data) ? data : [] }))
    } catch {
      setSupplierPrices(prev => ({ ...prev, [supplierId]: [] }))
    }
  }

  function openAddModal() {
    setEditingId(null)
    setForm(initialFormState)
    setError(null)
    setShowModal(true)
  }

  function openEditModal(supplier) {
    const sid = supplier._id || supplier.id
    setEditingId(sid)
    setForm({
      name: supplier.name || '',
      contactPerson: supplier.contactPerson || supplier.contact || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      category: supplier.category || '',
      notes: supplier.notes || '',
    })
    setError(null)
    setShowModal(true)
  }

  function handleFormChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function validateForm() {
    if (!form.name.trim()) return 'يرجى إدخال اسم المورد'
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
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        category: form.category,
        notes: form.notes.trim(),
      }
      if (editingId) {
        await api.patch(`/suppliers/${editingId}`, payload)
        showToast('تم تحديث المورد بنجاح')
      } else {
        await api.post('/suppliers', payload)
        showToast('تم إضافة المورد بنجاح')
      }
      setShowModal(false)
      setForm(initialFormState)
      setEditingId(null)
      fetchSuppliers()
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء حفظ المورد')
    } finally {
      setOperating(false)
    }
  }

  async function handleToggleStatus(supplier) {
    const sid = supplier._id || supplier.id
    const newStatus = supplier.active === false ? 'true' : 'false'
    setOperating(true)
    try {
      await api.patch(`/suppliers/${sid}`, { active: newStatus === 'true' })
      setSuppliers(prev => prev.map(s =>
        (s._id === sid || s.id === sid) ? { ...s, active: !(s.active === false) } : s
      ))
      showToast(newStatus === 'true' ? 'تم تفعيل المورد' : 'تم تعطيل المورد')
    } catch (err) {
      showToast(err.message || 'حدث خطأ', 'error')
    } finally {
      setOperating(false)
    }
  }

  function renderStars(rating) {
    const stars = []
    const full = Math.floor(rating || 0)
    const half = (rating || 0) % 1 >= 0.5
    for (let i = 0; i < 5; i++) {
      if (i < full) {
        stars.push(<Star key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />)
      } else if (i === full && half) {
        stars.push(<StarHalf key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />)
      } else {
        stars.push(<Star key={i} className="w-3.5 h-3.5 text-gray-300" />)
      }
    }
    return stars
  }

  const filteredSuppliers = suppliers.filter(s => {
    const name = s.name || ''
    if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-7 w-40 bg-gray-200 rounded animate-pulse" />
        <div className="h-5 w-56 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  if (error && !suppliers.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <p className="text-lg text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchSuppliers}
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
          <h1 className="text-2xl font-bold text-gray-900">الموردون</h1>
          <p className="text-sm text-gray-500">إدارة الموردين وعروض الأسعار</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          إضافة مورد جديد
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث باسم المورد..."
            className="w-full pr-9 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm"
          />
        </div>
      </div>

      {/* Suppliers grid */}
      {filteredSuppliers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">
            {suppliers.length === 0 ? 'لا يوجد موردون مسجلون حالياً' : 'لا توجد نتائج للبحث'}
          </p>
          {suppliers.length === 0 && (
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              إضافة أول مورد
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredSuppliers.map(supplier => {
            const sid = supplier._id || supplier.id
            const isActive = supplier.active !== false
            const isExpanded = expandedId === sid
            const prices = supplierPrices[sid] || []

            return (
              <div key={sid} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-primary-50">
                        <Building2 className="w-5 h-5 text-primary-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">{supplier.name}</h3>
                        {supplier.contactPerson && (
                          <p className="text-xs text-gray-500">{supplier.contactPerson}</p>
                        )}
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                      isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      {isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  </div>

                  {/* Rating */}
                  <div className="flex items-center gap-1 mb-3">
                    {renderStars(supplier.rating)}
                    {supplier.rating != null && (
                      <span className="text-xs text-gray-500 mr-1">{Number(supplier.rating).toFixed(1)}</span>
                    )}
                  </div>

                  {/* Category */}
                  {supplier.category && (
                    <div className="mb-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        <Tag className="w-3 h-3" />
                        {supplier.category}
                      </span>
                    </div>
                  )}

                  <div className="space-y-2 text-sm">
                    {supplier.phone && (
                      <a
                        href={`tel:${supplier.phone}`}
                        dir="ltr"
                        className="flex items-center gap-2 text-gray-600 hover:text-primary-600 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        {supplier.phone}
                      </a>
                    )}
                    {supplier.email && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        <span dir="ltr" className="text-xs truncate">{supplier.email}</span>
                      </div>
                    )}
                    {supplier.address && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs truncate">{supplier.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Price count */}
                  <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-500">
                    <Package className="w-3.5 h-3.5" />
                    <span>عدد الأسعار المسجلة: {formatNumber(prices.length)}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => openEditModal(supplier)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      تعديل
                    </button>
                    <button
                      onClick={() => handleToggleStatus(supplier)}
                      disabled={operating}
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        isActive
                          ? 'text-red-600 hover:bg-red-50'
                          : 'text-emerald-600 hover:bg-emerald-50'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {operating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isActive ? (
                        <XCircle className="w-3.5 h-3.5" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      {isActive ? 'تعطيل' : 'تفعيل'}
                    </button>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : sid)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors mr-auto"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                      {isExpanded ? 'إخفاء الأسعار' : 'عرض الأسعار'}
                    </button>
                  </div>
                </div>

                {/* Expanded prices section */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50">
                    {prices.length === 0 ? (
                      <div className="p-4 text-center text-xs text-gray-400">
                        لا توجد أسعار مسجلة لهذا المورد
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200 text-gray-500">
                              <th className="text-right px-3 py-2 font-medium">البند</th>
                              <th className="text-right px-3 py-2 font-medium">السعر</th>
                              <th className="text-center px-3 py-2 font-medium">الحالة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prices.map((price, idx) => (
                              <tr key={price._id || price.id || idx} className="border-b border-gray-100 hover:bg-gray-100/50">
                                <td className="px-3 py-2 text-gray-900 font-medium">
                                  {price.itemName || price.item?.name || '—'}
                                </td>
                                <td className="px-3 py-2 text-left dir-ltr text-gray-900">
                                  {formatCurrency(price.total || price.materialCost)}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(price.status)}`}>
                                    {price.status || 'قيد_المراجعة'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'تعديل المورد' : 'إضافة مورد جديد'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  اسم المورد <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => handleFormChange('name', e.target.value)}
                  placeholder="أدخل اسم المورد"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" /> جهة الاتصال
                    </span>
                  </label>
                  <input
                    type="text"
                    value={form.contactPerson}
                    onChange={e => handleFormChange('contactPerson', e.target.value)}
                    placeholder="اسم جهة الاتصال"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> الهاتف
                    </span>
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={e => handleFormChange('phone', e.target.value)}
                    placeholder="رقم الهاتف"
                    dir="ltr"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" /> البريد الإلكتروني
                    </span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => handleFormChange('email', e.target.value)}
                    placeholder="email@example.com"
                    dir="ltr"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" /> التصنيف
                    </span>
                  </label>
                  <select
                    value={form.category}
                    onChange={e => handleFormChange('category', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                  >
                    <option value="">-- اختر التصنيف --</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> العنوان
                  </span>
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => handleFormChange('address', e.target.value)}
                  placeholder="العنوان"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> ملاحظات
                  </span>
                </label>
                <textarea
                  value={form.notes}
                  onChange={e => handleFormChange('notes', e.target.value)}
                  placeholder="ملاحظات إضافية..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors resize-none"
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
