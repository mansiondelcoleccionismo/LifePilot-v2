import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { FoodEntry, MealType } from '@/types/nutrition'

const COL = 'nutrition_entries'

const MEAL_REMAP: Record<string, MealType> = {
  media_manana: 'almuerzo',
  snack: 'cena',
}

function normalizeMeal(meal?: string): MealType {
  if (!meal) return 'cena'
  return (MEAL_REMAP[meal] ?? meal) as MealType
}

export interface FrequentFood {
  name: string
  count: number
  avgKcal: number
  avgProtein: number
  avgCarbs: number
  avgFat: number
}

export interface FoodCombo {
  id: string
  name: string
  emoji: string
  meal: MealType
  count: number
  foods: FrequentFood[]
}

export interface PatternData {
  frequentFoods: Record<MealType, FrequentFood[]>
  combos: FoodCombo[]
  yesterdayByMeal: Record<MealType, FoodEntry[]>
  yesterdayMeals: Set<MealType>
}

const EMPTY_MEAL_MAP = <T>() => ({
  desayuno: [] as T[], almuerzo: [] as T[], comida: [] as T[], merienda: [] as T[], cena: [] as T[],
}) as Record<MealType, T[]>

const MEAL_LABELS: Record<MealType, string> = {
  desayuno: 'Desayuno', almuerzo: 'Almuerzo', comida: 'Comida', merienda: 'Merienda', cena: 'Cena',
}

const MEAL_EMOJIS: Record<MealType, string> = {
  desayuno: '🌅', almuerzo: '🍎', comida: '🍽️', merienda: '🫐', cena: '🌙',
}

async function fetchEntries(start: Date, end?: Date): Promise<FoodEntry[]> {
  try {
    const constraints = end
      ? [where('createdAt', '>=', start), where('createdAt', '<=', end), orderBy('createdAt', 'asc')]
      : [where('createdAt', '>=', start), orderBy('createdAt', 'asc')]
    const snap = await getDocs(query(collection(db, COL), ...constraints))
    return snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate() ?? new Date(),
    })) as FoodEntry[]
  } catch {
    return []
  }
}

export async function loadPatternData(): Promise<PatternData> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  thirtyDaysAgo.setHours(0, 0, 0, 0)

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const yesterdayEnd = new Date(yesterday)
  yesterdayEnd.setHours(23, 59, 59, 999)

  const [allEntries, yesterdayEntries] = await Promise.all([
    fetchEntries(thirtyDaysAgo),
    fetchEntries(yesterday, yesterdayEnd),
  ])

  // Build yesterday data
  const yesterdayByMeal = EMPTY_MEAL_MAP<FoodEntry>()
  const yesterdayMeals = new Set<MealType>()
  for (const e of yesterdayEntries) {
    const meal = normalizeMeal(e.meal)
    yesterdayByMeal[meal].push(e)
    yesterdayMeals.add(meal)
  }

  // Group all entries by day + meal
  const byDayMeal: Record<string, Record<MealType, FoodEntry[]>> = {}
  for (const e of allEntries) {
    const day = e.createdAt.toISOString().split('T')[0]
    if (!byDayMeal[day]) byDayMeal[day] = EMPTY_MEAL_MAP<FoodEntry>()
    byDayMeal[day][normalizeMeal(e.meal)].push(e)
  }

  // Detect frequent foods per meal (≥ 3 occurrences)
  type FoodAcc = Record<string, { count: number; totalKcal: number; totalProtein: number; totalCarbs: number; totalFat: number }>
  const mealFoodCounts: Record<MealType, FoodAcc> = {
    desayuno: {}, almuerzo: {}, comida: {}, merienda: {}, cena: {},
  }

  for (const dayData of Object.values(byDayMeal)) {
    for (const [meal, entries] of Object.entries(dayData) as [MealType, FoodEntry[]][]) {
      for (const e of entries) {
        const key = e.name.toLowerCase()
        const acc = mealFoodCounts[meal]
        if (!acc[key]) acc[key] = { count: 0, totalKcal: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 }
        acc[key].count++
        acc[key].totalKcal += e.kcal
        acc[key].totalProtein += e.protein
        acc[key].totalCarbs += e.carbs
        acc[key].totalFat += e.fat
      }
    }
  }

  const frequentFoods: Record<MealType, FrequentFood[]> = {
    desayuno: [], almuerzo: [], comida: [], merienda: [], cena: [],
  }
  for (const [meal, foods] of Object.entries(mealFoodCounts) as [MealType, FoodAcc][]) {
    frequentFoods[meal] = Object.entries(foods)
      .filter(([, v]) => v.count >= 3)
      .map(([name, v]) => ({
        name,
        count: v.count,
        avgKcal: Math.round(v.totalKcal / v.count),
        avgProtein: Math.round(v.totalProtein / v.count * 10) / 10,
        avgCarbs: Math.round(v.totalCarbs / v.count * 10) / 10,
        avgFat: Math.round(v.totalFat / v.count * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count)
  }

  // Detect combos: pairs always together in same meal+day ≥ 3 times
  type PairAcc = {
    count: number
    meal: MealType
    foodData: Record<string, { count: number; totalKcal: number; totalProtein: number; totalCarbs: number; totalFat: number }>
  }
  const pairCounts: Record<string, PairAcc> = {}

  for (const dayData of Object.values(byDayMeal)) {
    for (const [meal, entries] of Object.entries(dayData) as [MealType, FoodEntry[]][]) {
      if (entries.length < 2) continue
      // Dedupe by name within the same day+meal
      const uniqueMap = new Map<string, FoodEntry>()
      for (const e of entries) uniqueMap.set(e.name.toLowerCase(), e)
      const uniq = Array.from(uniqueMap.values())
      if (uniq.length < 2) continue

      for (let i = 0; i < uniq.length; i++) {
        for (let j = i + 1; j < uniq.length; j++) {
          const a = uniq[i], b = uniq[j]
          const pairKey = [a.name.toLowerCase(), b.name.toLowerCase()].sort().join('|||') + `|||${meal}`
          if (!pairCounts[pairKey]) pairCounts[pairKey] = { count: 0, meal, foodData: {} }
          pairCounts[pairKey].count++
          for (const e of [a, b]) {
            const fn = e.name.toLowerCase()
            const fd = pairCounts[pairKey].foodData
            if (!fd[fn]) fd[fn] = { count: 0, totalKcal: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 }
            fd[fn].count++
            fd[fn].totalKcal += e.kcal
            fd[fn].totalProtein += e.protein
            fd[fn].totalCarbs += e.carbs
            fd[fn].totalFat += e.fat
          }
        }
      }
    }
  }

  const combos: FoodCombo[] = Object.entries(pairCounts)
    .filter(([, v]) => v.count >= 3)
    .map(([key, v]) => ({
      id: key,
      name: `${MEAL_LABELS[v.meal]} habitual`,
      emoji: MEAL_EMOJIS[v.meal],
      meal: v.meal,
      count: v.count,
      foods: Object.entries(v.foodData).map(([name, data]) => ({
        name,
        count: data.count,
        avgKcal: Math.round(data.totalKcal / data.count),
        avgProtein: Math.round(data.totalProtein / data.count * 10) / 10,
        avgCarbs: Math.round(data.totalCarbs / data.count * 10) / 10,
        avgFat: Math.round(data.totalFat / data.count * 10) / 10,
      })),
    }))
    .sort((a, b) => b.count - a.count)

  return { frequentFoods, combos, yesterdayByMeal, yesterdayMeals }
}
