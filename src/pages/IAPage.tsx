import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PageHeader } from '@/components/layout/PageContainer'
import { RefreshCw, Send, Sparkles, Brain, TrendingUp, Target, Zap, MessageSquare, ChevronRight } from 'lucide-react'
import { callAI } from '@/services/ai.service'
import { getWeatherToday } from '@/services/weather.service'
import {
  getLast30DaysData, calculatePatterns, generateInsights, calculateTodayScore,
  loadProfile,
  type AnalyticsRaw, type Patterns, type Insight, type TodayScore,
} from '@/services/analytics.service'
import { getTargetForDay } from '@/services/metabolic.service'
import type { AIMessage } from '@/types/ai'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeeklyAnalysis {
  resumen: string
  logro: string
  mejora: string
  recomendaciones: string[]
}

interface Objective {
  titulo: string
  descripcion: string
  progreso: number
  fechaEstimada: string
  categoria: 'fuerza' | 'nutricion' | 'habitos' | 'bienestar'
}

interface Prediction {
  prediccion: string
  consejo_entreno: string | null
  consejo_nutricion: string | null
  nivel_energia_esperado: 'alto' | 'medio' | 'bajo'
  razon: string
  generatedAt: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRED_CACHE_KEY = 'lifepilot_ia_pred_v2'
const OBJ_CACHE_KEY  = 'lifepilot_ia_obj_v2'

const DOW_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DOW_ES_CAP = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function extractJson<T>(raw: string): T | null {
  const stripped = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '')
  const start = stripped.indexOf('{')
  const end   = stripped.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try { return JSON.parse(stripped.slice(start, end + 1)) as T } catch { return null }
}

function extractJsonArray<T>(raw: string): T[] | null {
  const stripped = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '')
  const start = stripped.indexOf('[')
  const end   = stripped.lastIndexOf(']')
  if (start === -1 || end <= start) return null
  try { return JSON.parse(stripped.slice(start, end + 1)) as T[] } catch { return null }
}

function getCachedPrediction(): Prediction | null {
  try {
    const raw = localStorage.getItem(PRED_CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw) as { date: string; data: Prediction }
    if (cache.date !== new Date().toISOString().slice(0, 10)) return null
    return cache.data
  } catch { return null }
}

function cachePrediction(pred: Prediction) {
  try {
    localStorage.setItem(PRED_CACHE_KEY, JSON.stringify({ date: new Date().toISOString().slice(0, 10), data: pred }))
  } catch {}
}

function getCachedObjectives(): Objective[] | null {
  try {
    const raw = localStorage.getItem(OBJ_CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw) as { date: string; data: Objective[] }
    if (cache.date !== new Date().toISOString().slice(0, 10)) return null
    return cache.data
  } catch { return null }
}

function cacheObjectives(objs: Objective[]) {
  try {
    localStorage.setItem(OBJ_CACHE_KEY, JSON.stringify({ date: new Date().toISOString().slice(0, 10), data: objs }))
  } catch {}
}

// ── Mini components ───────────────────────────────────────────────────────────

function SkeletonLine({ w = '100%', h = 14 }: { w?: string; h?: number }) {
  return (
    <div className="animate-pulse bg-white/6 rounded-xl" style={{ width: w, height: h }} />
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 p-4 space-y-3">
      <SkeletonLine w="60%" />
      <SkeletonLine w="90%" />
      <SkeletonLine w="75%" />
    </div>
  )
}

function ProgressBar({ value, max = 100, color = 'bg-violet-500' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  )
}

function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-2xl">{icon}</span>
      <div>
        <h2 className="text-base font-semibold text-white/90">{title}</h2>
        {subtitle && <p className="text-xs text-white/35 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 91 ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' :
    score >= 71 ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' :
    score >= 41 ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' :
                  'bg-rose-500/20 border-rose-500/40 text-rose-300'
  const label =
    score >= 91 ? 'Día perfecto en camino 🔥' :
    score >= 71 ? 'Buen día, sigue así' :
    score >= 41 ? 'Hay margen de mejora' :
                  'Empieza a registrar el día'
  return (
    <div className="flex items-center gap-3">
      <div className={`px-4 py-1.5 rounded-full border text-2xl font-bold ${color}`}>
        {score}
      </div>
      <span className="text-sm text-white/60">{label}</span>
    </div>
  )
}

