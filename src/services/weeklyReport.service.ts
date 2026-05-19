import {
  collection, getDocs, query, orderBy, limit, Timestamp, setDoc, doc, getDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { loadProfile, getDayKind, getTargetForDay } from './metabolic.service'
import { notifyOnce } from './notification.service'

const COL = 'weekly_reports'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeeklyReport {
  weekKey: string           // Monday ISO date "2026-05-12"
  semana: string            // "12-18 mayo 2026"
  generadoAt: string        // ISO datetime
  read: boolean
  nutricion: {
    diasCumpliendoProteina: number
    promedioProteina: number
    objetivoProteina: number
    mejorDia: string | null
    peorDia: string | null
    totalDias: number
  }
  actividad: {
    pasosTotales: number
    promedioDiario: number
    diaMasActivo: string | null
    diasConDatos: number
  }
  bienestar: {
    moodPromedio: number | null
    mejorDia: string | null
    peorDia: string | null
    entriesCount: number
  }
  entrenamientos: {
    completados: number
    objetivo: number
  }
  insight: string
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function getMondayOf(date: Date): Date {
  const d = new Date(date)
  const dow = d.getDay()                          // 0=Sun
  d.setDate(d.getDate() - ((dow + 6) % 7))        // shift to Monday
  d.setHours(0, 0, 0, 0)
  return d
}

function getSundayOf(monday: Date): Date {
  const d = new Date(monday)
  d.setDate(d.getDate() + 6)
  d.setHours(23, 59, 59, 999)
  return d
}

function weekLabel(monday: Date, sunday: Date): string {
  const fmtDay = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric' })
  const fmtDayMonth = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  return `${fmtDay(monday)}-${fmtDayMonth(sunday)}`
}

function dowLabel(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long' })
}

// ── Current reportable week key ───────────────────────────────────────────────

// Returns the Monday of the most-recently-completed week (ended last Sunday).
// On Sunday ≥ 21:00 it considers CURRENT week complete too.
export function getCurrentWeekKey(): string {
  const now = new Date()
  const dow = now.getDay()                         // 0=Sun
  const isSundayEvening = dow === 0 && now.getHours() >= 21
  if (isSundayEvening) {
    return getMondayOf(now).toISOString().slice(0, 10)
  }
  // go back to most recent Monday of last week
  const prevMonday = getMondayOf(now)
  prevMonday.setDate(prevMonday.getDate() - 7)
  return prevMonday.toISOString().slice(0, 10)
}

// ── Firebase CRUD ─────────────────────────────────────────────────────────────

export async function getWeeklyReport(weekKey: string): Promise<WeeklyReport | null> {
  try {
    const snap = await getDoc(doc(db, COL, weekKey))
    if (!snap.exists()) return null
    return snap.data() as WeeklyReport
  } catch { return null }
}

export async function getLatestReports(n = 8): Promise<WeeklyReport[]> {
  try {
    const snap = await getDocs(query(
      collection(db, COL),
      orderBy('weekKey', 'desc'),
      limit(n),
    ))
    return snap.docs.map(d => d.data() as WeeklyReport)
  } catch { return [] }
}

export async function markReportRead(weekKey: string): Promise<void> {
  try {
    await setDoc(doc(db, COL, weekKey), { read: true }, { merge: true })
  } catch { /* silent */ }
}

export async function getUnreadReportCount(): Promise<number> {
  try {
    // Fetch recent 12 reports and filter client-side (avoids composite index requirement)
    const snap = await getDocs(query(
      collection(db, COL),
      orderBy('weekKey', 'desc'),
      limit(12),
    ))
    return snap.docs.filter(d => !(d.data() as WeeklyReport).read).length
  } catch { return 0 }
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchDiary(start: string, end: string): Promise<Map<string, number>> {
  const snap = await getDocs(query(
    collection(db, 'diary_entries'),
    where('date', '>=', start),
    where('date', '<=', end),
  ))
  const map = new Map<string, number>()
  snap.forEach(d => {
    const data = d.data()
    if (data['mood'] && data['date']) map.set(data['date'] as string, data['mood'] as number)
  })
  return map
}

async function fetchHealth(start: string, end: string): Promise<Map<string, { steps?: number }>> {
  const snap = await getDocs(query(
    collection(db, 'health_data'),
    where('date', '>=', start),
    where('date', '<=', end),
  ))
  const map = new Map<string, { steps?: number }>()
  snap.forEach(d => {
    const e = d.data()
    if (e['date']) map.set(e['date'] as string, { steps: e['steps'] as number | undefined })
  })
  return map
}

async function fetchNutrition(startDate: Date, endDate: Date): Promise<Map<string, { protein: number; kcal: number }>> {
  const snap = await getDocs(query(
    collection(db, 'nutrition_entries'),
    where('createdAt', '>=', Timestamp.fromDate(startDate)),
    where('createdAt', '<=', Timestamp.fromDate(endDate)),
  ))
  const map = new Map<string, { protein: number; kcal: number }>()
  snap.forEach(d => {
    const e = d.data()
    const ts = e['createdAt'] as Timestamp | undefined
    if (!ts) return
    const date = ts.toDate().toISOString().slice(0, 10)
    const cur = map.get(date) ?? { protein: 0, kcal: 0 }
    map.set(date, {
      protein: cur.protein + ((e['protein'] as number) ?? 0),
      kcal:    cur.kcal    + ((e['kcal']    as number) ?? 0),
    })
  })
  return map
}

// ── Generation ────────────────────────────────────────────────────────────────

export async function generateWeeklyReport(weekKey?: string): Promise<WeeklyReport> {
  const key = weekKey ?? getCurrentWeekKey()
  const monday = new Date(key + 'T12:00:00')
  const sunday = getSundayOf(monday)

  const startStr = monday.toISOString().slice(0, 10)
  const endStr   = sunday.toISOString().slice(0, 10)

  const profile = loadProfile()

  const [diaryMap, healthMap, nutritionMap] = await Promise.all([
    fetchDiary(startStr, endStr),
    fetchHealth(startStr, endStr),
    fetchNutrition(monday, sunday),
  ])

  // Build per-day data
  const days: Array<{
    date: string
    dow: number
    mood: number | null
    steps: number | null
    protein: number
    kcal: number
    proteinTarget: number
    isWorkoutDay: boolean
  }> = []

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const date = d.toISOString().slice(0, 10)
    const dow  = d.getDay()
    const kind = getDayKind(profile, dow)
    const target = getTargetForDay(profile, dow)
    const nutr = nutritionMap.get(date) ?? { protein: 0, kcal: 0 }
    days.push({
      date,
      dow,
      mood:        diaryMap.get(date) ?? null,
      steps:       healthMap.get(date)?.steps ?? null,
      protein:     Math.round(nutr.protein),
      kcal:        Math.round(nutr.kcal),
      proteinTarget: target.protein,
      isWorkoutDay:  kind === 'training' || kind === 'padel' || kind === 'padel_training',
    })
  }

  // ── Bienestar ──────────────────────────────────────────────────────────────
  const moodDays = days.filter(d => d.mood !== null)
  const moodPromedio = moodDays.length
    ? Math.round(moodDays.reduce((s, d) => s + d.mood!, 0) / moodDays.length * 10) / 10
    : null
  const bestMoodDay  = moodDays.length ? moodDays.reduce((a, b) => a.mood! > b.mood! ? a : b) : null
  const worstMoodDay = moodDays.length ? moodDays.reduce((a, b) => a.mood! < b.mood! ? a : b) : null

  const bienestar = {
    moodPromedio,
    mejorDia:     bestMoodDay  ? `${dowLabel(bestMoodDay.date)} (${bestMoodDay.mood}/5)`  : null,
    peorDia:      worstMoodDay ? `${dowLabel(worstMoodDay.date)} (${worstMoodDay.mood}/5)` : null,
    entriesCount: moodDays.length,
  }

  // ── Nutrición ──────────────────────────────────────────────────────────────
  const nutrDays = days.filter(d => d.proteinTarget > 0 && d.protein > 0)
  const diasCumpliendo = nutrDays.filter(d => d.protein >= d.proteinTarget * 0.8).length
  const promedioProteina = nutrDays.length
    ? Math.round(nutrDays.reduce((s, d) => s + d.protein, 0) / nutrDays.length)
    : 0
  const bestNutrDay  = nutrDays.length ? nutrDays.reduce((a, b) => a.protein > b.protein ? a : b) : null
  const worstNutrDay = nutrDays.length ? nutrDays.reduce((a, b) => a.protein < b.protein ? a : b) : null
  const avgProtTarget = nutrDays.length
    ? Math.round(nutrDays.reduce((s, d) => s + d.proteinTarget, 0) / nutrDays.length)
    : profile.proteinTarget ?? 150

  const nutricion = {
    diasCumpliendoProteina: diasCumpliendo,
    promedioProteina,
    objetivoProteina: avgProtTarget,
    mejorDia:  bestNutrDay  ? dowLabel(bestNutrDay.date)  : null,
    peorDia:   worstNutrDay ? dowLabel(worstNutrDay.date) : null,
    totalDias: nutrDays.length,
  }

  // ── Actividad (pasos) ──────────────────────────────────────────────────────
  const stepsDays = days.filter(d => d.steps !== null)
  const pasosTotales = stepsDays.reduce((s, d) => s + (d.steps ?? 0), 0)
  const promedioDiario = stepsDays.length ? Math.round(pasosTotales / stepsDays.length) : 0
  const diaMasActivo = stepsDays.length
    ? stepsDays.reduce((a, b) => (a.steps ?? 0) > (b.steps ?? 0) ? a : b)
    : null

  const actividad = {
    pasosTotales,
    promedioDiario,
    diaMasActivo: diaMasActivo ? `${dowLabel(diaMasActivo.date)} (${(diaMasActivo.steps ?? 0).toLocaleString('es-ES')} pasos)` : null,
    diasConDatos: stepsDays.length,
  }

  // ── Entrenamientos ─────────────────────────────────────────────────────────
  const workoutDays = days.filter(d => d.isWorkoutDay)
  // "completados" = workout days where user had >3000 steps (gym proxy) OR diary entry
  const completados = workoutDays.filter(d =>
    (d.steps !== null && d.steps > 3000) || d.mood !== null,
  ).length

  const entrenamientos = {
    completados,
    objetivo: workoutDays.length,
  }

  // ── AI insight ─────────────────────────────────────────────────────────────
  let insight = ''
  try {
    const { callAI } = await import('./ai.service')
    const insightPrompt =
      `Tengo estos datos de la semana del ${startStr} al ${endStr}:\n` +
      `- Mood promedio: ${moodPromedio ?? 'sin datos'}/5 (${moodDays.length} entradas)\n` +
      `- Pasos promedio: ${promedioDiario.toLocaleString('es-ES')}/día\n` +
      `- Proteína promedio: ${promedioProteina}g (objetivo ${avgProtTarget}g, cumplido ${diasCumpliendo}/${nutrDays.length} días)\n` +
      `- Entrenamientos: ${completados}/${workoutDays.length} días planificados\n` +
      `Genera UNA observación cruzando 2 de estos datos. Máximo 2 frases. Sin markdown. Directo al grano.`
    insight = (await callAI(insightPrompt, undefined, true, 200)).trim()
  } catch { /* insight stays empty */ }

  // ── Save to Firebase ───────────────────────────────────────────────────────
  const report: WeeklyReport = {
    weekKey: key,
    semana: weekLabel(monday, sunday),
    generadoAt: new Date().toISOString(),
    read: false,
    nutricion,
    actividad,
    bienestar,
    entrenamientos,
    insight,
  }

  await setDoc(doc(db, COL, key), report)

  // Fire notification
  notifyOnce(`weekly_report_${key}`, {
    title: '📊 Informe semanal listo',
    body: `Tu resumen de la semana del ${report.semana} está disponible.`,
    type: 'info',
  }).catch(() => {})

  return report
}

// ── Public trigger ────────────────────────────────────────────────────────────

export async function checkAndGenerateWeeklyReport(): Promise<void> {
  try {
    const key = getCurrentWeekKey()
    const existing = await getWeeklyReport(key)
    if (existing) return
    await generateWeeklyReport(key)
  } catch { /* silent — runs in background */ }
}
