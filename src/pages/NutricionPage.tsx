import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, Droplet, Flame, Activity, Sparkles } from 'lucide-react'
import { addNutritionEntry, deleteNutritionEntry, subscribeNutritionEntries } from '@/services/nutrition.service'
import { DAY_TARGETS, type DayType, type FoodEntry } from '@/types/nutrition'

const dayTypeOptions: Array<{ value: DayType; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'volumen', label: 'Volumen' },
  { value: 'deficit', label: 'Déficit' },
  { value: 'descanso', label: 'Descanso' },
]

const macroMeta = [
  { label: 'Kcal', key: 'kcal' as const, icon: Flame, accent: 'from-orange-500 to-amber-400' },
  { label: 'Proteína', key: 'protein' as const, icon: Sparkles, accent: 'from-blue-500 to-cyan-400' },
  { label: 'Carbos', key: 'carbs' as const, icon: Activity, accent: 'from-amber-500 to-yellow-400' },
  { label: 'Grasa', key: 'fat' as const, icon: Droplet, accent: 'from-rose-500 to-pink-400' },
]

function ProgressBar({ label, value, target, accent }: { label: string; value: number; target: number; accent: string }) {
  const percentage = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0

  return (
    <div className="rounded-3xl bg-white/4 p-4 border border-white/8">
      <div className="flex items-center justify-between gap-3 mb-3 text-sm text-white/60">
        <span>{label}</span>
        <span className="font-semibold text-white/90">{value} / {target}</span>
      </div>
      <div className="h-2 rounded-full bg-white/8 overflow-hidden">
        <div
          className={`h-full rounded-full bg-linear-to-r ${accent}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-white/30">{percentage}% objetivo</p>
    </div>
  )
}

export function NutricionPage() {
  const [entries, setEntries] = useState<FoodEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dayType, setDayType] = useState<DayType>('normal')
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')

  useEffect(() => {
    const unsubscribe = subscribeNutritionEntries((data) => {
      setEntries(data)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const target = DAY_TARGETS[dayType]

  const totals = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        acc.kcal += entry.kcal
        acc.protein += entry.protein
        acc.carbs += entry.carbs
        acc.fat += entry.fat
        return acc
      },
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    )
  }, [entries])

  const handleAdd = async () => {
    if (!name.trim()) return
    const parsedKcal = Number(kcal)
    const parsedProtein = Number(protein)
    const parsedCarbs = Number(carbs)
    const parsedFat = Number(fat)
    if (Number.isNaN(parsedKcal) || Number.isNaN(parsedProtein) || Number.isNaN(parsedCarbs) || Number.isNaN(parsedFat)) return

    await addNutritionEntry(name.trim(), parsedKcal, parsedProtein, parsedCarbs, parsedFat)
    setName('')
    setKcal('')
    setProtein('')
    setCarbs('')
    setFat('')
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/35">Nutrición · Entrada diaria</p>
            <h1 className="text-3xl font-bold text-white/90 mt-1">Controla tus macros y alimentos</h1>
          </div>
          <div className="rounded-2xl border border-white/8 bg-[#1E1E28]/80 px-4 py-3 text-sm text-white/65">
            {entries.length} alimento{entries.length === 1 ? '' : 's'} hoy
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Tipo de día</p>
                <h2 className="text-lg font-semibold text-white/90 mt-2">Selecciona tu objetivo</h2>
              </div>
              <div className="text-right text-sm text-white/45">Target actual</div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {dayTypeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDayType(option.value)}
                  className={`rounded-2xl border px-3 py-3 text-sm font-medium transition-colors ${
                    dayType === option.value
                      ? 'border-blue-500/40 bg-blue-500/10 text-white'
                      : 'border-white/8 bg-white/3 text-white/60 hover:border-white/14'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {macroMeta.map((macro) => (
              <ProgressBar
                key={macro.key}
                label={macro.label}
                value={totals[macro.key]}
                target={target[macro.key]}
                accent={macro.accent}
              />
            ))}
          </section>

          <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Plus size={18} className="text-emerald-300" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Añadir alimento</p>
                <h2 className="text-lg font-semibold text-white/90 mt-1">Registra tu comida</h2>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del alimento"
                className="w-full rounded-2xl bg-white/4 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none focus:border-blue-500/40"
              />
              <input
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
                placeholder="Kcal"
                inputMode="numeric"
                className="w-full rounded-2xl bg-white/4 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none focus:border-blue-500/40"
              />
              <input
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="Proteína (g)"
                inputMode="numeric"
                className="w-full rounded-2xl bg-white/4 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none focus:border-blue-500/40"
              />
              <input
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                placeholder="Carbos (g)"
                inputMode="numeric"
                className="w-full rounded-2xl bg-white/4 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none focus:border-blue-500/40"
              />
              <input
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                placeholder="Grasa (g)"
                inputMode="numeric"
                className="w-full rounded-2xl bg-white/4 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none focus:border-blue-500/40"
              />
            </div>

            <button
              onClick={handleAdd}
              className="mt-4 inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              Añadir alimento
            </button>
          </section>
        </div>

        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Entradas de hoy</p>
              <h2 className="text-lg font-semibold text-white/90 mt-1">Alimentos registrados</h2>
            </div>
            <div className="text-xs text-white/45">Actualizado en tiempo real</div>
          </div>

          {loading ? (
            <div className="flex h-52 items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/8 p-8 text-center text-sm text-white/35">
              Aún no hay alimentos registrados hoy.
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-3xl border border-white/8 bg-white/5 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white/90">{entry.name}</p>
                      <p className="text-xs text-white/40">{entry.createdAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <button
                      onClick={() => deleteNutritionEntry(entry.id)}
                      className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2 text-xs text-white/70 hover:border-rose-400/30 hover:text-rose-300"
                    >
                      <Trash2 size={14} className="inline mr-1" /> Eliminar
                    </button>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-white/70 sm:grid-cols-4">
                    <div className="rounded-2xl bg-white/3 p-3 text-center">
                      <p className="font-semibold text-white/90">{entry.kcal}</p>
                      <span className="text-[11px] text-white/40">Kcal</span>
                    </div>
                    <div className="rounded-2xl bg-white/3 p-3 text-center">
                      <p className="font-semibold text-white/90">{entry.protein}g</p>
                      <span className="text-[11px] text-white/40">Proteína</span>
                    </div>
                    <div className="rounded-2xl bg-white/3 p-3 text-center">
                      <p className="font-semibold text-white/90">{entry.carbs}g</p>
                      <span className="text-[11px] text-white/40">Carbos</span>
                    </div>
                    <div className="rounded-2xl bg-white/3 p-3 text-center">
                      <p className="font-semibold text-white/90">{entry.fat}g</p>
                      <span className="text-[11px] text-white/40">Grasa</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          <div className="mt-6 rounded-3xl border border-white/8 bg-white/2 p-4 text-sm text-white/70">
            <div className="flex items-center justify-between gap-4 mb-3">
              <span className="text-white/40">Totales</span>
              <span className="text-white/90 font-semibold">{entries.length} items</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/3 p-3">
                <p className="text-xs text-white/40">Kcal</p>
                <p className="mt-1 text-lg font-semibold text-white/90">{totals.kcal}</p>
              </div>
              <div className="rounded-2xl bg-white/3 p-3">
                <p className="text-xs text-white/40">Proteína</p>
                <p className="mt-1 text-lg font-semibold text-white/90">{totals.protein}g</p>
              </div>
              <div className="rounded-2xl bg-white/3 p-3">
                <p className="text-xs text-white/40">Carbos</p>
                <p className="mt-1 text-lg font-semibold text-white/90">{totals.carbs}g</p>
              </div>
              <div className="rounded-2xl bg-white/3 p-3">
                <p className="text-xs text-white/40">Grasa</p>
                <p className="mt-1 text-lg font-semibold text-white/90">{totals.fat}g</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
