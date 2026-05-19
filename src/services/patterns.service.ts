import {
  collection, getDocs, query, where, orderBy, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { loadProfile, getDayKind, getTargetForDay } from './metabolic.service'
import type { UserProfile } from '@/types/profile'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayData {
  date: string
  dow: number           // 0=Sun … 6=Sat
  mood: number | null
  protein: number       // grams
  kcal: number
  steps: number | null
  sleepHours: number | null
  isWorkoutDay: boolean // based on profile (pesas or padel)
  proteinTarget: number
  kcalTarget: number
}

export interface Correlation {
  g1Label: string; g1Mood: number; g1N: number
  g2Label: string; g2Mood: number; g2N: number
  diffPct: number       // percentage difference between groups
  g1Better: boolean     // is g1 the better group?
}

export interface PatternStreak {
  emoji: string
  label: string
  count: number
}

export interface PatternInsight {
  theme: 'ejercicio' | 'nutricion' | 'pasos' | 'sueno' | 'racha' | 'semana'
  text: string
  dataPoint: string
  positive: boolean
}

export interface WeekdayMood {
  dow: number
  label: string
  avgMood: number | null
  n: number
}

export interface WeeklyPoint {
  label: string         // "Sem 1", etc.
  avgMood: number | null
  proteinCompliance: number | null  // 0-100
  trainings: number
}

export interface PatternResult {
  days: number
  totalDays: number
  daysWithMood: number
  daysWithNutrition: number
  correlations: {
    ejercicio: Correlation | null
    proteina:  Correlation | null
    pasos:     Correlation | null
    sueno:     Correlation | null
  }
  streaks: PatternStreak[]
  weekdayMoods: WeekdayMood[]
  weeklyData: WeeklyPoint[]
  insights: PatternInsight[]
  hasEnoughData: boolean
  daysNeeded: number
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000
let _cache: { key: string; result: PatternResult; ts: number } | null = null

export function invalidatePatternsCache() {
  _cache = null
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function analyzePatterns(days = 30): Promise<PatternResult> {
  const cacheKey = `patterns_${days}`
  if (_cache && _cache.key === cacheKey && Date.now() - _cache.ts < CACHE_TTL_MS) {
    return _cache.result
  }

  const profile = loadProfile()
  const endDate  = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days + 1)
  const startStr = startDate.toISOString().slice(0, 10)
  const endStr   = endDate.toISOString().slice(0, 10)

  const [diaryMap, healthMap, nutritionMap] = await Promise.all([
    _fetchDiary(startStr, endStr),
    _fetchHealth(startStr, endStr),
    _fetchNutrition(startDate, endDate),
  ])

  const dayData = _buildDayData(startStr, days, profile, diaryMap, healthMap, nutritionMap)

  const correlations = {
    ejercicio: _corrMood(dayData, d => d.isWorkoutDay,                              'Días con entreno', 'Días de descanso'),
    proteina:  _corrMood(dayData.filter(d => d.proteinTarget > 0 && d.protein > 0), d => d.protein >= d.proteinTarget * 0.8, 'Cumpliendo proteína', 'Sin cumplir objetivo'),
    pasos:     _corrMood(dayData.filter(d => d.steps !== null),                      d => (d.steps ?? 0) >= 7000,            '+7000 pasos',         '<7000 pasos'),
    sueno:     _corrMood(dayData.filter(d => d.sleepHours !== null),                 d => (d.sleepHours ?? 0) >= 7,           '>7h de sueño',        '<7h de sueño'),
  }

  const streaks      = _calcStreaks(dayData)
  const weekdayMoods = _calcWeekdayMoods(dayData)
  const weeklyData   = _calcWeeklyData(dayData)
  const insights     = _genInsights(correlations, streaks, weekdayMoods)

  const daysWithMood      = dayData.filter(d => d.mood !== null).length
  const daysWithNutrition = dayData.filter(d => d.protein > 0).length

  const result: PatternResult = {
    days,
    totalDays: dayData.length,
    daysWithMood,
    daysWithNutrition,
    correlations,
    streaks,
    weekdayMoods,
    weeklyData,
    insights,
    hasEnoughData: daysWithMood >= 14,
    daysNeeded: Math.max(0, 14 - daysWithMood),
  }

  _cache = { key: cacheKey, result, ts: Date.now() }
  return result
}

// ── Builders ──────────────────────────────────────────────────────────────────

function _buildDayData(
  startStr: string,
  days: number,
  profile: UserProfile,
  diaryMap: Map<string, number>,
  healthMap: Map<string, { steps?: number; sleepHours?: number; sleepMinutes?: number }>,
  nutritionMap: Map<string, { protein: number; kcal: number }>,
): DayData[] {
  const result: DayData[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(startStr + 'T12:00:00')
    d.setDate(d.getDate() + i)
    const date   = d.toISOString().slice(0, 10)
    const dow    = d.getDay()
    const target = getTargetForDay(profile, dow)
    const health = healthMap.get(date)
    const nutr   = nutritionMap.get(date) ?? { protein: 0, kcal: 0 }
    const kind   = getDayKind(profile, dow)
    result.push({
      date,
      dow,
      mood:         diaryMap.get(date) ?? null,
      protein:      Math.round(nutr.protein),
      kcal:         Math.round(nutr.kcal),
      steps:        health?.steps ?? null,
      sleepHours:   health?.sleepHours != null
        ? Math.round((health.sleepHours + (health.sleepMinutes ?? 0) / 60) * 10) / 10
        : null,
      isWorkoutDay: kind === 'training' || kind === 'padel' || kind === 'padel_training',
      proteinTarget: target.protein,
      kcalTarget:    target.kcal,
    })
  }
  return result
}

// ── Statistics ────────────────────────────────────────────────────────────────

function _avg(nums: number[]): number {
  return nums.length ? Math.round(nums.reduce((s, v) => s + v, 0) / nums.length * 10) / 10 : 0
}

function _corrMood(
  days: DayData[],
  pred: (d: DayData) => boolean,
  g1Label: string,
  g2Label: string,
): Correlation | null {
  const g1 = days.filter(d => d.mood !== null && pred(d)).map(d => d.mood!)
  const g2 = days.filter(d => d.mood !== null && !pred(d)).map(d => d.mood!)
  if (g1.length < 5 || g2.length < 5) return null
  const m1 = _avg(g1), m2 = _avg(g2)
  const base = Math.max(m1, m2)
  const diffPct = base > 0 ? Math.round(Math.abs(m1 - m2) / base * 100) : 0
  if (diffPct < 15) return null
  return { g1Label, g1Mood: m1, g1N: g1.length, g2Label, g2Mood: m2, g2N: g2.length, diffPct, g1Better: m1 >= m2 }
}

function _calcStreaks(dayData: DayData[]): PatternStreak[] {
  const sorted = [...dayData].sort((a, b) => b.date.localeCompare(a.date)) // newest first
  const streak = (pred: (d: DayData) => boolean): number => {
    let n = 0
    for (const d of sorted) {
      if (pred(d)) n++; else break
    }
    return n
  }
  const out: PatternStreak[] = []
  const training = streak(d => d.isWorkoutDay)
  const protein  = streak(d => d.protein > 0 && d.proteinTarget > 0 && d.protein >= d.proteinTarget * 0.8)
  const mood4    = streak(d => d.mood !== null && d.mood >= 4)
  const steps7k  = streak(d => d.steps !== null && d.steps! >= 7000)
  if (training >= 2) out.push({ emoji: '💪', label: 'días entrenando seguidos',     count: training })
  if (protein  >= 2) out.push({ emoji: '🍗', label: 'días cumpliendo proteína',      count: protein  })
  if (mood4    >= 2) out.push({ emoji: '😊', label: 'días con mood ≥ 4',             count: mood4    })
  if (steps7k  >= 2) out.push({ emoji: '👣', label: 'días con +7000 pasos',          count: steps7k  })
  return out
}

const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function _calcWeekdayMoods(dayData: DayData[]): WeekdayMood[] {
  return Array.from({ length: 7 }, (_, dow) => {
    const moods = dayData.filter(d => d.dow === dow && d.mood !== null).map(d => d.mood!)
    return {
      dow,
      label: DOW_LABELS[dow],
      avgMood: moods.length >= 2 ? _avg(moods) : null,
      n: moods.length,
    }
  })
}

function _calcWeeklyData(dayData: DayData[]): WeeklyPoint[] {
  const weeks = new Map<string, DayData[]>()
  for (const d of dayData) {
    const date = new Date(d.date + 'T12:00:00')
    const ws   = new Date(date)
    ws.setDate(date.getDate() - date.getDay())
    const key = ws.toISOString().slice(0, 10)
    if (!weeks.has(key)) weeks.set(key, [])
    weeks.get(key)!.push(d)
  }
  return Array.from(weeks.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, days], i) => {
      const moodDays  = days.filter(d => d.mood !== null)
      const nutrDays  = days.filter(d => d.proteinTarget > 0 && d.protein > 0)
      return {
        label:             `Sem ${i + 1}`,
        avgMood:           moodDays.length >= 2 ? _avg(moodDays.map(d => d.mood!)) : null,
        proteinCompliance: nutrDays.length >= 2
          ? Math.round(nutrDays.filter(d => d.protein >= d.proteinTarget * 0.8).length / nutrDays.length * 100)
          : null,
        trainings: days.filter(d => d.isWorkoutDay).length,
      }
    })
}

