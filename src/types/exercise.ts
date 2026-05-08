export type WorkoutDay = 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes' | 'Sábado' | 'Domingo'

export interface Exercise {
  id: string
  name: string
  sets: number
  reps: number
  weight: number
  day: WorkoutDay
  muscleGroup: string
}
