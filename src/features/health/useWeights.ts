import { useCallback } from 'react'
import { useWeightStore } from './weightStore'
import * as svc from './weightService'
import type { WeightEntry } from './types'

// Replaced with real userId once Firebase Auth is connected
const USER_ID = 'local-user'

export function useWeights() {
  const {
    weights, loading, error,
    setWeights, addWeight: storeAdd, updateWeight: storeUpdate,
    removeWeight, setLoading, setError,
  } = useWeightStore()

  const loadWeights = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await svc.getWeights(USER_ID)
      setWeights(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos de peso')
    } finally {
      setLoading(false)
    }
  }, [setWeights, setLoading, setError])

  const addWeight = useCallback(
    async (weight: number, date: Date = new Date(), note?: string): Promise<WeightEntry> => {
      setError(null)
      const entry = await svc.addWeight(USER_ID, { weight, date, note })
      storeAdd(entry)
      return entry
    },
    [storeAdd, setError],
  )

  const updateWeight = useCallback(
    async (id: string, partial: Partial<Pick<WeightEntry, 'weight' | 'date' | 'note'>>) => {
      setError(null)
      await svc.updateWeight(USER_ID, id, partial)
      storeUpdate(id, partial)
    },
    [storeUpdate, setError],
  )

  const deleteWeight = useCallback(
    async (id: string) => {
      setError(null)
      await svc.deleteWeight(USER_ID, id)
      removeWeight(id)
    },
    [removeWeight, setError],
  )

  // ── Computed ───────────────────────────────────────────────────────────────
  const lastWeight     = weights[0] ?? null
  const previousWeight = weights[1] ?? null
  const delta =
    lastWeight && previousWeight
      ? Math.round((lastWeight.weight - previousWeight.weight) * 10) / 10
      : null

  return {
    weights,
    loading,
    error,
    loadWeights,
    addWeight,
    updateWeight,
    deleteWeight,
    lastWeight,
    previousWeight,
    delta,
  }
}
