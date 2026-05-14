import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { getTodayHydration, addGlass, removeGlass } from '@/services/hydration.service'

function getMsg(pct: number) {
  if (pct <= 0)    return '💧 Empieza a hidratarte'
  if (pct <= 0.25) return '💧 Empieza a hidratarte'
  if (pct <= 0.50) return '💧 Vas por la mitad'
  if (pct <= 0.75) return '💧 Casi ahí'
  if (pct < 1)     return '💧 ¡Un poco más!'
  return '✅ ¡Hidratado! Excelente'
}

export function HydrationWidget() {
  const [glasses, setGlasses] = useState(0)
  const [target,  setTarget]  = useState(8)
  const [busy,    setBusy]    = useState(false)

  const glassesRef = useRef(0)
  const dateRef    = useRef(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    getTodayHydration().then(d => {
      setGlasses(d.glasses)
      setTarget(d.target)
      glassesRef.current = d.glasses
      dateRef.current    = d.date
    })

    // Midnight reset: poll every minute
    const id = setInterval(() => {
      const today = new Date().toISOString().slice(0, 10)
      if (today !== dateRef.current) {
        getTodayHydration().then(d => {
          setGlasses(d.glasses)
          setTarget(d.target)
          glassesRef.current = d.glasses
          dateRef.current    = d.date
        })
      }
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const tap = useCallback(async (filled: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      const cur  = glassesRef.current
      const next = filled ? await removeGlass(cur) : await addGlass(cur)
      setGlasses(next)
      glassesRef.current = next
    } catch {
      const d = await getTodayHydration()
      setGlasses(d.glasses)
      glassesRef.current = d.glasses
    } finally {
      setBusy(false)
    }
  }, [busy])

  const pct  = target > 0 ? glasses / target : 0
  const done = pct >= 1

  return (
    <div className={`rounded-2xl border p-5 transition-colors duration-500 ${
      done ? 'bg-emerald-950/20 border-emerald-500/15' : 'bg-[#1E1E28] border-white/8'
    }`}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-white/80">💧 Hidratación</p>
        <span className={`text-xs font-medium tabular-nums ${done ? 'text-emerald-400' : 'text-cyan-400'}`}>
          {glasses}/{target}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {Array.from({ length: target }).map((_, i) => {
          const filled = i < glasses
          return (
            <motion.button
              key={i}
              onClick={() => tap(filled)}
              whileTap={{ scale: 0.72 }}
              disabled={busy}
              title={filled ? 'Quitar vaso' : 'Añadir vaso'}
              className={`w-7 h-7 rounded-full border-2 relative overflow-hidden flex items-center justify-center transition-colors duration-200 disabled:cursor-not-allowed ${
                filled
                  ? 'border-cyan-500/60 bg-cyan-900/30'
                  : 'border-white/10 bg-white/3 hover:border-cyan-500/30'
              }`}
            >
              {filled && (
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: '0%' }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="absolute inset-0 bg-cyan-500/25"
                />
              )}
              {filled && (
                <span className="relative z-10 text-[9px] select-none leading-none">💧</span>
              )}
            </motion.button>
          )
        })}
      </div>

      <div className="h-1 rounded-full bg-white/5 overflow-hidden mb-2.5">
        <motion.div
          animate={{ width: `${Math.min(100, pct * 100)}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-cyan-500'}`}
        />
      </div>

      <p className="text-[11px] text-white/40">{getMsg(pct)}</p>
    </div>
  )
}
