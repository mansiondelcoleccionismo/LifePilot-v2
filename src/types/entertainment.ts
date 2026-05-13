export type ContentType = 'pelicula' | 'serie' | 'documental' | 'anime' | 'podcast' | 'youtube'
export type ContentStatus = 'pendiente' | 'viendo' | 'visto' | 'abandonado'
export type Platform = 'Netflix' | 'Amazon Prime' | 'YouTube' | 'HBO' | 'Físico' | 'Otro'

export interface Content {
  id: string
  tmdbId?: number
  title: string
  type: ContentType
  status: ContentStatus
  platform: Platform
  posterUrl?: string
  year?: number
  duration?: number // minutos (peli) o min/episodio (serie)
  totalEpisodes?: number
  currentEpisode?: number
  rating?: number // 1-10 puntuado por Daniel
  tmdbRating?: number
  genres?: string[]
  director?: string
  synopsis?: string
  trailerUrl?: string
  addedAt: Date
  watchedAt?: Date
  userNotes?: string
  tags?: string[]
  recommended?: boolean
  recommendReason?: string
}

export interface WatchSession {
  id: string
  contentId: string
  date: string
  episode?: number
  duration: number
  mood: number
  ratingAfter?: number
}

export interface ContentStats {
  totalItems: number
  totalWatched: number
  totalWatching: number
  totalPending: number
  estimatedHours: number
  avgRating: number
  byType: Partial<Record<ContentType, number>>
  byMonth: { month: string; count: number }[]
  topGenres: { genre: string; count: number }[]
  topDirectors: { director: string; count: number }[]
}
