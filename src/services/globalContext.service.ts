import {
  collection, getDocs, getDoc, doc,
  query, where, orderBy, limit, Timestamp,
} from 'firebase/firestore'
import { ref, get, query as rtdbQuery, orderByKey, limitToLast } from 'firebase/database'
import { db, rtdb } from '@/lib/firebase'
import { loadProfile, getTargetForDay } from './metabolic.service'
import { getContext } from './context.service'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GlobalContextData {
  fecha: string
  hora: string
  diaSemana: string
  salud: {
    pasosHoy: number | null
    pasosPromedio7dias: number | null
    pesoActual: number | null
    horasSueno: number | null
    moodUltimo: number | null
    moodPromedio7dias: number | null
  }
  nutricion: {
    caloriasHoy: number
    objetivoCalorias: number
    proteinaHoy: number
    objetivoProteina: number
    comidasRegistradas: string[]
  }
  ejercicio: {
    entrenosUltimaSemana: number
    objetivoSemanal: number
  }
  tareas: {
    pendientesHoy: number
    completadasHoy: number
    proximoVencimiento: string | null
  }
  patrimonio: {
    total: number | null
    ultimaSync: string | null
  }
  recordatorios: {
    medicacionPendiente: string[]
  }
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000
let _cache: GlobalContextData | null = null
let _cacheTs = 0

export function invalidateGlobalContext(): void {
  _cache = null
  _cacheTs = 0
}

// ── Main builder ──────────────────────────────────────────────────────────────

export async function buildGlobalContext(): Promise<GlobalContextData> {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL_MS) return _cache

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const hora = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const diaSemana = DAY_NAMES[now.getDay()]

  const profile = loadProfile()
  const target = getTargetForDay(profile)
  const syncCtx = getContext()

  const [pasosResult, healthResult, nutritionResult, tasksResult, diaryResult, medsResult, medLogsResult, patrimonioResult] =
    await Promise.allSettled([
      _fetchPasos(todayStr),
      _fetchHealth(todayStr),
      _fetchNutrition(),
      _fetchTasks(),
      _fetchDiary(todayStr),
      _fetchMedications(),
      _fetchMedLogs(todayStr),
      _fetchPatrimonio(),
    ])

  const pasos = pasosResult.status === 'fulfilled' ? pasosResult.value : { hoy: null, avg7: null }
  const health = healthResult.status === 'fulfilled' ? healthResult.value : null
  const nutrition = nutritionResult.status === 'fulfilled' ? nutritionResult.value : { kcal: 0, protein: 0, meals: [] as string[] }
  const tasks = tasksResult.status === 'fulfilled' ? tasksResult.value : { pending: 0, completed: 0, next: null as string | null }
  const diary = diaryResult.status === 'fulfilled' ? diaryResult.value : { moodHoy: null, moodAvg: null }
  const meds = medsResult.status === 'fulfilled' ? medsResult.value : [] as { id: string; name: string; time: string }[]
  const medLogs = medLogsResult.status === 'fulfilled' ? medLogsResult.value : {} as Record<string, boolean>
  const patrimonio = patrimonioResult.status === 'fulfilled' ? patrimonioResult.value : { total: null, date: null }

  const medicacionPendiente = meds
    .filter(m => !medLogs[m.id])
    .map(m => `${m.name} (${m.time})`)

  const ctx: GlobalContextData = {
    fecha: todayStr,
    hora,
    diaSemana,
    salud: {
      pasosHoy: pasos.hoy,
      pasosPromedio7dias: pasos.avg7,
      pesoActual: health?.weight ?? null,
      horasSueno: health?.sleepHours != null
        ? Math.round((health.sleepHours + (health.sleepMinutes ?? 0) / 60) * 10) / 10
        : null,
      moodUltimo: diary.moodHoy,
      moodPromedio7dias: diary.moodAvg,
    },
    nutricion: {
      caloriasHoy: nutrition.kcal,
      objetivoCalorias: target.kcal,
      proteinaHoy: nutrition.protein,
      objetivoProteina: target.protein,
      comidasRegistradas: nutrition.meals,
    },
    ejercicio: {
      entrenosUltimaSemana: syncCtx.week.trainingsCompleted,
      objetivoSemanal: profile.trainingDays.length,
    },
    tareas: {
      pendientesHoy: tasks.pending,
      completadasHoy: tasks.completed,
      proximoVencimiento: tasks.next,
    },
    patrimonio: {
      total: patrimonio.total,
      ultimaSync: patrimonio.date,
    },
    recordatorios: { medicacionPendiente },
  }

  _cache = ctx
  _cacheTs = Date.now()
  return ctx
}

// ── Firebase readers ──────────────────────────────────────────────────────────

async function _fetchPasos(todayStr: string) {
  const snap = await get(rtdbQuery(ref(rtdb, 'pasos'), orderByKey(), limitToLast(7)))
  if (!snap.exists()) return { hoy: null, avg7: null }
  const vals: number[] = []
  let hoy: number | null = null
  snap.forEach(child => {
    const v = (child.val() as { Pasos?: number } | null)?.Pasos
    if (v != null) {
      vals.push(v)
      if (child.key === todayStr) hoy = v
    }
  })
  const avg7 = vals.length ? Math.round(vals.reduce((s, n) => s + n, 0) / vals.length) : null
  return { hoy, avg7 }
}

async function _fetchHealth(todayStr: string) {
  const snap = await getDoc(doc(db, 'health_data', todayStr))
  if (!snap.exists()) return null
  const d = snap.data()
  return { weight: d.weight as number | undefined, sleepHours: d.sleepHours as number | undefined, sleepMinutes: d.sleepMinutes as number | undefined }
}

