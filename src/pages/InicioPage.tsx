import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Sparkles, CheckSquare, TrendingUp, Flame, Calendar, RefreshCw, Loader2 } from 'lucide-react'
import { useTasks } from '@/hooks/useTasks'
import { useToday } from '@/hooks/useToday'
import { subscribeNutritionEntries } from '@/services/nutrition.service'
import { subscribeCalendarEvents } from '@/services/calendar.service'
import { subscribeDiaryEntries } from '@/services/diary.service'
import { subscribeAssets, calculateTotal } from '@/services/wealth.service'
import { MedicationWidget } from '@/components/MedicationWidget'
import { WeeklyReport } from '@/components/WeeklyReport'
import { useWeights } from '@/features/health/useWeights'
import { WeeklyWeightDialog } from '@/features/health/WeeklyWeightDialog'
import { loadProfile, getTargetForDay, getDayLabel, getDayKind, calcIMC } from '@/services/metabolic.service'
import { callAI, hasAnyAIKey } from '@/services/ai.service'
import type { Asset } from '@/types/wealth'
import type { FoodEntry, MacroTarget } from '@/types/nutrition'
import type { CalendarEvent } from '@/types/event'
import type { DiaryEntry } from '@/types/diary'
import type { UserProfile } from '@/types/profile'

interface BriefingData {
  saludo: string
  tipo_dia: string
  foco_dia: string
  macros_tip: string
  entreno_tip: string
  estado_animo: string
  prioridad: string
}

function getDayTheme(tipoDia: string) {
  const t = tipoDia.toLowerCase()
  if (t.includes('pesas') || t.includes('entreno') || t.includes('gym') || t.includes('training')) {
    return {
      badge:  'bg-blue-500/15 text-blue-300 border-blue-500/25',
      border: 'border-blue-900/30',
      bg:     'from-blue-950/40',
      pill:   'border-blue-500/15',
    }
  }
  if (t.includes('pádel') || t.includes('padel') || t.includes('tenis')) {
    return {
      badge:  'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
      border: 'border-emerald-900/30',
      bg:     'from-emerald-950/40',
      pill:   'border-emerald-500/10',
    }
  }
  return {
    badge:  'bg-violet-500/15 text-violet-300 border-violet-500/25',
    border: 'border-violet-900/30',
    bg:     'from-violet-950/40',
    pill:   'border-violet-500/10',
  }
}

function buildStaticBriefing(profile: UserProfile | null, target: MacroTarget | null): BriefingData {
  const protein = target?.protein ?? 160
  const kind = profile ? getDayKind(profile) : 'rest'
  const tipos: Record<string, string> = {
    training:       'Día de pesas 🏋️',
    padel:          'Día de pádel 🎾',
    padel_training: 'Pesas + Pádel 💪',
    rest:           'Día de descanso 😴',
  }
  const isActive = kind !== 'rest'
  return {
    saludo:       isActive ? 'Hoy toca sudar, a por ello' : 'Descansa y recarga bien',
    tipo_dia:     tipos[kind],
    foco_dia:     kind === 'training' ? 'Ejecutar el entreno con calidad máxima' : kind === 'padel' ? 'Disfrutar y competir en la pista' : kind === 'padel_training' ? 'Pesas por la mañana, pádel por la tarde' : 'Recuperación y nutrición correcta',
    macros_tip:   `Alcanza los ${protein}g de proteína hoy`,
    entreno_tip:  kind.includes('training') ? 'Progresión de cargas, técnica primero' : kind === 'padel' ? 'Calentar 10 min antes de empezar' : 'Movilidad suave o descanso activo',
    estado_animo: 'La constancia es la clave del progreso',
    prioridad:    kind.includes('training') ? 'Completar el entrenamiento planificado' : 'Alcanzar el objetivo de proteína',
  }
}

function BriefingSkeleton() {
  return (
    <div className="animate-pulse space-y-3 mt-3">
      <div className="h-px bg-white/6" />
      <div className="grid grid-cols-2 gap-2">
        {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-white/5 rounded-xl" />)}
      </div>
      <div className="h-10 bg-white/5 rounded-xl" />
    </div>
  )
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28 } },
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={item} className={`rounded-2xl bg-[#1E1E28] border border-white/8 p-5 ${className}`}>
      {children}
    </motion.div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-2">{children}</p>
}

