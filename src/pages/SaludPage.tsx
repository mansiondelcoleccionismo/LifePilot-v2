import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { PageHeader } from '@/components/layout/PageContainer'
import { Loader2, Smartphone } from 'lucide-react'
import {
  type HealthData,
  getHealthData,
  getLastNDays,
  saveHealthData,
  calcSleepTotal,
} from '@/services/health.service'
import { patchContext } from '@/services/context.service'
import { notifyOnce } from '@/services/notification.service'
import { usePasos } from '@/hooks/usePasos'

// ── Constants ─────────────────────────────────────────────────────────────────

type SleepQuality = 'mala' | 'regular' | 'buena' | 'excelente'

const QUALITY_OPTIONS: { value: SleepQuality; label: string; emoji: string }[] = [
  { value: 'mala',      label: 'Mala',      emoji: '😴' },
  { value: 'regular',   label: 'Regular',   emoji: '🌙' },
  { value: 'buena',     label: 'Buena',     emoji: '⭐' },
  { value: 'excelente', label: 'Excelente', emoji: '✨' },
]

const STEPS_GOAL = 10_000

// ── Color helpers ─────────────────────────────────────────────────────────────

function stepsBarColor(steps?: number | null) {
  if (!steps) return 'bg-white/8'
  if (steps >= STEPS_GOAL) return 'bg-emerald-500'
  if (steps >= 7000)       return 'bg-blue-500'
  if (steps >= 4000)       return 'bg-amber-500'
  return 'bg-rose-500'
}

function stepsTextColor(steps?: number | null) {
  if (!steps) return 'text-white/25'
  if (steps >= STEPS_GOAL) return 'text-emerald-400'
  if (steps >= 7000)       return 'text-blue-400'
  if (steps >= 4000)       return 'text-amber-400'
  return 'text-rose-400'
}

// ── SVG Charts ────────────────────────────────────────────────────────────────

