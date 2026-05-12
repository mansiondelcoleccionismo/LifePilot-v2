import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Flame, Loader2, Bot, Trash2, X, Camera, Check, RotateCcw,
  Star, ChevronDown, ChevronRight, Plus, Minus,
} from 'lucide-react'
import { addNutritionEntry, deleteNutritionEntry, subscribeNutritionEntries } from '@/services/nutrition.service'
import { searchFoods, type OpenFoodResult } from '@/services/openfoodfacts.service'
import { callAI, hasAnyAIKey } from '@/services/ai.service'
import { DAY_TARGETS, type DayType, type FoodEntry, type MealType } from '@/types/nutrition'
import { loadProfile, autoDetectDayType, getTargetForDayType, getDayLabel } from '@/services/metabolic.service'
import {
  initFavorites, getFavorites, addFavorite, removeFavorite, incrementUsage,
  type FoodFavorite,
} from '@/services/favorites.service'
import type { UserProfile } from '@/types/profile'

// ─── Meal config ─────────────────────────────────────────────────────────────
const MEALS: Array<{ value: MealType; label: string; emoji: string; hours: [number, number] }> = [
  { value: 'desayuno',     label: 'Desayuno',      emoji: '🌅', hours: [6,  10] },
  { value: 'media_manana', label: 'Media mañana',  emoji: '🍎', hours: [10, 12] },
  { value: 'almuerzo',     label: 'Almuerzo',      emoji: '🍽️', hours: [12, 16] },
  { value: 'merienda',     label: 'Merienda',      emoji: '☕', hours: [16, 19] },
  { value: 'cena',         label: 'Cena',           emoji: '🌙', hours: [19, 23] },
  { value: 'snack',        label: 'Snack',          emoji: '🍿', hours: [0,  6]  },
]

function getMealForTime(date = new Date()): MealType {
  const h = date.getHours()
  const m = MEALS.find(ml => h >= ml.hours[0] && h < ml.hours[1])
  return m?.value ?? 'snack'
}

function getMealLabel(meal: MealType) {
  return MEALS.find(m => m.value === meal) ?? MEALS[5]
}

function getDayTypeKey() {
  return `nutrition_daytype_${new Date().toISOString().split('T')[0]}`
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

async function analyzePhoto(file: File): Promise<PhotoResult> {
  const { data, mimeType } = await resizeAndEncode(file)
  const prompt = `Analiza esta foto de comida. Identifica todos los alimentos visibles y estima las cantidades en gramos. Devuelve SOLO un JSON válido con este formato exacto, sin texto adicional:
{"descripcion":"descripción breve del plato","alimentos":[{"nombre":"nombre del alimento","gramos":0,"kcal":0,"protein":0,"carbs":0,"fat":0}],"totales":{"kcal":0,"protein":0,"carbs":0,"fat":0}}`
  const text = await callAI(prompt, { data, mimeType })
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('NO_FOOD')
  try { return JSON.parse(match[0]) as PhotoResult }
  catch { throw new Error('PARSE_ERROR') }
}

// ─── PhotoModal ───────────────────────────────────────────────────────────────
function PhotoModal({ onClose, onAddedMeal }: { onClose: () => void; onAddedMeal: MealType }) {
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
      )
    }
    setAdding(false)
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
              {/* Meal selector */}
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
  food, onClose, onAdded, favorites, onFavoritesChange,
}: {
  food: ConfirmFood
  onClose: () => void
  onAdded: () => void
  favorites: FoodFavorite[]
  onFavoritesChange: () => void
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
    await addNutritionEntry(name, macros.kcal, macros.protein, macros.carbs, macros.fat, meal)
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
        {/* Food header */}
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
          {/* Grams input */}
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
            {/* Quick amounts */}
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {[food.defaultGrams, 50, 100, 150, 200].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).slice(0, 5).map(g => (
                <button key={g} onClick={() => setGrams(String(g))}
                  className={`rounded-lg px-2.5 py-1 text-xs transition ${Number(grams) === g ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-white/4 text-white/40 hover:text-white/60 border border-white/6'}`}>
                  {g}g
                </button>
              ))}
            </div>
          </div>

          {/* Meal selector */}
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

          {/* Actions */}
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

// ─── DAY_TYPE options ─────────────────────────────────────────────────────────
const DAY_TYPE_OPTIONS: Array<{ value: DayType; label: string; emoji: string }> = [
  { value: 'normal',   label: 'Normal',   emoji: '⚖️' },
  { value: 'volumen',  label: 'Volumen',  emoji: '💪' },
  { value: 'deficit',  label: 'Déficit',  emoji: '🔥' },
  { value: 'descanso', label: 'Descanso', emoji: '😴' },
]

