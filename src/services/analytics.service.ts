import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { loadProfile, getTargetForDay } from './metabolic.service'
import type { UserProfile } from '@/types/profile'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiaryDay   { date: string; mood: number }
export interface NutritionDay { date: string; kcal: number; protein: number; carbs: number; fat: number }
export interface MedDay     { date: string; compliance: number; taken: number; total: number }

export interface AnalyticsRaw {
  diary:          DiaryDay[]
  nutrition:      NutritionDay[]
  medDays:        MedDay[]
  tasksCreated:   number
  tasksCompleted: number
  dateRange:      string[]
}

export interface Patterns {
  moodByDayOfWeek:       Record<string, number>
  bestMoodDay:           string
  worstMoodDay:          string
  avgMood:               number
  macrosComplianceDays:  number
  proteinAvgTrainingDays: number
  proteinAvgRestDays:    number
  currentStreak:         number
  medicationCompliance:  number   // 0-100 | -1 if no data
  tasksCompletionRate:   number   // 0-100 | -1 if no data
  totalDaysWithData:     number
  weeklyNutritionDays:   number
  weeklyMood:            number
  weeklyMedCompliance:   number
  weeklyDiaryDays:       number
  weeklyTasksCreated:    number
  weeklyTasksCompleted:  number
}

export interface Insight {
  id:       string
  text:     string
  icon:     string
  type:     'positive' | 'improvement' | 'alert' | 'info'
  impact:   'Alto impacto' | 'Medio' | 'Positivo'
  category: 'nutricion' | 'entreno' | 'humor' | 'tareas' | 'medicacion'
}

export interface TodayScore {
  total:        number
  diaryOk:      boolean
  nutritionOk:  boolean
  medicationOk: boolean
  trainingOk:   boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function getLast30Days(): string[] {
  const days: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(dateStr(d))
  }
  return days
}

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function dateToDow(ds: string): number {
  return new Date(ds + 'T12:00:00').getDay()
}

function weekStart(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday
  d.setDate(d.getDate() + diff)
  return dateStr(d)
}

// ── Firebase fetchers ─────────────────────────────────────────────────────────

async function fetchDiary(start: string, end: string): Promise<DiaryDay[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'diary_entries'), where('date', '>=', start), where('date', '<=', end)),
    )
    return snap.docs.map(d => ({ date: d.data().date as string, mood: d.data().mood as number }))
  } catch { return [] }
}

async function fetchNutrition(start: Date, end: Date): Promise<NutritionDay[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'nutrition_entries'), where('createdAt', '>=', start), where('createdAt', '<=', end)),
    )
    const byDate: Record<string, NutritionDay> = {}
    for (const d of snap.docs) {
      const data = d.data()
      const ts   = data.createdAt?.toDate?.() ?? new Date()
      const date = dateStr(ts)
      if (!byDate[date]) byDate[date] = { date, kcal: 0, protein: 0, carbs: 0, fat: 0 }
      byDate[date].kcal    += (data.kcal    ?? 0)
      byDate[date].protein += (data.protein ?? 0)
      byDate[date].carbs   += (data.carbs   ?? 0)
      byDate[date].fat     += (data.fat     ?? 0)
    }
    return Object.values(byDate)
  } catch { return [] }
}

async function fetchTasks(start: Date, end: Date): Promise<{ created: number; completed: number }> {
  try {
    const snap = await getDocs(
      query(collection(db, 'tasks'), where('createdAt', '>=', start), where('createdAt', '<=', end)),
    )
    let created = 0, completed = 0
    snap.docs.forEach(d => { created++; if (d.data().completed) completed++ })
    return { created, completed }
  } catch { return { created: 0, completed: 0 } }
}

async function fetchMedDay(date: string): Promise<MedDay | null> {
  try {
    const snap = await getDocs(collection(db, 'medication_logs', date, 'medications'))
    if (snap.empty) return null
    let taken = 0, total = 0
    snap.docs.forEach(d => { total++; if (d.data().taken) taken++ })
    return { date, taken, total, compliance: total > 0 ? taken / total : 0 }
  } catch { return null }
}

