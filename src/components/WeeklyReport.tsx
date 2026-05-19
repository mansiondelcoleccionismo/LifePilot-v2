import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, BarChart3, RefreshCw, Dumbbell, Apple, Heart, Lightbulb, CheckSquare } from 'lucide-react'
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { callAI, hasAnyAIKey } from '@/services/ai.service'
import { loadProfile, getDayLabel } from '@/services/metabolic.service'

const LAST_REPORT_KEY = 'lifepilot_last_weekly_report'
const DAY_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function getWeekKey() {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${weekNo}`
}

function getWeekRange() {
  const now = new Date()
  const dow = now.getDay()
  const daysFromMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysFromMonday)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(now)
  sunday.setHours(23, 59, 59, 999)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { startStr: fmt(monday), endStr: fmt(sunday), startTs: monday, endTs: sunday }
}

// ── Firebase data fetch ───────────────────────────────────────────────────────

interface WeeklyStats {
  trainDays: number
  trainDayNames: string[]
  kcalAvg: number
  proteinAvg: number
  proteinTarget: number
  macroComplianceDays: number
  moodAvg: number
  moodBestDay: string
  moodWorstDay: string
  tasksCompleted: number
  weight: number
}

async function fetchWeeklyStats(proteinTarget: number, weight: number): Promise<WeeklyStats> {
  const { startStr, endStr, startTs, endTs } = getWeekRange()
  const fsStart = Timestamp.fromDate(startTs)
  const fsEnd = Timestamp.fromDate(endTs)

  const [diarySnap, exerciseSnap, nutritionSnap, tasksSnap] = await Promise.allSettled([
    getDocs(query(collection(db, 'diary_entries'), where('date', '>=', startStr), where('date', '<=', endStr))),
    getDocs(query(collection(db, 'exercise_sets'), where('date', '>=', startStr), where('date', '<=', endStr))),
    getDocs(query(collection(db, 'nutrition_entries'), where('createdAt', '>=', fsStart), where('createdAt', '<=', fsEnd), orderBy('createdAt', 'asc'))),
    getDocs(query(collection(db, 'tasks'), where('createdAt', '>=', fsStart), where('createdAt', '<=', fsEnd))),
  ])

  // ── Entrenamiento ──────────────────────────────────────────────────────────
  const trainDates = new Set<string>()
  if (exerciseSnap.status === 'fulfilled') {
    exerciseSnap.value.docs.forEach(d => {
      const date = d.data().date as string
      if (date) trainDates.add(date)
    })
  }
  const trainDayNames = [...trainDates].map(d => DAY_FULL[new Date(d + 'T12:00:00').getDay()])

  // ── Nutrición ─────────────────────────────────────────────────────────────
  const nutritionByDay: Record<string, { kcal: number; protein: number }> = {}
  if (nutritionSnap.status === 'fulfilled') {
    nutritionSnap.value.docs.forEach(d => {
      const e = d.data() as { kcal?: number; protein?: number; createdAt?: Timestamp }
      const date = e.createdAt?.toDate?.()?.toISOString().slice(0, 10)
      if (!date) return
      if (!nutritionByDay[date]) nutritionByDay[date] = { kcal: 0, protein: 0 }
      nutritionByDay[date].kcal += e.kcal ?? 0
      nutritionByDay[date].protein += e.protein ?? 0
    })
  }
  const nutDays = Object.values(nutritionByDay)
  const kcalAvg = nutDays.length > 0 ? Math.round(nutDays.reduce((s, d) => s + d.kcal, 0) / nutDays.length) : 0
  const proteinAvg = nutDays.length > 0 ? Math.round(nutDays.reduce((s, d) => s + d.protein, 0) / nutDays.length) : 0
  const macroComplianceDays = nutDays.filter(d => d.protein >= proteinTarget * 0.8).length

  // ── Mood ──────────────────────────────────────────────────────────────────
  const diaryDocs: { date: string; mood: number }[] = []
  if (diarySnap.status === 'fulfilled') {
    diarySnap.value.docs.forEach(d => {
      const e = d.data() as { date: string; mood: number }
      if (e.mood) diaryDocs.push(e)
    })
  }
  const moodAvg = diaryDocs.length > 0
    ? Math.round((diaryDocs.reduce((s, d) => s + d.mood, 0) / diaryDocs.length) * 10) / 10
    : 0
  const moodBest = diaryDocs.length > 0
    ? diaryDocs.reduce((b, d) => d.mood > b.mood ? d : b)
    : null
  const moodWorst = diaryDocs.length > 0
    ? diaryDocs.reduce((w, d) => d.mood < w.mood ? d : w)
    : null
  const moodBestDay = moodBest ? DAY_FULL[new Date(moodBest.date + 'T12:00:00').getDay()] : 'Sin datos'
  const moodWorstDay = moodWorst ? DAY_FULL[new Date(moodWorst.date + 'T12:00:00').getDay()] : 'Sin datos'

  // ── Tareas ────────────────────────────────────────────────────────────────
  let tasksCompleted = 0
  if (tasksSnap.status === 'fulfilled') {
    tasksCompleted = tasksSnap.value.docs.filter(d => d.data().completed === true).length
  }

  return {
    trainDays: trainDates.size,
    trainDayNames,
    kcalAvg,
    proteinAvg,
    proteinTarget,
    macroComplianceDays,
    moodAvg,
    moodBestDay,
    moodWorstDay,
    tasksCompleted,
    weight,
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_{1,2}(.+?)_{1,2}/g, '$1')
    .replace(/^---+$/gm, '')
    .replace(/^- /gm, '• ')
    .replace(/^\d+\.\s/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface ReportData {
  saludo: string
  resumen: string
  entrenamiento: { completados: number; total: number; destacado: string }
  nutricion: { cumplimiento: number; proteina_media: number; mejor_dia: string; peor_dia: string }
  bienestar: { mood_promedio: number; mejor_dia: string; observacion: string }
  recomendaciones: string[]
}

function extractJson(raw: string): ReportData | null {
  // Try stripping markdown code fences first
  const stripped = raw.replace(/```(?:json)?/g, '').replace(/```/g, '')
  const match = stripped.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as ReportData
  } catch {
    return null
  }
}

// ── UI components ─────────────────────────────────────────────────────────────

function MetricCard({ icon, title, accent, children }: {
  icon: React.ReactNode; title: string; accent: string; children: React.ReactNode
}) {
  return (
    <div className={`rounded-2xl border p-4 ${accent}`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-widest text-white/50">{title}</span>
      </div>
      {children}
    </div>
  )
}

function ProgressBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100))
  return (
    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  )
}

function NoData() {
  return <span className="text-xs text-white/25 italic">Sin registros esta semana</span>
}

// ── Report view ───────────────────────────────────────────────────────────────

function ReportView({ data, stats }: { data: ReportData; stats: WeeklyStats }) {
  const trainPct = data.entrenamiento.total > 0
    ? Math.round((data.entrenamiento.completados / data.entrenamiento.total) * 100)
    : 0
  const hasTrainData = stats.trainDays > 0
  const hasNutriData = stats.kcalAvg > 0 || stats.proteinAvg > 0
  const hasMoodData = stats.moodAvg > 0

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

      {/* Saludo + resumen */}
      <div className="rounded-2xl bg-violet-500/10 border border-violet-500/20 px-4 py-3.5">
        <p className="text-sm font-semibold text-violet-200 mb-1">{stripMarkdown(data.saludo)}</p>
        <p className="text-sm text-white/65 leading-relaxed">{stripMarkdown(data.resumen)}</p>
      </div>

      {/* Entrenamiento */}
      <MetricCard icon={<Dumbbell size={14} className="text-blue-400" />} title="Entrenamiento" accent="border-blue-500/20 bg-blue-500/6">
        {hasTrainData ? (
          <>
            <div className="flex items-end justify-between mb-2">
              <div>
                <span className="text-2xl font-bold text-white/90">{data.entrenamiento.completados}</span>
                <span className="text-sm text-white/35">/{data.entrenamiento.total} sesiones</span>
              </div>
              <span className={`text-sm font-semibold ${trainPct >= 80 ? 'text-emerald-400' : trainPct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                {trainPct}%
              </span>
            </div>
            <ProgressBar value={data.entrenamiento.completados} max={data.entrenamiento.total || 1}
              color={trainPct >= 80 ? 'bg-emerald-500' : trainPct >= 50 ? 'bg-amber-500' : 'bg-red-500'} />
            {stats.trainDayNames.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {stats.trainDayNames.map(d => (
                  <span key={d} className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/15 text-blue-300 border border-blue-500/20">{d}</span>
                ))}
              </div>
            )}
            {data.entrenamiento.destacado && (
              <p className="text-xs text-white/45 mt-2">🏆 {stripMarkdown(data.entrenamiento.destacado)}</p>
            )}
          </>
        ) : <NoData />}
      </MetricCard>

      {/* Nutrición */}
      <MetricCard icon={<Apple size={14} className="text-green-400" />} title="Nutrición" accent="border-green-500/20 bg-green-500/6">
        {hasNutriData ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <p className="text-[11px] text-white/35 mb-0.5">Kcal media</p>
                <p className="text-lg font-bold text-white/90">{stats.kcalAvg} <span className="text-xs text-white/35">kcal</span></p>
              </div>
              <div>
                <p className="text-[11px] text-white/35 mb-0.5">Proteína media</p>
                <p className="text-lg font-bold text-white/90">{stats.proteinAvg}<span className="text-xs text-white/35">g</span></p>
              </div>
            </div>
            <div className="mb-1">
              <div className="flex justify-between text-[11px] text-white/35 mb-1">
                <span>Proteína vs objetivo ({stats.proteinTarget}g)</span>
                <span>{data.nutricion.cumplimiento}%</span>
              </div>
              <ProgressBar value={data.nutricion.cumplimiento} color={data.nutricion.cumplimiento >= 80 ? 'bg-green-500' : data.nutricion.cumplimiento >= 60 ? 'bg-amber-500' : 'bg-red-500'} />
            </div>
            <p className="text-[11px] text-white/35 mt-1.5">
              {stats.macroComplianceDays} días cumpliendo objetivo
              {data.nutricion.mejor_dia && data.nutricion.mejor_dia !== 'Sin datos' && ` · ✅ ${data.nutricion.mejor_dia}`}
            </p>
          </>
        ) : <NoData />}
      </MetricCard>

      {/* Bienestar */}
      <MetricCard icon={<Heart size={14} className="text-rose-400" />} title="Bienestar" accent="border-rose-500/20 bg-rose-500/6">
        {hasMoodData ? (
          <>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <div key={n}
                    className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${
                      n <= Math.round(stats.moodAvg) ? 'bg-rose-500/30 text-rose-300' : 'bg-white/5 text-white/20'
                    }`}>{n}</div>
                ))}
              </div>
              <span className="text-sm text-white/50">media: <span className="text-white/80 font-semibold">{stats.moodAvg.toFixed(1)}</span>/5</span>
            </div>
            {data.bienestar.observacion && (
              <p className="text-xs text-white/45 italic">{stripMarkdown(data.bienestar.observacion)}</p>
            )}
            {stats.moodBestDay !== 'Sin datos' && (
              <p className="text-[11px] text-white/35 mt-1">✨ Mejor día: {stats.moodBestDay}</p>
            )}
          </>
        ) : <NoData />}
      </MetricCard>

      {/* Tareas */}
      {stats.tasksCompleted > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
          <CheckSquare size={14} className="text-white/40 shrink-0" />
          <p className="text-sm text-white/60">
            <span className="font-semibold text-white/80">{stats.tasksCompleted}</span> tareas completadas esta semana
          </p>
        </div>
      )}

      {/* Recomendaciones */}
      {data.recomendaciones?.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/6 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={14} className="text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Para la semana que viene</span>
          </div>
          <ul className="space-y-2.5">
            {data.recomendaciones.slice(0, 3).map((r, i) => (
              <li key={i} className="flex gap-2.5 items-start">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span className="text-sm text-white/65 leading-snug">{stripMarkdown(r)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  )
}

function FallbackText({ text }: { text: string }) {
  return <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{stripMarkdown(text)}</p>
}

// ── Main component ────────────────────────────────────────────────────────────

interface WeeklyReportProps {
  forceOpen?: boolean
  onClose?: () => void
}

export function WeeklyReport({ forceOpen = false, onClose }: WeeklyReportProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null)
  const [rawFallback, setRawFallback] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (forceOpen) { setOpen(true); return }
    const dow = new Date().getDay()
    const hour = new Date().getHours()
    const lastKey = localStorage.getItem(LAST_REPORT_KEY)
    const thisWeek = getWeekKey()
    if (dow === 0 && hour >= 18 && lastKey !== thisWeek && hasAnyAIKey()) {
      setOpen(true)
    }
  }, [forceOpen])

  useEffect(() => {
    if (open && !reportData && !rawFallback && !loading) generateReport()
  }, [open])

  async function generateReport() {
    setLoading(true)
    setError('')
    setReportData(null)
    setWeeklyStats(null)
    setRawFallback('')
    try {
      const profile = loadProfile()
      const dayLabel = getDayLabel(profile)
      const proteinTarget = Math.round(profile.weight * 2)

      // ── 1. Read real Firebase data ─────────────────────────────────────────
      const stats = await fetchWeeklyStats(proteinTarget, profile.weight)
      setWeeklyStats(stats)

      // ── 2. Build prompt with real numbers ──────────────────────────────────
      const trainStr = stats.trainDays > 0
        ? `${stats.trainDays} días (${stats.trainDayNames.join(', ')})`
        : '0 días registrados'
      const kcalStr = stats.kcalAvg > 0 ? `${stats.kcalAvg} kcal/día` : 'Sin registros'
      const proteinStr = stats.proteinAvg > 0 ? `${stats.proteinAvg}g/día (objetivo: ${proteinTarget}g)` : 'Sin registros'
      const macroStr = stats.proteinAvg > 0 ? `${stats.macroComplianceDays}/7 días` : 'Sin registros'
      const moodStr = stats.moodAvg > 0 ? `${stats.moodAvg}/5 (mejor: ${stats.moodBestDay}, peor: ${stats.moodWorstDay})` : 'Sin registros'
      const tasksStr = stats.tasksCompleted > 0 ? `${stats.tasksCompleted} tareas` : 'Sin registros'

      const prompt = `Genera el informe semanal de Daniel en formato JSON. Hoy es ${dayLabel}.

DATOS REALES de esta semana (NO inventes ni cambies estos números):
- Peso: ${profile.weight}kg · Objetivo: ${profile.goal}
- Entrenamientos: ${trainStr}
- Kcal media diaria: ${kcalStr}
- Proteína media: ${proteinStr}
- Días cumpliendo macros (>80% proteína): ${macroStr}
- Mood promedio: ${moodStr}
- Tareas completadas: ${tasksStr}

Analiza estos datos REALES y genera el informe. Si un dato es "Sin registros", menciona esa falta en el campo correspondiente.

Responde SOLO con JSON válido sin texto ni markdown:
{"saludo":"frase breve de bienvenida","resumen":"2-3 frases analizando la semana con los datos reales","entrenamiento":{"completados":${stats.trainDays},"total":${profile.trainingDays?.length ?? 4},"destacado":"logro o nota basada en datos reales"},"nutricion":{"cumplimiento":${stats.proteinAvg > 0 ? Math.round((stats.proteinAvg / proteinTarget) * 100) : 0},"proteina_media":${stats.proteinAvg},"mejor_dia":"${stats.kcalAvg > 0 ? 'Ver datos' : 'Sin datos'}","peor_dia":"${stats.kcalAvg > 0 ? 'Ver datos' : 'Sin datos'}"},"bienestar":{"mood_promedio":${stats.moodAvg || 3},"mejor_dia":"${stats.moodBestDay}","observacion":"observación basada en el mood real"},"recomendaciones":["recomendación concreta 1","recomendación concreta 2","recomendación concreta 3"]}`

      // ── 3. Call AI with skip context (we provide all data) ─────────────────
      const raw = await callAI(prompt, undefined, true, 1200, undefined, 7 * 24 * 60 * 60_000)
      localStorage.setItem(LAST_REPORT_KEY, getWeekKey())

      const parsed = extractJson(raw)
      if (parsed) {
        setReportData(parsed)
      } else {
        setRawFallback(raw)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando el informe')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setOpen(false)
    onClose?.()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="w-full sm:max-w-lg bg-[#1E1E28] rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/10 p-6 max-h-[88dvh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
                  <BarChart3 size={18} className="text-violet-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white/90">Informe Semanal</h2>
                  <p className="text-[11px] text-white/35">Datos reales · Análisis IA</p>
                </div>
              </div>
              <button onClick={handleClose}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition">
                <X size={16} className="text-white/60" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {loading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 size={24} className="animate-spin text-violet-400" />
                  <p className="text-sm text-white/40">Leyendo tu semana en Firebase...</p>
                </div>
              )}
              {error && !loading && (
                <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 text-sm text-rose-300">
                  {error}
                </div>
              )}
              {!loading && reportData && weeklyStats && (
                <ReportView data={reportData} stats={weeklyStats} />
              )}
              {!loading && rawFallback && !reportData && (
                <FallbackText text={rawFallback} />
              )}
            </div>

            {/* Footer */}
            <div className="mt-5 flex gap-3 pt-4 border-t border-white/6 shrink-0">
              <button onClick={generateReport} disabled={loading}
                className="flex items-center gap-2 rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/60 hover:border-white/14 transition disabled:opacity-40">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Regenerar
              </button>
              <button onClick={handleClose}
                className="flex-1 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500 transition">
                Cerrar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