// ── Insight generation ────────────────────────────────────────────────────────

function _genInsights(
  corr: PatternResult['correlations'],
  streaks: PatternStreak[],
  weekdayMoods: WeekdayMood[],
): PatternInsight[] {
  const out: PatternInsight[] = []

  if (corr.ejercicio) {
    const c = corr.ejercicio
    out.push({
      theme: 'ejercicio',
      text:      `Tu mood es ${c.diffPct}% ${c.g1Better ? 'mejor' : 'peor'} los días que entrenas`,
      dataPoint: `${c.g1Mood} ↑ vs ${c.g2Mood} (${c.g2Label.toLowerCase()})`,
      positive:  c.g1Better,
    })
  }

  if (corr.proteina) {
    const c = corr.proteina
    const diff = Math.abs(c.g1Mood - c.g2Mood).toFixed(1)
    out.push({
      theme: 'nutricion',
      text:      `Cuando cumples el objetivo de proteína tu mood ${c.g1Better ? 'sube' : 'baja'} ${diff} puntos`,
      dataPoint: `${c.g1Mood} vs ${c.g2Mood} sin cumplirlo`,
      positive:  c.g1Better,
    })
  }

  if (corr.pasos) {
    const c = corr.pasos
    out.push({
      theme: 'pasos',
      text:      `Con más de 7000 pasos tu mood es ${c.diffPct}% ${c.g1Better ? 'mayor' : 'menor'}`,
      dataPoint: `${c.g1Mood} vs ${c.g2Mood} (<7000 pasos)`,
      positive:  c.g1Better,
    })
  }

  if (corr.sueno) {
    const c = corr.sueno
    out.push({
      theme: 'sueno',
      text:      `Durmiendo más de 7h tu mood es ${c.diffPct}% ${c.g1Better ? 'mayor' : 'menor'}`,
      dataPoint: `${c.g1Mood} vs ${c.g2Mood} (<7h)`,
      positive:  c.g1Better,
    })
  }

  for (const s of streaks) {
    if (s.count >= 3) {
      out.push({
        theme:     'racha',
        text:      `Llevas ${s.count} ${s.label}`,
        dataPoint: s.emoji,
        positive:  true,
      })
    }
  }

  const withData = weekdayMoods.filter(w => w.avgMood !== null && w.n >= 2)
  if (withData.length >= 4) {
    const best  = withData.reduce((a, b) => a.avgMood! > b.avgMood! ? a : b)
    const worst = withData.reduce((a, b) => a.avgMood! < b.avgMood! ? a : b)
    if (best.dow !== worst.dow) {
      out.push({
        theme:     'semana',
        text:      `Tu mejor día de la semana es el ${best.label} (mood ${best.avgMood})`,
        dataPoint: `El ${worst.label} es tu peor día (${worst.avgMood})`,
        positive:  true,
      })
    }
  }

  return out
}

