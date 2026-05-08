import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, Flame, Trash2, TrendingUp,
} from 'lucide-react'
import {
  collection, deleteDoc, doc, getDocs, onSnapshot,
  query, serverTimestamp, setDoc, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface DiaryEntry {
  date: string
  mood: 1 | 2 | 3 | 4 | 5
  note: string
  tags: string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MOOD = [
  { v: 1 as const, emoji: '😢', label: 'Muy mal',  bg: 'bg-rose-500'    },
  { v: 2 as const, emoji: '😕', label: 'Regular',  bg: 'bg-orange-400'  },
  { v: 3 as const, emoji: '😐', label: 'Normal',   bg: 'bg-amber-400'   },
  { v: 4 as const, emoji: '🙂', label: 'Bien',     bg: 'bg-lime-400'    },
  { v: 5 as const, emoji: '😄', label: 'Genial',   bg: 'bg-emerald-500' },
] as const

const TAGS = ['trabajo', 'familia', 'salud', 'ejercicio', 'descanso', 'social', 'estrés']
const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function todayStr() {
  const n = new Date()
  return toDateStr(n.getFullYear(), n.getMonth(), n.getDate())
}
function monthGrid(y: number, m: number) {
  const offset = (new Date(y, m, 1).getDay() + 6) % 7
  const count = new Date(y, m + 1, 0).getDate()
  const cells: (number | null)[] = Array(offset).fill(null)
  for (let d = 1; d <= count; d++) cells.push(d)
  while (cells.length % 7) cells.push(null)
  return cells
}
function formatFullDate(ds: string) {
  const [y, mo, d] = ds.split('-').map(Number)
  return `${d} de ${MONTHS[mo - 1]} de ${y}`
}

// ─── Firebase ─────────────────────────────────────────────────────────────────
const COL = 'diary_entries'

function subscribeMonth(
  y: number, m: number,
  cb: (entries: DiaryEntry[]) => void,
  onErr?: () => void,
) {
  const start = toDateStr(y, m, 1)
  const end   = toDateStr(y, m, new Date(y, m + 1, 0).getDate())
  const q = query(
    collection(db, COL),
    where('date', '>=', start),
    where('date', '<=', end),
  )
  return onSnapshot(
    q,
    (snap) => {
      const entries = snap.docs
        .map((d) => d.data() as DiaryEntry)
        .sort((a, b) => a.date.localeCompare(b.date))
      console.log('[Diario] subscribeMonth OK:', entries.length, 'entradas')
      cb(entries)
    },
    (err) => { console.error('[Diario] subscribeMonth ERROR:', err); onErr?.(); cb([]) },
  )
}

async function upsertEntry(entry: DiaryEntry) {
  await setDoc(doc(db, COL, entry.date), { ...entry, updatedAt: serverTimestamp() })
}

async function removeEntry(date: string) {
  await deleteDoc(doc(db, COL, date))
}

async function loadRecentDates(days = 62): Promise<Set<string>> {
  try {
    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = toDateStr(since.getFullYear(), since.getMonth(), since.getDate())
    // Sin orderBy para evitar índice compuesto
    const q = query(collection(db, COL), where('date', '>=', sinceStr))
    const snap = await getDocs(q)
    return new Set(snap.docs.map((d) => d.data().date as string))
  } catch (err) {
    console.error('[Diario] loadRecentDates error:', err)
    return new Set<string>()
  }
}

const SEED_KEY = 'lifepilot_diary_seeded_v2'

async function seedOldData() {
  if (localStorage.getItem(SEED_KEY)) return
  const seeds: DiaryEntry[] = [
    {
      date: '2026-05-02', mood: 5,
      note: 'Los dias de antes muy bien en la playa con amigos y los niños muy bien',
      tags: ['familia', 'social'],
    },
    {
      date: '2026-05-04', mood: 2,
      note: 'discutimos el domingo y sigo chof',
      tags: ['familia', 'estrés'],
    },
    {
      date: '2026-05-05', mood: 2,
      note: 'estoy malillo tambien y influye un poco',
      tags: ['salud'],
    },
    {
      date: '2026-05-06', mood: 3,
      note: 'el dia regular porque estoy algo malilllo, pero he estado por la tarde con Kira y se me ha pasado todo',
      tags: ['salud', 'familia'],
    },
  ]
  try {
    for (const s of seeds) {
      // setDoc con merge:true para no sobreescribir si el usuario ya editó esa entrada
      await setDoc(doc(db, COL, s.date), { ...s, updatedAt: serverTimestamp() }, { merge: true })
      console.log('[Diario] seed OK:', s.date)
    }
    localStorage.setItem(SEED_KEY, '1')
    console.log('[Diario] seed completo')
  } catch (err) {
    console.error('[Diario] seed error (reintentará la próxima vez):', err)
  }
}

// ─── Stats helpers ────────────────────────────────────────────────────────────
function calcStreak(recentDates: Set<string>): number {
  let streak = 0
  const d = new Date()
  for (let i = 0; i < 63; i++) {
    const key = toDateStr(d.getFullYear(), d.getMonth(), d.getDate())
    if (recentDates.has(key)) {
      streak++
    } else if (i === 0) {
      // today not logged yet — don't break streak
    } else {
      break
    }
    d.setDate(d.getDate() - 1)
  }
  return streak
}

function calcAvgMood(entries: DiaryEntry[]): number {
  if (!entries.length) return 0
  return Math.round((entries.reduce((a, e) => a + e.mood, 0) / entries.length) * 10) / 10
}

function calcBestDayOfWeek(entries: DiaryEntry[]): string {
  const goodDays = entries.filter((e) => e.mood >= 4)
  if (!goodDays.length) return '—'
  const DN = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const counts: Record<number, number> = {}
  for (const e of goodDays) {
    const dow = new Date(e.date + 'T12:00:00').getDay()
    counts[dow] = (counts[dow] ?? 0) + 1
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return best ? DN[Number(best[0])] : '—'
}

// ─── StatBox ──────────────────────────────────────────────────────────────────
function StatBox({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-[#1E1E28] border border-white/8 p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-white/25 mb-0.5 truncate">{label}</p>
        <p className="text-base font-bold text-white/90 leading-none">{value}</p>
        {sub && <p className="text-[11px] text-white/35 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── DiarioPage ───────────────────────────────────────────────────────────────
export function DiarioPage() {
  const today = todayStr()
  const now   = new Date()

  const [year,         setYear]         = useState(now.getFullYear())
  const [month,        setMonth]        = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState(today)
  const [entries,      setEntries]      = useState<DiaryEntry[]>([])
  const [recentDates,  setRecentDates]  = useState<Set<string>>(new Set())
  const [mood,  setMood]  = useState<1|2|3|4|5>(3)
  const [note,  setNote]  = useState('')
  const [tags,  setTags]  = useState<string[]>([])
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [fbStatus, setFbStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  // Seed histórico (solo la primera vez) y racha — en paralelo
  useEffect(() => {
    seedOldData()
    loadRecentDates(62).then(setRecentDates)
  }, [])

  // Suscripción al mes activo
  useEffect(() => {
    setFbStatus('loading')
    return subscribeMonth(
      year, month,
      (data) => { setEntries(data); setFbStatus('ok') },
      () => setFbStatus('error'),
    )
  }, [year, month])

  // Mapa rápido fecha → entrada
  const entryMap = useMemo(() => {
    const map: Record<string, DiaryEntry> = {}
    for (const e of entries) map[e.date] = e
    return map
  }, [entries])

  const selectedEntry = entryMap[selectedDate]

  // Rellenar formulario al cambiar de día o cuando carga la entrada de Firebase
  useEffect(() => {
    setMood(selectedEntry?.mood ?? 3)
    setNote(selectedEntry?.note ?? '')
    setTags(selectedEntry?.tags ?? [])
    setSaved(false)
  }, [selectedDate, selectedEntry])

  const grid = useMemo(() => monthGrid(year, month), [year, month])

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11) }
    else setMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0) }
    else setMonth((m) => m + 1)
  }

  const toggleTag = (tag: string) =>
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])

  const handleSave = async () => {
    setSaving(true)
    try {
      await upsertEntry({ date: selectedDate, mood, note, tags })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      loadRecentDates(62).then(setRecentDates)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await removeEntry(selectedDate)
      setMood(3); setNote(''); setTags([])
      loadRecentDates(62).then(setRecentDates)
    } finally {
      setDeleting(false)
    }
  }

  const avgMood = useMemo(() => calcAvgMood(entries), [entries])
  const streak  = useMemo(() => calcStreak(recentDates), [recentDates])
  const bestDay = useMemo(() => calcBestDayOfWeek(entries), [entries])
  const avgMoodOpt = avgMood > 0 ? MOOD[Math.round(avgMood) - 1] : null

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-3xl mx-auto">

      {/* Header */}
      {fbStatus === 'error' && (
        <div className="mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-2.5 text-sm text-rose-300">
          ⚠️ Error conectando con Firebase — revisa la consola (F12)
        </div>
      )}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <p className="text-sm text-white/35">Diario · Registro emocional</p>
        <h1 className="text-3xl font-bold text-white/90 mt-1">Tu diario</h1>
      </motion.div>

      {/* ── Calendario ── */}
      <div className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5 mb-4">

        {/* Navegación de mes */}
        <div className="flex items-center justify-between mb-5">
          <button type="button" onClick={prevMonth}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition">
            <ArrowLeft size={15} className="text-white/60" />
          </button>
          <h2 className="text-sm font-semibold text-white/80 tracking-wide">
            {MONTHS[month]} {year}
          </h2>
          <button type="button" onClick={nextMonth}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition">
            <ArrowRight size={15} className="text-white/60" />
          </button>
        </div>

        {/* Cabeceras de días */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS_SHORT.map((d) => (
            <div key={d} className="text-center text-[10px] uppercase tracking-widest text-white/20 py-1">{d}</div>
          ))}
        </div>

        {/* Grid de días */}
        <div className="grid grid-cols-7 gap-0.5">
          {grid.map((day, i) => {
            if (!day) return <div key={`_${i}`} className="py-3" />
            const ds       = toDateStr(year, month, day)
            const entry    = entryMap[ds]
            const moodOpt  = entry ? MOOD[entry.mood - 1] : null
            const isToday  = ds === today
            const isSel    = ds === selectedDate

            return (
              <button key={ds} type="button" onClick={() => setSelectedDate(ds)}
                className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition ${
                  isSel ? 'bg-white/12' : 'hover:bg-white/7'
                }`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                  moodOpt ? moodOpt.bg : 'bg-white/8'
                } ${isToday ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1E1E28]' : ''}`}>
                  <span className={`text-[11px] font-bold leading-none ${moodOpt ? 'text-white' : 'text-white/35'}`}>
                    {day}
                  </span>
                </div>
                <span className="text-[9px] leading-none mt-0.5 h-3">
                  {moodOpt ? moodOpt.emoji : ''}
                </span>
              </button>
            )
          })}
        </div>

        {/* Leyenda */}
        <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-white/12" />
            <span className="text-[10px] text-white/25">Sin entrada</span>
          </div>
          {MOOD.map((opt) => (
            <div key={opt.v} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${opt.bg}`} />
              <span className="text-[10px] text-white/30">{opt.emoji} {opt.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Estadísticas ── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatBox
          icon={<TrendingUp size={15} className="text-blue-400" />}
          label="Mood del mes"
          value={avgMood > 0 ? `${avgMood}/5` : '—'}
          sub={avgMoodOpt?.label ?? 'sin datos'}
        />
        <StatBox
          icon={<Flame size={15} className="text-orange-400" />}
          label="Racha actual"
          value={streak > 0 ? `${streak}d` : '0d'}
          sub="días seguidos"
        />
        <StatBox
          icon={<CalendarDays size={15} className="text-emerald-400" />}
          label="Mejor día"
          value={bestDay}
          sub="más buen humor"
        />
      </div>

      {/* ── Panel de entrada ── */}
      <div className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5">

        {/* Título */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/25 mb-1">Entrada del día</p>
            <h2 className="text-base font-semibold text-white/90">{formatFullDate(selectedDate)}</h2>
          </div>
          {selectedEntry && (
            <span className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              ✓ Guardado
            </span>
          )}
        </div>

        {/* Selector de mood */}
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-widest text-white/25 mb-3">¿Cómo te has sentido?</p>
          <div className="grid grid-cols-5 gap-2">
            {MOOD.map((opt) => (
              <button key={opt.v} type="button" onClick={() => setMood(opt.v)}
                className={`flex flex-col items-center gap-1.5 rounded-xl py-3 border transition ${
                  mood === opt.v
                    ? 'border-white/22 bg-white/8 shadow-sm'
                    : 'border-white/6 bg-white/3 hover:bg-white/6'
                }`}>
                <span className={`text-2xl transition-transform duration-150 ${mood === opt.v ? 'scale-125' : 'scale-100'}`}>
                  {opt.emoji}
                </span>
                <span className={`text-[9px] font-medium leading-none ${mood === opt.v ? 'text-white/70' : 'text-white/22'}`}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Nota del día */}
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Nota del día</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="¿Cómo ha ido el día?"
            className="w-full rounded-xl bg-white/4 border border-white/8 px-3 py-2.5 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/18 resize-none leading-relaxed"
          />
        </div>

        {/* Tags */}
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Etiquetas</p>
          <div className="flex flex-wrap gap-2">
            {TAGS.map((tag) => (
              <button key={tag} type="button" onClick={() => toggleTag(tag)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition ${
                  tags.includes(tag)
                    ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                    : 'bg-white/4 border-white/8 text-white/45 hover:text-white/70 hover:bg-white/7'
                }`}>
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition disabled:opacity-50">
            <Check size={14} />
            {saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar'}
          </button>
          {selectedEntry && (
            <button type="button" onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-4 py-2.5 text-sm text-white/40 hover:text-rose-400 hover:border-rose-500/25 transition disabled:opacity-50">
              <Trash2 size={14} />
              {deleting ? 'Borrando...' : 'Borrar entrada'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
