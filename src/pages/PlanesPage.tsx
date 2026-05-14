import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ExternalLink, Star, Check, Sparkles, ChevronRight } from 'lucide-react'
import { PLANES, type ActivityPlan, type PlanCategoria, type PlanTemporada, type PlanClima } from '@/data/planes'
import {
  logPlan,
  updatePlanLog,
  subscribePlanHistory,
  type PlanLog,
} from '@/services/plans.service'
import { callAI, hasAnyAIKey } from '@/services/ai.service'

// ─── Constants ────────────────────────────────────────────────────────────────

const KIRA_BIRTHDATE = new Date('2022-10-20')

const CATEGORY_CONFIG: Record<PlanCategoria, { label: string; emoji: string; bg: string; text: string; border: string }> = {
  aire_libre: { label: 'Aire libre', emoji: '🌳', bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/25' },
  indoor:     { label: 'Indoor',     emoji: '🏠', bg: 'bg-blue-500/15',    text: 'text-blue-300',    border: 'border-blue-500/25' },
  en_casa:    { label: 'En casa',    emoji: '🛋️', bg: 'bg-violet-500/15',  text: 'text-violet-300',  border: 'border-violet-500/25' },
  comida:     { label: 'Comida',     emoji: '🍽️', bg: 'bg-orange-500/15',  text: 'text-orange-300',  border: 'border-orange-500/25' },
  cultura:    { label: 'Cultura',    emoji: '🎭', bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-500/25' },
  excursion:  { label: 'Excursión',  emoji: '🚗', bg: 'bg-teal-500/15',    text: 'text-teal-300',    border: 'border-teal-500/25' },
  solo_daniel:{ label: 'Solo Daniel',emoji: '🧔', bg: 'bg-slate-500/15',   text: 'text-slate-300',   border: 'border-slate-500/25' },
}

const PRECIO_LABEL: Record<string, string> = {
  gratis: 'Gratis', barato: '<15€', medio: '15-40€', caro: '>40€',
}
const PRECIO_COLOR: Record<string, string> = {
  gratis: 'text-emerald-300 bg-emerald-500/10',
  barato: 'text-blue-300 bg-blue-500/10',
  medio:  'text-amber-300 bg-amber-500/10',
  caro:   'text-red-300 bg-red-500/10',
}
const DURACION_LABEL: Record<string, string> = {
  manana: 'Mañana', tarde: 'Tarde', dia_completo: 'Día completo', fin_semana: 'Fin semana',
}
const MONTH_NAMES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayForecast {
  date: Date
  tempMax: number
  tempMin: number
  precipitationProb: number
  weatherCode: number
  description: string
  emoji: string
  isRainy: boolean
}

interface AISuggestion {
  plan: ActivityPlan
  razon: string
  momento: string
}

// ─── Weather helpers ──────────────────────────────────────────────────────────

function describeWeatherCode(code: number): { description: string; emoji: string } {
  if (code === 0)                               return { description: 'Despejado',   emoji: '☀️' }
  if (code <= 3)                                return { description: 'Nublado',     emoji: '⛅' }
  if (code === 45 || code === 48)               return { description: 'Niebla',      emoji: '🌫️' }
  if ((code >= 51 && code <= 55) || (code >= 61 && code <= 65)) return { description: 'Lluvia', emoji: '🌧️' }
  if (code >= 71 && code <= 75)                 return { description: 'Nieve',       emoji: '❄️' }
  if (code >= 80 && code <= 82)                 return { description: 'Chubascos',   emoji: '🌦️' }
  if (code === 95)                              return { description: 'Tormenta',    emoji: '⛈️' }
  return { description: 'Variable', emoji: '🌤️' }
}

function isRainyCode(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code === 95
}

async function fetchWeekendForecast(): Promise<{ sat: DayForecast | null; sun: DayForecast | null }> {
  const CACHE_KEY = 'lifepilot_weekend_forecast'
  const CACHE_TTL = 60 * 60 * 1000
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const { data, ts } = JSON.parse(cached)
      if (Date.now() - ts < CACHE_TTL) {
        return {
          sat: data.sat ? { ...data.sat, date: new Date(data.sat.date) } : null,
          sun: data.sun ? { ...data.sun, date: new Date(data.sun.date) } : null,
        }
      }
    }
  } catch { /* ignore */ }

  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast' +
      '?latitude=41.7897&longitude=-1.1358' +
      '&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&timezone=Europe%2FMadrid&forecast_days=8',
    )
    if (!res.ok) return { sat: null, sun: null }
    const json = await res.json()
    const d = json.daily

    const today = new Date()
    const dow = today.getDay()
    const satOffset = dow === 0 ? 6 : dow === 6 ? 0 : 6 - dow
    const sunOffset = satOffset + 1

    const makeDay = (i: number): DayForecast | null => {
      if (i >= (d.weathercode as number[]).length) return null
      const code = d.weathercode[i] as number
      const { description, emoji } = describeWeatherCode(code)
      const date = new Date(today)
      date.setDate(today.getDate() + i)
      return {
        date,
        tempMax: Math.round(d.temperature_2m_max[i] as number),
        tempMin: Math.round(d.temperature_2m_min[i] as number),
        precipitationProb: d.precipitation_probability_max[i] as number,
        weatherCode: code,
        description,
        emoji,
        isRainy: isRainyCode(code),
      }
    }

    const result = { sat: makeDay(satOffset), sun: makeDay(sunOffset) }
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: result, ts: Date.now() }))
    return result
  } catch {
    return { sat: null, sun: null }
  }
}

