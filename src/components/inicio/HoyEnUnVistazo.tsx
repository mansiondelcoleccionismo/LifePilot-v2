import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { UserProfile } from '@/types/profile'
import type { PasosDia } from '@/hooks/usePasos'
import type { DiaryEntry } from '@/types/diary'

const STEPS_GOAL = 10_000
const MOOD_EMOJI: Record<number, string> = { 1: '😔', 2: '😐', 3: '🙂', 4: '😊', 5: '🤩' }

interface Props {
  pasosHoy: number | null
  historicoSemanal: PasosDia[]
  caloriasHoy: number
  kcalTarget: number
  proteinaHoy: number
  proteinaTarget: number
  todayMood: number | null
  diaryEntries: DiaryEntry[]
  profile: UserProfile
  dayKind: string
  todayStr: string
}

function getLastWorkout(profile: UserProfile): { when: string; type: string } | null {
  const allDows = [...new Set([...profile.trainingDays, ...profile.padelDays])]
  for (let i = 1; i <= 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const dow = d.getDay()
    if (allDows.includes(dow)) {
      const isPesas = profile.trainingDays.includes(dow)
      const isPadel = profile.padelDays.includes(dow)
      const type = isPesas && isPadel ? 'pesas + pádel' : isPesas ? 'pesas' : 'pádel'
      const when = i === 1 ? 'ayer' : i === 2 ? 'hace 2 días' : `hace ${i} días`
      return { when, type }
    }
  }
  return null
}

function getNextWorkout(profile: UserProfile): { when: string; type: string } | null {
  const todayDow = new Date().getDay()
  const allDows = [...new Set([...profile.trainingDays, ...profile.padelDays])]
  for (let i = 0; i <= 7; i++) {
    const dow = (todayDow + i) % 7
    if (allDows.includes(dow)) {
      const isPesas = profile.trainingDays.includes(dow)
      const isPadel = profile.padelDays.includes(dow)
      const type = isPesas && isPadel ? 'pesas + pádel' : isPesas ? 'pesas' : 'pádel'
      const when = i === 0 ? 'hoy' : i === 1 ? 'mañana' : `en ${i} días`
      return { when, type }
    }
  }
  return null
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1 rounded-full bg-white/8 overflow-hidden mt-2">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, pct)}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className={`h-full rounded-full ${color}`}
      />
    </div>
  )
}