// ─── NutricionPage ────────────────────────────────────────────────────────────
export function NutricionPage() {
  const [entries, setEntries]       = useState<FoodEntry[]>([])
  const [loading, setLoading]       = useState(true)
  const [favorites, setFavorites]   = useState<FoodFavorite[]>([])
  const [profile, setProfile]       = useState<UserProfile | null>(null)

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
  const [expandedMeals, setExpandedMeals] = useState<Set<MealType>>(
    () => new Set<MealType>(['desayuno', 'almuerzo', 'cena'])
  )

  const todayDate = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  // ── Load profile + favorites ──────────────────────────────────────────────
  useEffect(() => {
    const p = loadProfile()
    setProfile(p)
    const saved = localStorage.getItem(getDayTypeKey()) as DayType | null
    if (!saved) setDayType(autoDetectDayType(p))

    // Init + load favorites
    initFavorites().then(() => getFavorites().then(setFavorites))
  }, [])

  const reloadFavorites = () => getFavorites().then(setFavorites)

  // ── Entries subscription ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeNutritionEntries(data => { setEntries(data); setLoading(false) })
    return () => unsub()
  }, [])

  // ── Auto-expand meal with entries ────────────────────────────────────────
  useEffect(() => {
    if (!entries.length) return
    const activeMeals = new Set(entries.map(e => e.meal ?? getMealForTime(e.createdAt)))
    setExpandedMeals(prev => new Set([...prev, ...activeMeals]))
  }, [entries.length])

  // ── Targets ──────────────────────────────────────────────────────────────
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
    entries.forEach(e => { const meal = e.meal ?? getMealForTime(e.createdAt); groups[meal].push(e) })
    return groups
  }, [entries])

  function toggleMeal(meal: MealType) {
    setExpandedMeals(prev => { const s = new Set(prev); s.has(meal) ? s.delete(meal) : s.add(meal); return s })
  }

  function handleDayTypeChange(dt: DayType) {
    setDayType(dt)
    localStorage.setItem(getDayTypeKey(), dt)
  }

  const isSearching = searchQuery.trim().length > 0

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-2xl mx-auto pb-28">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <p className="text-sm text-white/35 capitalize">{todayDate}</p>
        <div className="flex items-end justify-between mt-1">
          <h1 className="text-3xl font-bold text-white/90">Nutrición</h1>
          <span className="text-xs text-white/30 mb-1">{profile ? getDayLabel(profile) : ''}</span>
        </div>
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

      {/* Search bar */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        <input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder="Buscar o añadir alimento..."
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
      </motion.div>

      {/* Favorites or search results */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5 mb-4">
        <p className="text-[10px] uppercase tracking-[0.3em] text-white/25 mb-4">
          {isSearching ? 'Resultados' : '⚡ Acceso rápido'}
        </p>

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
          /* Favorites grid */
          favorites.length === 0 ? (
            <div className="text-center py-8 text-sm text-white/30">Cargando favoritos…</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {favorites.map(fav => {
                const servKcal = Math.round(fav.per100g.kcal * fav.defaultGrams / 100)
                const servP    = Math.round(fav.per100g.protein * fav.defaultGrams / 100 * 10) / 10
                const servC    = Math.round(fav.per100g.carbs   * fav.defaultGrams / 100 * 10) / 10
                const servF    = Math.round(fav.per100g.fat     * fav.defaultGrams / 100 * 10) / 10
                return (
                  <div key={fav.id} className="relative group">
                    <button onClick={() => openFavorite(fav)}
                      className="w-full rounded-2xl bg-white/4 border border-white/6 p-3 text-left hover:bg-white/7 hover:border-white/12 transition-all active:scale-95">
                      <div className="flex items-start justify-between mb-2">
                        <FoodThumb emoji={fav.emoji} imageUrl={fav.imageUrl} />
                        <span className="text-lg font-bold text-orange-400 leading-tight">{servKcal}</span>
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
          )
        )}
      </motion.section>

      {/* Food log grouped by meal */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}
        className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Registro de hoy</p>
          {entries.length > 0 && <span className="text-xs text-white/30">{entries.length} entradas</span>}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin" /></div>
        ) : entries.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/8 p-8 text-center text-sm text-white/30">
            Toca un favorito o busca un alimento para registrarlo.
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

      {/* Modals */}
      <AnimatePresence>
        {confirmFood && (
          <ConfirmModal
            food={confirmFood}
            onClose={() => setConfirmFood(null)}
            onAdded={() => setConfirmFood(null)}
            favorites={favorites}
            onFavoritesChange={reloadFavorites}
          />
        )}
        {showPhotoModal && (
          <PhotoModal onClose={() => setShowPhotoModal(false)} onAddedMeal={getMealForTime()} />
        )}
      </AnimatePresence>
    </div>
  )
}
