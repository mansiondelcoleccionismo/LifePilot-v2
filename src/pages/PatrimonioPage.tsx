import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PageHeader } from '@/components/layout/PageContainer'
import { Plus, Edit, Trash2, X, TrendingUp, TrendingDown, Sparkles, RefreshCw, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react'
import {
  subscribeWealthAssets,
  subscribePatrimonioSnapshots,
  addWealthAsset,
  updateWealthAsset,
  deleteWealthAsset,
  syncFromSheets,
  getLastSyncDate,
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

const ACTIVO_CFG = {
  Liquidez:       { color: '#F59E0B', text: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/25',   label: '💵 Liquidez',        bar: 'bg-amber-500' },
  'Renta Fija':   { color: '#3B82F6', text: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/25',    label: '📊 Renta Fija',      bar: 'bg-blue-500' },
  'Renta Variable':{ color: '#10B981',text: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/25', label: '📈 Renta Variable',  bar: 'bg-emerald-500' },
  Cripto:         { color: '#F97316', text: 'text-orange-400',  bg: 'bg-orange-500/15',  border: 'border-orange-500/25',  label: '₿ Cripto',           bar: 'bg-orange-500' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000)
}

function fmtDelta(val: number, prefix = true): string {
  const sign = val >= 0 ? '+' : ''
  return `${prefix ? sign : ''}${fmtEur(val)}`
}

function fmtPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
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

function parseFinancialAnalysis(text: string) {
  const clean = text
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim()

  const getSection = (label: string) => {
    const regex = new RegExp(label + ':?\\s*([\\s\\S]*?)(?=\\n[A-ZÁÉÍÓÚ]{3,}:|$)', 'i')
    const match = clean.match(regex)
    return match ? match[1].trim() : null
  }

  return {
    puntuacion:    parseInt(getSection('PUNTUACIÓN') || getSection('PUNTUACION') || '7') || 7,
    resumen:       getSection('RESUMEN'),
    puntosFuertes: (getSection('PUNTOS FUERTES') || '')
      .split('\n').filter(l => l.trim().startsWith('-'))
      .map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean),
    areasMejora:   (getSection('ÁREAS DE MEJORA') || getSection('AREAS DE MEJORA') || '')
      .split('\n').filter(l => l.trim().startsWith('-'))
      .map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean),
    riesgos:       (getSection('RIESGOS') || '')
      .split('\n').filter(l => l.trim().startsWith('-'))
      .map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean),
    recomendacion: getSection('RECOMENDACIÓN PRINCIPAL') || getSection('RECOMENDACION PRINCIPAL') || 'Continúa con tu estrategia actual',
    proyeccion:    getSection('PROYECCIÓN') || getSection('PROYECCION') || null,
  }
}

function AnalysisDisplay({ analysis, onForce, loading }: {
  analysis: WealthAnalysis
  onForce: () => void
  loading: boolean
}) {
  const score     = analysis.puntuacion
  const scoreColor = score >= 8 ? 'text-emerald-400' : score >= 6 ? 'text-blue-400' : score >= 4 ? 'text-amber-400' : 'text-red-400'
  const scoreBg    = score >= 8 ? 'bg-emerald-500/10 border-emerald-500/25' : score >= 6 ? 'bg-blue-500/10 border-blue-500/25' : score >= 4 ? 'bg-amber-500/10 border-amber-500/25' : 'bg-red-500/10 border-red-500/25'
  const scoreLabel = score >= 8 ? 'Excelente gestión' : score >= 6 ? 'Buena base' : score >= 4 ? 'Necesita ajustes' : 'Atención urgente'
  const riesgos    = analysis.riesgos_texto ?? []

  return (
    <div className="space-y-4">
      {/* Date + refresh */}
      <div className="flex items-center justify-end gap-3">
        <p className="text-xs text-white/30">
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

      {/* Score card */}
      {score > 0 && (
        <div className={`rounded-2xl border ${scoreBg} p-4 flex items-center gap-4`}>
          <p className={`text-5xl font-bold tabular-nums ${scoreColor}`}>
            {score}<span className="text-xl text-white/30">/10</span>
          </p>
          <div>
            <p className={`font-semibold ${scoreColor}`}>{scoreLabel}</p>
            <p className="text-xs text-white/40 mt-0.5">Salud financiera global</p>
          </div>
        </div>
      )}

      {/* Resumen */}
      {analysis.resumen && (
        <div className="rounded-2xl bg-amber-500/8 border border-amber-500/20 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/60 mb-2">Resumen</p>
          <p className="text-sm text-white/80 leading-relaxed">{analysis.resumen}</p>
        </div>
      )}

      {/* Puntos fuertes + Áreas de mejora */}
      {(analysis.puntos_fuertes.length > 0 || analysis.areas_mejora.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {analysis.puntos_fuertes.length > 0 && (
            <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/15 p-4">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">Puntos fuertes</p>
              <ul className="space-y-2">
                {analysis.puntos_fuertes.map((p, i) => (
                  <li key={i} className="text-sm text-white/70 flex gap-2"><span className="shrink-0">✅</span>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {analysis.areas_mejora.length > 0 && (
            <div className="rounded-2xl bg-amber-500/5 border border-amber-500/15 p-4">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">Áreas de mejora</p>
              <ul className="space-y-2">
                {analysis.areas_mejora.map((a, i) => (
                  <li key={i} className="text-sm text-white/70 flex gap-2"><span className="shrink-0">⚠️</span>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Riesgos */}
      {riesgos.length > 0 && (
        <div className="rounded-2xl bg-red-500/5 border border-red-500/15 p-4">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">Riesgos</p>
          <ul className="space-y-2">
            {riesgos.map((r, i) => (
              <li key={i} className="text-sm text-white/70 flex gap-2">
                <span className="shrink-0">{i === 0 ? '🔴' : '🟡'}</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recomendación principal */}
      {analysis.recomendacion_principal && (
        <div className="rounded-2xl bg-blue-500/10 border border-blue-500/25 p-4">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">⚡ Recomendación principal</p>
          <p className="text-sm text-white/80">{analysis.recomendacion_principal}</p>
        </div>
      )}

      {/* Proyección */}
      {analysis.proyeccion_texto && (
        <div className="rounded-2xl bg-white/3 border border-white/8 p-4">
          <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">📈 Proyección estimada</p>
          <p className="text-sm text-white/70">{analysis.proyeccion_texto}</p>
        </div>
      )}

      <p className="text-[10px] text-white/20 text-center pt-2 leading-relaxed">
        Este análisis es orientativo y no constituye asesoramiento financiero profesional.
        Consulta con un asesor certificado para decisiones importantes.
      </p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type SortKey = 'nombre' | 'plataforma' | 'tipoActivo' | 'valor' | 'pct'
type Modal = 'none' | 'asset'

export function PatrimonioPage() {
  const [assets, setAssets]               = useState<WealthAsset[]>([])
  const [snapshots, setSnapshots]         = useState<PatrimonioSnapshot[]>([])
  const [loading, setLoading]             = useState(true)
  const [activeModal, setActiveModal]     = useState<Modal>('none')
  const [editingAsset, setEditingAsset]   = useState<WealthAsset | null>(null)

  // Sheets sync state
  const [syncLoading, setSyncLoading]   = useState(false)
  const [syncError, setSyncError]       = useState<string | null>(null)
  const [lastSyncDate, setLastSyncDate] = useState<Date | null>(() => getLastSyncDate())

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

  // Mount: subscribe + auto-sync if stale
  useEffect(() => {
    const unsubA = subscribeWealthAssets(a => { setAssets(a); setLoading(false) })
    const unsubS = subscribePatrimonioSnapshots(setSnapshots)

    const lastSync = getLastSyncDate()
    const daysSince = lastSync ? daysBetween(lastSync, new Date()) : null
    const isFirst = new Date().getDate() === 1
    if (daysSince === null || daysSince > 28 || isFirst) {
      setSyncLoading(true)
      syncFromSheets()
        .then(() => setLastSyncDate(new Date()))
        .catch(e => setSyncError(e instanceof Error ? e.message : 'Error al sincronizar'))
        .finally(() => setSyncLoading(false))
    }

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

  async function handleSyncFromSheets() {
    setSyncLoading(true)
    setSyncError(null)
    try {
      await syncFromSheets()
      setLastSyncDate(new Date())
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Error al sincronizar con Google Sheets')
    }
    setSyncLoading(false)
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

      const t  = calcTotal(assets)
      const bd = calcBreakdown(assets)
      const assetsStr = assets
        .map(a => `- ${a.nombre} (${a.plataforma}): ${fmtEur(a.valor, 0)} [${a.tipoActivo}]`)
        .join('\n')

      const prompt = `Eres un asesor financiero independiente experto.
Analiza el patrimonio de Daniel (35 años, España, objetivo: independencia financiera a largo plazo).

PATRIMONIO:
${assetsStr}
Total: ${fmtEur(t, 0)}
Distribución: Liquidez ${((bd.liquidez/t)*100).toFixed(0)}% · Renta Fija ${((bd.rentaFija/t)*100).toFixed(0)}% · Renta Variable ${((bd.rentaVariable/t)*100).toFixed(0)}% · Cripto ${((bd.cripto/t)*100).toFixed(0)}%

Escribe un análisis en texto plano con estas secciones separadas por líneas en blanco. Cada sección empieza con el título en mayúsculas seguido de dos puntos:

PUNTUACIÓN: [número del 1 al 10]

RESUMEN: [2-3 frases sobre la situación general]

PUNTOS FUERTES:
- [punto 1]
- [punto 2]
- [punto 3]

ÁREAS DE MEJORA:
- [área 1 con recomendación concreta]
- [área 2]

RIESGOS:
- [riesgo 1]
- [riesgo 2]

RECOMENDACIÓN PRINCIPAL: [una acción concreta a tomar ahora]

PROYECCIÓN: [estimación del patrimonio en 5 y 10 años]

Escribe frases COMPLETAS. Máximo 400 palabras en total.`

      const raw    = await callAI(prompt, undefined, true, 1200)
      const clean  = raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim()
      const parsed = parseFinancialAnalysis(clean)

      const result: WealthAnalysis = {
        id:                      'latest',
        puntuacion:              parsed.puntuacion,
        resumen:                 parsed.resumen || clean,
        puntos_fuertes:          parsed.puntosFuertes.length > 0 ? parsed.puntosFuertes : [],
        areas_mejora:            parsed.areasMejora.length > 0  ? parsed.areasMejora   : [],
        recomendacion_principal: parsed.recomendacion || 'Continúa con tu estrategia actual',
        riesgos_texto:           parsed.riesgos.length > 0 ? parsed.riesgos : undefined,
        proyeccion_texto:        parsed.proyeccion || undefined,
        generatedAt: new Date(),
        totalEUR:    t,
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, generatedAt: _gen, ...saveData } = result
      await saveWealthAnalysis(saveData)
      setAnalysis(result)
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

  const daysSinceSync = lastSyncDate ? daysBetween(lastSyncDate, new Date()) : null

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto space-y-5">

      {/* Sync status banner */}
      <AnimatePresence>
        {syncLoading && (
          <motion.div
            key="syncing"
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-blue-500/25 bg-blue-500/8 px-5 py-3 flex items-center gap-3"
          >
            <motion.div
              animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full shrink-0"
            />
            <p className="text-sm text-blue-200/80">Sincronizando desde Google Sheets...</p>
          </motion.div>
        )}
        {!syncLoading && syncError && (
          <motion.div
            key="sync-error"
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-red-500/25 bg-red-500/8 px-5 py-3 flex items-center gap-3"
          >
            <AlertTriangle size={15} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-300/80 flex-1">{syncError}</p>
            <button onClick={() => setSyncError(null)} className="text-xs text-white/30 hover:text-white/60 transition shrink-0">✕</button>
          </motion.div>
        )}
        {!syncLoading && !syncError && lastSyncDate && (
          <motion.div
            key="sync-ok"
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 px-5 py-3 flex items-center gap-3"
          >
            <span className="text-base shrink-0">📊</span>
            <p className="text-sm text-emerald-200/60">
              Sincronizado desde Google Sheets
              {daysSinceSync === 0 ? ' · Hoy' : daysSinceSync === 1 ? ' · Ayer' : ` · Hace ${daysSinceSync} días`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <PageHeader
        breadcrumb="Finanzas · Inversiones"
        title="Patrimonio"
        subtitle={lastSyncDate ? `Datos de Google Sheets · ${lastSyncDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : undefined}
        actions={
          <div className="flex gap-2">
            <button
              onClick={handleSyncFromSheets}
              disabled={syncLoading}
              className="inline-flex items-center gap-2 rounded-2xl bg-white/8 border border-white/10 px-4 py-2.5 text-sm font-medium text-white/70 hover:bg-white/12 transition disabled:opacity-40"
            >
              <RefreshCw size={14} className={syncLoading ? 'animate-spin' : ''} />
              {syncLoading ? 'Sincronizando...' : 'Sincronizar'}
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
