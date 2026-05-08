export type KiraActivityCategory = 'juego' | 'aprendizaje' | 'deporte' | 'cultura' | 'familia'

export interface KiraActivity {
  id: string
  title: string
  date: string // YYYY-MM-DD
  category: KiraActivityCategory
  notes?: string
  completed: boolean
  createdAt: Date
  updatedAt: Date
}

export interface KiraMilestone {
  id: string
  title: string
  date: string // YYYY-MM-DD
  description: string
  emoji: string
  createdAt: Date
  updatedAt: Date
}

export const ACTIVITY_CATEGORIES: Record<KiraActivityCategory, { label: string; color: string; emoji: string }> = {
  juego: { label: 'Juego', color: 'bg-pink-500', emoji: '🎮' },
  aprendizaje: { label: 'Aprendizaje', color: 'bg-purple-500', emoji: '📚' },
  deporte: { label: 'Deporte', color: 'bg-blue-500', emoji: '⚽' },
  cultura: { label: 'Cultura', color: 'bg-emerald-500', emoji: '🎨' },
  familia: { label: 'Familia', color: 'bg-rose-500', emoji: '👨‍👩‍👧' },
}