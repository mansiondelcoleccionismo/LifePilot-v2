import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, ChevronDown, ChevronUp, Dumbbell, History,
  LayoutGrid, Save, Settings, SkipForward, Sparkles,
  TrendingUp, Trophy, X, PlaySquare,
} from 'lucide-react'
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getGeminiKey } from '@/services/ai.service'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ExerciseDef {
  id: string
  name: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  defaultSets: number
  defaultReps: number
  initialWeight: number
  restSeconds: number
  instructions: string[]
  tip: string
  commonErrors: string[]
  progressionRule: string
}
interface DayProgram {
  day: string
  shortLabel: string
  type: 'workout' | 'rest'
  focus?: string
  exercises: ExerciseDef[]
}
interface SetLog { reps: string; weight: string; done: boolean }
interface ExerciseConfig { sets?: number; reps?: number; videoUrl?: string }
interface HistoryEntry {
  date: string
  day: string
  totalSets: number
  maxWeight: number
  completedAt?: unknown
  exercises: { id: string; name: string; setsCompleted: number; weight: number }[]
}

// ─── Program ──────────────────────────────────────────────────────────────────
const PROGRAM: DayProgram[] = [
  {
    day: 'Lunes', shortLabel: 'Lun', type: 'workout', focus: 'Bíceps / Espalda',
    exercises: [
      {
        id: 'curl-biceps', name: 'Curl de Bíceps',
        primaryMuscles: ['Bíceps braquial'], secondaryMuscles: ['Braquial', 'Braquiorradial'],
        defaultSets: 3, defaultReps: 12, initialWeight: 8, restSeconds: 60,
        instructions: [
          'De pie, agarra una mancuerna en cada mano con las palmas hacia adelante.',
          'Mantén los codos pegados al cuerpo durante todo el movimiento.',
          'Sube las mancuernas contrayendo los bíceps hasta la altura del hombro.',
          'Aguanta 1 segundo en la contracción máxima.',
          'Baja lentamente en 3 segundos controlando el movimiento.',
        ],
        tip: 'No balancees el cuerpo para subir el peso. Si lo haces, el peso es demasiado alto.',
        commonErrors: ['Mover los codos hacia adelante', 'Bajar demasiado rápido', 'No completar el rango de movimiento'],
        progressionRule: 'Sube 1-2 kg cuando completes todas las series con buena forma en 4 sesiones seguidas.',
      },
      {
        id: 'curl-martillo', name: 'Curl Martillo',
        primaryMuscles: ['Braquiorradial'], secondaryMuscles: ['Bíceps braquial', 'Braquial'],
        defaultSets: 3, defaultReps: 12, initialWeight: 8, restSeconds: 60,
        instructions: [
          'De pie, agarra las mancuernas con las palmas enfrentadas entre sí (agarre neutro).',
          'Mantén los codos fijos pegados al torso.',
          'Sube las mancuernas manteniendo el agarre neutro en todo momento.',
          'Contrae en la parte superior durante 1 segundo.',
          'Desciende de forma controlada hasta la posición inicial.',
        ],
        tip: 'Este ejercicio trabaja más el antebrazo. Ideal para dar grosor al brazo.',
        commonErrors: ['Girar las muñecas durante el movimiento', 'Separar los codos', 'Usar impulso del cuerpo'],
        progressionRule: 'Sube 1-2 kg cada 4 sesiones consecutivas con control total.',
      },
      {
        id: 'remo-mancuerna', name: 'Remo con Mancuerna',
        primaryMuscles: ['Dorsal ancho', 'Romboides'], secondaryMuscles: ['Bíceps', 'Deltoides posterior', 'Trapecio'],
        defaultSets: 3, defaultReps: 10, initialWeight: 10, restSeconds: 75,
        instructions: [
          'Apoya una mano y la rodilla del mismo lado en un banco o superficie estable.',
          'Agarra la mancuerna con la otra mano, brazo extendido hacia el suelo.',
          'Tira de la mancuerna hacia la cadera, llevando el codo hacia atrás.',
          'Mantén la espalda paralela al suelo y no gires el torso.',
          'Baja la mancuerna de forma controlada hasta la posición inicial.',
        ],
        tip: 'Piensa en llevar el codo lo más atrás posible, no en "subir" el peso.',
        commonErrors: ['Rotar el torso', 'No llegar al rango completo', 'Tirar con el bíceps en lugar del dorsal'],
        progressionRule: 'Incrementa 2 kg cada 4 sesiones completadas con buena técnica.',
      },
    ],
  },
  {
    day: 'Martes', shortLabel: 'Mar', type: 'workout', focus: 'Piernas',
    exercises: [
      {
        id: 'sentadilla-goblet', name: 'Sentadilla Goblet',
        primaryMuscles: ['Cuádriceps', 'Glúteos'], secondaryMuscles: ['Isquiotibiales', 'Core', 'Aductores'],
        defaultSets: 4, defaultReps: 12, initialWeight: 12, restSeconds: 90,
        instructions: [
          'Sostén una mancuerna verticalmente con ambas manos a la altura del pecho.',
          'Separa los pies al ancho de los hombros con puntas ligeramente hacia afuera.',
          'Baja controladamente flexionando rodillas y cadera simultáneamente.',
          'Desciende hasta que los muslos estén paralelos al suelo o más abajo.',
          'Empuja a través de los talones para volver a la posición inicial.',
        ],
        tip: 'El peso cerca del pecho actúa como contrapeso y permite llegar más profundo.',
        commonErrors: ['Rodillas que colapsan hacia adentro', 'Levantarse de puntillas', 'Redondear la espalda baja'],
        progressionRule: 'Sube 2 kg cada 4 sesiones donde completes todas las repeticiones.',
      },
      {
        id: 'sentadilla-bulgara', name: 'Sentadilla Búlgara',
        primaryMuscles: ['Cuádriceps', 'Glúteos'], secondaryMuscles: ['Isquiotibiales', 'Core'],
        defaultSets: 3, defaultReps: 10, initialWeight: 8, restSeconds: 90,
        instructions: [
          'Coloca el pie trasero sobre un banco o superficie elevada detrás de ti.',
          'El pie delantero suficientemente adelantado para que la rodilla no sobrepase el pie.',
          'Baja el cuerpo flexionando la rodilla delantera hasta que el muslo quede paralelo al suelo.',
          'La rodilla trasera desciende sin tocar el suelo.',
          'Empuja con el talón delantero para volver arriba.',
        ],
        tip: 'Empieza sin peso para dominar el equilibrio. Luego añade mancuernas a los lados.',
        commonErrors: ['Pie delantero demasiado cerca del banco', 'Inclinar el torso hacia adelante', 'Apoyar peso en el pie trasero'],
        progressionRule: 'Incrementa 1-2 kg por pierna cada 4 sesiones con buena forma.',
      },
      {
        id: 'peso-muerto-rumano', name: 'Peso Muerto Rumano',
        primaryMuscles: ['Isquiotibiales', 'Glúteos'], secondaryMuscles: ['Lumbar', 'Trapecio', 'Antebrazos'],
        defaultSets: 3, defaultReps: 10, initialWeight: 12, restSeconds: 90,
        instructions: [
          'De pie, agarra las mancuernas frente a ti con agarre pronado.',
          'Mantén las rodillas ligeramente flexionadas durante todo el movimiento.',
          'Inclina el torso hacia adelante empujando las caderas hacia atrás.',
          'Las mancuernas deslizan por las piernas mientras bajas.',
          'Siente el estiramiento en los isquiotibiales y vuelve arriba contrayendo glúteos.',
        ],
        tip: 'El movimiento viene de las caderas, no de la espalda. Empuja una pared imaginaria con las caderas hacia atrás.',
        commonErrors: ['Redondear la espalda baja', 'Doblar demasiado las rodillas', 'No sentir estiramiento en isquiotibiales'],
        progressionRule: 'Sube 2 kg cada 4 sesiones con espalda neutral en todas las reps.',
      },
      {
        id: 'puente-gluteos', name: 'Puente de Glúteos',
        primaryMuscles: ['Glúteos'], secondaryMuscles: ['Isquiotibiales', 'Core', 'Lumbar'],
        defaultSets: 3, defaultReps: 15, initialWeight: 0, restSeconds: 60,
        instructions: [
          'Tumbado boca arriba, dobla las rodillas con los pies apoyados en el suelo.',
          'Coloca una mancuerna o peso sobre las caderas si quieres añadir resistencia.',
          'Aprieta los glúteos y empuja las caderas hacia el techo.',
          'Mantén 2 segundos arriba con glúteos totalmente contraídos.',
          'Baja lentamente sin tocar el suelo del todo y repite.',
        ],
        tip: 'Aprieta los glúteos al máximo en la parte superior. La calidad de contracción importa más que el peso.',
        commonErrors: ['Usar la espalda lumbar en lugar de glúteos', 'No llegar a la extensión completa', 'Bajar demasiado rápido'],
        progressionRule: 'Añade 2 kg de peso adicional cada 4 sesiones cuando domines el movimiento.',
      },
    ],
  },
  {
    day: 'Miércoles', shortLabel: 'Mié', type: 'workout', focus: 'Empuje',
    exercises: [
      {
        id: 'flexiones', name: 'Flexiones',
        primaryMuscles: ['Pectoral mayor'], secondaryMuscles: ['Tríceps', 'Deltoides anterior', 'Core'],
        defaultSets: 3, defaultReps: 12, initialWeight: 0, restSeconds: 60,
        instructions: [
          'En posición de plancha alta, manos ligeramente más anchas que los hombros.',
          'Mantén el cuerpo recto de cabeza a talones, core activo.',
          'Baja el pecho hasta casi tocar el suelo doblando los codos a 45°.',
          'Empuja el suelo para volver arriba extendiendo los brazos completamente.',
          'No dejes que las caderas suban o bajen durante el movimiento.',
        ],
        tip: 'Si no puedes hacer 10 reps completas, empieza con rodillas apoyadas hasta ganar fuerza.',
        commonErrors: ['Caderas demasiado altas o bajas', 'Codos a 90° (tensión en el hombro)', 'No bajar suficiente'],
        progressionRule: 'Cuando hagas 3×15 sin problema, eleva los pies o añade lastre en la espalda.',
      },
      {
        id: 'press-hombros', name: 'Press de Hombros',
        primaryMuscles: ['Deltoides medial', 'Deltoides anterior'], secondaryMuscles: ['Tríceps', 'Trapecio'],
        defaultSets: 3, defaultReps: 12, initialWeight: 6, restSeconds: 75,
        instructions: [
          'Sentado o de pie, agarra una mancuerna en cada mano a la altura de los hombros.',
          'Las palmas miran hacia adelante, codos a 90°.',
          'Empuja las mancuernas hacia arriba hasta casi extender los brazos.',
          'Baja lentamente volviendo a la posición inicial.',
          'No arquees la espalda para ayudarte a subir el peso.',
        ],
        tip: 'Hazlo sentado con respaldo para más estabilidad. Sin respaldo activas más el core.',
        commonErrors: ['Arquear la espalda lumbar', 'Subir las mancuernas en arco lateral', 'Bajar demasiado rápido'],
        progressionRule: 'Incrementa 1-2 kg cada 4 sesiones completadas con rango completo.',
      },
      {
        id: 'elevaciones-laterales', name: 'Elevaciones Laterales',
        primaryMuscles: ['Deltoides medial'], secondaryMuscles: ['Deltoides anterior', 'Trapecio superior'],
        defaultSets: 3, defaultReps: 15, initialWeight: 4, restSeconds: 60,
        instructions: [
          'De pie, agarra mancuernas ligeras con los brazos a los lados.',
          'Inclínate ligeramente hacia adelante (10-15°) para mayor activación del deltoides medial.',
          'Eleva los brazos lateralmente hasta la altura de los hombros.',
          'Gira ligeramente las manos como si vaciases una jarra al llegar arriba.',
          'Baja de forma controlada en 2-3 segundos.',
        ],
        tip: 'Usa menos peso del que crees. La forma correcta con poco peso supera el ego con mucho.',
        commonErrors: ['Encogerse de hombros al subir', 'Balancear el cuerpo', 'Subir los brazos por delante'],
        progressionRule: 'Sube 1 kg cada 4 sesiones. Este ejercicio progresa lentamente, eso es normal.',
      },
      {
        id: 'extension-triceps', name: 'Extensión de Tríceps',
        primaryMuscles: ['Tríceps braquial'], secondaryMuscles: ['Ancóneo'],
        defaultSets: 3, defaultReps: 12, initialWeight: 8, restSeconds: 60,
        instructions: [
          'De pie o sentado, agarra una mancuerna con ambas manos por encima de la cabeza.',
          'Los codos apuntan hacia el techo, pegados a las orejas.',
          'Baja la mancuerna detrás de la cabeza flexionando solo los codos.',
          'Extiende los codos para subir la mancuerna a la posición inicial.',
          'Los codos no deben abrirse hacia los lados durante el movimiento.',
        ],
        tip: 'Este ejercicio pone los tríceps en estiramiento completo. Muy efectivo para hipertrofia.',
        commonErrors: ['Mover los codos hacia afuera', 'No llegar al rango completo abajo', 'Arquear la espalda'],
        progressionRule: 'Incrementa 1-2 kg cada 4 sesiones cuando completes todas las repeticiones.',
      },
    ],
  },
  {
    day: 'Jueves', shortLabel: 'Jue', type: 'workout', focus: 'Piernas + Core',
    exercises: [
      {
        id: 'sentadilla-mancuernas', name: 'Sentadilla con Mancuernas',
        primaryMuscles: ['Cuádriceps', 'Glúteos'], secondaryMuscles: ['Isquiotibiales', 'Core'],
        defaultSets: 4, defaultReps: 12, initialWeight: 10, restSeconds: 90,
        instructions: [
          'De pie, agarra una mancuerna en cada mano, brazos a los lados.',
          'Pies al ancho de los hombros, puntas ligeramente hacia afuera.',
          'Baja como si fueses a sentarte en una silla, espalda erguida.',
          'Las rodillas siguen la dirección de las puntas de los pies.',
          'Sube empujando a través de los talones.',
        ],
        tip: 'Mantén el pecho arriba durante todo el movimiento para evitar caída del torso.',
        commonErrors: ['Inclinarse demasiado hacia adelante', 'Rodillas que colapsan', 'No llegar a 90° de flexión'],
        progressionRule: 'Sube 2 kg por mancuerna cada 4 sesiones completadas.',
      },
      {
        id: 'zancadas', name: 'Zancadas',
        primaryMuscles: ['Cuádriceps', 'Glúteos'], secondaryMuscles: ['Isquiotibiales', 'Core', 'Gemelos'],
        defaultSets: 3, defaultReps: 10, initialWeight: 6, restSeconds: 75,
        instructions: [
          'De pie con mancuernas a los lados, da un paso largo hacia adelante.',
          'Baja la rodilla trasera hasta casi tocar el suelo (90° ambas rodillas).',
          'La rodilla delantera no debe sobrepasar la punta del pie.',
          'Empuja con el pie delantero para volver a la posición inicial.',
          'Alterna piernas o completa todas las reps del mismo lado antes de cambiar.',
        ],
        tip: 'Cuenta las reps por pierna. 10 reps = 10 por cada pierna.',
        commonErrors: ['Paso demasiado corto', 'Rodilla delantera hacia adentro', 'Inclinar el torso hacia adelante'],
        progressionRule: 'Incrementa 1-2 kg por mancuerna cada 4 sesiones.',
      },
      {
        id: 'plancha', name: 'Plancha',
        primaryMuscles: ['Core (transverso abdominal)'], secondaryMuscles: ['Oblicuos', 'Glúteos', 'Hombros'],
        defaultSets: 3, defaultReps: 40, initialWeight: 0, restSeconds: 60,
        instructions: [
          'Apoya los antebrazos y las puntas de los pies en el suelo.',
          'El cuerpo debe formar una línea recta de cabeza a talones.',
          'Activa el core apretando el abdomen como si fueses a recibir un golpe.',
          'Mantén la posición el tiempo indicado sin dejar caer las caderas.',
          'Respira de forma controlada durante todo el ejercicio.',
        ],
        tip: 'Los segundos indicados son el objetivo. Si no puedes, divide en series más cortas.',
        commonErrors: ['Caderas demasiado altas o bajas', 'Aguantar la respiración', 'Dejar caer la cabeza'],
        progressionRule: 'Incrementa 5-10 segundos cada 2 semanas. Objetivo: 60 segundos por serie.',
      },
      {
        id: 'mountain-climbers', name: 'Mountain Climbers',
        primaryMuscles: ['Core', 'Flexores de cadera'], secondaryMuscles: ['Hombros', 'Pectoral', 'Cuádriceps'],
        defaultSets: 3, defaultReps: 30, initialWeight: 0, restSeconds: 60,
        instructions: [
          'Empieza en posición de plancha alta con los brazos extendidos.',
          'Lleva una rodilla hacia el pecho de forma controlada.',
          'Vuelve a la posición y lleva la otra rodilla al pecho.',
          'Alterna las piernas a un ritmo constante.',
          'Mantén las caderas niveladas durante todo el movimiento.',
        ],
        tip: 'El número de reps es por cada pierna. Puedes hacerlo lento (core) o rápido (cardio).',
        commonErrors: ['Subir las caderas al mover las piernas', 'Ritmo excesivamente rápido sin control', 'No mantener el core activo'],
        progressionRule: 'Añade 5 reps por pierna cada 2 semanas.',
      },
    ],
  },
  { day: 'Viernes', shortLabel: 'Vie', type: 'rest', exercises: [] },
  { day: 'Sábado', shortLabel: 'Sáb', type: 'rest', exercises: [] },
  { day: 'Domingo', shortLabel: 'Dom', type: 'rest', exercises: [] },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0]

