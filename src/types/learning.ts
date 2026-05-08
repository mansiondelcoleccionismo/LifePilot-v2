export type LearningStatus = 'leyendo' | 'pendiente' | 'completado'

export interface Book {
  id: string
  title: string
  author: string
  status: LearningStatus
  progress: number // 0-100
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface Podcast {
  id: string
  title: string
  channel: string
  status: LearningStatus
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface Course {
  id: string
  title: string
  platform: string
  status: LearningStatus
  progress: number // 0-100
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export type LearningItem = Book | Podcast | Course

export const STATUS_LABELS: Record<LearningStatus, string> = {
  leyendo: 'Leyendo',
  pendiente: 'Pendiente',
  completado: 'Completado',
}

export const STATUS_COLORS: Record<LearningStatus, string> = {
  leyendo: 'bg-blue-500',
  pendiente: 'bg-amber-500',
  completado: 'bg-emerald-500',
}