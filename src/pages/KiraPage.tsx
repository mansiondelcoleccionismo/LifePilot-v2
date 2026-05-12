import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight, Sparkles, BookOpen, Star, MessageCircle, Send, Home, Trophy } from 'lucide-react'
import { KIRA_ACTIVITIES, CATEGORY_META, type KiraActivityDef } from '@/data/kira-activities'
import { KIRA_MILESTONES_DEF, getMilestoneStatus } from '@/data/kira-milestones'
import {
  subscribeKiraActivityLogs, addKiraActivityLog,
  subscribeKiraDiaryEntries, addKiraDiaryEntry, deleteKiraDiaryEntry,
  subscribeKiraAchievedMilestones, addKiraAchievedMilestone,
} from '@/services/kira.service'
import { getWeatherToday, type WeatherData } from '@/services/weather.service'
import { callAI, hasAnyAIKey } from '@/services/ai.service'
import type { KiraActivityLog, KiraDiaryEntry, KiraAchievedMilestone } from '@/types/kira'

// ── Constants ──────────────────────────────────────────────────────────────
const KIRA_BIRTHDAY = new Date('2022-10-03')

const DAILY_PHRASES = [
  'El juego libre no es tiempo perdido: es el trabajo más serio de la infancia.',
  'Cuando un niño dice "yo solo", está pidiendo que confíes en él.',
  'La rabieta no es manipulación: es una emoción demasiado grande para un cuerpo tan pequeño.',
  'El aburrimiento es el origen de la creatividad. Aguanta el impulso de entretenerla.',
  'Tres frases que cambian la relación: "Te veo", "Te escucho", "Estoy aquí".',
  'Las canciones que aprende ahora las recordará toda la vida.',
  'El niño que cocina aprende matemáticas, ciencia, autonomía y amor al mismo tiempo.',
  'No hay actividad más compleja que el juego simbólico: todo ocurre al mismo tiempo.',
  'La naturaleza es el mejor aula. El barro, el mejor material.',
  'Dibuja sin modelo, canta sin letra: así nace la creatividad genuina.',
  'Cada "no" razonado vale más que diez "no" automáticos.',
  'Lo que más recuerdan los adultos de su infancia es cómo se sentían, no qué hacían.',
  'El movimiento y el aprendizaje van de la mano: cuerpo en movimiento, cerebro activo.',
  'Una rutina predecible da más libertad que mil caprichos.',
  'Estar presente 30 minutos de calidad vale más que 4 horas mirando el móvil.',
  'Los niños no necesitan padres perfectos, necesitan padres suficientemente buenos.',
  'La lectura en voz alta es la inversión más rentable en el desarrollo de un niño.',
  'Cuando repite la misma pregunta no es que no recuerde: quiere conectar contigo.',
  'El error es información, no fracaso. Modélalo cuando tú también te equivocas.',
  'Un niño que ayuda en casa se siente competente, útil y parte del equipo familiar.',
  'La conexión antes de la corrección: primero vínculo, luego límite.',
  'Cantar juntos sincroniza los cerebros y aumenta la hormona del apego.',
  'El juego cooperativo se aprende entre los 3 y 5 años: es exactamente el momento.',
  'Nombrar las emociones las hace manejables. "Veo que estás frustrada" ya ayuda.',
  'Los rituales de despedida seguros hacen la separación menos dolorosa.',
  'El tiempo al aire libre reduce el cortisol y mejora la atención y el sueño.',
  '"¿Qué crees tú?" antes de dar la respuesta activa el pensamiento crítico.',
  'La autonomía se construye en pequeños pasos: hoy el botón, mañana los cordones.',
  'Un padre que lee, baila o pinta delante de su hijo le da permiso para hacerlo.',
  'La infancia que un padre recuerda con ternura es la que un hijo crea sin darse cuenta.',
]

const KIRA_AI_SYSTEM = `Eres un experto en desarrollo infantil y pedagogía con base en Montessori, Pikler y juego libre. Estás ayudando a Daniel, padre de Kira (3 años y 7 meses, nacida el 03/10/2022). A Kira le encanta pintar, cantar, la bici, el parque y los memories. Daniel tiene dos días completos a la semana con ella (martes y jueves). Responde siempre con consejos prácticos, concretos y con base científica real. En español, cercano y directo. Máximo 150 palabras por respuesta.`

const SUGGESTED_QUESTIONS = [
  '¿Qué actividad es mejor para esta tarde?',
  'Kira tiene muchas rabietas últimamente, ¿qué hago?',
  '¿Cómo trabajo la lectoescritura de forma lúdica?',
  'Ideas para su cumpleaños de 4 años',
  '¿Cómo gestiono cuando llora al despedirnos?',
]

const MOOD_EMOJIS: Record<number, string> = { 1: '😢', 2: '😐', 3: '🙂', 4: '😄', 5: '😍' }
const RATING_EMOJIS: Record<number, { emoji: string; label: string }> = {
  0: { emoji: '😞', label: 'No le gustó' },
  1: { emoji: '😐', label: 'Regular' },
  2: { emoji: '😊', label: 'Le gustó' },
  3: { emoji: '😍', label: '¡Le encantó!' },
}

