import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageCircle, RefreshCw, Loader2 } from 'lucide-react'
import {
  getLatestReports,
  generateWeeklyReport,
  markReportRead,
  type WeeklyReport,
} from '@/services/weeklyReport.service'

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  emoji, title, children, accent,
}: {
  emoji: string
  title: string
  children: React.ReactNode
  accent?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl bg-[#1E1E28] border ${accent ?? 'border-white/8'} p-5`}
    >
      <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-3">
        {emoji} {title}
      </p>
      {children}
    </motion.div>
  )
}

// ── Compliance bar ────────────────────────────────────────────────────────────

function ComplianceBar({ value, total, label, color }: {
  value: number; total: number; label: string; color: string
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/40">{label}</span>
        <span className="text-[11px] font-semibold text-white/70">{value}/{total}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  )
}

// ── Report view ───────────────────────────────────────────────────────────────

function ReportView({ report }: { report: WeeklyReport }) {
  const navigate = useNavigate()

  const moodColor = (m: number | null) =>
    m === null ? 'text-white/30' :
    m >= 4 ? 'text-emerald-400' :
    m >= 3 ? 'text-amber-400' : 'text-rose-400'

  const protCumplimiento = report.nutricion.totalDias > 0
    ? Math.round((report.nutricion.diasCumpliendoProteina / report.nutricion.totalDias) * 100)
    : 0

  const entCumplimiento = report.entrenamientos.objetivo > 0
    ? Math.round((report.entrenamientos.completados / report.entrenamientos.objetivo) * 100)
    : 0

  const handleOpenChat = () => {
    // Navigate to IA page — context is already injected globally
    navigate('/ia')
  }

  return (
    <div className="space-y-4">
      {/* Bienestar */}
      <MetricCard emoji="😊" title="Bienestar" accent="border-indigo-500/20">
        <div className="flex items-baseline gap-2 mb-3">
          <span className={`text-3xl font-bold tabular-nums ${moodColor(report.bienestar.moodPromedio)}`}>
            {report.bienestar.moodPromedio ?? '—'}
          </span>
          <span className="text-sm text-white/30">/5 mood promedio</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          {report.bienestar.mejorDia && (
            <div>
              <p className="text-white/25 mb-0.5">Mejor día</p>
              <p className="text-emerald-400">{report.bienestar.mejorDia}</p>
            </div>
          )}
          {report.bienestar.peorDia && (
            <div>
              <p className="text-white/25 mb-0.5">Peor día</p>
              <p className="text-rose-400">{report.bienestar.peorDia}</p>
            </div>
          )}
        </div>
        <p className="text-[10px] text-white/20 mt-2">{report.bienestar.entriesCount} entradas de diario</p>
      </MetricCard>

      {/* Nutrición */}
      <MetricCard emoji="🍗" title="Nutrición">
        <div className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-white/80">
              {report.nutricion.promedioProteina}g
            </span>
            <span className="text-sm text-white/30">
              proteína/día (obj. {report.nutricion.objetivoProteina}g)
            </span>
          </div>
          <ComplianceBar
            value={report.nutricion.diasCumpliendoProteina}
            total={report.nutricion.totalDias}
            label="Días cumpliendo proteína ≥80%"
            color={protCumplimiento >= 70 ? 'bg-emerald-500' : protCumplimiento >= 50 ? 'bg-amber-500' : 'bg-rose-500'}
          />
          {report.nutricion.mejorDia && (
            <div className="text-[11px] text-white/35">
              Mejor: {report.nutricion.mejorDia} · Peor: {report.nutricion.peorDia}
            </div>
          )}
        </div>
      </MetricCard>

      {/* Actividad */}
      <MetricCard emoji="👟" title="Actividad física">
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-3xl font-bold tabular-nums text-blue-400">
            {report.actividad.promedioDiario.toLocaleString('es-ES')}
          </span>
          <span className="text-sm text-white/30">pasos/día</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <p className="text-white/25 mb-0.5">Total semana</p>
            <p className="text-white/70">{report.actividad.pasosTotales.toLocaleString('es-ES')} pasos</p>
          </div>
          {report.actividad.diaMasActivo && (
            <div>
              <p className="text-white/25 mb-0.5">Día más activo</p>
              <p className="text-blue-400">{report.actividad.diaMasActivo}</p>
            </div>
          )}
        </div>
        <p className="text-[10px] text-white/20 mt-2">{report.actividad.diasConDatos} días con datos</p>
      </MetricCard>

      {/* Entrenamientos */}
      <MetricCard emoji="💪" title="Entrenamientos">
        <div className="flex items-baseline gap-2 mb-3">
          <span className={`text-3xl font-bold tabular-nums ${
            entCumplimiento >= 75 ? 'text-emerald-400' : entCumplimiento >= 50 ? 'text-amber-400' : 'text-rose-400'
          }`}>
            {report.entrenamientos.completados}
          </span>
          <span className="text-sm text-white/30">/ {report.entrenamientos.objetivo} días planificados</span>
        </div>
        <ComplianceBar
          value={report.entrenamientos.completados}
          total={report.entrenamientos.objetivo}
          label="Cumplimiento"
          color={entCumplimiento >= 75 ? 'bg-emerald-500' : entCumplimiento >= 50 ? 'bg-amber-500' : 'bg-rose-500'}
        />
      </MetricCard>

      {/* AI insight */}
      {report.insight && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl bg-violet-500/8 border border-violet-500/20 p-5"
        >
          <p className="text-[10px] font-semibold tracking-widest uppercase text-violet-400/60 mb-2">
            ✨ Observación cruzada
          </p>
          <p className="text-[13.5px] text-white/70 leading-relaxed">{report.insight}</p>
        </motion.div>
      )}

      {/* Chat button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        onClick={handleOpenChat}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-white/6 border border-white/10 py-4 text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white/80 transition"
      >
        <MessageCircle size={16} />
        Hablar sobre este informe con la IA
      </motion.button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function InformeSemanalPage() {
  const navigate = useNavigate()
  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const list = await getLatestReports(8)
        setReports(list)
        if (list.length > 0 && !list[0].read) {
          markReportRead(list[0].weekKey).catch(() => {})
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const r = await generateWeeklyReport()
      setReports(prev => [r, ...prev.filter(p => p.weekKey !== r.weekKey)])
      setSelectedIdx(0)
    } finally {
      setGenerating(false)
    }
  }

  const selected = reports[selectedIdx]

  return (
    <div className="px-4 pb-28 pt-5 md:px-6 lg:px-8 max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl bg-white/4 hover:bg-white/8 flex items-center justify-center transition"
        >
          <ArrowLeft size={16} className="text-white/50" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white/90">📊 Informe semanal</h1>
          {selected && (
            <p className="text-xs text-white/35 mt-0.5">{selected.semana}</p>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          title="Generar informe de esta semana"
          className="w-9 h-9 rounded-xl bg-white/4 hover:bg-white/8 flex items-center justify-center transition disabled:opacity-30"
        >
          {generating
            ? <Loader2 size={15} className="animate-spin text-white/40" />
            : <RefreshCw size={15} className="text-white/40" />}
        </button>
      </div>

      {/* Week selector */}
      {reports.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {reports.map((r, i) => (
            <button
              key={r.weekKey}
              onClick={() => { setSelectedIdx(i); if (!r.read) markReportRead(r.weekKey).catch(() => {}) }}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition relative ${
                i === selectedIdx
                  ? 'bg-white/12 text-white/90'
                  : 'bg-white/4 text-white/40 hover:bg-white/8'
              }`}
            >
              {r.semana.slice(0, 12)}...
              {!r.read && i !== selectedIdx && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[160, 130, 140, 120].map((h, i) => (
            <div key={i} className="rounded-2xl bg-white/4 animate-pulse" style={{ height: h }} />
          ))}
        </div>
      )}

      {/* No reports */}
      {!loading && reports.length === 0 && (
        <div className="rounded-2xl bg-[#1E1E28] border border-white/8 p-10 text-center space-y-3">
          <p className="text-4xl">📊</p>
          <p className="text-sm font-medium text-white/70">Sin informes aún</p>
          <p className="text-xs text-white/35 max-w-xs mx-auto leading-relaxed">
            Los informes se generan automáticamente cada domingo. Puedes generar uno ahora manualmente.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="mt-2 px-5 py-2 rounded-xl bg-white/8 border border-white/12 text-sm text-white/60 hover:bg-white/12 transition disabled:opacity-40"
          >
            {generating ? 'Generando...' : 'Generar ahora'}
          </button>
        </div>
      )}

      {/* Report */}
      {!loading && selected && <ReportView report={selected} />}
    </div>
  )
}
