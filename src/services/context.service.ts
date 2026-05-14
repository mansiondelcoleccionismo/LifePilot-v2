import { loadProfile, calcBMR, calcTDEE, calcAge, getDayKind, getTargetForDay } from './metabolic.service'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DayType = 'pesas' | 'padel' | 'pesas_padel' | 'kira' | 'descanso'

export interface GlobalContext {
  profile: {
    name:   string
    weight: number
    height: number
    age:    number
    goal:   string
    bmr:    number
    tdee:   number
  }
  today: {
    date:                string
    dayType:             DayType
    mood:                number | null
    kcalConsumed:        number
    kcalTarget:          number
    proteinConsumed:     number
    proteinTarget:       number
    macrosCompliance:    number   // 0-100
    medicationCompliance: number  // 0-100
    waterGlasses:        number
    waterTarget:         number
    eventsToday:         string[]
    tasksCompleted:      number
    tasksPending:        number
  }
  week: {
    trainingsCompleted:   number
    trainingsPlanned:     number
    avgMood:              number | null
    avgKcal:              number
    avgProtein:           number
    macrosComplianceDays: number
    weightChange:         number | null
  }
  patterns: {
    bestMoodDay:           string
    worstMoodDay:          string
    proteinDeficitOnRestDays: boolean
    streakCurrent:         number
    weightTrend:           'bajando' | 'subiendo' | 'estable' | 'sin_datos'
  }
  lastUpdated: Date
}

// Partial live data pushed by React pages as they subscribe to Firebase
export type ContextPatch = Partial<{
  mood:                number
  kcalConsumed:        number
  proteinConsumed:     number
  carbsConsumed:       number
  fatConsumed:         number
  medicationCompliance: number
  waterGlasses:        number
  waterTarget:         number
  eventsToday:         string[]
  tasksCompleted:      number
  tasksPending:        number
  weekTrainingsCompleted: number
  weekAvgMood:         number
  weekAvgKcal:         number
  weekAvgProtein:      number
  weekMacrosComplianceDays: number
  weightChange:        number | null
  bestMoodDay:         string
  worstMoodDay:        string
  proteinDeficitOnRestDays: boolean
  streakCurrent:       number
  weightTrend:         'bajando' | 'subiendo' | 'estable' | 'sin_datos'
}>

// ── Module-level state ────────────────────────────────────────────────────────

let _ctx: GlobalContext | null = null

