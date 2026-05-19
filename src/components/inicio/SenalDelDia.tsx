import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Loader2, Zap } from 'lucide-react'
import { callAI, hasAnyAIKey } from '@/services/ai.service'

const CACHE_PREFIX = 'senaldeldia_'
const TTL_MS = 6 * 60 * 60 * 1000

interface Cache { text: string; ts: number; date: string }

function readCache(date: string): string | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + date)
    if (!raw) return null
    const c: Cache = JSON.parse(raw)
    if (c.date !== date || Date.now() - c.ts > TTL_MS) return null
    return c.text
  } catch { return null }
}

function writeCache(date: string, text: string) {
  try {
    localStorage.setItem(CACHE_PREFIX + date, JSON.stringify({ text, ts: Date.now(), date }))
  } catch {}
}

const PROMPT =
  'Basado en los datos del usuario, genera UNA sola recomendación accionable de máximo 2 frases ' +
  'que cruce al menos 2 dimensiones (mood + ejercicio, nutrición + energía, sueño + pasos, etc). ' +
  'No saludes, ve directo al grano. Sin markdown ni asteriscos.'

export function SenalDelDia() {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [signal, setSignal]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tried, setTried]     = useState(false)

  const generate = useCallback(async (force = false) => {
    if (!hasAnyAIKey()) return
    if (!force) {
      const cached = readCache(todayStr)
      if (cached) { setSignal(cached); setTried(true); return }
    }
    setLoading(true)
    try {
      const text = await callAI(PROMPT, undefined, false, 300, undefined, 24 * 60 * 60_000)
      const clean = text.trim()
      if (clean) { setSignal(clean); writeCache(todayStr, clean) }
    } catch { /* silent */ }
    finally { setLoading(false); setTried(true) }
  }, [todayStr])

  useEffect(() => { generate() }, [generate])

  if (!hasAnyAIKey() || (tried && !signal && !loading)) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.16, duration: 0.28 }}
      className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap size={12} className="text-amber-400 shrink-0" />
          <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25">Señal del día</p>
        </div>
        <button
          onClick={() => generate(true)}
          disabled={loading}
          title="Nueva recomendación"
          className="w-6 h-6 rounded-lg bg-white/4 hover:bg-white/8 flex items-center justify-center transition-colors disabled:opacity-30"
        >
          {loading
            ? <Loader2 size={10} className="animate-spin text-white/40" />
            : <RefreshCw size={10} className="text-white/40" />}
        </button>
      </div>

      {loading && !signal ? (
        <div className="space-y-2">
          <div className="h-3 bg-white/6 rounded-lg animate-pulse" />
          <div className="h-3 bg-white/6 rounded-lg animate-pulse w-4/5" />
        </div>
      ) : signal ? (
        <p className="text-[13.5px] text-white/60 leading-relaxed">{signal}</p>
      ) : null}
    </motion.div>
  )
}
