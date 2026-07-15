import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Save } from 'lucide-react'
import api from '../utils/api'

const stages = ['الوصف', 'البيانات الأساسية', 'الفراغات', 'الأعمال', 'الأنظمة', 'المراجعة']
const optionLabels = { exact_only: 'تنفيذ الطلب فقط', smart_additions: 'إضافات ذكية', show_for_approval: 'عرض الإضافات للموافقة' }

function fieldValue(question, value, onChange) {
  if (question.answer_type === 'boolean') return (
    <div className="grid grid-cols-2 gap-3">
      {[true, false].map(v => <button type="button" key={String(v)} onClick={() => onChange(v)}
        className={`min-h-11 rounded-lg border-2 ${value === v ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200'}`}>{v ? 'نعم' : 'لا'}</button>)}
    </div>
  )
  if (question.answer_type === 'single_select') return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} className="w-full min-h-11 rounded-lg border border-gray-300 px-3 bg-white">
      <option value="">اختر الإجابة</option>
      {(question.options || []).map(v => <option key={v} value={v}>{optionLabels[v] || v}</option>)}
    </select>
  )
  if (question.answer_type === 'multi_select') {
    const selected = Array.isArray(value) ? value : []
    return <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{(question.options || []).map(v =>
      <label key={v} className="min-h-11 flex items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={selected.includes(v)}
        onChange={e => onChange(e.target.checked ? [...selected, v] : selected.filter(x => x !== v))}/><span>{v}</span></label>)}</div>
  }
  const numeric = ['integer', 'decimal'].includes(question.answer_type)
  return <div className="relative"><input value={value ?? ''} type={numeric ? 'number' : 'text'} inputMode={numeric ? 'decimal' : 'text'}
    onChange={e => onChange(numeric ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
    className="w-full min-h-11 rounded-lg border border-gray-300 px-3"/>{question.unit && <span className="absolute left-3 top-3 text-sm text-gray-500">{question.unit}</span>}</div>
}

export default function DynamicQuestionnaire() {
  const { id } = useParams(); const navigate = useNavigate()
  const [plan, setPlan] = useState([]); const [revision, setRevision] = useState(null)
  const [page, setPage] = useState(0); const [values, setValues] = useState({}); const [states, setStates] = useState({})
  const [saveState, setSaveState] = useState('saved'); const [error, setError] = useState(''); const [readiness, setReadiness] = useState(null)
  const timer = useRef(null)

  async function load() {
    try {
      const data = await api.get(`/projects/${id}/question-plan`); setPlan(data.plan); setRevision(data.revision)
      const nextValues = {}, nextStates = {}; data.plan.forEach(q => { if (q.answer) { nextValues[q.question_id] = q.answer.value; nextStates[q.question_id] = q.answer.state } })
      setValues(nextValues); setStates(nextStates); setReadiness(await api.get(`/projects/${id}/readiness`))
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load(); return () => clearTimeout(timer.current) }, [id])
  const pages = useMemo(() => Array.from({ length: Math.ceil(plan.length / 5) }, (_, i) => plan.slice(i * 5, i * 5 + 5)), [plan])
  const questions = pages[page] || []; const progress = plan.length ? Math.round(Object.keys(states).length / plan.length * 100) : 0

  function change(question, value) {
    const nextValues = { ...values, [question.question_id]: value }; const nextStates = { ...states, [question.question_id]: 'explicit' }
    setValues(nextValues); setStates(nextStates); setSaveState('pending'); clearTimeout(timer.current)
    timer.current = setTimeout(() => save([{ question_id: question.question_id, state: 'explicit', value, source: 'user' }]), 500)
  }
  async function save(answers) {
    setSaveState('saving'); setError('')
    try { const data = await api.post(`/projects/${id}/answers`, { revision, answers }); setRevision(data.revision); setReadiness(data.readiness); setSaveState('saved'); await load() }
    catch (e) { setSaveState('error'); setError(e.message === 'revision_conflict' ? 'تم تعديل المشروع في جلسة أخرى. حدّث الصفحة ثم أعد المحاولة.' : e.message) }
  }

  return <div className="questionnaire-shell max-w-6xl mx-auto pb-24" dir="rtl">
    <div className="mb-5"><h1 className="text-2xl font-bold">استبيان المشروع الديناميكي</h1><p className="text-gray-500 mt-1">الأسئلة الظاهرة مرتبطة بنوع المشروع وإجاباتك فقط.</p></div>
    <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-3"><div className="h-full bg-primary-600" style={{ width: `${progress}%` }}/></div>
    <div className="flex gap-2 overflow-x-auto pb-3 mb-4">{stages.map((s, i) => <span key={s} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs ${i <= Math.floor(page / Math.max(1, pages.length / 6)) ? 'bg-primary-100 text-primary-700' : 'bg-gray-100'}`}>{s}</span>)}</div>
    {error && <div className="mb-4 flex gap-2 rounded-lg bg-red-50 p-4 text-red-700"><AlertCircle className="w-5 h-5"/>{error}</div>}
    <div className="grid lg:grid-cols-[1fr_280px] gap-5 items-start">
      <main className="space-y-4">{questions.map(q => <section key={q.question_id} className="bg-white border rounded-xl p-4 sm:p-5">
        <div className="flex justify-between gap-3 mb-3"><label className="font-bold">{q.text_ar}</label>{q.critical && <span className="text-xs text-red-600">مطلوب</span>}</div>
        {fieldValue(q, values[q.question_id], value => change(q, value))}
        {states[q.question_id] === 'inferred' && <p className="mt-2 text-xs text-amber-700">قيمة مستنتجة — تحتاج تأكيدك</p>}
      </section>)}</main>
      <aside className="bg-white border rounded-xl p-4 lg:sticky lg:top-5"><h2 className="font-bold mb-3">ملخص الجاهزية</h2>
        <p className="text-sm mb-2">تمت الإجابة: {Object.keys(states).length} من {plan.length}</p>
        <p className="text-sm mb-2">النواقص الحرجة: {readiness?.missing_critical?.length ?? '—'}</p>
        <p className="text-sm">التناقضات: {readiness?.contradictions?.length ?? '—'}</p>
        {readiness?.ready_for_approved_boq && <div className="flex gap-2 text-green-700 mt-3"><CheckCircle2 className="w-5"/>جاهز للاعتماد</div>}
      </aside>
    </div>
    <nav className="fixed bottom-0 right-0 left-0 bg-white border-t p-3 z-20"><div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
      <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={!page} className="min-h-11 px-3 rounded-lg border flex items-center gap-1 disabled:opacity-40"><ChevronRight className="w-4"/>السابق</button>
      <button type="button" onClick={() => navigate(`/projects/${id}`)} className="min-h-11 px-3 rounded-lg border flex items-center gap-1"><Save className="w-4"/>حفظ وخروج</button>
      <span className="hidden sm:flex text-xs text-gray-500 items-center gap-1">{saveState === 'saving' && <Loader2 className="w-4 animate-spin"/>}{saveState === 'saved' ? 'تم الحفظ' : saveState === 'pending' ? 'بانتظار الحفظ' : saveState === 'saving' ? 'جارٍ الحفظ' : 'تعذر الحفظ'}</span>
      <button type="button" onClick={() => page + 1 < pages.length ? setPage(p => p + 1) : navigate(`/projects/${id}/review`)} className="min-h-11 px-4 rounded-lg bg-primary-600 text-white flex items-center gap-1">{page + 1 < pages.length ? 'التالي' : 'المراجعة'}<ChevronLeft className="w-4"/></button>
    </div></nav>
  </div>
}
