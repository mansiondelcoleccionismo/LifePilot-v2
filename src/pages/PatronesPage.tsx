import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Loader2 } from 'lucide-react'
import {
  analyzePatterns,
  invalidatePatternsCache,
} from '@/services/patterns.service'
import type { PatternResult, PatternInsight, WeekdayMood, WeeklyPoint, PatternStreak } from '@/services/patterns.service'

// ── Period selector ───────────────────────────────────────────────────────────

const PERIODS = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

// ── Insight card ──────────────────────────────────────────────────────────────

const THEME_COLOR: Record<PatternInsight['theme'], string> = {
  ejercicio: 'border-violet-500/30 bg-violet-500/6',
  nutricion: 'border-emerald-500/30 bg-emerald-500/6',
  pasos:     'border-blue-500/30 bg-blue-500/6',
  sueno:     'border-indigo-500/30 bg-indigo-500/6',
  racha:     'border-amber-500/30 bg-amber-500/6',
  semana:    'border-cyan-500/30 bg-cyan-500/6',
}

const THEME_ICON: Record<PatternInsight['theme'], string> = {
  ejercicio: '💪',
  nutricion: '🍗',
  pasos:     '👟',
  sueno:     '🌙',
  racha:     '🔥',
  semana:    '📅',
}

function InsightCard({ insight }: { insight: PatternInsight }) {
  return (
    <div className={`rounded-xl border p-4 ${THEME_COLOR[insight.theme]}`}>
      <div className="flex items-start gap-3">
        <span className="text-lg shrink-0 mt-0.5">{THEME_ICON[insight.theme]}</span>
        <div className="min-w-0">
          <p className="text-[13px] text-white/80 leading-snug">{insight.text}</p>
          <p className="text-[11px] text-white/35 mt-1">{insight.dataPoint}</p>
        </div>
        <span className={`shrink-0 text-base ${insight.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
          {insight.positive ? '↑' : '↓'}
        </span>
      </div>
    </div>
  )
}

// ── Streak pill ───────────────────────────────────────────────────────────────

function StreakPill({ streak }: { streak: PatternStreak }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/4 border border-white/8 px-4 py-3">
      <span className="text-2xl">{streak.emoji}</span>
      <div>
        <p className="text-xl font-bold text-white/90 tabular-nums leading-none">{streak.count}</p>
        <p className="text-[11px] text-white/40 mt-0.5">{streak.label}</p>
      </div>
    </div>
  )
}

// ── Weekday heatmap ───────────────────────────────────────────────────────────

function WeekdayHeatmap({ data }: { data: WeekdayMood[] }) {
  const ordered = [1, 2, 3, 4, 5, 6, 0].map(dow => data.find(d => d.dow === dow)!)

  const moodColor = (mood: number | null) => {
    if (mood === null) return 'bg-white/6'
    if (mood >= 4.5) return 'bg-emerald-500'
    if (mood >= 3.5) return 'bg-blue-500'
    if (mood >= 2.5) return 'bg-amber-500'
    return 'bg-rose-500'
  }

  return (
    <div className="grid grid-cols-7 gap-2">
      {ordered.map(d => (
        <div key={d.dow} className="flex flex-col items-center gap-1.5">
          <div
            className={`w-full aspect-square rounded-lg ${moodColor(d.avgMood)} flex items-center justify-center`}
          >
            {d.avgMood !== null && (
              <span className="text-[11px] font-bold text-white/90">{d.avgMood}</span>
            )}
          </div>
          <span className="text-[9px] text-white/30 font-medium">{d.label.slice(0, 3)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Weekly evolution SVG chart ────────────────────────────────────────────────

function WeeklyChart({ data }: { data: WeeklyPoint[] }) {
  if (data.length < 2) return (
    <div className="flex items-center justify-center h-28 text-xs text-white/30 text-center px-4">
      Necesitas al menos 2 semanas de datos para ver la evolución
    </div>
  )

  const W = 320, H = 110
  const pL = 28, pT = 10, pR = 10, pB = 22
  const iW = W - pL - pR, iH = H - pT - pB

  const moodPts  = data.filter(d => d.avgMood !== null)
  const protPts  = data.filter(d => d.proteinCompliance !== null)

  const xS = (i: number) => pL + (i / Math.max(data.length - 1, 1)) * iW
  const yMood = (m: number) => pT + (1 - (m - 1) / 4) * iH
  const yProt = (p: number) => pT + (1 - Math.min(p, 100) / 100) * iH

  const moodPath = moodPts.length >= 2
    ? data.map((d, i) => {
        if (d.avgMood === null) return ''
        const cmd = data.slice(0, i).every(dd => dd.avgMood === null) ? 'M' : 'L'
        return `${cmd}${xS(i).toFixed(1)},${yMood(d.avgMood).toFixed(1)}`
      }).filter(Boolean).join(' ')
    : ''

  const protPath = protPts.length >= 2
    ? data.map((d, i) => {
        if (d.proteinCompliance === null) return ''
        const cmd = data.slice(0, i).every(dd => dd.proteinCompliance === null) ? 'M' : 'L'
        return `${cmd}${xS(i).toFixed(1)},${yProt(d.proteinCompliance).toFixed(1)}`
      }).filter(Boolean).join(' ')
    : ''

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* Grid lines */}
      {[1, 3, 5].map(m => (
        <line key={m} x1={pL} y1={yMood(m)} x2={W - pR} y2={yMood(m)}
          stroke="rgba(255,255,255,0.04)" strokeWidth="1"
        />
      ))}

      {/* Y labels */}
      {[1, 3, 5].map(m => (
        <text key={m} x={pL - 4} y={yMood(m) + 4} fontSize="8" fill="rgba(255,255,255,0.22)" textAnchor="end">
          {m}
        </text>
      ))}

      {/* Protein compliance line */}
      {protPath && (
        <path d={protPath} fill="none" stroke="rgb(52,211,153)" strokeWidth="1.5"
          strokeDasharray="4,3" strokeLinecap="round" strokeLinejoin="round" opacity="0.55"
        />
      )}

      {/* Mood line */}
      {moodPath && (
        <path d={moodPath} fill="none" stroke="rgb(99,102,241)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        />
      )}

      {/* Mood dots */}
      {data.map((d, i) =>
        d.avgMood !== null ? (
          <circle key={i} cx={xS(i)} cy={yMood(d.avgMood)} r="3"
            fill="rgb(99,102,241)" stroke="rgb(30,30,40)" strokeWidth="1.5"
          />
        ) : null,
      )}

      {/* X labels */}
      {data.map((d, i) => (
        <text key={i} x={xS(i)} y={H - 4} fontSize="8" fill="rgba(255,255,255,0.22)" textAnchor="middle">
          {d.label}
        </text>
      ))}
    </svg>
  )
}

// ── Correlation bar ───────────────────────────────────────────────────────────

function CorrBar({ label, g1Label, g1Mood, g2Label, g2Mood, diffPct, positive }: {
  label: string
  g1Label: string; g1Mood: number
  g2Label: string; g2Mood: number
  diffPct: number; positive: boolean
}) {
  const maxMood = 5
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/50">{label}</span>
        <span className={`text-[11px] font-semibold ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
          {positive ? '+' : '-'}{diffPct}%
        </span>
      </div>
      <div className="space-y-1.5">
        {[{ label: g1Label, mood: g1Mood }, { label: g2Label, mood: g2Mood }].map((g, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-white/30 w-28 shrink-0 truncate">{g.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden">
              <div
                className={`h-full rounded-full ${i === 0 && positive || i === 1 && !positive ? 'bg-emerald-500' : 'bg-rose-400'}`}
                style={{ width: `${(g.mood / maxMood) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-white/40 tabular-nums w-6 text-right">{g.mood}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── No data state ─────────────────────────────────────────────────────────────

function NoDataState({ daysNeeded }: { daysNeeded: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-2xl bg-[#1E1E28] border border-white/8 p-8 text-center space-y-3"
    >
      <p className="text-4xl">🧠</p>
      <p className="text-sm font-medium text-white/70">Aprendiendo tus patrones</p>
      <p className="text-xs text-white/35 max-w-xs mx-auto leading-relaxed">
        Necesito {daysNeeded} días más de datos en el diario para detectar correlaciones significativas. Escribe cada día.
      </p>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PatronesPage() {
  const [days, setDays]       = useState(30)
  const [result, setResult]   = useState<PatternResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)

  const load = async (d: number, force = false) => {
    setLoading(true)
    setError(false)
    if (force) invalidatePatternsCache()
    try {
      const r = await analyzePatterns(d)
      setResult(r)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(days) }, [days])

  const corrs = result?.correlations
  const hasAnyCorr = corrs && Object.values(corrs).some(c => c !== null)

  return (
    <div className="px-4 pb-28 pt-5 md:px-6 lg:px-8 max-w-3xl mx-auto space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <h1 className="text-xl font-bold text-white/90">🧠 Patrones</h1>
          <p className="text-xs text-white/35 mt-0.5">Lo que tus datos dicen sobre ti</p>
        </div>
        <button
          onClick={() => load(days, true)}
          disabled={loading}
          className="w-8 h-8 rounded-xl bg-white/4 hover:bg-white/8 flex items-center justify-center transition-colors disabled:opacity-30"
          title="Recalcular"
        >
          {loading
            ? <Loader2 size={14} className="animate-spin text-white/40" />
            : <RefreshCw size={14} className="text-white/40" />}
        </button>
      </motion.div>

      {/* ── Period selector ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
        className="flex gap-2"
      >
        {PERIODS.map(p => (
          <button
            key={p.days}
            onClick={() => setDays(p.days)}
            className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              days === p.days
                ? 'bg-white/12 text-white/90'
                : 'bg-white/4 text-white/40 hover:bg-white/8'
            }`}
          >
            {p.label}
          </button>
        ))}
      </motion.div>

      {/* ── Loading skeleton ────────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-3">
          {[80, 60, 120, 100].map((h, i) => (
            <div key={i} className={`h-${h < 100 ? '['+h+'px]' : '['+h+'px]'} rounded-2xl bg-white/4 animate-pulse`}
              style={{ height: h }} />
          ))}
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {!loading && error && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-5 text-center">
          <p className="text-sm text-rose-400">Error al cargar los datos. Prueba a recargar.</p>
        </div>
      )}

      {/* ── Not enough data ─────────────────────────────────────────────────── */}
      {!loading && result && !result.hasEnoughData && (
        <NoDataState daysNeeded={result.daysNeeded} />
      )}

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {!loading && result && result.hasEnoughData && (
        <>
          {/* ── Data coverage ───────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
            className="flex gap-3"
          >
            {[
              { label: 'Días con diario', value: result.daysWithMood, total: result.totalDays },
              { label: 'Días con nutrición', value: result.daysWithNutrition, total: result.totalDays },
            ].map(s => (
              <div key={s.label} className="flex-1 rounded-xl bg-white/4 border border-white/6 px-3 py-2.5">
                <p className="text-[10px] text-white/30">{s.label}</p>
                <p className="text-base font-bold text-white/80 tabular-nums mt-0.5">
                  {s.value}
                  <span className="text-xs font-normal text-white/30">/{s.total}d</span>
                </p>
              </div>
            ))}
          </motion.div>

          {/* ── Discoveries / Insights ──────────────────────────────────────── */}
          {result.insights.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.10 }}
              className="space-y-3"
            >
              <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">
                Descubrimientos
              </p>
              {result.insights.map((ins, i) => (
                <InsightCard key={i} insight={ins} />
              ))}
            </motion.section>
          )}

          {/* ── Correlations ────────────────────────────────────────────────── */}
          {hasAnyCorr && (
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 }}
              className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5 space-y-5"
            >
              <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">
                Correlaciones con el mood
              </p>
              {corrs.ejercicio && (
                <CorrBar
                  label="Ejercicio"
                  g1Label={corrs.ejercicio.g1Label} g1Mood={corrs.ejercicio.g1Mood}
                  g2Label={corrs.ejercicio.g2Label} g2Mood={corrs.ejercicio.g2Mood}
                  diffPct={corrs.ejercicio.diffPct}  positive={corrs.ejercicio.g1Better}
                />
              )}
              {corrs.proteina && (
                <CorrBar
                  label="Proteína"
                  g1Label={corrs.proteina.g1Label} g1Mood={corrs.proteina.g1Mood}
                  g2Label={corrs.proteina.g2Label} g2Mood={corrs.proteina.g2Mood}
                  diffPct={corrs.proteina.diffPct}  positive={corrs.proteina.g1Better}
                />
              )}
              {corrs.pasos && (
                <CorrBar
                  label="Pasos"
                  g1Label={corrs.pasos.g1Label} g1Mood={corrs.pasos.g1Mood}
                  g2Label={corrs.pasos.g2Label} g2Mood={corrs.pasos.g2Mood}
                  diffPct={corrs.pasos.diffPct}  positive={corrs.pasos.g1Better}
                />
              )}
              {corrs.sueno && (
                <CorrBar
                  label="Sueño"
                  g1Label={corrs.sueno.g1Label} g1Mood={corrs.sueno.g1Mood}
                  g2Label={corrs.sueno.g2Label} g2Mood={corrs.sueno.g2Mood}
                  diffPct={corrs.sueno.diffPct}  positive={corrs.sueno.g1Better}
                />
              )}
            </motion.section>
          )}

          {/* ── Streaks ─────────────────────────────────────────────────────── */}
          {result.streaks.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="space-y-3"
            >
              <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">
                Rachas actuales
              </p>
              <div className="grid grid-cols-2 gap-3">
                {result.streaks.map((s, i) => (
                  <StreakPill key={i} streak={s} />
                ))}
              </div>
            </motion.section>
          )}

          {/* ── Weekday heatmap ─────────────────────────────────────────────── */}
          {result.weekdayMoods.some(w => w.avgMood !== null) && (
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
              className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">
                  Mapa de calor semanal
                </p>
                <p className="text-[10px] text-white/25">mood promedio por día</p>
              </div>
              <WeekdayHeatmap data={result.weekdayMoods} />
              <div className="flex items-center gap-4 mt-3">
                {[
                  { color: 'bg-emerald-500', label: '≥4.5' },
                  { color: 'bg-blue-500',    label: '3.5–4.4' },
                  { color: 'bg-amber-500',   label: '2.5–3.4' },
                  { color: 'bg-rose-500',    label: '<2.5' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-sm ${l.color}`} />
                    <span className="text-[9px] text-white/25">{l.label}</span>
                  </div>
                ))}
              </div>
            </motion.section>
          )}

          {/* ── Weekly evolution ────────────────────────────────────────────── */}
          {result.weeklyData.length >= 2 && (
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.26 }}
              className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">
                  Evolución histórica
                </p>
              </div>
              <div className="mt-3">
                <WeeklyChart data={result.weeklyData} />
              </div>
              <div className="flex items-center gap-5 mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 bg-indigo-500 rounded-full" />
                  <span className="text-[10px] text-white/30">Mood</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg width="16" height="4">
                    <line x1="0" y1="2" x2="16" y2="2" stroke="rgb(52,211,153)" strokeWidth="1.5" strokeDasharray="4,3" />
                  </svg>
                  <span className="text-[10px] text-white/30">Proteína %</span>
                </div>
              </div>
            </motion.section>
          )}
        </>
      )}
    </div>
  )
}