function getMondayStr() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function getTodayDayIndex() {
  const jsDay = new Date().getDay()
  const map: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 }
  return map[jsDay] ?? 0
}

// ─── Firebase ─────────────────────────────────────────────────────────────────
async function loadWeightsForDay(exercises: ExerciseDef[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  await Promise.all(exercises.map(async (ex) => {
    const snap = await getDoc(doc(db, 'exercise_weights', ex.id))
    result[ex.id] = snap.exists() ? (snap.data().weight as number) : ex.initialWeight
  }))
  return result
}

async function loadConfigsForDay(exercises: ExerciseDef[]): Promise<Record<string, ExerciseConfig>> {
  const result: Record<string, ExerciseConfig> = {}
  await Promise.all(exercises.map(async (ex) => {
    const snap = await getDoc(doc(db, 'exercise_config', ex.id))
    if (snap.exists()) result[ex.id] = snap.data() as ExerciseConfig
  }))
  return result
}

async function loadSetsForDay(
  exercises: ExerciseDef[],
  configs: Record<string, ExerciseConfig>,
  weights: Record<string, number>,
): Promise<Record<string, SetLog[]>> {
  const date = todayStr()
  const result: Record<string, SetLog[]> = {}
  await Promise.all(exercises.map(async (ex) => {
    const snap = await getDoc(doc(db, 'exercise_sets', `${date}_${ex.id}`))
    if (snap.exists()) {
      result[ex.id] = snap.data().sets as SetLog[]
    } else {
      const numSets = configs[ex.id]?.sets ?? ex.defaultSets
      const w = String((weights[ex.id] ?? ex.initialWeight) || '')
      result[ex.id] = Array.from({ length: numSets }, () => ({ reps: '', weight: w, done: false }))
    }
  }))
  return result
}

async function persistSets(exerciseId: string, sets: SetLog[]) {
  await setDoc(
    doc(db, 'exercise_sets', `${todayStr()}_${exerciseId}`),
    { exerciseId, date: todayStr(), sets, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

async function persistWeight(exerciseId: string, weight: number) {
  await setDoc(doc(db, 'exercise_weights', exerciseId), { weight, updatedAt: serverTimestamp() }, { merge: true })
}

async function persistConfig(exerciseId: string, config: ExerciseConfig) {
  await setDoc(doc(db, 'exercise_config', exerciseId), config, { merge: true })
}

async function loadHistory(): Promise<HistoryEntry[]> {
  const snap = await getDocs(collection(db, 'exercise_history'))
  return snap.docs
    .map((d) => d.data() as HistoryEntry)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14)
}

async function persistHistory(entry: HistoryEntry) {
  await setDoc(doc(db, 'exercise_history', entry.date), { ...entry, completedAt: serverTimestamp() })
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
async function callGemini(prompt: string): Promise<string> {
  const key = getGeminiKey()
  if (!key) throw new Error('Sin clave Gemini. Configúrala en Ajustes.')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } }),
    },
  )
  if (!res.ok) throw new Error(`Gemini ${res.status}`)
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