// ── Score pill row ────────────────────────────────────────────────────────────

function ScorePills({ score }: { score: TodayScore }) {
  const pills = [
    { label: 'Diario',      ok: score.diaryOk,      icon: '📖' },
    { label: 'Nutrición',   ok: score.nutritionOk,  icon: '🥗' },
    { label: 'Medicación',  ok: score.medicationOk, icon: '💊' },
    { label: 'Descanso',    ok: score.trainingOk,   icon: '🛌' },
  ]
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {pills.map(p => (
        <span
          key={p.label}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border ${
            p.ok
              ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-300'
              : 'bg-white/5 border-white/10 text-white/35'
          }`}
        >
          {p.icon} {p.label} {p.ok ? '✓' : '·'}
        </span>
      ))}
    </div>
  )
}

// ── Insight card ──────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: Insight }) {
  const borderColor =
    insight.type === 'positive'    ? 'border-emerald-500/30' :
    insight.type === 'improvement' ? 'border-amber-500/30'   :
    insight.type === 'alert'       ? 'border-rose-500/30'    :
                                     'border-blue-500/30'

  const impactColor =
    insight.impact === 'Alto impacto' ? 'bg-rose-500/15 text-rose-300' :
    insight.impact === 'Positivo'     ? 'bg-emerald-500/15 text-emerald-300' :
                                        'bg-amber-500/15 text-amber-300'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border bg-white/4 p-4 ${borderColor}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{insight.icon}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${impactColor}`}>
            {insight.impact}
          </span>
        </div>
      </div>
      <p className="text-sm text-white/75 leading-relaxed">{insight.text}</p>
    </motion.div>
  )
}

// ── Weekly metric row ─────────────────────────────────────────────────────────

function MetricRow({
  icon, label, value, max, text, color,
}: {
  icon: string; label: string; value: number; max: number; text: string; color: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="text-sm text-white/70">{label}</span>
        </div>
        <span className="text-xs text-white/40">{text}</span>
      </div>
      <ProgressBar value={value} max={max} color={color} />
    </div>
  )
}

// ── Objective card ────────────────────────────────────────────────────────────

const OBJ_ICONS: Record<string, string> = {
  fuerza:    '💪',
  nutricion: '🥗',
  habitos:   '🔁',
  bienestar: '🧘',
}

const OBJ_COLORS: Record<string, string> = {
  fuerza:    'bg-violet-500/15 text-violet-300 border-violet-500/25',
  nutricion: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  habitos:   'bg-blue-500/15 text-blue-300 border-blue-500/25',
  bienestar: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
}

function ObjectiveCard({ obj, index }: { obj: Objective; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="rounded-2xl border border-white/8 bg-white/4 p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{OBJ_ICONS[obj.categoria] ?? '🎯'}</span>
          <div>
            <p className="text-sm font-semibold text-white/90">{obj.titulo}</p>
            <p className="text-xs text-white/40 mt-0.5">{obj.descripcion}</p>
          </div>
        </div>
        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-medium ${OBJ_COLORS[obj.categoria] ?? ''}`}>
          {obj.categoria}
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-white/40">
          <span>Progreso</span>
          <span>{obj.progreso}%</span>
        </div>
        <ProgressBar value={obj.progreso} max={100} color="bg-violet-500" />
      </div>
      <p className="text-[11px] text-white/30">Estimado: {obj.fechaEstimada}</p>
    </motion.div>
  )
}

// ── Energy level display ──────────────────────────────────────────────────────

function EnergyBadge({ level }: { level: 'alto' | 'medio' | 'bajo' }) {
  const map = {
    alto: { label: 'Energía alta', emoji: '⚡', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
    medio: { label: 'Energía media', emoji: '🌤', color: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
    bajo: { label: 'Energía baja', emoji: '🌙', color: 'bg-blue-500/15 text-blue-300 border-blue-500/25' },
  }
  const { label, emoji, color } = map[level]
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${color}`}>
      {emoji} {label}
    </span>
  )
}