function StepsBarChart({ days }: { days: Array<{ label: string; steps?: number | null }> }) {
  const W = 280, H = 90, PB = 22
  const plotH  = H - PB
  const n      = days.length
  const maxVal = Math.max(STEPS_GOAL, ...days.map(d => d.steps ?? 0))
  const slotW  = W / n
  const barW   = Math.floor(slotW * 0.58)
  const goalY  = plotH * (1 - STEPS_GOAL / maxVal)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
      {/* Goal line */}
      <line x1={0} x2={W} y1={goalY} y2={goalY}
        stroke="#ffffff12" strokeWidth={1} strokeDasharray="3,3" />
      <text x={W - 2} y={goalY - 3} textAnchor="end"
        fill="#ffffff20" fontSize={7} fontFamily="sans-serif">10k</text>

      {days.map((d, i) => {
        const barH = d.steps ? Math.max(4, (d.steps / maxVal) * plotH) : 4
        const x    = slotW * i + (slotW - barW) / 2
        const fill = !d.steps
          ? '#ffffff08'
          : d.steps >= STEPS_GOAL ? '#10b981'
          : d.steps >= 7000       ? '#3b82f6'
          : d.steps >= 4000       ? '#f59e0b'
          : '#ef4444'
        const isToday = i === n - 1
        return (
          <g key={i}>
            <rect x={x} y={plotH - barH} width={barW} height={barH}
              rx={3} fill={fill} opacity={isToday ? 1 : 0.7} />
            {isToday && d.steps && (
              <text x={slotW * i + slotW / 2} y={plotH - barH - 4}
                textAnchor="middle" fill={fill} fontSize={7} fontFamily="sans-serif" fontWeight="600">
                {d.steps >= 1000 ? `${(d.steps / 1000).toFixed(1)}k` : d.steps}
              </text>
            )}
            <text x={slotW * i + slotW / 2} y={H - 5}
              textAnchor="middle" fill={isToday ? '#ffffff60' : '#ffffff25'}
              fontSize={8} fontFamily="sans-serif" fontWeight={isToday ? '600' : '400'}>
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function SleepLineChart({ days }: { days: Array<{ label: string; sleepH?: number }> }) {
  const W = 280, H = 84, PB = 20
  const plotH = H - PB
  const maxH  = 10
  const n     = days.length
  const xOf   = (i: number) => n > 1 ? (i / (n - 1)) * W : W / 2

  const pts = days.map((d, i) => ({
    x: xOf(i),
    y: d.sleepH !== undefined ? plotH * (1 - Math.min(d.sleepH, maxH) / maxH) : null,
  }))

  const pathParts: string[] = []
  let pen = false
  for (const p of pts) {
    if (p.y === null) { pen = false; continue }
    pathParts.push(`${pen ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    pen = true
  }

  const targetY = plotH * (1 - 8 / maxH)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={0} x2={W} y1={targetY} y2={targetY}
        stroke="#ffffff10" strokeWidth={1} strokeDasharray="3,2" />
      {pathParts.length > 0 && (
        <path d={pathParts.join(' ')} fill="none" stroke="#6366f1"
          strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {pts.map((p, i) => p.y !== null && (
        <circle key={i} cx={p.x} cy={p.y!} r={2.5} fill="#6366f1" />
      ))}
      {days.map((d, i) => (
        <text key={i} x={xOf(i)} y={H - 4}
          textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
          fill="#ffffff30" fontSize={8} fontFamily="sans-serif">
          {d.label}
        </text>
      ))}
    </svg>
  )
}

// ── Ring progress ─────────────────────────────────────────────────────────────

function StepsRing({ steps, goal }: { steps: number | null; goal: number }) {
  const pct  = steps ? Math.min(1, steps / goal) : 0
  const R    = 42
  const circ = 2 * Math.PI * R
  const dash = circ * pct

  const color = !steps ? '#ffffff15'
    : steps >= goal ? '#10b981'
    : steps >= 7000 ? '#3b82f6'
    : steps >= 4000 ? '#f59e0b'
    : '#ef4444'

  return (
    <svg width={100} height={100} viewBox="0 0 100 100" className="shrink-0">
      <circle cx={50} cy={50} r={R} fill="none" stroke="#ffffff0c" strokeWidth={8} />
      <circle cx={50} cy={50} r={R} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease' }}
      />
      <text x={50} y={47} textAnchor="middle" fill={color}
        fontSize={14} fontWeight="700" fontFamily="sans-serif">
        {steps ? (steps >= 1000 ? `${(steps / 1000).toFixed(1)}k` : steps) : '—'}
      </text>
      <text x={50} y={60} textAnchor="middle" fill="#ffffff30"
        fontSize={8} fontFamily="sans-serif">pasos</text>
    </svg>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function SaludPage() {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Manual health data
  const [todayData, setTodayData] = useState<HealthData | null>(null)
  const [weekData,  setWeekData]  = useState<HealthData[]>([])
  const [loading,   setLoading]   = useState(true)

  // Apple Health steps (real-time via Shortcuts)
  const { pasosHoy, historicoSemanal, loading: pasosLoading } = usePasos()

  // Form state
  const [formSteps,   setFormSteps]   = useState('')
  const [formSleepH,  setFormSleepH]  = useState('')
  const [formSleepM,  setFormSleepM]  = useState('')
  const [formQuality, setFormQuality] = useState<SleepQuality>('buena')
  const [formWeight,  setFormWeight]  = useState('')
  const [formHR,      setFormHR]      = useState('')
  const [saving,      setSaving]      = useState(false)
  const [saveMsg,     setSaveMsg]     = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [today, week] = await Promise.all([getHealthData(todayStr), getLastNDays(7)])
        setTodayData(today)
        setWeekData(week)

        if (today) {
          if (today.steps        !== undefined) setFormSteps(String(today.steps))
          if (today.sleepHours   !== undefined) setFormSleepH(String(today.sleepHours))
          if (today.sleepMinutes !== undefined) setFormSleepM(String(today.sleepMinutes))
          if (today.sleepQuality)               setFormQuality(today.sleepQuality)
          if (today.weight       !== undefined) setFormWeight(String(today.weight))
          if (today.heartRateAvg !== undefined) setFormHR(String(today.heartRateAvg))
        }

        const withSteps = week.filter(d => d.steps !== undefined)
        const withSleep = week.filter(d => d.sleepHours !== undefined)
        patchContext({
          ...(today?.steps      !== undefined ? { todaySteps: today.steps }               : {}),
          ...(today?.sleepHours !== undefined ? { todaySleepHours: calcSleepTotal(today) } : {}),
          ...(today?.sleepQuality             ? { todaySleepQuality: today.sleepQuality }  : {}),
          ...(withSteps.length ? { weekStepsAvg: Math.round(withSteps.reduce((s, d) => s + (d.steps ?? 0), 0) / withSteps.length) } : {}),
          ...(withSleep.length ? { weekSleepAvg: parseFloat((withSleep.reduce((s, d) => s + calcSleepTotal(d), 0) / withSleep.length).toFixed(1)) } : {}),
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [todayStr])

  // 7-day arrays for charts
  const last7 = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const date  = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('es-ES', { weekday: 'short' }).slice(0, 3)
    const entry = weekData.find(w => w.date === date)
    return { date, label, steps: entry?.steps, sleepH: entry ? calcSleepTotal(entry) : undefined }
  }), [weekData])

  // Apple Health chart data — 7-day grid
  const appleChartDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const fecha = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('es-ES', { weekday: 'short' }).slice(0, 3)
    return { label, steps: historicoSemanal.find(h => h.fecha === fecha)?.pasos ?? null }
  }), [historicoSemanal])

  const appleWeekAvg = useMemo(() => {
    const valid = historicoSemanal.filter(d => d.pasos > 0)
    return valid.length ? Math.round(valid.reduce((s, d) => s + d.pasos, 0) / valid.length) : null
  }, [historicoSemanal])

  const weekStepsAvg = useMemo(() => {
    const v = last7.filter(d => d.steps !== undefined)
    return v.length ? Math.round(v.reduce((s, d) => s + (d.steps ?? 0), 0) / v.length) : undefined
  }, [last7])

  const weekSleepAvg = useMemo(() => {
    const v = last7.filter(d => d.sleepH !== undefined)
    return v.length ? parseFloat((v.reduce((s, d) => s + (d.sleepH ?? 0), 0) / v.length).toFixed(1)) : undefined
  }, [last7])

  const todaySleepH   = todayData ? calcSleepTotal(todayData) : 0
  const todayStepsPct = todayData?.steps ? Math.min(100, (todayData.steps / STEPS_GOAL) * 100) : 0

  async function handleSave() {
    const steps  = formSteps  ? parseInt(formSteps)                     : undefined
    const sleepH = formSleepH ? parseInt(formSleepH)                    : undefined
    const sleepM = formSleepM ? parseInt(formSleepM)                    : undefined
    const weight = formWeight ? parseFloat(formWeight.replace(',', '.')) : undefined
    const hr     = formHR     ? parseInt(formHR)                        : undefined

    if (steps === undefined && sleepH === undefined && weight === undefined) {
      setSaveMsg('Introduce al menos un dato.')
      return
    }

    setSaving(true)
    try {
      await saveHealthData({
        date: todayStr,
        ...(steps  !== undefined ? { steps }                 : {}),
        ...(sleepH !== undefined ? { sleepHours: sleepH }   : {}),
        ...(sleepM !== undefined ? { sleepMinutes: sleepM } : {}),
        sleepQuality: formQuality,
        ...(weight !== undefined ? { weight }                : {}),
        ...(hr     !== undefined ? { heartRateAvg: hr }     : {}),
        source:    'manual',
        createdAt: new Date(),
      })
      const updated = await getHealthData(todayStr)
      setTodayData(updated)
      if (steps !== undefined && steps >= STEPS_GOAL)
        notifyOnce('steps_goal', {
          title: '👟 ¡10.000 pasos conseguidos!',
          body: `${steps.toLocaleString('es-ES')} pasos hoy — objetivo alcanzado`,
          type: 'achievement',
        })
      setSaveMsg('¡Guardado!')
      setTimeout(() => setSaveMsg(null), 3000)
    } catch {
      setSaveMsg('Error al guardar.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 bg-white/10 rounded-lg w-32" />
        <div className="h-40 bg-white/5 rounded-2xl" />
        <div className="h-56 bg-white/5 rounded-2xl" />
        <div className="h-52 bg-white/5 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto space-y-5 pb-28">
      <PageHeader title="❤️ Salud" subtitle="Seguimiento diario de bienestar" />

      {/* ── Actividad — Apple Health (tiempo real) ──────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5 space-y-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">Actividad</p>
          <div className="flex items-center gap-1.5 text-[10px] text-white/20">
            <Smartphone size={10} />
            <span>Apple Health</span>
          </div>
        </div>

        {pasosLoading ? (
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-full bg-white/5 animate-pulse shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="h-4 bg-white/5 rounded-lg animate-pulse" />
              <div className="h-3 bg-white/5 rounded-lg animate-pulse w-2/3" />
            </div>
          </div>
        ) : (
          <>
            {/* Ring + stats */}
            <div className="flex items-center gap-5">
              <StepsRing steps={pasosHoy} goal={STEPS_GOAL} />

              <div className="flex-1 space-y-3 min-w-0">
                {pasosHoy !== null ? (
                  <>
                    <div>
                      <p className={`text-3xl font-bold tabular-nums tracking-tight ${stepsTextColor(pasosHoy)}`}>
                        {pasosHoy.toLocaleString('es-ES')}
                      </p>
                      <p className="text-xs text-white/35 mt-0.5">pasos hoy</p>
                    </div>

                    <div className="space-y-1">
                      <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, (pasosHoy / STEPS_GOAL) * 100)}%` }}
                          transition={{ duration: 0.9, ease: 'easeOut' }}
                          className={`h-full rounded-full ${stepsBarColor(pasosHoy)}`}
                        />
                      </div>
                      <p className="text-[10px] text-white/30">
                        {pasosHoy >= STEPS_GOAL
                          ? `✓ Objetivo superado · +${(pasosHoy - STEPS_GOAL).toLocaleString('es-ES')} pasos`
                          : `Faltan ${(STEPS_GOAL - pasosHoy).toLocaleString('es-ES')} pasos`}
                      </p>
                    </div>

                    {appleWeekAvg !== null && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/25">Prom. 7 días:</span>
                        <span className={`text-[10px] font-semibold ${stepsTextColor(appleWeekAvg)}`}>
                          {appleWeekAvg.toLocaleString('es-ES')}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-sm text-white/40">Sin datos de hoy</p>
                    <p className="text-xs text-white/25 leading-relaxed">
                      Activa el Shortcut en el iPhone para sincronizar pasos automáticamente.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Mini chart */}
            {appleChartDays.some(d => d.steps !== null) && (
              <div>
                <p className="text-[10px] text-white/25 mb-3">Últimos 7 días · objetivo 10.000</p>
                <StepsBarChart days={appleChartDays} />
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* ── Hoy (datos manuales) ─────────────────────────────────────────── */}
      {todayData && (
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07, duration: 0.28 }}
          className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5 space-y-4"
        >
          <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">Hoy</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {todayData.steps !== undefined && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/45">👟 Pasos (manual)</span>
                  <span className={`text-xl font-bold tabular-nums ${stepsTextColor(todayData.steps)}`}>
                    {todayData.steps.toLocaleString('es-ES')}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${todayStepsPct}%` }}
                    transition={{ duration: 0.8 }}
                    className={`h-full rounded-full ${stepsBarColor(todayData.steps)}`}
                  />
                </div>
              </div>
            )}

            {todayData.sleepHours !== undefined && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/45">🌙 Sueño</span>
                  <span className="text-xl font-bold tabular-nums text-indigo-300">
                    {todayData.sleepHours}h{todayData.sleepMinutes ? ` ${todayData.sleepMinutes}m` : ''}
                  </span>
                </div>
                {todayData.sleepQuality && (
                  <p className="text-xs text-white/40">
                    {QUALITY_OPTIONS.find(q => q.value === todayData!.sleepQuality)?.emoji}{' '}
                    Calidad: <span className="capitalize text-white/60">{todayData.sleepQuality}</span>
                  </p>
                )}
                <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                    style={{ width: `${Math.min(100, (todaySleepH / 8) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {todayData.weight !== undefined && (
              <div className="flex items-center justify-between rounded-xl bg-white/3 border border-white/5 px-4 py-3">
                <span className="text-xs text-white/45">⚖️ Peso</span>
                <span className="text-base font-semibold text-white/70">{todayData.weight} kg</span>
              </div>
            )}

            {todayData.heartRateAvg !== undefined && (
              <div className="flex items-center justify-between rounded-xl bg-white/3 border border-white/5 px-4 py-3">
                <span className="text-xs text-white/45">❤️ FC promedio</span>
                <span className="text-base font-semibold text-rose-300">{todayData.heartRateAvg} bpm</span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Esta semana ───────────────────────────────────────────────────── */}
      {(last7.some(d => d.steps !== undefined) || last7.some(d => d.sleepH !== undefined)) && (
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.28 }}
          className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5 space-y-5"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">Esta semana · registro manual</p>
            <div className="flex gap-4 text-[10px] text-white/30">
              {weekStepsAvg !== undefined && (
                <span>Pasos prom: <span className="text-white/55 font-medium">{weekStepsAvg.toLocaleString('es-ES')}</span></span>
              )}
              {weekSleepAvg !== undefined && (
                <span>Sueño prom: <span className="text-white/55 font-medium">{weekSleepAvg}h</span></span>
              )}
            </div>
          </div>

          {last7.some(d => d.steps !== undefined) && (
            <div>
              <p className="text-[10px] text-white/25 mb-3">👟 Pasos · objetivo {STEPS_GOAL.toLocaleString('es-ES')}</p>
              <StepsBarChart days={last7} />
            </div>
          )}

          {last7.some(d => d.sleepH !== undefined) && (
            <div>
              <p className="text-[10px] text-white/25 mb-3">🌙 Horas de sueño · objetivo 8h</p>
              <SleepLineChart days={last7} />
            </div>
          )}
        </motion.div>
      )}

      {/* ── Registro manual ───────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.17, duration: 0.28 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5 space-y-4"
      >
        <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">
          {todayData ? 'Actualizar registro de hoy' : 'Registro manual de hoy'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <span className="text-xs text-white/45">👟 Pasos</span>
            <input
              type="number" inputMode="numeric" placeholder="Ej: 8500"
              value={formSteps} onChange={e => setFormSteps(e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs text-white/45">⚖️ Peso (kg)</span>
            <input
              type="number" inputMode="decimal" step="0.1" placeholder="Ej: 82.5"
              value={formWeight} onChange={e => setFormWeight(e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs text-white/45">🌙 Sueño (horas / min extra)</span>
            <div className="flex gap-2">
              <input
                type="number" inputMode="numeric" placeholder="Horas" min={0} max={16}
                value={formSleepH} onChange={e => setFormSleepH(e.target.value)}
                className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition"
              />
              <input
                type="number" inputMode="numeric" placeholder="Min" min={0} max={59}
                value={formSleepM} onChange={e => setFormSleepM(e.target.value)}
                className="w-20 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition"
              />
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs text-white/45">❤️ FC promedio (bpm)</span>
            <input
              type="number" inputMode="numeric" placeholder="Ej: 62"
              value={formHR} onChange={e => setFormHR(e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition"
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs text-white/45">Calidad del sueño</span>
          <div className="flex gap-2">
            {QUALITY_OPTIONS.map(q => (
              <button key={q.value} onClick={() => setFormQuality(q.value)}
                className={`flex-1 rounded-xl py-2 text-xs font-medium transition border ${
                  formQuality === q.value
                    ? 'bg-white/10 border-white/20 text-white/80'
                    : 'bg-white/3 border-white/8 text-white/35 hover:bg-white/5'
                }`}>
                {q.emoji} {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-sm font-semibold text-white transition">
            {saving && <Loader2 size={13} className="animate-spin" />}
            Guardar
          </button>
          {saveMsg && (
            <p className={`text-xs ${saveMsg.includes('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
              {saveMsg}
            </p>
          )}
        </div>

        <p className="text-[10px] text-white/20 leading-relaxed">
          Los pasos de arriba se sincronizan automáticamente desde Apple Health via Shortcuts.
          Usa este formulario para sueño, peso y frecuencia cardíaca.
        </p>
      </motion.div>
    </div>
  )
}