// ─── Suggestion algorithm helpers ────────────────────────────────────────────

function getSeason(month: number): PlanTemporada {
  if (month >= 2 && month <= 4) return 'primavera'
  if (month >= 5 && month <= 7) return 'verano'
  if (month >= 8 && month <= 10) return 'otono'
  return 'invierno'
}

function getKiraAgeMeses(): number {
  const now = new Date()
  return (
    (now.getFullYear() - KIRA_BIRTHDATE.getFullYear()) * 12 +
    (now.getMonth() - KIRA_BIRTHDATE.getMonth())
  )
}

function getSpecialEvent(month: number, day: number): { texto: string; emoji: string } | null {
  if (month === 9 && day >= 1 && day <= 20) return { texto: '¡Semana del Pilar! Aprovecha las fiestas', emoji: '🎡' }
  if (month === 11) return { texto: 'Diciembre — mercados navideños', emoji: '🎄' }
  return null
}

function getSuggestionReason(
  plan: ActivityPlan,
  sat: DayForecast | null,
  sun: DayForecast | null,
  planStatsMap: Record<string, { count: number; lastDate: Date }>,
): string {
  const isRainy = sat?.isRainy || sun?.isRainy
  if (isRainy && plan.climaIdeal.includes('lluvia')) return '🌧️ Llueve el finde — plan perfecto para dentro'
  if (sat?.emoji === '☀️' && plan.climaIdeal.includes('sol')) return `☀️ Perfecto con el sol del sábado (${sat.tempMax}°C)`
  if (sun?.emoji === '☀️' && plan.climaIdeal.includes('sol')) return `☀️ Buen tiempo el domingo — aprovéchalo`
  if (plan.categoria === 'excursion') return '🚗 Merece la pena el viaje, siempre espectacular'
  if (plan.categoria === 'en_casa') return '🏠 Plan tranquilo y especial en casa'
  if (!planStatsMap[plan.id] || planStatsMap[plan.id].count === 0) return '✨ ¡Nunca lo habéis hecho! Momento de estrenar'
  return '⭐ Siempre funciona bien'
}

function computeSuggestions(
  sat: DayForecast | null,
  sun: DayForecast | null,
  withKira: boolean,
  recentIds: string[],
  planStatsMap: Record<string, { count: number; lastDate: Date; avgRating: number }>,
): ActivityPlan[] {
  const month = new Date().getMonth()
  const season = getSeason(month)
  const kiraAge = getKiraAgeMeses()
  const isRainy = sat?.isRainy || sun?.isRainy

  const compatible: PlanClima[] = isRainy ? ['lluvia', 'cualquiera'] : ['sol', 'nublado', 'cualquiera']

  const filtered = PLANES.filter(p => {
    if (!p.temporada.includes('todo_el_ano') && !p.temporada.includes(season)) return false
    if (recentIds.includes(p.id)) return false
    if (withKira) {
      if (!p.aptoKira) return false
      if (p.edadMinimaKira && kiraAge < p.edadMinimaKira) return false
    }
    if (!p.climaIdeal.some(c => compatible.includes(c))) return false
    return true
  })

  filtered.sort((a, b) => {
    const aNever = !planStatsMap[a.id] || planStatsMap[a.id].count === 0
    const bNever = !planStatsMap[b.id] || planStatsMap[b.id].count === 0
    if (aNever && !bNever) return -1
    if (!aNever && bNever) return 1
    return (planStatsMap[b.id]?.avgRating ?? 0) - (planStatsMap[a.id]?.avgRating ?? 0)
  })

  // Pick top 3 with category variety
  const result: ActivityPlan[] = []
  const usedCats = new Set<string>()
  for (const p of filtered) {
    if (result.length >= 3) break
    if (!usedCats.has(p.categoria)) { result.push(p); usedCats.add(p.categoria) }
  }
  if (result.length < 3) {
    for (const p of filtered) {
      if (result.length >= 3) break
      if (!result.includes(p)) result.push(p)
    }
  }
  return result
}

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  if (diff < 7) return `Hace ${diff} días`
  if (diff < 14) return 'Hace 1 semana'
  if (diff < 30) return `Hace ${Math.floor(diff / 7)} semanas`
  if (diff < 60) return 'Hace 1 mes'
  return `Hace ${Math.floor(diff / 30)} meses`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StarRow({ value, onChange, size = 'md' }: { value: number; onChange?: (v: number) => void; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'text-base' : 'text-2xl'
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(n => (
        <button
          key={n}
          onClick={() => onChange?.(n)}
          className={`${sz} ${onChange ? 'hover:scale-110 transition-transform' : 'cursor-default'}`}
        >
          {n <= value ? '⭐' : '☆'}
        </button>
      ))}
    </div>
  )
}