// ── Chat bubble ───────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: AIMessage }) {
  const isAI = msg.role === 'assistant'
  return (
    <div className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isAI
          ? 'rounded-tl-sm bg-white/6 border border-white/8 text-white/85'
          : 'rounded-tr-sm bg-violet-600/30 border border-violet-500/20 text-white/85'
      }`}>
        {msg.content}
      </div>
    </div>
  )
}

// ── Loading dots ──────────────────────────────────────────────────────────────

function Dots() {
  return (
    <div className="flex gap-1.5 items-center py-1 px-4">
      {[0, 1, 2].map(i => (
        <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.28 }} />
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function IAPage() {
  const profile = useMemo(() => loadProfile(), [])

  // Analytics state
  const [rawData, setRawData]     = useState<AnalyticsRaw | null>(null)
  const [patterns, setPatterns]   = useState<Patterns | null>(null)
  const [insights, setInsights]   = useState<Insight[]>([])
  const [todayScore, setTodayScore] = useState<TodayScore | null>(null)
  const [loading, setLoading]     = useState(true)
  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date())

  // AI section states
  const [weeklyAnalysis, setWeeklyAnalysis]   = useState<WeeklyAnalysis | null>(null)
  const [weeklyLoading, setWeeklyLoading]     = useState(false)
  const [objectives, setObjectives]           = useState<Objective[]>([])
  const [objectivesLoading, setObjectivesLoading] = useState(false)
  const [prediction, setPrediction]           = useState<Prediction | null>(null)
  const [predLoading, setPredLoading]         = useState(false)

  // Chat state
  const [messages, setMessages]   = useState<AIMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // ── Load analytics ───────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const raw  = await getLast30DaysData()
      const pats = calculatePatterns(raw, profile)
      const ins  = generateInsights(pats, raw, profile)
      const score = calculateTodayScore(raw, profile)
      setRawData(raw)
      setPatterns(pats)
      setInsights(ins)
      setTodayScore(score)
      setRefreshedAt(new Date())
    } catch (e) {
      console.error('[IA] Error cargando analytics:', e)
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => { loadData() }, [loadData])

  // Auto-load prediction (cached) and objectives when patterns are ready
  useEffect(() => {
    if (!patterns) return
    const cached = getCachedPrediction()
    if (cached) { setPrediction(cached); return }
    generatePrediction(patterns)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patterns])

  useEffect(() => {
    if (!patterns) return
    const cached = getCachedObjectives()
    if (cached) { setObjectives(cached); return }
    generateObjectives(patterns)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patterns])

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatLoading])

  // ── AI: Weekly analysis ──────────────────────────────────────────────────

  const generateWeeklyAnalysis = async () => {
    if (!patterns || !rawData || weeklyLoading) return
    setWeeklyLoading(true)
    try {
      const weekDiary  = rawData.diary.filter(d => d.date >= getWeekStart())
      const weekNut    = rawData.nutrition.filter(d => d.date >= getWeekStart())
      const target     = getTargetForDay(profile)
      const avgProt    = weekNut.length > 0
        ? Math.round(weekNut.reduce((s, d) => s + d.protein, 0) / weekNut.length) : 0
      const avgKcal    = weekNut.length > 0
        ? Math.round(weekNut.reduce((s, d) => s + d.kcal, 0)    / weekNut.length) : 0

      const prompt = `Eres el coach de bienestar de Daniel. Analiza su semana con datos reales.

