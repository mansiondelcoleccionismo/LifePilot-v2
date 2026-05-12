export type DayType = 'normal' | 'volumen' | 'deficit' | 'descanso'
export type MealType = 'desayuno' | 'media_manana' | 'almuerzo' | 'merienda' | 'cena' | 'snack'

export interface MacroTarget {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export const DAY_TARGETS: Record<DayType, MacroTarget> = {
  normal:   { kcal: 2200, protein: 160, carbs: 220, fat: 70 },
  volumen:  { kcal: 2700, protein: 180, carbs: 320, fat: 80 },
  deficit:  { kcal: 1700, protein: 170, carbs: 140, fat: 55 },
  descanso: { kcal: 1900, protein: 160, carbs: 170, fat: 65 },
}

export interface FoodEntry {
  id: string
  name: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  meal?: MealType
  createdAt: Date
}
