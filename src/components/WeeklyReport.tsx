import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, BarChart3, RefreshCw } from 'lucide-react'
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

interface WeeklyReportProps {
  forceOpen?: boolean
  onClose?: () => void
}

export function WeeklyReport({ forceOpen = false, onClose }: WeeklyReportProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState('')
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
    if (open && !report && !loading) generateReport()
  }, [open])

  async function generateReport() {
    setLoading(true)
    setError('')
    try {
      const profile = loadProfile()
      const dayLabel = getDayLabel(profile)
      const prompt = `Genera un informe semanal detallado para este usuario. Incluye:
1. 💪 Balance de entrenos: días de pesas y pádel completados
2. 🥗 Análisis nutricional: ¿está alcanzando su proteína objetivo de ${Math.round(profile.weight * 2)}g/día?
3. 📊 Progreso hacia el objetivo de ${profile.goal}
4. ✅ 3 recomendaciones concretas y accionables para la próxima semana
5. 🌟 Una frase motivadora personalizada

Hoy es ${dayLabel}. Sé específico y usa sus datos. Responde en español con emojis.`
      const result = await callAI(prompt)
      setReport(result)
      localStorage.setItem(LAST_REPORT_KEY, getWeekKey())
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
            className="w-full sm:max-w-lg bg-[#1E1E28] rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/10 p-6 max-h-[85dvh] flex flex-col"
          >
            <div className="flex items-center justify-between mb-5">
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
              {report && !loading && (
                <div className="text-sm text-white/75 leading-relaxed whitespace-pre-wrap">
                  {report}
                </div>
              )}
            </div>

            <div className="mt-5 flex gap-3 pt-4 border-t border-white/6">
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