export function HoyEnUnVistazo({
  pasosHoy, historicoSemanal,
  caloriasHoy, kcalTarget,
  proteinaHoy, proteinaTarget,
  todayMood, diaryEntries,
  profile, todayStr,
}: Props) {
  const ayerStr = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  }, [])

  const pasosAyer = useMemo(
    () => historicoSemanal.find(d => d.fecha === ayerStr)?.pasos ?? null,
    [historicoSemanal, ayerStr],
  )

  const stepsDiff = pasosHoy !== null && pasosAyer !== null ? pasosHoy - pasosAyer : null
  const stepsPct  = pasosHoy ? Math.min(100, (pasosHoy / STEPS_GOAL) * 100) : 0
  const stepsColor = !pasosHoy ? 'bg-white/10'
    : pasosHoy >= STEPS_GOAL ? 'bg-emerald-500'
    : pasosHoy >= 7000       ? 'bg-blue-500'
    : pasosHoy >= 4000       ? 'bg-amber-500'
    : 'bg-rose-500'
  const stepsText = !pasosHoy ? 'text-white/30'
    : pasosHoy >= STEPS_GOAL ? 'text-emerald-400'
    : pasosHoy >= 7000       ? 'text-blue-400'
    : pasosHoy >= 4000       ? 'text-amber-400'
    : 'text-rose-400'

  const kcalPct     = kcalTarget > 0 ? Math.min(100, (caloriasHoy / kcalTarget) * 100) : 0
  const proteinPct  = proteinaTarget > 0 ? Math.round((proteinaHoy / proteinaTarget) * 100) : 0
  const kcalColor   = kcalPct >= 80 ? 'bg-emerald-500' : kcalPct >= 50 ? 'bg-amber-500' : 'bg-rose-500'

  const moodTrend = useMemo(() => {
    const last7 = [...diaryEntries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7)
    if (last7.length < 4) return null
    const recent = last7.slice(0, 3).map(e => e.mood)
    const older  = last7.slice(3).map(e => e.mood)
    const ra = recent.reduce((s, v) => s + v, 0) / recent.length
    const oa = older.reduce((s,  v) => s + v, 0) / older.length
    return ra - oa > 0.3 ? '↑' : ra - oa < -0.3 ? '↓' : '→'
  }, [diaryEntries])

  const moodAyer = useMemo(
    () => diaryEntries.find(d => d.date === ayerStr)?.mood ?? null,
    [diaryEntries, ayerStr],
  )
  const displayMood = todayMood ?? moodAyer

  const lastWorkout = useMemo(() => getLastWorkout(profile), [profile])
  const nextWorkout = useMemo(() => getNextWorkout(profile), [profile])

  const cells = [
    {
      icon: '🚶',
      label: 'Pasos hoy',
      value: pasosHoy !== null
        ? <span className={`text-2xl font-bold tabular-nums ${stepsText}`}>{pasosHoy.toLocaleString('es-ES')}</span>
        : <span className="text-xl font-bold text-white/20">—</span>,
      goal: `/ ${STEPS_GOAL.toLocaleString('es-ES')}`,
      bar: <Bar pct={stepsPct} color={stepsColor} />,
      sub: stepsDiff !== null
        ? <span className={stepsDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            {stepsDiff >= 0 ? '↑' : '↓'} {Math.abs(stepsDiff).toLocaleString('es-ES')} vs ayer
          </span>
        : pasosHoy === null
          ? <span className="text-white/25">Sin datos aún</span>
          : <span className="text-white/30">Sin dato de ayer</span>,
    },
    {
      icon: '🍽️',
      label: 'Calorías',
      value: <span className="text-2xl font-bold tabular-nums text-white/80">{Math.round(caloriasHoy).toLocaleString('es-ES')}</span>,
      goal: `/ ${kcalTarget.toLocaleString('es-ES')} kcal`,
      bar: <Bar pct={kcalPct} color={kcalColor} />,
      sub: proteinaTarget > 0
        ? proteinPct < 60
          ? <span className="text-amber-400">⚠️ Proteína al {proteinPct}%</span>
          : proteinPct >= 85
            ? <span className="text-emerald-400">✓ Proteína al {proteinPct}%</span>
            : <span className="text-white/35">Proteína al {proteinPct}%</span>
        : null,
    },
    {
      icon: '💪',
      label: 'Entreno',
      value: lastWorkout
        ? <span className="text-base font-semibold text-white/80">✓ {lastWorkout.when}</span>
        : <span className="text-base font-semibold text-white/30">Sin dato</span>,
      goal: lastWorkout ? `(${lastWorkout.type})` : '',
      bar: null,
      sub: nextWorkout
        ? <span className="text-white/35">Próximo: {nextWorkout.when} ({nextWorkout.type})</span>
        : null,
    },
    {
      icon: '😊',
      label: displayMood !== null ? (todayMood ? 'Mood hoy' : 'Mood ayer') : 'Mood',
      value: displayMood !== null
        ? <span className="text-2xl">{MOOD_EMOJI[displayMood]} <span className="text-base font-bold text-white/70">{displayMood}/5</span></span>
        : <span className="text-xl font-bold text-white/20">—</span>,
      goal: '',
      bar: null,
      sub: moodTrend
        ? <span className={moodTrend === '↑' ? 'text-emerald-400' : moodTrend === '↓' ? 'text-rose-400' : 'text-white/35'}>
            Tendencia 7d: {moodTrend}
          </span>
        : <span className="text-white/25">Sin suficientes datos</span>,
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.28 }}
      className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
    >
      <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-4">
        Hoy en un vistazo
      </p>
      <div className="grid grid-cols-2 gap-x-5 gap-y-5">
        {cells.map((cell, i) => (
          <div key={i} className="space-y-0.5">
            <p className="text-[10px] text-white/30">{cell.icon} {cell.label}</p>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              {cell.value}
              {cell.goal && <span className="text-xs text-white/30">{cell.goal}</span>}
            </div>
            {cell.bar}
            {cell.sub && <p className="text-[11px] pt-1">{cell.sub}</p>}
          </div>
        ))}
      </div>
    </motion.div>
  )
}
