import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { PasosDia } from '@/hooks/usePasos'
import type { DiaryEntry } from '@/types/diary'
import type { HealthData } from '@/services/health.service'

interface Props {
  historicoSemanal: PasosDia[]
  diaryEntries: DiaryEntry[]
  weekHealth: HealthData[]
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({
  values,
  color,
  goalLine,
}: {
  values: (number | null)[]
  color: string
  goalLine?: number  // value at which to draw a subtle dashed goal line
}) {
  const W = 100, H = 34, PB = 0
  const plotH = H - PB
  const valid = values.filter((v): v is number => v !== null)
  if (!valid.length) {
    return (
      <div className="h-8 flex items-center justify-center">
        <span className="text-[10px] text-white/15">sin datos</span>
      </div>
    )
  }

  const max = Math.max(...valid, goalLine ?? 0)
  const min = Math.min(...valid)
  const range = max - min || 1

  const xs = values.map((_, i) => (i / Math.max(values.length - 1, 1)) * W)
  const ys = values.map(v =>
    v !== null ? plotH - ((v - min) / range) * plotH * 0.88 + plotH * 0.06 : null,
  )

  const parts: string[] = []
  let pen = false
  for (let i = 0; i < values.length; i++) {
    if (ys[i] === null) { pen = false; continue }
    parts.push(`${pen ? 'L' : 'M'}${xs[i].toFixed(1)},${ys[i]!.toFixed(1)}`)
    pen = true
  }

  const goalY = goalLine !== null && goalLine !== undefined
    ? plotH - ((goalLine - min) / range) * plotH * 0.88 + plotH * 0.06
    : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
      {goalY !== null && (
        <line x1={0} x2={W} y1={goalY} y2={goalY}
          stroke="#ffffff0f" strokeWidth={1} strokeDasharray="3,2" />
      )}
      {parts.length > 0 && (
        <path d={parts.join(' ')} fill="none" stroke={color}
          strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {values.map((v, i) =>
        v !== null && ys[i] !== null ? (
          <circle key={i} cx={xs[i]} cy={ys[i]!} r={2.5} fill={color} />
        ) : null,
      )}
    </svg>
  )
}

// ── Day labels ────────────────────────────────────────────────────────────────

function DayLabels({ dates }: { dates: string[] }) {
  return (
    <div className="flex justify-between mt-1 px-0.5">
      {dates.map((d, i) => {
        const day = new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short' }).slice(0, 1).toUpperCase()
        const isToday = i === dates.length - 1
        return (
          <span key={d} className={`text-[9px] ${isToday ? 'text-white/50 font-semibold' : 'text-white/18'}`}>
            {day}
          </span>
        )
      })}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function TendenciaSemanal({ historicoSemanal, diaryEntries, weekHealth }: Props) {
  const dates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i))
      return d.toISOString().slice(0, 10)
    })
  }, [])

  const pasosValues = dates.map(date =>
    historicoSemanal.find(d => d.fecha === date)?.pasos ?? null,
  )

  const moodValues = dates.map(date => {
    const e = diaryEntries.find(d => d.date === date)
    return e ? (e.mood as number) : null
  })

  const suenoValues = dates.map(date => {
    const h = weekHealth.find(d => d.date === date)
    return h?.sleepHours != null
      ? Math.round((h.sleepHours + (h.sleepMinutes ?? 0) / 60) * 10) / 10
      : null
  })

  const pesoValues = dates.map(date =>
    weekHealth.find(d => d.date === date)?.weight ?? null,
  )

  const hasPasos = pasosValues.some(v => v !== null)
  const hasMood  = moodValues.some(v => v !== null)
  const hasSueno = suenoValues.some(v => v !== null)
  const hasPeso  = pesoValues.some(v => v !== null)

  if (!hasPasos && !hasMood && !hasSueno && !hasPeso) return null

  const cards = [
    { label: '👟 Pasos',  values: pasosValues, color: '#10b981', goal: 10000, show: hasPasos },
    { label: '😊 Mood',   values: moodValues,  color: '#6366f1', goal: 5,     show: hasMood },
    { label: '🌙 Sueño',  values: suenoValues, color: '#3b82f6', goal: 8,     show: hasSueno },
    { label: '⚖️ Peso',   values: pesoValues,  color: '#f59e0b', goal: undefined, show: hasPeso },
  ].filter(c => c.show)

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.28 }}
    >
      <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-3">
        Tendencia 7 días
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(card => (
          <div key={card.label} className="rounded-2xl bg-[#1E1E28] border border-white/8 px-4 pt-4 pb-3">
            <p className="text-[11px] text-white/40 mb-2 font-medium">{card.label}</p>
            <Sparkline values={card.values} color={card.color} goalLine={card.goal} />
            <DayLabels dates={dates} />
          </div>
        ))}
      </div>
    </motion.div>
  )
}
