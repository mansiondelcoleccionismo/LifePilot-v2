import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pill, Plus, Check } from 'lucide-react'
import {
  subscribeMedications,
  subscribeDayLogs,
  toggleMedicationTaken,
  addMedication,
} from '@/services/medication.service'
import type { Medication, MedicationLog, MedicationTime, MedicationUnit } from '@/types/medication'

const TIME_CFG: Record<MedicationTime, { label: string; color: string; bg: string; border: string }> = {
  mañana:   { label: 'Mañana',  color: 'text-blue-400',   bg: 'bg-blue-500/15',   border: 'border-blue-500/25'   },
  mediodía: { label: 'Mediodía', color: 'text-amber-400', bg: 'bg-amber-500/15',  border: 'border-amber-500/25'  },
  noche:    { label: 'Noche',   color: 'text-violet-400', bg: 'bg-violet-500/15', border: 'border-violet-500/25' },
}

export function MedicationWidget() {
  const [medications, setMedications] = useState<Medication[]>([])
  const [logs, setLogs] = useState<Record<string, MedicationLog>>({})
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [dose, setDose] = useState('')
  const [unit, setUnit] = useState<MedicationUnit>('mg')
  const [time, setTime] = useState<MedicationTime>('mañana')
  const [saving, setSaving] = useState(false)

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])

  useEffect(() => {
    const unsubMeds = subscribeMedications(setMedications)
    const unsubLogs = subscribeDayLogs(todayStr, setLogs)
    return () => { unsubMeds(); unsubLogs() }
  }, [todayStr])

  const takenCount = useMemo(
    () => medications.filter((m) => logs[m.id]?.taken).length,
    [medications, logs],
  )

  const grouped = useMemo(() => {
    const g: Record<MedicationTime, Medication[]> = { mañana: [], mediodía: [], noche: [] }
    medications.forEach((m) => g[m.time].push(m))
    return g
  }, [medications])

  async function handleToggle(id: string) {
    await toggleMedicationTaken(id, todayStr)
  }

  async function handleAdd() {
    if (!name.trim() || !dose) return
    setSaving(true)
    await addMedication({ name: name.trim(), dose: Number(dose), unit, time })
    setName(''); setDose(''); setUnit('mg'); setTime('mañana')
    setShowForm(false)
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Pill size={14} className="text-rose-400" />
        <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 flex-1">
          Medicación · Hoy
        </p>
        {medications.length > 0 && (
          <span className="text-[11px] text-white/25">{takenCount}/{medications.length}</span>
        )}
      </div>

      {/* Progress */}
      {medications.length > 0 && (
        <div className="h-1 rounded-full bg-white/6 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(takenCount / medications.length) * 100}%` }}
            transition={{ duration: 0.6 }}
            className="h-full rounded-full bg-rose-400"
          />
        </div>
      )}

      {/* Empty state */}
      {medications.length === 0 && !showForm && (
        <p className="text-sm text-white/30 flex-1">Sin medicamentos configurados</p>
      )}

      {/* Grouped list */}
      {medications.length > 0 && (
        <div className="space-y-3 flex-1">
          {(Object.entries(grouped) as [MedicationTime, Medication[]][])
            .filter(([, meds]) => meds.length > 0)
            .map(([slot, meds]) => {
              const cfg = TIME_CFG[slot]
              return (
                <div key={slot}>
                  <p className={`text-[9px] font-semibold uppercase tracking-widest mb-1.5 ${cfg.color}`}>
                    {cfg.label}
                  </p>
                  <div className="space-y-1.5">
                    {meds.map((med) => {
                      const taken = logs[med.id]?.taken ?? false
                      return (
                        <button
                          key={med.id}
                          onClick={() => handleToggle(med.id)}
                          className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl border transition-all text-left ${
                            taken
                              ? `${cfg.bg} ${cfg.border}`
                              : 'bg-white/3 border-white/8 hover:bg-white/6'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 transition-all border ${
                            taken ? `${cfg.bg} ${cfg.border}` : 'border-white/20'
                          }`}>
                            {taken && <Check size={10} className={cfg.color} strokeWidth={3} />}
                          </div>
                          <span className={`text-xs flex-1 transition-colors ${
                            taken ? 'text-white/40 line-through' : 'text-white/75'
                          }`}>
                            {med.name}
                          </span>
                          <span className="text-[10px] text-white/30 shrink-0">
                            {med.dose}{med.unit}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* Inline add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 border-t border-white/8 space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del medicamento"
                className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2 text-xs text-white/80 focus:outline-none placeholder:text-white/25"
              />
              <div className="flex gap-2">
                <input
                  value={dose}
                  onChange={(e) => setDose(e.target.value)}
                  type="number"
                  min="0"
                  placeholder="Dosis"
                  className="flex-1 min-w-0 rounded-xl bg-white/5 border border-white/8 px-3 py-2 text-xs text-white/80 focus:outline-none placeholder:text-white/25"
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as MedicationUnit)}
                  className="rounded-xl bg-[#1a1a24] border border-white/8 px-2 py-2 text-xs text-white/80 focus:outline-none"
                >
                  {(['mg', 'ml', 'UI', 'g'] as MedicationUnit[]).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <select
                  value={time}
                  onChange={(e) => setTime(e.target.value as MedicationTime)}
                  className="rounded-xl bg-[#1a1a24] border border-white/8 px-2 py-2 text-xs text-white/80 focus:outline-none"
                >
                  <option value="mañana">☀️ Mañana</option>
                  <option value="mediodía">🌤️ Mediodía</option>
                  <option value="noche">🌙 Noche</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!name.trim() || !dose || saving}
                  className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Guardando…' : 'Añadir'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-3 py-2 text-xs text-white/50 hover:text-white/80 transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition mt-auto"
        >
          <Plus size={12} /> Añadir medicamento
        </button>
      )}
    </div>
  )
}
