export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type Goal = 'recomposicion' | 'deficit' | 'volumen' | 'mantenimiento'

export interface UserProfile {
  name: string
  weight: number
  height: number
  birthDate: string       // "YYYY-MM-DD"
  activityLevel: ActivityLevel
  padelDays: number[]     // 0=Sun … 6=Sat
  trainingDays: number[]  // same scale
  goal: Goal
}
