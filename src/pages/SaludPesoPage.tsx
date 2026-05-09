import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Plus, Pencil, Trash2, Loader2, Scale } from 'lucide-react'
import { useWeights } from '@/features/health/useWeights'
import type { WeightEntry } from '@/features/health/types'

// ── Types ─────────────────────────────────────────────────────────────────────
type Range = '7d' | '30d' | '90d' | '1a' | 'todo'
const RANGES: { key: Range; label: string }[] = [
  { key: '7d',   label: '7d'  },
  { key: '30d',  label: '30d' },
  { key: '90d',  label: '90d' },
  { key: '1a',   label: '1 año' },
  { key: 'todo', label: 'Todo' },
]
const RANGE_DAYS: Record<Range, number | null> = {
  '7d': 7, '30d': 30, '90d': 90, '1a': 365, 'todo': null,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtWeight = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const toDateInput = (d: Date) => d.toISOString().split('T')[0]
const fromDateInput = (s: string) => new Date(`${s}T12:00:00`)

function fmtDate(d: Date, range: Range): string {
  if (range === '7d')  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })
  if (range === '30d' || range === '90d') return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

function fmtFull(d: Date): string {
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ payload: { ts: number; weight: number } }>
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null
  return (
    <div className="rounded-xl bg-[#1a1a24] border border-white/10 px-3 py-2 text-xs shadow-xl">
      <p className="text-white/40 mb-0.5">
        {new Date(point.ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
      <p className="text-white/90 font-semibold">{fmtWeight(point.weight)} kg</p>
    </div>
  )
}

// ── Weight modal ──────────────────────────────────────────────────────────────
function WeightModal({
  entry,
  onClose,
  onSave,
}: {
  entry: WeightEntry | null
  onClose: () => void
  onSave: (weight: number, date: Date, note?: string) => Promise<void>
}) {
  const [formWeight, setFormWeight] = useState(entry ? String(entry.weight) : '')
  const [formDate,   setFormDate]   = useState(entry ? toDateInput(entry.date) : toDateInput(new Date()))
  const [formNote,   setFormNote]   = useState(entry?.note ?? '')
  const [weightErr,  setWeightErr]  = useState('')
  const [saving,     setSaving]     = useState(false)

  async function handleSave() {
    const w = parseFloat(formWeight.replace(',', '.'))
    if (isNaN(w) || w < 30 || w > 250) {
      setWeightErr('Introduce un peso entre 30 y 250 kg')
      return
    }
    setWeightErr('')
    setSaving(true)
    try {
      await onSave(w, fromDateInput(formDate), formNote.trim() || undefined)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: 'spring', damping: 28, stiffness: 340 }}
        className="w-full max-w-sm rounded-3xl bg-[#16161f] border border-white/10 shadow-2xl p-6"
      >
        <h3 className="text-base font-semibold text-white/90 mb-5">
          {entry ? 'Editar registro' : 'Añadir registro de peso'}
        </h3>

        {/* Weight */}
        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-widest text-white/30 block mb-1.5">Peso (kg)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              min="30"
              max="250"
              value={formWeight}
              onChange={(e) => { setFormWeight(e.target.value); setWeightErr('') }}
              placeholder="78.5"
              className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-white/90 text-sm focus:outline-none focus:border-blue-500/50 transition-colors scheme-dark"
            />
            <span className="text-sm text-white/35">kg</span>
          </div>
          {weightErr && <p className="text-xs text-rose-400 mt-1.5">{weightErr}</p>}
        </div>

        {/* Date */}
        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-widest text-white/30 block mb-1.5">Fecha</label>
          <input
            type="date"
            value={formDate}
            max={toDateInput(new Date())}
            onChange={(e) => setFormDate(e.target.value)}
            className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-white/90 text-sm focus:outline-none focus:border-blue-500/50 transition-colors scheme-dark"
          />
        </div>

        {/* Note */}
        <div className="mb-6">
          <label className="text-[10px] uppercase tracking-widest text-white/30 block mb-1.5">Nota (opcional)</label>
          <textarea
            value={formNote}
            onChange={(e) => setFormNote(e.target.value)}
            rows={2}
            placeholder="Ej: tras ayuno, con ropa ligera…"
            className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-white/90 text-sm placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border border-white/8 bg-white/3 py-3 text-sm text-white/50 hover:text-white/80 hover:bg-white/6 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !formWeight.trim()}
            className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function SaludPesoPage() {
  const { weights, loading, error, loadWeights, addWeight, updateWeight, deleteWeight, lastWeight } = useWeights()
  const [range, setRange] = useState<Range>('90d')
  const [modalEntry, setModalEntry] = useState<WeightEntry | 'add' | null>(null)

  useEffect(() => { loadWeights() }, [loadWeights])

  // ── Filtered chart data (ascending for recharts) ──────────────────────────
  const chartData = useMemo(() => {
    const days = RANGE_DAYS[range]
    const cutoff = days ? Date.now() - days * 86_400_000 : 0
    return weights
      .filter((w) => w.date.getTime() >= cutoff)
      .slice()
      .reverse()
      .map((w) => ({ ts: w.date.getTime(), weight: w.weight }))
  }, [weights, range])

  // ── Y-axis domain ─────────────────────────────────────────────────────────
  const yDomain = useMemo((): [number, number] => {
    if (!chartData.length) return [50, 100]
    const vals = chartData.map((d) => d.weight)
    return [Math.floor(Math.min(...vals) - 1.5), Math.ceil(Math.max(...vals) + 1.5)]
  }, [chartData])

  // ── Stats ─────────────────────────────────────────────────────────────────
  const { min30, max30, weekDelta } = useMemo(() => {
    const cut30 = Date.now() - 30 * 86_400_000
    const last30 = weights.filter((w) => w.date.getTime() >= cut30)
    const vals30 = last30.map((w) => w.weight)
    const weekAgoCut = Date.now() - 7 * 86_400_000
    const weekAgoEntry = weights.find((w) => w.date.getTime() <= weekAgoCut)
    return {
      min30: vals30.length ? Math.min(...vals30) : null,
      max30: vals30.length ? Math.max(...vals30) : null,
      weekDelta:
        lastWeight && weekAgoEntry
          ? Math.round((lastWeight.weight - weekAgoEntry.weight) * 10) / 10
          : null,
    }
  }, [weights, lastWeight])

  async function handleSave(weight: number, date: Date, note?: string) {
    if (modalEntry && modalEntry !== 'add') {
      await updateWeight(modalEntry.id, { weight, date, note })
    } else {
      await addWeight(weight, date, note)
    }
  }

  async function handleDelete(entry: WeightEntry) {
    if (!confirm(`¿Borrar el registro de ${fmtWeight(entry.weight)} kg?`)) return
    await deleteWeight(entry.id)
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-4xl mx-auto">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-white/35">Salud · Cuerpo</p>
            <h1 className="text-3xl font-bold text-white/90 mt-1">Peso</h1>
          </div>
          <button
            onClick={() => setModalEntry('add')}
            className="flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition shrink-0"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Añadir registro</span>
            <span className="sm:hidden">Añadir</span>
          </button>
        </div>
      </motion.div>

      {error && (
        <div className="mb-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {loading && !weights.length ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="text-white/20 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">

          {/* Summary card */}
          <motion.section
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5"
          >
            {lastWeight ? (
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-1">
                  <p className="text-[10px] uppercase tracking-widest text-white/25 mb-1">Peso actual</p>
                  <div className="flex items-baseline gap-3">
                    <span className="text-5xl font-bold text-white/95 tracking-tight">
                      {fmtWeight(lastWeight.weight)}
                    </span>
                    <span className="text-xl text-white/35">kg</span>
                    {weekDelta !== null && (
                      <span className={`text-base font-semibold ${weekDelta < 0 ? 'text-emerald-400' : weekDelta > 0 ? 'text-rose-400' : 'text-white/40'}`}>
                        {weekDelta > 0 ? '+' : ''}{fmtWeight(weekDelta)} kg esta semana
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/30 mt-1">{fmtFull(lastWeight.date)}</p>
                </div>
                <div className="flex gap-3">
                  {min30 !== null && (
                    <div className="rounded-2xl bg-emerald-500/8 border border-emerald-500/15 px-4 py-3 text-center">
                      <p className="text-[10px] text-white/30 mb-0.5">Mínimo 30d</p>
                      <p className="text-sm font-semibold text-emerald-400">{fmtWeight(min30)} kg</p>
                    </div>
                  )}
                  {max30 !== null && (
                    <div className="rounded-2xl bg-rose-500/8 border border-rose-500/15 px-4 py-3 text-center">
                      <p className="text-[10px] text-white/30 mb-0.5">Máximo 30d</p>
                      <p className="text-sm font-semibold text-rose-400">{fmtWeight(max30)} kg</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-6 gap-3">
                <Scale size={36} className="text-white/15" />
                <p className="text-sm text-white/35">Sin registros de peso todavía</p>
                <button
                  onClick={() => setModalEntry('add')}
                  className="rounded-xl bg-blue-600/20 border border-blue-500/20 px-4 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-600/30 transition"
                >
                  + Añadir primer registro
                </button>
              </div>
            )}
          </motion.section>

          {/* Chart */}
          <motion.section
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5"
          >
            {/* Range selector */}
            <div className="flex items-center justify-between mb-5">
              <p className="text-[10px] uppercase tracking-widest text-white/25">Evolución</p>
              <div className="flex gap-1 rounded-xl bg-white/4 p-1">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      range === r.key
                        ? 'bg-white/10 text-white/90'
                        : 'text-white/35 hover:text-white/60'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {chartData.length < 2 ? (
              <div className="flex items-center justify-center h-40 text-sm text-white/25">
                {chartData.length === 0
                  ? 'Sin datos en el período seleccionado'
                  : 'Necesitas al menos 2 registros para ver la gráfica'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="ts"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(ts: number) => fmtDate(new Date(ts), range)}
                    tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickCount={5}
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v}`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="weight"
                    stroke="#818cf8"
                    strokeWidth={2}
                    fill="url(#weightGrad)"
                    dot={chartData.length <= 14
                      ? { r: 3, fill: '#818cf8', strokeWidth: 0 }
                      : false
                    }
                    activeDot={{ r: 5, fill: '#818cf8', strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </motion.section>

          {/* Entry list */}
          <motion.section
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-widest text-white/25">Registros</p>
              <span className="text-xs text-white/25">{weights.length} entradas</span>
            </div>

            {weights.length === 0 ? (
              <p className="text-sm text-white/30 text-center py-6">No hay registros todavía</p>
            ) : (
              <div className="space-y-2">
                {weights.map((entry, i) => {
                  const prev = weights[i + 1]
                  const d = prev
                    ? Math.round((entry.weight - prev.weight) * 10) / 10
                    : null
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 px-3 py-3 rounded-2xl bg-white/3 border border-white/5 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2.5">
                          <span className="text-sm font-semibold text-white/85">
                            {fmtWeight(entry.weight)} kg
                          </span>
                          {d !== null && (
                            <span className={`text-[11px] font-medium ${d < 0 ? 'text-emerald-400' : d > 0 ? 'text-rose-400' : 'text-white/30'}`}>
                              {d > 0 ? '+' : ''}{fmtWeight(d)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/35 mt-0.5 truncate">
                          {fmtFull(entry.date)}
                          {entry.note && <span className="text-white/25"> · {entry.note}</span>}
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                        <button
                          onClick={() => setModalEntry(entry)}
                          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
                        >
                          <Pencil size={12} className="text-white/50" />
                        </button>
                        <button
                          onClick={() => handleDelete(entry)}
                          className="w-7 h-7 rounded-lg bg-rose-500/8 hover:bg-rose-500/18 flex items-center justify-center transition"
                        >
                          <Trash2 size={12} className="text-rose-400" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.section>
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {modalEntry !== null && (
          <WeightModal
            entry={modalEntry === 'add' ? null : modalEntry}
            onClose={() => setModalEntry(null)}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