const fmtEUR = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export function InicioPage() {
  const { tasks, completed, loading: tasksLoading } = useTasks()
  const { today, greeting } = useToday()
  const navigate = useNavigate()
  const { loadWeights, lastWeight, delta } = useWeights()
  const [nutritionEntries, setNutritionEntries] = useState<FoodEntry[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [briefingData, setBriefingData] = useState<BriefingData | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [showWeeklyReport, setShowWeeklyReport] = useState(false)

  const todayStr = new Date().toISOString().split('T')[0]
  const currentMonthKey = new Date().toISOString().slice(0, 7)

  const pendingTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks])
  const todayTasks = useMemo(() => pendingTasks.slice(0, 4), [pendingTasks])

  const todayNutrition = useMemo(() => {
    const todayEntries = nutritionEntries.filter(
      (e) => new Date(e.createdAt).toISOString().split('T')[0] === todayStr,
    )
    return todayEntries.reduce(
      (acc, e) => ({
        calories: acc.calories + e.kcal,
        protein: acc.protein + e.protein,
        carbs: acc.carbs + e.carbs,
        fat: acc.fat + e.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    )
  }, [nutritionEntries, todayStr])

  const todayEvents = useMemo(() => {
    return events
      .filter((e) => new Date(e.date).toISOString().split('T')[0] === todayStr)
      .sort((a, b) => (a.time && b.time ? a.time.localeCompare(b.time) : 0))
      .slice(0, 3)
  }, [events, todayStr])

  const streak = useMemo(() => {
    if (!diaryEntries.length) return 0
    const dates = [...new Set(
      diaryEntries.map((e) => new Date(e.createdAt).toISOString().split('T')[0]),
    )].sort().reverse()
    if (!dates.includes(todayStr)) return 0
    let count = 0
    const cur = new Date(todayStr)
    while (dates.includes(cur.toISOString().split('T')[0])) {
      count++
      cur.setDate(cur.getDate() - 1)
    }
    return count
  }, [diaryEntries, todayStr])

  const totalWealth = useMemo(() => calculateTotal(assets), [assets])

  const todayTarget = useMemo(() => profile ? getTargetForDay(profile) : null, [profile])
  const kcalTarget  = todayTarget?.kcal ?? 2200
  const imc         = profile ? calcIMC(profile) : null
  const proteinTarget = todayTarget?.protein ?? 160
  const proteinPct  = proteinTarget > 0 ? Math.min(100, Math.round((todayNutrition.protein / proteinTarget) * 100)) : 0

  useEffect(() => {
    setProfile(loadProfile())
    const unsubNutrition = subscribeNutritionEntries(setNutritionEntries)
    const unsubEvents = subscribeCalendarEvents(currentMonthKey, setEvents)
    const unsubDiary = subscribeDiaryEntries(currentMonthKey, setDiaryEntries)
    setLoading(false)
    return () => { unsubNutrition(); unsubEvents(); unsubDiary() }
  }, [currentMonthKey])

  async function fetchBriefing() {
    if (!hasAnyAIKey()) return
    setBriefingLoading(true)
    try {
      const kcalHoy  = Math.round(todayNutrition.calories)
      const protHoy  = Math.round(todayNutrition.protein)
      const tareas   = pendingTasks.length

      const prompt = `Eres el asistente personal de Daniel (35 años, recomposición corporal, entrena pesas y juega pádel).
Datos reales de hoy: ${kcalHoy} kcal consumidas, ${protHoy}g proteína, ${tareas} tareas pendientes.
Responde SOLO con este JSON sin texto adicional ni markdown:
{"saludo":"frase motivadora máximo 8 palabras","tipo_dia":"Día de pesas|Día de pádel|Día de descanso","foco_dia":"una cosa en la que enfocarse máximo 10 palabras","macros_tip":"consejo nutrición concreto para hoy máximo 15 palabras","entreno_tip":"consejo entrenamiento concreto máximo 15 palabras","estado_animo":"observación empática basada en datos máximo 12 palabras","prioridad":"acción más importante del día máximo 10 palabras"}`

      const raw = await callAI(prompt)
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) setBriefingData(JSON.parse(match[0]) as BriefingData)
    } catch { /* silent */ }
    finally { setBriefingLoading(false) }
  }

  useEffect(() => { loadWeights() }, [loadWeights])

  useEffect(() => {
    return subscribeAssets(setAssets)
  }, [])

  if (loading || tasksLoading) {
    return (
      <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-white/10 rounded-lg mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-white/5 rounded-2xl" />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <p className="text-white/35 text-sm capitalize">{today}</p>
        <h1 className="text-3xl font-bold text-white/90 mt-1">{greeting}, Daniel.</h1>
      </motion.div>

      <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Briefing IA */}
        {(() => {
          const data = briefingData ?? buildStaticBriefing(profile, todayTarget)
          const theme = getDayTheme(data.tipo_dia)
          return (
            <Card className={`lg:col-span-3 bg-linear-to-br ${theme.bg} to-[#1E1E28] ${theme.border}`}>
              {/* Top row: badge + saludo + refresh */}
              <div className="flex items-start gap-3">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0 ${theme.badge}`}>
                  <Sparkles size={10} />
                  {data.tipo_dia}
                </span>
                <p className="text-sm italic text-white/50 flex-1 leading-snug pt-0.5">{data.saludo}</p>
                <button
                  onClick={fetchBriefing}
                  disabled={briefingLoading || !hasAnyAIKey()}
                  className="shrink-0 w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition disabled:opacity-30"
                  title="Regenerar briefing IA"
                >
                  {briefingLoading
                    ? <Loader2 size={12} className="animate-spin text-white/50" />
                    : <RefreshCw size={12} className="text-white/50" />}
                </button>
              </div>

              {briefingLoading ? (
                <BriefingSkeleton />
              ) : (
                <>
                  <div className="h-px bg-white/6 my-3" />

                  {/* 2×2 info pills */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { icon: '🎯', label: 'Foco',      text: data.foco_dia },
                      { icon: '🥗', label: 'Nutrición', text: data.macros_tip },
                      { icon: '💪', label: 'Entreno',   text: data.entreno_tip },
                      { icon: '🧠', label: 'Ánimo',     text: data.estado_animo },
                    ].map(pill => (
                      <div key={pill.label} className={`rounded-xl bg-white/4 border ${theme.pill} px-3 py-2.5`}>
                        <p className="text-[10px] uppercase tracking-widest text-white/25 mb-1">
                          {pill.icon} {pill.label}
                        </p>
                        <p className="text-[13px] text-white/70 leading-snug">{pill.text}</p>
                      </div>
                    ))}
                  </div>

                  {/* Priority */}
                  <div className="rounded-xl bg-blue-500/8 border border-blue-500/15 px-3 py-2.5 flex items-center gap-2.5">
                    <span className="text-base shrink-0">⚡</span>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-blue-400/60 mb-0.5">Prioridad del día</p>
                      <p className="text-[13px] font-medium text-white/80 leading-snug">{data.prioridad}</p>
                    </div>
                  </div>
                </>
              )}
            </Card>
          )
        })()}

        {/* Macros */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Flame size={14} className="text-orange-400" />
            <Label>Macros · Hoy</Label>
            <span className="ml-auto text-[11px] text-white/25">{Math.round(todayNutrition.calories)} / {kcalTarget} kcal</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/6 overflow-hidden mb-4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((todayNutrition.calories / kcalTarget) * 100, 100)}%` }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="h-full rounded-full bg-linear-to-r from-orange-500 to-amber-400"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Proteína', value: `${Math.round(todayNutrition.protein)}g`, sub: `/${proteinTarget}g`, color: 'text-blue-400', pct: proteinPct },
              { label: 'Carbos',   value: `${Math.round(todayNutrition.carbs)}g`,   sub: `/${todayTarget?.carbs ?? 220}g`, color: 'text-amber-400', pct: null },
              { label: 'Grasa',    value: `${Math.round(todayNutrition.fat)}g`,     sub: `/${todayTarget?.fat ?? 70}g`,   color: 'text-rose-400',  pct: null },
            ].map((m) => (
              <div key={m.label} className="bg-white/4 rounded-xl p-3 text-center">
                <p className={`text-base font-semibold ${m.color}`}>{m.value}</p>
                <p className="text-[10px] text-white/20 mt-0.5">{m.sub}</p>
                <p className="text-[10px] text-white/30">{m.label}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Tareas */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare size={14} className="text-emerald-400" />
            <Label>Tareas de hoy</Label>
            <span className="ml-auto text-[11px] text-white/25">{completed} / {tasks.length}</span>
          </div>
          <div className="space-y-2">
            {todayTasks.length > 0 ? todayTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2.5">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${task.completed ? 'bg-emerald-500/20' : 'border border-white/15'}`}>
                  {task.completed && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                </div>
                <span className={`text-sm ${task.completed ? 'line-through text-white/25' : 'text-white/60'}`}>
                  {task.title}
                </span>
              </div>
            )) : (
              <p className="text-sm text-white/30">No hay tareas pendientes</p>
            )}
          </div>
        </Card>

        {/* Métricas */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-violet-400" />
            <Label>Métricas</Label>
            <button
              onClick={() => setShowWeeklyReport(true)}
              className="ml-auto text-[10px] text-violet-400/50 hover:text-violet-400 transition"
            >
              Informe semanal →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* Peso */}
            <button
              onClick={() => navigate('salud/peso')}
              className="bg-white/4 rounded-xl p-3 text-left hover:bg-white/7 transition"
            >
              <p className="text-[10px] text-white/30 mb-1">Peso</p>
              {lastWeight ? (
                <>
                  <p className="text-sm font-semibold text-white/80">{lastWeight.weight} kg</p>
                  {delta !== null ? (
                    <p className={`text-[10px] font-medium mt-0.5 ${delta < 0 ? 'text-emerald-400' : delta > 0 ? 'text-rose-400' : 'text-white/40'}`}>
                      {delta > 0 ? '+' : ''}{delta} kg
                    </p>
                  ) : (
                    <p className="text-[10px] text-white/25 mt-0.5">Sin comparativa</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-white/30">—</p>
                  <p className="text-[10px] text-white/20 mt-0.5">Sin datos</p>
                </>
              )}
            </button>

            {/* IMC */}
            <div className="bg-white/4 rounded-xl p-3">
              <p className="text-[10px] text-white/30 mb-1">IMC</p>
              {imc ? (
                <>
                  <p className="text-sm font-semibold text-white/80">{imc}</p>
                  <p className={`text-[10px] font-medium mt-0.5 ${imc < 18.5 ? 'text-blue-400' : imc < 25 ? 'text-emerald-400' : imc < 30 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {imc < 18.5 ? 'Bajo peso' : imc < 25 ? 'Normal' : imc < 30 ? 'Sobrepeso' : 'Obesidad'}
                  </p>
                </>
              ) : (
                <p className="text-sm font-semibold text-white/30">—</p>
              )}
            </div>

            {/* Proteína */}
            <div className="bg-white/4 rounded-xl p-3">
              <p className="text-[10px] text-white/30 mb-1">Proteína hoy</p>
              <p className="text-sm font-semibold text-white/80">{Math.round(todayNutrition.protein)}g</p>
              <p className={`text-[10px] font-medium mt-0.5 ${proteinPct >= 80 ? 'text-emerald-400' : proteinPct >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                {proteinPct}% del objetivo
              </p>
            </div>

            {/* Streak */}
            <div className="bg-white/4 rounded-xl p-3">
              <p className="text-[10px] text-white/30 mb-1">Streak diario</p>
              <p className="text-sm font-semibold text-white/80">{streak} días</p>
              <p className="text-[10px] font-medium mt-0.5 text-emerald-400">
                {streak > 0 ? '🔥 Racha activa' : 'Sin racha'}
              </p>
            </div>
          </div>
        </Card>

        {/* Medicación */}
        <Card>
          <MedicationWidget />
        </Card>

        {/* Patrimonio */}
        <Card className="bg-linear-to-br from-amber-950/40 to-[#1E1E28] border-amber-900/25">
          <Label>Patrimonio total</Label>
          <p className="text-2xl font-bold text-amber-400 tracking-tight mt-1">
            {fmtEUR(totalWealth)}
          </p>
          <p className="text-xs text-white/30 mt-1.5">
            {assets.length > 0
              ? `${assets.length} activo${assets.length !== 1 ? 's' : ''} registrado${assets.length !== 1 ? 's' : ''}`
              : 'Sin activos registrados'}
          </p>
        </Card>

        {/* Eventos */}
        <Card className="md:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={14} className="text-cyan-400" />
            <Label>Próximos eventos · Hoy</Label>
          </div>
          <div className="space-y-2">
            {todayEvents.length > 0 ? todayEvents.map((event) => (
              <div key={event.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/2 border border-white/4">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  event.category === 'trabajo'  ? 'bg-blue-400'   :
                  event.category === 'personal' ? 'bg-purple-400' :
                  event.category === 'salud'    ? 'bg-emerald-400':
                  'bg-gray-400'
                }`} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white/80">{event.title}</p>
                  {event.time && <p className="text-xs text-white/40">{event.time}</p>}
                </div>
              </div>
            )) : (
              <p className="text-sm text-white/30">No hay eventos programados para hoy</p>
            )}
          </div>
        </Card>

      </motion.div>

      <WeeklyWeightDialog />

      {showWeeklyReport && (
        <WeeklyReport forceOpen onClose={() => setShowWeeklyReport(false)} />
      )}
    </div>
  )
}