DATOS SEMANA:
- Entradas diario: ${weekDiary.length} días, mood medio: ${patterns.weeklyMood}/5
- Nutrición registrada: ${weekNut.length} días
- Proteína media: ${avgProt}g (objetivo: ${target.protein}g)
- Kcal media: ${avgKcal} (objetivo: ${target.kcal})
- Macros cumplidos este mes: ${patterns.macrosComplianceDays} días
- Medicación: ${patterns.weeklyMedCompliance >= 0 ? patterns.weeklyMedCompliance + '%' : 'sin datos'}
- Racha diario: ${patterns.currentStreak} días
- Tareas (30d): ${rawData.tasksCompleted}/${rawData.tasksCreated} completadas

Responde SOLO con JSON, sin texto antes ni después:
{"resumen":"frase de máximo 2 líneas sobre la semana","logro":"mejor cosa de esta semana en 1 frase","mejora":"área más importante a mejorar en 1 frase","recomendaciones":["acción concreta 1","acción concreta 2","acción concreta 3"]}`

      const raw  = await callAI(prompt, undefined, true, 2000)
      const json = extractJson<WeeklyAnalysis>(raw)
      if (json) setWeeklyAnalysis(json)
    } catch (e) {
      console.error('[IA] Weekly analysis error:', e)
    } finally {
      setWeeklyLoading(false)
    }
  }

  // ── AI: Objectives ───────────────────────────────────────────────────────

  const generateObjectives = async (pats: Patterns) => {
    setObjectivesLoading(true)
    try {
      const prompt = `Eres el coach de Daniel (35 años, España, objetivo: recomposición corporal).
Basándote en estos patrones reales de 30 días:
- Proteína días entreno: ${pats.proteinAvgTrainingDays}g | descanso: ${pats.proteinAvgRestDays}g
- Macros cumplidos: ${pats.macrosComplianceDays} días
- Racha diario: ${pats.currentStreak} días
- Medicación: ${pats.medicationCompliance >= 0 ? pats.medicationCompliance + '%' : 'sin datos'}
- Tareas completadas: ${pats.tasksCompletionRate >= 0 ? pats.tasksCompletionRate + '%' : 'sin datos'}

Propón 3 objetivos específicos y alcanzables con fechas estimadas realistas.
Responde SOLO con JSON array:
[{"titulo":"titulo corto","descripcion":"descripcion de 1 frase","progreso":0-100,"fechaEstimada":"en X semanas/meses","categoria":"fuerza|nutricion|habitos|bienestar"},...]`

      const raw  = await callAI(prompt, undefined, true, 2000)
      const json = extractJsonArray<Objective>(raw)
      if (json?.length) {
        const valid = json.slice(0, 4)
        setObjectives(valid)
        cacheObjectives(valid)
      }
    } catch (e) {
      console.error('[IA] Objectives error:', e)
    } finally {
      setObjectivesLoading(false)
    }
  }

  // ── AI: Daily prediction ─────────────────────────────────────────────────

  const generatePrediction = async (pats: Patterns) => {
    setPredLoading(true)
    try {
      const dow       = new Date().getDay()
      const dayName   = DOW_ES_CAP[dow]
      const yesterday = rawData?.diary.find(d => {
        const yd = new Date(); yd.setDate(yd.getDate() - 1)
        return d.date === yd.toISOString().slice(0, 10)
      })

      const sameDay = rawData?.diary.filter(d => {
        const dd = new Date(d.date + 'T12:00:00')
        return dd.getDay() === dow
      }) ?? []
      const sameDayAvgMood = sameDay.length > 0
        ? Math.round((sameDay.reduce((s, d) => s + d.mood, 0) / sameDay.length) * 10) / 10 : null

      const weather = await getWeatherToday().catch(() => null)
      const isTraining = profile.trainingDays.includes(dow)
      const isPadel    = profile.padelDays.includes(dow)

      const prompt = `Eres el coach de bienestar de Daniel. Genera una predicción útil para hoy.

Contexto:
- Hoy: ${dayName}
- Día de: ${isTraining && isPadel ? 'pesas + pádel' : isTraining ? 'pesas' : isPadel ? 'pádel' : 'descanso'}
- Mood ayer: ${yesterday ? yesterday.mood + '/5' : 'sin dato'}
- Mood medio este ${DOW_ES[dow]}: ${sameDayAvgMood ? sameDayAvgMood + '/5' : 'sin histórico'}
- Tiempo: ${weather ? weather.description + ', ' + weather.tempMax + '°C' : 'sin dato'}
- Racha diario: ${pats.currentStreak} días