async function _fetchNutrition() {
  const now = new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end   = new Date(now); end.setHours(23, 59, 59, 999)
  const snap = await getDocs(query(
    collection(db, 'nutrition_entries'),
    where('createdAt', '>=', Timestamp.fromDate(start)),
    where('createdAt', '<=', Timestamp.fromDate(end)),
  ))
  let kcal = 0, protein = 0
  const meals = new Set<string>()
  snap.forEach(d => {
    const e = d.data()
    kcal    += (e.kcal    as number) ?? 0
    protein += (e.protein as number) ?? 0
    if (e.meal) meals.add(e.meal as string)
  })
  return { kcal: Math.round(kcal), protein: Math.round(protein), meals: [...meals] }
}

async function _fetchTasks() {
  const snap = await getDocs(query(collection(db, 'tasks'), orderBy('createdAt', 'asc')))
  let pending = 0, completed = 0, next: string | null = null
  snap.forEach(d => {
    const e = d.data()
    if (e.completed) completed++
    else { pending++; if (!next) next = e.title as string }
  })
  return { pending, completed, next }
}

async function _fetchDiary(todayStr: string) {
  const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 6)
  const startDate = sevenAgo.toISOString().slice(0, 10)
  const snap = await getDocs(query(
    collection(db, 'diary_entries'),
    where('date', '>=', startDate),
    where('date', '<=', todayStr),
    orderBy('date', 'desc'),
  ))
  const moods: number[] = []
  let moodHoy: number | null = null
  snap.forEach(d => {
    const e = d.data()
    if (e.mood) {
      moods.push(e.mood as number)
      if (e.date === todayStr) moodHoy = e.mood as number
    }
  })
  const moodAvg = moods.length
    ? Math.round(moods.reduce((s, v) => s + v, 0) / moods.length * 10) / 10
    : null
  return { moodHoy, moodAvg }
}

async function _fetchMedications() {
  const snap = await getDocs(query(collection(db, 'medications'), orderBy('createdAt', 'asc')))
  return snap.docs.map(d => ({ id: d.id, name: d.data().name as string, time: d.data().time as string }))
}

async function _fetchMedLogs(todayStr: string) {
  const snap = await getDocs(collection(db, 'medication_logs', todayStr, 'medications'))
  const out: Record<string, boolean> = {}
  snap.forEach(d => { out[d.id] = (d.data().taken as boolean) ?? false })
  return out
}

async function _fetchPatrimonio() {
  const snap = await getDocs(query(collection(db, 'patrimonio_snapshots'), orderBy('date', 'desc'), limit(1)))
  if (snap.empty) return { total: null, date: null }
  const d = snap.docs[0].data()
  return { total: (d.totalEUR as number) ?? null, date: (d.date as string) ?? null }
}

// ── Formatter ─────────────────────────────────────────────────────────────────

const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

export function formatContextForAI(ctx: GlobalContextData): string {
  const [, m, d] = ctx.fecha.split('-').map(Number)
  const dateStr = `${d} ${MONTHS_ES[m - 1]}`
  const lines: string[] = [`CONTEXTO ACTUAL DE DANIEL (${ctx.diaSemana} ${dateStr}, ${ctx.hora}):`]

  const { salud, nutricion, ejercicio, tareas, patrimonio, recordatorios } = ctx

  if (salud.pasosHoy !== null) {
    const avg = salud.pasosPromedio7dias !== null ? ` (promedio 7d: ${salud.pasosPromedio7dias.toLocaleString('es-ES')})` : ''
    lines.push(`- Pasos hoy: ${salud.pasosHoy.toLocaleString('es-ES')}${avg}`)
  }
  if (salud.pesoActual !== null)   lines.push(`- Peso: ${salud.pesoActual}kg`)
  if (salud.horasSueno !== null)   lines.push(`- Sueño anoche: ${salud.horasSueno}h`)
  if (salud.moodPromedio7dias !== null) {
    const hoy = salud.moodUltimo !== null ? ` (hoy: ${salud.moodUltimo}/5)` : ''
    lines.push(`- Mood promedio 7d: ${salud.moodPromedio7dias}/5${hoy}`)
  }

  if (nutricion.objetivoCalorias > 0) {
    lines.push(`- Calorías hoy: ${nutricion.caloriasHoy}/${nutricion.objetivoCalorias}, Proteína: ${nutricion.proteinaHoy}/${nutricion.objetivoProteina}g`)
  }
  if (nutricion.comidasRegistradas.length > 0) {
    lines.push(`- Comidas registradas: ${nutricion.comidasRegistradas.join(', ')}`)
  } else {
    lines.push('- Sin comidas registradas aún hoy')
  }

  lines.push(`- Entrenamientos esta semana: ${ejercicio.entrenosUltimaSemana}/${ejercicio.objetivoSemanal}`)

  if (tareas.pendientesHoy > 0) {
    const next = tareas.proximoVencimiento ? ` — próxima: "${tareas.proximoVencimiento.slice(0, 50)}"` : ''
    lines.push(`- Tareas pendientes hoy: ${tareas.pendientesHoy}${next}`)
  } else {
    lines.push('- Sin tareas pendientes')
  }

  if (patrimonio.total !== null) {
    lines.push(`- Patrimonio: ${Math.round(patrimonio.total).toLocaleString('es-ES')}€`)
  }

  if (recordatorios.medicacionPendiente.length > 0) {
    lines.push(`- Medicación pendiente: ${recordatorios.medicacionPendiente.join(', ')}`)
  }

  return lines.join('\n')
}
