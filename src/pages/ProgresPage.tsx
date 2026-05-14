import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { loadProfile, getTargetForDay } from '@/services/metabolic.service'
import { getWeights } from '@/features/health/weightService'
import type { WeightEntry } from '@/features/health/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MoodPoint  { date: string; mood: number }
interface MacroPoint { date: string; kcal: number; target: number }

// ── SVG helpers ───────────────────────────────────────────────────────────────

function linReg(ys: number[]) {
  const n = ys.length
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 }
  const sumX  = (n * (n - 1)) / 2
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6
  const sumY  = ys.reduce((a, b) => a + b, 0)
  const sumXY = ys.reduce((s, y, i) => s + i * y, 0)
  const denom = n * sumX2 - sumX * sumX
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
  return { slope, intercept: (sumY - slope * sumX) / n }
}

// ── Chart: Weight ─────────────────────────────────────────────────────────────

function WeightChart({ data }: { data: WeightEntry[] }) {
  const W = 320, H = 130
  const pL = 38, pT = 8, pR = 10, pB = 24
  const iW = W - pL - pR, iH = H - pT - pB

  const sorted = useMemo(() =>
    [...data].sort((a, b) => a.date.getTime() - b.date.getTime()),
  [data])

  if (sorted.length < 2) return (
    <div className="flex items-center justify-center h-32 text-xs text-white/30 text-center px-4">
      Registra al menos 2 pesajes para ver la evolución
    </div>
  )

  const weights = sorted.map(d => d.weight)
  const minW = Math.floor(Math.min(...weights) * 2) / 2 - 0.5
  const maxW = Math.ceil(Math.max(...weights)  * 2) / 2 + 0.5
  const rngW = maxW - minW || 1

  const xS = (i: number) => pL + (i / (sorted.length - 1)) * iW
  const yS = (w: number) => pT + (1 - (w - minW) / rngW) * iH

  const linePath = sorted.map((d, i) =>
    `${i === 0 ? 'M' : 'L'} ${xS(i).toFixed(1)} ${yS(d.weight).toFixed(1)}`
  ).join(' ')

  const areaPath =
    `${linePath} L ${xS(sorted.length - 1).toFixed(1)} ${(pT + iH).toFixed(1)} L ${xS(0).toFixed(1)} ${(pT + iH).toFixed(1)} Z`

  const { slope, intercept } = linReg(weights)
  const trendX1 = xS(0), trendY1 = yS(intercept)
  const trendX2 = xS(sorted.length - 1), trendY2 = yS(slope * (sorted.length - 1) + intercept)

  const yTicks = [minW, minW + rngW / 2, maxW]
  const xIdxs  = [0, Math.floor((sorted.length - 1) / 2), sorted.length - 1]
  const fmt     = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgb(129,140,248)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="rgb(129,140,248)" stopOpacity="0"   />
        </linearGradient>
      </defs>

      {/* Grid */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={pL} y1={yS(t)} x2={W - pR} y2={yS(t)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          <text x={pL - 4} y={yS(t) + 4} fontSize="9" fill="rgba(255,255,255,0.28)" textAnchor="end">
            {t.toFixed(1)}
          </text>
        </g>
      ))}

      {/* X labels */}
      {xIdxs.map(i => (
        <text key={i} x={xS(i)} y={H - 4} fontSize="8" fill="rgba(255,255,255,0.22)" textAnchor="middle">
          {fmt(sorted[i].date)}
        </text>
      ))}

      {/* Trend */}
      <line x1={trendX1} y1={trendY1} x2={trendX2} y2={trendY2}
        stroke="rgba(251,191,36,0.4)" strokeWidth="1.5" strokeDasharray="5,3"
      />

      {/* Area */}
      <path d={areaPath} fill="url(#wGrad)" />

      {/* Line */}
      <path d={linePath} fill="none" stroke="rgb(129,140,248)" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />

      {/* Last dot */}
      <circle cx={xS(sorted.length - 1)} cy={yS(sorted[sorted.length - 1].weight)} r="3"
        fill="rgb(129,140,248)" stroke="rgb(30,30,40)" strokeWidth="1.5"
      />
    </svg>
  )
}

// ── Chart: Mood ───────────────────────────────────────────────────────────────