Responde SOLO con JSON:
{"prediccion":"frase específica de máximo 2 líneas sobre cómo puede ir el día","consejo_entreno":${isTraining || isPadel ? '"consejo específico de entrenamiento para hoy"' : 'null'},"consejo_nutricion":"consejo específico de nutrición para hoy o null","nivel_energia_esperado":"alto|medio|bajo","razon":"por qué predices ese nivel en 1 frase"}`

      const raw  = await callAI(prompt, undefined, true, 2000)
      const json = extractJson<Prediction>(raw)
      if (json) {
        const pred = { ...json, generatedAt: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) }
        setPrediction(pred)
        cachePrediction(pred)
      }
    } catch (e) {
      console.error('[IA] Prediction error:', e)
    } finally {
      setPredLoading(false)
    }
  }

  // ── Chat ─────────────────────────────────────────────────────────────────

  const buildChatContext = () => {
    if (!patterns) return ''
    return `Eres el coach de bienestar personal de Daniel (35 años, España, objetivo: recomposición).
Datos reales de sus últimos 30 días:
- Mood medio: ${patterns.avgMood}/5. Mejor día: ${patterns.bestMoodDay}. Peor: ${patterns.worstMoodDay}.
- Proteína: ${patterns.proteinAvgTrainingDays}g días entreno vs ${patterns.proteinAvgRestDays}g descanso.
- Macros cumplidos: ${patterns.macrosComplianceDays} días. Racha diario: ${patterns.currentStreak} días.
- Medicación: ${patterns.medicationCompliance >= 0 ? patterns.medicationCompliance + '%' : 'sin datos'}.
- Tareas: ${patterns.tasksCompletionRate >= 0 ? patterns.tasksCompletionRate + '%' : 'sin datos'} completadas.
Responde en español, de forma concisa y práctica. Sin markdown, sin asteriscos.