// ── Helpers ────────────────────────────────────────────────────────────────
function calcAge(birthday: Date) {
  const now = new Date()
  let years = now.getFullYear() - birthday.getFullYear()
  let months = now.getMonth() - birthday.getMonth()
  if (now.getDate() < birthday.getDate()) months--
  if (months < 0) { years--; months += 12 }
  return { years, months, totalMonths: years * 12 + months }
}

function daysUntilBirthday(birthday: Date): number {
  const now = new Date()
  const next = new Date(now.getFullYear(), birthday.getMonth(), birthday.getDate())
  if (next <= now) next.setFullYear(now.getFullYear() + 1)
  return Math.ceil((next.getTime() - now.getTime()) / 86_400_000)
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function isKiraDay(date = new Date()) {
  const d = date.getDay()
  return d === 2 || d === 4 // martes=2, jueves=4
}

function nextKiraDay(): string {
  const now = new Date()
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    if (isKiraDay(d)) {
      return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    }
  }
  return ''
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours()
  if (h < 13) return 'morning'
  if (h < 19) return 'afternoon'
  return 'evening'
}

function getDailyPhrase(): string {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000)
  return DAILY_PHRASES[dayOfYear % DAILY_PHRASES.length]
}

function computeAvgRatings(logs: KiraActivityLog[]): Record<string, number> {
  const map: Record<string, number[]> = {}
  logs.forEach(l => {
    if (!map[l.activityId]) map[l.activityId] = []
    map[l.activityId].push(l.rating)
  })
  const result: Record<string, number> = {}
  Object.entries(map).forEach(([id, ratings]) => {
    result[id] = ratings.reduce((a, b) => a + b, 0) / ratings.length
  })
  return result
}

function getSuggestedActivity(logs: KiraActivityLog[], weather: WeatherData | null): KiraActivityDef {
  const sevenDaysAgo = Date.now() - 7 * 86_400_000
  const recentIds = new Set(logs.filter(l => new Date(l.date).getTime() > sevenDaysAgo).map(l => l.activityId))
  const avgRatings = computeAvgRatings(logs)
  const isRainy = weather ? weather.precipitationProb > 50 : false
  const tod = getTimeOfDay()
  const preferHigh = tod === 'morning'
  const preferLow = tod === 'evening'

  const candidates = KIRA_ACTIVITIES.filter(a => {
    if (recentIds.has(a.id)) return false
    if (isRainy && a.location === 'exterior') return false
    const avg = avgRatings[a.id]
    if (avg !== undefined && avg < 1 && logs.filter(l => l.activityId === a.id).length >= 2) return false
    return true
  })

  return candidates.sort((a, b) => {
    const aEnergy = preferHigh ? (a.energyLevel === 'alta' ? 2 : a.energyLevel === 'media' ? 1 : 0)
      : preferLow ? (a.energyLevel === 'baja' ? 2 : a.energyLevel === 'media' ? 1 : 0)
      : (a.energyLevel === 'media' ? 2 : 1)
    const bEnergy = preferHigh ? (b.energyLevel === 'alta' ? 2 : b.energyLevel === 'media' ? 1 : 0)
      : preferLow ? (b.energyLevel === 'baja' ? 2 : b.energyLevel === 'media' ? 1 : 0)
      : (b.energyLevel === 'media' ? 2 : 1)
    if (aEnergy !== bEnergy) return bEnergy - aEnergy
    return (avgRatings[b.id] ?? 1.5) - (avgRatings[a.id] ?? 1.5)
  })[0] ?? KIRA_ACTIVITIES[0]
}