// ─── Progression detection ────────────────────────────────────────────────────
function detectProgressionAlerts(history: HistoryEntry[], exercises: ExerciseDef[]): Set<string> {
  const alerts = new Set<string>()
  for (const ex of exercises) {
    const entries = history.filter((h) => h.exercises.some((e) => e.id === ex.id))
    if (entries.length < 4) continue
    const last4 = entries.slice(0, 4)
    const weights = last4.map((h) => h.exercises.find((e) => e.id === ex.id)?.weight ?? 0)
    const allSameWeight = weights.every((w) => w === weights[0])
    const allCompleted = last4.every((h) => {
      const e = h.exercises.find((x) => x.id === ex.id)
      return e && e.setsCompleted >= ex.defaultSets
    })
    if (allSameWeight && allCompleted) alerts.add(ex.id)
  }
  return alerts
}

function getYouTubeId(url: string) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)
  return m ? m[1] : null
}

// ─── RestTimer ────────────────────────────────────────────────────────────────
function RestTimer({ seconds, onSkip }: { seconds: number; onSkip: () => void }) {
  const [remaining, setRemaining] = useState(seconds)
  useEffect(() => {
    if (remaining <= 0) { onSkip(); return }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, onSkip])
  const pct = ((seconds - remaining) / seconds) * 100
  const circ = 2 * Math.PI * 15
  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-2xl bg-[#16161f] border border-white/10 px-5 py-3 shadow-2xl"
    >
      <div className="relative w-10 h-10 flex-shrink-0">
        <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15" fill="none" stroke="#3b82f6" strokeWidth="3"
            strokeDasharray={`${circ}`} strokeDashoffset={`${circ * (1 - pct / 100)}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">{remaining}</span>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-white/35">Descanso</p>
        <p className="text-sm font-semibold text-white">{remaining}s restantes</p>
      </div>
      <button
        type="button" onClick={onSkip}
        className="flex items-center gap-1.5 rounded-xl bg-white/8 px-3 py-2 text-xs text-white/60 hover:bg-white/12 transition"
      >
        <SkipForward size={12} /> Saltar
      </button>
    </motion.div>
  )
}

// ─── StatBox ──────────────────────────────────────────────────────────────────
function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-3 text-center">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] text-white/35 uppercase tracking-widest mt-1">{label}</p>
    </div>
  )
}

// ─── WorkoutDoneOverlay ───────────────────────────────────────────────────────
function WorkoutDoneOverlay({
  dayProgram, setsLog, weights, aiMessage, onClose,
}: {
  dayProgram: DayProgram
  setsLog: Record<string, SetLog[]>
  weights: Record<string, number>
  aiMessage: string
  onClose: () => void
}) {
  const totalSets = Object.values(setsLog).reduce((acc, s) => acc + s.filter((x) => x.done).length, 0)
  const maxWeight = Math.max(0, ...Object.keys(weights).map((id) => weights[id] ?? 0))
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-md rounded-3xl bg-[#1E1E28] border border-white/10 p-6"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition">
          <X size={18} />
        </button>
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
            <Trophy size={28} className="text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">¡Entrenamiento completado!</h2>
          <p className="text-sm text-white/40 mt-1">{dayProgram.day} · {dayProgram.focus}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5">
          <StatBox label="Ejercicios" value={String(dayProgram.exercises.length)} />
          <StatBox label="Series" value={String(totalSets)} />
          <StatBox label="Peso máx" value={maxWeight > 0 ? `${maxWeight}kg` : 'PC'} />
        </div>
        {aiMessage ? (
          <div className="rounded-2xl bg-purple-500/10 border border-purple-500/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-purple-400" />
              <span className="text-xs font-semibold text-purple-300 uppercase tracking-widest">Coach IA</span>
            </div>
            <p className="text-sm text-white/75 leading-relaxed">{aiMessage}</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/4 p-4 flex items-center gap-3">
            <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-purple-400 animate-spin flex-shrink-0" />
            <p className="text-sm text-white/40">Generando mensaje del coach...</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ─── ExerciseCard ─────────────────────────────────────────────────────────────
function ExerciseCard({
  exercise, config, sets, weight, progressionAlert, onSetsChange, onWeightChange, onSetDone,
}: {
  exercise: ExerciseDef
  config: ExerciseConfig
  sets: SetLog[]
  weight: number
  progressionAlert: boolean
  onSetsChange: (sets: SetLog[]) => void
  onWeightChange: (weight: number) => void
  onSetDone: (restSeconds: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const allDone = sets.length > 0 && sets.every((s) => s.done)
  const doneSets = sets.filter((s) => s.done).length
  const numSets = config.sets ?? exercise.defaultSets
  const numReps = config.reps ?? exercise.defaultReps
  const videoUrl = config.videoUrl ?? ''
  const videoId = videoUrl ? getYouTubeId(videoUrl) : null

  const handleSetCheck = (idx: number) => {
    const wasNotDone = !sets[idx].done
    const updated = sets.map((s, i) => i === idx ? { ...s, done: !s.done } : s)
    onSetsChange(updated)
    if (wasNotDone) onSetDone(exercise.restSeconds)
  }

  const handleRepChange = (idx: number, val: string) => {
    onSetsChange(sets.map((s, i) => i === idx ? { ...s, reps: val } : s))
  }

  const handleWeightInput = (idx: number, val: string) => {
    onSetsChange(sets.map((s, i) => i === idx ? { ...s, weight: val } : s))
    const num = parseFloat(val)
    if (!isNaN(num) && num > 0) onWeightChange(num)
  }

  const handleAI = async () => {
    setAiLoading(true)
    setAiText('')
    try {
      const done = sets.filter((s) => s.done).length
      const prompt = `Coach de fitness. Usuario hizo ${exercise.name} (${exercise.primaryMuscles.join(', ')}): ${done}/${sets.length} series con ${weight > 0 ? weight + 'kg' : 'peso corporal'}. Tip del ejercicio: ${exercise.tip}. Error más común: ${exercise.commonErrors[0]}. Da feedback breve (2-3 frases) motivador y un consejo concreto para la próxima sesión.`
      setAiText(await callGemini(prompt))
    } catch (e: unknown) {
      setAiText(e instanceof Error ? e.message : 'Error al contactar con el coach')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border overflow-hidden transition-colors duration-300 ${allDone ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-white/8 bg-white/[0.02]'}`}
    >
      <button type="button" onClick={() => setExpanded((e) => !e)} className="w-full flex items-center gap-3 p-4 text-left">
        <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${allDone ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
          {allDone ? <Check size={15} className="text-emerald-400" /> : <Dumbbell size={15} className="text-white/35" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white/90 text-sm">{exercise.name}</p>
            {progressionAlert && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                ↑ Subir peso
              </span>
            )}
          </div>
          <p className="text-xs text-white/35 truncate">{exercise.primaryMuscles.join(' · ')}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="rounded-xl bg-white/8 px-2 py-1 text-xs text-white/55">{numSets}×{numReps}</span>
          <span className="rounded-xl bg-blue-500/10 px-2 py-1 text-xs text-blue-300 font-medium">
            {weight > 0 ? `${weight}kg` : 'PC'}
          </span>
          {expanded ? <ChevronUp size={13} className="text-white/30" /> : <ChevronDown size={13} className="text-white/30" />}
        </div>
      </button>

      {doneSets > 0 && (
        <div className="mx-4 mb-2 h-0.5 rounded-full bg-white/8 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(doneSets / sets.length) * 100}%` }} />
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Instrucciones</p>
                <ol className="space-y-1.5">
                  {exercise.instructions.map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-white/60">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/15 flex items-center justify-center text-[10px] font-bold text-blue-400">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-xl bg-amber-500/8 border border-amber-500/15 p-3">
                <p className="text-xs font-semibold text-amber-400 mb-1">💡 Tip</p>
                <p className="text-sm text-white/65">{exercise.tip}</p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Errores comunes</p>
                <ul className="space-y-1">
                  {exercise.commonErrors.map((err, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-white/50">
                      <span className="text-rose-400 mt-0.5 flex-shrink-0">×</span>
                      {err}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Registro de series</p>
                <div className="space-y-2">
                  {sets.map((s, idx) => (
                    <div key={idx} className={`flex items-center gap-2 rounded-xl p-2 transition-colors ${s.done ? 'bg-emerald-500/8' : 'bg-white/4'}`}>
                      <span className="text-xs text-white/30 w-5 text-center flex-shrink-0">{idx + 1}</span>
                      <input
                        type="number" inputMode="numeric"
                        placeholder={String(numReps)} value={s.reps}
                        onChange={(e) => handleRepChange(idx, e.target.value)}
                        className="w-14 rounded-lg bg-white/8 border border-white/8 px-2 py-1.5 text-xs text-white/80 text-center focus:outline-none focus:border-white/20"
                      />
                      <span className="text-xs text-white/25 flex-shrink-0">reps</span>
                      {exercise.initialWeight > 0 && (
                        <>
                          <input
                            type="number" inputMode="decimal"
                            placeholder={String(weight)} value={s.weight}
                            onChange={(e) => handleWeightInput(idx, e.target.value)}
                            className="w-14 rounded-lg bg-white/8 border border-white/8 px-2 py-1.5 text-xs text-white/80 text-center focus:outline-none focus:border-white/20"
                          />
                          <span className="text-xs text-white/25 flex-shrink-0">kg</span>
                        </>
                      )}
                      <button
                        type="button" onClick={() => handleSetCheck(idx)}
                        className={`ml-auto flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition ${s.done ? 'bg-emerald-500 text-white' : 'bg-white/8 text-white/35 hover:bg-white/12'}`}
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {videoId && (
                <div className="rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title={exercise.name}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                </div>
              )}

              <div>
                <button
                  type="button" onClick={handleAI} disabled={aiLoading}
                  className="flex items-center gap-2 rounded-xl bg-purple-500/10 border border-purple-500/20 px-4 py-2.5 text-sm text-purple-300 hover:bg-purple-500/15 transition disabled:opacity-50"
                >
                  <Sparkles size={14} />
                  {aiLoading ? 'Consultando coach...' : 'Coach IA'}
                </button>
                <AnimatePresence>
                  {aiText && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      className="mt-2 rounded-xl bg-purple-500/8 border border-purple-500/15 p-3 text-sm text-white/70 leading-relaxed"
                    >
                      {aiText}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <p className="text-[11px] text-white/25 italic">{exercise.progressionRule}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── HistoryTab ───────────────────────────────────────────────────────────────
function HistoryTab({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/8 p-10 text-center text-sm text-white/35">
        No hay historial aún. Completa un entrenamiento para verlo aquí.
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {history.map((entry) => (
        <div key={entry.date} className="rounded-2xl bg-[#1E1E28] border border-white/8 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-white/90 text-sm">{entry.day}</p>
              <p className="text-xs text-white/35">{entry.date}</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <span className="rounded-xl bg-white/8 px-2.5 py-1 text-xs text-white/55">{entry.totalSets} series</span>
              {entry.maxWeight > 0 && (
                <span className="rounded-xl bg-blue-500/10 px-2.5 py-1 text-xs text-blue-300">{entry.maxWeight}kg máx</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {entry.exercises.map((ex) => (
              <span key={ex.id} className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-white/45">
                {ex.name} · {ex.setsCompleted}s{ex.weight > 0 ? ` · ${ex.weight}kg` : ''}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── ProgramTab ───────────────────────────────────────────────────────────────
function ProgramTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5">
        <h3 className="font-semibold text-white/90 mb-1">Estructura del programa</h3>
        <p className="text-sm text-white/45 mb-4">Rutina de 4 días con 3 de descanso. Diseñada para hipertrofia con mancuernas en casa.</p>
        <div className="space-y-2">
          {PROGRAM.map((day) => (
            <div key={day.day} className={`flex items-start gap-3 rounded-xl p-3 ${day.type === 'workout' ? 'bg-white/5' : 'bg-white/[0.02]'}`}>
              <span className="w-8 text-xs font-bold text-white/35 flex-shrink-0 mt-0.5">{day.shortLabel}</span>
              {day.type === 'workout' ? (
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white/80">{day.focus}</p>
                  <p className="text-xs text-white/35 mt-0.5">{day.exercises.map((e) => e.name).join(' · ')}</p>
                </div>
              ) : (
                <p className="text-sm text-white/25 mt-0.5">Descanso activo</p>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5">
        <h3 className="font-semibold text-white/90 mb-2">Regla de progresión</h3>
        <p className="text-sm text-white/50 leading-relaxed">
          Cuando completes <strong className="text-white/75">4 sesiones consecutivas</strong> de un ejercicio con todas las series y el mismo peso,
          recibirás el aviso "↑ Subir peso". Incrementos: 1 kg en aislamiento, 2 kg en compuestos.
        </p>
      </div>
      <div className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5">
        <h3 className="font-semibold text-white/90 mb-2">Descanso entre series</h3>
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm"><span className="text-white/50">Ejercicios de aislamiento</span><span className="text-white/70">60s</span></div>
          <div className="flex justify-between text-sm"><span className="text-white/50">Ejercicios compuestos</span><span className="text-white/70">75–90s</span></div>
          <div className="flex justify-between text-sm"><span className="text-white/50">Core / Peso corporal</span><span className="text-white/70">60s</span></div>
        </div>
      </div>
    </div>
  )
}

// ─── ConfigTab ────────────────────────────────────────────────────────────────
function ConfigTab({
  dayProgram, configs, onSaveConfig,
}: {
  dayProgram: DayProgram
  configs: Record<string, ExerciseConfig>
  onSaveConfig: (id: string, c: ExerciseConfig) => Promise<void>
}) {
  const [drafts, setDrafts] = useState<Record<string, { sets: string; reps: string; videoUrl: string }>>(() =>
    Object.fromEntries(dayProgram.exercises.map((ex) => [
      ex.id,
      {
        sets: String(configs[ex.id]?.sets ?? ex.defaultSets),
        reps: String(configs[ex.id]?.reps ?? ex.defaultReps),
        videoUrl: configs[ex.id]?.videoUrl ?? '',
      },
    ]))
  )
  const [saving, setSaving] = useState<string | null>(null)

  const update = (id: string, field: 'sets' | 'reps' | 'videoUrl', val: string) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }))
  }

  const save = async (ex: ExerciseDef) => {
    setSaving(ex.id)
    const d = drafts[ex.id]
    await onSaveConfig(ex.id, {
      sets: parseInt(d.sets) || ex.defaultSets,
      reps: parseInt(d.reps) || ex.defaultReps,
      videoUrl: d.videoUrl.trim() || undefined,
    })
    setSaving(null)
  }

  return (
    <div className="space-y-3">
      {dayProgram.exercises.map((ex) => (
        <div key={ex.id} className="rounded-2xl bg-[#1E1E28] border border-white/8 p-4">
          <p className="font-semibold text-white/90 text-sm mb-3">{ex.name}</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-white/30 mb-1 block">Series</label>
              <input
                type="number" value={drafts[ex.id]?.sets ?? ''}
                onChange={(e) => update(ex.id, 'sets', e.target.value)}
                className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/20"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-white/30 mb-1 block">Reps</label>
              <input
                type="number" value={drafts[ex.id]?.reps ?? ''}
                onChange={(e) => update(ex.id, 'reps', e.target.value)}
                className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/20"
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="text-[10px] uppercase tracking-widest text-white/30 mb-1 flex items-center gap-1.5">
              <PlaySquare size={11} /> URL YouTube
            </label>
            <input
              type="url" placeholder="https://youtube.com/watch?v=..."
              value={drafts[ex.id]?.videoUrl ?? ''}
              onChange={(e) => update(ex.id, 'videoUrl', e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-white/20"
            />
          </div>
          <button
            type="button" onClick={() => save(ex)} disabled={saving === ex.id}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition disabled:opacity-50"
          >
            <Save size={12} />
            {saving === ex.id ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── EjerciciosPage ───────────────────────────────────────────────────────────
export function EjerciciosPage() {
  const [activeTab, setActiveTab] = useState<'workout' | 'history' | 'program' | 'config'>('workout')
  const [dayIdx, setDayIdx] = useState(getTodayDayIndex)
  const dayProgram = PROGRAM[dayIdx]

  const [weights, setWeights] = useState<Record<string, number>>({})
  const [setsLog, setSetsLog] = useState<Record<string, SetLog[]>>({})
  const [configs, setConfigs] = useState<Record<string, ExerciseConfig>>({})
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [progressionAlerts, setProgressionAlerts] = useState<Set<string>>(new Set())
  const [restTimer, setRestTimer] = useState<{ seconds: number; key: number } | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [workoutAiMessage, setWorkoutAiMessage] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setShowDone(false)
    setWorkoutAiMessage('')
    if (dayProgram.type === 'rest') { setLoading(false); return }
    setLoading(true)
    ;(async () => {
      const [loadedConfigs, hist] = await Promise.all([loadConfigsForDay(dayProgram.exercises), loadHistory()])
      setConfigs(loadedConfigs)
      setHistory(hist)
      const loadedWeights = await loadWeightsForDay(dayProgram.exercises)
      const loadedSets = await loadSetsForDay(dayProgram.exercises, loadedConfigs, loadedWeights)
      setWeights(loadedWeights)
      setSetsLog(loadedSets)
      setProgressionAlerts(detectProgressionAlerts(hist, dayProgram.exercises))
      setLoading(false)
    })()
  }, [dayIdx])

  const weekSummary = (() => {
    const monday = getMondayStr()
    const thisWeek = history.filter((h) => h.date >= monday)
    return {
      workouts: thisWeek.length,
      totalSets: thisWeek.reduce((a, h) => a + h.totalSets, 0),
      maxWeight: Math.max(0, ...thisWeek.map((h) => h.maxWeight)),
    }
  })()

  const dayProgress = (() => {
    if (dayProgram.type === 'rest' || dayProgram.exercises.length === 0) return 0
    const done = dayProgram.exercises.filter((ex) => {
      const s = setsLog[ex.id] ?? []
      return s.length > 0 && s.every((x) => x.done)
    }).length
    return Math.round((done / dayProgram.exercises.length) * 100)
  })()

  useEffect(() => {
    if (loading || dayProgram.type === 'rest' || dayProgram.exercises.length === 0) return
    const allDone = dayProgram.exercises.every((ex) => {
      const s = setsLog[ex.id] ?? []
      return s.length > 0 && s.every((x) => x.done)
    })
    if (!allDone || showDone) return
    setShowDone(true)
    const exercises = dayProgram.exercises.map((ex) => {
      const s = setsLog[ex.id] ?? []
      return { id: ex.id, name: ex.name, setsCompleted: s.filter((x) => x.done).length, weight: weights[ex.id] ?? 0 }
    })
    const totalSets = exercises.reduce((a, e) => a + e.setsCompleted, 0)
    const maxWeight = Math.max(0, ...exercises.map((e) => e.weight))
    const entry: HistoryEntry = { date: todayStr(), day: dayProgram.day, totalSets, maxWeight, exercises }
    persistHistory(entry)
    setHistory((prev) => [entry, ...prev.filter((h) => h.date !== entry.date)])
    callGemini(
      `Coach de fitness. El usuario completó el entrenamiento de ${dayProgram.focus}: ${exercises.map((e) => `${e.name} ${e.setsCompleted}s ${e.weight > 0 ? e.weight + 'kg' : 'PC'}`).join(', ')}. Da un mensaje de cierre motivador (2-3 frases) y un consejo de recuperación.`
    ).then(setWorkoutAiMessage).catch(() => setWorkoutAiMessage(''))
  }, [setsLog, loading])

  const handleSetsChange = useCallback((exerciseId: string, sets: SetLog[]) => {
    setSetsLog((prev) => ({ ...prev, [exerciseId]: sets }))
    persistSets(exerciseId, sets)
  }, [])

  const handleWeightChange = useCallback((exerciseId: string, weight: number) => {
    setWeights((prev) => ({ ...prev, [exerciseId]: weight }))
    persistWeight(exerciseId, weight)
  }, [])

  const handleSaveConfig = useCallback(async (id: string, config: ExerciseConfig) => {
    await persistConfig(id, config)
    setConfigs((prev) => ({ ...prev, [id]: config }))
  }, [])

  const handleSetDone = useCallback((secs: number) => {
    setRestTimer((prev) => ({ seconds: secs, key: (prev?.key ?? 0) + 1 }))
  }, [])

  const tabs = [
    { id: 'workout' as const, label: 'Hoy', icon: LayoutGrid },
    { id: 'history' as const, label: 'Historial', icon: History },
    { id: 'program' as const, label: 'Programa', icon: TrendingUp },
    { id: 'config' as const, label: 'Config', icon: Settings },
  ]

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <p className="text-sm text-white/35">Ejercicios · Programa semanal</p>
        <h1 className="text-3xl font-bold text-white/90 mt-1">Entrenamientos</h1>
      </motion.div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatBox label="Esta semana" value={`${weekSummary.workouts} entrenos`} />
        <StatBox label="Series totales" value={String(weekSummary.totalSets)} />
        <StatBox label="Peso máximo" value={weekSummary.maxWeight > 0 ? `${weekSummary.maxWeight}kg` : '—'} />
      </div>

      <div className="flex gap-1 rounded-2xl bg-white/5 p-1 mb-5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id} type="button" onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium transition ${activeTab === id ? 'bg-white/12 text-white' : 'text-white/40 hover:text-white/60'}`}
          >
            <Icon size={13} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'workout' && (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-4">
            {PROGRAM.map((day, idx) => (
              <button
                key={day.day} type="button" onClick={() => setDayIdx(idx)}
                className={`rounded-xl border py-2.5 text-xs font-medium transition ${
                  dayIdx === idx ? 'border-blue-500/40 bg-blue-500/10 text-white'
                  : day.type === 'rest' ? 'border-white/5 bg-white/[0.02] text-white/25'
                  : 'border-white/8 bg-white/5 text-white/55 hover:border-white/14'
                }`}
              >
                {day.shortLabel}
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-[#1E1E28] border border-white/8 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-semibold text-white/90">{dayProgram.day}</p>
                <p className="text-sm text-white/40">{dayProgram.focus ?? 'Descanso'}</p>
              </div>
              {dayProgram.type === 'workout' && (
                <span className="text-sm font-bold text-white/60">{dayProgress}%</span>
              )}
            </div>
            {dayProgram.type === 'workout' && (
              <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                <motion.div
                  className="h-full bg-blue-500 rounded-full"
                  animate={{ width: `${dayProgress}%` }} transition={{ duration: 0.5 }}
                />
              </div>
            )}
          </div>

          {dayProgram.type === 'rest' ? (
            <div className="rounded-2xl border border-dashed border-white/8 p-10 text-center">
              <p className="text-3xl mb-3">😴</p>
              <p className="text-sm font-medium text-white/55">Día de descanso</p>
              <p className="text-xs text-white/30 mt-1">El descanso es parte del entrenamiento.</p>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-14">
              <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {dayProgram.exercises.map((ex) => (
                <ExerciseCard
                  key={ex.id}
                  exercise={ex}
                  config={configs[ex.id] ?? {}}
                  sets={setsLog[ex.id] ?? []}
                  weight={weights[ex.id] ?? ex.initialWeight}
                  progressionAlert={progressionAlerts.has(ex.id)}
                  onSetsChange={(s) => handleSetsChange(ex.id, s)}
                  onWeightChange={(w) => handleWeightChange(ex.id, w)}
                  onSetDone={handleSetDone}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && <HistoryTab history={history} />}
      {activeTab === 'program' && <ProgramTab />}
      {activeTab === 'config' && (
        dayProgram.type === 'workout' ? (
          <ConfigTab dayProgram={dayProgram} configs={configs} onSaveConfig={handleSaveConfig} />
        ) : (
          <div className="rounded-2xl border border-dashed border-white/8 p-10 text-center text-sm text-white/35">
            Selecciona un día de entrenamiento para configurar ejercicios.
          </div>
        )
      )}

      <AnimatePresence>
        {restTimer && (
          <RestTimer key={restTimer.key} seconds={restTimer.seconds} onSkip={() => setRestTimer(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDone && (
          <WorkoutDoneOverlay
            dayProgram={dayProgram}
            setsLog={setsLog}
            weights={weights}
            aiMessage={workoutAiMessage}
            onClose={() => setShowDone(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
