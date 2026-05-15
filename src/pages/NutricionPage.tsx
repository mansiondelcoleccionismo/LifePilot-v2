import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PageHeader } from '@/components/layout/PageContainer'
import {
  Search, Flame, Loader2, Bot, Trash2, X, Camera, Check, RotateCcw,
  Star, ChevronDown, ChevronRight, Plus, Minus, ChevronLeft,
} from 'lucide-react'
import { addNutritionEntry, deleteNutritionEntry, subscribeNutritionEntries } from '@/services/nutrition.service'
import { searchFoods, type OpenFoodResult } from '@/services/openfoodfacts.service'
import { callAI, hasAnyAIKey } from '@/services/ai.service'
import { DAY_TARGETS, type DayType, type FoodEntry, type MealType } from '@/types/nutrition'
import { loadProfile, autoDetectDayType, getTargetForDayType, getDayLabel } from '@/services/metabolic.service'
import {
  initFavorites, getFavorites, addFavorite, removeFavorite, incrementUsage,
  sortByRelevance, type FoodFavorite,
} from '@/services/favorites.service'
import {
  loadPatternData, type PatternData, type FrequentFood, type FoodCombo,
} from '@/services/nutrition-patterns.service'
import type { UserProfile } from '@/types/profile'
import { NUTRITION_REFERENCE } from '@/data/nutrition-reference'

// ─── Meal config ─────────────────────────────────────────────────────────────
const MEALS: Array<{ value: MealType; label: string; emoji: string; hours: [number, number] }> = [
  { value: 'desayuno', label: 'Desayuno', emoji: '🌅', hours: [6,  10] },
  { value: 'almuerzo', label: 'Almuerzo', emoji: '🍎', hours: [10, 13] },
  { value: 'comida',   label: 'Comida',   emoji: '🍽️', hours: [13, 16] },
  { value: 'merienda', label: 'Merienda', emoji: '🫐', hours: [16, 19] },
  { value: 'cena',     label: 'Cena',     emoji: '🌙', hours: [19, 23] },
]

const MEAL_REMAP: Record<string, MealType> = {
  media_manana: 'almuerzo',
  snack:        'cena',
}

function getMealForTime(date = new Date()): MealType {
  const h = date.getHours()
  const m = MEALS.find(ml => h >= ml.hours[0] && h < ml.hours[1])
  return m?.value ?? 'cena'
}

function normalizeMeal(meal: string | undefined, date?: Date): MealType {
  if (!meal) return getMealForTime(date)
  return MEAL_REMAP[meal] ?? (meal as MealType)
}

function getMealLabel(meal: MealType) {
  return MEALS.find(m => m.value === meal) ?? MEALS[5]
}

function getDayTypeKey() {
  return `nutrition_daytype_${new Date().toISOString().split('T')[0]}`
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isToday(key: string): boolean {
  return key === dateKey(new Date())
}

function isYesterday(key: string): boolean {
  const y = new Date()
  y.setDate(y.getDate() - 1)
  return key === dateKey(y)
}

function formatDateLabel(key: string): string {
  if (isToday(key)) return 'Hoy'
  if (isYesterday(key)) return 'Ayer'
  const d = parseDateKey(key)
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

function noonOf(key: string): Date {
  const d = parseDateKey(key)
  d.setHours(13, 0, 0, 0)
  return d
}

// ─── Confirm food interface ────────────────────────────────────────────────
interface ConfirmFood {
  name: string
  brand?: string
  emoji?: string
  imageUrl?: string
  per100g: { kcal: number; protein: number; carbs: number; fat: number }
  defaultGrams: number
  isFavorite: boolean
  favoriteId?: string
}

// ─── Resize/encode for photo ─────────────────────────────────────────────────
async function resizeAndEncode(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1024
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('resize_failed')); return }
        const reader = new FileReader()
        reader.onload = () => resolve({ data: (reader.result as string).split(',')[1], mimeType: 'image/jpeg' })
        reader.onerror = reject
        reader.readAsDataURL(blob)
      }, 'image/jpeg', 0.85)
    }
    img.onerror = reject
    img.src = url
  })
}

interface PhotoFood { nombre: string; gramos: number; kcal: number; protein: number; carbs: number; fat: number }
interface PhotoResult { descripcion: string; alimentos: PhotoFood[]; totales: { kcal: number; protein: number; carbs: number; fat: number } }

function cleanJSON(text: string): string {
  return text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()
}

async function analyzePhoto(file: File): Promise<PhotoResult> {
  const { data, mimeType } = await resizeAndEncode(file)
  const prompt = `Analiza esta foto de comida. Identifica todos los alimentos visibles y estima las cantidades en gramos. Devuelve SOLO un JSON válido con este formato exacto, sin texto adicional:
{"descripcion":"descripción breve del plato","alimentos":[{"nombre":"nombre del alimento","gramos":0,"kcal":0,"protein":0,"carbs":0,"fat":0}],"totales":{"kcal":0,"protein":0,"carbs":0,"fat":0}}`
  const text = await callAI(prompt, { data, mimeType })
  const cleaned = cleanJSON(text)
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('NO_FOOD')
  try { return JSON.parse(match[0]) as PhotoResult }
  catch { throw new Error('PARSE_ERROR') }
}

// ─── AIFoodModal ─────────────────────────────────────────────────────────────
interface AIFoodResult {
  descripcion: string
  gramos_totales: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  desglose: Array<{ nombre: string; gramos: number; kcal: number; protein?: number; carbs?: number; fat?: number }>
}