// ── Sub-components ─────────────────────────────────────────────────────────
function ActivityCard({
  activity, onLog, onDetail, compact = false,
}: {
  activity: KiraActivityDef
  onLog: (a: KiraActivityDef) => void
  onDetail: (a: KiraActivityDef) => void
  compact?: boolean
}) {
  const meta = CATEGORY_META[activity.category]
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-amber-500/10 bg-[#1E1B14] p-4 flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none">{activity.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white/90 text-sm leading-tight">{activity.name}</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${meta.color}`}>
              {meta.emoji} {meta.label}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-white/40">
              {activity.location === 'interior' ? '🏠 Interior' : activity.location === 'exterior' ? '🌤️ Exterior' : '🏠🌤️'}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-white/40">
              ⏱ ~{activity.duration}min
            </span>
          </div>
        </div>
      </div>
      {!compact && (
        <p className="text-xs text-white/50 leading-relaxed line-clamp-2">{activity.description}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => onLog(activity)}
          className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-semibold text-black transition hover:bg-amber-400"
        >
          ✓ Esto hicimos hoy
        </button>
        <button
          onClick={() => onDetail(activity)}
          className="px-3 rounded-xl bg-white/5 hover:bg-white/10 transition"
        >
          <ChevronRight size={14} className="text-white/50" />
        </button>
      </div>
    </motion.div>
  )
}

function LogModal({
  activity, onClose, onSave,
}: {
  activity: KiraActivityDef
  onClose: () => void
  onSave: (rating: 0|1|2|3, duration: 'short'|'medium'|'long', notes: string) => void
}) {
  const [rating, setRating] = useState<0|1|2|3>(2)
  const [duration, setDuration] = useState<'short'|'medium'|'long'>('medium')
  const [notes, setNotes] = useState('')

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        className="w-full max-w-sm rounded-3xl border border-amber-500/20 bg-[#1A1710] p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs text-amber-400/70 uppercase tracking-widest">Actividad realizada</p>
            <p className="text-lg font-bold text-white/90 mt-0.5">{activity.emoji} {activity.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center"><X size={14} className="text-white/50" /></button>
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/35 mb-3">¿Cómo le fue a Kira?</p>
            <div className="flex gap-2">
              {([0,1,2,3] as const).map(r => (
                <button key={r} onClick={() => setRating(r)}
                  className={`flex-1 flex flex-col items-center gap-1 rounded-2xl py-3 border transition ${rating === r ? 'border-amber-400 bg-amber-400/10' : 'border-white/8 bg-white/3 hover:bg-white/6'}`}>
                  <span className="text-2xl">{RATING_EMOJIS[r].emoji}</span>
                  <span className="text-[9px] text-white/50">{RATING_EMOJIS[r].label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/35 mb-3">¿Cuánto tiempo aguantó?</p>
            <div className="flex gap-2">
              {([['short','<10 min'],['medium','10-30 min'],['long','>30 min']] as const).map(([val, label]) => (
                <button key={val} onClick={() => setDuration(val)}
                  className={`flex-1 rounded-2xl py-2 text-xs border transition ${duration === val ? 'border-amber-400 bg-amber-400/10 text-amber-300' : 'border-white/8 text-white/50 hover:bg-white/5'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">Nota rápida (opcional)</p>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-2.5 text-sm text-white/80 focus:outline-none focus:border-amber-500/40"
              placeholder="¿Qué pasó? ¿Algo especial?" />
          </div>

          <button onClick={() => onSave(rating, duration, notes)}
            className="w-full rounded-2xl bg-amber-500 py-3 font-semibold text-black text-sm hover:bg-amber-400 transition">
            Guardar 🎉
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function ActivityDetail({ activity, onClose, onLog }: { activity: KiraActivityDef; onClose: () => void; onLog: () => void }) {
  const meta = CATEGORY_META[activity.category]
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#1A1710] p-6 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-5xl">{activity.emoji}</span>
            <h2 className="text-xl font-bold text-white/90 mt-2">{activity.name}</h2>
            <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full border ${meta.color}`}>{meta.emoji} {meta.label}</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center shrink-0"><X size={14} className="text-white/50" /></button>
        </div>

        <div className="flex gap-3 mb-5 text-xs text-white/50">
          <span>⏱ ~{activity.duration} min</span>
          <span>{activity.location === 'interior' ? '🏠 Interior' : activity.location === 'exterior' ? '🌤️ Exterior' : '🏠🌤️ Cualquiera'}</span>
          <span>{activity.energyLevel === 'alta' ? '⚡ Alta energía' : activity.energyLevel === 'media' ? '🌀 Energía media' : '🌙 Relajada'}</span>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-amber-400/70 mb-1.5">Qué hacer</p>
            <p className="text-white/70 leading-relaxed">{activity.description}</p>
          </div>
          {activity.materials && activity.materials.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-amber-400/70 mb-1.5">Materiales</p>
              <ul className="space-y-1">{activity.materials.map(m => <li key={m} className="text-white/60 flex gap-2"><span>•</span>{m}</li>)}</ul>
            </div>
          )}
          <div className="rounded-2xl bg-violet-500/10 border border-violet-500/20 p-3">
            <p className="text-[10px] uppercase tracking-widest text-violet-400/70 mb-1.5">Por qué es buena para ella</p>
            <p className="text-violet-200/80 leading-relaxed text-xs">{activity.pedagogyNote}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-amber-400/70 mb-1.5">Consejos para ti</p>
            <ul className="space-y-1.5">{activity.tips.map(t => <li key={t} className="text-white/60 flex gap-2"><span className="text-amber-400">→</span>{t}</li>)}</ul>
          </div>
          <div className="flex flex-wrap gap-1">
            {activity.developmentArea.map(a => (
              <span key={a} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40">{a}</span>
            ))}
          </div>
        </div>

        <button onClick={onLog}
          className="w-full mt-5 rounded-2xl bg-amber-500 py-3 font-semibold text-black text-sm hover:bg-amber-400 transition">
          ✓ Esto hicimos hoy
        </button>
      </motion.div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
type Tab = 'hoy' | 'actividades' | 'hitos' | 'diario' | 'ia'

export function KiraPage() {
  const [tab, setTab] = useState<Tab>('hoy')
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [activityLogs, setActivityLogs] = useState<KiraActivityLog[]>([])
  const [diaryEntries, setDiaryEntries] = useState<KiraDiaryEntry[]>([])
  const [achievedMilestones, setAchievedMilestones] = useState<KiraAchievedMilestone[]>([])

  // Activity bank filters
  const [filterCategory, setFilterCategory] = useState<'all' | KiraActivityDef['category']>('all')
  const [filterLocation, setFilterLocation] = useState<'all' | 'interior' | 'exterior'>('all')
  const [filterEnergy, setFilterEnergy] = useState<'all' | 'baja' | 'media' | 'alta'>('all')
  const [searchText, setSearchText] = useState('')
  const [showMoreActivities, setShowMoreActivities] = useState(false)

  // Modals
  const [logActivity, setLogActivity] = useState<KiraActivityDef | null>(null)
  const [detailActivity, setDetailActivity] = useState<KiraActivityDef | null>(null)

  // Diary form
  const [showDiaryForm, setShowDiaryForm] = useState(false)
  const [diaryNotes, setDiaryNotes] = useState('')
  const [diaryKiraPhrase, setDiaryKiraPhrase] = useState('')
  const [diaryKiraMood, setDiaryKiraMood] = useState<1|2|3|4|5>(4)
  const [diaryDanielMood, setDiaryDanielMood] = useState<1|2|3|4|5>(4)
  const [diaryActivityName, setDiaryActivityName] = useState('')
  const [showPhrasesOnly, setShowPhrasesOnly] = useState(false)

  // AI chat
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const age = calcAge(KIRA_BIRTHDAY)
  const birthdayCountdown = daysUntilBirthday(KIRA_BIRTHDAY)
  const todayIsKiraDay = isKiraDay()
  const suggestion = useMemo(() => getSuggestedActivity(activityLogs, weather), [activityLogs, weather])
  const achievedIds = useMemo(() => new Set(achievedMilestones.map(a => a.milestoneId)), [achievedMilestones])
  const avgRatings = useMemo(() => computeAvgRatings(activityLogs), [activityLogs])

  useEffect(() => {
    getWeatherToday().then(setWeather)
    const u1 = subscribeKiraActivityLogs(setActivityLogs)
    const u2 = subscribeKiraDiaryEntries(setDiaryEntries)
    const u3 = subscribeKiraAchievedMilestones(setAchievedMilestones)
    return () => { u1(); u2(); u3() }
  }, [])

  const handleLog = async (
    activity: KiraActivityDef,
    rating: 0|1|2|3,
    duration: 'short'|'medium'|'long',
    notes: string,
  ) => {
    await addKiraActivityLog({
      activityId: activity.id,
      activityName: activity.name,
      date: todayStr(),
      rating, durationBucket: duration,
      notes: notes || undefined,
      timeOfDay: getTimeOfDay(),
    })
    setLogActivity(null)
  }

  const handleDiarySave = async () => {
    if (!diaryNotes.trim()) return
    await addKiraDiaryEntry({
      date: todayStr(),
      activityName: diaryActivityName || undefined,
      notes: diaryNotes,
      kiraPhrase: diaryKiraPhrase || undefined,
      kiraMood: diaryKiraMood,
      danielMood: diaryDanielMood,
    })
    setShowDiaryForm(false)
    setDiaryNotes(''); setDiaryKiraPhrase(''); setDiaryActivityName('')
    setDiaryKiraMood(4); setDiaryDanielMood(4)
  }

  const handleAiSend = async (msg: string) => {
    if (!msg.trim() || aiLoading) return
    const userMsg = msg.trim()
    setAiInput('')
    setAiMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setAiLoading(true)
    try {
      const reply = await callAI(`${KIRA_AI_SYSTEM}\n\nPadre pregunta: ${userMsg}`, undefined, true)
      setAiMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'No pude conectar con la IA. Verifica tu API key en Ajustes.' }])
    }
    setAiLoading(false)
  }

  const filteredActivities = useMemo(() => {
    return KIRA_ACTIVITIES.filter(a => {
      if (filterCategory !== 'all' && a.category !== filterCategory) return false
      if (filterLocation !== 'all' && a.location !== filterLocation && a.location !== 'ambos') return false
      if (filterEnergy !== 'all' && a.energyLevel !== filterEnergy) return false
      if (searchText && !a.name.toLowerCase().includes(searchText.toLowerCase())) return false
      return true
    })
  }, [filterCategory, filterLocation, filterEnergy, searchText])

  const kiraPhrasesAll = useMemo(() =>
    diaryEntries.filter(e => e.kiraPhrase).map(e => ({ phrase: e.kiraPhrase!, date: e.date, id: e.id })),
  [diaryEntries])

  // ── Tab: HOY ──────────────────────────────────────────────────────────────
  const renderHoy = () => (
    <div className="space-y-6">
      {/* Daily suggestion */}
      {todayIsKiraDay ? (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl border border-amber-400/30 bg-linear-to-br from-amber-500/15 to-amber-600/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">✨ Sugerencia del día</span>
            {weather && (
              <span className="ml-auto text-xs text-white/40">{weather.emoji} {weather.description} · {weather.tempMax}°</span>
            )}
          </div>
          <div className="flex gap-4 items-start">
            <span className="text-5xl leading-none">{suggestion.emoji}</span>
            <div className="flex-1">
              <p className="font-bold text-white text-lg leading-tight">{suggestion.name}</p>
              <p className="text-xs text-amber-300/70 mt-0.5">{CATEGORY_META[suggestion.category].label} · ⏱ ~{suggestion.duration} min</p>
              <p className="text-xs text-white/50 mt-2 leading-relaxed line-clamp-2">{suggestion.pedagogyNote}</p>
              {suggestion.materials && suggestion.materials.length > 0 && (
                <p className="text-xs text-white/35 mt-1.5">🗂 {suggestion.materials.slice(0, 2).join(', ')}{suggestion.materials.length > 2 ? '...' : ''}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setLogActivity(suggestion)}
              className="flex-1 rounded-2xl bg-amber-500 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition">
              ✓ Esto hicimos hoy
            </button>
            <button onClick={() => { setDetailActivity(suggestion) }}
              className="px-4 rounded-2xl bg-white/5 hover:bg-white/10 transition text-xs text-white/60">
              Ver más
            </button>
            <button onClick={() => setTab('actividades')}
              className="px-4 rounded-2xl bg-white/5 hover:bg-white/10 transition text-xs text-white/60">
              Banco
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="rounded-3xl border border-white/8 bg-[#1A1710] p-5 text-center">
          <p className="text-3xl mb-2">📅</p>
          <p className="text-sm text-white/60">Hoy no es día de Kira</p>
          <p className="text-xs text-amber-400/70 mt-1">Próximo día: {nextKiraDay()}</p>
        </div>
      )}

      {/* Recent activity */}
      {activityLogs.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/25 mb-3">Últimas actividades</p>
          <div className="space-y-2">
            {activityLogs.slice(0, 3).map(log => (
              <div key={log.id} className="flex items-center gap-3 rounded-2xl bg-white/3 border border-white/6 px-4 py-3">
                <span className="text-xl">{RATING_EMOJIS[log.rating].emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/80 truncate">{log.activityName}</p>
                  <p className="text-xs text-white/30">{log.date}</p>
                </div>
                <span className="text-xs text-white/25">{log.durationBucket === 'short' ? '<10m' : log.durationBucket === 'medium' ? '10-30m' : '>30m'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly plan */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-white/25 mb-3">Esta semana con Kira</p>
        <div className="grid grid-cols-2 gap-3">
          {['Martes', 'Jueves'].map(day => {
            const logsForDay = activityLogs.filter(l => {
              const d = new Date(l.date)
              const dayNum = day === 'Martes' ? 2 : 4
              const now = new Date()
              const startOfWeek = new Date(now)
              startOfWeek.setDate(now.getDate() - now.getDay())
              const targetDay = new Date(startOfWeek)
              targetDay.setDate(startOfWeek.getDate() + dayNum)
              return d.toDateString() === targetDay.toDateString()
            })
            const done = logsForDay.length > 0
            return (
              <div key={day} className={`rounded-2xl border p-3 ${done ? 'border-amber-400/30 bg-amber-400/5' : 'border-white/8 bg-white/2'}`}>
                <p className="text-xs font-semibold text-white/70 mb-1">{day}</p>
                {done ? (
                  <p className="text-[11px] text-amber-300">{logsForDay[0].activityName} {RATING_EMOJIS[logsForDay[0].rating].emoji}</p>
                ) : (
                  <p className="text-[11px] text-white/25">Sin registrar</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Stats */}
      {activityLogs.length > 0 && (() => {
        const totalActivities = activityLogs.length
        const avgRating = activityLogs.reduce((s, l) => s + l.rating, 0) / totalActivities
        const topActivity = Object.entries(avgRatings).sort(([,a],[,b]) => b-a)[0]
        const topDef = topActivity ? KIRA_ACTIVITIES.find(a => a.id === topActivity[0]) : null
        return (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Actividades', value: String(totalActivities), emoji: '🎯' },
              { label: 'Puntuación media', value: avgRating.toFixed(1) + '/3', emoji: '⭐' },
              { label: 'Favorita', value: topDef?.emoji ?? '—', emoji: '' },
            ].map(({ label, value, emoji }) => (
              <div key={label} className="rounded-2xl border border-white/6 bg-white/2 p-3 text-center">
                <p className="text-xl">{emoji}</p>
                <p className="text-base font-bold text-white/80 mt-1">{value}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )

  // ── Tab: ACTIVIDADES ──────────────────────────────────────────────────────
  const renderActividades = () => (
    <div className="space-y-4">
      <input value={searchText} onChange={e => setSearchText(e.target.value)}
        className="w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-2.5 text-sm text-white/70 focus:outline-none focus:border-amber-500/30 placeholder-white/25"
        placeholder="🔍 Buscar actividad..." />

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {(['all', 'cognitivo', 'creativo', 'musical', 'motor', 'autonomia', 'vinculo', 'exterior'] as const).map(c => (
            <button key={c} onClick={() => setFilterCategory(c)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition ${filterCategory === c ? 'bg-amber-500 border-amber-500 text-black font-semibold' : 'border-white/10 text-white/50 hover:border-white/20'}`}>
              {c === 'all' ? 'Todas' : `${CATEGORY_META[c].emoji} ${CATEGORY_META[c].label}`}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(['all', 'interior', 'exterior'] as const).map(l => (
            <button key={l} onClick={() => setFilterLocation(l)}
              className={`text-xs px-3 py-1 rounded-full border transition ${filterLocation === l ? 'bg-white/15 border-white/30 text-white/80' : 'border-white/8 text-white/30 hover:border-white/15'}`}>
              {l === 'all' ? '🏠🌤️ Todas' : l === 'interior' ? '🏠 Interior' : '🌤️ Exterior'}
            </button>
          ))}
          {(['all', 'baja', 'media', 'alta'] as const).map(e => (
            <button key={e} onClick={() => setFilterEnergy(e)}
              className={`text-xs px-3 py-1 rounded-full border transition ${filterEnergy === e ? 'bg-white/15 border-white/30 text-white/80' : 'border-white/8 text-white/30 hover:border-white/15'}`}>
              {e === 'all' ? 'Energía' : e === 'baja' ? '🌙' : e === 'media' ? '🌀' : '⚡'}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-white/30">{filteredActivities.length} actividades</p>

      <div className="grid grid-cols-1 gap-3">
        {(showMoreActivities ? filteredActivities : filteredActivities.slice(0, 8)).map(a => {
          const timesPlayed = activityLogs.filter(l => l.activityId === a.id).length
          const avg = avgRatings[a.id]
          return (
            <div key={a.id} className="relative">
              {timesPlayed > 0 && (
                <div className="absolute top-3 right-10 z-10 flex items-center gap-1">
                  <span className="text-[10px] text-white/30">{timesPlayed}x</span>
                  {avg !== undefined && <span className="text-[10px] text-amber-400">{RATING_EMOJIS[Math.round(avg) as 0|1|2|3]?.emoji}</span>}
                </div>
              )}
              <ActivityCard activity={a} onLog={setLogActivity} onDetail={setDetailActivity} />
            </div>
          )
        })}
      </div>
      {filteredActivities.length > 8 && (
        <button onClick={() => setShowMoreActivities(v => !v)}
          className="w-full rounded-2xl border border-white/10 py-3 text-sm text-white/50 hover:bg-white/5 transition">
          {showMoreActivities ? 'Ver menos' : `Ver ${filteredActivities.length - 8} más`}
        </button>
      )}
    </div>
  )

  // ── Tab: HITOS ────────────────────────────────────────────────────────────
  const renderHitos = () => {
    const inProgress = KIRA_MILESTONES_DEF.filter(m => getMilestoneStatus(m, age.totalMonths, achievedIds) === 'inprogress')
    const upcoming = KIRA_MILESTONES_DEF.filter(m => getMilestoneStatus(m, age.totalMonths, achievedIds) === 'upcoming')
    const achieved = KIRA_MILESTONES_DEF.filter(m => getMilestoneStatus(m, age.totalMonths, achievedIds) === 'achieved')

    const areaEmoji: Record<string, string> = {
      motor: '🏃', lenguaje: '💬', cognitivo: '🧠', social: '👫', autonomia: '🌱',
    }

    const MilestoneCard = ({ m, status }: { m: typeof KIRA_MILESTONES_DEF[0]; status: string }) => {
      const relatedActs = m.relatedActivities.map(id => KIRA_ACTIVITIES.find(a => a.id === id)).filter(Boolean) as KiraActivityDef[]
      return (
        <div className={`rounded-2xl border p-4 ${
          status === 'inprogress' ? 'border-amber-400/30 bg-amber-400/5' :
          status === 'achieved' ? 'border-green-500/20 bg-green-500/5' :
          'border-white/8 bg-white/2'
        }`}>
          <div className="flex items-start gap-3 mb-2">
            <span className="text-2xl">{areaEmoji[m.area] ?? '⭐'}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white/90">{m.title}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  status === 'inprogress' ? 'bg-amber-400/20 text-amber-300' :
                  status === 'achieved' ? 'bg-green-500/20 text-green-300' :
                  'bg-white/8 text-white/30'
                }`}>
                  {status === 'achieved' ? '✅ Conseguido' : status === 'inprogress' ? '🔄 En proceso' : '⏳ Próximo'}
                </span>
              </div>
              <p className="text-xs text-white/40 mt-0.5">{m.ageMonths} meses · {m.area}</p>
            </div>
          </div>
          <p className="text-xs text-white/55 mb-2 leading-relaxed">{m.description}</p>
          <p className="text-xs text-violet-300/70 italic mb-3">{m.importance}</p>
          {relatedActs.length > 0 && (
            <div>
              <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1.5">Actividades que lo trabajan</p>
              <div className="flex flex-wrap gap-1.5">
                {relatedActs.map(a => (
                  <button key={a.id} onClick={() => setDetailActivity(a)}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-amber-400/20 text-amber-300/70 hover:bg-amber-400/10 transition">
                    {a.emoji} {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {status === 'inprogress' && (
            <button onClick={async () => { await addKiraAchievedMilestone(m.id, todayStr()) }}
              className="mt-3 w-full rounded-xl bg-amber-500/20 border border-amber-500/30 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition">
              🎉 ¡Lo ha conseguido!
            </button>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-center">
          <p className="text-xs text-amber-400/70 uppercase tracking-widest">Edad actual</p>
          <p className="text-2xl font-bold text-white/90 mt-1">{age.years} años y {age.months} meses</p>
          <p className="text-xs text-white/30 mt-0.5">{age.totalMonths} meses totales</p>
        </div>

        {inProgress.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-amber-400/70 mb-3">🔄 En proceso ahora</p>
            <div className="space-y-3">{inProgress.map(m => <MilestoneCard key={m.id} m={m} status="inprogress" />)}</div>
          </div>
        )}
        {upcoming.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/30 mb-3">⏳ Próximos hitos (6 meses)</p>
            <div className="space-y-3">{upcoming.map(m => <MilestoneCard key={m.id} m={m} status="upcoming" />)}</div>
          </div>
        )}
        {achieved.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-green-400/50 mb-3">✅ Ya conseguidos</p>
            <div className="space-y-3">{achieved.map(m => <MilestoneCard key={m.id} m={m} status="achieved" />)}</div>
          </div>
        )}
      </div>
    )
  }

  // ── Tab: DIARIO ───────────────────────────────────────────────────────────
  const renderDiario = () => (
    <div className="space-y-5">
      <div className="flex gap-2">
        <button onClick={() => setShowPhrasesOnly(false)}
          className={`flex-1 rounded-2xl py-2 text-xs font-medium border transition ${!showPhrasesOnly ? 'bg-amber-500/15 border-amber-400/30 text-amber-300' : 'border-white/8 text-white/40 hover:bg-white/5'}`}>
          📖 Diario
        </button>
        <button onClick={() => setShowPhrasesOnly(true)}
          className={`flex-1 rounded-2xl py-2 text-xs font-medium border transition ${showPhrasesOnly ? 'bg-amber-500/15 border-amber-400/30 text-amber-300' : 'border-white/8 text-white/40 hover:bg-white/5'}`}>
          💬 Frases de Kira ({kiraPhrasesAll.length})
        </button>
      </div>

      <button onClick={() => setShowDiaryForm(true)}
        className="w-full rounded-2xl border border-amber-400/20 bg-amber-400/5 py-3 text-sm text-amber-300 font-medium hover:bg-amber-400/10 transition flex items-center justify-center gap-2">
        <span>✍️</span> Nueva entrada del diario
      </button>

      {!showPhrasesOnly ? (
        diaryEntries.length === 0 ? (
          <div className="text-center py-8 text-white/30 text-sm">
            <p className="text-3xl mb-2">📖</p>
            <p>Aún no hay entradas en el diario</p>
            <p className="text-xs mt-1">Registra vuestros momentos especiales</p>
          </div>
        ) : (
          <div className="space-y-4">
            {diaryEntries.map(entry => (
              <motion.div key={entry.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-white/8 bg-[#1A1710] p-4 group">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-[10px] text-white/30 uppercase tracking-widest">{entry.date}</p>
                    {entry.activityName && (
                      <p className="text-xs text-amber-400/70 mt-0.5">🎯 {entry.activityName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg" title="Kira">{MOOD_EMOJIS[entry.kiraMood]}</span>
                    <span className="text-lg" title="Daniel">{MOOD_EMOJIS[entry.danielMood]}</span>
                    <button onClick={() => deleteKiraDiaryEntry(entry.id)}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition">
                      <X size={10} className="text-red-400" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-white/70 leading-relaxed">{entry.notes}</p>
                {entry.kiraPhrase && (
                  <div className="mt-3 rounded-xl bg-violet-500/10 border border-violet-500/20 px-3 py-2">
                    <p className="text-[10px] text-violet-400/60 uppercase tracking-widest mb-1">Kira dijo...</p>
                    <p className="text-sm text-violet-200 italic">"{entry.kiraPhrase}"</p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )
      ) : (
        kiraPhrasesAll.length === 0 ? (
          <div className="text-center py-8 text-white/30 text-sm">
            <p className="text-3xl mb-2">💬</p>
            <p>Aún no hay frases guardadas</p>
            <p className="text-xs mt-1">Guarda las cosas graciosas que dice Kira</p>
          </div>
        ) : (
          <div className="space-y-3">
            {kiraPhrasesAll.map(({ phrase, date, id }) => (
              <motion.div key={id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
                <p className="text-xs text-violet-400/50 mb-1.5">{date}</p>
                <p className="text-base text-violet-100 italic font-medium">"{phrase}"</p>
                <p className="text-xs text-violet-400/40 mt-1">— Kira, {age.years} años</p>
              </motion.div>
            ))}
          </div>
        )
      )}

      {/* Diary form modal */}
      <AnimatePresence>
        {showDiaryForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowDiaryForm(false)}>
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              className="w-full max-w-md rounded-3xl border border-white/10 bg-[#1A1710] p-6 max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <p className="font-semibold text-white/90">✍️ Nueva entrada</p>
                <button onClick={() => setShowDiaryForm(false)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center"><X size={14} className="text-white/50" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">Actividad (opcional)</p>
                  <input value={diaryActivityName} onChange={e => setDiaryActivityName(e.target.value)}
                    className="w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-2.5 text-sm text-white/70 focus:outline-none"
                    placeholder="¿Qué hicisteis?" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">¿Qué pasó hoy?</p>
                  <textarea value={diaryNotes} onChange={e => setDiaryNotes(e.target.value)} rows={3}
                    className="w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-2.5 text-sm text-white/70 focus:outline-none resize-none"
                    placeholder="Cuéntame cómo fue..." />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">💬 Frase de Kira (opcional)</p>
                  <input value={diaryKiraPhrase} onChange={e => setDiaryKiraPhrase(e.target.value)}
                    className="w-full rounded-2xl bg-white/5 border border-violet-500/20 px-4 py-2.5 text-sm text-violet-200/80 focus:outline-none"
                    placeholder="Una cosa que dijo Kira hoy..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">Estado de Kira</p>
                    <div className="flex gap-1">
                      {([1,2,3,4,5] as const).map(v => (
                        <button key={v} onClick={() => setDiaryKiraMood(v)}
                          className={`flex-1 rounded-xl py-1.5 text-sm border transition ${diaryKiraMood === v ? 'border-amber-400 bg-amber-400/10' : 'border-white/8 hover:bg-white/5'}`}>
                          {MOOD_EMOJIS[v]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">Estado de Daniel</p>
                    <div className="flex gap-1">
                      {([1,2,3,4,5] as const).map(v => (
                        <button key={v} onClick={() => setDiaryDanielMood(v)}
                          className={`flex-1 rounded-xl py-1.5 text-sm border transition ${diaryDanielMood === v ? 'border-amber-400 bg-amber-400/10' : 'border-white/8 hover:bg-white/5'}`}>
                          {MOOD_EMOJIS[v]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <button onClick={handleDiarySave} disabled={!diaryNotes.trim()}
                  className="w-full rounded-2xl bg-amber-500 py-3 font-semibold text-black text-sm hover:bg-amber-400 transition disabled:opacity-40">
                  Guardar entrada 💛
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )

  // ── Tab: IA ───────────────────────────────────────────────────────────────
  const renderIA = () => (
    <div className="flex flex-col gap-4">
      {!hasAnyAIKey() && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-300/70">
          ⚠️ Configura una API key de Gemini o Groq en Ajustes para usar el coach parental.
        </div>
      )}

      {aiMessages.length === 0 && (
        <div>
          <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Preguntas sugeridas</p>
          <div className="flex flex-col gap-2">
            {SUGGESTED_QUESTIONS.map(q => (
              <button key={q} onClick={() => handleAiSend(q)}
                className="text-left rounded-2xl border border-white/8 bg-white/2 px-4 py-3 text-sm text-white/60 hover:bg-white/5 hover:border-amber-400/20 hover:text-white/80 transition">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 min-h-25">
        {aiMessages.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-amber-500/15 border border-amber-400/20 text-amber-100 ml-8'
                : 'bg-white/5 border border-white/8 text-white/75 mr-8'
            }`}>
            {m.role === 'assistant' && <p className="text-[10px] text-violet-400/60 uppercase tracking-widest mb-1.5">Coach parental</p>}
            {m.content}
          </motion.div>
        ))}
        {aiLoading && (
          <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 mr-8">
            <div className="flex gap-1.5">
              {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-amber-400/50 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-auto">
        <input value={aiInput} onChange={e => setAiInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAiSend(aiInput)}
          className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/80 focus:outline-none focus:border-amber-500/40 placeholder-white/25"
          placeholder="Pregúntame sobre Kira..." />
        <button onClick={() => handleAiSend(aiInput)} disabled={!aiInput.trim() || aiLoading}
          className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center hover:bg-amber-400 transition disabled:opacity-40">
          <Send size={14} className="text-black" />
        </button>
      </div>
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto px-4 pb-24">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="py-6 text-center">
        <div className="relative inline-block mb-3">
          <div className="w-20 h-20 rounded-full bg-linear-to-br from-amber-400 to-violet-500 flex items-center justify-center shadow-xl shadow-amber-500/20">
            <span className="text-4xl">👧</span>
          </div>
          {todayIsKiraDay && (
            <span className="absolute -top-1 -right-1 text-lg animate-pulse">✨</span>
          )}
        </div>
        <h1 className="text-4xl font-bold bg-linear-to-r from-amber-400 to-violet-400 bg-clip-text text-transparent tracking-tight">
          Kira
        </h1>
        <p className="text-sm text-white/50 mt-1">
          {age.years} años y {age.months} meses
        </p>
        <div className="flex items-center justify-center gap-4 mt-2 text-xs text-white/30">
          <span>🎂 Cumple en {birthdayCountdown} días</span>
          {todayIsKiraDay && <span className="text-amber-400">⭐ Día de Kira</span>}
        </div>
        <p className="mt-3 text-xs text-violet-300/60 italic px-6 leading-relaxed">
          "{getDailyPhrase()}"
        </p>
      </motion.div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 rounded-2xl bg-white/4 border border-white/6 p-1">
        {([
          ['hoy', '🏠', 'Hoy'],
          ['actividades', '🎯', 'Banco'],
          ['hitos', '🌟', 'Hitos'],
          ['diario', '📖', 'Diario'],
          ['ia', '🤖', 'IA'],
        ] as [Tab, string, string][]).map(([id, emoji, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] font-medium transition ${
              tab === id ? 'bg-amber-500 text-black shadow-sm' : 'text-white/40 hover:text-white/60'
            }`}>
            <span className="text-base">{emoji}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}>
          {tab === 'hoy' && renderHoy()}
          {tab === 'actividades' && renderActividades()}
          {tab === 'hitos' && renderHitos()}
          {tab === 'diario' && renderDiario()}
          {tab === 'ia' && renderIA()}
        </motion.div>
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {logActivity && (
          <LogModal
            activity={logActivity}
            onClose={() => setLogActivity(null)}
            onSave={(r, d, n) => handleLog(logActivity, r, d, n)}
          />
        )}
        {detailActivity && (
          <ActivityDetail
            activity={detailActivity}
            onClose={() => setDetailActivity(null)}
            onLog={() => { setLogActivity(detailActivity); setDetailActivity(null) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