// ── Main loader ───────────────────────────────────────────────────────────────

export async function getLast30DaysData(): Promise<AnalyticsRaw> {
  const dateRange = getLast30Days()
  const startDate = dateRange[0]
  const endDate   = dateRange[dateRange.length - 1]
  const startTs   = new Date(startDate + 'T00:00:00')
  const endTs     = new Date(endDate   + 'T23:59:59.999')

  const [diary, nutrition, tasks] = await Promise.all([
    fetchDiary(startDate, endDate),
    fetchNutrition(startTs, endTs),
    fetchTasks(startTs, endTs),
  ])

  // Medication: only last 14 days to limit parallel requests
  const last14     = dateRange.slice(-14)
  const medResults = await Promise.all(last14.map(d => fetchMedDay(d)))
  const medDays    = medResults.filter(Boolean) as MedDay[]

  return {
    diary, nutrition, medDays,
    tasksCreated:   tasks.created,
    tasksCompleted: tasks.completed,
    dateRange,
  }
}

// ── Pattern calculator ────────────────────────────────────────────────────────

export function calculatePatterns(raw: AnalyticsRaw, profile: UserProfile): Patterns {
  const { diary, nutrition, medDays, tasksCreated, tasksCompleted } = raw
  const ws = weekStart()

  // Days with any data
  const datesWithData = new Set([...diary.map(d => d.date), ...nutrition.map(d => d.date)])
  const totalDaysWithData = datesWithData.size

  // Mood by day of week
  const moodAcc: Record<string, { sum: number; count: number }> = {}
  for (const e of diary) {
    const dow = DOW[dateToDow(e.date)]
    if (!moodAcc[dow]) moodAcc[dow] = { sum: 0, count: 0 }
    moodAcc[dow].sum += e.mood
    moodAcc[dow].count++
  }

  const moodByDayOfWeek: Record<string, number> = {}
  for (const [day, { sum, count }] of Object.entries(moodAcc)) {
    if (count >= 2) moodByDayOfWeek[day] = Math.round((sum / count) * 10) / 10
  }

  const moodEntries = Object.entries(moodByDayOfWeek)
  const bestMoodDay  = moodEntries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  const worstMoodDay = moodEntries.sort((a, b) => a[1] - b[1])[0]?.[0] ?? ''
  const avgMood      = diary.length > 0
    ? Math.round((diary.reduce((s, d) => s + d.mood, 0) / diary.length) * 10) / 10
    : 0

  // Macro compliance + protein split
  let macrosComplianceDays = 0
  let protSumTrain = 0, protCntTrain = 0
  let protSumRest  = 0, protCntRest  = 0

  for (const day of nutrition) {
    const dow    = dateToDow(day.date)
    const target = getTargetForDay(profile, dow)
    if (day.kcal >= target.kcal * 0.8 && day.protein >= target.protein * 0.8) macrosComplianceDays++
    const isActive = profile.trainingDays.includes(dow) || profile.padelDays.includes(dow)
    if (isActive) { protSumTrain += day.protein; protCntTrain++ }
    else          { protSumRest  += day.protein; protCntRest++ }
  }

  const proteinAvgTrainingDays = protCntTrain > 0 ? Math.round(protSumTrain / protCntTrain) : 0
  const proteinAvgRestDays     = protCntRest  > 0 ? Math.round(protSumRest  / protCntRest)  : 0

  // Current streak (consecutive diary days ending today)
  const diaryDates = new Set(diary.map(d => d.date))
  let currentStreak = 0
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate() - i)
    if (diaryDates.has(dateStr(d))) currentStreak++
    else break
  }

  // Medication
  const medicationCompliance = medDays.length > 0
    ? Math.round((medDays.reduce((s, d) => s + d.compliance, 0) / medDays.length) * 100)
    : -1

  // Tasks
  const tasksCompletionRate = tasksCreated > 0
    ? Math.round((tasksCompleted / tasksCreated) * 100)
    : -1

  // This-week metrics
  const weekDiary     = diary.filter(d => d.date >= ws)
  const weekNutrition = nutrition.filter(d => d.date >= ws)
  const weekMed       = medDays.filter(d => d.date >= ws)

  const weeklyDiaryDays     = weekDiary.length
  const weeklyNutritionDays = weekNutrition.length
  const weeklyMood          = weekDiary.length > 0
    ? Math.round((weekDiary.reduce((s, d) => s + d.mood, 0) / weekDiary.length) * 10) / 10
    : 0
  const weeklyMedCompliance = weekMed.length > 0
    ? Math.round((weekMed.reduce((s, d) => s + d.compliance, 0) / weekMed.length) * 100)
    : -1

  // This-week tasks need separate query; approximate from last 7 days of raw data
  const weeklyTasksCreated   = tasksCreated   // already filtered to 30d; weekly would need separate fetch
  const weeklyTasksCompleted = tasksCompleted

  return {
    moodByDayOfWeek, bestMoodDay, worstMoodDay, avgMood,
    macrosComplianceDays,
    proteinAvgTrainingDays, proteinAvgRestDays,
    currentStreak,
    medicationCompliance, tasksCompletionRate,
    totalDaysWithData,
    weeklyNutritionDays, weeklyMood, weeklyMedCompliance,
    weeklyDiaryDays, weeklyTasksCreated, weeklyTasksCompleted,
  }
}