// ── Firebase fetchers ─────────────────────────────────────────────────────────

async function _fetchDiary(start: string, end: string): Promise<Map<string, number>> {
  const snap = await getDocs(query(
    collection(db, 'diary_entries'),
    where('date', '>=', start),
    where('date', '<=', end),
    orderBy('date', 'asc'),
  ))
  const map = new Map<string, number>()
  snap.forEach(d => {
    const data = d.data()
    if (data.mood && data.date) map.set(data.date as string, data.mood as number)
  })
  return map
}

async function _fetchHealth(start: string, end: string) {
  const snap = await getDocs(query(
    collection(db, 'health_data'),
    where('date', '>=', start),
    where('date', '<=', end),
    orderBy('date', 'asc'),
  ))
  const map = new Map<string, { steps?: number; sleepHours?: number; sleepMinutes?: number }>()
  snap.forEach(d => {
    const e = d.data()
    if (e.date) map.set(e.date as string, {
      steps:        e.steps        as number | undefined,
      sleepHours:   e.sleepHours   as number | undefined,
      sleepMinutes: e.sleepMinutes as number | undefined,
    })
  })
  return map
}

async function _fetchNutrition(start: Date, end: Date): Promise<Map<string, { protein: number; kcal: number }>> {
  const s = new Date(start); s.setHours(0, 0, 0, 0)
  const e = new Date(end);   e.setHours(23, 59, 59, 999)
  const snap = await getDocs(query(
    collection(db, 'nutrition_entries'),
    where('createdAt', '>=', Timestamp.fromDate(s)),
    where('createdAt', '<=', Timestamp.fromDate(e)),
  ))
  const map = new Map<string, { protein: number; kcal: number }>()
  snap.forEach(d => {
    const e2 = d.data()
    const ts = e2.createdAt as Timestamp | undefined
    if (!ts) return
    const date = ts.toDate().toISOString().slice(0, 10)
    const cur  = map.get(date) ?? { protein: 0, kcal: 0 }
    map.set(date, {
      protein: cur.protein + ((e2.protein as number) ?? 0),
      kcal:    cur.kcal    + ((e2.kcal    as number) ?? 0),
    })
  })
  return map
}
