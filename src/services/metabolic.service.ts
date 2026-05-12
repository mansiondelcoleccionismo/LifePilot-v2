import type { UserProfile, ActivityLevel, Goal } from '@/types/profile'
import type { MacroTarget, DayType } from '@/types/nutrition'

const PROFILE_KEY = 'lifepilot_metabolic_profile'

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary:   1.2,
  light:       1.375,
  moderate:    1.55,
  active:      1.725,
  very_active: 1.9,
}

export const DEFAULT_PROFILE: UserProfile = {
  name: 'Daniel',
  weight: 75,
  height: 178,
  birthDate: '1991-02-10',
  activityLevel: 'moderate',
  padelDays: [1, 3],
  trainingDays: [2, 3, 4, 6],
  goal: 'recomposicion',
}

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (raw) return { ...DEFAULT_PROFILE, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_PROFILE }
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export function calcAge(birthDate: string): number {
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export function calcBMR(profile: UserProfile): number {
  const age = calcAge(profile.birthDate)
  return Math.round(10 * profile.weight + 6.25 * profile.height - 5 * age + 5)
}

export function calcTDEE(profile: UserProfile): number {
  return Math.round(calcBMR(profile) * ACTIVITY_MULTIPLIERS[profile.activityLevel])
}

export function calcIMC(profile: UserProfile): number {
  return Math.round((profile.weight / Math.pow(profile.height / 100, 2)) * 10) / 10
}

export function calcIdealWeight(profile: UserProfile): number {
  return Math.round(22 * Math.pow(profile.height / 100, 2) * 10) / 10
}

function buildTarget(kcal: number, protein: number, fat: number): MacroTarget {
  const carbKcal = kcal - protein * 4 - fat * 9
  return { kcal, protein, carbs: Math.max(0, Math.round(carbKcal / 4)), fat }
}

type DayKind = 'training' | 'padel' | 'padel_training' | 'rest'

export function calcTargetsForGoal(profile: UserProfile): Record<DayKind, MacroTarget> {
  const tdee = calcTDEE(profile)
  const protein = Math.round(profile.weight * 2)
  const fat = Math.round(profile.weight * 0.9)

  const offsets: Record<Goal, Record<DayKind, number>> = {
    recomposicion: { training: 100,  padel: 150,  padel_training: 200,  rest: -300 },
    deficit:       { training: -300, padel: -200, padel_training: -150, rest: -500 },
    volumen:       { training: 300,  padel: 250,  padel_training: 350,  rest: 100  },
    mantenimiento: { training: 50,   padel: 100,  padel_training: 150,  rest: -100 },
  }

  const off = offsets[profile.goal]
  return {
    training:       buildTarget(tdee + off.training,       protein, fat),
    padel:          buildTarget(tdee + off.padel,          protein, fat),
    padel_training: buildTarget(tdee + off.padel_training, protein, fat),
    rest:           buildTarget(tdee + off.rest,           protein, fat),
  }
}

export function getDayKind(profile: UserProfile, dow?: number): DayKind {
  const day = dow ?? new Date().getDay()
  const isPadel    = profile.padelDays.includes(day)
  const isTraining = profile.trainingDays.includes(day)
  if (isPadel && isTraining) return 'padel_training'
  if (isTraining)            return 'training'
  if (isPadel)               return 'padel'
  return 'rest'
}

export function getTargetForDay(profile: UserProfile, dow?: number): MacroTarget {
  return calcTargetsForGoal(profile)[getDayKind(profile, dow)]
}

export function getTargetForDayType(profile: UserProfile, dayType: DayType): MacroTarget {
  const targets = calcTargetsForGoal(profile)
  const map: Record<DayType, DayKind> = {
    volumen:  'training',
    normal:   'padel',
    deficit:  'rest',
    descanso: 'rest',
  }
  return targets[map[dayType]]
}

export function autoDetectDayType(profile: UserProfile, dow?: number): DayType {
  const kind = getDayKind(profile, dow)
  if (kind === 'training' || kind === 'padel_training') return 'volumen'
  if (kind === 'padel') return 'normal'
  return 'descanso'
}

export function getDayLabel(profile: UserProfile, dow?: number): string {
  const kind = getDayKind(profile, dow)
  const labels: Record<DayKind, string> = {
    training:       'Día de entreno',
    padel:          'Día de pádel',
    padel_training: 'Pesas + Pádel',
    rest:           'Descanso',
  }
  return labels[kind]
}
