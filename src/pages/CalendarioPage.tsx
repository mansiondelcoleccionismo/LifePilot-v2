import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PageHeader } from '@/components/layout/PageContainer'
import {
  ArrowLeft, ArrowRight, BookHeart, Calendar, CheckSquare,
  Dumbbell, Pill, Plus, Trash2, Utensils, X,
} from 'lucide-react'
import {
  collection, getDocs, onSnapshot, orderBy,
  query, Timestamp, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  addCalendarEvent, deleteCalendarEvent, updateCalendarEvent,
} from '@/services/calendar.service'
import { getMonthICalEvents, type ICalEvent } from '@/services/ical.service'
import type { CalendarEvent, EventCategory, EventColor } from '@/types/event'

// ─── Types ────────────────────────────────────────────────────────────────────
interface DiaryEntry { date: string; mood: 1|2|3|4|5; note: string; tags: string[] }
interface FoodEntry  { id: string; name: string; kcal: number; protein: number; carbs: number; fat: number; createdAt: Date }
interface TaskItem   { id: string; title: string; completed: boolean; priority: string; createdAt: Date }
interface MedItem    { id: string; name: string; dose: number; unit: string; time: string }
interface ExSet      { exerciseId: string; date: string; sets: { reps: string; weight: string; done: boolean }[] }

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAYS_SHORT = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

const MOOD_CFG = [
  { v: 1, emoji: '😢', label: 'Muy mal',  color: '#EF4444' },
  { v: 2, emoji: '😕', label: 'Regular',  color: '#F97316' },
  { v: 3, emoji: '😐', label: 'Normal',   color: '#EAB308' },
  { v: 4, emoji: '🙂', label: 'Bien',     color: '#84CC16' },
  { v: 5, emoji: '😄', label: 'Genial',   color: '#22C55E' },
]