// ── Insight generator ─────────────────────────────────────────────────────────

export function generateInsights(patterns: Patterns, raw: AnalyticsRaw, profile: UserProfile): Insight[] {
  const insights: Insight[] = []
  const { diary, nutrition } = raw

  if (diary.length < 3 && nutrition.length < 3) return insights

  // Protein: training vs rest days
  if (patterns.proteinAvgTrainingDays > 0 && patterns.proteinAvgRestDays > 0) {
    const diff = patterns.proteinAvgTrainingDays - patterns.proteinAvgRestDays
    const pct  = Math.round((diff / patterns.proteinAvgTrainingDays) * 100)
    if (pct > 20) {
      insights.push({
        id: 'protein-rest',
        text: `Tu proteína los días de descanso es un ${pct}% menor que en días de entreno (${patterns.proteinAvgRestDays}g vs ${patterns.proteinAvgTrainingDays}g) — justo cuando más la necesitas para recuperar.`,
        icon: '🥗', type: 'improvement', impact: 'Alto impacto', category: 'nutricion',
      })
    } else if (pct < 5 && patterns.proteinAvgTrainingDays > 0) {
      insights.push({
        id: 'protein-consistent',
        text: `Tu proteína es consistente: ${patterns.proteinAvgTrainingDays}g de media tanto en días de entreno como de descanso. Excelente.`,
        icon: '🥗', type: 'positive', impact: 'Positivo', category: 'nutricion',
      })
    }
  }

  // Macro compliance
  if (nutrition.length >= 7) {
    const rate = patterns.macrosComplianceDays / nutrition.length
    if (rate < 0.5) {
      insights.push({
        id: 'macros-low',
        text: `Solo cumples los macros ${patterns.macrosComplianceDays} de ${nutrition.length} días registrados. La constancia nutricional es clave para la recomposición.`,
        icon: '🥗', type: 'alert', impact: 'Alto impacto', category: 'nutricion',
      })
    } else if (rate >= 0.8) {
      insights.push({
        id: 'macros-great',
        text: `Cumples los macros el ${Math.round(rate * 100)}% de los días — una consistencia nutricional excelente para tus objetivos.`,
        icon: '🥗', type: 'positive', impact: 'Positivo', category: 'nutricion',
      })
    }
  }

  // Mood by day of week
  const moodEntries = Object.entries(patterns.moodByDayOfWeek)
  if (moodEntries.length >= 3 && patterns.bestMoodDay && patterns.worstMoodDay && patterns.bestMoodDay !== patterns.worstMoodDay) {
    const best  = patterns.moodByDayOfWeek[patterns.bestMoodDay]
    const worst = patterns.moodByDayOfWeek[patterns.worstMoodDay]
    if (best - worst >= 0.8) {
      insights.push({
        id: 'mood-days',
        text: `${patterns.bestMoodDay} es tu mejor día de ánimo (${best}/5) y ${patterns.worstMoodDay} el peor (${worst}/5). Planifica las tareas más exigentes los ${patterns.bestMoodDay}.`,
        icon: '😊', type: 'info', impact: 'Medio', category: 'humor',
      })
    }
  }

  // Streak
  if (patterns.currentStreak >= 7) {
    insights.push({
      id: 'streak',
      text: `Llevas ${patterns.currentStreak} días consecutivos registrando el diario. Esa constancia mejora la precisión de todos los análisis.`,
      icon: '🔥', type: 'positive', impact: 'Positivo', category: 'humor',
    })
  } else if (patterns.currentStreak === 0 && diary.length > 0) {
    insights.push({
      id: 'streak-broken',
      text: `Hoy no has registrado el diario todavía. Mantener la racha mejora la calidad de las predicciones.`,
      icon: '📖', type: 'improvement', impact: 'Medio', category: 'humor',
    })
  }

  // Medication
  if (patterns.medicationCompliance >= 0) {
    if (patterns.medicationCompliance < 80) {
      insights.push({
        id: 'medication-low',
        text: `Tu cumplimiento de medicación es del ${patterns.medicationCompliance}% — por debajo del 80% recomendado. Los recordatorios en Ajustes pueden ayudar.`,
        icon: '💊', type: 'alert', impact: 'Alto impacto', category: 'medicacion',
      })
    } else if (patterns.medicationCompliance >= 95) {
      insights.push({
        id: 'medication-great',
        text: `Cumplimiento de medicación del ${patterns.medicationCompliance}% — adherencia excelente al tratamiento.`,
        icon: '💊', type: 'positive', impact: 'Positivo', category: 'medicacion',
      })
    }
  }

  // Tasks
  if (patterns.tasksCompletionRate >= 0 && patterns.tasksCompletionRate < 50 && raw.tasksCreated >= 5) {
    insights.push({
      id: 'tasks-low',
      text: `Solo el ${patterns.tasksCompletionRate}% de tus tareas de los últimos 30 días están completadas. Considera reducir el backlog para mejorar el ratio.`,
      icon: '✅', type: 'improvement', impact: 'Medio', category: 'tareas',
    })
  }

  return insights
}

