import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, BarChart3, RefreshCw, Dumbbell, Apple, Heart, Lightbulb } from 'lucide-react'
import { callAI, hasAnyAIKey } from '@/services/ai.service'
import { loadProfile, getDayLabel } from '@/services/metabolic.service'

const LAST_REPORT_KEY = 'lifepilot_last_weekly_report'

function getWeekKey() {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${weekNo}`
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_{1,2}(.+?)_{1,2}/g, '$1')
    .replace(/^---+$/gm, '')
    .replace(/^- /gm, '• ')
    .replace(/^\d+\.\s/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface ReportData {
  saludo: string
  resumen: string
  entrenamiento: {
    completados: number
    total: number
    destacado: string
  }
  nutricion: {
    cumplimiento: number
    proteina_media: number
    mejor_dia: string
    peor_dia: string
  }
  bienestar: {
    mood_promedio: number
    mejor_dia: string
    observacion: string
  }
  recomendaciones: string[]
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ icon, title, accent, children }: {
  icon: React.ReactNode; title: string; accent: string; children: React.ReactNode
}) {
  return (
    <div className={`rounded-2xl border p-4 ${accent}`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-widest text-white/50">{title}</span>
      </div>
      {children}
    </div>
  )
}

function ProgressBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  )
}

// ── Structured report view ────────────────────────────────────────────────────

function ReportView({ data }: { data: ReportData }) {
  const trainPct = data.entrenamiento.total > 0
    ? Math.round((data.entrenamiento.completados / data.entrenamiento.total) * 100)
    : 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* Greeting + summary */}
      <div className="rounded-2xl bg-violet-500/10 border border-violet-500/20 px-4 py-3.5">
        <p className="text-sm font-semibold text-violet-200 mb-1">{data.saludo}</p>
        <p className="text-sm text-white/65 leading-relaxed">{data.resumen}</p>
      </div>

      {/* Entrenamiento */}
      <MetricCard
        icon={<Dumbbell size={14} className="text-blue-400" />}
        title="Entrenamiento"
        accent="border-blue-500/20 bg-blue-500/6"
      >
        <div className="flex items-end justify-between mb-2">
          <div>
            <span className="text-2xl font-bold text-white/90">{data.entrenamiento.completados}</span>
            <span className="text-sm text-white/35">/{data.entrenamiento.total} sesiones</span>
          </div>
          <span className={`text-sm font-semibold ${trainPct >= 80 ? 'text-emerald-400' : trainPct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
            {trainPct}%
          </span>
        </div>
        <ProgressBar
          value={data.entrenamiento.completados}
          max={data.entrenamiento.total || 1}
          color={trainPct >= 80 ? 'bg-emerald-500' : trainPct >= 50 ? 'bg-amber-500' : 'bg-red-500'}
        />
        {data.entrenamiento.destacado && (
          <p className="text-xs text-white/45 mt-2">🏆 {data.entrenamiento.destacado}</p>
        )}
      </MetricCard>

      {/* Nutrición */}
      <MetricCard
        icon={<Apple size={14} className="text-green-400" />}
        title="Nutrición"
        accent="border-green-500/20 bg-green-500/6"
      >
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <p className="text-[11px] text-white/35 mb-0.5">Cumplimiento</p>
            <p className="text-lg font-bold text-white/90">{data.nutricion.cumplimiento}%</p>
          </div>
          <div>
            <p className="text-[11px] text-white/35 mb-0.5">Proteína media</p>
            <p className="text-lg font-bold text-white/90">{data.nutricion.proteina_media}g</p>
          </div>
        </div>
        <ProgressBar value={data.nutricion.cumplimiento} color="bg-green-500" />
        <div className="flex gap-3 mt-2 text-[11px] text-white/40">
          {data.nutricion.mejor_dia && <span>✅ Mejor: {data.nutricion.mejor_dia}</span>}
          {data.nutricion.peor_dia && <span>⚠️ Peor: {data.nutricion.peor_dia}</span>}
        </div>
      </MetricCard>

      {/* Bienestar */}
      <MetricCard
        icon={<Heart size={14} className="text-rose-400" />}
        title="Bienestar"
        accent="border-rose-500/20 bg-rose-500/6"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(n => (
              <div key={n}
                className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${
                  n <= Math.round(data.bienestar.mood_promedio)
                    ? 'bg-rose-500/30 text-rose-300'
                    : 'bg-white/5 text-white/20'
                }`}>{n}</div>
            ))}
          </div>
          <span className="text-sm text-white/50">media: <span className="text-white/80 font-semibold">{data.bienestar.mood_promedio.toFixed(1)}</span>/5</span>
        </div>
        {data.bienestar.observacion && (
          <p className="text-xs text-white/45 italic">{data.bienestar.observacion}</p>
        )}
        {data.bienestar.mejor_dia && (
          <p className="text-[11px] text-white/35 mt-1">✨ Mejor día: {data.bienestar.mejor_dia}</p>
        )}
      </MetricCard>

      {/* Recomendaciones */}
      {data.recomendaciones?.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/6 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={14} className="text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Próxima semana</span>
          </div>
          <ul className="space-y-2">
            {data.recomendaciones.slice(0, 3).map((r, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-white/65 leading-snug">
                <span className="shrink-0 text-amber-400 font-bold mt-px">{i + 1}.</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  )
}

// ── Fallback plain text ───────────────────────────────────────────────────────

function FallbackText({ text }: { text: string }) {
  return (
    <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
      {stripMarkdown(text)}
    </p>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface WeeklyReportProps {
  forceOpen?: boolean
  onClose?: () => void
}

export function WeeklyReport({ forceOpen = false, onClose }: WeeklyReportProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [rawFallback, setRawFallback] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (forceOpen) { setOpen(true); return }
    const dow = new Date().getDay()
    const hour = new Date().getHours()
    const lastKey = localStorage.getItem(LAST_REPORT_KEY)
    const thisWeek = getWeekKey()
    if (dow === 0 && hour >= 18 && lastKey !== thisWeek && hasAnyAIKey()) {
      setOpen(true)
    }
  }, [forceOpen])

  useEffect(() => {
    if (open && !reportData && !rawFallback && !loading) generateReport()
  }, [open])

  async function generateReport() {
    setLoading(true)
    setError('')
    setReportData(null)
    setRawFallback('')
    try {
      const profile = loadProfile()
      const dayLabel = getDayLabel(profile)
      const prompt = `Genera el informe semanal de Daniel en formato JSON.
Contexto del usuario: peso ${profile.weight}kg, objetivo ${profile.goal}, proteína objetivo ${Math.round(profile.weight * 2)}g/día.
Hoy es ${dayLabel}.

Responde SOLO con este JSON sin texto adicional ni markdown:
{
  "saludo": "frase de bienvenida corta sin markdown",
  "resumen": "párrafo de 2-3 frases sobre la semana, sin markdown",
  "entrenamiento": {
    "completados": número entre 0 y 7,
    "total": número (días planificados),
    "destacado": "logro más importante esta semana"
  },
  "nutricion": {
    "cumplimiento": número entre 0 y 100,
    "proteina_media": número en gramos,
    "mejor_dia": "nombre del día",
    "peor_dia": "nombre del día"
  },
  "bienestar": {
    "mood_promedio": número entre 1 y 5,
    "mejor_dia": "nombre del día",
    "observacion": "frase corta sin markdown"
  },
  "recomendaciones": ["frase 1 sin markdown", "frase 2", "frase 3"]
}`

      const raw = await callAI(prompt)
      localStorage.setItem(LAST_REPORT_KEY, getWeekKey())

      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          const parsed = JSON.parse(match[0]) as ReportData
          setReportData(parsed)
        } catch {
          setRawFallback(raw)
        }
      } else {
        setRawFallback(raw)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando el informe')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setOpen(false)
    onClose?.()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="w-full sm:max-w-lg bg-[#1E1E28] rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/10 p-6 max-h-[88dvh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
                  <BarChart3 size={18} className="text-violet-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white/90">Informe Semanal</h2>
                  <p className="text-[11px] text-white/35">Análisis IA personalizado</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
              >
                <X size={16} className="text-white/60" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {loading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 size={24} className="animate-spin text-violet-400" />
                  <p className="text-sm text-white/40">Analizando tu semana...</p>
                </div>
              )}
              {error && !loading && (
                <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 text-sm text-rose-300">
                  {error}
                </div>
              )}
              {!loading && reportData && <ReportView data={reportData} />}
              {!loading && rawFallback && !reportData && <FallbackText text={rawFallback} />}
            </div>

            {/* Footer */}
            <div className="mt-5 flex gap-3 pt-4 border-t border-white/6 shrink-0">
              <button
                onClick={generateReport}
                disabled={loading}
                className="flex items-center gap-2 rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/60 hover:border-white/14 transition disabled:opacity-40"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Regenerar
              </button>
              <button
                onClick={handleClose}
                className="flex-1 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500 transition"
              >
                Cerrar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