const EX_NAMES: Record<string, string> = {
  'curl-biceps': 'Curl Bíceps', 'curl-martillo': 'Curl Martillo',
  'remo-mancuerna': 'Remo Mancuerna', 'sentadilla-goblet': 'Sentadilla Goblet',
  'sentadilla-bulgara': 'Sentadilla Búlgara', 'peso-muerto-rumano': 'Peso Muerto Rumano',
  'puente-gluteos': 'Puente Glúteos', 'flexiones': 'Flexiones',
  'press-hombros': 'Press Hombros', 'elevaciones-laterales': 'Elevaciones Laterales',
  'extension-triceps': 'Extensión Tríceps', 'sentadilla-mancuernas': 'Sentadilla Mancuernas',
  'zancadas': 'Zancadas', 'plancha': 'Plancha', 'mountain-climbers': 'Mountain Climbers',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
function todayStr() {
  const n = new Date()
  return toDateStr(n.getFullYear(), n.getMonth(), n.getDate())
}
function monthGrid(y: number, m: number): (number|null)[] {
  const offset = (new Date(y, m, 1).getDay() + 6) % 7
  const count  = new Date(y, m + 1, 0).getDate()
  const cells: (number|null)[] = Array(offset).fill(null)
  for (let d = 1; d <= count; d++) cells.push(d)
  return cells
}

// ─── Section sub-component ────────────────────────────────────────────────────
function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
      <div className="flex items-center gap-2 mb-2.5">
        {icon}
        <span className="text-[10px] font-semibold text-white/50 uppercase tracking-widest">{title}</span>
      </div>
      {children}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function CalendarioPage() {
  const today = new Date()
  const [curMonth, setCurMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState<string|null>(null)
  const [showPanel, setShowPanel] = useState(false)
  const [loading, setLoading] = useState(true)

  // Per-day data stores
  const [diaryByDay,     setDiaryByDay]     = useState<Record<string, DiaryEntry>>({})
  const [exerciseByDay,  setExerciseByDay]  = useState<Record<string, ExSet[]>>({})
  const [nutritionByDay, setNutritionByDay] = useState<Record<string, FoodEntry[]>>({})
  const [tasksByDay,     setTasksByDay]     = useState<Record<string, TaskItem[]>>({})
  const [eventsByDay,    setEventsByDay]    = useState<Record<string, CalendarEvent[]>>({})
  const [icalByDay,      setIcalByDay]      = useState<Record<string, ICalEvent[]>>({})

  // Day-detail medication state
  const [meds,    setMeds]    = useState<MedItem[]>([])
  const [medLogs, setMedLogs] = useState<Record<string, boolean>>({})

  // Event form state
  const [showEventForm,  setShowEventForm]  = useState(false)
  const [editingEvent,   setEditingEvent]   = useState<CalendarEvent|null>(null)
  const [eventTitle,     setEventTitle]     = useState('')
  const [eventTime,      setEventTime]      = useState('')
  const [eventColor,     setEventColor]     = useState<EventColor>('#3B82F6')
  const [eventCategory,  setEventCategory]  = useState<EventCategory>('personal')

  const year  = curMonth.getFullYear()
  const month = curMonth.getMonth()
  const monthKey = `${year}-${String(month + 1).padStart(2,'0')}`
  const cells = useMemo(() => monthGrid(year, month), [year, month])

  // ── Load monthly batch data ────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    const startStr = toDateStr(year, month, 1)
    const endStr   = toDateStr(year, month, new Date(year, month + 1, 0).getDate())
    const startTs  = Timestamp.fromDate(new Date(year, month, 1, 0, 0, 0))
    const endTs    = Timestamp.fromDate(new Date(year, month + 1, 0, 23, 59, 59))

    Promise.all([
      // Diary
      getDocs(query(
        collection(db, 'diary_entries'),
        where('date', '>=', startStr), where('date', '<=', endStr),
      )).then(snap => {
        const map: Record<string, DiaryEntry> = {}
        snap.docs.forEach(d => { const e = d.data() as DiaryEntry; map[e.date] = e })
        setDiaryByDay(map)
      }),

      // Exercise sets
      getDocs(query(
        collection(db, 'exercise_sets'),
        where('date', '>=', startStr), where('date', '<=', endStr),
      )).then(snap => {
        const map: Record<string, ExSet[]> = {}
        snap.docs.forEach(d => {
          const s = d.data() as ExSet
          if (!map[s.date]) map[s.date] = []
          map[s.date].push(s)
        })
        setExerciseByDay(map)
      }),

      // Nutrition (grouped by calendar day from createdAt)
      getDocs(query(
        collection(db, 'nutrition_entries'),
        where('createdAt', '>=', startTs), where('createdAt', '<=', endTs),
        orderBy('createdAt', 'asc'),
      )).then(snap => {
        const map: Record<string, FoodEntry[]> = {}
        snap.docs.forEach(d => {
          const e = { id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() ?? new Date() } as FoodEntry
          const ds = toDateStr(e.createdAt.getFullYear(), e.createdAt.getMonth(), e.createdAt.getDate())
          if (!map[ds]) map[ds] = []
          map[ds].push(e)
        })
        setNutritionByDay(map)
      }),

      // Tasks (grouped by calendar day from createdAt)
      getDocs(query(
        collection(db, 'tasks'),
        where('createdAt', '>=', startTs), where('createdAt', '<=', endTs),
      )).then(snap => {
        const map: Record<string, TaskItem[]> = {}
        snap.docs.forEach(d => {
          const t = { id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() ?? new Date() } as TaskItem
          const ds = toDateStr(t.createdAt.getFullYear(), t.createdAt.getMonth(), t.createdAt.getDate())
          if (!map[ds]) map[ds] = []
          map[ds].push(t)
        })
        setTasksByDay(map)
      }),
    ]).finally(() => setLoading(false))
  }, [year, month])

  // ── Subscribe calendar events ──────────────────────────────────────────────
  useEffect(() => {
    const [y, m] = monthKey.split('-').map(Number)
    const startDate = `${monthKey}-01`
    const endDate   = `${monthKey}-${new Date(y, m, 0).getDate().toString().padStart(2,'0')}`
    const q = query(
      collection(db, 'calendar_events'),
      where('date', '>=', startDate), where('date', '<=', endDate),
      orderBy('date', 'asc'), orderBy('time', 'asc'),
    )
    return onSnapshot(q, snap => {
      const map: Record<string, CalendarEvent[]> = {}
      snap.docs.forEach(d => {
        const ev = { id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() ?? new Date(), updatedAt: d.data().updatedAt?.toDate() ?? new Date() } as CalendarEvent
        if (!map[ev.date]) map[ev.date] = []
        map[ev.date].push(ev)
      })
      setEventsByDay(map)
    })
  }, [monthKey])

  // ── iCloud Calendar events for month ──────────────────────────────────────
  useEffect(() => {
    getMonthICalEvents(year, month).then(events => {
      const map: Record<string, ICalEvent[]> = {}
      for (const ev of events) {
        const day = ev.start.toISOString().slice(0, 10)
        if (!map[day]) map[day] = []
        map[day].push(ev)
      }
      setIcalByDay(map)
    }).catch(() => {})
  }, [year, month])

  // ── Load medications for selected day ─────────────────────────────────────
  useEffect(() => {
    if (!selectedDay) return
    setMeds([])
    setMedLogs({})
    Promise.all([
      getDocs(query(collection(db, 'medications'), orderBy('createdAt', 'asc'))).then(snap =>
        setMeds(snap.docs.map(d => ({ id: d.id, ...d.data() })) as MedItem[])
      ),
      getDocs(collection(db, 'medication_logs', selectedDay, 'medications')).then(snap => {
        const logs: Record<string, boolean> = {}
        snap.docs.forEach(d => { logs[d.id] = d.data().taken ?? false })
        setMedLogs(logs)
      }),
    ])
  }, [selectedDay])

  // ── Navigation ─────────────────────────────────────────────────────────────
  const navigate = (dir: -1|1) => {
    setCurMonth(prev => {
      const n = new Date(prev)
      n.setMonth(n.getMonth() + dir)
      return n
    })
    setSelectedDay(null)
    setShowPanel(false)
  }

  const handleDayClick = (dayNum: number) => {
    const ds = toDateStr(year, month, dayNum)
    setSelectedDay(ds)
    setShowPanel(true)
  }

  // ── Event form ─────────────────────────────────────────────────────────────
  const handleSaveEvent = () => {
    if (!selectedDay || !eventTitle.trim()) return
    const payload = { title: eventTitle.trim(), date: selectedDay, time: eventTime || undefined, color: eventColor, category: eventCategory }
    if (editingEvent) updateCalendarEvent(editingEvent.id, payload)
    else addCalendarEvent(payload)
    resetForm()
  }
  const resetForm = () => {
    setEventTitle(''); setEventTime(''); setEventColor('#3B82F6'); setEventCategory('personal')
    setShowEventForm(false); setEditingEvent(null)
  }

  // ── Selected day derived data ──────────────────────────────────────────────
  const selDiary      = selectedDay ? diaryByDay[selectedDay]     : undefined
  const selEx         = selectedDay ? (exerciseByDay[selectedDay] ?? [])  : []
  const selNut        = selectedDay ? (nutritionByDay[selectedDay] ?? []) : []
  const selTasks      = selectedDay ? (tasksByDay[selectedDay] ?? [])     : []
  const selEvents     = selectedDay ? (eventsByDay[selectedDay] ?? [])    : []
  const selIcal       = selectedDay ? (icalByDay[selectedDay] ?? [])      : []

  const selMoodCfg  = selDiary ? MOOD_CFG.find(m => m.v === selDiary.mood) : undefined
  const nutTotals   = selNut.reduce((a, f) => ({ kcal: a.kcal + f.kcal, protein: a.protein + f.protein, carbs: a.carbs + f.carbs, fat: a.fat + f.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 })

  // ── Day detail panel content ───────────────────────────────────────────────
  const PanelContent = (
    <div className="space-y-3">
      {/* Panel header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-[10px] text-white/35 uppercase tracking-widest">Resumen</p>
          <h3 className="text-base font-bold text-white/90 mt-0.5 leading-tight">
            {selectedDay
              ? new Date(selectedDay + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
              : ''}
          </h3>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowEventForm(true)}
            className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 flex items-center justify-center transition"
          >
            <Plus size={14} className="text-white" />
          </button>
          <button
            onClick={() => setShowPanel(false)}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition lg:hidden"
          >
            <X size={14} className="text-white/60" />
          </button>
        </div>
      </div>

      {/* Exercise */}
      <Section icon={<Dumbbell size={14} className="text-emerald-400" />} title="Ejercicio">
        {selEx.filter(s => s.sets.some(x => x.done)).length > 0 ? (
          <div className="space-y-1.5">
            {selEx.filter(s => s.sets.some(x => x.done)).map(s => {
              const done = s.sets.filter(x => x.done)
              const maxW = Math.max(...done.map(x => parseFloat(x.weight) || 0))
              return (
                <div key={s.exerciseId} className="flex items-center justify-between">
                  <span className="text-sm text-white/70">{EX_NAMES[s.exerciseId] || s.exerciseId}</span>
                  <span className="text-xs text-white/40">{done.length} series{maxW > 0 ? ` · ${maxW}kg` : ''}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-white/35">Sin registro</p>
        )}
      </Section>

      {/* Mood / Diary */}
      <Section icon={<BookHeart size={14} className="text-violet-400" />} title="Estado de ánimo">
        {selDiary ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xl">{selMoodCfg?.emoji}</span>
              <div className="min-w-0">
                <p className="text-sm text-white/80">{selMoodCfg?.label}</p>
                {selDiary.note && (
                  <p className="text-xs text-white/45 mt-0.5 line-clamp-3">{selDiary.note}</p>
                )}
              </div>
            </div>
            {selDiary.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selDiary.tags.map(t => (
                  <span key={t} className="px-2 py-0.5 rounded-full bg-white/8 text-xs text-white/50">{t}</span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-white/35">Sin entrada en el diario</p>
        )}
      </Section>

      {/* Nutrition */}
      <Section icon={<Utensils size={14} className="text-orange-400" />} title="Nutrición">
        {selNut.length > 0 ? (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-1 text-center">
              {([['kcal', nutTotals.kcal, 'kcal'], ['prot', nutTotals.protein, 'g'], ['carbs', nutTotals.carbs, 'g'], ['grasa', nutTotals.fat, 'g']] as [string,number,string][]).map(([label, val, unit]) => (
                <div key={label} className="rounded-xl bg-white/5 p-1.5">
                  <p className="text-xs font-medium text-white/80">{Math.round(val)}<span className="text-white/40 font-normal text-[10px]">{unit}</span></p>
                  <p className="text-[9px] text-white/35 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {selNut.map(f => (
                <div key={f.id} className="flex justify-between text-xs text-white/50">
                  <span className="truncate max-w-[65%]">{f.name}</span>
                  <span className="shrink-0">{f.kcal} kcal</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-white/35">Sin comidas registradas</p>
        )}
      </Section>

      {/* Tasks */}
      <Section icon={<CheckSquare size={14} className="text-blue-400" />} title="Tareas">
        {selTasks.length > 0 ? (
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {selTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${
                  t.completed ? 'bg-emerald-500/20 border-emerald-500/40' : 'border-white/20'
                }`}>
                  {t.completed && <span className="text-emerald-400 text-[9px] leading-none">✓</span>}
                </div>
                <span className={`text-sm ${t.completed ? 'text-white/35 line-through' : 'text-white/70'}`}>{t.title}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/35">Sin tareas ese día</p>
        )}
      </Section>

      {/* Medication */}
      <Section icon={<Pill size={14} className="text-pink-400" />} title="Medicación">
        {meds.length > 0 ? (
          <div className="space-y-1.5">
            {meds.map(m => (
              <div key={m.id} className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded-full border shrink-0 flex items-center justify-center ${
                  medLogs[m.id] ? 'bg-pink-500/20 border-pink-500/40' : 'border-white/20'
                }`}>
                  {medLogs[m.id] && <span className="text-pink-400 text-[9px] leading-none">✓</span>}
                </div>
                <span className={`text-sm flex-1 ${medLogs[m.id] ? 'text-white/70' : 'text-white/40'}`}>
                  {m.name} {m.dose}{m.unit}
                </span>
                <span className="text-xs text-white/30">{m.time}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/35">Sin medicación configurada</p>
        )}
      </Section>

      {/* Events */}
      <Section icon={<Calendar size={14} className="text-cyan-400" />} title="Eventos">
        {(selIcal.length > 0 || selEvents.length > 0) ? (
          <div className="space-y-2">
            {/* iCloud Calendar events */}
            {selIcal.map(ev => {
              const time = ev.isAllDay ? '' : ev.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={ev.id} className="flex items-center gap-2">
                  <span className="text-xs shrink-0 leading-none">🍎</span>
                  <span className="text-sm text-white/70 flex-1 truncate">{ev.title}</span>
                  {time && <span className="text-xs text-white/35 shrink-0">{time}</span>}
                </div>
              )
            })}
            {/* Local events */}
            {selEvents.map(ev => (
              <div key={ev.id} className="flex items-center gap-2 group">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                <span className="text-sm text-white/70 flex-1 truncate">{ev.title}</span>
                {ev.time && <span className="text-xs text-white/35 shrink-0">{ev.time}</span>}
                <button
                  onClick={() => { if (confirm('¿Eliminar evento?')) deleteCalendarEvent(ev.id) }}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition"
                >
                  <Trash2 size={10} className="text-red-400" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/35">Sin eventos</p>
        )}
      </Section>
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-7xl mx-auto pb-28">
      <PageHeader
        breadcrumb="Calendario · Vista unificada"
        title="Calendario"
        subtitle={`${MONTHS[month]} ${year}`}
        actions={
          <>
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center hover:border-white/14 transition"
            >
              <ArrowLeft size={16} className="text-white/70" />
            </button>
            <button
              onClick={() => navigate(1)}
              className="w-9 h-9 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center hover:border-white/14 transition"
            >
              <ArrowRight size={16} className="text-white/70" />
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* Calendar grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5"
        >
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-3">
            {DAYS_SHORT.map(d => (
              <div key={d} className="text-center text-xs font-medium text-white/35 py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          {loading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {cells.map((dayNum, i) => {
                if (!dayNum) return <div key={i} />
                const ds      = toDateStr(year, month, dayNum)
                const isTod   = ds === todayStr()
                const isSel   = ds === selectedDay
                const future  = new Date(year, month, dayNum) > today
                const diary   = diaryByDay[ds]
                const moodDot = diary ? MOOD_CFG.find(m => m.v === diary.mood) : undefined
                const hasEx   = (exerciseByDay[ds] ?? []).some(s => s.sets.some(x => x.done))
                const hasNut  = (nutritionByDay[ds] ?? []).length > 0
                const doneT   = (tasksByDay[ds] ?? []).filter(t => t.completed).length
                const evts    = eventsByDay[ds] ?? []

                return (
                  <motion.div
                    key={ds}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handleDayClick(dayNum)}
                    className={`aspect-square rounded-2xl border transition-all cursor-pointer ${
                      isSel   ? 'border-blue-500/60 bg-blue-500/12 ring-1 ring-blue-500/20' :
                      isTod   ? 'border-blue-400/50 bg-blue-500/8 ring-1 ring-blue-400/20' :
                      future  ? 'border-white/5 opacity-35' :
                                'border-white/8 bg-white/4 hover:border-white/16 hover:bg-white/6'
                    }`}
                  >
                    <div className="h-full p-1 sm:p-1.5 flex flex-col">
                      <span className={`text-[11px] sm:text-xs font-semibold leading-none mb-1 ${
                        isTod ? 'text-blue-300' : future ? 'text-white/25' : 'text-white/65'
                      }`}>
                        {dayNum}
                      </span>
                      <div className="flex flex-wrap gap-0.5 flex-1 content-start">
                        {hasEx && (
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Ejercicio" />
                        )}
                        {moodDot && (
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: moodDot.color }} title="Ánimo" />
                        )}
                        {hasNut && (
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-400" title="Nutrición" />
                        )}
                        {evts.slice(0, 2).map((ev, ei) => (
                          <div key={ei} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ev.color }} />
                        ))}
                      </div>
                      {doneT > 0 && (
                        <span className="text-[8px] sm:text-[9px] text-white/30 font-medium">{doneT}✓</span>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex gap-3 mt-4 flex-wrap">
            {[
              { cls: 'bg-emerald-400', label: 'Ejercicio' },
              { cls: 'bg-amber-400',   label: 'Ánimo' },
              { cls: 'bg-orange-400',  label: 'Nutrición' },
              { cls: 'bg-blue-400',    label: 'Eventos' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${l.cls}`} />
                <span className="text-xs text-white/30">{l.label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Desktop side panel */}
        <div className="hidden lg:block">
          <AnimatePresence mode="wait">
            {selectedDay ? (
              <motion.div
                key={selectedDay}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.18 }}
                className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5 max-h-[calc(100vh-200px)] overflow-y-auto sticky top-20"
              >
                {PanelContent}
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-3xl border border-white/8 bg-[#1E1E28] p-10 text-center"
              >
                <Calendar size={36} className="text-white/15 mx-auto mb-3" />
                <p className="text-sm text-white/30">Selecciona un día</p>
                <p className="text-xs text-white/20 mt-1">Ver ejercicio, ánimo, nutrición y más</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <AnimatePresence>
        {showPanel && selectedDay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setShowPanel(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-[#1E1E28] border-t border-white/8 p-5 pb-8 max-h-[88vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
              {PanelContent}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event form modal */}
      <AnimatePresence>
        {showEventForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={resetForm}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-md rounded-3xl border border-white/8 bg-[#1E1E28] p-6 max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-white/90">
                  {editingEvent ? 'Editar' : 'Nuevo'} evento
                </h3>
                <button onClick={resetForm} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition">
                  <X size={16} className="text-white/70" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Título</label>
                  <input
                    value={eventTitle}
                    onChange={e => setEventTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveEvent()}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none focus:border-blue-500/40 transition"
                    placeholder="Título del evento"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Hora (opcional)</label>
                  <input
                    type="time"
                    value={eventTime}
                    onChange={e => setEventTime(e.target.value)}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Color</label>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#84CC16'].map(c => (
                      <button
                        key={c}
                        onClick={() => setEventColor(c as EventColor)}
                        className={`w-8 h-8 rounded-full border-2 transition ${eventColor === c ? 'border-white/50 scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Categoría</label>
                  <select
                    value={eventCategory}
                    onChange={e => setEventCategory(e.target.value as EventCategory)}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                  >
                    <option value="personal">Personal</option>
                    <option value="familia">Familia</option>
                    <option value="salud">Salud</option>
                    <option value="trabajo">Trabajo</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSaveEvent}
                    disabled={!eventTitle.trim()}
                    className="flex-1 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition"
                  >
                    {editingEvent ? 'Actualizar' : 'Crear'} evento
                  </button>
                  <button onClick={resetForm} className="px-5 py-3 text-sm text-white/60 hover:text-white transition">
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