function MoodChart({ data }: { data: MoodPoint[] }) {
  const W = 320, H = 120
  const pL = 28, pT = 8, pR = 8, pB = 22
  const iW = W - pL - pR, iH = H - pT - pB

  const sorted = useMemo(() =>
    [...data].sort((a, b) => a.date.localeCompare(b.date)),
  [data])

  if (sorted.length < 2) return (
    <div className="flex items-center justify-center h-28 text-xs text-white/30 text-center px-4">
      Registra al menos 2 días de diario para ver la evolución de ánimo
    </div>
  )

  const n = sorted.length
  const xS = (i: number) => pL + (i / (n - 1)) * iW
  const yS = (m: number) => pT + (1 - (m - 1) / 4) * iH

  const linePath = sorted.map((d, i) =>
    `${i === 0 ? 'M' : 'L'} ${xS(i).toFixed(1)} ${yS(d.mood).toFixed(1)}`
  ).join(' ')

  const areaPath =
    `${linePath} L ${xS(n - 1).toFixed(1)} ${(pT + iH).toFixed(1)} L ${xS(0).toFixed(1)} ${(pT + iH).toFixed(1)} Z`

  const avgMood = sorted.reduce((s, d) => s + d.mood, 0) / n
  const moodColor = avgMood >= 4 ? 'rgb(52,211,153)' : avgMood >= 3 ? 'rgb(251,191,36)' : 'rgb(251,113,133)'

  const yTicks = [1, 3, 5]
  const yLabels: Record<number, string> = { 1: '😔', 3: '🙂', 5: '🤩' }
  const xIdxs = [0, Math.floor((n - 1) / 2), n - 1]
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="mGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={moodColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={moodColor} stopOpacity="0"   />
        </linearGradient>
      </defs>

      {/* Grid */}
      {yTicks.map(t => (
        <g key={t}>
          <line x1={pL} y1={yS(t)} x2={W - pR} y2={yS(t)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          <text x={pL - 4} y={yS(t) + 5} fontSize="10" fill="rgba(255,255,255,0.3)" textAnchor="end">
            {yLabels[t]}
          </text>
        </g>
      ))}

      {/* X labels */}
      {xIdxs.map(i => (
        <text key={i} x={xS(i)} y={H - 4} fontSize="8" fill="rgba(255,255,255,0.22)" textAnchor="middle">
          {fmt(sorted[i].date)}
        </text>
      ))}

      {/* Area */}
      <path d={areaPath} fill="url(#mGrad)" />

      {/* Line */}
      <path d={linePath} fill="none" stroke={moodColor} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />

      {/* Dots for each point (small) */}
      {sorted.map((d, i) => (
        <circle key={i} cx={xS(i)} cy={yS(d.mood)} r="2" fill={moodColor} opacity="0.7" />
      ))}
    </svg>
  )
}

// ── Chart: Macros ─────────────────────────────────────────────────────────────