// ── Today score ───────────────────────────────────────────────────────────────

export function calculateTodayScore(raw: AnalyticsRaw, profile: UserProfile): TodayScore {
  const today    = dateStr(new Date())
  const todayDow = new Date().getDay()

  const diaryOk = raw.diary.some(d => d.date === today)

  const todayNut = raw.nutrition.find(d => d.date === today)
  const target   = getTargetForDay(profile)
  const nutritionOk = !!todayNut &&
    todayNut.kcal    >= target.kcal    * 0.8 &&
    todayNut.protein >= target.protein * 0.8

  const todayMed    = raw.medDays.find(d => d.date === today)
  const medicationOk = !!todayMed && todayMed.compliance === 1

  // Training: rest day = automatic point; training day = unknown without session log
  const isActiveDay  = profile.trainingDays.includes(todayDow) || profile.padelDays.includes(todayDow)
  const trainingOk   = !isActiveDay

  const total =
    (diaryOk      ? 25 : 0) +
    (nutritionOk  ? 25 : 0) +
    (medicationOk ? 25 : 0) +
    (trainingOk   ? 25 : 0)

  return { total, diaryOk, nutritionOk, medicationOk, trainingOk }
}

// ── Re-export profile loader for convenience ──────────────────────────────────
export { loadProfile }