function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {children}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PlanesPage() {
  const [activeTab, setActiveTab] = useState<'sugeridor' | 'catalogo' | 'historial'>('sugeridor')
  const [weatherSat, setWeatherSat] = useState<DayForecast | null>(null)
  const [weatherSun, setWeatherSun] = useState<DayForecast | null>(null)
  const [loadingWeather, setLoadingWeather] = useState(true)
  const [kiraEsteFindes, setKiraEsteFindes] = useState(true)
  const [planLogs, setPlanLogs] = useState<PlanLog[]>([])
  const [selectedFilter, setSelectedFilter] = useState<string>('todos')
  const [selectedPlan, setSelectedPlan] = useState<ActivityPlan | null>(null)
  const [pendingLogId, setPendingLogId] = useState<string | null>(null)
  const [ratingStars, setRatingStars] = useState(0)
  const [ratingNote, setRatingNote] = useState('')
  const [ratingKira, setRatingKira] = useState<boolean | null>(null)
  const [submittingRating, setSubmittingRating] = useState(false)
  const [loggedThisSession, setLoggedThisSession] = useState<Set<string>>(new Set())
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[] | null>(null)
  const [loadingAI, setLoadingAI] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  // Load weather on mount
  useEffect(() => {
    fetchWeekendForecast().then(({ sat, sun }) => {
      setWeatherSat(sat)
      setWeatherSun(sun)
      setLoadingWeather(false)
    })
  }, [])

  // Subscribe to plan history
  useEffect(() => {
    return subscribePlanHistory(setPlanLogs)
  }, [])

  // Per-plan stats derived from logs
  const planStatsMap = useMemo(() => {
    const map: Record<string, { count: number; lastDate: Date; avgRating: number }> = {}
    planLogs.forEach(log => {
      if (!map[log.planId]) map[log.planId] = { count: 0, lastDate: log.date, avgRating: 0 }
      map[log.planId].count++
      if (log.date > map[log.planId].lastDate) map[log.planId].lastDate = log.date
    })
    Object.keys(map).forEach(planId => {
      const rated = planLogs.filter(l => l.planId === planId && l.rating != null)
      map[planId].avgRating = rated.length > 0
        ? rated.reduce((s, l) => s + (l.rating ?? 0), 0) / rated.length
        : 0
    })
    return map
  }, [planLogs])

  // Recent plan IDs (last 3 weeks) for deduplication
  const recentPlanIds = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 21)
    return planLogs.filter(l => l.date >= cutoff).map(l => l.planId)
  }, [planLogs])

  // Computed suggestions
  const suggestions = useMemo(() => {
    if (loadingWeather) return []
    return computeSuggestions(weatherSat, weatherSun, kiraEsteFindes, recentPlanIds, planStatsMap)
  }, [weatherSat, weatherSun, kiraEsteFindes, recentPlanIds, planStatsMap, loadingWeather])

  // Current season for "not in season" badges
  const currentSeason = getSeason(new Date().getMonth())
  const specialEvent = getSpecialEvent(new Date().getMonth(), new Date().getDate())
  const kiraAgeMeses = getKiraAgeMeses()

  // Filtered catalog
  const catalogPlans = useMemo(() => {
    if (selectedFilter === 'todos') return PLANES
    if (selectedFilter === 'kira') return PLANES.filter(p => p.aptoKira && (!p.edadMinimaKira || kiraAgeMeses >= p.edadMinimaKira))
    if (selectedFilter === 'solo_daniel') return PLANES.filter(p => !p.aptoKira)
    return PLANES.filter(p => p.categoria === selectedFilter)
  }, [selectedFilter, kiraAgeMeses])

  // Historial stats
  const histStats = useMemo(() => {
    const thisYear = new Date().getFullYear()
    const yearLogs = planLogs.filter(l => l.date.getFullYear() === thisYear)
    const catFreq: Record<string, number> = {}
    const planFreq: Record<string, number> = {}
    yearLogs.forEach(l => {
      const p = PLANES.find(x => x.id === l.planId)
      if (p) {
        catFreq[p.categoria] = (catFreq[p.categoria] ?? 0) + 1
        planFreq[l.planId] = (planFreq[l.planId] ?? 0) + 1
      }
    })
    const favCatKey = Object.entries(catFreq).sort((a, b) => b[1] - a[1])[0]?.[0]
    const favPlanId = Object.entries(planFreq).sort((a, b) => b[1] - a[1])[0]?.[0]
    const favPlan = PLANES.find(p => p.id === favPlanId)
    return {
      total: yearLogs.length,
      favCategory: favCatKey ? CATEGORY_CONFIG[favCatKey as PlanCategoria]?.label ?? favCatKey : null,
      favPlan: favPlan ? `${favPlan.emoji} ${favPlan.nombre}` : null,
    }
  }, [planLogs])

  // ─── Handlers ────────────────────────────────────────────────────────────────

  async function handleLogPlan(plan: ActivityPlan) {
    const weather = weatherSat ? `${weatherSat.emoji} ${weatherSat.description} ${weatherSat.tempMax}°C` : undefined
    const logId = await logPlan(plan.id, { withKira: kiraEsteFindes, weather })
    setLoggedThisSession(prev => new Set([...prev, plan.id]))
    setPendingLogId(logId)
    setSelectedPlan(plan)
    setRatingStars(0)
    setRatingNote('')
    setRatingKira(null)
  }

  async function handleSubmitRating() {
    if (!pendingLogId) return
    setSubmittingRating(true)
    await updatePlanLog(pendingLogId, {
      rating: ratingStars > 0 ? ratingStars : undefined,
      kiraLikes: kiraEsteFindes && selectedPlan?.aptoKira ? ratingKira ?? undefined : undefined,
      note: ratingNote.trim() || undefined,
    })
    setSubmittingRating(false)
    setPendingLogId(null)
    setSelectedPlan(null)
  }

  async function handleAISuggestions() {
    if (!hasAnyAIKey()) {
      setAiError('Configura una API key de Gemini o Groq en Ajustes para usar la IA.')
      return
    }
    setLoadingAI(true)
    setAiError(null)
    setAiSuggestions(null)
    try {
      const month = new Date().getMonth()
      const season = getSeason(month)
      const satStr = weatherSat ? `${weatherSat.emoji} ${weatherSat.description} ${weatherSat.tempMax}°C` : 'desconocido'
      const sunStr = weatherSun ? `${weatherSun.emoji} ${weatherSun.description} ${weatherSun.tempMax}°C` : 'desconocido'
      const kiraStr = kiraEsteFindes ? `Tiene a Kira (${Math.floor(kiraAgeMeses / 12)} años ${kiraAgeMeses % 12} meses) este fin de semana.` : 'No tiene a Kira este fin de semana.'
      const recentStr = recentPlanIds.length > 0 ? recentPlanIds.join(', ') : 'ninguno'
      const plansStr = PLANES.map(p =>
        `- ${p.id}: ${p.nombre} (${p.categoria}, kira:${p.aptoKira}, clima:${p.climaIdeal.join('/')}, temporada:${p.temporada.join('/')})`
      ).join('\n')

      const prompt = `Eres el planificador de fin de semana de Daniel (35 años, Pedrola, Zaragoza). ${kiraStr}
Tiempo fin de semana: Sábado ${satStr} · Domingo ${sunStr}.
Mes: ${MONTH_NAMES[month]}, temporada: ${season}.
Planes realizados recientemente (evitar repetir): ${recentStr}.

Planes disponibles:
${plansStr}

Sugiere los 3 planes más perfectos para ESTE fin de semana específico. Ten en cuenta el clima real, la temporada y que no se hayan hecho recientemente.
Responde ÚNICAMENTE con JSON válido (sin markdown, sin explicaciones adicionales):
[{"planId":"string","razon":"frase corta explicando por qué ahora (max 12 palabras)","momento":"sábado mañana|sábado tarde|domingo mañana|domingo tarde"}]`

      const raw = await callAI(prompt, undefined, true, 600)
      const match = raw.match(/\[[\s\S]*\]/)
      if (!match) throw new Error('Respuesta inesperada de la IA')
      const parsed = JSON.parse(match[0]) as { planId: string; razon: string; momento: string }[]
      const results: AISuggestion[] = parsed
        .map(s => {
          const plan = PLANES.find(p => p.id === s.planId)
          if (!plan) return null
          return { plan, razon: s.razon, momento: s.momento }
        })
        .filter((s): s is AISuggestion => s !== null)
        .slice(0, 3)
      setAiSuggestions(results)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Error al contactar con la IA')
    }
    setLoadingAI(false)
  }

  function closeModal() {
    setSelectedPlan(null)
    setPendingLogId(null)
    setRatingStars(0)
    setRatingNote('')
    setRatingKira(null)
  }

  // ─── Render helpers ───────────────────────────────────────────────────────────

  function renderSuggestionCard(plan: ActivityPlan, reason: string, momento?: string) {
    const cat = CATEGORY_CONFIG[plan.categoria]
    const done = loggedThisSession.has(plan.id)
    return (
      <motion.div
        key={plan.id}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-3xl border ${cat.border} bg-[#1E1E28] p-5 flex flex-col gap-3`}
      >
        {momento && (
          <div className="text-xs text-white/40 font-medium uppercase tracking-wider">{momento}</div>
        )}
        <div className="flex items-start gap-4">
          <div className={`w-16 h-16 rounded-2xl ${cat.bg} flex items-center justify-center text-4xl shrink-0`}>
            {plan.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-white/90 mb-1">{plan.nombre}</h3>
            <div className="flex flex-wrap gap-1">
              <Pill className="bg-white/8 text-white/50">📍 {plan.ubicacion}</Pill>
              <Pill className="bg-white/8 text-white/50">🕐 {DURACION_LABEL[plan.duracion]}</Pill>
              <Pill className={PRECIO_COLOR[plan.precio]}>{PRECIO_LABEL[plan.precio]}</Pill>
            </div>
          </div>
        </div>
        <p className="text-sm text-white/60 italic">{reason}</p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => handleLogPlan(plan)}
            disabled={done}
            className={`flex-1 flex items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-semibold transition ${
              done
                ? 'bg-emerald-500/20 text-emerald-300 cursor-default'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
          >
            <Check size={14} /> {done ? '✓ Registrado' : 'Este plan'}
          </button>
          <button
            onClick={() => { setSelectedPlan(plan); setPendingLogId(null) }}
            className="flex items-center gap-1 px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-sm text-white/70 transition"
          >
            Ver más <ChevronRight size={14} />
          </button>
        </div>
      </motion.div>
    )
  }

  function renderCatalogCard(plan: ActivityPlan) {
    const cat = CATEGORY_CONFIG[plan.categoria]
    const stats = planStatsMap[plan.id]
    const inSeason = plan.temporada.includes('todo_el_ano') || plan.temporada.includes(currentSeason)
    const kiraOk = plan.aptoKira && (!plan.edadMinimaKira || kiraAgeMeses >= plan.edadMinimaKira)

    return (
      <motion.button
        key={plan.id}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => { setSelectedPlan(plan); setPendingLogId(null) }}
        className="rounded-3xl border border-white/8 bg-[#1E1E28] p-4 text-left hover:border-white/14 transition flex flex-col gap-2"
      >
        <div className={`w-14 h-14 rounded-2xl ${cat.bg} flex items-center justify-center text-3xl mb-1`}>
          {plan.emoji}
        </div>
        <div>
          <p className="text-sm font-semibold text-white/90 leading-tight">{plan.nombre}</p>
          <p className={`text-xs mt-0.5 font-medium ${cat.text}`}>{cat.label}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Pill className={PRECIO_COLOR[plan.precio]}>{PRECIO_LABEL[plan.precio]}</Pill>
          <Pill className="bg-white/8 text-white/40">{DURACION_LABEL[plan.duracion]}</Pill>
        </div>
        <div className="flex flex-wrap gap-1 mt-auto">
          {kiraOk && <Pill className="bg-rose-500/10 text-rose-300">👧 Kira</Pill>}
          {!inSeason && <Pill className="bg-white/5 text-white/30">⏳ No es temporada</Pill>}
          {loggedThisSession.has(plan.id) && <Pill className="bg-emerald-500/10 text-emerald-300">✓ Hecho</Pill>}
        </div>
        <p className="text-xs text-white/30">
          {stats ? `${stats.count} vez${stats.count !== 1 ? 'es' : ''} · ${timeAgo(stats.lastDate)}` : 'Nunca'}
        </p>
      </motion.button>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const tabs = [
    { id: 'sugeridor' as const, label: '🌟 Sugeridor' },
    { id: 'catalogo'  as const, label: '🗂️ Catálogo' },
    { id: 'historial' as const, label: '📋 Historial' },
  ]

  const filterOptions = [
    { id: 'todos',      label: 'Todos' },
    { id: 'aire_libre', label: '🌳 Aire libre' },
    { id: 'indoor',     label: '🏠 Indoor' },
    { id: 'comida',     label: '🍽️ Comida' },
    { id: 'cultura',    label: '🎭 Cultura' },
    { id: 'excursion',  label: '🚗 Excursión' },
    { id: 'en_casa',    label: '🛋️ En casa' },
    { id: 'kira',       label: '👧 Con Kira' },
    { id: 'solo_daniel',label: '🧔 Solo Daniel' },
  ]

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <p className="text-sm text-white/35">Zaragoza · Pedrola</p>
        <div className="flex items-end justify-between mt-1">
          <h1 className="text-3xl font-bold text-white/90">Planes de finde</h1>
          {/* Kira toggle */}
          <button
            onClick={() => setKiraEsteFindes(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-medium transition ${
              kiraEsteFindes
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/25'
                : 'bg-white/5 text-white/50 border border-white/8'
            }`}
          >
            👧 Kira {kiraEsteFindes ? 'Sí' : 'No'}
          </button>
        </div>
      </motion.div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 bg-white/5 rounded-2xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${
              activeTab === tab.id
                ? 'bg-emerald-600 text-white shadow'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── SUGERIDOR ─────────────────────────────────────────────────────────── */}
      {activeTab === 'sugeridor' && (
        <div className="space-y-4">
          {/* Weather banner */}
          <div className="rounded-3xl border border-white/8 bg-[#1E1E28] p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-white/80">📅 Este fin de semana</span>
            </div>
            {loadingWeather ? (
              <div className="h-6 w-48 bg-white/5 rounded-full animate-pulse" />
            ) : (
              <div className="flex flex-wrap gap-3">
                {weatherSat && (
                  <Pill className="bg-white/8 text-white/70 text-sm py-1 px-3">
                    Sáb {weatherSat.emoji} {weatherSat.tempMax}°C · {weatherSat.description}
                    {weatherSat.precipitationProb > 30 && ` · 💧${weatherSat.precipitationProb}%`}
                  </Pill>
                )}
                {weatherSun && (
                  <Pill className="bg-white/8 text-white/70 text-sm py-1 px-3">
                    Dom {weatherSun.emoji} {weatherSun.tempMax}°C · {weatherSun.description}
                    {weatherSun.precipitationProb > 30 && ` · 💧${weatherSun.precipitationProb}%`}
                  </Pill>
                )}
                {!weatherSat && !weatherSun && (
                  <span className="text-sm text-white/40">No se pudo cargar el tiempo</span>
                )}
              </div>
            )}
          </div>

          {/* Special event banner */}
          {specialEvent && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl border border-amber-500/25 bg-amber-500/10 px-5 py-3 flex items-center gap-3"
            >
              <span className="text-2xl">{specialEvent.emoji}</span>
              <p className="text-sm font-semibold text-amber-300">{specialEvent.texto}</p>
            </motion.div>
          )}

          {/* Suggestion cards */}
          {loadingWeather ? (
            <div className="space-y-3">
              {[0,1,2].map(i => (
                <div key={i} className="rounded-3xl border border-white/5 bg-[#1E1E28] h-40 animate-pulse" />
              ))}
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-3">
              {suggestions.map(plan =>
                renderSuggestionCard(
                  plan,
                  getSuggestionReason(plan, weatherSat, weatherSun, planStatsMap),
                )
              )}
            </div>
          ) : (
            <div className="text-center py-10 text-white/40">
              <p className="text-4xl mb-3">🔍</p>
              <p>No hay sugerencias con los filtros actuales</p>
            </div>
          )}

          {/* AI button */}
          <div className="mt-4">
            <button
              onClick={handleAISuggestions}
              disabled={loadingAI}
              className="w-full flex items-center justify-center gap-2 rounded-3xl border border-violet-500/25 bg-violet-500/10 py-3.5 text-sm font-semibold text-violet-300 hover:bg-violet-500/15 transition disabled:opacity-50"
            >
              {loadingAI ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full"
                  />
                  Consultando a la IA...
                </>
              ) : (
                <><Sparkles size={16} /> 🤖 Pedir ideas a la IA</>
              )}
            </button>
            {aiError && <p className="mt-2 text-xs text-red-400 text-center">{aiError}</p>}
          </div>

          {/* AI suggestions */}
          <AnimatePresence>
            {aiSuggestions && aiSuggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <p className="text-xs text-white/40 uppercase tracking-widest font-medium px-1">
                  Sugerencias de la IA ✨
                </p>
                {aiSuggestions.map(({ plan, razon, momento }) =>
                  renderSuggestionCard(plan, `🤖 ${razon}`, momento)
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── CATÁLOGO ──────────────────────────────────────────────────────────── */}
      {activeTab === 'catalogo' && (
        <div>
          {/* Filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
            {filterOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setSelectedFilter(opt.id)}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition ${
                  selectedFilter === opt.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white/5 text-white/60 hover:text-white/80 border border-white/8'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <AnimatePresence mode="popLayout">
              {catalogPlans.map(plan => (
                <div key={plan.id}>
                  {renderCatalogCard(plan)}
                </div>
              ))}
            </AnimatePresence>
          </div>

          {catalogPlans.length === 0 && (
            <div className="text-center py-12 text-white/40">
              <p className="text-4xl mb-3">🔍</p>
              <p>No hay planes con este filtro</p>
            </div>
          )}
        </div>
      )}

      {/* ── HISTORIAL ─────────────────────────────────────────────────────────── */}
      {activeTab === 'historial' && (
        <div className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Este año', value: histStats.total > 0 ? `${histStats.total} planes` : '—' },
              { label: 'Cat. favorita', value: histStats.favCategory ?? '—' },
              { label: 'Más repetido', value: histStats.favPlan ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl border border-white/8 bg-[#1E1E28] p-3 text-center">
                <p className="text-xs text-white/40 mb-1">{label}</p>
                <p className="text-sm font-semibold text-white/80 leading-tight">{value}</p>
              </div>
            ))}
          </div>

          {/* Timeline */}
          {planLogs.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              <p className="text-4xl mb-3">📋</p>
              <p>Aún no hay planes registrados</p>
              <p className="text-sm mt-1">¡Usa el Sugeridor para apuntar el primero!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {planLogs.map(log => {
                const plan = PLANES.find(p => p.id === log.planId)
                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-4 rounded-2xl border border-white/8 bg-[#1E1E28] p-4"
                  >
                    <div className="text-2xl shrink-0">{log.planEmoji}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white/90">{log.planNombre}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-white/40">
                          {log.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        {log.withKira && <span className="text-xs text-rose-400">· 👧 con Kira</span>}
                        {plan && <Pill className={`${CATEGORY_CONFIG[plan.categoria].bg} ${CATEGORY_CONFIG[plan.categoria].text}`}>{CATEGORY_CONFIG[plan.categoria].label}</Pill>}
                      </div>
                      {log.note && <p className="text-xs text-white/40 mt-1 italic">"{log.note}"</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      {log.rating ? (
                        <StarRow value={log.rating} size="sm" />
                      ) : (
                        <span className="text-xs text-white/25">Sin valorar</span>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── DETAIL MODAL ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="w-full max-w-lg rounded-3xl border border-white/8 bg-[#1E1E28] overflow-y-auto max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex justify-end p-4 pb-0">
                <button
                  onClick={closeModal}
                  className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center"
                >
                  <X size={16} className="text-white/60" />
                </button>
              </div>

              <div className="px-6 pb-6 space-y-4">
                {/* Emoji + title */}
                <div className="text-center">
                  <div className={`w-24 h-24 rounded-3xl ${CATEGORY_CONFIG[selectedPlan.categoria].bg} flex items-center justify-center text-6xl mx-auto mb-3`}>
                    {selectedPlan.emoji}
                  </div>
                  <h2 className="text-xl font-bold text-white/90">{selectedPlan.nombre}</h2>
                  <p className={`text-sm font-medium mt-1 ${CATEGORY_CONFIG[selectedPlan.categoria].text}`}>
                    {CATEGORY_CONFIG[selectedPlan.categoria].label}
                  </p>
                </div>

                {/* Description */}
                <p className="text-sm text-white/70 leading-relaxed text-center">{selectedPlan.descripcionLarga}</p>

                {/* Info pills */}
                <div className="flex flex-wrap gap-2 justify-center">
                  <Pill className="bg-white/8 text-white/60">📍 {selectedPlan.ubicacion}</Pill>
                  {selectedPlan.distanciaKm && (
                    <Pill className="bg-white/8 text-white/60">🗺️ {selectedPlan.distanciaKm} km</Pill>
                  )}
                  <Pill className="bg-white/8 text-white/60">🕐 {DURACION_LABEL[selectedPlan.duracion]}</Pill>
                  <Pill className={PRECIO_COLOR[selectedPlan.precio]}>{PRECIO_LABEL[selectedPlan.precio]}</Pill>
                  {selectedPlan.aptoKira ? (
                    <Pill className="bg-rose-500/15 text-rose-300">
                      👧 Apto para Kira {selectedPlan.edadMinimaKira ? `(+${Math.floor(selectedPlan.edadMinimaKira/12)} años)` : ''}
                    </Pill>
                  ) : (
                    <Pill className="bg-slate-500/15 text-slate-400">🧔 Solo Daniel</Pill>
                  )}
                </div>

                {/* Seasons */}
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {selectedPlan.temporada.map(t => (
                    <Pill key={t} className="bg-white/5 text-white/40">
                      {t === 'todo_el_ano' ? '📅 Todo el año' :
                       t === 'primavera' ? '🌸 Primavera' :
                       t === 'verano' ? '☀️ Verano' :
                       t === 'otono' ? '🍂 Otoño' : '❄️ Invierno'}
                    </Pill>
                  ))}
                </div>

                {/* URL */}
                {selectedPlan.url && (
                  <div className="flex justify-center">
                    <a
                      href={selectedPlan.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/10 text-sm text-white/70 transition"
                    >
                      <ExternalLink size={14} /> Ver web
                    </a>
                  </div>
                )}

                {/* History stats */}
                {planStatsMap[selectedPlan.id] && (
                  <div className="rounded-2xl bg-white/4 border border-white/5 p-3 text-center space-y-1">
                    <p className="text-xs text-white/40">
                      Hecho <span className="text-white/70 font-semibold">{planStatsMap[selectedPlan.id].count}</span> vez{planStatsMap[selectedPlan.id].count !== 1 ? 'es' : ''}
                      {' · '}Última: <span className="text-white/70">{timeAgo(planStatsMap[selectedPlan.id].lastDate)}</span>
                    </p>
                    {planStatsMap[selectedPlan.id].avgRating > 0 && (
                      <div className="flex items-center justify-center gap-2">
                        <StarRow value={Math.round(planStatsMap[selectedPlan.id].avgRating)} size="sm" />
                        <span className="text-xs text-white/40">
                          ({planStatsMap[selectedPlan.id].avgRating.toFixed(1)})
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Rating flow (after logging) */}
                {pendingLogId ? (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                    <p className="text-sm font-semibold text-emerald-300 text-center">✅ ¡Registrado! ¿Cómo fue?</p>

                    <div className="flex justify-center">
                      <StarRow value={ratingStars} onChange={setRatingStars} />
                    </div>

                    {kiraEsteFindes && selectedPlan.aptoKira && (
                      <div>
                        <p className="text-xs text-white/50 mb-2 text-center">¿A Kira le gustó?</p>
                        <div className="flex gap-2 justify-center">
                          {[{ v: true, l: '😍 Sí' }, { v: false, l: '😕 No mucho' }].map(({ v, l }) => (
                            <button
                              key={String(v)}
                              onClick={() => setRatingKira(v)}
                              className={`px-4 py-1.5 rounded-xl text-sm transition ${
                                ratingKira === v
                                  ? 'bg-rose-500/30 text-rose-300 border border-rose-500/30'
                                  : 'bg-white/5 text-white/60 border border-white/8'
                              }`}
                            >
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <textarea
                      value={ratingNote}
                      onChange={e => setRatingNote(e.target.value)}
                      placeholder="Nota libre (opcional)..."
                      rows={2}
                      className="w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-2.5 text-sm text-white/80 focus:outline-none resize-none placeholder-white/25"
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={handleSubmitRating}
                        disabled={submittingRating}
                        className="flex-1 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-2.5 transition disabled:opacity-50"
                      >
                        {submittingRating ? 'Guardando...' : 'Guardar valoración'}
                      </button>
                      <button onClick={closeModal} className="px-4 py-2.5 text-sm text-white/50 hover:text-white/70 transition">
                        Omitir
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handleLogPlan(selectedPlan)}
                    disabled={loggedThisSession.has(selectedPlan.id)}
                    className={`w-full flex items-center justify-center gap-2 rounded-3xl py-3.5 text-sm font-semibold transition ${
                      loggedThisSession.has(selectedPlan.id)
                        ? 'bg-emerald-500/20 text-emerald-300 cursor-default'
                        : 'bg-emerald-600 text-white hover:bg-emerald-500'
                    }`}
                  >
                    {loggedThisSession.has(selectedPlan.id) ? (
                      <><Check size={16} /> Ya registrado este finde</>
                    ) : (
                      <><Check size={16} /> Lo hacemos este finde</>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
