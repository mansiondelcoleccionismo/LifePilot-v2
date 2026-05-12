// ── Legacy types (kept for backward compat) ────────────────────────────────
export type KiraActivityCategory = 'juego' | 'aprendizaje' | 'deporte' | 'cultura' | 'familia'

export interface KiraActivity {
  id: string
  title: string
  date: string
  category: KiraActivityCategory
  notes?: string
  completed: boolean
  createdAt: Date
  updatedAt: Date
}

export interface KiraMilestone {
  id: string
  title: string
  date: string
  description: string
  emoji: string
  createdAt: Date
  updatedAt: Date
}

export const ACTIVITY_CATEGORIES: Record<KiraActivityCategory, { label: string; color: string; emoji: string }> = {
  juego:       { label: 'Juego',       color: 'bg-pink-500',    emoji: '🎮' },
  aprendizaje: { label: 'Aprendizaje', color: 'bg-purple-500',  emoji: '📚' },
  deporte:     { label: 'Deporte',     color: 'bg-blue-500',    emoji: '⚽' },
  cultura:     { label: 'Cultura',     color: 'bg-emerald-500', emoji: '🎨' },
  familia:     { label: 'Familia',     color: 'bg-rose-500',    emoji: '👨‍👩‍👧' },
}

// ── New types ──────────────────────────────────────────────────────────────
export interface KiraActivityLog {
  id: string
  activityId: string
  activityName: string
  date: string // YYYY-MM-DD
  rating: 0 | 1 | 2 | 3 // 😞😐😊😍
  durationBucket: 'short' | 'medium' | 'long' // <10min, 10-30min, >30min
  notes?: string
  timeOfDay: 'morning' | 'afternoon' | 'evening'
  createdAt: Date
}

export interface KiraDiaryEntry {
  id: string
  date: string // YYYY-MM-DD
  activityId?: string
  activityName?: string
  notes: string
  kiraPhrase?: string
  kiraMood: 1 | 2 | 3 | 4 | 5
  danielMood: 1 | 2 | 3 | 4 | 5
  createdAt: Date
}

export interface KiraAchievedMilestone {
  id: string
  milestoneId: string
  achievedAt: string // YYYY-MM-DD
  createdAt: Date
}
