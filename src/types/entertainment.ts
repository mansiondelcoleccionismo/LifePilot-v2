export type EntertainmentStatus = 'pendiente' | 'viendo' | 'completado'

export interface Movie {
  id: string
  title: string
  platform: string
  status: EntertainmentStatus
  genre?: string
  rating?: number // 0-10
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface Show {
  id: string
  title: string
  platform: string
  status: EntertainmentStatus
  genre?: string
  rating?: number // 0-10
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface Game {
  id: string
  title: string
  platform: string
  status: EntertainmentStatus
  genre?: string
  hoursPlayed?: number
  rating?: number // 0-10
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export type EntertainmentItem = Movie | Show | Game

export const ENTERTAINMENT_STATUSES: Record<EntertainmentStatus, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-500' },
  viendo: { label: 'Viendo', color: 'bg-blue-500' },
  completado: { label: 'Completado', color: 'bg-emerald-500' },
}

export const PLATFORMS = [
  'Netflix', 'HBO', 'Amazon Prime', 'Disney+', 'Apple TV+', 'Movistar+', 'YouTube',
  'Steam', 'PlayStation', 'Xbox', 'Nintendo Switch', 'PC', 'Otro'
]