import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pill, Plus, Check, Edit, Trash2, X } from 'lucide-react'
import {
  subscribeMedications,
  subscribeDayLogs,
  fetchDayLogs,
  toggleMedicationTaken,
  addMedication,
  updateMedication,
  deleteMedication,
} from '@/services/medication.service'
import type { Medication, MedicationLog, MedicationTime, MedicationUnit } from '@/types/medication'

const TIME_CFG: Record<MedicationTime, { label: string; color: string; bg: string; border: string; icon: string }> = {
  mañana:   { label: 'Mañana',   color: 'text-blue-400',   bg: 'bg-blue-500/15',   border: 'border-blue-500/25',   icon: '☀️' },
  mediodía: { label: 'Mediodía', color: 'text-amber-400',  bg: 'bg-amber-500/15',  border: 'border-amber-500/25',  icon: '🌤️' },
  noche:    { label: 'Noche',    color: 'text-violet-400', bg: 'bg-violet-500/15', border: 'border-violet-500/25', icon: '🌙' },
}

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

type DayHistory = { date: string; label: string; dayNum: number; logs: Record<string, MedicationLog> }

function adherenceColor(taken: number, total: number) {
  if (total === 0) return 'bg-white/8 text-white/20'
  const pct = taken / total
  if (pct === 1) return 'bg-emerald-500/20 text-emerald-300'
  if (pct >= 0.5) return 'bg-amber-500/20 text-amber-300'
  if (pct > 0) return 'bg-rose-500/20 text-rose-300'
  return 'bg-white/8 text-white/30'
}

