import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface PasosDia {
  fecha: string
  pasos: number
  updatedAt?: unknown
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
    const cutoff = (() => {
      const d = new Date()
      d.setDate(d.getDate() - 6)
      return d.toISOString().slice(0, 10)
    })()

    // Lee de la colección raíz "pasos" donde escribe la Cloud Function
    const q = query(
      collection(db, 'pasos'),
      orderBy('fecha', 'desc'),
      limit(30),
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs
          .map((d) => d.data() as PasosDia)
          .filter((d) => d.fecha >= cutoff)
          .sort((a, b) => a.fecha.localeCompare(b.fecha))

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
