import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, Plus, Edit, Trash2, X, Save, Camera } from 'lucide-react'
import {
  subscribeAssets,
  subscribeSnapshots,
  addAsset,
  updateAsset,
  deleteAsset,
  calculateTotal,
  saveSnapshot,
} from '@/services/wealth.service'
import type { Asset, AssetType, Currency, WealthSnapshot } from '@/types/wealth'

const TYPE_CFG: Record<AssetType, { label: string; color: string; bg: string; border: string; bar: string }> = {
  cuenta:   { label: 'Cuenta',    color: 'text-sky-400',     bg: 'bg-sky-500/15',     border: 'border-sky-500/25',     bar: 'bg-sky-500'     },
  inversion:{ label: 'Inversión', color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/25', bar: 'bg-emerald-500' },
  cripto:   { label: 'Cripto',    color: 'text-orange-400',  bg: 'bg-orange-500/15',  border: 'border-orange-500/25',  bar: 'bg-orange-500'  },
  inmueble: { label: 'Inmueble',  color: 'text-violet-400',  bg: 'bg-violet-500/15',  border: 'border-violet-500/25',  bar: 'bg-violet-500'  },
  otro:     { label: 'Otro',      color: 'text-white/50',    bg: 'bg-white/8',        border: 'border-white/15',       bar: 'bg-white/30'    },
}

const ASSET_TYPES: AssetType[] = ['cuenta', 'inversion', 'cripto', 'inmueble', 'otro']

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const fmtFull = (n: number, currency: Currency) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function PatrimonioPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [snapshots, setSnapshots] = useState<WealthSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [savingSnapshot, setSavingSnapshot] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<AssetType>('cuenta')
  const [formValue, setFormValue] = useState('')
  const [formCurrency, setFormCurrency] = useState<Currency>('EUR')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsubAssets = subscribeAssets((a) => { setAssets(a); setLoading(false) })
    const unsubSnaps = subscribeSnapshots(setSnapshots)
    return () => { unsubAssets(); unsubSnaps() }
  }, [])

  const totalEUR = useMemo(() => calculateTotal(assets), [assets])

  const grouped = useMemo(() => {
    const g = {} as Record<AssetType, Asset[]>
    ASSET_TYPES.forEach((t) => { g[t] = [] })
    assets.forEach((a) => g[a.type].push(a))
    return g
  }, [assets])

  const distribution = useMemo(() => {
    return ASSET_TYPES.map((type) => {
      const typeAssets = grouped[type]
      const typeTotal = calculateTotal(typeAssets)
      const pct = totalEUR > 0 ? (typeTotal / totalEUR) * 100 : 0
      return { type, total: typeTotal, pct, count: typeAssets.length }
    }).filter((d) => d.count > 0)
  }, [grouped, totalEUR])

  function openAdd() {
    setEditingAsset(null)
    setFormName(''); setFormType('cuenta'); setFormValue(''); setFormCurrency('EUR')
    setShowForm(true)
  }

  function openEdit(asset: Asset) {
    setEditingAsset(asset)
    setFormName(asset.name)
    setFormType(asset.type)
    setFormValue(String(asset.value))
    setFormCurrency(asset.currency)
    setShowForm(true)
  }

  async function handleSave() {
    if (!formName.trim() || !formValue) return
    setSaving(true)
    const data = { name: formName.trim(), type: formType, value: Number(formValue), currency: formCurrency }
    if (editingAsset) {
      await updateAsset(editingAsset.id, data)
    } else {
      await addAsset(data)
    }
    setSaving(false)
    setShowForm(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este activo?')) return
    await deleteAsset(id)
  }

  async function handleSaveSnapshot() {
    setSavingSnapshot(true)
    await saveSnapshot(totalEUR)
    setSavingSnapshot(false)
  }

  if (loading) {
    return (
      <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto animate-pulse">
        <div className="h-8 bg-white/10 rounded-lg mb-6 w-48" />
        <div className="h-40 bg-white/5 rounded-3xl mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white/5 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/35">Finanzas · Inversiones</p>
            <h1 className="text-3xl font-bold text-white/90 mt-1">Patrimonio</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveSnapshot}
              disabled={savingSnapshot || assets.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl bg-white/8 border border-white/10 px-4 py-3 text-sm font-medium text-white/70 transition hover:bg-white/12 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Camera size={15} />
              {savingSnapshot ? 'Guardando…' : 'Guardar snapshot'}
            </button>
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-2xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-500"
            >
              <Plus size={16} /> Añadir activo
            </button>
          </div>
        </div>
      </motion.div>

      {/* Total card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-6 rounded-3xl bg-gradient-to-br from-amber-950/50 to-[#1E1E28] border border-amber-800/30 p-7"
      >
        <p className="text-[10px] font-semibold tracking-widest uppercase text-amber-500/70 mb-2">
          Patrimonio total
        </p>
        <p className="text-5xl font-bold text-amber-400 tracking-tight">
          {fmt(totalEUR)}
        </p>
        {assets.length > 0 && (
          <p className="text-sm text-white/30 mt-2">
            {assets.length} activo{assets.length !== 1 ? 's' : ''} ·{' '}
            {distribution.map((d) => TYPE_CFG[d.type].label).join(' · ')}
          </p>
        )}
        {assets.length === 0 && (
          <p className="text-sm text-white/30 mt-2">Añade activos para calcular tu patrimonio</p>
        )}
      </motion.div>

      {assets.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

          {/* Distribution chart */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
          >
            <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-5">
              Distribución por tipo
            </p>
            <div className="space-y-4">
              {distribution.map(({ type, total, pct }, i) => {
                const cfg = TYPE_CFG[type]
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-white/40">{fmt(total)}</span>
                        <span className="text-[10px] text-white/25 w-8 text-right">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-white/6 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.7, delay: 0.15 + i * 0.08, ease: 'easeOut' }}
                        className={`h-full rounded-full ${cfg.bar}`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>

          {/* Assets list grouped by type */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
          >
            <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-4">
              Lista de activos
            </p>
            <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
              {ASSET_TYPES.filter((t) => grouped[t].length > 0).map((type) => {
                const cfg = TYPE_CFG[type]
                return (
                  <div key={type}>
                    <p className={`text-[9px] font-semibold uppercase tracking-widest mb-2 ${cfg.color}`}>
                      {cfg.label}
                    </p>
                    <div className="space-y-1.5">
                      {grouped[type].map((asset) => (
                        <div
                          key={asset.id}
                          className="flex items-center gap-2 group px-2 py-1.5 rounded-xl hover:bg-white/4 transition"
                        >
                          <span className="text-sm text-white/75 flex-1 truncate">{asset.name}</span>
                          <span className="text-xs text-white/50 shrink-0">
                            {fmtFull(asset.value, asset.currency)}
                          </span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                            <button
                              onClick={() => openEdit(asset)}
                              className="w-5 h-5 rounded-md bg-white/8 hover:bg-white/14 flex items-center justify-center transition"
                            >
                              <Edit size={10} className="text-white/60" />
                            </button>
                            <button
                              onClick={() => handleDelete(asset.id)}
                              className="w-5 h-5 rounded-md bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition"
                            >
                              <Trash2 size={10} className="text-red-400" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </div>
      )}

      {/* Snapshots history */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={14} className="text-amber-400" />
          <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 flex-1">
            Evolución del patrimonio
          </p>
          {snapshots.length > 0 && (
            <span className="text-[10px] text-white/20">{snapshots.length} registros</span>
          )}
        </div>

        {snapshots.length === 0 ? (
          <div className="text-center py-8">
            <Save size={24} className="text-white/15 mx-auto mb-2" />
            <p className="text-sm text-white/30">Sin snapshots guardados</p>
            <p className="text-xs text-white/20 mt-1">
              Pulsa "Guardar snapshot" para registrar el valor actual
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {snapshots.slice(0, 12).map((snap, i) => {
              const prev = snapshots[i + 1]
              const delta = prev ? snap.totalEUR - prev.totalEUR : null
              const isToday = snap.date === new Date().toISOString().split('T')[0]
              return (
                <div
                  key={snap.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${
                    isToday ? 'bg-amber-500/8 border border-amber-500/20' : 'hover:bg-white/3'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white/70">{formatDate(snap.date)}</span>
                    {isToday && (
                      <span className="ml-2 text-[9px] font-semibold uppercase tracking-wider text-amber-400/70">
                        hoy
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-amber-400">{fmt(snap.totalEUR)}</span>
                  {delta !== null && (
                    <span className={`text-xs font-medium w-20 text-right shrink-0 ${
                      delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-white/30'
                    }`}>
                      {delta > 0 ? '+' : ''}{fmt(delta)}
                    </span>
                  )}
                </div>
              )
            })}
            {snapshots.length > 12 && (
              <p className="text-xs text-white/25 text-center pt-1">
                +{snapshots.length - 12} registros anteriores
              </p>
            )}
          </div>
        )}
      </motion.div>

      {/* Add / Edit modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-sm rounded-3xl border border-white/8 bg-[#1E1E28] p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-base font-semibold text-white/90">
                  {editingAsset ? 'Editar activo' : 'Nuevo activo'}
                </h3>
                <button
                  onClick={() => setShowForm(false)}
                  className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
                >
                  <X size={15} className="text-white/60" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Nombre</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej. IBEX ETF, Piso Madrid…"
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none placeholder:text-white/20"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Tipo</label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {ASSET_TYPES.map((t) => {
                      const cfg = TYPE_CFG[t]
                      return (
                        <button
                          key={t}
                          onClick={() => setFormType(t)}
                          className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                            formType === t
                              ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                              : 'bg-white/5 border-white/8 text-white/40 hover:text-white/60'
                          }`}
                        >
                          {cfg.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Valor</label>
                    <input
                      value={formValue}
                      onChange={(e) => setFormValue(e.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none placeholder:text-white/20"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Moneda</label>
                    <div className="mt-2 flex gap-2">
                      {(['EUR', 'USD'] as Currency[]).map((c) => (
                        <button
                          key={c}
                          onClick={() => setFormCurrency(c)}
                          className={`flex-1 py-3 rounded-2xl text-sm font-semibold border transition-all ${
                            formCurrency === c
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                              : 'bg-white/5 border-white/8 text-white/40 hover:text-white/60'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={!formName.trim() || !formValue || saving}
                    className="flex-1 rounded-2xl bg-amber-600 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Guardando…' : editingAsset ? 'Actualizar' : 'Añadir'}
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    className="px-4 py-3 text-sm text-white/50 hover:text-white/80 transition"
                  >
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
