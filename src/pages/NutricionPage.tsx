import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Flame, Loader2, Bot, Trash2, X, Zap, Droplets, Beef } from 'lucide-react'
import { addNutritionEntry, deleteNutritionEntry, subscribeNutritionEntries } from '@/services/nutrition.service'
import { searchFoods, type OpenFoodResult } from '@/services/openfoodfacts.service'
import { getGeminiKey } from '@/services/ai.service'
import { DAY_TARGETS, type DayType, type FoodEntry } from '@/types/nutrition'

const DAY_TYPE_OPTIONS: Array<{ value: DayType; label: string; emoji: string }> = [
  { value: 'normal',   label: 'Normal',   emoji: '⚖️' },
  { value: 'volumen',  label: 'Volumen',  emoji: '💪' },
  { value: 'deficit',  label: 'Déficit',  emoji: '🔥' },
  { value: 'descanso', label: 'Descanso', emoji: '😴' },
]

interface SelectedFood {
  name: string
  brand?: string
  per100g: { kcal: number; protein: number; carbs: number; fat: number }
}

function getDayTypeKey() {
  return `nutrition_daytype_${new Date().toISOString().split('T')[0]}`
}

async function fetchAIMacros(
  food: string,
): Promise<{ kcal: number; protein: number; carbs: number; fat: number } | null> {
  const key = getGeminiKey()
  if (!key) return null
  try {
    const prompt = `Dame macros de ${food} por 100g. Responde SOLO JSON: {"kcal":number,"protein":number,"carbs":number,"fat":number}`
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      },
    )
    if (!res.ok) return null
    const data = await res.json()
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const match = text.match(/\{[\s\S]*?\}/)
    if (!match) return null
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

function MacroBar({
  label,
  value,
  target,
  color,
  unit = 'g',
}: {
  label: string
  value: number
  target: number
  color: string
  unit?: string
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-xs">
        <span className="text-white/50">{label}</span>
        <span className="text-white/70 font-medium">
          {value}
          <span className="text-white/30">/{target}{unit}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <p className="text-[10px] text-white/25 mt-1 text-right">{pct}%</p>
    </div>
  )
}

