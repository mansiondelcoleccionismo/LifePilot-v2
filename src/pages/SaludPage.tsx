import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { PageHeader } from '@/components/layout/PageContainer'
import { Loader2 } from 'lucide-react'
import {
  type HealthData,
  getHealthData,
  getLastNDays,
  saveHealthData,
  calcSleepTotal,
} from '@/services/health.service'
import { patchContext } from '@/services/context.service'

// ── Constants ─────────────────────────────────────────────────────────────────

type SleepQuality = 'mala' | 'regular' | 'buena' | 'excelente'

const QUALITY_OPTIONS: { value: SleepQuality; label: string; emoji: string }[] = [
  { value: 'mala',      label: 'Mala',      emoji: '😴' },
  { value: 'regular',   label: 'Regular',   emoji: '🌙' },
  { value: 'buena',     label: 'Buena',     emoji: '⭐' },
  { value: 'excelente', label: 'Excelente', emoji: '✨' },
]

const STEPS_GOAL = 10_000

// ── Helpers ───────────────────────────────────────────────────────────────────

function stepsBarColor(steps?: number) {
  if (!steps) return 'bg-white/8'
  if (steps >= STEPS_GOAL) return 'bg-emerald-500'
  if (steps >= 7000)       return 'bg-blue-500'
  if (steps >= 4000)       return 'bg-amber-500'
  return 'bg-rose-500'
}

function stepsTextColor(steps?: number) {
  if (!steps) return 'text-white/25'
  if (steps >= STEPS_GOAL) return 'text-emerald-400'
  if (steps >= 7000)       return 'text-blue-400'
  if (steps >= 4000)       return 'text-amber-400'
  return 'text-red-400'
}

// ── SVG Charts ────────────────────────────────────────────────────────────────

