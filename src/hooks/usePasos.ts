import { useEffect, useState } from 'react'
import { ref, onValue, query, orderByKey, limitToLast } from 'firebase/database'
import { rtdb } from '@/lib/firebase'

export interface PasosDia {
  fecha: string
  pasos: number
}

interface UsePasosResult {
  pasosHoy: number | null
  historicoSemanal: PasosDia[]
  loading: boolean
}

export function usePasos(): UsePasosResult {
  const [pasosHoy, setPasosHoy] = useState<number | null>(null)
  const [historicoSemanal, setHistoricoSemanal] = useState<PasosDia[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const todayStr = new Date().toISOString().slice(0, 10)

    const pasosQuery = query(ref(rtdb, 'pasos'), orderByKey(), limitToLast(7))

    const unsub = onValue(
      pasosQuery,
      (snap) => {
        const all: PasosDia[] = []
        snap.forEach((child) => {
          const val = child.val() as { Pasos?: number; Fecha?: string } | null
          if (val && typeof val.Pasos === 'number') {
            all.push({ fecha: child.key as string, pasos: val.Pasos })
          }
        })
        // onValue with orderByKey returns ascending order
        setPasosHoy(all.find((d) => d.fecha === todayStr)?.pasos ?? null)
        setHistoricoSemanal(all)
        setLoading(false)
      },
      () => setLoading(false),
    )

    return () => unsub()
  }, [])

  return { pasosHoy, historicoSemanal, loading }
}
