import { create } from 'zustand'
import type { WeightEntry } from './types'

interface WeightState {
  weights: WeightEntry[]
  loading: boolean
  error: string | null
  setWeights: (weights: WeightEntry[]) => void
  addWeight: (entry: WeightEntry) => void
  updateWeight: (id: string, partial: Partial<WeightEntry>) => void
  removeWeight: (id: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useWeightStore = create<WeightState>((set) => ({
  weights: [],
  loading: false,
  error: null,

  setWeights: (weights) => set({ weights }),

  addWeight: (entry) =>
    set((s) => {
      const weights = [entry, ...s.weights]
      weights.sort((a, b) => b.date.getTime() - a.date.getTime())
      return { weights }
    }),

  updateWeight: (id, partial) =>
    set((s) => ({
      weights: s.weights.map((w) => (w.id === id ? { ...w, ...partial } : w)),
    })),

  removeWeight: (id) =>
    set((s) => ({ weights: s.weights.filter((w) => w.id !== id) })),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}))
