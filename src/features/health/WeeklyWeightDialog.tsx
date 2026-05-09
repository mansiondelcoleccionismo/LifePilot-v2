import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Scale, Loader2 } from 'lucide-react'
import { useWeights } from './useWeights'
import { useWeeklyWeightPrompt } from './useWeeklyWeightPrompt'
import { useUserStore } from '@/store/userStore'

export function WeeklyWeightDialog() {
  const { shouldPrompt, closePrompt, dismissToday, dismissWeek } = useWeeklyWeightPrompt()
  const { addWeight, lastWeight } = useWeights()
  const { name } = useUserStore()

  const [value, setValue] = useState(() =>
    lastWeight ? String(lastWeight.weight) : '',
  )
  const [saving, setSaving] = useState(false)
  const [inputError, setInputError] = useState('')

  async function handleSave() {
    const w = parseFloat(value.replace(',', '.'))
    if (isNaN(w) || w < 30 || w > 250) {
      setInputError('Introduce un peso válido (30–250 kg)')
      return
    }
    setInputError('')
    setSaving(true)
    try {
      await addWeight(w, new Date())
      closePrompt()
    } catch {
      setInputError('Error al guardar. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {shouldPrompt && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={dismissToday}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-sm rounded-3xl bg-[#1A1A24] border border-white/10 shadow-2xl shadow-black/60 p-6">
              {/* Icon */}
              <div className="w-12 h-12 rounded-2xl bg-blue-500/12 border border-blue-500/15 flex items-center justify-center mb-4">
                <Scale size={22} className="text-blue-400" />
              </div>

              <h2 className="text-lg font-semibold text-white/90 mb-1">
                Hola {name} 👋
              </h2>
              <p className="text-sm text-white/45 mb-5 leading-relaxed">
                ¿Qué tal tu peso esta semana?
                {lastWeight && (
                  <span className="block mt-0.5 text-white/30">
                    Último registro: {lastWeight.weight} kg
                  </span>
                )}
              </p>

              {/* Input */}
              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="30"
                    max="250"
                    value={value}
                    onChange={(e) => { setValue(e.target.value); setInputError('') }}
                    placeholder="Ej: 78.5"
                    className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-white/90 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                  <span className="text-sm text-white/35 shrink-0">kg</span>
                </div>
                {inputError && (
                  <p className="text-xs text-rose-400 mt-1.5">{inputError}</p>
                )}
              </div>

              {/* Primary action */}
              <button
                onClick={handleSave}
                disabled={saving || !value.trim()}
                className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition disabled:opacity-40 flex items-center justify-center gap-2 mb-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Guardando…' : 'Guardar'}
              </button>

              {/* Secondary actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={dismissToday}
                  className="rounded-2xl border border-white/8 bg-white/3 py-2.5 text-xs text-white/45 hover:text-white/70 hover:bg-white/6 transition"
                >
                  Recordármelo mañana
                </button>
                <button
                  onClick={dismissWeek}
                  className="rounded-2xl border border-white/8 bg-white/3 py-2.5 text-xs text-white/45 hover:text-white/70 hover:bg-white/6 transition"
                >
                  No esta semana
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