`
  }

  const sendChat = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || chatLoading) return
    setChatInput('')
    const userMsg: AIMessage = { role: 'user', content: trimmed, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setChatLoading(true)
    try {
      const history = messages.map(m => `${m.role === 'assistant' ? 'Coach' : 'Daniel'}: ${m.content}`).join('\n')
      const prompt  = `${buildChatContext()}${history ? history + '\n' : ''}Daniel: ${trimmed}\nCoach:`
      const resp    = await callAI(prompt, undefined, true, 2000)
      setMessages(prev => [...prev, { role: 'assistant', content: resp.trim(), timestamp: new Date().toISOString() }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error al conectar con la IA. Inténtalo de nuevo.', timestamp: new Date().toISOString() }])
    } finally {
      setChatLoading(false)
    }
  }

  // ── Chat chips ───────────────────────────────────────────────────────────

  const chatChips = useMemo(() => {
    const dow = new Date().getDay()
    const chips: string[] = []
    const isPadel    = profile.padelDays.includes(dow)
    const isTraining = profile.trainingDays.includes(dow)

    if (isPadel)    chips.push('¿Cómo optimizo la recuperación post-pádel?')
    if (isTraining) chips.push('¿Subo peso hoy en algún ejercicio?')
    if (patterns?.proteinAvgRestDays && patterns.proteinAvgTrainingDays > 0 &&
        patterns.proteinAvgRestDays < patterns.proteinAvgTrainingDays * 0.8) {
      chips.push('¿Cómo mejoro mi ingesta de proteína los días de descanso?')
    }
    if (patterns?.avgMood && patterns.avgMood < 3) chips.push('¿Qué puedo hacer para mejorar el ánimo?')
    chips.push('Dame un plan para esta semana')
    if (chips.length < 3) chips.push('¿Cómo va mi progreso de recomposición?')
    return chips.slice(0, 4)
  }, [profile, patterns])

  // ── Helpers ──────────────────────────────────────────────────────────────

  function getWeekStart(): string {
    const d = new Date()
    const day = d.getDay()
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
    return d.toISOString().slice(0, 10)
  }

  const minutesAgo = Math.round((Date.now() - refreshedAt.getTime()) / 60000)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-2xl mx-auto space-y-5 pb-28">

      <PageHeader
        icon="✨"
        title="Inteligencia Personal"
        breadcrumb="IA · Análisis personal"
        actions={
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {minutesAgo === 0 ? 'ahora' : `hace ${minutesAgo}m`}
          </button>
        }
      />

      {/* ── SECTION 1: Score ──────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-white/10 bg-[#13111f] p-5">
        {loading ? (
          <div className="space-y-3">
            <SkeletonLine w="50%" h={32} />
            <SkeletonLine w="80%" h={16} />
          </div>
        ) : todayScore ? (
          <>
            <ScoreBadge score={todayScore.total} />
            <ScorePills score={todayScore} />
          </>
        ) : (
          <p className="text-sm text-white/30">Sin datos de hoy todavía. Empieza a registrar.</p>
        )}
      </motion.div>

      {/* ── SECTION 2: Insights / Patrones ────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="rounded-3xl border border-white/10 bg-[#13111f] p-5">
        <SectionHeader
          icon="🧠"
          title="Patrones detectados"
          subtitle="Basado en tus últimos 30 días de datos reales"
        />

        {loading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : patterns && patterns.totalDaysWithData < 7 ? (
          <div className="rounded-2xl bg-white/4 border border-white/8 p-5 text-center space-y-3">
            <p className="text-sm text-white/50">Necesito al menos 7 días de datos para detectar patrones</p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-white/30">
                <span>Días registrados</span>
                <span>{patterns.totalDaysWithData}/7</span>
              </div>
              <ProgressBar value={patterns.totalDaysWithData} max={7} color="bg-violet-500" />
            </div>
          </div>
        ) : insights.length > 0 ? (
          <div className="space-y-3">
            {insights.map(ins => <InsightCard key={ins.id} insight={ins} />)}
          </div>
        ) : (
          <p className="text-sm text-white/30 py-2">
            Sigue registrando datos — los patrones aparecerán en cuanto haya suficiente historial.
          </p>
        )}
      </motion.div>

      {/* ── SECTION 3: Informe semanal ─────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-3xl border border-white/10 bg-[#13111f] p-5">
        <SectionHeader icon="📊" title="Esta semana" />

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <SkeletonLine key={i} h={24} />)}
          </div>
        ) : patterns ? (
          <div className="space-y-4">
            {/* Nutrición */}
            {patterns.weeklyNutritionDays > 0 && (
              <MetricRow
                icon="🥗" label="Nutrición"
                value={patterns.weeklyNutritionDays} max={7}
                text={`${patterns.weeklyNutritionDays}/7 días · Prot. media ${rawData?.nutrition
                  .filter(d => d.date >= getWeekStart())
                  .reduce((s, d, _, a) => s + d.protein / a.length, 0)
                  .toFixed(0) ?? '—'}g`}
                color={patterns.weeklyNutritionDays >= 5 ? 'bg-emerald-500' : patterns.weeklyNutritionDays >= 3 ? 'bg-amber-500' : 'bg-rose-500'}
              />
            )}

            {/* Bienestar */}
            {patterns.weeklyDiaryDays > 0 && (
              <MetricRow
                icon="😊" label="Bienestar"
                value={patterns.weeklyMood} max={5}
                text={`Mood ${patterns.weeklyMood}/5 · Mejor: ${patterns.bestMoodDay}`}
                color={patterns.weeklyMood >= 4 ? 'bg-emerald-500' : patterns.weeklyMood >= 3 ? 'bg-amber-500' : 'bg-rose-500'}
              />
            )}

            {/* Medicación */}
            {patterns.weeklyMedCompliance >= 0 && (
              <MetricRow
                icon="💊" label="Medicación"
                value={patterns.weeklyMedCompliance} max={100}
                text={`${patterns.weeklyMedCompliance}% de tomas`}
                color={patterns.weeklyMedCompliance >= 90 ? 'bg-emerald-500' : patterns.weeklyMedCompliance >= 70 ? 'bg-amber-500' : 'bg-rose-500'}
              />
            )}

            {/* Tareas */}
            {patterns.weeklyTasksCreated > 0 && (
              <MetricRow
                icon="✅" label="Tareas"
                value={patterns.weeklyTasksCompleted} max={Math.max(patterns.weeklyTasksCreated, 1)}
                text={`${patterns.weeklyTasksCompleted} completadas · ${patterns.weeklyTasksCreated - patterns.weeklyTasksCompleted} pendientes`}
                color={patterns.tasksCompletionRate >= 70 ? 'bg-emerald-500' : 'bg-amber-500'}
              />
            )}

            {patterns.weeklyNutritionDays === 0 && patterns.weeklyDiaryDays === 0 && (
              <p className="text-sm text-white/30 py-2">Sin datos esta semana todavía.</p>
            )}

            {/* AI Analysis button */}
            <div className="pt-2 border-t border-white/6">
              {weeklyAnalysis ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                  <div className="rounded-2xl bg-violet-500/8 border border-violet-500/20 p-4 space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-violet-400/55">Resumen</p>
                    <p className="text-sm text-white/80 leading-relaxed">{weeklyAnalysis.resumen}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-emerald-500/8 border border-emerald-500/20 p-3">
                      <p className="text-[10px] uppercase tracking-widest text-emerald-400/55 mb-1">Logro</p>
                      <p className="text-xs text-white/70 leading-relaxed">{weeklyAnalysis.logro}</p>
                    </div>
                    <div className="rounded-2xl bg-amber-500/8 border border-amber-500/20 p-3">
                      <p className="text-[10px] uppercase tracking-widest text-amber-400/55 mb-1">A mejorar</p>
                      <p className="text-xs text-white/70 leading-relaxed">{weeklyAnalysis.mejora}</p>
                    </div>
                  </div>
                  {weeklyAnalysis.recomendaciones.length > 0 && (
                    <div className="space-y-1.5">
                      {weeklyAnalysis.recomendaciones.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-white/60">
                          <ChevronRight size={12} className="text-violet-400 shrink-0 mt-0.5" />
                          {r}
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setWeeklyAnalysis(null)}
                    className="text-xs text-white/25 hover:text-white/45 transition">
                    Regenerar análisis
                  </button>
                </motion.div>
              ) : (
                <button
                  onClick={generateWeeklyAnalysis}
                  disabled={weeklyLoading || !patterns}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:bg-white/8 py-3 text-sm font-semibold text-white transition disabled:text-white/30"
                >
                  {weeklyLoading ? (
                    <><RefreshCw size={14} className="animate-spin" /> Analizando...</>
                  ) : (
                    <><Brain size={14} /> Analizar con IA</>
                  )}
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-white/30">Sin datos disponibles.</p>
        )}
      </motion.div>

      {/* ── SECTION 4: Objetivos ───────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="rounded-3xl border border-white/10 bg-[#13111f] p-5">
        <div className="flex items-center justify-between mb-4">
          <SectionHeader icon="🎯" title="Tus objetivos" />
          {objectives.length > 0 && !objectivesLoading && (
            <button
              onClick={() => { setObjectives([]); localStorage.removeItem(OBJ_CACHE_KEY); if (patterns) generateObjectives(patterns) }}
              className="text-xs text-white/30 hover:text-white/55 transition flex items-center gap-1"
            >
              <RefreshCw size={11} /> Actualizar
            </button>
          )}
        </div>

        {objectivesLoading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : objectives.length > 0 ? (
          <div className="space-y-3">
            {objectives.map((obj, i) => <ObjectiveCard key={i} obj={obj} index={i} />)}
          </div>
        ) : (
          <div className="text-center py-6 space-y-3">
            <Target size={32} className="mx-auto text-white/20" />
            <p className="text-sm text-white/35">
              {patterns && patterns.totalDaysWithData >= 3
                ? 'Generando objetivos personalizados...'
                : 'Registra más días para generar objetivos inteligentes'}
            </p>
          </div>
        )}
      </motion.div>

      {/* ── SECTION 5: Predicción del día ─────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="rounded-3xl border border-white/10 bg-[#13111f] p-5">
        <SectionHeader icon="🔮" title="Predicción para hoy" subtitle={DOW_ES_CAP[new Date().getDay()]} />

        {predLoading ? (
          <div className="space-y-3">
            <SkeletonLine w="40%" h={24} />
            <SkeletonLine w="100%" h={16} />
            <SkeletonLine w="80%" h={16} />
          </div>
        ) : prediction ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <EnergyBadge level={prediction.nivel_energia_esperado} />
            <p className="text-sm text-white/80 leading-relaxed">{prediction.prediccion}</p>
            <p className="text-xs text-white/40 italic">{prediction.razon}</p>
            <div className="flex flex-wrap gap-2">
              {prediction.consejo_entreno && (
                <span className="px-3 py-1.5 rounded-full text-xs bg-blue-500/12 border border-blue-500/25 text-blue-300">
                  💪 {prediction.consejo_entreno}
                </span>
              )}
              {prediction.consejo_nutricion && (
                <span className="px-3 py-1.5 rounded-full text-xs bg-amber-500/12 border border-amber-500/25 text-amber-300">
                  🥗 {prediction.consejo_nutricion}
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/25">Generado a las {prediction.generatedAt}</p>
            <button
              onClick={() => { setPrediction(null); localStorage.removeItem(PRED_CACHE_KEY); if (patterns) generatePrediction(patterns) }}
              className="text-xs text-white/25 hover:text-white/45 transition"
            >
              Regenerar predicción
            </button>
          </motion.div>
        ) : !patterns ? (
          <p className="text-sm text-white/30">Cargando datos para generar la predicción...</p>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-white/35">Sin predicción disponible.</p>
            <button onClick={() => patterns && generatePrediction(patterns)}
              className="mt-2 text-xs text-violet-400 hover:text-violet-300 transition">
              Generar ahora
            </button>
          </div>
        )}
      </motion.div>

      {/* ── SECTION 6: Chat contextual ─────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="rounded-3xl border border-white/10 bg-[#13111f] p-5">
        <SectionHeader
          icon="💬"
          title="Coach contextual"
          subtitle="Pregunta con el contexto completo de tus datos"
        />

        {/* Chat area */}
        <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
          {messages.length === 0 && (
            <p className="text-sm text-white/25 text-center py-4">
              Haz una pregunta. El coach conoce tus datos de los últimos 30 días.
            </p>
          )}
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <ChatBubble msg={msg} />
              </motion.div>
            ))}
            {chatLoading && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex justify-start">
                <div className="rounded-2xl rounded-tl-sm bg-white/6 border border-white/8">
                  <Dots />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={chatBottomRef} />
        </div>

        {/* Quick chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {chatChips.map(chip => (
            <button
              key={chip}
              onClick={() => sendChat(chip)}
              disabled={chatLoading}
              className="px-3 py-1.5 rounded-full text-xs border border-white/10 bg-white/5 text-white/50 hover:bg-violet-500/20 hover:border-violet-500/40 hover:text-white/80 transition disabled:opacity-40"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 focus-within:border-violet-500/40 transition">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(chatInput) } }}
            placeholder="Pregunta al coach..."
            className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none min-w-0"
          />
          <button
            onClick={() => sendChat(chatInput)}
            disabled={chatLoading || !chatInput.trim()}
            className="shrink-0 w-8 h-8 rounded-xl bg-violet-600 hover:bg-violet-500 flex items-center justify-center transition disabled:opacity-40"
          >
            <Send size={13} className="text-white" />
          </button>
        </div>
      </motion.div>

    </div>
  )
}
