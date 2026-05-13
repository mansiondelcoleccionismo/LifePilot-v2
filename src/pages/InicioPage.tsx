import { useEffect, useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Loader2, ChevronRight, Check } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useTasks } from '@/hooks/useTasks'
import { useWeights } from '@/features/health/useWeights'
import { subscribeNutritionEntries } from '@/services/nutrition.service'
import {
  subscribeMedications, subscribeDayLogs, toggleMedicationTaken,
} from '@/services/medication.service'
import { toggleTask } from '@/services/tasks.service'
import {
  fetchICalEvents, getTodayICalEvents, getLastSyncTime, type ICalEvent,
} from '@/services/ical.service'
import { callAI, hasAnyAIKey } from '@/services/ai.service'
import { getWeatherToday, type WeatherData } from '@/services/weather.service'
import { loadProfile, getDayKind, getTargetForDay } from '@/services/metabolic.service'
import { subscribeDiaryEntries } from '@/services/diary.service'
import type { FoodEntry } from '@/types/nutrition'
import type { Medication, MedicationLog } from '@/types/medication'
import type { DiaryEntry } from '@/types/diary'

// ── Constants ────────────────────────────────────────────────────────────────

const KIRA_DAYS = [2, 4] // Tuesday, Thursday

const MOOD_EMOJI: Record<number, string> = { 1: '😔', 2: '😐', 3: '🙂', 4: '😊', 5: '🤩' }

// ── Helpers ──────────────────────────────────────────────────────────────────