function AIFoodModal({
  onClose, onAdded, targetDate,
}: {
  onClose: () => void
  onAdded?: () => void
  targetDate?: Date
}) {
  const [step, setStep] = useState<'input' | 'loading' | 'result' | 'error'>('input')
  const [input, setInput] = useState('')
  const [result, setResult] = useState<AIFoodResult | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState('')
  const [meal, setMeal] = useState<MealType>(getMealForTime())
  const [adding, setAdding] = useState(false)
  const hasKey = hasAnyAIKey()

  async function handleCalc() {
    if (!input.trim()) return
    setStep('loading')
    try {
      const refJson = JSON.stringify(NUTRITION_REFERENCE)
      const prompt =
`Eres un nutricionista experto con acceso a una base de datos nutricional verificada.
El usuario ha comido: ${input.trim()}

TABLA DE REFERENCIA REAL (macros por 100g, úsala siempre):
${refJson}

INSTRUCCIONES ESTRICTAS:
1. Identifica cada ingrediente y estima los gramos de forma REALISTA para una ración normal española
2. Usa SIEMPRE los valores de la tabla de referencia si el ingrediente aparece
3. Para ingredientes no en la tabla, usa valores conservadores basados en alimentos similares
4. Una ración normal de patatas fritas caseras para acompañar son 150-200g MÁXIMO
5. Un filete normal son 120-150g
6. Calcula multiplicando (gramos/100) × macros_por_100g
7. Sé conservador — es mejor quedarse corto que exagerar

Responde ÚNICAMENTE con JSON sin texto adicional:
{"descripcion":"nombre del plato","gramos_totales":0,"kcal":0,"protein":0,"carbs":0,"fat":0,"desglose":[{"nombre":"ingrediente","gramos":0,"kcal":0,"protein":0,"carbs":0,"fat":0}]}`

      const responseText = await callAI(prompt, undefined, true)

      let cleaned = cleanJSON(responseText)
      const first = cleaned.indexOf('{')
      const last  = cleaned.lastIndexOf('}')
      if (first === -1 || last === -1)
        throw new Error(`JSON no encontrado en respuesta: ${cleaned.slice(0, 200)}`)
      cleaned = cleaned.slice(first, last + 1)

      let parsed: AIFoodResult
      try {
        parsed = JSON.parse(cleaned) as AIFoodResult
      } catch (parseErr) {
        throw new Error(`Parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`)
      }

      const warns: string[] = []
      if (parsed.desglose?.length > 0) {
        const sumKcal    = parsed.desglose.reduce((s, d) => s + (d.kcal    ?? 0), 0)
        const sumProtein = parsed.desglose.reduce((s, d) => s + (d.protein ?? 0), 0)
        const sumCarbs   = parsed.desglose.reduce((s, d) => s + (d.carbs   ?? 0), 0)
        const sumFat     = parsed.desglose.reduce((s, d) => s + (d.fat     ?? 0), 0)
        if (parsed.kcal > 0 && Math.abs(sumKcal - parsed.kcal) / parsed.kcal > 0.2) {
          parsed = { ...parsed, kcal: Math.round(sumKcal), protein: Math.round(sumProtein * 10) / 10, carbs: Math.round(sumCarbs * 10) / 10, fat: Math.round(sumFat * 10) / 10 }
        }
      }
      if (parsed.kcal > 2000) warns.push('⚠️ Calorías muy altas, revisa el desglose')
      if (parsed.protein > 100) warns.push('⚠️ Proteína muy alta, revisa el desglose')

      setWarnings(warns)
      setResult(parsed)
      setStep('result')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg.includes('Sin créditos') || msg.includes('Groq') || msg.includes('Gemini') || msg.includes('HTTP')
        ? msg
        : `No he podido calcular los macros: ${msg}`)
      setStep('error')
    }
  }

  async function handleAdd() {
    if (!result) return
    setAdding(true)
    await addNutritionEntry(
      result.descripcion,
      Math.round(result.kcal),
      Math.round(result.protein * 10) / 10,
      Math.round(result.carbs * 10) / 10,
      Math.round(result.fat * 10) / 10,
      meal,
      targetDate,
    )
    setAdding(false)
    onAdded?.()
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="w-full max-w-md rounded-3xl bg-[#13131b] border border-white/10 overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/6 shrink-0">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/25">Gemini / Groq</p>
            <h3 className="text-base font-semibold text-white/90 mt-0.5">Calcular macros con IA</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition">
            <X size={15} className="text-white/60" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {step === 'input' && (
            <>
              {!hasKey && (
                <div className="rounded-xl bg-amber-500/8 border border-amber-500/15 p-3 text-sm text-amber-300/80">
                  Configura tu API key en Ajustes para usar esta función.
                </div>
              )}
              <p className="text-sm text-white/45">Describe lo que has comido en lenguaje natural:</p>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ej: 1 filete de pollo a la plancha con patatas fritas y ensalada"
                rows={3}
                autoFocus
                className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-violet-500/40 resize-none"
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCalc() }}
              />
              <button onClick={handleCalc} disabled={!hasKey || !input.trim()}
                className="w-full rounded-2xl bg-violet-600 py-3.5 text-sm font-semibold text-white hover:bg-violet-500 transition disabled:opacity-35 flex items-center justify-center gap-2">
                <Bot size={15} /> Calcular macros
              </button>
            </>
          )}

          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 size={30} className="text-violet-400 animate-spin" />
              <p className="text-sm text-white/50">Calculando macros…</p>
            </div>
          )}

          {step === 'result' && result && (
            <>
              <div className="rounded-xl bg-violet-500/8 border border-violet-500/15 p-3">
                <p className="text-[10px] uppercase tracking-widest text-violet-400/60 mb-1">Plato detectado</p>
                <p className="text-sm text-white/85 font-medium">{result.descripcion}</p>
                {result.gramos_totales > 0 && (
                  <p className="text-[11px] text-white/35 mt-0.5">{result.gramos_totales}g total estimado</p>
                )}
              </div>

              {warnings.length > 0 && (
                <div className="space-y-1.5">
                  {warnings.map((w, i) => (
                    <div key={i} className="rounded-xl bg-amber-500/8 border border-amber-500/20 px-3 py-2 text-xs text-amber-300/85">{w}</div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-4 gap-2">
                {[
                  { l: 'Kcal',  v: String(Math.round(result.kcal)),  c: 'text-orange-400', bg: 'bg-orange-500/8 border-orange-500/15' },
                  { l: 'Prot',  v: `${Math.round(result.protein)}g`, c: 'text-blue-400',   bg: 'bg-blue-500/8 border-blue-500/15' },
                  { l: 'Carbs', v: `${Math.round(result.carbs)}g`,   c: 'text-amber-400',  bg: 'bg-amber-500/8 border-amber-500/15' },
                  { l: 'Grasa', v: `${Math.round(result.fat)}g`,     c: 'text-rose-400',   bg: 'bg-rose-500/8 border-rose-500/15' },
                ].map(m => (
                  <div key={m.l} className={`rounded-xl border p-2.5 text-center ${m.bg}`}>
                    <p className={`text-sm font-bold ${m.c}`}>{m.v}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{m.l}</p>
                  </div>
                ))}
              </div>

              {result.desglose.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Desglose</p>
                  <div className="space-y-1.5">
                    {result.desglose.map((ing, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/3 border border-white/5">
                        <div>
                          <p className="text-sm text-white/75">{ing.nombre}</p>
                          <p className="text-[11px] text-white/35">{ing.gramos}g</p>
                        </div>
                        <span className="text-xs font-semibold text-orange-400">{Math.round(ing.kcal)} kcal</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Añadir a</p>
                <div className="flex gap-1.5 flex-wrap">
                  {MEALS.map(m => (
                    <button key={m.value} onClick={() => setMeal(m.value)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${meal === m.value ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300' : 'bg-white/4 border border-white/8 text-white/50 hover:border-white/14'}`}>
                      {m.emoji} {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 'error' && (
            <div className="text-center py-8 space-y-4">
              <div className="text-5xl">🤔</div>
              <p className="text-sm text-white/60 leading-relaxed px-2">{error}</p>
              <button onClick={() => { setStep('input'); setError('') }}
                className="inline-flex items-center gap-2 rounded-xl bg-white/8 border border-white/10 px-4 py-2.5 text-sm text-white/55">
                <RotateCcw size={14} /> Reintentar
              </button>
            </div>
          )}
        </div>

        {step === 'result' && (
          <div className="px-5 pb-5 pt-2 shrink-0 border-t border-white/5">
            <button onClick={handleAdd} disabled={adding}
              className="w-full rounded-2xl bg-emerald-600 py-3.5 text-sm font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-40 flex items-center justify-center gap-2">
              {adding && <Loader2 size={14} className="animate-spin" />}
              {adding ? 'Añadiendo...' : 'Añadir al día'}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ─── PhotoModal ───────────────────────────────────────────────────────────────
function PhotoModal({
  onClose, onAdded, onAddedMeal, targetDate,
}: {
  onClose: () => void
  onAdded?: () => void
  onAddedMeal: MealType
  targetDate?: Date
}) {
  const [step, setStep] = useState<'select' | 'preview' | 'analyzing' | 'result' | 'error'>('select')
  const [file, setFile]       = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult]   = useState<PhotoResult | null>(null)
  const [error, setError]     = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [adding, setAdding]   = useState(false)
  const [meal, setMeal]       = useState<MealType>(onAddedMeal)
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef   = useRef<HTMLInputElement>(null)
  const hasKey    = hasAnyAIKey()

  function handleFile(f: File) { setFile(f); setPreview(URL.createObjectURL(f)); setStep('preview') }

  async function handleAnalyze() {
    if (!file) return
    setStep('analyzing')
    try {
      const r = await analyzePhoto(file)
      setResult(r)
      setChecked(new Set(r.alimentos.map((_, i) => i)))
      setStep('result')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg === 'NO_FOOD' || msg === 'PARSE_ERROR'
        ? 'No he podido identificar los alimentos. Intenta con mejor iluminación.'
        : msg.includes('Sin créditos')
          ? 'Sin créditos de IA. Configura más API keys en Ajustes.'
          : `Error: ${msg}`)
      setStep('error')
    }
  }

  async function handleAdd() {
    if (!result) return
    setAdding(true)
    for (const [i, food] of result.alimentos.entries()) {
      if (!checked.has(i)) continue
      await addNutritionEntry(
        `${food.nombre} (${food.gramos}g)`,
        Math.round(food.kcal),
        Math.round(food.protein * 10) / 10,
        Math.round(food.carbs * 10) / 10,
        Math.round(food.fat * 10) / 10,
        meal,
        targetDate,
      )
    }
    setAdding(false)
    onAdded?.()
    onClose()
  }

  const toggleCheck = (i: number) =>
    setChecked(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s })

  const selTotals = useMemo(() => {
    if (!result) return null
    return result.alimentos.filter((_, i) => checked.has(i)).reduce(
      (a, f) => ({ kcal: a.kcal + f.kcal, protein: a.protein + f.protein, carbs: a.carbs + f.carbs, fat: a.fat + f.fat }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    )
  }, [result, checked])

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="w-full max-w-md rounded-3xl bg-[#13131b] border border-white/10 overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/6 shrink-0">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/25">Gemini Vision</p>
            <h3 className="text-base font-semibold text-white/90 mt-0.5">Analizar plato</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition">
            <X size={15} className="text-white/60" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {step === 'select' && (
            <>
              {!hasKey && (
                <div className="rounded-xl bg-amber-500/8 border border-amber-500/15 p-3 text-sm text-amber-300/80">
                  Configura tu API key de Gemini en Ajustes para usar esta función.
                </div>
              )}
              <p className="text-sm text-white/45 text-center pt-2">¿Cómo quieres añadir la foto?</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => cameraRef.current?.click()} disabled={!hasKey}
                  className="flex flex-col items-center gap-3 rounded-2xl border border-white/8 bg-white/4 p-6 hover:bg-white/8 transition disabled:opacity-35">
                  <span className="text-4xl">📷</span>
                  <span className="text-sm font-medium text-white/75">Hacer foto</span>
                </button>
                <button onClick={() => fileRef.current?.click()} disabled={!hasKey}
                  className="flex flex-col items-center gap-3 rounded-2xl border border-white/8 bg-white/4 p-6 hover:bg-white/8 transition disabled:opacity-35">
                  <span className="text-4xl">🖼️</span>
                  <span className="text-sm font-medium text-white/75">Galería</span>
                </button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </>
          )}

          {step === 'preview' && preview && (
            <>
              <div className="rounded-2xl overflow-hidden"><img src={preview} alt="" className="w-full object-cover max-h-60" /></div>
              <button onClick={handleAnalyze}
                className="w-full rounded-2xl bg-violet-600 py-3.5 text-sm font-semibold text-white hover:bg-violet-500 transition flex items-center justify-center gap-2">
                <Bot size={15} /> Analizar con IA
              </button>
              <button onClick={() => { setStep('select'); setPreview(null); setFile(null) }}
                className="w-full rounded-2xl border border-white/8 bg-white/4 py-2.5 text-sm text-white/40 hover:text-white/65 transition">
                Cambiar foto
              </button>
            </>
          )}

          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              {preview && <div className="w-20 h-20 rounded-2xl overflow-hidden opacity-55"><img src={preview} alt="" className="w-full h-full object-cover" /></div>}
              <Loader2 size={30} className="text-violet-400 animate-spin" />
              <p className="text-sm text-white/60">Analizando tu plato...</p>
            </div>
          )}

          {step === 'result' && result && (
            <>
              <div className="rounded-xl bg-violet-500/8 border border-violet-500/15 p-3">
                <p className="text-[10px] uppercase tracking-widest text-violet-400/60 mb-1">Detectado</p>
                <p className="text-sm text-white/80">{result.descripcion}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Añadir a</p>
                <div className="flex gap-1.5 flex-wrap">
                  {MEALS.map(m => (
                    <button key={m.value} onClick={() => setMeal(m.value)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${meal === m.value ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300' : 'bg-white/4 border border-white/8 text-white/50 hover:border-white/14'}`}>
                      {m.emoji} {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Alimentos</p>
                <div className="space-y-2">
                  {result.alimentos.map((food, i) => (
                    <button key={i} onClick={() => toggleCheck(i)}
                      className={`w-full text-left rounded-xl border p-3 transition ${checked.has(i) ? 'border-emerald-500/25 bg-emerald-500/8' : 'border-white/6 bg-white/3 opacity-45'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${checked.has(i) ? 'bg-emerald-500 border-emerald-500' : 'bg-white/8 border-white/15'}`}>
                          {checked.has(i) && <Check size={11} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-white/85 truncate">{food.nombre}</p>
                            <span className="text-xs text-white/35 shrink-0">{food.gramos}g</span>
                          </div>
                          <div className="flex gap-3 mt-0.5">
                            <span className="text-[11px] text-orange-400">{Math.round(food.kcal)} kcal</span>
                            <span className="text-[11px] text-blue-400">P {Math.round(food.protein)}g</span>
                            <span className="text-[11px] text-amber-400">C {Math.round(food.carbs)}g</span>
                            <span className="text-[11px] text-rose-400">G {Math.round(food.fat)}g</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              {selTotals && checked.size > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { l: 'Kcal', v: Math.round(selTotals.kcal), c: 'text-orange-400' },
                    { l: 'Prot', v: `${Math.round(selTotals.protein)}g`, c: 'text-blue-400' },
                    { l: 'Carbs', v: `${Math.round(selTotals.carbs)}g`, c: 'text-amber-400' },
                    { l: 'Grasa', v: `${Math.round(selTotals.fat)}g`, c: 'text-rose-400' },
                  ].map(m => (
                    <div key={m.l} className="rounded-xl bg-white/5 p-2.5 text-center">
                      <p className={`text-sm font-bold ${m.c}`}>{m.v}</p>
                      <p className="text-[10px] text-white/30 mt-0.5">{m.l}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 'error' && (
            <div className="text-center py-8 space-y-4">
              <div className="text-5xl">😕</div>
              <p className="text-sm text-white/60 leading-relaxed px-2">{error}</p>
              {!error.includes('Ajustes') && (
                <button onClick={() => { setStep('preview'); setError('') }}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/8 border border-white/10 px-4 py-2.5 text-sm text-white/55">
                  <RotateCcw size={14} /> Reintentar
                </button>
              )}
            </div>
          )}
        </div>

        {step === 'result' && (
          <div className="px-5 pb-5 pt-2 space-y-2 shrink-0 border-t border-white/5">
            <button onClick={handleAdd} disabled={adding || checked.size === 0}
              className="w-full rounded-2xl bg-emerald-600 py-3.5 text-sm font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-40 flex items-center justify-center gap-2">
              {adding && <Loader2 size={14} className="animate-spin" />}
              {adding ? 'Añadiendo...' : `Añadir ${checked.size} alimento${checked.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ─── MacroBar ─────────────────────────────────────────────────────────────────
function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-xs">
        <span className="text-white/50">{label}</span>
        <span className="text-white/70 font-medium">{value}<span className="text-white/30">/{target}g</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }}
          className={`h-full rounded-full ${color}`} />
      </div>
      <p className="text-[10px] text-white/25 mt-1 text-right">{pct}%</p>
    </div>
  )
}

// ─── FoodImage helper ─────────────────────────────────────────────────────────
function FoodThumb({ imageUrl, emoji, size = 'sm' }: { imageUrl?: string; emoji?: string; size?: 'sm' | 'lg' }) {
  const [err, setErr] = useState(false)
  const dim = size === 'lg' ? 'w-16 h-16 text-4xl' : 'w-10 h-10 text-2xl'
  if (imageUrl && !err) {
    return (
      <img src={imageUrl} alt="" onError={() => setErr(true)}
        className={`${size === 'lg' ? 'w-16 h-16' : 'w-10 h-10'} rounded-xl object-cover shrink-0 bg-white/5`} />
    )
  }
  return <div className={`${dim} rounded-xl bg-white/8 flex items-center justify-center shrink-0`}>{emoji ?? '🍽️'}</div>
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────
function ConfirmModal({
  food, onClose, onAdded, favorites, onFavoritesChange, targetDate,
}: {
  food: ConfirmFood
  onClose: () => void
  onAdded: () => void
  favorites: FoodFavorite[]
  onFavoritesChange: () => void
  targetDate?: Date
}) {
  const [grams, setGrams] = useState(food.defaultGrams.toString())
  const [meal, setMeal] = useState<MealType>(getMealForTime())
  const [adding, setAdding] = useState(false)
  const [savingFav, setSavingFav] = useState(false)
  const [isFav, setIsFav] = useState(food.isFavorite)
  const [favId, setFavId] = useState(food.favoriteId)

  const macros = useMemo(() => {
    const g = Number(grams)
    if (!g || g <= 0) return null
    const ratio = g / 100
    return {
      kcal:    Math.round(food.per100g.kcal    * ratio),
      protein: Math.round(food.per100g.protein * ratio * 10) / 10,
      carbs:   Math.round(food.per100g.carbs   * ratio * 10) / 10,
      fat:     Math.round(food.per100g.fat     * ratio * 10) / 10,
    }
  }, [grams, food])

  function adjustGrams(delta: number) {
    const cur = Number(grams) || 0
    setGrams(String(Math.max(1, Math.round((cur + delta) / 5) * 5)))
  }

  async function handleAdd() {
    if (!macros) return
    setAdding(true)
    const name = Number(grams) !== food.defaultGrams
      ? `${food.name} (${grams}g)` : food.name
    await addNutritionEntry(name, macros.kcal, macros.protein, macros.carbs, macros.fat, meal, targetDate)
    if (favId) {
      localStorage.setItem(`lp_lastgrams_${favId}`, grams)
      await incrementUsage(favId)
    }
    setAdding(false)
    onAdded()
    onClose()
  }

  async function handleToggleFav() {
    setSavingFav(true)
    if (isFav && favId) {
      await removeFavorite(favId)
      setIsFav(false)
      setFavId(undefined)
    } else {
      const id = await addFavorite({
        name: food.name,
        emoji: food.emoji ?? '🍽️',
        category: '',
        imageUrl: food.imageUrl,
        per100g: food.per100g,
        defaultGrams: Number(grams) || food.defaultGrams,
      })
      setIsFav(true)
      setFavId(id)
    }
    onFavoritesChange()
    setSavingFav(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 48 }}
        transition={{ type: 'spring', damping: 28, stiffness: 340 }}
        className="w-full sm:max-w-sm bg-[#13131b] rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/10 overflow-hidden"
      >
        <div className="flex items-center gap-4 px-5 pt-6 pb-4">
          <FoodThumb imageUrl={food.imageUrl} emoji={food.emoji} size="lg" />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-white/90 leading-snug">{food.name}</h3>
            {food.brand && <p className="text-xs text-white/35 mt-0.5">{food.brand}</p>}
            {macros && (
              <p className="text-xs text-white/45 mt-1">
                <span className="text-orange-400 font-semibold">{macros.kcal} kcal</span>
                <span className="text-white/30"> · P {macros.protein}g · C {macros.carbs}g · G {macros.fat}g</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center shrink-0">
            <X size={15} className="text-white/60" />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Cantidad</p>
            <div className="flex items-center gap-3">
              <button onClick={() => adjustGrams(-10)}
                className="w-10 h-10 rounded-xl bg-white/6 hover:bg-white/10 flex items-center justify-center transition">
                <Minus size={16} className="text-white/60" />
              </button>
              <div className="flex-1 relative">
                <input
                  value={grams}
                  onChange={(e) => setGrams(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  className="w-full rounded-xl bg-white/6 border border-white/8 px-3 py-2.5 text-center text-lg font-semibold text-white/90 focus:outline-none focus:border-blue-500/40"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/35">g</span>
              </div>
              <button onClick={() => adjustGrams(10)}
                className="w-10 h-10 rounded-xl bg-white/6 hover:bg-white/10 flex items-center justify-center transition">
                <Plus size={16} className="text-white/60" />
              </button>
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {[food.defaultGrams, 50, 100, 150, 200].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).slice(0, 5).map(g => (
                <button key={g} onClick={() => setGrams(String(g))}
                  className={`rounded-lg px-2.5 py-1 text-xs transition ${Number(grams) === g ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-white/4 text-white/40 hover:text-white/60 border border-white/6'}`}>
                  {g}g
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Comida</p>
            <div className="flex gap-1.5 flex-wrap">
              {MEALS.map(m => (
                <button key={m.value} onClick={() => setMeal(m.value)}
                  className={`rounded-xl px-2.5 py-1.5 text-xs font-medium transition ${meal === m.value ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300' : 'bg-white/4 border border-white/6 text-white/50 hover:border-white/12'}`}>
                  {m.emoji} {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={handleAdd} disabled={adding || !macros}
              className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition disabled:opacity-40 flex items-center justify-center gap-2">
              {adding && <Loader2 size={13} className="animate-spin" />}
              Añadir al día
            </button>
            <button onClick={handleToggleFav} disabled={savingFav}
              className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition ${isFav ? 'bg-amber-500/15 border-amber-500/30' : 'bg-white/4 border-white/8 hover:border-white/14'}`}>
              {savingFav ? <Loader2 size={15} className="animate-spin text-white/40" /> : <Star size={15} className={isFav ? 'fill-amber-400 text-amber-400' : 'text-white/40'} />}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── SuggestionsBanner ────────────────────────────────────────────────────────
function SuggestionsBanner({
  patternData, dayType, proteinTarget, onAddFoods, onGoToYesterday, onDismiss,
}: {
  patternData: PatternData
  dayType: DayType
  proteinTarget: number
  onAddFoods: (foods: FrequentFood[], meal: MealType) => Promise<void>
  onGoToYesterday: (meal?: MealType) => void
  onDismiss: () => void
}) {
  const [adding, setAdding] = useState(false)
  const hour = new Date().getHours()

  const hadMorningYesterday =
    patternData.yesterdayMeals.has('desayuno') || patternData.yesterdayMeals.has('almuerzo')
  const missedCena =
    hadMorningYesterday &&
    !patternData.yesterdayMeals.has('cena') &&
    patternData.frequentFoods.cena.length >= 2

  const breakfastFoods = patternData.frequentFoods.desayuno.slice(0, 3)
  const yesterdayComida = patternData.yesterdayByMeal.comida

  type BannerCase = 'missing_meal' | 'breakfast' | 'yesterday_comida' | 'training'
  let activeCase: BannerCase | null = null
  if (missedCena) activeCase = 'missing_meal'
  else if (hour >= 8 && hour < 10 && breakfastFoods.length >= 2) activeCase = 'breakfast'
  else if (hour >= 13 && hour < 15 && yesterdayComida.length > 0) activeCase = 'yesterday_comida'
  else if (dayType === 'volumen') activeCase = 'training'

  if (!activeCase) return null

  const foodSummary = (foods: Array<{ name: string }>) => {
    const names = foods.slice(0, 2).map(f => f.name)
    return names.join(', ') + (foods.length > 2 ? '…' : '')
  }

  async function handleAddBreakfast() {
    setAdding(true)
    await onAddFoods(breakfastFoods, 'desayuno')
    setAdding(false)
    onDismiss()
  }

  async function handleAddYesterdayComida() {
    setAdding(true)
    const foods: FrequentFood[] = yesterdayComida.map(e => ({
      name: e.name, count: 1,
      avgKcal: e.kcal, avgProtein: e.protein, avgCarbs: e.carbs, avgFat: e.fat,
    }))
    await onAddFoods(foods, 'comida')
    setAdding(false)
    onDismiss()
  }

  const bannerStyles: Record<BannerCase, string> = {
    missing_meal: 'border-amber-500/20 bg-amber-500/5',
    breakfast: 'border-blue-500/20 bg-blue-500/5',
    yesterday_comida: 'border-emerald-500/20 bg-emerald-500/5',
    training: 'border-violet-500/20 bg-violet-500/5',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
      className={`rounded-2xl border p-4 mb-4 relative ${bannerStyles[activeCase]}`}
    >
      <button onClick={onDismiss}
        className="absolute top-3 right-3 w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition">
        <X size={11} className="text-white/40" />
      </button>

      {activeCase === 'missing_meal' && (
        <div>
          <p className="text-sm font-semibold text-amber-300 pr-8">⚠️ Ayer no registraste la cena</p>
          <p className="text-xs text-white/40 mt-0.5">¿La añades ahora?</p>
          <button onClick={() => { onGoToYesterday('cena'); onDismiss() }}
            className="mt-3 rounded-xl bg-amber-500/15 border border-amber-500/25 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/25 transition">
            Añadir cena de ayer
          </button>
        </div>
      )}

      {activeCase === 'breakfast' && (
        <div>
          <p className="text-sm font-semibold text-blue-200 pr-8">☕ Tu desayuno habitual</p>
          <p className="text-xs text-white/40 mt-0.5">{foodSummary(breakfastFoods)}</p>
          <button onClick={handleAddBreakfast} disabled={adding}
            className="mt-3 rounded-xl bg-blue-600/15 border border-blue-500/25 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-600/25 transition flex items-center gap-1.5">
            {adding && <Loader2 size={11} className="animate-spin" />}
            Añadir todo
          </button>
        </div>
      )}

      {activeCase === 'yesterday_comida' && (
        <div>
          <p className="text-sm font-semibold text-emerald-200 pr-8">🍽️ Ayer comiste {foodSummary(yesterdayComida)}</p>
          <p className="text-xs text-white/40 mt-0.5">¿Lo mismo hoy?</p>
          <div className="flex gap-2 mt-3">
            <button onClick={handleAddYesterdayComida} disabled={adding}
              className="rounded-xl bg-emerald-600/15 border border-emerald-500/25 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-600/25 transition flex items-center gap-1.5">
              {adding && <Loader2 size={11} className="animate-spin" />}
              Sí, añadir
            </button>
            <button onClick={onDismiss}
              className="rounded-xl bg-white/5 border border-white/8 px-3 py-1.5 text-xs text-white/40 hover:text-white/60 transition">
              No, buscar otro
            </button>
          </div>
        </div>
      )}

      {activeCase === 'training' && (
        <div>
          <p className="text-sm font-semibold text-violet-200 pr-8">💪 Día de entreno</p>
          <p className="text-xs text-white/40 mt-0.5">
            Objetivo de hoy: <span className="text-blue-400 font-medium">{proteinTarget}g</span> de proteína
          </p>
          <button onClick={onDismiss}
            className="mt-3 rounded-xl bg-violet-600/15 border border-violet-500/25 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-600/25 transition">
            Entendido
          </button>
        </div>
      )}
    </motion.div>
  )
}

// ─── DAY_TYPE options ─────────────────────────────────────────────────────────
const DAY_TYPE_OPTIONS: Array<{ value: DayType; label: string; emoji: string }> = [
  { value: 'normal',   label: 'Normal',   emoji: '⚖️' },
  { value: 'volumen',  label: 'Volumen',  emoji: '💪' },
  { value: 'deficit',  label: 'Déficit',  emoji: '🔥' },
  { value: 'descanso', label: 'Descanso', emoji: '😴' },
]

// ─── NutricionPage ────────────────────────────────────────────────────────────
export function NutricionPage() {
  // ── Date state ────────────────────────────────────────────────────────────
  const [selectedDateKey, setSelectedDateKey] = useState(() => dateKey(new Date()))
  const todayBool = isToday(selectedDateKey)
  const entryDate = todayBool ? undefined : noonOf(selectedDateKey)

  // ── Core state ────────────────────────────────────────────────────────────
  const [entries, setEntries]       = useState<FoodEntry[]>([])
  const [loading, setLoading]       = useState(true)
  const [favorites, setFavorites]   = useState<FoodFavorite[]>([])
  const [showAllFavs, setShowAllFavs] = useState(false)
  const [profile, setProfile]       = useState<UserProfile | null>(null)
  const [patternData, setPatternData] = useState<PatternData | null>(null)
  const [toast, setToast]           = useState<string | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [addingCombo, setAddingCombo] = useState<string | null>(null)

  const [dayType, setDayType] = useState<DayType>(() =>
    (localStorage.getItem(getDayTypeKey()) as DayType) ?? 'normal'
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [offResults, setOffResults]   = useState<OpenFoodResult[]>([])
  const [searching, setSearching]     = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [confirmFood, setConfirmFood] = useState<ConfirmFood | null>(null)
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [showAIModal, setShowAIModal] = useState(false)
  const [expandedMeals, setExpandedMeals] = useState<Set<MealType>>(
    () => new Set<MealType>(['desayuno', 'almuerzo', 'cena'])
  )

  // ── Toast auto-dismiss ────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // ── Load profile + favorites ──────────────────────────────────────────────
  useEffect(() => {
    const p = loadProfile()
    setProfile(p)
    const saved = localStorage.getItem(getDayTypeKey()) as DayType | null
    if (!saved) setDayType(autoDetectDayType(p))
    initFavorites().then(() =>
      getFavorites().then(favs => setFavorites(sortByRelevance(favs)))
    )
  }, [])

  // ── Load pattern data once ────────────────────────────────────────────────
  useEffect(() => {
    loadPatternData().then(data => setPatternData(data)).catch(() => {})
  }, [])

  const reloadFavorites = () =>
    getFavorites().then(favs => setFavorites(sortByRelevance(favs)))

  // ── Entries subscription (re-runs on date change) ─────────────────────────
  useEffect(() => {
    setLoading(true)
    const d = parseDateKey(selectedDateKey)
    const unsub = subscribeNutritionEntries(data => { setEntries(data); setLoading(false) }, d)
    return () => unsub()
  }, [selectedDateKey])

  // ── Auto-expand meal with entries ─────────────────────────────────────────
  useEffect(() => {
    if (!entries.length) return
    const activeMeals = new Set(entries.map(e => normalizeMeal(e.meal, e.createdAt)))
    setExpandedMeals(prev => new Set([...prev, ...activeMeals]))
  }, [entries.length])

  // ── Targets ───────────────────────────────────────────────────────────────
  const target = useMemo(() => {
    if (profile) return getTargetForDayType(profile, dayType)
    return DAY_TARGETS[dayType]
  }, [profile, dayType])

  const totals = useMemo(() =>
    entries.reduce((a, e) => ({ kcal: a.kcal + e.kcal, protein: a.protein + e.protein, carbs: a.carbs + e.carbs, fat: a.fat + e.fat }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 }), [entries])

  const kcalPct = target.kcal > 0 ? Math.min(100, (totals.kcal / target.kcal) * 100) : 0

  // ── Search ────────────────────────────────────────────────────────────────
  const filteredFavs = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return favorites.filter(f => f.name.toLowerCase().includes(q) || f.category?.toLowerCase().includes(q))
  }, [searchQuery, favorites])

  function handleSearchInput(value: string) {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) { setOffResults([]); setSearching(false); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const results = await searchFoods(value)
      setOffResults(results)
      setSearching(false)
    }, 500)
  }

  // ── Open confirm ──────────────────────────────────────────────────────────
  function openFavorite(fav: FoodFavorite) {
    const lastG = localStorage.getItem(`lp_lastgrams_${fav.id}`)
    setConfirmFood({
      name: fav.name, emoji: fav.emoji, imageUrl: fav.imageUrl,
      per100g: fav.per100g, defaultGrams: (lastG ? Number(lastG) : null) || fav.defaultGrams,
      isFavorite: true, favoriteId: fav.id,
    })
  }

  function openFoodResult(r: OpenFoodResult) {
    const existing = favorites.find(f => f.name.toLowerCase() === r.name.toLowerCase())
    setConfirmFood({
      name: r.name, brand: r.brand, imageUrl: r.imageUrl,
      per100g: r.per100g, defaultGrams: 100,
      isFavorite: !!existing, favoriteId: existing?.id,
    })
  }

  // ── Grouped entries ───────────────────────────────────────────────────────
  const entriesByMeal = useMemo(() => {
    const groups = Object.fromEntries(MEALS.map(m => [m.value, [] as FoodEntry[]])) as Record<MealType, FoodEntry[]>
    entries.forEach(e => {
      const meal = normalizeMeal(e.meal, e.createdAt)
      groups[meal]?.push(e)
    })
    return groups
  }, [entries])

  function toggleMeal(meal: MealType) {
    setExpandedMeals(prev => { const s = new Set(prev); s.has(meal) ? s.delete(meal) : s.add(meal); return s })
  }

  function handleDayTypeChange(dt: DayType) {
    setDayType(dt)
    localStorage.setItem(getDayTypeKey(), dt)
  }

  // ── Date navigation ───────────────────────────────────────────────────────
  function navigateDate(delta: number) {
    setSelectedDateKey(prev => {
      const d = parseDateKey(prev)
      d.setDate(d.getDate() + delta)
      const newKey = dateKey(d)
      if (newKey > dateKey(new Date())) return prev
      return newKey
    })
  }

  function goToYesterday(meal?: MealType) {
    const y = new Date()
    y.setDate(y.getDate() - 1)
    setSelectedDateKey(dateKey(y))
    if (meal) {
      setTimeout(() => {
        setExpandedMeals(prev => new Set([...prev, meal]))
      }, 300)
    }
  }

  // ── Add foods helper (for suggestions + combos) ───────────────────────────
  async function addFoodsToDay(foods: FrequentFood[], meal: MealType, date?: Date) {
    await Promise.all(
      foods.map(f =>
        addNutritionEntry(f.name, f.avgKcal, f.avgProtein, f.avgCarbs, f.avgFat, meal, date)
      )
    )
  }

  async function handleSuggestionAddFoods(foods: FrequentFood[], meal: MealType) {
    await addFoodsToDay(foods, meal)
    setToast(`Añadido a ${getMealLabel(meal)?.label ?? meal}`)
  }

  async function handleAddCombo(combo: FoodCombo) {
    setAddingCombo(combo.id)
    await addFoodsToDay(combo.foods, combo.meal, entryDate)
    setAddingCombo(null)
    const mealLabel = getMealLabel(combo.meal)?.label ?? combo.meal
    setToast(todayBool ? `Combo añadido a ${mealLabel}` : `Combo añadido a ${formatDateLabel(selectedDateKey)}`)
  }

  const isSearching = searchQuery.trim().length > 0

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-2xl mx-auto pb-28">

      <PageHeader
        breadcrumb="Salud · Nutrición"
        title="Nutrición"
        subtitle={profile ? getDayLabel(profile) : undefined}
      />

      {/* Date navigator */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}
        className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button onClick={() => navigateDate(-1)}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition active:scale-90">
            <ChevronLeft size={16} className="text-white/50" />
          </button>
          <div className="px-3 py-1.5 rounded-xl">
            <span className="text-sm font-semibold text-white/85">{formatDateLabel(selectedDateKey)}</span>
          </div>
          <button onClick={() => navigateDate(1)} disabled={todayBool}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition active:scale-90 disabled:opacity-25 disabled:pointer-events-none">
            <ChevronRight size={16} className="text-white/50" />
          </button>
        </div>
        {!todayBool && (
          <span className="rounded-lg bg-orange-500/15 border border-orange-500/25 px-2.5 py-1 text-[11px] font-medium text-orange-400">
            Editando día pasado
          </span>
        )}
      </motion.div>

      {/* Day type pills */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
        className="flex gap-1.5 mb-4 flex-wrap">
        {DAY_TYPE_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => handleDayTypeChange(opt.value)}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${dayType === opt.value ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300' : 'bg-white/4 border border-white/8 text-white/50 hover:border-white/14'}`}>
            {opt.emoji} {opt.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-white/25 self-center">{target.kcal} kcal objetivo</span>
      </motion.div>

      {/* Progress */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
        className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5 mb-4">
        <div className="flex items-end justify-between mb-2">
          <div className="flex items-center gap-2">
            <Flame size={15} className="text-orange-400" />
            <span className="text-sm font-semibold text-white/80">Calorías</span>
          </div>
          <div>
            <span className="text-2xl font-bold text-white/90">{Math.round(totals.kcal)}</span>
            <span className="text-sm text-white/30"> / {target.kcal} kcal</span>
          </div>
        </div>
        <div className="h-2.5 rounded-full bg-white/6 overflow-hidden mb-4">
          <motion.div initial={{ width: 0 }} animate={{ width: `${kcalPct}%` }} transition={{ duration: 0.7 }}
            className={`h-full rounded-full ${kcalPct >= 100 ? 'bg-rose-500' : 'bg-linear-to-r from-orange-500 to-amber-400'}`} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <MacroBar label="Proteína" value={Math.round(totals.protein)} target={target.protein} color="bg-blue-500" />
          <MacroBar label="Carbos"   value={Math.round(totals.carbs)}   target={target.carbs}   color="bg-amber-500" />
          <MacroBar label="Grasas"   value={Math.round(totals.fat)}     target={target.fat}     color="bg-rose-500" />
        </div>
      </motion.section>

      {/* Search bar + AI button */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder="Buscar alimento..."
            className="w-full pl-10 pr-10 py-3 rounded-2xl bg-[#1E1E28] border border-white/8 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-blue-500/40 transition-colors"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searching && <Loader2 size={14} className="text-white/30 animate-spin" />}
            {searchQuery && !searching && (
              <button onClick={() => { setSearchQuery(''); setOffResults([]) }} className="text-white/25 hover:text-white/50 transition">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowAIModal(true)}
          className="shrink-0 rounded-2xl bg-violet-600/15 border border-violet-500/25 px-3.5 flex items-center gap-1.5 text-violet-300 hover:bg-violet-600/25 hover:border-violet-500/40 transition"
          title="Calcular macros con IA"
        >
          <Bot size={15} />
          <span className="text-xs font-medium hidden sm:inline">IA</span>
        </button>
      </motion.div>

      {/* Suggestions banner — only for today */}
      <AnimatePresence>
        {todayBool && !bannerDismissed && patternData && (
          <SuggestionsBanner
            patternData={patternData}
            dayType={dayType}
            proteinTarget={target.protein}
            onAddFoods={handleSuggestionAddFoods}
            onGoToYesterday={goToYesterday}
            onDismiss={() => setBannerDismissed(true)}
          />
        )}
      </AnimatePresence>

      {/* Favorites or search results */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">
            {isSearching ? 'Resultados' : '⚡ Acceso rápido'}
          </p>
          {!isSearching && favorites.length > 0 && (
            <p className="text-[10px] text-white/20">ordenado por uso reciente</p>
          )}
        </div>

        {/* Detected combos row */}
        {!isSearching && patternData && patternData.combos.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-widest text-white/20 mb-2">Combos habituales</p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {patternData.combos.slice(0, 4).map(combo => {
                const comboKcal = combo.foods.reduce((s, f) => s + f.avgKcal, 0)
                const isAdding = addingCombo === combo.id
                return (
                  <div key={combo.id}
                    className="shrink-0 rounded-2xl border border-white/8 bg-white/3 p-3 w-40">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-sm">{combo.emoji}</span>
                      <span className="text-[11px] font-semibold text-white/70 leading-tight truncate">{combo.name}</span>
                    </div>
                    <p className="text-[10px] text-white/35 mb-2 line-clamp-2 leading-tight">
                      {combo.foods.map(f => f.name).join(' · ')}
                    </p>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-orange-400">{Math.round(comboKcal)} kcal</span>
                      <span className="text-[10px] text-white/25">×{combo.count}</span>
                    </div>
                    <button onClick={() => handleAddCombo(combo)} disabled={isAdding}
                      className="w-full rounded-xl bg-blue-600/12 border border-blue-500/20 py-1.5 text-[11px] font-medium text-blue-300 hover:bg-blue-600/20 transition flex items-center justify-center gap-1 disabled:opacity-50">
                      {isAdding ? <Loader2 size={11} className="animate-spin" /> : null}
                      Añadir todo
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {isSearching ? (
          /* Search results */
          <div className="space-y-2">
            {filteredFavs.length === 0 && offResults.length === 0 && !searching && (
              <p className="text-sm text-white/30 text-center py-6">Sin resultados para "{searchQuery}"</p>
            )}
            {filteredFavs.map(fav => {
              const servKcal = Math.round(fav.per100g.kcal * fav.defaultGrams / 100)
              return (
                <button key={fav.id} onClick={() => openFavorite(fav)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl bg-amber-500/6 border border-amber-500/15 hover:bg-amber-500/10 transition text-left">
                  <FoodThumb emoji={fav.emoji} imageUrl={fav.imageUrl} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/85 truncate">{fav.name}</p>
                    <p className="text-[11px] text-white/35">{fav.defaultGrams}g · P {Math.round(fav.per100g.protein * fav.defaultGrams / 100)}g</p>
                  </div>
                  <span className="text-sm font-semibold text-orange-400 shrink-0">{servKcal} kcal</span>
                </button>
              )
            })}
            {offResults.map(r => (
              <button key={r.id} onClick={() => openFoodResult(r)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/3 border border-white/6 hover:bg-white/6 transition text-left">
                <FoodThumb emoji="🍽️" imageUrl={r.imageUrl} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white/85 truncate">{r.name}</p>
                  <p className="text-[11px] text-white/35">{r.brand ? `${r.brand} · ` : ''}por 100g</p>
                </div>
                <span className="text-sm font-semibold text-orange-400 shrink-0">{r.per100g.kcal} kcal</span>
              </button>
            ))}
            {searching && (
              <div className="flex items-center justify-center gap-2 py-4 text-white/30 text-sm">
                <Loader2 size={14} className="animate-spin" />
                Buscando en Open Food Facts…
              </div>
            )}
          </div>
        ) : (
          /* Smart favorites grid */
          favorites.length === 0 ? (
            <div className="text-center py-8 text-sm text-white/30">Cargando favoritos…</div>
          ) : (() => {
            const QUICK_LIMIT = 6
            const visible = showAllFavs ? favorites : favorites.slice(0, QUICK_LIMIT)
            const hidden  = favorites.length - QUICK_LIMIT

            return (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {visible.map(fav => {
                    const servKcal = Math.round(fav.per100g.kcal * fav.defaultGrams / 100)
                    const servP    = Math.round(fav.per100g.protein * fav.defaultGrams / 100 * 10) / 10
                    const servC    = Math.round(fav.per100g.carbs   * fav.defaultGrams / 100 * 10) / 10
                    const servF    = Math.round(fav.per100g.fat     * fav.defaultGrams / 100 * 10) / 10
                    const usedToday = fav.lastUsedAt
                      ? (Date.now() - fav.lastUsedAt.getTime()) < 86_400_000
                      : false
                    return (
                      <div key={fav.id} className="relative group">
                        <button onClick={() => openFavorite(fav)}
                          className={`w-full rounded-2xl border p-3 text-left transition-all active:scale-95 ${
                            usedToday
                              ? 'bg-blue-500/8 border-blue-500/20 hover:bg-blue-500/12'
                              : 'bg-white/4 border-white/6 hover:bg-white/7 hover:border-white/12'
                          }`}>
                          <div className="flex items-start justify-between mb-2">
                            <FoodThumb emoji={fav.emoji} imageUrl={fav.imageUrl} />
                            <div className="text-right">
                              <span className="text-lg font-bold text-orange-400 leading-tight block">{servKcal}</span>
                              {fav.usageCount >= 3 && (
                                <span className="text-[9px] text-white/25 leading-none">×{fav.usageCount}</span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs font-medium text-white/80 leading-snug line-clamp-2 mb-1">{fav.name}</p>
                          <p className="text-[10px] text-white/30">P{servP}·C{servC}·G{servF}</p>
                        </button>
                        <button
                          onClick={async (e) => { e.stopPropagation(); await removeFavorite(fav.id); reloadFavorites() }}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition w-6 h-6 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 flex items-center justify-center"
                        >
                          <X size={11} className="text-rose-400" />
                        </button>
                      </div>
                    )
                  })}
                </div>

                {hidden > 0 && (
                  <button
                    onClick={() => setShowAllFavs(v => !v)}
                    className="mt-3 w-full py-2 rounded-xl bg-white/3 border border-white/6 text-xs text-white/35 hover:text-white/55 hover:bg-white/5 transition"
                  >
                    {showAllFavs ? 'Ver menos' : `Ver ${hidden} más`}
                  </button>
                )}
              </>
            )
          })()
        )}
      </motion.section>

      {/* Food log grouped by meal */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}
        className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">
            Registro de {formatDateLabel(selectedDateKey).toLowerCase()}
          </p>
          {entries.length > 0 && <span className="text-xs text-white/30">{entries.length} entradas</span>}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin" /></div>
        ) : entries.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/8 p-8 text-center text-sm text-white/30">
            {todayBool
              ? 'Toca un favorito o busca un alimento para registrarlo.'
              : `Sin entradas registradas para ${formatDateLabel(selectedDateKey).toLowerCase()}.`}
          </div>
        ) : (
          <div className="space-y-2">
            {MEALS.map(mealCfg => {
              const mealEntries = entriesByMeal[mealCfg.value]
              if (mealEntries.length === 0) return null
              const mealKcal = Math.round(mealEntries.reduce((s, e) => s + e.kcal, 0))
              const isExpanded = expandedMeals.has(mealCfg.value)
              return (
                <div key={mealCfg.value} className="rounded-2xl border border-white/6 overflow-hidden">
                  <button
                    onClick={() => toggleMeal(mealCfg.value)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{mealCfg.emoji}</span>
                      <span className="text-sm font-semibold text-white/80">{mealCfg.label}</span>
                      <span className="text-xs text-white/35">({mealEntries.length})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-orange-400">{mealKcal} kcal</span>
                      {isExpanded ? <ChevronDown size={14} className="text-white/30" /> : <ChevronRight size={14} className="text-white/30" />}
                    </div>
                  </button>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 space-y-1.5 border-t border-white/5 pt-2">
                          {mealEntries.map(entry => (
                            <motion.div key={entry.id}
                              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/3 group">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white/80 font-medium truncate">{entry.name}</p>
                                <p className="text-[11px] text-white/30 mt-0.5">
                                  P {entry.protein}g · C {entry.carbs}g · G {entry.fat}g
                                </p>
                              </div>
                              <span className="text-xs font-semibold text-orange-400 shrink-0">{entry.kcal} kcal</span>
                              <button onClick={() => deleteNutritionEntry(entry.id)}
                                className="opacity-100 md:opacity-0 md:group-hover:opacity-100 w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition shrink-0">
                                <Trash2 size={12} className="text-red-400" />
                              </button>
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </motion.section>

      {/* FAB — foto al plato */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3, type: 'spring' }}
        onClick={() => setShowPhotoModal(true)}
        className="fixed bottom-24 lg:bottom-8 right-4 lg:right-8 w-14 h-14 rounded-full bg-blue-600 shadow-lg shadow-blue-900/40 flex items-center justify-center hover:bg-blue-500 active:scale-95 transition z-30"
        title="Analizar plato con IA"
      >
        <Camera size={22} className="text-white" />
      </motion.button>

      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="fixed bottom-28 lg:bottom-12 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-[#2a2a38] border border-white/12 px-4 py-2.5 text-sm text-white/80 font-medium shadow-xl whitespace-nowrap"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {confirmFood && (
          <ConfirmModal
            food={confirmFood}
            onClose={() => setConfirmFood(null)}
            onAdded={() => {
              setConfirmFood(null)
              if (!todayBool) setToast(`Añadido a ${formatDateLabel(selectedDateKey)}`)
            }}
            favorites={favorites}
            onFavoritesChange={reloadFavorites}
            targetDate={entryDate}
          />
        )}
        {showPhotoModal && (
          <PhotoModal
            onClose={() => setShowPhotoModal(false)}
            onAdded={() => { if (!todayBool) setToast(`Añadido a ${formatDateLabel(selectedDateKey)}`) }}
            onAddedMeal={getMealForTime()}
            targetDate={entryDate}
          />
        )}
        {showAIModal && (
          <AIFoodModal
            onClose={() => setShowAIModal(false)}
            onAdded={() => { if (!todayBool) setToast(`Añadido a ${formatDateLabel(selectedDateKey)}`) }}
            targetDate={entryDate}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
