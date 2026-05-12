import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, ChevronDown, ChevronUp, Dumbbell, History,
  LayoutGrid, Save, Settings, SkipForward, Sparkles,
  TrendingUp, Trophy, X, PlaySquare,
} from 'lucide-react'
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { callAI, hasAnyAIKey } from '@/services/ai.service'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ExerciseDef {
  id: string
  name: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  defaultSets: number
  defaultReps: number
  repUnit?: string        // 'rep' (default) | 'seg' for time-based exercises
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
  date: string; day: string; totalSets: number; maxWeight: number; completedAt?: unknown
  exercises: { id: string; name: string; setsCompleted: number; weight: number }[]
}

// ─── Handgrip ─────────────────────────────────────────────────────────────────
const HANDGRIP_EXERCISES: ExerciseDef[] = [
  {
    id: 'handgrip-dinamico', name: 'Apriete Dinámico',
    primaryMuscles: ['Flexores dedos', 'Antebrazo'], secondaryMuscles: ['Muñeca'],
    defaultSets: 3, defaultReps: 15, repUnit: 'rep', initialWeight: 8, restSeconds: 45,
    instructions: [
      'Sujeta el handgrip con agarre completo, todos los dedos en el mango',
      'Aprieta durante 2 segundos hasta cerrar completamente',
      'Suelta en 1 segundo de forma controlada — no dejes ir de golpe',
      'Completa todas las reps con una mano antes de cambiar',
      'El codo ligeramente flexionado, muñeca recta durante todo el movimiento',
    ],
    tip: '2 segundos apretando, 1 soltando. Este ritmo es lo que construye fuerza real. Si vas más rápido pierdes el estímulo.',
    commonErrors: ['Soltar de golpe sin control', 'Muñeca doblada', 'Usar solo 3 dedos en vez de todos'],
    progressionRule: '3×15 durante 2 semanas → sube 2kg',
  },
  {
    id: 'handgrip-isometrico', name: 'Aguante Isométrico',
    primaryMuscles: ['Agarre', 'Flexores dedos'], secondaryMuscles: ['Antebrazo'],
    defaultSets: 2, defaultReps: 30, repUnit: 'seg', initialWeight: 8, restSeconds: 60,
    instructions: [
      'Aprieta el handgrip hasta la mitad del recorrido (no al máximo)',
      'Mantén esa posición durante 30 segundos sin soltar',
      'Respira normalmente — no aguantes la respiración',
      'Si tiembla es normal, aguanta hasta el final',
      'Cambia de mano y repite',
    ],
    tip: 'El isométrico construye la fuerza de agarre funcional que usas en padel. Más útil que las reps rápidas para el deporte.',
    commonErrors: ['Apretar al máximo (se agota antes de tiempo)', 'Aguantar la respiración', 'Soltar antes de tiempo'],
    progressionRule: '30s → 45s → 60s antes de subir peso',
  },
]

const HANDGRIP_WEEK_WEIGHTS = [
  { maxWeek: 2,  weight: 8  },
  { maxWeek: 4,  weight: 10 },
  { maxWeek: 6,  weight: 12 },
  { maxWeek: 8,  weight: 15 },
  { maxWeek: 10, weight: 18 },
  { maxWeek: 99, weight: 20 },
]

function handgripWeightForWeek(week: number): number {
  return HANDGRIP_WEEK_WEIGHTS.find(w => week <= w.maxWeek)?.weight ?? 20
}

function isHandgrip(id: string) { return id.startsWith('handgrip-') }