export function MedicacionPage() {
  const [medications, setMedications] = useState<Medication[]>([])
  const [todayLogs, setTodayLogs] = useState<Record<string, MedicationLog>>({})
  const [weekHistory, setWeekHistory] = useState<DayHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingMed, setEditingMed] = useState<Medication | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDose, setFormDose] = useState('')
  const [formUnit, setFormUnit] = useState<MedicationUnit>('mg')
  const [formTime, setFormTime] = useState<MedicationTime>('mañana')
  const [saving, setSaving] = useState(false)

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])

  const last7Days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - i)
      return {
        date: d.toISOString().split('T')[0],
        label: i === 0 ? 'Hoy' : DAYS_ES[d.getDay()],
        dayNum: d.getDate(),
      }
    })
  }, [])

  useEffect(() => {
    const unsubMeds = subscribeMedications((meds) => {
      setMedications(meds)
      setLoading(false)
    })
    const unsubLogs = subscribeDayLogs(todayStr, setTodayLogs)

    Promise.all(
      last7Days.map(({ date, label, dayNum }) =>
        fetchDayLogs(date).then((logs) => ({ date, label, dayNum, logs })),
      ),
    ).then(setWeekHistory)

    return () => { unsubMeds(); unsubLogs() }
  }, [todayStr, last7Days])

  // Merge today's real-time logs into weekHistory
  const mergedWeekHistory = useMemo(() => {
    return weekHistory.map((day) =>
      day.date === todayStr ? { ...day, logs: todayLogs } : day,
    )
  }, [weekHistory, todayStr, todayLogs])

  const grouped = useMemo(() => {
    const g: Record<MedicationTime, Medication[]> = { mañana: [], mediodía: [], noche: [] }
    medications.forEach((m) => g[m.time].push(m))
    return g
  }, [medications])

  const takenToday = useMemo(
    () => medications.filter((m) => todayLogs[m.id]?.taken).length,
    [medications, todayLogs],
  )

  function openAdd() {
    setEditingMed(null)
    setFormName(''); setFormDose(''); setFormUnit('mg'); setFormTime('mañana')
    setShowForm(true)
  }

  function openEdit(med: Medication) {
    setEditingMed(med)
    setFormName(med.name)
    setFormDose(String(med.dose))
    setFormUnit(med.unit)
    setFormTime(med.time)
    setShowForm(true)
  }

  async function handleSave() {
    if (!formName.trim() || !formDose) return
    setSaving(true)
    const data = { name: formName.trim(), dose: Number(formDose), unit: formUnit, time: formTime }
    if (editingMed) {
      await updateMedication(editingMed.id, data)
    } else {
      await addMedication(data)
    }
    setSaving(false)
    setShowForm(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este medicamento?')) return
    await deleteMedication(id)
  }

  if (loading) {
    return (
      <div className="px-4 py-6 md:px-6 lg:px-8 max-w-4xl mx-auto animate-pulse">
        <div className="h-8 bg-white/10 rounded-lg mb-6 w-48" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-4xl mx-auto">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/35">Salud · Rutina</p>
            <h1 className="text-3xl font-bold text-white/90 mt-1">Medicación</h1>
          </div>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-500"
          >
            <Plus size={16} /> Añadir medicamento
          </button>
        </div>
      </motion.div>

      {/* Today summary */}
      {medications.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6 rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Pill size={16} className="text-rose-400" />
              <span className="text-sm font-semibold text-white/80">Progreso de hoy</span>
            </div>
            <span className="text-sm font-semibold text-white/60">
              <span className="text-white/90">{takenToday}</span>
              <span className="text-white/30"> / {medications.length} tomados</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/6 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: medications.length > 0 ? `${(takenToday / medications.length) * 100}%` : '0%' }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className={`h-full rounded-full transition-colors ${
                takenToday === medications.length && medications.length > 0
                  ? 'bg-emerald-400'
                  : 'bg-rose-400'
              }`}
            />
          </div>
          {takenToday === medications.length && medications.length > 0 && (
            <p className="text-xs text-emerald-400 mt-2">¡Todos los medicamentos tomados hoy!</p>
          )}
        </motion.div>
      )}

      {/* Today's medication list */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="mb-6"
      >
        {medications.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-[#1E1E28] p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <Pill size={24} className="text-white/20" />
            </div>
            <p className="text-sm text-white/40 mb-1">Sin medicamentos configurados</p>
            <p className="text-xs text-white/25">Añade tu primera medicación para empezar el seguimiento</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(Object.entries(grouped) as [MedicationTime, Medication[]][])
              .filter(([, meds]) => meds.length > 0)
              .map(([slot, meds]) => {
                const cfg = TIME_CFG[slot]
                return (
                  <div key={slot} className="rounded-2xl border border-white/8 bg-[#1E1E28] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base">{cfg.icon}</span>
                      <p className={`text-xs font-semibold uppercase tracking-widest ${cfg.color}`}>
                        {cfg.label}
                      </p>
                      <span className="text-[10px] text-white/25 ml-auto">
                        {meds.filter((m) => todayLogs[m.id]?.taken).length}/{meds.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {meds.map((med) => {
                        const taken = todayLogs[med.id]?.taken ?? false
                        return (
                          <div key={med.id} className="flex items-center gap-3 group">
                            <button
                              onClick={() => toggleMedicationTaken(med.id, todayStr)}
                              className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                                taken
                                  ? `${cfg.bg} ${cfg.border}`
                                  : 'border-white/20 hover:border-white/40'
                              }`}
                            >
                              {taken && <Check size={12} className={cfg.color} strokeWidth={3} />}
                            </button>
                            <span className={`text-sm flex-1 transition-colors ${
                              taken ? 'line-through text-white/35' : 'text-white/80'
                            }`}>
                              {med.name}
                            </span>
                            <span className="text-xs text-white/40 shrink-0">
                              {med.dose} {med.unit}
                            </span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                              <button
                                onClick={() => openEdit(med)}
                                className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
                              >
                                <Edit size={11} className="text-white/60" />
                              </button>
                              <button
                                onClick={() => handleDelete(med.id)}
                                className="w-6 h-6 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition"
                              >
                                <Trash2 size={11} className="text-red-400" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </motion.div>

      {/* 7-day history */}
      {medications.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="mb-6 rounded-2xl border border-white/8 bg-[#1E1E28] p-5"
        >
          <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-4">
            Últimos 7 días
          </p>
          <div className="grid grid-cols-7 gap-2">
            {mergedWeekHistory.map(({ date, label, dayNum, logs }) => {
              const taken = medications.filter((m) => logs[m.id]?.taken).length
              const total = medications.length
              const colorClass = adherenceColor(taken, total)
              const isToday = date === todayStr

              return (
                <div
                  key={date}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl ${
                    isToday ? 'ring-1 ring-white/15' : ''
                  }`}
                >
                  <span className={`text-[10px] font-medium ${isToday ? 'text-white/70' : 'text-white/35'}`}>
                    {label}
                  </span>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-semibold ${colorClass}`}>
                    {dayNum}
                  </div>
                  <span className="text-[9px] text-white/25">{taken}/{total}</span>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-4 pt-3 border-t border-white/6">
            {[
              { color: 'bg-emerald-500/20 text-emerald-300', label: 'Todo tomado' },
              { color: 'bg-amber-500/20 text-amber-300', label: 'Parcial' },
              { color: 'bg-rose-500/20 text-rose-300', label: 'Pocos' },
              { color: 'bg-white/8 text-white/30', label: 'Sin datos' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-md ${color.split(' ')[0]}`} />
                <span className="text-[9px] text-white/30">{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

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
                  {editingMed ? 'Editar medicamento' : 'Nuevo medicamento'}
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
                    placeholder="Ej. Omeprazol, Vitamina D…"
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none placeholder:text-white/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Dosis</label>
                    <input
                      value={formDose}
                      onChange={(e) => setFormDose(e.target.value)}
                      type="number"
                      min="0"
                      placeholder="0"
                      className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none placeholder:text-white/20"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Unidad</label>
                    <select
                      value={formUnit}
                      onChange={(e) => setFormUnit(e.target.value as MedicationUnit)}
                      className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                    >
                      {(['mg', 'ml', 'UI', 'g'] as MedicationUnit[]).map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Momento del día</label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {(Object.entries(TIME_CFG) as [MedicationTime, typeof TIME_CFG.mañana][]).map(([slot, cfg]) => (
                      <button
                        key={slot}
                        onClick={() => setFormTime(slot)}
                        className={`py-2.5 rounded-xl text-xs font-medium border transition-all ${
                          formTime === slot
                            ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                            : 'bg-white/5 border-white/8 text-white/40 hover:text-white/60'
                        }`}
                      >
                        {cfg.icon} {cfg.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={!formName.trim() || !formDose || saving}
                    className="flex-1 rounded-2xl bg-rose-600 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Guardando…' : editingMed ? 'Actualizar' : 'Añadir'}
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