function MacroChart({ data }: { data: MacroPoint[] }) {
  const W = 320, H = 120
  const pL = 32, pT = 8, pR = 8, pB = 22
  const iW = W - pL - pR, iH = H - pT - pB

  if (data.length === 0) return (
    <div className="flex items-center justify-center h-28 text-xs text-white/30 text-center px-4">
      Sin datos de nutrición en los últimos 30 días
    </div>
  )

  const barW = (iW / data.length) * 0.7
  const gap  = iW / data.length

  const yS = (pct: number) => pT + (1 - Math.min(pct, 1.5) / 1.5) * iH
  const yTicks = [0, 0.5, 1.0]
  const yLabels = ['0%', '50%', '100%']

  const y80 = yS(0.80)

  const sorted = useMemo(() =>
    [...data].sort((a, b) => a.date.localeCompare(b.date)),
  [data])

  const xIdxs = sorted.length <= 10
    ? sorted.map((_, i) => i)
    : [0, Math.floor((sorted.length - 1) / 3), Math.floor((sorted.length - 1) * 2 / 3), sorted.length - 1]
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* Grid lines */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={pL} y1={yS(t)} x2={W - pR} y2={yS(t)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          <text x={pL - 4} y={yS(t) + 4} fontSize="9" fill="rgba(255,255,255,0.28)" textAnchor="end">
            {yLabels[i]}
          </text>
        </g>
      ))}

      {/* 80% target line */}
      <line x1={pL} y1={y80} x2={W - pR} y2={y80}
        stroke="rgba(251,191,36,0.45)" strokeWidth="1" strokeDasharray="4,3"
      />
      <text x={W - pR + 2} y={y80 + 4} fontSize="8" fill="rgba(251,191,36,0.5)">80%</text>

      {/* Bars */}
      {sorted.map((d, i) => {
        const pct = d.target > 0 ? d.kcal / d.target : 0
        const barH = Math.max(2, (1 - Math.max(0, 1 - Math.min(pct, 1.5) / 1.5)) * iH)
        const x = pL + i * gap + (gap - barW) / 2
        const color = pct >= 0.8 ? 'rgb(52,211,153)' : pct >= 0.5 ? 'rgb(251,191,36)' : 'rgb(251,113,133)'
        return (
          <rect key={i}
            x={x} y={yS(pct)} width={barW} height={Math.max(2, yS(0) - yS(pct))}
            fill={color} opacity="0.75" rx="1.5"
          />
        )
      })}

      {/* X labels */}
      {xIdxs.map(i => (
        <text key={i} x={pL + i * gap + gap / 2} y={H - 4}
          fontSize="8" fill="rgba(255,255,255,0.22)" textAnchor="middle"
        >
          {fmt(sorted[i].date)}
        </text>
      ))}
    </svg>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ProgresPage() {
  const [weightData, setWeightData]  = useState<WeightEntry[]>([])
  const [moodData,   setMoodData]    = useState<MoodPoint[]>([])
  const [macroData,  setMacroData]   = useState<MacroPoint[]>([])
  const [loading,    setLoading]     = useState(true)

  const profile = useMemo(() => loadProfile(), [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const now     = new Date()
        const ago90   = new Date(now); ago90.setDate(now.getDate() - 90)
        const ago60   = new Date(now); ago60.setDate(now.getDate() - 60)
        const ago30   = new Date(now); ago30.setDate(now.getDate() - 30)

        const [weights, diarySnap, nutritionSnap] = await Promise.all([
          getWeights('local-user'),

          getDocs(query(
            collection(db, 'diary_entries'),
            where('date', '>=', ago60.toISOString().slice(0, 10)),
            orderBy('date', 'asc'),
          )),

          getDocs(query(
            collection(db, 'nutrition_entries'),
            where('createdAt', '>=', Timestamp.fromDate(ago30)),
            orderBy('createdAt', 'asc'),
          )),
        ])

        // Weight: last 90 days
        const wFiltered = weights.filter(w => w.date >= ago90)
        setWeightData(wFiltered)

        // Mood: one entry per day (latest if multiple)
        const moodMap = new Map<string, number>()
        diarySnap.forEach(doc => {
          const d = doc.data()
          if (d['mood']) moodMap.set(d['date'] as string, d['mood'] as number)
        })
        setMoodData(Array.from(moodMap.entries()).map(([date, mood]) => ({ date, mood })))

        // Macros: group by day
        const macroMap = new Map<string, { kcal: number }>()
        nutritionSnap.forEach(doc => {
          const d   = doc.data()
          const ts  = d['createdAt'] as Timestamp
          const day = ts.toDate().toISOString().slice(0, 10)
          const cur = macroMap.get(day) ?? { kcal: 0 }
          macroMap.set(day, { kcal: cur.kcal + ((d['kcal'] as number) ?? 0) })
        })

        const macroPoints: MacroPoint[] = Array.from(macroMap.entries()).map(([date, v]) => ({
          date,
          kcal:   v.kcal,
          target: getTargetForDay(profile, new Date(date + 'T12:00:00').getDay()).kcal,
        }))
        setMacroData(macroPoints)
      } catch (err) {
        console.error('ProgresPage load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [profile])

  // ── Derived stats ────────────────────────────────────────────────────────────

  const weightStats = useMemo(() => {
    if (weightData.length < 2) return null
    const sorted = [...weightData].sort((a, b) => a.date.getTime() - b.date.getTime())
    const first  = sorted[0].weight
    const last   = sorted[sorted.length - 1].weight
    const diff   = Math.round((last - first) * 10) / 10
    const { slope } = linReg(sorted.map(d => d.weight))
    const trend: 'bajando' | 'estable' | 'subiendo' =
      slope < -0.01 ? 'bajando' : slope > 0.01 ? 'subiendo' : 'estable'
    return { diff, trend, last }
  }, [weightData])

  const moodStats = useMemo(() => {
    if (!moodData.length) return null
    const avg = moodData.reduce((s, d) => s + d.mood, 0) / moodData.length
    return { avg: Math.round(avg * 10) / 10 }
  }, [moodData])

  const macroStats = useMemo(() => {
    if (!macroData.length) return null
    const compliant = macroData.filter(d => d.target > 0 && d.kcal / d.target >= 0.8).length
    const rate = Math.round((compliant / macroData.length) * 100)
    return { rate, days: macroData.length }
  }, [macroData])

  const trendColor = {
    bajando:  'text-emerald-400',
    estable:  'text-amber-400',
    subiendo: 'text-rose-400',
  }
  const trendLabel = {
    bajando:  '↓ bajando',
    estable:  '→ estable',
    subiendo: '↑ subiendo',
  }

  return (
    <div className="px-4 pb-28 pt-5 md:px-6 lg:px-8 max-w-3xl mx-auto space-y-5">
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xl font-bold text-white/90"
      >
        📈 Progreso
      </motion.h1>

      {/* ── Weight ─────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
      >
        <div className="flex items-start justify-between mb-1">
          <p className="text-sm font-semibold text-white/80">⚖️ Peso (90 días)</p>
          {weightStats && (
            <div className="text-right">
              <p className="text-xs text-white/50">
                {weightStats.last} kg
              </p>
              <p className={`text-[11px] font-medium ${trendColor[weightStats.trend]}`}>
                {trendLabel[weightStats.trend]}
                {weightStats.diff !== 0 && ` (${weightStats.diff > 0 ? '+' : ''}${weightStats.diff} kg)`}
              </p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="h-32 rounded-xl bg-white/4 animate-pulse mt-3" />
        ) : (
          <div className="mt-3">
            <WeightChart data={weightData} />
          </div>
        )}

        <p className="text-[11px] text-white/25 mt-2">
          Línea amarilla = tendencia · Registra cada lunes y jueves
        </p>
      </motion.section>

      {/* ── Mood ───────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.10 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
      >
        <div className="flex items-start justify-between mb-1">
          <p className="text-sm font-semibold text-white/80">😊 Ánimo (60 días)</p>
          {moodStats && (
            <p className="text-xs text-white/50">
              Promedio <span className="text-white/70 font-medium">{moodStats.avg}/5</span>
            </p>
          )}
        </div>

        {loading ? (
          <div className="h-28 rounded-xl bg-white/4 animate-pulse mt-3" />
        ) : (
          <div className="mt-3">
            <MoodChart data={moodData} />
          </div>
        )}

        <p className="text-[11px] text-white/25 mt-2">
          Datos del diario diario · Escribe cada día para ver tu tendencia
        </p>
      </motion.section>

      {/* ── Macros compliance ──────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
      >
        <div className="flex items-start justify-between mb-1">
          <p className="text-sm font-semibold text-white/80">🥗 Adherencia macros (30 días)</p>
          {macroStats && (
            <p className="text-xs">
              <span className={`font-medium ${
                macroStats.rate >= 70 ? 'text-emerald-400' : macroStats.rate >= 50 ? 'text-amber-400' : 'text-rose-400'
              }`}>{macroStats.rate}%</span>
              <span className="text-white/35"> cumplimiento</span>
            </p>
          )}
        </div>

        {loading ? (
          <div className="h-28 rounded-xl bg-white/4 animate-pulse mt-3" />
        ) : (
          <div className="mt-3">
            <MacroChart data={macroData} />
          </div>
        )}

        <div className="flex items-center gap-4 mt-2">
          {[
            { color: 'bg-emerald-500', label: '≥80% kcal' },
            { color: 'bg-amber-500',   label: '50-79%' },
            { color: 'bg-rose-500',    label: '<50%' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${l.color}`} />
              <span className="text-[10px] text-white/30">{l.label}</span>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ── Exercise (placeholder) ─────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.20 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
      >
        <p className="text-sm font-semibold text-white/80 mb-3">💪 Fuerza y ejercicio</p>
        <div className="rounded-xl bg-white/3 border border-white/6 px-4 py-5 text-center">
          <p className="text-2xl mb-2">🏋️</p>
          <p className="text-sm text-white/45">Próximamente</p>
          <p className="text-xs text-white/25 mt-1">
            El seguimiento de series y cargas se activará cuando registres tus entrenamientos desde Ejercicios
          </p>
        </div>
      </motion.section>
    </div>
  )
}