// ─── Program ──────────────────────────────────────────────────────────────────
const PROGRAM: DayProgram[] = [
  {
    day: 'Lunes', shortLabel: 'Lun', type: 'workout', focus: 'Bíceps / Espalda',
    exercises: [
      {
        id: 'curl-biceps', name: 'Curl de Bíceps',
        primaryMuscles: ['Bíceps'], secondaryMuscles: ['Antebrazo'],
        defaultSets: 3, defaultReps: 12, initialWeight: 5, restSeconds: 60,
        instructions: [
          'De pie, pies a anchura de caderas, espalda recta y core apretado.',
          'Codos PEGADOS a los costados — este es el detalle más importante. No los muevas.',
          'Sube en 2 segundos apretando el bíceps al máximo. Pausa 1 segundo arriba.',
          'Baja en 3 segundos de forma controlada. No dejes caer el peso.',
          'Respira: inspira abajo, espira al subir.',
        ],
        tip: 'Si el cuerpo se balancea o los codos se adelantan, reduce el peso. Técnica > peso siempre.',
        commonErrors: ['Balancear el torso', 'Codos se separan del cuerpo', 'Bajar demasiado rápido'],
        progressionRule: 'Cuando completes 3×12 con buena técnica 2 semanas seguidas → sube 0.5-1kg',
      },
      {
        id: 'curl-martillo', name: 'Curl Martillo',
        primaryMuscles: ['Braquial', 'Bíceps'], secondaryMuscles: ['Antebrazo'],
        defaultSets: 3, defaultReps: 12, initialWeight: 5, restSeconds: 60,
        instructions: [
          'Misma posición que el curl normal pero con agarre neutro: palmas mirándose entre sí.',
          'Sube el dedo pulgar hacia el hombro, sin girar la muñeca en ningún momento.',
          'Codos completamente fijos a los costados — igual que el curl normal.',
          'Pausa 1 segundo arriba, baja en 3 segundos.',
        ],
        tip: 'El curl martillo trabaja el braquial (debajo del bíceps) y da GROSOR al brazo por fuera. Complemento perfecto.',
        commonErrors: ['Girar la muñeca', 'Codos que se adelantan', 'Subir demasiado rápido'],
        progressionRule: 'Mismo criterio: 3×12 durante 2 semanas → sube 0.5kg',
      },
      {
        id: 'remo-mancuerna', name: 'Remo con Mancuerna',
        primaryMuscles: ['Dorsal', 'Trapecio'], secondaryMuscles: ['Bíceps', 'Core'],
        defaultSets: 3, defaultReps: 10, initialWeight: 5, restSeconds: 75,
        instructions: [
          'Apoya la rodilla y la mano del mismo lado en una silla o cama. Espalda RECTA y paralela al suelo.',
          'Cuelga el brazo libre con la mancuerna. Hombro relajado.',
          'Tira la mancuerna hacia la cadera (no hacia el pecho). Imagina que metes el codo en el bolsillo.',
          'Aprieta la espalda 1 segundo arriba. Baja en 3 segundos controlado.',
          'No gires el torso para ayudarte — mantén la espalda recta todo el tiempo.',
        ],
        tip: 'La espalda es tu músculo más grande. Entrenarlo bien mejora tu postura de escritorio y previene dolores.',
        commonErrors: ['Girar el torso', 'Tirar hacia el pecho en vez de la cadera', 'Espalda arqueada'],
        progressionRule: '3×10 por brazo durante 2 semanas → sube 0.5-1kg',
      },
    ],
  },
  {
    day: 'Martes', shortLabel: 'Mar', type: 'workout', focus: 'Piernas + Handgrip',
    exercises: [
      {
        id: 'sentadilla-goblet', name: 'Sentadilla Goblet',
        primaryMuscles: ['Cuádriceps', 'Glúteos'], secondaryMuscles: ['Core', 'Isquiotibiales'],
        defaultSets: 3, defaultReps: 12, initialWeight: 5, restSeconds: 90,
        instructions: [
          'Sujeta UNA mancuerna vertical con las dos manos a la altura del pecho, cerca del cuerpo.',
          'Pies ligeramente más anchos que los hombros, puntas giradas 30° hacia fuera.',
          'Baja DESPACIO (3 segundos) empujando las rodillas hacia fuera (misma dirección que los pies). Espalda recta.',
          'Baja hasta que los muslos estén paralelos al suelo o más — si puedes sin que el talón se levante.',
          'Sube apretando los glúteos, sin bloquear las rodillas arriba.',
        ],
        tip: 'La sentadilla goblet es perfecta para principiantes. El peso al frente te obliga a mantener el torso erguido automáticamente.',
        commonErrors: ['Rodillas que se juntan al bajar', 'Talones que se levantan', 'Espalda que se redondea', 'No bajar suficiente'],
        progressionRule: '3×12 durante 2 semanas → sube 1-2kg. La sentadilla aguanta más peso que el curl.',
      },
      {
        id: 'sentadilla-bulgara', name: 'Sentadilla Búlgara',
        primaryMuscles: ['Cuádriceps', 'Glúteos'], secondaryMuscles: ['Core', 'Equilibrio'],
        defaultSets: 3, defaultReps: 8, initialWeight: 0, restSeconds: 60,
        instructions: [
          'Pon el empeine de un pie en una silla detrás de ti. El pie de apoyo adelantado.',
          'Baja la rodilla trasera hacia el suelo en línea recta — no la eches hacia adelante.',
          'La rodilla delantera sigue la dirección del pie pero no pasa de la punta.',
          'Torso ligeramente inclinado hacia adelante, core apretado.',
          'Sube empujando con el talón delantero, apretando el glúteo.',
          'Empieza SIN mancuernas hasta dominar el equilibrio.',
        ],
        tip: 'Una pierna a la vez te permite detectar desequilibrios. La pierna dominante suele ser más fuerte. Es NORMAL que tiemble al principio.',
        commonErrors: ['Rodilla delantera que colapsa hacia dentro', 'Torso demasiado recto', 'Rodilla trasera que va hacia adelante'],
        progressionRule: 'Cuando hagas 3×10 sin peso con buena técnica → añade mancuernas de 2-3kg',
      },
      {
        id: 'peso-muerto-rumano', name: 'Peso Muerto Rumano',
        primaryMuscles: ['Isquiotibiales', 'Glúteos'], secondaryMuscles: ['Espalda baja', 'Core'],
        defaultSets: 3, defaultReps: 10, initialWeight: 5, restSeconds: 90,
        instructions: [
          'De pie con mancuernas delante de los muslos, pies a anchura de caderas.',
          'BISAGRA DE CADERA: empuja la cadera hacia ATRÁS (no hacia abajo). Las rodillas se doblan ligeramente pero no se flexionan.',
          'Baja las mancuernas pegadas a las piernas hasta que sientas estiramiento en los isquios (parte trasera del muslo). Normalmente llegan a la mitad de la tibia.',
          'Espalda completamente recta — si se redondea, has bajado demasiado. Para antes.',
          'Sube volviendo la cadera adelante, apretando glúteos al final.',
        ],
        tip: 'El RDL es FUNDAMENTAL para prevenir lesiones de espalda. Muchas personas lo hacen mal toda su vida. Aprenderlo bien ahora te cambiará.',
        commonErrors: ['Doblar las rodillas como en sentadilla (no es lo mismo)', 'Espalda redondeada', 'Separar las mancuernas del cuerpo', 'Bajar demasiado'],
        progressionRule: '3×12 durante 2 semanas con técnica perfecta → sube 1kg',
      },
      {
        id: 'puente-gluteos', name: 'Puente de Glúteos',
        primaryMuscles: ['Glúteos'], secondaryMuscles: ['Core', 'Isquiotibiales'],
        defaultSets: 3, defaultReps: 15, initialWeight: 0, restSeconds: 45,
        instructions: [
          'Tumbado boca arriba, rodillas dobladas, pies apoyados en el suelo a anchura de caderas.',
          'Aprieta los glúteos y levanta la cadera hasta formar una línea recta de hombros a rodillas.',
          'Mantén 2 segundos arriba apretando. Baja controlado.',
          'Puedes progresar poniendo una mancuerna sobre las caderas.',
        ],
        tip: 'El ejercicio más infravalorado de todos. Los glúteos son el músculo más grande del cuerpo. Actívalos bien.',
        commonErrors: ['No apretar los glúteos (solo se usa la espalda baja)', 'Hiperextender la espalda arriba'],
        progressionRule: '3×20 → añade mancuerna encima de las caderas → sube peso',
      },
      ...HANDGRIP_EXERCISES,
    ],
  },
  {
    day: 'Miércoles', shortLabel: 'Mié', type: 'workout', focus: 'Empuje',
    exercises: [
      {
        id: 'flexiones', name: 'Flexiones',
        primaryMuscles: ['Pectoral', 'Tríceps'], secondaryMuscles: ['Hombros', 'Core'],
        defaultSets: 3, defaultReps: 12, initialWeight: 0, restSeconds: 90,
        instructions: [
          'Manos ligeramente más anchas que los hombros. Cuerpo recto de cabeza a talones.',
          'Baja en 3 segundos hasta que el pecho CASI toque el suelo. Los codos forman 45° con el torso.',
          'Sube fuerte, sin bloquear los codos arriba.',
          'Si no puedes: apoya las RODILLAS. Exactamente el mismo movimiento, igual de válido.',
          'Core y glúteos apretados durante todo el movimiento — no dejes caer la cadera.',
        ],
        tip: 'No hay vergüenza en las rodillas. Lo importante es el rango completo. Progresión: rodillas → pies → inclinadas → con lastre.',
        commonErrors: ['Cadera caída o subida', 'Codos muy abiertos (90°)', 'No bajar suficiente', 'Solo bajar la cabeza'],
        progressionRule: 'Aumenta las reps cada semana. Cuando hagas 3×15: prueba elevando los pies o añadiendo chaleco',
      },
      {
        id: 'press-hombros', name: 'Press de Hombros',
        primaryMuscles: ['Deltoides anterior y medial'], secondaryMuscles: ['Tríceps'],
        defaultSets: 3, defaultReps: 12, initialWeight: 5, restSeconds: 60,
        instructions: [
          'Sentado en una silla con respaldo, mancuernas a altura de orejas, codos en línea con hombros.',
          'Palmas mirando al frente. Core apretado, espalda APOYADA en el respaldo.',
          'Sube hasta casi juntar las mancuernas (no choques, no bloquees codos).',
          'Baja controlado en 3 segundos hasta la posición inicial.',
        ],
        tip: 'Sentado con respaldo elimina la tentación de arquear la espalda. Mucho más seguro y eficaz para principiantes.',
        commonErrors: ['Arquear la espalda (dolor lumbar)', 'No bajar suficiente', 'Peso demasiado alto al principio'],
        progressionRule: '3×12 × 2 semanas → sube 0.5kg. Los hombros son delicados, progresión lenta es correcta.',
      },
      {
        id: 'elevaciones-laterales', name: 'Elevaciones Laterales',
        primaryMuscles: ['Deltoides medial'], secondaryMuscles: [],
        defaultSets: 3, defaultReps: 15, initialWeight: 2, restSeconds: 45,
        instructions: [
          'De pie, brazos a los lados. Mancuernas pequeñas — 2kg está bien al principio.',
          'Sube los brazos a los lados hasta horizontal (como una T), codos ligeramente doblados.',
          'Imagina que viertes agua de una jarra en el punto más alto — muñeca más baja que el codo.',
          'Baja en 3 segundos. Lento es mejor aquí.',
          'NO subas por encima del hombro, puede irritar el manguito rotador.',
        ],
        tip: '2kg parece poco pero quema muchísimo si lo haces lento. Muchos gimnasios van demasiado pesado y pierden la forma correcta.',
        commonErrors: ['Subir por encima de 90°', 'Balancear el cuerpo para ayudar', 'Muñeca más alta que el codo'],
        progressionRule: '3×15 con 2kg × 2 semanas → prueba 3kg',
      },
      {
        id: 'extension-triceps', name: 'Extensión de Tríceps',
        primaryMuscles: ['Tríceps'], secondaryMuscles: [],
        defaultSets: 3, defaultReps: 12, initialWeight: 5, restSeconds: 60,
        instructions: [
          'Sentado, sujeta UNA mancuerna vertical con ambas manos (los pulgares rodean el mango).',
          'Sube los brazos rectos sobre la cabeza. Los CODOS apuntan al techo y no se mueven.',
          'Baja la mancuerna detrás de la cabeza doblando solo los codos.',
          'Sube extendiendo los codos. Los codos siguen quietos — este es el punto clave.',
          'Mueve despacio, especialmente si tienes los codos sensibles.',
        ],
        tip: 'Los codos quietos son todo el ejercicio. Si se abren, el tríceps deja de trabajar.',
        commonErrors: ['Codos que se abren hacia los lados', 'Mover los hombros en vez de solo los codos'],
        progressionRule: '3×12 × 2 semanas → sube 0.5-1kg',
      },
    ],
  },
  {
    day: 'Jueves', shortLabel: 'Jue', type: 'workout', focus: 'Piernas + Core + Handgrip',
    exercises: [
      {
        id: 'sentadilla-mancuernas', name: 'Sentadilla con Mancuernas',
        primaryMuscles: ['Cuádriceps', 'Glúteos'], secondaryMuscles: ['Core', 'Isquiotibiales'],
        defaultSets: 4, defaultReps: 12, initialWeight: 5, restSeconds: 90,
        instructions: [
          'Mancuernas en las manos a los costados o en los hombros (más difícil).',
          'Pies a anchura de hombros, puntas 30° hacia fuera.',
          'Baja DESPACIO (3s) empujando rodillas hacia fuera. Muslos paralelos al suelo.',
          'Talones siempre en el suelo. Si se levantan, separa más los pies o pon algo bajo los talones.',
          'Sube apretando los glúteos. Rodillas siguen hacia fuera al subir.',
        ],
        tip: 'Segundo día de piernas en la semana. Las piernas necesitan más volumen que los brazos para crecer.',
        commonErrors: ['Rodillas hacia dentro', 'Talones que se levantan', 'Inclinarse demasiado hacia delante'],
        progressionRule: '4×12 × 2 semanas → sube 1kg por mancuerna',
      },
      {
        id: 'zancadas', name: 'Zancadas',
        primaryMuscles: ['Cuádriceps', 'Glúteos'], secondaryMuscles: ['Equilibrio', 'Core'],
        defaultSets: 3, defaultReps: 10, initialWeight: 0, restSeconds: 60,
        instructions: [
          'Empieza sin peso. De pie, da un paso largo hacia adelante.',
          'Baja la rodilla trasera hacia el suelo — SIN tocar. Rodilla delantera a 90°, no pasa la punta.',
          'Vuelve a la posición inicial empujando con el talón delantero.',
          'Alterna piernas o completa todas las reps de una antes de cambiar.',
          'Cuando domines el movimiento, añade mancuernas.',
        ],
        tip: 'Las zancadas detectan desequilibrios entre piernas. Es normal que una falle antes.',
        commonErrors: ['Paso demasiado corto', 'Rodilla delantera que pasa la punta del pie', 'Torso que cae hacia delante'],
        progressionRule: 'Domina sin peso → 3×10 con 2-3kg → sube progresivamente',
      },
      {
        id: 'plancha', name: 'Plancha',
        primaryMuscles: ['Core', 'Transverso abdominal'], secondaryMuscles: ['Hombros', 'Glúteos'],
        defaultSets: 3, defaultReps: 40, initialWeight: 0, restSeconds: 45,
        instructions: [
          'Antebrazos en el suelo, codos exactamente bajo los hombros.',
          'Cuerpo en LÍNEA RECTA de cabeza a talones. No subas ni bajes la cadera.',
          'Aprieta glúteos, core y cuádriceps al mismo tiempo. Respira normalmente.',
          'Mirada al suelo, cuello neutro.',
          'Para cuando la cadera empiece a caer — calidad sobre cantidad.',
        ],
        tip: '30 segundos perfectos > 2 minutos con la cadera caída. La posición lo es todo.',
        commonErrors: ['Cadera que sube (tienda de campaña)', 'Cadera que cae', 'Aguantar la respiración'],
        progressionRule: '30s → 45s → 60s → 90s. Después: plancha con elevación de pierna alternada.',
      },
      {
        id: 'mountain-climbers', name: 'Mountain Climbers',
        primaryMuscles: ['Core', 'Cardio'], secondaryMuscles: ['Hombros', 'Cadera'],
        defaultSets: 3, defaultReps: 20, initialWeight: 0, restSeconds: 45,
        instructions: [
          'Posición de plancha (brazos estirados, manos bajo hombros).',
          'Lleva una rodilla al pecho, vuelve, lleva la otra. Alterna rápido.',
          'La cadera NO sube ni baja — se queda en posición de plancha todo el tiempo.',
          'Core apretado. Mueve solo las piernas.',
        ],
        tip: 'Añade cardio sin salir de casa. Después de la plancha sube la intensidad del entrenamiento.',
        commonErrors: ['Cadera que sube al mover las piernas', 'Ir demasiado rápido perdiendo la posición'],
        progressionRule: '20 reps → 30 reps → 40 reps → con chaleco',
      },
      ...HANDGRIP_EXERCISES,
    ],
  },
  { day: 'Viernes', shortLabel: 'Vie', type: 'rest', exercises: [] },
  { day: 'Sábado', shortLabel: 'Sáb', type: 'workout', focus: 'Handgrip 💪', exercises: [...HANDGRIP_EXERCISES] },
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

function getYouTubeId(url: string) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|\/shorts\/)([^&\n?#]+)/)
  return m ? m[1] : null
}

// ─── Firebase (con manejo de errores robusto) ──────────────────────────────────
const OLD_ID_MAP: Record<string, string> = {
  'curl-biceps': 'curl_biceps', 'curl-martillo': 'curl_martillo',
  'remo-mancuerna': 'remo_mancuerna', 'sentadilla-goblet': 'sentadilla_goblet',
  'sentadilla-bulgara': 'sentadilla_bulgara', 'peso-muerto-rumano': 'peso_muerto_rumano',
  'puente-gluteos': 'puente_gluteo', 'flexiones': 'flexiones',
  'press-hombros': 'press_hombro', 'elevaciones-laterales': 'elevacion_lateral',
  'extension-triceps': 'extension_triceps', 'sentadilla-mancuernas': 'sentadilla_libre',
  'zancadas': 'zancada', 'plancha': 'plancha', 'mountain-climbers': 'mountain_climber',
}

async function loadWeightsForDay(exercises: ExerciseDef[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  await Promise.all(exercises.map(async (ex) => {
    try {
      const snap = await getDoc(doc(db, 'exercise_weights', ex.id))
      result[ex.id] = snap.exists() ? (snap.data().weight as number) : ex.initialWeight
    } catch {
      result[ex.id] = ex.initialWeight
    }
  }))
  return result
}

async function loadConfigsForDay(exercises: ExerciseDef[]): Promise<Record<string, ExerciseConfig>> {
  const result: Record<string, ExerciseConfig> = {}
  let oldFirebase: Record<string, any> = {}
  try {
    const oldSnap = await getDoc(doc(db, 'config', 'ejercicios'))
    if (oldSnap.exists()) oldFirebase = oldSnap.data()
  } catch { /* sin datos antiguos */ }

  await Promise.all(exercises.map(async (ex) => {
    try {
      const snap = await getDoc(doc(db, 'exercise_config', ex.id))
      if (snap.exists()) {
        result[ex.id] = snap.data() as ExerciseConfig
      } else {
        const oldId = OLD_ID_MAP[ex.id]
        const oldData = oldId ? oldFirebase[oldId] : null
        if (oldData) {
          const config: ExerciseConfig = {
            videoUrl: oldData.video_url || undefined,
            sets: oldData.series ? Number(oldData.series) : undefined,
            reps: oldData.reps ? parseInt(String(oldData.reps)) || undefined : undefined,
          }
          result[ex.id] = config
          setDoc(doc(db, 'exercise_config', ex.id), config, { merge: true }).catch(() => {})
        }
      }
    } catch {
      /* sin config para este ejercicio */
    }
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
    try {
      const snap = await getDoc(doc(db, 'exercise_sets', `${date}_${ex.id}`))
      if (snap.exists()) {
        result[ex.id] = snap.data().sets as SetLog[]
      } else {
        const numSets = configs[ex.id]?.sets ?? ex.defaultSets
        const w = String((weights[ex.id] ?? ex.initialWeight) || '')
        result[ex.id] = Array.from({ length: numSets }, () => ({ reps: '', weight: w, done: false }))
      }
    } catch {
      const numSets = configs[ex.id]?.sets ?? ex.defaultSets
      const w = String((weights[ex.id] ?? ex.initialWeight) || '')
      result[ex.id] = Array.from({ length: numSets }, () => ({ reps: '', weight: w, done: false }))
    }
  }))
  return result
}

async function persistSets(exerciseId: string, sets: SetLog[]) {
  try {
    await setDoc(
      doc(db, 'exercise_sets', `${todayStr()}_${exerciseId}`),
      { exerciseId, date: todayStr(), sets, updatedAt: serverTimestamp() },
      { merge: true },
    )
  } catch { /* silencioso */ }
}

async function persistWeight(exerciseId: string, weight: number) {
  try {
    await setDoc(doc(db, 'exercise_weights', exerciseId), { weight, updatedAt: serverTimestamp() }, { merge: true })
  } catch { /* silencioso */ }
}

async function persistConfig(exerciseId: string, config: ExerciseConfig) {
  try {
    await setDoc(doc(db, 'exercise_config', exerciseId), config, { merge: true })
  } catch { /* silencioso */ }
}

async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const snap = await getDocs(collection(db, 'exercise_history'))
    return snap.docs
      .map((d) => d.data() as HistoryEntry)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 14)
  } catch {
    return []
  }
}