function StepsBarChart({ days }: {
  days: Array<{ label: string; steps?: number }>
}) {
  const W = 280, H = 84, PB = 20
  const plotH = H - PB
  const n     = days.length
  const maxVal = Math.max(STEPS_GOAL, ...days.map(d => d.steps ?? 0))
  const slotW  = W / n
  const barW   = Math.floor(slotW * 0.62)
  const goalY  = plotH * (1 - STEPS_GOAL / maxVal)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={0} x2={W} y1={goalY} y2={goalY}
        stroke="#ffffff10" strokeWidth={1} strokeDasharray="3,2" />
      {days.map((d, i) => {
        const barH = d.steps ? Math.max(3, (d.steps / maxVal) * plotH) : 3
        const x    = slotW * i + (slotW - barW) / 2
        const fill = !d.steps    ? '#ffffff0c'
          : d.steps >= STEPS_GOAL ? '#10b981'
          : d.steps >= 7000       ? '#3b82f6'
          : d.steps >= 4000       ? '#f59e0b'
          : '#ef4444'
        return (
          <g key={i}>
            <rect x={x} y={plotH - barH} width={barW} height={barH} rx={2} fill={fill} opacity={0.85} />
            <text x={slotW * i + slotW / 2} y={H - 4}
              textAnchor="middle" fill="#ffffff30" fontSize={8} fontFamily="sans-serif">
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function SleepLineChart({ days }: {
  days: Array<{ label: string; sleepH?: number }>
}) {
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export function SaludPage() {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const [todayData, setTodayData] = useState<HealthData | null>(null)
  const [weekData, setWeekData]   = useState<HealthData[]>([])
  const [loading, setLoading]     = useState(true)

  // Form state
  const [formSteps,   setFormSteps]   = useState('')
  const [formSleepH,  setFormSleepH]  = useState('')
  const [formSleepM,  setFormSleepM]  = useState('')
  const [formQuality, setFormQuality] = useState<SleepQuality>('buena')
  const [formWeight,  setFormWeight]  = useState('')
  const [formHR,      setFormHR]      = useState('')
  const [saving,  setSaving]  = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [today, week] = await Promise.all([
          getHealthData(todayStr),
          getLastNDays(7),
        ])
        setTodayData(today)
        setWeekData(week)

        // Pre-fill form with today's data
        if (today) {
          if (today.steps       !== undefined) setFormSteps(String(today.steps))
          if (today.sleepHours  !== undefined) setFormSleepH(String(today.sleepHours))
          if (today.sleepMinutes !== undefined) setFormSleepM(String(today.sleepMinutes))
          if (today.sleepQuality)              setFormQuality(today.sleepQuality)
          if (today.weight      !== undefined) setFormWeight(String(today.weight))
          if (today.heartRateAvg !== undefined) setFormHR(String(today.heartRateAvg))
        }

        // Patch AI context
        const withSteps = week.filter(d => d.steps !== undefined)
        const withSleep = week.filter(d => d.sleepHours !== undefined)
        patchContext({
          ...(today?.steps       !== undefined ? { todaySteps: today.steps }                : {}),
          ...(today?.sleepHours  !== undefined ? { todaySleepHours: calcSleepTotal(today) } : {}),
          ...(today?.sleepQuality              ? { todaySleepQuality: today.sleepQuality }  : {}),
          ...(withSteps.length ? {
            weekStepsAvg: Math.round(withSteps.reduce((s, d) => s + (d.steps ?? 0), 0) / withSteps.length),
          } : {}),
          ...(withSleep.length ? {
            weekSleepAvg: parseFloat((withSleep.reduce((s, d) => s + calcSleepTotal(d), 0) / withSleep.length).toFixed(1)),
          } : {}),
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [todayStr])

  // Build complete 7-day array for charts (fills missing days with undefined)
  const last7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      const date  = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('es-ES', { weekday: 'short' }).slice(0, 3)
      const entry = weekData.find(w => w.date === date)
      return { date, label, steps: entry?.steps, sleepH: entry ? calcSleepTotal(entry) : undefined }
    })
  }, [weekData])

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
    const steps  = formSteps  ? parseInt(formSteps)                    : undefined
    const sleepH = formSleepH ? parseInt(formSleepH)                   : undefined
    const sleepM = formSleepM ? parseInt(formSleepM)                   : undefined
    const weight = formWeight ? parseFloat(formWeight.replace(',', '.')) : undefined
    const hr     = formHR     ? parseInt(formHR)                       : undefined

    if (steps === undefined && sleepH === undefined && weight === undefined) {
      setSaveMsg('Introduce al menos un dato.')
      return
    }

    setSaving(true)
    try {
      await saveHealthData({
        date:         todayStr,
        ...(steps   !== undefined ? { steps }                 : {}),
        ...(sleepH  !== undefined ? { sleepHours: sleepH }   : {}),
        ...(sleepM  !== undefined ? { sleepMinutes: sleepM } : {}),
        sleepQuality: formQuality,
        ...(weight  !== undefined ? { weight }                : {}),
        ...(hr      !== undefined ? { heartRateAvg: hr }     : {}),
        source:    'manual',
        createdAt: new Date(),
      })
      const updated = await getHealthData(todayStr)
      setTodayData(updated)
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
        <div className="h-36 bg-white/5 rounded-2xl" />
        <div className="h-56 bg-white/5 rounded-2xl" />
        <div className="h-52 bg-white/5 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto space-y-5">
      <PageHeader title="❤️ Salud" subtitle="Seguimiento diario de bienestar" />

      {/* ── Hoy ──────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5 space-y-4"
      >
        <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">Hoy</p>

        {!todayData ? (
          <p className="text-sm text-white/30 py-2">Sin datos para hoy. Usa el formulario para añadirlos.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {todayData.steps !== undefined && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/45">👟 Pasos</span>
                  <span className={`text-2xl font-bold tabular-nums ${stepsTextColor(todayData.steps)}`}>
                    {todayData.steps.toLocaleString('es-ES')}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/6 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${todayStepsPct}%` }}
                    transition={{ duration: 0.8 }}
                    className={`h-full rounded-full ${stepsBarColor(todayData.steps)}`}
                  />
                </div>
                <p className="text-[10px] text-white/25 text-right">
                  {todayData.steps >= STEPS_GOAL
                    ? '✓ Objetivo alcanzado'
                    : `${(STEPS_GOAL - todayData.steps).toLocaleString('es-ES')} pasos para el objetivo`}
                </p>
              </div>
            )}

            {todayData.sleepHours !== undefined && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/45">🌙 Sueño</span>
                  <span className="text-2xl font-bold tabular-nums text-indigo-300">
                    {todayData.sleepHours}h{todayData.sleepMinutes ? ` ${todayData.sleepMinutes}m` : ''}
                  </span>
                </div>
                {todayData.sleepQuality && (
                  <p className="text-xs text-white/40">
                    {QUALITY_OPTIONS.find(q => q.value === todayData!.sleepQuality)?.emoji}{' '}
                    Calidad: <span className="capitalize text-white/60">{todayData.sleepQuality}</span>
                  </p>
                )}
                <div className="h-2 rounded-full bg-white/6 overflow-hidden">
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
        )}
      </motion.div>

      {/* ── Esta semana ───────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07, duration: 0.28 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5 space-y-5"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">Esta semana</p>
          <div className="flex gap-4 text-[10px] text-white/30">
            {weekStepsAvg !== undefined && (
              <span>Pasos prom: <span className="text-white/55 font-medium">{weekStepsAvg.toLocaleString('es-ES')}</span></span>
            )}
            {weekSleepAvg !== undefined && (
              <span>Sueño prom: <span className="text-white/55 font-medium">{weekSleepAvg}h</span></span>
            )}
          </div>
        </div>

        {last7.some(d => d.steps !== undefined) ? (
          <div>
            <p className="text-[10px] text-white/25 mb-3">👟 Pasos · objetivo {STEPS_GOAL.toLocaleString('es-ES')}</p>
            <StepsBarChart days={last7} />
          </div>
        ) : (
          <p className="text-xs text-white/25">Sin datos de pasos esta semana</p>
        )}

        {last7.some(d => d.sleepH !== undefined) && (
          <div>
            <p className="text-[10px] text-white/25 mb-3">🌙 Horas de sueño · objetivo 8h</p>
            <SleepLineChart days={last7} />
          </div>
        )}

        {!last7.some(d => d.steps !== undefined) && !last7.some(d => d.sleepH !== undefined) && (
          <p className="text-xs text-white/25 py-2">Sin datos esta semana. Empieza registrando el día de hoy.</p>
        )}
      </motion.div>

      {/* ── Registro manual ───────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14, duration: 0.28 }}
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
              value={formSteps}
              onChange={e => setFormSteps(e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs text-white/45">⚖️ Peso (kg)</span>
            <input
              type="number" inputMode="decimal" step="0.1" placeholder="Ej: 82.5"
              value={formWeight}
              onChange={e => setFormWeight(e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs text-white/45">🌙 Sueño (horas / min extra)</span>
            <div className="flex gap-2">
              <input
                type="number" inputMode="numeric" placeholder="Horas" min={0} max={16}
                value={formSleepH}
                onChange={e => setFormSleepH(e.target.value)}
                className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition"
              />
              <input
                type="number" inputMode="numeric" placeholder="Min" min={0} max={59}
                value={formSleepM}
                onChange={e => setFormSleepM(e.target.value)}
                className="w-20 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition"
              />
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs text-white/45">❤️ FC promedio (bpm)</span>
            <input
              type="number" inputMode="numeric" placeholder="Ej: 62"
              value={formHR}
              onChange={e => setFormHR(e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition"
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs text-white/45">Calidad del sueño</span>
          <div className="flex gap-2">
            {QUALITY_OPTIONS.map(q => (
              <button
                key={q.value}
                onClick={() => setFormQuality(q.value)}
                className={`flex-1 rounded-xl py-2 text-xs font-medium transition border ${
                  formQuality === q.value
                    ? 'bg-white/10 border-white/20 text-white/80'
                    : 'bg-white/3 border-white/8 text-white/35 hover:bg-white/5'
                }`}
              >
                {q.emoji} {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-sm font-semibold text-white transition"
          >
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
          También puedes enviar datos automáticamente desde Atajos de iOS escribiendo directamente
          en la colección Firebase &quot;health_data&quot; con doc ID = fecha YYYY-MM-DD.
        </p>
      </motion.div>
    </div>
  )
}
