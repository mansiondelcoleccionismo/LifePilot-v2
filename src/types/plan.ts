export type PlanCategory = 'viaje' | 'hogar' | 'familia' | 'finanzas' | 'personal'

export type PlanStatus = 'idea' | 'planificando' | 'activo' | 'completado'

export interface PlanStep {
  id: string
  title: string
  completed: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Plan {
  id: string
  title: string
  description: string
  category: PlanCategory
  status: PlanStatus
  targetDate?: string // YYYY-MM-DD
  steps: PlanStep[]
  createdAt: Date
  updatedAt: Date
}

export const PLAN_CATEGORIES: Record<PlanCategory, { label: string; color: string; emoji: string }> = {
  viaje: { label: 'Viaje', color: 'bg-emerald-500', emoji: '✈️' },
  hogar: { label: 'Hogar', color: 'bg-blue-500', emoji: '🏠' },
  familia: { label: 'Familia', color: 'bg-rose-500', emoji: '👨‍👩‍👧' },
  finanzas: { label: 'Finanzas', color: 'bg-amber-500', emoji: '💰' },
  personal: { label: 'Personal', color: 'bg-purple-500', emoji: '🎯' },
}

export const PLAN_STATUSES: Record<PlanStatus, { label: string; color: string }> = {
  idea: { label: 'Idea', color: 'bg-gray-500' },
  planificando: { label: 'Planificando', color: 'bg-blue-500' },
  activo: { label: 'Activo', color: 'bg-emerald-500' },
  completado: { label: 'Completado', color: 'bg-green-600' },
}