function Skel({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/6 ${className}`} />
}

function PageSkeleton() {
  return (
    <div className="px-4 pb-28 pt-5 md:px-6 max-w-5xl mx-auto space-y-5">
      <Skel className="h-56 rounded-3xl" />
      <div className="grid md:grid-cols-2 gap-4">
        <Skel className="h-36" />
        <Skel className="h-36" />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => <Skel key={i} className="h-44" />)}
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function InicioPage() {
  const navigate  = useNavigate()
  const { user }  = useAuthStore()
  const firstName = 'Dani'

  // ── Time (frozen at render) ───────────────────────────────────────────────
  const todayStr  = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const monthKey  = useMemo(() => new Date().toISOString().slice(0, 7), [])
  const hour      = new Date().getHours()
  const dow       = new Date().getDay()
  const dateLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const greeting  = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'

  // ── Kira logic ────────────────────────────────────────────────────────────
  const isKiraDay     = KIRA_DAYS.includes(dow)
  const isKiraEvening = hour >= 16
  const showKiraCard  = isKiraDay || isKiraEvening

  // ── Profile + day kind ────────────────────────────────────────────────────
  const profile     = useMemo(() => loadProfile(), [])
  const dayKind     = useMemo(() => getDayKind(profile), [profile])
  const todayTarget = useMemo(() => getTargetForDay(profile), [profile])

  const kcalTarget    = todayTarget?.kcal    ?? 2200
  const proteinTarget = todayTarget?.protein ?? 160
  const carbsTarget   = todayTarget?.carbs   ?? 220
  const fatTarget     = todayTarget?.fat     ?? 70

  // ── Hero theme ────────────────────────────────────────────────────────────
  const theme = useMemo(() => {
    if (isKiraDay && isKiraEvening) return {
      gradient: 'from-amber-950/50',
      badge:    'bg-amber-500/15 text-amber-300 border-amber-500/25',
      label:    '👧 Tarde con Kira',
    }
    const map = {
      training:       { gradient: 'from-blue-950/55',   badge: 'bg-blue-500/15 text-blue-300 border-blue-500/25',         label: '💪 Día de pesas' },
      padel:          { gradient: 'from-emerald-950/55', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25', label: '🎾 Día de pádel' },
      padel_training: { gradient: 'from-teal-950/55',   badge: 'bg-teal-500/15 text-teal-300 border-teal-500/25',         label: '💪🎾 Pesas + Pádel' },
      rest:           { gradient: 'from-violet-950/55', badge: 'bg-violet-500/15 text-violet-300 border-violet-500/25',   label: '🛋️ Descanso' },
    }
    return map[dayKind]
  }, [dayKind, isKiraDay, isKiraEvening])

  // ── Firebase / async state ────────────────────────────────────────────────
  const { tasks, loading: tasksLoading } = useTasks()
  const { loadWeights, lastWeight }      = useWeights()

  const [nutritionEntries, setNutritionEntries] = useState<FoodEntry[]>([])
  const [medications, setMedications]           = useState<Medication[]>([])
  const [medLogs, setMedLogs]                   = useState<Record<string, MedicationLog>>({})
  const [diaryEntries, setDiaryEntries]         = useState<DiaryEntry[]>([])
  const [icalToday, setIcalToday]               = useState<ICalEvent[]>([])
  const [icalLoading, setIcalLoading]           = useState(false)
  const [icalSynced, setIcalSynced]             = useState<Date | null>(null)
  const [icalExpanded, setIcalExpanded]         = useState(false)
  const [weather, setWeather]                   = useState<WeatherData | null>(null)
  const [briefing, setBriefing]                 = useState('')
  const [briefingLoading, setBriefingLoading]   = useState(false)

  // ── Derived ───────────────────────────────────────────────────────────────
  const pendingTasks = useMemo(() => tasks.filter(t => !t.completed), [tasks])

  const todayNutrition = useMemo(() => nutritionEntries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.kcal,
      protein:  acc.protein  + e.protein,
      carbs:    acc.carbs    + e.carbs,
      fat:      acc.fat      + e.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  ), [nutritionEntries])

  const streak = useMemo(() => {
    if (!diaryEntries.length) return 0
    const dates = [...new Set(diaryEntries.map(e => e.date))].sort().reverse()
    if (!dates.includes(todayStr)) return 0
    let count = 0
    const cur = new Date(todayStr)
    while (dates.includes(cur.toISOString().slice(0, 10))) {
      count++
      cur.setDate(cur.getDate() - 1)
    }
    return count
  }, [diaryEntries, todayStr])

  const todayMood = useMemo(
    () => diaryEntries.find(e => e.date === todayStr)?.mood ?? null,
    [diaryEntries, todayStr],
  )

  const medsTaken = Object.values(medLogs).filter(l => l.taken).length
  const medsTotal = medications.length
  const allTaken  = medsTotal > 0 && medsTaken === medsTotal

  const kcalPct    = Math.min(100, (todayNutrition.calories / kcalTarget) * 100)
  const kcalColor  = kcalPct >= 80 ? 'text-emerald-400' : kcalPct >= 50 ? 'text-amber-400' : 'text-rose-400'
  const kcalBar    = kcalPct >= 80 ? 'bg-emerald-500'   : kcalPct >= 50 ? 'bg-amber-500'   : 'bg-rose-500'

  const metricPills = useMemo(() => {
    const pills: { emoji: string; text: string }[] = []
    if (lastWeight) pills.push({ emoji: '⚖️', text: `${lastWeight.weight} kg` })
    if (streak > 0) pills.push({ emoji: '🔥', text: `Racha ${streak} días` })
    if (todayMood)  pills.push({ emoji: MOOD_EMOJI[todayMood] ?? '😊', text: 'Mood hoy' })
    return pills
  }, [lastWeight, streak, todayMood])

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    loadWeights()
    getWeatherToday().then(setWeather)
    const u1 = subscribeNutritionEntries(setNutritionEntries)
    const u2 = subscribeMedications(setMedications)
    const u3 = subscribeDayLogs(todayStr, setMedLogs)
    const u4 = subscribeDiaryEntries(monthKey, setDiaryEntries)
    return () => { u1(); u2(); u3(); u4() }
  }, [todayStr, monthKey, loadWeights])

  const loadIcal = useCallback(async (force = false) => {
    setIcalLoading(true)
    try {
      await fetchICalEvents(force)
      setIcalToday(await getTodayICalEvents())
      setIcalSynced(getLastSyncTime())
    } catch {
      setIcalSynced(getLastSyncTime())
    } finally {
      setIcalLoading(false)
    }
  }, [])

  useEffect(() => {
    loadIcal()
    const id = setInterval(() => loadIcal(), 15 * 60_000)
    return () => clearInterval(id)
  }, [loadIcal])

  const fetchBriefing = useCallback(async () => {
    if (!hasAnyAIKey()) return
    setBriefingLoading(true)
    try {
      const weatherStr = weather
        ? ` Tiempo: ${weather.description}, ${weather.tempMax}°C, lluvia ${weather.precipitationProb}%.`
        : ''
      const prompt =
        `Eres el asistente personal de Daniel (35 años, recomposición corporal, pesas y pádel).` +
        ` Hoy: ${theme.label}.${weatherStr}` +
        ` Proteína consumida: ${Math.round(todayNutrition.protein)}g de ${proteinTarget}g objetivo.` +
        ` Tareas pendientes: ${pendingTasks.length}.` +
        ` Escribe 2-3 frases de briefing motivador y concreto para Daniel. Solo el texto, sin markdown.`
      const text = await callAI(prompt)
      setBriefing(text.trim())
    } catch { /* silent */ }
    finally { setBriefingLoading(false) }
  }, [weather, theme.label, todayNutrition.protein, proteinTarget, pendingTasks.length])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchBriefing() }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  if (tasksLoading) return <PageSkeleton />

  const displayIcal  = icalExpanded ? icalToday : icalToday.slice(0, 4)
  const hasMoreIcal  = icalToday.length > 4
  const displayTasks = pendingTasks.slice(0, 3)
  const hasMoreTasks = pendingTasks.length > 3

  return (
    <div className="px-4 pb-28 pt-5 md:px-6 lg:px-8 max-w-5xl mx-auto space-y-5">

      {/* ══════════════════════════════════════════════════════════════════
          ZONE 1 — HERO
          ══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`rounded-3xl border border-white/8 bg-linear-to-br ${theme.gradient} to-[#1E1E28] p-6`}
      >
        {/* Date + weather */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-white/40 capitalize">{dateLabel}</p>
          {weather && (
            <div className="flex items-center gap-1.5 text-sm text-white/55">
              <span className="text-base leading-none">{weather.emoji}</span>
              <span className="font-medium">{weather.tempMax}°C</span>
            </div>
          )}
        </div>

        {/* Greeting */}
        <h1 className="text-[2rem] font-bold text-white/90 tracking-tight leading-tight mb-3">
          {greeting}, {firstName}.
        </h1>

        {/* Day badge */}
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${theme.badge} mb-5`}>
          {theme.label}
        </span>

        {/* Briefing + refresh button */}
        <div className="relative pr-9">
          <button
            onClick={fetchBriefing}
            disabled={briefingLoading || !hasAnyAIKey()}
            className="absolute top-0 right-0 w-7 h-7 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition disabled:opacity-30"
            title="Regenerar briefing"
          >
            {briefingLoading
              ? <Loader2 size={12} className="animate-spin text-white/40" />
              : <RefreshCw size={12} className="text-white/40" />}
          </button>

          {briefingLoading ? (
            <div className="space-y-2">
              <Skel className="h-4 w-full" />
              <Skel className="h-4 w-5/6" />
              <Skel className="h-4 w-3/5" />
            </div>
          ) : briefing ? (
            <p className="text-[13.5px] leading-relaxed text-white/55">{briefing}</p>
          ) : !hasAnyAIKey() ? (
            <p className="text-xs text-white/30">Configura una clave de IA en Ajustes para ver el briefing.</p>
          ) : null}
        </div>

        {/* Rain warning */}
        {weather && weather.precipitationProb > 40 && (
          <div className={`mt-5 rounded-2xl px-4 py-2.5 flex items-center gap-2.5 border ${
            weather.precipitationProb > 70
              ? 'bg-rose-500/10 border-rose-500/20'
              : 'bg-amber-500/10 border-amber-500/20'
          }`}>
            <span className="text-sm shrink-0">⚠️</span>
            <p className={`text-xs ${weather.precipitationProb > 70 ? 'text-rose-300' : 'text-amber-300'}`}>
              Lluvia prevista ({weather.precipitationProb}%) — ajusta el plan de pádel
            </p>
          </div>
        )}
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════════
          ZONE 2 — ACCIÓN INMEDIATA
          ══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.07, duration: 0.28 }}
        className={`grid gap-4 ${showKiraCard ? 'md:grid-cols-2' : ''}`}
      >
        {/* Agenda iCloud */}
        <div className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-semibold text-white/80">📅 Hoy</span>
            {icalSynced && !icalLoading && (
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
            <button
              onClick={() => loadIcal(true)}
              disabled={icalLoading}
              className="ml-auto w-6 h-6 rounded-lg bg-white/4 hover:bg-white/8 flex items-center justify-center transition disabled:opacity-40"
            >
              <RefreshCw size={10} className={`text-white/40 ${icalLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {icalLoading && icalToday.length === 0 ? (
            <div className="space-y-2">
              <Skel className="h-10" />
              <Skel className="h-10" />
            </div>
          ) : icalToday.length === 0 ? (
            <p className="text-sm text-emerald-400/70">Sin eventos hoy ✓</p>
          ) : (
            <div className="space-y-1.5">
              {displayIcal.map(ev => {
                const time = ev.isAllDay
                  ? 'Todo el día'
                  : ev.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={ev.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/3 border border-white/5">
                    <span className="text-sm shrink-0">🍎</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate">{ev.title}</p>
                      {ev.location && (
                        <p className="text-[11px] text-white/35 truncate">{ev.location}</p>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-white/40 shrink-0">{time}</span>
                  </div>
                )
              })}
              {hasMoreIcal && !icalExpanded && (
                <button
                  onClick={() => setIcalExpanded(true)}
                  className="w-full py-1 text-xs text-white/30 hover:text-white/55 transition"
                >
                  Ver {icalToday.length - 4} más →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Kira card */}
        {showKiraCard && (
          <div className="rounded-2xl bg-amber-950/25 border border-amber-500/15 p-5 flex flex-col">
            <div className="flex-1">
              <p className="text-base font-semibold text-amber-300 mb-2">👧 Hoy tienes a Kira</p>
              <p className="text-[13px] text-white/40 leading-relaxed">
                {isKiraEvening && !isKiraDay
                  ? 'La tarde es un buen momento para estar juntos.'
                  : 'Planifica algo especial para el rato juntos.'}
              </p>
            </div>
            <button
              onClick={() => navigate('/kira')}
              className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 transition"
            >
              Ver actividades <ChevronRight size={12} />
            </button>
          </div>
        )}
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════════
          ZONE 3 — PROGRESO DEL DÍA
          ══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.13, duration: 0.28 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {/* Medicación */}
        <div className={`rounded-2xl border p-5 transition-colors duration-500 ${
          allTaken ? 'bg-emerald-950/20 border-emerald-500/15' : 'bg-[#1E1E28] border-white/8'
        }`}>
          <p className="text-sm font-semibold text-white/80 mb-4">💊 Medicación</p>

          {medsTotal === 0 ? (
            <p className="text-xs text-white/30">Sin medicamentos configurados</p>
          ) : (
            <>
              <div className="space-y-2.5 mb-4">
                {medications.map(med => {
                  const taken = medLogs[med.id]?.taken ?? false
                  return (
                    <button
                      key={med.id}
                      onClick={() => toggleMedicationTaken(med.id, todayStr)}
                      className="w-full flex items-center gap-2.5 text-left group"
                    >
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                        taken
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-white/20 group-hover:border-emerald-500/50'
                      }`}>
                        {taken && <Check size={11} className="text-white" strokeWidth={3} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate transition-colors ${
                          taken ? 'line-through text-white/25' : 'text-white/70'
                        }`}>
                          {med.name}
                        </p>
                        <p className="text-[10px] text-white/30">{med.time} · {med.dose}{med.unit}</p>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <motion.div
                    animate={{ width: `${medsTotal > 0 ? (medsTaken / medsTotal) * 100 : 0}%` }}
                    transition={{ duration: 0.5 }}
                    className="h-full rounded-full bg-emerald-500"
                  />
                </div>
                <span className="text-[10px] text-white/30 shrink-0">
                  {allTaken ? '✓ Todo tomado' : `${medsTaken}/${medsTotal}`}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Macros */}
        <button
          onClick={() => navigate('/nutricion')}
          className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5 text-left hover:bg-white/2 transition"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-white/80">🥗 Macros</p>
            <span className={`text-xs font-medium ${kcalColor}`}>
              {Math.round(todayNutrition.calories)} / {kcalTarget} kcal
            </span>
          </div>

          <div className="h-2 rounded-full bg-white/6 overflow-hidden mb-4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${kcalPct}%` }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className={`h-full rounded-full ${kcalBar}`}
            />
          </div>

          <div className="flex gap-2">
            {[
              { label: 'P', value: Math.round(todayNutrition.protein), target: proteinTarget, color: 'text-blue-400' },
              { label: 'C', value: Math.round(todayNutrition.carbs),   target: carbsTarget,   color: 'text-amber-400' },
              { label: 'G', value: Math.round(todayNutrition.fat),     target: fatTarget,     color: 'text-rose-400' },
            ].map(m => (
              <div key={m.label} className="flex-1 rounded-xl bg-white/4 px-2 py-2 text-center">
                <p className={`text-sm font-semibold ${m.color}`}>{m.value}g</p>
                <p className="text-[10px] text-white/25">{m.label} /{m.target}g</p>
              </div>
            ))}
          </div>
        </button>

        {/* Tareas */}
        <div className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-white/80">✅ Tareas</p>
            {pendingTasks.length > 0 && (
              <span className="text-xs text-white/35">{pendingTasks.length} pendientes</span>
            )}
          </div>

          {pendingTasks.length === 0 ? (
            <p className="text-sm text-emerald-400/80">🎉 ¡Todo listo!</p>
          ) : (
            <>
              <div className="space-y-2.5">
                {displayTasks.map(task => (
                  <button
                    key={task.id}
                    onClick={() => toggleTask(task.id, true)}
                    className="w-full flex items-center gap-2.5 text-left group"
                  >
                    <div className="w-4 h-4 rounded-full border border-white/20 group-hover:border-emerald-500/60 transition-colors shrink-0" />
                    <span className="text-sm text-white/65 truncate flex-1 group-hover:text-white/85 transition-colors">
                      {task.title}
                    </span>
                  </button>
                ))}
              </div>

              {hasMoreTasks && (
                <button
                  onClick={() => navigate('/tareas')}
                  className="mt-3 flex items-center gap-1 text-xs text-white/30 hover:text-white/55 transition"
                >
                  Ver todas <ChevronRight size={11} />
                </button>
              )}
            </>
          )}
        </div>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════════
          ZONE 4 — MÉTRICAS (solo si hay datos reales)
          ══════════════════════════════════════════════════════════════ */}
      {metricPills.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.19, duration: 0.28 }}
          className="flex gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {metricPills.map((pill, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/5 border border-white/8 shrink-0"
            >
              <span className="text-sm leading-none">{pill.emoji}</span>
              <span className="text-xs font-medium text-white/65">{pill.text}</span>
            </div>
          ))}
        </motion.div>
      )}

    </div>
  )
}