function buildBaseContext(): GlobalContext {
  const profile    = loadProfile()
  const dow        = new Date().getDay()
  const dayKind    = getDayKind(profile, dow)
  const target     = getTargetForDay(profile, dow)
  const hour       = new Date().getHours()
  const isKiraDay  = [2, 4].includes(dow)

  let dayType: DayType = 'descanso'
  if (dayKind === 'padel_training') dayType = 'pesas_padel'
  else if (dayKind === 'training')  dayType = 'pesas'
  else if (dayKind === 'padel')     dayType = 'padel'
  if (isKiraDay && hour >= 16)      dayType = 'kira'

  return {
    profile: {
      name:   profile.name,
      weight: profile.weight,
      height: profile.height,
      age:    calcAge(profile.birthDate),
      goal:   profile.goal,
      bmr:    calcBMR(profile),
      tdee:   calcTDEE(profile),
    },
    today: {
      date:                new Date().toISOString().slice(0, 10),
      dayType,
      mood:                null,
      kcalConsumed:        0,
      kcalTarget:          target.kcal,
      proteinConsumed:     0,
      proteinTarget:       target.protein,
      macrosCompliance:    0,
      medicationCompliance: 0,
      waterGlasses:        0,
      waterTarget:         dayKind === 'padel' || dayKind === 'padel_training' ? 12 : dayKind === 'training' ? 10 : 8,
      eventsToday:         [],
      tasksCompleted:      0,
      tasksPending:        0,
    },
    week: {
      trainingsCompleted:   0,
      trainingsPlanned:     profile.trainingDays.length,
      avgMood:              null,
      avgKcal:              0,
      avgProtein:           0,
      macrosComplianceDays: 0,
      weightChange:         null,
    },
    patterns: {
      bestMoodDay:           '',
      worstMoodDay:          '',
      proteinDeficitOnRestDays: false,
      streakCurrent:         0,
      weightTrend:           'sin_datos',
    },
    lastUpdated: new Date(),
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns the current context, initialising from localStorage if needed. */
export function getContext(): GlobalContext {
  if (!_ctx) _ctx = buildBaseContext()
  return _ctx
}

/** Called by React pages when live Firebase data arrives. */
export function patchContext(patch: ContextPatch): void {
  const ctx = getContext()
  const t   = ctx.today
  const w   = ctx.week
  const p   = ctx.patterns

  if (patch.mood                !== undefined) t.mood = patch.mood
  if (patch.kcalConsumed        !== undefined) t.kcalConsumed = patch.kcalConsumed
  if (patch.proteinConsumed     !== undefined) t.proteinConsumed = patch.proteinConsumed
  if (patch.medicationCompliance !== undefined) t.medicationCompliance = patch.medicationCompliance
  if (patch.waterGlasses        !== undefined) t.waterGlasses = patch.waterGlasses
  if (patch.waterTarget         !== undefined) t.waterTarget = patch.waterTarget
  if (patch.eventsToday         !== undefined) t.eventsToday = patch.eventsToday
  if (patch.tasksCompleted      !== undefined) t.tasksCompleted = patch.tasksCompleted
  if (patch.tasksPending        !== undefined) t.tasksPending = patch.tasksPending

  if (patch.weekTrainingsCompleted  !== undefined) w.trainingsCompleted = patch.weekTrainingsCompleted
  if (patch.weekAvgMood             !== undefined) w.avgMood = patch.weekAvgMood
  if (patch.weekAvgKcal             !== undefined) w.avgKcal = patch.weekAvgKcal
  if (patch.weekAvgProtein          !== undefined) w.avgProtein = patch.weekAvgProtein
  if (patch.weekMacrosComplianceDays !== undefined) w.macrosComplianceDays = patch.weekMacrosComplianceDays
  if (patch.weightChange            !== undefined) w.weightChange = patch.weightChange

  if (patch.bestMoodDay             !== undefined) p.bestMoodDay = patch.bestMoodDay
  if (patch.worstMoodDay            !== undefined) p.worstMoodDay = patch.worstMoodDay
  if (patch.proteinDeficitOnRestDays !== undefined) p.proteinDeficitOnRestDays = patch.proteinDeficitOnRestDays
  if (patch.streakCurrent           !== undefined) p.streakCurrent = patch.streakCurrent
  if (patch.weightTrend             !== undefined) p.weightTrend = patch.weightTrend

  // Recalculate derived fields
  t.macrosCompliance = t.kcalTarget > 0
    ? Math.min(100, Math.round(((t.kcalConsumed / t.kcalTarget) * 0.5 + (t.proteinConsumed / t.proteinTarget) * 0.5) * 100))
    : 0

  ctx.lastUpdated = new Date()
}

/** Returns a concise AI-ready string with today's real data. */
export function getContextForAI(): string {
  const ctx = getContext()
  const { profile: pf, today: t, week: w, patterns: pt } = ctx

  const dayTypeLabel: Record<DayType, string> = {
    pesas:      'pesas',
    padel:      'pádel',
    pesas_padel: 'pesas + pádel',
    kira:       'tarde con Kira',
    descanso:   'descanso',
  }

  const waterPct = t.waterTarget > 0 ? Math.round((t.waterGlasses / t.waterTarget) * 100) : 0
  const kcalPct  = t.kcalTarget  > 0 ? Math.round((t.kcalConsumed  / t.kcalTarget)  * 100) : 0

  const lines: string[] = [
    `${pf.name}, ${pf.age} años, ${pf.weight}kg, ${pf.height}cm, objetivo: ${pf.goal}.`,
    `HOY (${new Date().toLocaleDateString('es-ES', { weekday: 'long' })}): Tipo de día: ${dayTypeLabel[t.dayType]}.`,
    `Macros: ${t.kcalConsumed}/${t.kcalTarget} kcal (${kcalPct}%). Proteína: ${t.proteinConsumed}/${t.proteinTarget}g.`,
  ]

  if (t.mood !== null)         lines.push(`Mood hoy: ${t.mood}/5.`)
  if (t.medicationCompliance)  lines.push(`Medicación: ${t.medicationCompliance}% tomada.`)
  if (t.waterTarget > 0)       lines.push(`Agua: ${t.waterGlasses}/${t.waterTarget} vasos (${waterPct}%).`)
  if (t.tasksCompleted + t.tasksPending > 0) {
    lines.push(`Tareas: ${t.tasksCompleted} hechas, ${t.tasksPending} pendientes.`)
  }
  if (t.eventsToday.length > 0) lines.push(`Eventos hoy: ${t.eventsToday.join(', ')}.`)

  lines.push(`SEMANA: ${w.trainingsCompleted}/${w.trainingsPlanned} entrenamientos.`)
  if (w.avgMood !== null) lines.push(`Mood promedio semana: ${w.avgMood}/5.`)
  if (w.avgProtein > 0)   lines.push(`Proteína media semana: ${w.avgProtein}g.`)

  if (pt.bestMoodDay)  lines.push(`Mejor día de ánimo histórico: ${pt.bestMoodDay}.`)
  if (pt.streakCurrent > 0) lines.push(`Racha de registros: ${pt.streakCurrent} días.`)
  if (pt.proteinDeficitOnRestDays) lines.push(`Déficit de proteína en días de descanso detectado.`)

  return lines.join(' ')
}