export function NutricionPage() {
  const [entries, setEntries] = useState<FoodEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Day type persisted per date
  const [dayType, setDayType] = useState<DayType>(() => {
    return (localStorage.getItem(getDayTypeKey()) as DayType) ?? 'normal'
  })

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<OpenFoodResult[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // Selected food + grams
  const [selectedFood, setSelectedFood] = useState<SelectedFood | null>(null)
  const [grams, setGrams] = useState('100')

  // AI
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const todayDate = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  useEffect(() => {
    const unsub = subscribeNutritionEntries((data) => {
      setEntries(data)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const target = DAY_TARGETS[dayType]

  const totals = useMemo(
    () =>
      entries.reduce(
        (acc, e) => ({
          kcal: acc.kcal + e.kcal,
          protein: acc.protein + e.protein,
          carbs: acc.carbs + e.carbs,
          fat: acc.fat + e.fat,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [entries],
  )

  const kcalPct = target.kcal > 0 ? Math.min(100, Math.round((totals.kcal / target.kcal) * 100)) : 0

  const computedMacros = useMemo(() => {
    if (!selectedFood || !grams || Number(grams) <= 0) return null
    const ratio = Number(grams) / 100
    return {
      kcal: Math.round(selectedFood.per100g.kcal * ratio),
      protein: Math.round(selectedFood.per100g.protein * ratio * 10) / 10,
      carbs: Math.round(selectedFood.per100g.carbs * ratio * 10) / 10,
      fat: Math.round(selectedFood.per100g.fat * ratio * 10) / 10,
    }
  }, [selectedFood, grams])

  function handleDayTypeChange(dt: DayType) {
    setDayType(dt)
    localStorage.setItem(getDayTypeKey(), dt)
  }

  function handleSearchInput(value: string) {
    setSearchQuery(value)
    setAiError('')
    if (!value.trim()) {
      setSearchResults([])
      setHasSearched(false)
      setShowDropdown(false)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setHasSearched(false)
      const results = await searchFoods(value)
      setSearchResults(results)
      setHasSearched(true)
      setSearching(false)
      setShowDropdown(true)
    }, 500)
  }

  function selectFood(food: OpenFoodResult) {
    setSelectedFood({ name: food.name, brand: food.brand, per100g: food.per100g })
    setGrams('100')
    setShowDropdown(false)
    setSearchQuery(food.name)
  }

  async function handleAISearch() {
    if (!searchQuery.trim()) return
    const key = getGeminiKey()
    if (!key) {
      setAiError('Configura tu API Key de Gemini en Ajustes para usar esta función.')
      return
    }
    setAiLoading(true)
    setAiError('')
    const macros = await fetchAIMacros(searchQuery.trim())
    setAiLoading(false)
    if (!macros) {
      setAiError('No se pudo obtener datos de la IA. Inténtalo de nuevo.')
      return
    }
    setSelectedFood({ name: searchQuery.trim(), per100g: macros })
    setGrams('100')
    setShowDropdown(false)
  }

  async function handleAdd() {
    if (!selectedFood || !computedMacros || Number(grams) <= 0) return
    const name =
      Number(grams) !== 100
        ? `${selectedFood.name} (${grams}g)`
        : selectedFood.name
    await addNutritionEntry(name, computedMacros.kcal, computedMacros.protein, computedMacros.carbs, computedMacros.fat)
    setSelectedFood(null)
    setSearchQuery('')
    setSearchResults([])
    setHasSearched(false)
    setGrams('100')
  }

  function clearSelection() {
    setSelectedFood(null)
    setSearchQuery('')
    setSearchResults([])
    setHasSearched(false)
    setGrams('100')
    setAiError('')
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-2xl mx-auto">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <p className="text-sm text-white/35 capitalize">{todayDate}</p>
        <h1 className="text-3xl font-bold text-white/90 mt-1">Nutrición</h1>
      </motion.div>

      {/* Day type selector */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 p-4 mb-4"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-3">Tipo de día</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DAY_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleDayTypeChange(opt.value)}
              className={`rounded-xl border py-2.5 text-sm font-medium transition-all ${
                dayType === opt.value
                  ? 'border-blue-500/40 bg-blue-500/10 text-white'
                  : 'border-white/8 bg-white/3 text-white/50 hover:text-white/70'
              }`}
            >
              {opt.emoji} {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-white/25 mt-2.5">
          Objetivo: {target.kcal} kcal · P {target.protein}g · C {target.carbs}g · G {target.fat}g
        </p>
      </motion.div>

      {/* Progress */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 p-4 mb-4"
      >
        {/* Big kcal bar */}
        <div className="mb-4">
          <div className="flex items-end justify-between mb-2">
            <div className="flex items-center gap-2">
              <Flame size={16} className="text-orange-400" />
              <span className="text-sm font-semibold text-white/80">Calorías</span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-white/90">{totals.kcal}</span>
              <span className="text-sm text-white/30"> / {target.kcal} kcal</span>
            </div>
          </div>
          <div className="h-3 rounded-full bg-white/6 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${kcalPct}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className={`h-full rounded-full transition-colors ${
                kcalPct >= 100 ? 'bg-rose-500' : 'bg-linear-to-r from-orange-500 to-amber-400'
              }`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-white/25 mt-1.5">
            <span>{kcalPct >= 100 ? '⚠️ Objetivo superado' : `${kcalPct}% del objetivo`}</span>
            <span>{Math.max(0, target.kcal - totals.kcal)} kcal restantes</span>
          </div>
        </div>

        {/* Macro bars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MacroBar label="Proteína" value={Math.round(totals.protein)} target={target.protein} color="bg-blue-500" />
          <MacroBar label="Carbohidratos" value={Math.round(totals.carbs)} target={target.carbs} color="bg-amber-500" />
          <MacroBar label="Grasas" value={Math.round(totals.fat)} target={target.fat} color="bg-rose-500" />
        </div>
      </motion.div>

      {/* Search + add food */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 p-4 mb-4"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-3">Añadir alimento</p>

        {/* Search input */}
        <div className="relative" ref={searchRef}>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              onFocus={() => hasSearched && setShowDropdown(true)}
              placeholder="Busca un alimento (ej. pollo, arroz…)"
              className="w-full pl-9 pr-10 py-3 rounded-xl bg-white/5 border border-white/8 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-blue-500/40 transition-colors"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searching && <Loader2 size={14} className="text-white/30 animate-spin" />}
              {searchQuery && !searching && (
                <button onClick={clearSelection} className="text-white/25 hover:text-white/50 transition">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Dropdown */}
          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute z-20 w-full mt-1.5 rounded-2xl bg-[#13131b] border border-white/10 overflow-hidden shadow-2xl"
              >
                {searchResults.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto">
                    {searchResults.map((food) => (
                      <button
                        key={food.id}
                        onMouseDown={() => selectFood(food)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition text-left border-b border-white/5 last:border-0"
                      >
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-sm text-white/85 font-medium truncate">{food.name}</p>
                          {food.brand && (
                            <p className="text-xs text-white/35 truncate">{food.brand}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold text-orange-400">{food.per100g.kcal} kcal</p>
                          <p className="text-[10px] text-white/30">/100g</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-5 text-center">
                    <p className="text-sm text-white/40 mb-3">Sin resultados en Open Food Facts</p>
                    {aiError ? (
                      <p className="text-xs text-rose-400">{aiError}</p>
                    ) : (
                      <button
                        onMouseDown={handleAISearch}
                        disabled={aiLoading}
                        className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
                      >
                        {aiLoading ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Bot size={14} />
                        )}
                        {aiLoading ? 'Consultando IA…' : 'Buscar con IA'}
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Selected food panel */}
        <AnimatePresence>
          {selectedFood && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="mt-3 rounded-xl border border-white/8 bg-white/3 p-3"
            >
              {/* Food name + grams input */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white/85 truncate">{selectedFood.name}</p>
                  <p className="text-[10px] text-white/35 mt-0.5">
                    {selectedFood.per100g.kcal} kcal · P {selectedFood.per100g.protein}g · C {selectedFood.per100g.carbs}g · G {selectedFood.per100g.fat}g por 100g
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                    type="number"
                    min="1"
                    inputMode="numeric"
                    className="w-16 rounded-lg bg-white/8 border border-white/10 px-2 py-2 text-sm text-white/85 text-center focus:outline-none focus:border-blue-500/40"
                  />
                  <span className="text-xs text-white/40">g</span>
                </div>
              </div>

              {/* Computed macros preview */}
              {computedMacros && (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { label: 'Kcal', value: computedMacros.kcal, color: 'text-orange-400' },
                    { label: 'Prot', value: `${computedMacros.protein}g`, color: 'text-blue-400' },
                    { label: 'Carb', value: `${computedMacros.carbs}g`, color: 'text-amber-400' },
                    { label: 'Gras', value: `${computedMacros.fat}g`, color: 'text-rose-400' },
                  ].map((m) => (
                    <div key={m.label} className="rounded-lg bg-white/5 py-2 text-center">
                      <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                      <p className="text-[10px] text-white/30 mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleAdd}
                disabled={!computedMacros || Number(grams) <= 0}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Añadir al registro
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Food log */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl bg-[#1E1E28] border border-white/8 p-4"
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25">
            Registro del día
          </p>
          {entries.length > 0 && (
            <span className="text-[10px] text-white/25">{entries.length} alimentos</span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-2xl bg-white/4 flex items-center justify-center mx-auto mb-3">
              <Flame size={20} className="text-white/20" />
            </div>
            <p className="text-sm text-white/30">Aún no has registrado nada hoy</p>
            <p className="text-xs text-white/20 mt-1">Busca un alimento arriba para empezar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/3 group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/80 font-medium truncate">{entry.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs font-semibold text-orange-400">{entry.kcal} kcal</span>
                    <span className="text-[11px] text-white/30">
                      P {entry.protein}g · C {entry.carbs}g · G {entry.fat}g
                    </span>
                  </div>
                </div>
                <span className="text-xs text-white/25 shrink-0">
                  {entry.createdAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  onClick={() => deleteNutritionEntry(entry.id)}
                  className="opacity-100 md:opacity-0 md:group-hover:opacity-100 w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition shrink-0"
                >
                  <Trash2 size={13} className="text-red-400" />
                </button>
              </motion.div>
            ))}

            {/* Day totals summary */}
            <div className="mt-3 pt-3 border-t border-white/6 grid grid-cols-4 gap-2">
              {[
                { label: 'Total kcal', value: totals.kcal, color: 'text-orange-400' },
                { label: 'Proteína', value: `${Math.round(totals.protein)}g`, color: 'text-blue-400' },
                { label: 'Carbos', value: `${Math.round(totals.carbs)}g`, color: 'text-amber-400' },
                { label: 'Grasas', value: `${Math.round(totals.fat)}g`, color: 'text-rose-400' },
              ].map((m) => (
                <div key={m.label} className="rounded-xl bg-white/4 p-2.5 text-center">
                  <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
