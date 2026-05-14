import { useEffect, useState, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PageHeader } from '@/components/layout/PageContainer'
import { Plus, Edit, Trash2, X, Camera, TrendingUp, TrendingDown, Sparkles, RefreshCw, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react'
import {
  subscribeWealthAssets,
  subscribePatrimonioSnapshots,
  addWealthAsset,
  updateWealthAsset,
  deleteWealthAsset,
  savePatrimonioSnapshot,
  seedDefaultAssetsIfEmpty,
  calcTotal,
  calcBreakdown,
  getWealthAnalysis,
  saveWealthAnalysis,
  fmtEur,
  TIPO_PRODUCTO_OPTIONS,
  TIPO_ACTIVO_OPTIONS,
} from '@/services/wealth.service'
import { callAI, hasAnyAIKey } from '@/services/ai.service'
import type {
  WealthAsset,
  PatrimonioSnapshot,
  WealthAnalysis,
  TipoProducto,
  TipoActivo,
} from '@/types/wealth'

// ── Constants ────────────────────────────────────────────────────────────────

const LAST_CAPTURE_KEY = 'patrimonio_last_capture'
const REMINDER_DAYS    = 28

const ACTIVO_CFG = {
  Liquidez:       { color: '#F59E0B', text: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/25',   label: '💵 Liquidez',        bar: 'bg-amber-500' },
  'Renta Fija':   { color: '#3B82F6', text: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/25',    label: '📊 Renta Fija',      bar: 'bg-blue-500' },
  'Renta Variable':{ color: '#10B981',text: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/25', label: '📈 Renta Variable',  bar: 'bg-emerald-500' },
  Cripto:         { color: '#F97316', text: 'text-orange-400',  bg: 'bg-orange-500/15',  border: 'border-orange-500/25',  label: '₿ Cripto',           bar: 'bg-orange-500' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function fmtDelta(val: number, prefix = true): string {
  const sign = val >= 0 ? '+' : ''
  return `${prefix ? sign : ''}${fmtEur(val)}`
}

function fmtPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onload = () => res((reader.result as string).split(',')[1])
    reader.onerror = rej
    reader.readAsDataURL(file)
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DonutChart({ breakdown, total }: { breakdown: ReturnType<typeof calcBreakdown>; total: number }) {
  if (total === 0) return null

  const segs = [
    { key: 'liquidez'      as const, pct: (breakdown.liquidez       / total) * 100 },
    { key: 'rentaFija'     as const, pct: (breakdown.rentaFija      / total) * 100 },
    { key: 'rentaVariable' as const, pct: (breakdown.rentaVariable  / total) * 100 },
    { key: 'cripto'        as const, pct: (breakdown.cripto         / total) * 100 },
  ].filter(s => s.pct > 0)

  const colors = { liquidez: '#F59E0B', rentaFija: '#3B82F6', rentaVariable: '#10B981', cripto: '#F97316' }

  // Build conic-gradient string
  let acc = 0
  const stops = segs.map(s => {
    const from = acc
    acc += s.pct
    return `${colors[s.key]} ${from.toFixed(2)}% ${acc.toFixed(2)}%`
  })

  return (
    <div
      className="relative w-28 h-28 shrink-0"
      style={{ background: `conic-gradient(${stops.join(', ')})`, borderRadius: '50%' }}
    >
      <div className="absolute inset-[22%] rounded-full bg-[#09090E]" />
    </div>
  )
}

interface LineChartProps {
  snapshots: PatrimonioSnapshot[]
}

function LineChart({ snapshots }: LineChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)

  const ordered = useMemo(
    () => [...snapshots].sort((a, b) => a.date.localeCompare(b.date)),
    [snapshots],
  )

  if (ordered.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-white/30">
        <TrendingUp size={28} className="mb-2 text-white/20" />
        <p className="text-sm">Añade más registros mensuales para ver la evolución</p>
      </div>
    )
  }

  const W = 560; const H = 160
  const PL = 62; const PR = 16; const PT = 14; const PB = 32
  const plotW = W - PL - PR; const plotH = H - PT - PB

  const values = ordered.map(s => s.totalEUR)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1

  const toX = (i: number) => PL + (i / (ordered.length - 1)) * plotW
  const toY = (v: number)  => PT + (1 - (v - minVal) / range) * plotH

  const pts = ordered.map((s, i) => `${toX(i)},${toY(s.totalEUR)}`).join(' ')

  // Y axis labels
  const ySteps = [minVal, (minVal + maxVal) / 2, maxVal]

  // X axis labels — show month names, sparse if many points
  const xLabelStep = ordered.length > 8 ? Math.ceil(ordered.length / 6) : 1

  const hovSnap = hovered != null ? ordered[hovered] : null

  return (
    <div className="relative">
      {hovSnap && (
        <div
          className="absolute pointer-events-none z-10 bg-[#1E1E28] border border-amber-500/30 rounded-xl px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(toX(hovered!) / W * 100, 75) + '%',
            top: (toY(hovSnap.totalEUR) / H * 100) - 40 + '%',
          }}
        >
          <p className="text-amber-400 font-semibold">{fmtEur(hovSnap.totalEUR, 2)}</p>
          <p className="text-white/50">{new Date(hovSnap.date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }}>
        {/* Grid lines */}
        {ySteps.map((v, i) => (
          <g key={i}>
            <line x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)} stroke="white" strokeOpacity={0.05} strokeWidth={1} />
            <text x={PL - 6} y={toY(v) + 4} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize={9}>
              {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`${PL},${PT + plotH} ${pts} ${toX(ordered.length - 1)},${PT + plotH}`}
          fill="url(#lineGrad)"
        />

        {/* Main line */}
        <polyline points={pts} fill="none" stroke="#F59E0B" strokeWidth={2} strokeLinejoin="round" />

        {/* X axis labels */}
        {ordered.map((s, i) => {
          if (i % xLabelStep !== 0 && i !== ordered.length - 1) return null
          const d = new Date(s.date + 'T12:00:00')
          return (
            <text key={i} x={toX(i)} y={H - 6} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={9}>
              {d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })}
            </text>
          )
        })}

        {/* Hover circles */}
        {ordered.map((s, i) => (
          <circle
            key={i}
            cx={toX(i)} cy={toY(s.totalEUR)} r={hovered === i ? 5 : 3.5}
            fill={hovered === i ? '#F59E0B' : '#1E1E28'}
            stroke="#F59E0B" strokeWidth={1.5}
            className="cursor-pointer"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>
    </div>
  )
}

function AnalysisDisplay({ analysis, onForce, loading }: {
  analysis: WealthAnalysis
  onForce: () => void
  loading: boolean
}) {
  const score = analysis.puntuacion
  const scoreColor = score >= 8 ? 'text-emerald-400' : score >= 6 ? 'text-blue-400' : score >= 4 ? 'text-amber-400' : 'text-red-400'
  const scoreLabel = score >= 8 ? 'Excelente gestión' : score >= 6 ? 'Buena base' : score >= 4 ? 'Necesita ajustes' : 'Atención necesaria'

  const PRIORIDAD_CFG = {
    inmediata:    { label: '🔴 Inmediata',    bg: 'bg-red-500/15 border-red-500/25',    text: 'text-red-300' },
    corto_plazo:  { label: '🟡 Corto plazo',  bg: 'bg-amber-500/15 border-amber-500/25', text: 'text-amber-300' },
    largo_plazo:  { label: '🔵 Largo plazo',  bg: 'bg-blue-500/15 border-blue-500/25',   text: 'text-blue-300' },
  }
  const NIVEL_CFG = {
    bajo:  { label: 'Bajo',  bg: 'bg-emerald-500/15 border-emerald-500/25', text: 'text-emerald-300' },
    medio: { label: 'Medio', bg: 'bg-amber-500/15 border-amber-500/25',    text: 'text-amber-300' },
    alto:  { label: 'Alto',  bg: 'bg-red-500/15 border-red-500/25',        text: 'text-red-300' },
  }

  return (
    <div className="space-y-4">
      {/* Score + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-5xl font-bold ${scoreColor}`}>{score}</span>
          <div>
            <p className={`text-sm font-semibold ${scoreColor}`}>{scoreLabel}</p>
            <p className="text-xs text-white/30">Salud financiera · /10</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/30 mb-1">
            {analysis.generatedAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <button
            onClick={onForce}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-white/40 hover:text-amber-400 transition disabled:opacity-40"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="rounded-2xl bg-amber-500/8 border border-amber-500/20 p-4">
        <p className="text-sm text-white/80 leading-relaxed">{analysis.resumen}</p>
      </div>

      {/* Puntos fuertes + Áreas mejora */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/15 p-4">
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">✅ Puntos fuertes</p>
          <ul className="space-y-2">
            {analysis.puntos_fuertes.map((p, i) => (
              <li key={i} className="text-sm text-white/70 flex gap-2"><span className="text-emerald-400 shrink-0">✓</span>{p}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-amber-500/5 border border-amber-500/15 p-4">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">⚠️ Áreas de mejora</p>
          <ul className="space-y-2">
            {analysis.areas_mejora.map((a, i) => (
              <li key={i} className="text-sm text-white/70 flex gap-2"><span className="text-amber-400 shrink-0">!</span>{a}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Riesgos */}
      <div>
        <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">Riesgos identificados</p>
        <div className="space-y-2">
          {analysis.riesgos.map((r, i) => {
            const cfg = NIVEL_CFG[r.nivel as keyof typeof NIVEL_CFG] ?? NIVEL_CFG.medio
            return (
              <div key={i} className={`rounded-2xl border ${cfg.bg} p-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                  <span className="text-sm font-semibold text-white/80">{r.tipo}</span>
                </div>
                <p className="text-xs text-white/60 mb-1">{r.descripcion}</p>
                <p className="text-xs text-white/50 italic">→ {r.solucion}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recomendaciones */}
      <div>
        <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">Recomendaciones</p>
        <div className="space-y-2">
          {[...analysis.recomendaciones]
            .sort((a, b) => {
              const o = { inmediata: 0, corto_plazo: 1, largo_plazo: 2 }
              return (o[a.prioridad as keyof typeof o] ?? 2) - (o[b.prioridad as keyof typeof o] ?? 2)
            })
            .map((r, i) => {
              const cfg = PRIORIDAD_CFG[r.prioridad as keyof typeof PRIORIDAD_CFG] ?? PRIORIDAD_CFG.largo_plazo
              return (
                <div key={i} className={`rounded-2xl border ${cfg.bg} p-3`}>
                  <div className="flex items-start gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} shrink-0 mt-0.5`}>{cfg.label}</span>
                    <div>
                      <p className="text-sm font-semibold text-white/85">{r.accion}</p>
                      <p className="text-xs text-white/55 mt-0.5">{r.razon}</p>
                      <p className="text-xs text-white/40 mt-0.5 italic">Impacto: {r.impacto}</p>
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* Proyección */}
      <div>
        <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">Proyección estimada</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[#1a1a24] border border-white/8 p-4 text-center">
            <p className="text-xs text-white/35 mb-1">En 5 años</p>
            <p className="text-lg font-bold text-amber-400">{analysis.proyeccion.a_5_anos}</p>
          </div>
          <div className="rounded-2xl bg-[#1a1a24] border border-white/8 p-4 text-center">
            <p className="text-xs text-white/35 mb-1">En 10 años</p>
            <p className="text-lg font-bold text-amber-400">{analysis.proyeccion.a_10_anos}</p>
          </div>
        </div>
        <p className="text-xs text-white/25 mt-2 italic px-1">{analysis.proyeccion.supuesto}</p>
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-white/20 text-center pt-2 leading-relaxed">
        Este análisis es orientativo y no constituye asesoramiento financiero profesional.
        Consulta con un asesor certificado para decisiones importantes.
      </p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type SortKey = 'nombre' | 'plataforma' | 'tipoActivo' | 'valor' | 'pct'
type Modal = 'none' | 'capture' | 'asset' | 'analysis'

export function PatrimonioPage() {
  const [assets, setAssets]               = useState<WealthAsset[]>([])
  const [snapshots, setSnapshots]         = useState<PatrimonioSnapshot[]>([])
  const [loading, setLoading]             = useState(true)
  const [activeModal, setActiveModal]     = useState<Modal>('none')
  const [editingAsset, setEditingAsset]   = useState<WealthAsset | null>(null)

  // Monthly capture modal state
  const [captureValues, setCaptureValues] = useState<Record<string, string>>({})
  const [savingCapture, setSavingCapture] = useState(false)
  const [scanningImage, setScanningImage] = useState(false)
  const [scanError, setScanError]         = useState<string | null>(null)
  const fileInputRef                      = useRef<HTMLInputElement>(null)

  // Sheets import state
  const [importMode, setImportMode]   = useState<'sheets' | 'image'>('sheets')
  const [sheetsUrl, setSheetsUrl]     = useState(() => localStorage.getItem('lifepilot_sheets_url') ?? '')
  const [sheetsLoading, setSheetsLoading] = useState(false)
  const [sheetsError, setSheetsError] = useState<string | null>(null)

  // Add/edit asset modal state
  const [formNombre, setFormNombre]       = useState('')
  const [formPlataforma, setFormPlataforma] = useState('')
  const [formTipoProducto, setFormTipoProducto] = useState<TipoProducto>('Liquidez')
  const [formTipoActivo, setFormTipoActivo]     = useState<TipoActivo>('Liquidez')
  const [formValor, setFormValor]         = useState('')
  const [savingAsset, setSavingAsset]     = useState(false)

  // Table sorting
  const [sortKey, setSortKey]   = useState<SortKey>('valor')
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc')

  // AI Analysis
  const [analysis, setAnalysis]           = useState<WealthAnalysis | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [showAnalysis, setShowAnalysis]   = useState(false)

  // Mount: seed, subscribe
  useEffect(() => {
    seedDefaultAssetsIfEmpty()
    const unsubA = subscribeWealthAssets(a => { setAssets(a); setLoading(false) })
    const unsubS = subscribePatrimonioSnapshots(setSnapshots)
    return () => { unsubA(); unsubS() }
  }, [])

  // Derived values
  const total        = useMemo(() => calcTotal(assets), [assets])
  const breakdown    = useMemo(() => calcBreakdown(assets), [assets])

  const lastSnapshot = useMemo(() => snapshots[0] ?? null, [snapshots])
  const firstSnapshot= useMemo(() => snapshots[snapshots.length - 1] ?? null, [snapshots])

  const monthDelta = useMemo(() => {
    if (!lastSnapshot) return null
    return total - lastSnapshot.totalEUR
  }, [total, lastSnapshot])

  const totalDelta = useMemo(() => {
    if (!firstSnapshot) return null
    return total - firstSnapshot.totalEUR
  }, [total, firstSnapshot])

  // Monthly reminder
  const lastCapture = localStorage.getItem(LAST_CAPTURE_KEY)
  const daysSinceCapture = daysSince(lastCapture)
  const showReminder = daysSinceCapture === null || daysSinceCapture > REMINDER_DAYS

  // Sorted table
  const sortedAssets = useMemo(() => {
    const t = calcTotal(assets) || 1
    return [...assets].sort((a, b) => {
      let valA: string | number
      let valB: string | number
      if (sortKey === 'pct') { valA = (a.valor / t) * 100; valB = (b.valor / t) * 100 }
      else { valA = a[sortKey] as string | number; valB = b[sortKey] as string | number }
      if (typeof valA === 'string') return sortDir === 'asc' ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA)
      return sortDir === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number)
    })
  }, [assets, sortKey, sortDir])

  // ── Handlers ───────────────────────────────────────────────────────────────

  function openCapture() {
    const init: Record<string, string> = {}
    assets.forEach(a => { init[a.id] = String(a.valor) })
    setCaptureValues(init)
    setScanError(null)
    setSheetsError(null)
    setActiveModal('capture')
  }

  // ── Sheets helpers ────────────────────────────────────────────────────────

  function extractSheetId(url: string): string | null {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    return m?.[1] ?? null
  }

  function parseSimpleCSV(csv: string): string[][] {
    return csv.split('\n').filter(l => l.trim()).map(line => {
      const row: string[] = []
      let cell = '', inQ = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') { if (inQ && line[i + 1] === '"') { cell += '"'; i++ } else inQ = !inQ }
        else if (ch === ',' && !inQ) { row.push(cell.trim()); cell = '' }
        else cell += ch
      }
      row.push(cell.trim())
      return row
    })
  }

  async function handleSheetsSync() {
    const url = sheetsUrl.trim()
    if (!url) { setSheetsError('Pega la URL de tu Google Sheets'); return }
    const sheetId = extractSheetId(url)
    if (!sheetId) { setSheetsError('URL no válida — copia la URL completa de Google Sheets'); return }
    setSheetsLoading(true); setSheetsError(null)
    try {
      const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`)
      if (!res.ok) throw new Error(`Error ${res.status} — Verifica que la hoja esté compartida como "Cualquiera con el enlace"`)
      const csv = await res.text()
      const rows = parseSimpleCSV(csv)
      if (rows.length < 2) throw new Error('La hoja está vacía o no contiene datos')

      const headers = rows[0].map(h => h.toLowerCase().replace(/['"]/g, '').trim())
      const findCol = (...names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)))
      const nombreCol = findCol('nombre', 'activo', 'name', 'asset', 'producto')
      const valorCol  = findCol('valor', 'value', 'importe', 'saldo', 'precio', 'cantidad')

      if (nombreCol < 0 || valorCol < 0) {
        throw new Error(`No se encontraron columnas "Nombre" y "Valor". Cabeceras detectadas: ${rows[0].join(', ')}`)
      }

      const newValues = { ...captureValues }
      let matched = 0
      rows.slice(1).forEach(row => {
        const nombre = row[nombreCol]?.trim()
        const raw = row[valorCol]?.trim().replace(/[€$£\s]/g, '').replace(/,(?=\d{3})/g, '').replace(',', '.')
        const valor = parseFloat(raw)
        if (!nombre || isNaN(valor) || valor <= 0) return
        const asset = assets.find(a =>
          a.nombre.toLowerCase().includes(nombre.toLowerCase()) ||
          nombre.toLowerCase().includes(a.nombre.toLowerCase().split(' ')[0])
        )
        if (asset) { newValues[asset.id] = String(valor); matched++ }
      })

      if (matched === 0) throw new Error('Ningún activo de la hoja coincide con tus activos registrados')
      setCaptureValues(newValues)
      localStorage.setItem('lifepilot_sheets_url', url)
      setSheetsError(null)
    } catch (e) {
      setSheetsError(e instanceof Error ? e.message : 'Error al conectar con Google Sheets')
    }
    setSheetsLoading(false)
  }

  function openAddAsset() {
    setEditingAsset(null)
    setFormNombre(''); setFormPlataforma(''); setFormTipoProducto('Liquidez')
    setFormTipoActivo('Liquidez'); setFormValor('')
    setActiveModal('asset')
  }

  function openEditAsset(asset: WealthAsset) {
    setEditingAsset(asset)
    setFormNombre(asset.nombre); setFormPlataforma(asset.plataforma)
    setFormTipoProducto(asset.tipoProducto); setFormTipoActivo(asset.tipoActivo)
    setFormValor(String(asset.valor))
    setActiveModal('asset')
  }

  async function handleSaveAsset() {
    if (!formNombre.trim() || !formValor) return
    setSavingAsset(true)
    const data = { nombre: formNombre.trim(), plataforma: formPlataforma.trim(), tipoProducto: formTipoProducto, tipoActivo: formTipoActivo, valor: Number(formValor) }
    if (editingAsset) {
      await updateWealthAsset(editingAsset.id, data)
    } else {
      await addWealthAsset(data)
    }
    setSavingAsset(false)
    setActiveModal('none')
  }

  async function handleDeleteAsset(id: string) {
    if (!confirm('¿Eliminar este activo?')) return
    await deleteWealthAsset(id)
  }

  async function handleSaveCapture() {
    setSavingCapture(true)
    const updates = assets.filter(a => captureValues[a.id] && Number(captureValues[a.id]) !== a.valor)
    await Promise.all(updates.map(a => updateWealthAsset(a.id, { valor: Number(captureValues[a.id]) })))
    const updatedAssets = assets.map(a => ({ ...a, valor: captureValues[a.id] ? Number(captureValues[a.id]) : a.valor }))
    await savePatrimonioSnapshot(updatedAssets)
    localStorage.setItem(LAST_CAPTURE_KEY, new Date().toISOString())
    setSavingCapture(false)
    setActiveModal('none')
  }

  async function handleImageScan(file: File) {
    if (!hasAnyAIKey()) { setScanError('Configura una API key de Gemini en Ajustes para usar esta función.'); return }
    setScanningImage(true); setScanError(null)
    try {
      const base64 = await fileToBase64(file)
      const prompt = `Analiza esta imagen de un portfolio o tabla de patrimonio financiero. Extrae cada activo visible con su nombre, valor numérico en euros, plataforma y tipo de producto. Responde ÚNICAMENTE con JSON válido (sin markdown, sin texto adicional):
[{"nombre":"string","valor":number,"plataforma":"string","tipoProducto":"string"}]`
      const raw = await callAI(prompt, { data: base64, mimeType: file.type }, true, 1000)
      const match = raw.match(/\[[\s\S]*\]/)
      if (!match) throw new Error('No se pudo extraer datos de la imagen')
      const parsed = JSON.parse(match[0]) as { nombre: string; valor: number; plataforma: string }[]
      // Match each parsed item to an existing asset by name similarity
      const newValues = { ...captureValues }
      parsed.forEach(item => {
        const matched = assets.find(a =>
          a.nombre.toLowerCase().includes(item.nombre.toLowerCase()) ||
          item.nombre.toLowerCase().includes(a.nombre.toLowerCase())
        )
        if (matched && item.valor > 0) newValues[matched.id] = String(item.valor)
      })
      setCaptureValues(newValues)
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Error al analizar la imagen')
    }
    setScanningImage(false)
  }

  async function loadOrGenerateAnalysis(force = false) {
    if (!hasAnyAIKey()) { setAnalysisError('Configura una API key de Gemini en Ajustes.'); setShowAnalysis(true); return }
    setAnalysisLoading(true); setAnalysisError(null); setShowAnalysis(true)
    try {
      if (!force) {
        const cached = await getWealthAnalysis()
        if (cached) {
          const ageMs = Date.now() - cached.generatedAt.getTime()
          if (ageMs < 7 * 86400000) { setAnalysis(cached); setAnalysisLoading(false); return }
        }
      }
      // Build prompt
      const t = calcTotal(assets)
      const bd = calcBreakdown(assets)
      const assetsStr = assets.map(a => `- ${a.nombre} (${a.plataforma}): ${fmtEur(a.valor, 2)} — ${a.tipoProducto} [${a.tipoActivo}]`).join('\n')
      const histStr = snapshots.length > 0
        ? [...snapshots].sort((a, b) => a.date.localeCompare(b.date)).slice(-6).map(s => `${s.date}: ${fmtEur(s.totalEUR, 0)}`).join('\n')
        : 'Sin histórico disponible'

      const prompt = `Eres un asesor financiero independiente experto en inversión para particulares. Analiza el patrimonio de Daniel (35 años, España, objetivo: independencia financiera a largo plazo, ingresos medios, tiene una hija de 3 años).

PATRIMONIO ACTUAL (${fmtEur(t, 2)}):
${assetsStr}

DISTRIBUCIÓN:
- Liquidez: ${fmtEur(bd.liquidez, 0)} (${((bd.liquidez/t)*100).toFixed(1)}%)
- Renta Fija: ${fmtEur(bd.rentaFija, 0)} (${((bd.rentaFija/t)*100).toFixed(1)}%)
- Renta Variable: ${fmtEur(bd.rentaVariable, 0)} (${((bd.rentaVariable/t)*100).toFixed(1)}%)
- Cripto: ${fmtEur(bd.cripto, 0)} (${((bd.cripto/t)*100).toFixed(1)}%)

EVOLUCIÓN (últimos snapshots):
${histStr}

Responde ÚNICAMENTE con JSON válido (sin markdown, sin texto adicional):
{"puntuacion":8,"resumen":"párrafo 3-4 frases evaluando la situación general","puntos_fuertes":["p1","p2","p3"],"areas_mejora":["a1","a2","a3"],"riesgos":[{"tipo":"...","nivel":"bajo|medio|alto","descripcion":"...","solucion":"..."}],"recomendaciones":[{"accion":"...","prioridad":"inmediata|corto_plazo|largo_plazo","razon":"...","impacto":"..."}],"proyeccion":{"a_5_anos":"...","a_10_anos":"...","supuesto":"..."}}`

      const raw = await callAI(prompt, undefined, true, 2000)
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Respuesta inesperada de la IA')
      const parsed = JSON.parse(match[0])
      const analysis: WealthAnalysis = {
        id: 'latest',
        ...parsed,
        generatedAt: new Date(),
        totalEUR: t,
      }
      await saveWealthAnalysis({ ...parsed, totalEUR: t })
      setAnalysis(analysis)
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : 'Error al generar el análisis')
    }
    setAnalysisLoading(false)
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-white/10 rounded-lg w-48" />
        <div className="h-36 bg-white/5 rounded-3xl" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white/5 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto space-y-5">

      {/* Monthly reminder banner */}
      <AnimatePresence>
        {showReminder && assets.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-amber-500/30 bg-amber-500/8 px-5 py-3 flex items-center gap-3"
          >
            <span className="text-xl">📸</span>
            <p className="text-sm text-amber-200/80 flex-1">
              {daysSinceCapture === null
                ? 'Aún no has registrado tu patrimonio. ¡Empieza ahora!'
                : `Han pasado ${daysSinceCapture} días desde tu último registro de patrimonio`}
            </p>
            <button
              onClick={openCapture}
              className="shrink-0 px-4 py-1.5 rounded-xl bg-amber-500 text-[#09090E] text-sm font-semibold hover:bg-amber-400 transition"
            >
              Actualizar ahora
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <PageHeader
        breadcrumb="Finanzas · Inversiones"
        title="Patrimonio"
        subtitle={lastSnapshot ? `Último registro: ${lastSnapshot.date}` : undefined}
        actions={
          <div className="flex gap-2">
            <button
              onClick={openCapture}
              disabled={assets.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl bg-white/8 border border-white/10 px-4 py-2.5 text-sm font-medium text-white/70 hover:bg-white/12 transition disabled:opacity-40"
            >
              <Camera size={14} /> Actualizar patrimonio
            </button>
            <button
              onClick={openAddAsset}
              className="inline-flex items-center gap-2 rounded-2xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 transition"
            >
              <Plus size={15} /> Añadir activo
            </button>
          </div>
        }
      />

      {/* ── Hero total card ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="rounded-3xl border border-amber-800/30 bg-linear-to-br from-amber-950/50 to-[#1E1E28] p-6"
      >
        <p className="text-[10px] font-semibold tracking-widest uppercase text-amber-500/60 mb-2">Patrimonio total</p>
        <p className="text-5xl font-bold text-amber-400 tracking-tight mb-3">{fmtEur(total, 2)}</p>
        <div className="flex flex-wrap gap-4">
          {monthDelta !== null && (
            <div className="flex items-center gap-1.5">
              {monthDelta >= 0 ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-red-400" />}
              <span className={`text-sm font-semibold ${monthDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtDelta(monthDelta)} ({fmtPct((monthDelta / (lastSnapshot?.totalEUR || 1)) * 100)})
              </span>
              <span className="text-xs text-white/30">vs. último snapshot</span>
            </div>
          )}
          {totalDelta !== null && (
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-medium ${totalDelta >= 0 ? 'text-white/50' : 'text-red-400/70'}`}>
                {fmtDelta(totalDelta)} desde el inicio
              </span>
            </div>
          )}
          {lastSnapshot && (
            <span className="text-xs text-white/25">
              Último snapshot: {new Date(lastSnapshot.date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
      </motion.div>

      {/* ── Distribution + Chart ────────────────────────────────────────────── */}
      {assets.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Donut + legend */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
          >
            <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-4">Distribución por tipo</p>
            <div className="flex items-center gap-5">
              <DonutChart breakdown={breakdown} total={total} />
              <div className="flex-1 space-y-2.5">
                {(Object.entries(ACTIVO_CFG) as [keyof typeof ACTIVO_CFG, typeof ACTIVO_CFG[keyof typeof ACTIVO_CFG]][]).map(([key, cfg]) => {
                  const val = breakdown[key === 'Liquidez' ? 'liquidez' : key === 'Renta Fija' ? 'rentaFija' : key === 'Renta Variable' ? 'rentaVariable' : 'cripto']
                  if (val === 0) return null
                  const pct = total > 0 ? (val / total) * 100 : 0
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
                        <div className="flex gap-2 text-xs">
                          <span className="text-white/40">{fmtEur(val, 0)}</span>
                          <span className="text-white/25 w-10 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.7, ease: 'easeOut' }}
                          className={`h-full rounded-full ${cfg.bar}`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </motion.div>

          {/* Line chart */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">Evolución</p>
              {snapshots.length > 0 && <span className="text-[10px] text-white/20">{snapshots.length} snapshots</span>}
            </div>
            <LineChart snapshots={snapshots} />
          </motion.div>
        </div>
      )}

      {/* ── AI Analysis ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-amber-400" />
            <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">Análisis del experto financiero IA</p>
          </div>
          {!showAnalysis && (
            <button
              onClick={() => loadOrGenerateAnalysis()}
              className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition"
            >
              🤖 Generar análisis
            </button>
          )}
        </div>

        <AnimatePresence>
          {showAnalysis && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.3 }}
              className="mt-4"
            >
              {analysisLoading && (
                <div className="flex items-center gap-3 py-8 justify-center">
                  <motion.div
                    animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full"
                  />
                  <span className="text-sm text-white/50">Analizando tu patrimonio...</span>
                </div>
              )}
              {analysisError && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 flex gap-2">
                  <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300">{analysisError}</p>
                </div>
              )}
              {!analysisLoading && !analysisError && analysis && (
                <AnalysisDisplay
                  analysis={analysis}
                  onForce={() => loadOrGenerateAnalysis(true)}
                  loading={analysisLoading}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Assets table ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">
            Activos ({assets.length})
          </p>
          <button onClick={openAddAsset} className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition">
            <Plus size={12} /> Añadir
          </button>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {([['nombre', 'Nombre'], ['plataforma', 'Plataforma'], ['tipoActivo', 'Tipo'], ['valor', 'Valor'], ['pct', '%']] as [SortKey, string][]).map(([key, label]) => (
                  <th key={key} className="px-4 py-2.5 text-left">
                    <button
                      onClick={() => toggleSort(key)}
                      className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/30 hover:text-white/60 transition"
                    >
                      {label}
                      {sortKey === key && (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                    </button>
                  </th>
                ))}
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sortedAssets.map(asset => {
                const cfg = ACTIVO_CFG[asset.tipoActivo]
                const pct = total > 0 ? (asset.valor / total) * 100 : 0
                return (
                  <tr key={asset.id} className="border-b border-white/4 hover:bg-white/3 group transition">
                    <td className="px-4 py-3">
                      <p className="text-white/80 font-medium">{asset.nombre}</p>
                      <p className="text-xs text-white/35 mt-0.5">{asset.tipoProducto}</p>
                    </td>
                    <td className="px-4 py-3 text-white/50 text-xs">{asset.plataforma}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                        {asset.tipoActivo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-amber-400 font-semibold">{fmtEur(asset.valor, 2)}</td>
                    <td className="px-4 py-3 text-white/35 text-xs">{pct.toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition justify-end">
                        <button onClick={() => openEditAsset(asset)} className="w-6 h-6 rounded-lg bg-white/8 hover:bg-white/14 flex items-center justify-center transition">
                          <Edit size={10} className="text-white/60" />
                        </button>
                        <button onClick={() => handleDeleteAsset(asset.id)} className="w-6 h-6 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition">
                          <Trash2 size={10} className="text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile list */}
        <div className="md:hidden divide-y divide-white/5">
          {sortedAssets.map(asset => {
            const cfg = ACTIVO_CFG[asset.tipoActivo]
            const pct = total > 0 ? (asset.valor / total) * 100 : 0
            return (
              <div key={asset.id} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-8 h-8 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                  <span className="text-base">{asset.tipoActivo === 'Liquidez' ? '💵' : asset.tipoActivo === 'Renta Fija' ? '📊' : asset.tipoActivo === 'Cripto' ? '₿' : '📈'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/80 font-medium truncate">{asset.nombre}</p>
                  <p className="text-xs text-white/35">{asset.plataforma} · {pct.toFixed(1)}%</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-amber-400">{fmtEur(asset.valor, 0)}</p>
                  <div className="flex gap-1 mt-1 justify-end">
                    <button onClick={() => openEditAsset(asset)} className="w-5 h-5 rounded-md bg-white/8 flex items-center justify-center">
                      <Edit size={9} className="text-white/60" />
                    </button>
                    <button onClick={() => handleDeleteAsset(asset.id)} className="w-5 h-5 rounded-md bg-red-500/10 flex items-center justify-center">
                      <Trash2 size={9} className="text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {assets.length === 0 && (
          <div className="text-center py-10">
            <p className="text-4xl mb-2">💼</p>
            <p className="text-sm text-white/40">Añade tu primer activo para empezar</p>
          </div>
        )}
      </motion.div>

      {/* ── MONTHLY CAPTURE MODAL ────────────────────────────────────────────── */}
      <AnimatePresence>
        {activeModal === 'capture' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setActiveModal('none')}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="w-full max-w-lg rounded-3xl border border-white/8 bg-[#1E1E28] max-h-[92vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-[#1E1E28] border-b border-white/5 px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white/90">📊 Actualización mensual</h3>
                  <p className="text-xs text-white/40 mt-0.5">Actualiza los valores actuales de cada activo</p>
                </div>
                <button onClick={() => setActiveModal('none')} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center">
                  <X size={14} className="text-white/60" />
                </button>
              </div>

              <div className="px-6 py-4 space-y-4">

                {/* Import mode toggle */}
                <div className="flex gap-1 rounded-2xl bg-white/5 p-1">
                  <button
                    onClick={() => setImportMode('sheets')}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition ${importMode === 'sheets' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/25' : 'text-white/40 hover:text-white/60'}`}
                  >
                    📊 Google Sheets
                  </button>
                  <button
                    onClick={() => setImportMode('image')}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition ${importMode === 'image' ? 'bg-white/12 text-white' : 'text-white/40 hover:text-white/60'}`}
                  >
                    📷 Subir imagen
                  </button>
                </div>

                {/* Google Sheets import */}
                {importMode === 'sheets' && (
                  <div className="space-y-2">
                    <div className="rounded-2xl bg-white/4 border border-white/6 p-3 text-xs text-white/50 leading-relaxed">
                      <span className="text-white/70 font-medium">Cómo compartir: </span>
                      Abre tu Sheets → Compartir → &quot;Cualquier persona con el enlace&quot; → Lector → Copia la URL
                    </div>
                    <input
                      value={sheetsUrl}
                      onChange={e => setSheetsUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="w-full rounded-2xl bg-white/6 border border-white/10 px-3 py-2.5 text-sm text-white/70 focus:outline-none focus:border-amber-500/30 placeholder:text-white/25"
                    />
                    <button
                      onClick={handleSheetsSync}
                      disabled={sheetsLoading || !sheetsUrl.trim()}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl bg-amber-600 hover:bg-amber-500 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
                    >
                      {sheetsLoading
                        ? <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Sincronizando...</>
                        : '📊 Sincronizar desde Sheets'
                      }
                    </button>
                    {sheetsError && <p className="text-xs text-red-400">{sheetsError}</p>}
                  </div>
                )}

                {/* Image scan */}
                {importMode === 'image' && (
                  <div>
                    <input
                      type="file" accept="image/*" ref={fileInputRef} className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImageScan(f) }}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={scanningImage || !hasAnyAIKey()}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 hover:border-amber-500/40 py-3 text-sm text-white/50 hover:text-amber-400 transition disabled:opacity-40"
                    >
                      {scanningImage
                        ? <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full" /> Analizando imagen...</>
                        : <><Camera size={15} /> 📷 Subir captura de pantalla (IA)</>
                      }
                    </button>
                    {scanError && <p className="mt-1.5 text-xs text-red-400">{scanError}</p>}
                    {!hasAnyAIKey() && <p className="mt-1 text-xs text-white/30 text-center">Configura Gemini en Ajustes para escanear imágenes</p>}
                  </div>
                )}

                {/* Asset rows */}
                <div className="space-y-2">
                  {assets.map(asset => {
                    const prev = asset.valor
                    const curr = captureValues[asset.id] ? Number(captureValues[asset.id]) : prev
                    const delta = curr - prev
                    const deltaPct = prev > 0 ? (delta / prev) * 100 : 0
                    const cfg = ACTIVO_CFG[asset.tipoActivo]
                    return (
                      <div key={asset.id} className="rounded-2xl bg-white/4 border border-white/6 p-3">
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5 text-sm`}>
                            {asset.tipoActivo === 'Liquidez' ? '💵' : asset.tipoActivo === 'Renta Fija' ? '📊' : asset.tipoActivo === 'Cripto' ? '₿' : '📈'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white/80 font-medium truncate">{asset.nombre}</p>
                            <p className="text-xs text-white/35">{asset.plataforma}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <input
                              type="number"
                              value={captureValues[asset.id] ?? asset.valor}
                              onChange={e => setCaptureValues(v => ({ ...v, [asset.id]: e.target.value }))}
                              step="0.01"
                              className="w-28 rounded-xl bg-white/6 border border-white/10 px-3 py-1.5 text-sm text-right text-white/80 focus:outline-none focus:border-amber-500/40"
                            />
                            {delta !== 0 && captureValues[asset.id] && (
                              <p className={`text-xs mt-1 font-medium ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {delta > 0 ? '+' : ''}{fmtEur(delta, 2)} ({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Total preview */}
                <div className="rounded-2xl bg-amber-500/8 border border-amber-500/20 p-3 flex items-center justify-between">
                  <span className="text-sm text-white/60">Nuevo total estimado</span>
                  <span className="text-lg font-bold text-amber-400">
                    {fmtEur(assets.reduce((s, a) => s + (captureValues[a.id] ? Number(captureValues[a.id]) : a.valor), 0), 0)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={handleSaveCapture}
                    disabled={savingCapture}
                    className="flex-1 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold py-3 transition disabled:opacity-50"
                  >
                    {savingCapture ? 'Guardando...' : '💾 Guardar snapshot'}
                  </button>
                  <button onClick={() => setActiveModal('none')} className="px-5 py-3 text-sm text-white/50 hover:text-white/70 transition">
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ADD/EDIT ASSET MODAL ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {activeModal === 'asset' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setActiveModal('none')}
          >
            <motion.div
              initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              className="w-full max-w-sm rounded-3xl border border-white/8 bg-[#1E1E28] p-6 max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-semibold text-white/90">{editingAsset ? 'Editar activo' : 'Nuevo activo'}</h3>
                <button onClick={() => setActiveModal('none')} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center">
                  <X size={14} className="text-white/60" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Nombre</label>
                  <input value={formNombre} onChange={e => setFormNombre(e.target.value)}
                    placeholder="Ej. Vanguard FTSE All-World…"
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none placeholder:text-white/20" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Plataforma</label>
                  <input value={formPlataforma} onChange={e => setFormPlataforma(e.target.value)}
                    placeholder="Ej. BBVA, XTB, Indexa…"
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none placeholder:text-white/20" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Tipo de producto</label>
                  <select value={formTipoProducto} onChange={e => setFormTipoProducto(e.target.value as TipoProducto)}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none">
                    {TIPO_PRODUCTO_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Tipo de activo (para distribución)</label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {TIPO_ACTIVO_OPTIONS.map(t => {
                      const cfg = ACTIVO_CFG[t]
                      return (
                        <button key={t} onClick={() => setFormTipoActivo(t)}
                          className={`py-2 rounded-xl text-xs font-medium border transition-all ${formTipoActivo === t ? `${cfg.bg} ${cfg.border} ${cfg.text}` : 'bg-white/5 border-white/8 text-white/40 hover:text-white/60'}`}>
                          {t}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Valor (€)</label>
                  <input value={formValor} onChange={e => setFormValor(e.target.value)}
                    type="number" min="0" step="0.01" placeholder="0.00"
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none placeholder:text-white/20" />
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={handleSaveAsset} disabled={!formNombre.trim() || !formValor || savingAsset}
                    className="flex-1 rounded-2xl bg-amber-600 hover:bg-amber-500 py-3 text-sm font-semibold text-white transition disabled:opacity-50">
                    {savingAsset ? 'Guardando…' : editingAsset ? 'Actualizar' : 'Añadir'}
                  </button>
                  <button onClick={() => setActiveModal('none')} className="px-4 py-3 text-sm text-white/50 hover:text-white/80 transition">
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