async function persistHistory(entry: HistoryEntry) {
  try {
    await setDoc(doc(db, 'exercise_history', entry.date), { ...entry, completedAt: serverTimestamp() })
  } catch { /* silencioso */ }
}

async function loadHandgripStartDate(): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'handgrip_config', 'meta'))
    return snap.exists() ? (snap.data().startDate as string) : null
  } catch { return null }
}

async function saveHandgripStartDate(date: string) {
  try {
    await setDoc(doc(db, 'handgrip_config', 'meta'), { startDate: date }, { merge: true })
  } catch { /* silencioso */ }
}

// ─── AI coach ─────────────────────────────────────────────────────────────────
async function callGemini(prompt: string): Promise<string> {
  if (!hasAnyAIKey()) throw new Error('Sin clave de IA. Configúrala en Ajustes.')
  return callAI(prompt)
}

// ─── Progression detection ────────────────────────────────────────────────────
function detectProgressionAlerts(history: HistoryEntry[], exercises: ExerciseDef[]): Set<string> {
  const alerts = new Set<string>()
  for (const ex of exercises) {
    const entries = history.filter((h) => h.exercises.some((e) => e.id === ex.id))
    if (entries.length < 4) continue
    const last4 = entries.slice(0, 4)
    const weights = last4.map((h) => h.exercises.find((e) => e.id === ex.id)?.weight ?? 0)
    const allSameWeight = weights.every((w) => w === weights[0]) && weights[0] > 0
    const allCompleted = last4.every((h) => {
      const e = h.exercises.find((x) => x.id === ex.id)
      return e && e.setsCompleted >= ex.defaultSets
    })
    if (allSameWeight && allCompleted) alerts.add(ex.id)
  }
  return alerts
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
      <div className="relative w-10 h-10 shrink-0">
        <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15" fill="none" stroke="#f59e0b" strokeWidth="3"
            strokeDasharray={`${circ}`} strokeDashoffset={`${circ * (1 - pct / 100)}`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-amber-400">{remaining}</span>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-white/35">Descanso</p>
        <p className="text-sm font-semibold text-white">{remaining}s restantes</p>
      </div>
      <button type="button" onClick={onSkip}
        className="flex items-center gap-1.5 rounded-xl bg-white/8 px-3 py-2 text-xs text-white/60 hover:bg-white/12 transition">
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
  dayProgram: DayProgram; setsLog: Record<string, SetLog[]>
  weights: Record<string, number>; aiMessage: string; onClose: () => void
}) {
  const totalSets = Object.values(setsLog).reduce((acc, s) => acc + s.filter((x) => x.done).length, 0)
  const maxWeight = Math.max(0, ...Object.keys(weights).map((id) => weights[id] ?? 0))
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-md rounded-3xl bg-[#1E1E28] border border-white/10 p-6">
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
            <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-purple-400 animate-spin shrink-0" />
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
  exercise: ExerciseDef; config: ExerciseConfig; sets: SetLog[]; weight: number
  progressionAlert: boolean; onSetsChange: (s: SetLog[]) => void
  onWeightChange: (w: number) => void; onSetDone: (secs: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const allDone = sets.length > 0 && sets.every((s) => s.done)
  const doneSets = sets.filter((s) => s.done).length
  const numSets = config.sets ?? exercise.defaultSets
  const numReps = config.reps ?? exercise.defaultReps
  const videoId = config.videoUrl ? getYouTubeId(config.videoUrl) : null

  const handleSetCheck = (idx: number) => {
    const wasNotDone = !sets[idx].done
    const updated = sets.map((s, i) => i === idx ? { ...s, done: !s.done } : s)
    onSetsChange(updated)
    if (wasNotDone) onSetDone(exercise.restSeconds)
  }

  const handleRepChange = (idx: number, val: string) =>
    onSetsChange(sets.map((s, i) => i === idx ? { ...s, reps: val } : s))

  const handleWeightInput = (idx: number, val: string) => {
    onSetsChange(sets.map((s, i) => i === idx ? { ...s, weight: val } : s))
    const num = parseFloat(val)
    if (!isNaN(num) && num > 0) onWeightChange(num)
  }

  const handleAI = async () => {
    setAiLoading(true); setAiText('')
    try {
      const done = sets.filter((s) => s.done).length
      const prompt = `Eres un entrenador personal experto en fuerza para principiantes. El usuario quiere consejos sobre: ${exercise.name} (${exercise.primaryMuscles.join(', ')}). Peso actual: ${weight > 0 ? weight + 'kg' : 'peso corporal'}. Series completadas: ${done}/${sets.length}. Error más común: ${exercise.commonErrors[0]}. Da un consejo MUY ESPECÍFICO y PRÁCTICO en 3-4 frases: 1) El error de técnica más importante a vigilar, 2) Cómo saber si está listo para subir peso, 3) Un truco mental que ayude. Responde en español, directo, como un entrenador real. Sin listas.`
      setAiText(await callGemini(prompt))
    } catch (e: unknown) {
      setAiText(e instanceof Error ? e.message : 'Error al contactar con el coach')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border overflow-hidden transition-colors duration-300 ${allDone ? 'border-emerald-500/30 bg-emerald-500/4' : 'border-white/8 bg-white/2'}`}>

      {/* ── Header (clickeable) ── */}
      <button type="button" onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/3 transition-colors">
        <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${allDone ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
          {allDone ? <Check size={16} className="text-emerald-400" /> : <Dumbbell size={15} className="text-white/35" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white/90 text-sm">{exercise.name}</p>
            {progressionAlert && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400 uppercase tracking-wider">↑ Subir peso</span>
            )}
          </div>
          <p className="text-xs text-white/35 truncate">{exercise.primaryMuscles.join(' · ')}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded-xl bg-blue-500/10 px-2 py-1 text-xs text-blue-300">{numSets}×{numReps}{exercise.repUnit === 'seg' ? 's' : ''}</span>
          <span className="rounded-xl bg-amber-500/10 px-2 py-1 text-xs text-amber-300 font-medium">
            {weight > 0 ? `${weight}kg` : 'PC'}
          </span>
          {expanded ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
        </div>
      </button>

      {/* Barra de progreso de series */}
      {doneSets > 0 && (
        <div className="mx-4 mb-2 h-0.5 rounded-full bg-white/8 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(doneSets / sets.length) * 100}%` }} />
        </div>
      )}

      {/* ── Cuerpo expandible ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-4">

              {/* Vídeo YouTube */}
              {videoId && (
                <div className="rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <iframe src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
                    title={exercise.name}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen className="w-full h-full border-0" />
                </div>
              )}

              {/* Instrucciones */}
              <div className="rounded-xl bg-white/4 border border-white/6 p-3">
                <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Técnica paso a paso</p>
                <ol className="space-y-2">
                  {exercise.instructions.map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-white/65">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/15 flex items-center justify-center text-[10px] font-bold text-blue-400">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Tip */}
              <div className="rounded-xl bg-amber-500/8 border border-amber-500/15 p-3 flex gap-2.5">
                <span className="text-base shrink-0 mt-0.5">💡</span>
                <p className="text-sm text-white/70 leading-relaxed">{exercise.tip}</p>
              </div>

              {/* Errores comunes */}
              <div className="rounded-xl bg-rose-500/6 border border-rose-500/12 p-3">
                <p className="text-[10px] uppercase tracking-widest text-rose-400/60 mb-2">Errores comunes</p>
                <ul className="space-y-1">
                  {exercise.commonErrors.map((err, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-white/55">
                      <span className="text-rose-400 shrink-0 mt-0.5">✕</span>{err}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Registro de series */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Registro de series</p>
                <div className="space-y-2">
                  {sets.map((s, idx) => (
                    <div key={idx} className={`flex items-center gap-2 rounded-xl p-2 transition-colors ${s.done ? 'bg-emerald-500/8' : 'bg-white/4'}`}>
                      <span className="text-xs text-white/30 w-6 text-center shrink-0">{idx + 1}</span>
                      <input type="number" inputMode="numeric" placeholder={String(numReps)} value={s.reps}
                        onChange={(e) => handleRepChange(idx, e.target.value)}
                        className="w-14 rounded-lg bg-white/8 border border-white/8 px-2 py-1.5 text-xs text-white/80 text-center focus:outline-none focus:border-white/25" />
                      <span className="text-xs text-white/25 shrink-0">{exercise.repUnit ?? 'rep'}</span>
                      {exercise.initialWeight > 0 && (
                        <>
                          <input type="number" inputMode="decimal" placeholder={String(weight)} value={s.weight}
                            onChange={(e) => handleWeightInput(idx, e.target.value)}
                            className="w-14 rounded-lg bg-white/8 border border-white/8 px-2 py-1.5 text-xs text-white/80 text-center focus:outline-none focus:border-white/25" />
                          <span className="text-xs text-white/25 shrink-0">kg</span>
                        </>
                      )}
                      <button type="button" onClick={() => handleSetCheck(idx)}
                        className={`ml-auto shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition ${s.done ? 'bg-emerald-500 text-white' : 'bg-white/8 text-white/30 hover:bg-white/14'}`}>
                        <Check size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coach IA */}
              <div>
                <button type="button" onClick={handleAI} disabled={aiLoading}
                  className="flex items-center gap-2 rounded-xl bg-purple-500/10 border border-purple-500/20 px-4 py-2.5 text-sm text-purple-300 hover:bg-purple-500/15 transition disabled:opacity-50">
                  <Sparkles size={14} />
                  {aiLoading ? 'Consultando coach...' : 'Coach IA — analizar técnica'}
                </button>
                <AnimatePresence>
                  {aiText && (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      className="mt-2 rounded-xl bg-purple-500/8 border border-purple-500/15 p-3 text-sm text-white/70 leading-relaxed">
                      {aiText}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <p className="text-[11px] text-white/20 italic">{exercise.progressionRule}</p>
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
                <span className="rounded-xl bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">{entry.maxWeight}kg máx</span>
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
function ProgramTab({ onSelect }: { onSelect: (idx: number) => void }) {
  const principles = [
    ['📈', 'Progresión de carga', 'Cuando completes 3×12 dos semanas seguidas, sube 0.5-1kg. Así construyes músculo de forma constante.'],
    ['🔁', 'Sobrecarga progresiva', 'El músculo solo crece si le das un estímulo mayor que la semana anterior. Más peso, reps o series.'],
    ['😴', 'Descanso = crecimiento', 'Los músculos no crecen durante el entreno, sino en las 48h después. El sueño y la proteína son parte del programa.'],
    ['🥩', 'Proteína es prioridad', 'Sin 150g de proteína al día, el entrenamiento produce menos resultados. Son inseparables.'],
    ['⏱️', 'Descanso entre series', '60-90 segundos. Ni muy poco (no te recuperas) ni demasiado (pierdes el estímulo metabólico).'],
  ]
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5">
        <h3 className="font-semibold text-white/90 mb-1">Tu programa — 4 días / semana</h3>
        <p className="text-sm text-white/45 mb-4">Diseñado para recomposición corporal con mancuernas en casa.</p>
        <div className="space-y-2">
          {PROGRAM.map((day, idx) => (
            day.type === 'workout' ? (
              <button key={day.day} type="button" onClick={() => onSelect(idx)}
                className="w-full flex items-center gap-3 rounded-xl p-3 bg-white/5 hover:bg-white/9 active:bg-white/12 transition text-left group">
                <span className="w-8 text-xs font-bold text-white/35 shrink-0">{day.shortLabel}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white/80 group-hover:text-white/95 transition">{day.focus}</p>
                  <p className="text-xs text-white/35 mt-0.5">{day.exercises.map((e) => e.name).join(' · ')}</p>
                </div>
                <ChevronDown size={14} className="text-white/25 group-hover:text-white/50 transition -rotate-90 shrink-0" />
              </button>
            ) : (
              <div key={day.day} className="flex items-start gap-3 rounded-xl p-3 bg-white/2">
                <span className="w-8 text-xs font-bold text-white/20 shrink-0 mt-0.5">{day.shortLabel}</span>
                <p className="text-sm text-white/25 mt-0.5">Descanso activo — recuperación</p>
              </div>
            )
          ))}
        </div>
      </div>
      <div className="rounded-2xl bg-[#1E1E28] border border-white/8 p-5">
        <h3 className="font-semibold text-white/90 mb-3">Principios del programa</h3>
        <div className="space-y-3">
          {principles.map(([ico, t, d]) => (
            <div key={t} className="flex items-start gap-3">
              <span className="text-lg shrink-0 mt-0.5">{ico}</span>
              <div>
                <p className="text-sm font-semibold text-white/80 mb-0.5">{t}</p>
                <p className="text-xs text-white/45 leading-relaxed">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── ConfigTab ────────────────────────────────────────────────────────────────
function ConfigTab({ dayProgram, configs, onSaveConfig }: {
  dayProgram: DayProgram; configs: Record<string, ExerciseConfig>
  onSaveConfig: (id: string, c: ExerciseConfig) => Promise<void>
}) {
  const [drafts, setDrafts] = useState<Record<string, { sets: string; reps: string; videoUrl: string }>>(() =>
    Object.fromEntries(dayProgram.exercises.map((ex) => [ex.id, {
      sets: String(configs[ex.id]?.sets ?? ex.defaultSets),
      reps: String(configs[ex.id]?.reps ?? ex.defaultReps),
      videoUrl: configs[ex.id]?.videoUrl ?? '',
    }]))
  )
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const update = (id: string, field: 'sets' | 'reps' | 'videoUrl', val: string) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }))

  const save = async (ex: ExerciseDef) => {
    setSaving(ex.id)
    const d = drafts[ex.id]
    await onSaveConfig(ex.id, {
      sets: parseInt(d.sets) || ex.defaultSets,
      reps: parseInt(d.reps) || ex.defaultReps,
      videoUrl: d.videoUrl.trim() || undefined,
    })
    setSaving(null); setSaved(ex.id)
    setTimeout(() => setSaved(null), 2000)
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-blue-500/8 border border-blue-500/15 p-3 text-xs text-blue-300/80 leading-relaxed">
        💡 Los cambios se guardan en Firebase y se aplican en el entrenamiento del día seleccionado. Añade URL de YouTube para ver el vídeo en la tarjeta expandida.
      </div>
      {dayProgram.exercises.map((ex) => (
        <div key={ex.id} className="rounded-2xl bg-[#1E1E28] border border-white/8 p-4">
          <p className="font-semibold text-white/90 text-sm mb-3">{ex.name}</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-white/30 mb-1 block">Series</label>
              <input type="number" value={drafts[ex.id]?.sets ?? ''}
                onChange={(e) => update(ex.id, 'sets', e.target.value)}
                className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/20" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-white/30 mb-1 block">Reps</label>
              <input type="number" value={drafts[ex.id]?.reps ?? ''}
                onChange={(e) => update(ex.id, 'reps', e.target.value)}
                className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/20" />
            </div>
          </div>
          <div className="mb-3">
            <label className="text-[10px] uppercase tracking-widest text-white/30 mb-1 flex items-center gap-1.5">
              <PlaySquare size={11} /> URL YouTube
            </label>
            <input type="url" placeholder="https://youtube.com/watch?v=..."
              value={drafts[ex.id]?.videoUrl ?? ''}
              onChange={(e) => update(ex.id, 'videoUrl', e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2 text-sm text-white/60 focus:outline-none focus:border-white/20" />
          </div>
          <button type="button" onClick={() => save(ex)} disabled={saving === ex.id}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition disabled:opacity-50">
            <Save size={12} />
            {saving === ex.id ? 'Guardando...' : saved === ex.id ? '✓ Guardado' : 'Guardar'}
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
  const [handgripWeek, setHandgripWeek] = useState(1)

  // ── Carga semana handgrip ──
  useEffect(() => {
    loadHandgripStartDate().then(date => {
      const start = date ?? todayStr()
      if (!date) saveHandgripStartDate(start)
      const msPerWeek = 7 * 24 * 60 * 60 * 1000
      const weeks = Math.floor((Date.now() - new Date(start).getTime()) / msPerWeek)
      setHandgripWeek(Math.max(1, weeks + 1))
    })
  }, [])

  // ── Carga de datos con manejo robusto de errores ──
  useEffect(() => {
    setShowDone(false)
    setWorkoutAiMessage('')
    if (dayProgram.type === 'rest') {
      setLoading(false)
      return
    }
    setLoading(true)
    ;(async () => {
      try {
        const [loadedConfigs, hist] = await Promise.all([
          loadConfigsForDay(dayProgram.exercises),
          loadHistory(),
        ])
        setConfigs(loadedConfigs)
        setHistory(hist)
        const loadedWeights = await loadWeightsForDay(dayProgram.exercises)
        const loadedSets = await loadSetsForDay(dayProgram.exercises, loadedConfigs, loadedWeights)
        setWeights(loadedWeights)
        setSetsLog(loadedSets)
        setProgressionAlerts(detectProgressionAlerts(hist, dayProgram.exercises))
      } catch (err) {
        console.error('Error cargando ejercicios:', err)
      } finally {
        // SIEMPRE desaparece el spinner, aunque falle Firebase
        setLoading(false)
      }
    })()
  }, [dayIdx])

  // Resumen semanal
  const weekSummary = (() => {
    const monday = getMondayStr()
    const thisWeek = history.filter((h) => h.date >= monday)
    return {
      workouts: thisWeek.length,
      totalSets: thisWeek.reduce((a, h) => a + h.totalSets, 0),
      maxWeight: Math.max(0, ...thisWeek.map((h) => h.maxWeight)),
    }
  })()

  // Progreso del día
  const dayProgress = (() => {
    if (dayProgram.type === 'rest' || dayProgram.exercises.length === 0) return 0
    const done = dayProgram.exercises.filter((ex) => {
      const s = setsLog[ex.id] ?? []
      return s.length > 0 && s.every((x) => x.done)
    }).length
    return Math.round((done / dayProgram.exercises.length) * 100)
  })()

  // Detectar entrenamiento completo
  useEffect(() => {
    if (loading || dayProgram.type === 'rest' || dayProgram.exercises.length === 0 || showDone) return
    const allDone = dayProgram.exercises.every((ex) => {
      const s = setsLog[ex.id] ?? []
      return s.length > 0 && s.every((x) => x.done)
    })
    if (!allDone) return

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
      `Entrenador personal. El usuario completó el entrenamiento de ${dayProgram.focus}: ${exercises.map((e) => `${e.name} ${e.setsCompleted}s ${e.weight > 0 ? e.weight + 'kg' : 'PC'}`).join(', ')}. Escribe un mensaje de cierre motivador y ÚTIL (2-3 frases). Incluye qué hacer las próximas horas para maximizar la recuperación (proteína, agua, sueño). Sé específico y personal.`
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

      {/* Resumen semanal */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatBox label="Esta semana" value={`${weekSummary.workouts} entrenos`} />
        <StatBox label="Series totales" value={String(weekSummary.totalSets)} />
        <StatBox label="Peso máximo" value={weekSummary.maxWeight > 0 ? `${weekSummary.maxWeight}kg` : '—'} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-white/5 p-1 mb-5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium transition ${activeTab === id ? 'bg-white/12 text-white' : 'text-white/40 hover:text-white/60'}`}>
            <Icon size={13} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab: Hoy ── */}
      {activeTab === 'workout' && (
        <div>
          {/* Selector de días */}
          <div className="grid grid-cols-7 gap-1 mb-4">
            {PROGRAM.map((day, idx) => (
              <button key={day.day} type="button" onClick={() => setDayIdx(idx)}
                className={`rounded-xl border py-2.5 text-xs font-medium transition ${
                  dayIdx === idx ? 'border-blue-500/40 bg-blue-500/10 text-white'
                  : day.type === 'rest' ? 'border-white/5 bg-white/2 text-white/25'
                  : 'border-white/8 bg-white/5 text-white/55 hover:border-white/14'
                }`}>
                {day.shortLabel}
              </button>
            ))}
          </div>

          {/* Info del día y barra de progreso */}
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
                <motion.div className="h-full bg-blue-500 rounded-full"
                  animate={{ width: `${dayProgress}%` }} transition={{ duration: 0.5 }} />
              </div>
            )}
          </div>

          {/* Día de descanso */}
          {dayProgram.type === 'rest' && (
            <div className="rounded-2xl border border-dashed border-white/8 p-10 text-center">
              <p className="text-3xl mb-3">😴</p>
              <p className="text-sm font-medium text-white/55">Día de descanso</p>
              <p className="text-xs text-white/30 mt-1 mb-4">El descanso es cuando los músculos CRECEN.</p>
              <div className="text-xs text-white/35 space-y-1 text-left max-w-xs mx-auto">
                <p>• Proteína: ≥150g para recuperación muscular</p>
                <p>• Agua: ≥2.5L para transportar nutrientes</p>
                <p>• Sueño: 7-8h mínimo — la hormona del crecimiento actúa de noche</p>
              </div>
            </div>
          )}

          {/* Spinner / Ejercicios */}
          {dayProgram.type === 'workout' && (
            loading ? (
              <div className="flex justify-center py-14">
                <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin" />
              </div>
            ) : (() => {
              const regularExs  = dayProgram.exercises.filter(e => !isHandgrip(e.id))
              const handgripExs = dayProgram.exercises.filter(e => isHandgrip(e.id))
              const hasHandgrip = handgripExs.length > 0
              const recWeight   = handgripWeightForWeek(handgripWeek)
              return (
                <div className="space-y-3">
                  {/* Banner padel / handgrip */}
                  {hasHandgrip && (
                    <div className="rounded-2xl bg-emerald-500/8 border border-emerald-500/20 p-4 flex gap-3">
                      <span className="text-xl shrink-0 mt-0.5">🎾</span>
                      <div>
                        <p className="text-sm text-white/75 leading-snug">El agarre fuerte mejora tu padel directamente — cada kg más de fuerza se nota en la pista</p>
                        <p className="text-xs text-emerald-400 mt-1.5 font-medium">
                          Semana {handgripWeek} del programa → <strong>{recWeight}kg recomendados</strong>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Ejercicios regulares */}
                  {regularExs.map((ex) => (
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

                  {/* Separador + sección handgrip */}
                  {hasHandgrip && (
                    <>
                      <div className="flex items-center gap-3 py-1">
                        <div className="flex-1 h-px bg-white/8" />
                        <span className="text-sm font-semibold text-white/50 px-1">💪 Handgrip</span>
                        <div className="flex-1 h-px bg-white/8" />
                      </div>
                      {handgripExs.map((ex) => (
                        <ExerciseCard
                          key={ex.id}
                          exercise={ex}
                          config={configs[ex.id] ?? {}}
                          sets={setsLog[ex.id] ?? []}
                          weight={weights[ex.id] ?? recWeight}
                          progressionAlert={progressionAlerts.has(ex.id)}
                          onSetsChange={(s) => handleSetsChange(ex.id, s)}
                          onWeightChange={(w) => handleWeightChange(ex.id, w)}
                          onSetDone={handleSetDone}
                        />
                      ))}
                    </>
                  )}
                </div>
              )
            })()
          )}
        </div>
      )}

      {activeTab === 'history' && <HistoryTab history={history} />}
      {activeTab === 'program' && (
        <ProgramTab onSelect={(idx) => { setDayIdx(idx); setActiveTab('workout') }} />
      )}
      {activeTab === 'config' && (
        dayProgram.type === 'workout' ? (
          <ConfigTab dayProgram={dayProgram} configs={configs} onSaveConfig={handleSaveConfig} />
        ) : (
          <div className="rounded-2xl border border-dashed border-white/8 p-10 text-center text-sm text-white/35">
            Selecciona un día de entrenamiento para configurar ejercicios.
          </div>
        )
      )}

      {/* Timer de descanso flotante */}
      <AnimatePresence>
        {restTimer && (
          <RestTimer key={restTimer.key} seconds={restTimer.seconds} onSkip={() => setRestTimer(null)} />
        )}
      </AnimatePresence>

      {/* Overlay fin de entrenamiento */}
      <AnimatePresence>
        {showDone && (
          <WorkoutDoneOverlay
            dayProgram={dayProgram} setsLog={setsLog} weights={weights}
            aiMessage={workoutAiMessage} onClose={() => setShowDone(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}
