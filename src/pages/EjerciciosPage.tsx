import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Dumbbell, ArrowUpDown, Trash2, Sparkles } from 'lucide-react'
import { addExercise, deleteExercise, subscribeExercises, updateExercise } from '@/services/exercise.service'
import type { Exercise, WorkoutDay } from '@/types/exercise'

const weekDays: Array<{ value: WorkoutDay; label: string }> = [
  { value: 'Lunes', label: 'Lun' },
  { value: 'Martes', label: 'Mar' },
  { value: 'Miércoles', label: 'Mié' },
  { value: 'Jueves', label: 'Jue' },
  { value: 'Viernes', label: 'Vie' },
  { value: 'Sábado', label: 'Sáb' },
  { value: 'Domingo', label: 'Dom' },
]

export function EjerciciosPage() {
  const [day, setDay] = useState<WorkoutDay>('Lunes')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [sets, setSets] = useState('')
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')
  const [muscleGroup, setMuscleGroup] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingWeight, setEditingWeight] = useState('')

  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeExercises(day, (data) => {
      setExercises(data)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [day])

  const totalExercises = exercises.length

  const handleAdd = async () => {
    if (!name.trim() || !sets.trim() || !reps.trim() || !weight.trim() || !muscleGroup.trim()) return
    const parsedSets = Number(sets)
    const parsedReps = Number(reps)
    const parsedWeight = Number(weight)
    if (Number.isNaN(parsedSets) || Number.isNaN(parsedReps) || Number.isNaN(parsedWeight)) return

    await addExercise(name.trim(), parsedSets, parsedReps, parsedWeight, day, muscleGroup.trim())
    setName('')
    setSets('')
    setReps('')
    setWeight('')
    setMuscleGroup('')
  }

  const startEditing = (exercise: Exercise) => {
    setEditingId(exercise.id)
    setEditingWeight(String(exercise.weight))
  }

  const saveWeight = async (id: string) => {
    const parsedWeight = Number(editingWeight)
    if (Number.isNaN(parsedWeight)) return
    await updateExercise(id, { weight: parsedWeight })
    setEditingId(null)
    setEditingWeight('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingWeight('')
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/35">Ejercicios · Rutina semanal</p>
            <h1 className="text-3xl font-bold text-white/90 mt-1">Entrenamientos por día</h1>
          </div>
          <div className="rounded-2xl border border-white/8 bg-[#1E1E28]/80 px-4 py-3 text-sm text-white/65">
            {totalExercises} ejercicio{totalExercises === 1 ? '' : 's'} hoy
          </div>
        </div>
      </motion.div>

      <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5 mb-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Día de entrenamiento</p>
            <h2 className="text-lg font-semibold text-white/90 mt-2">Selecciona el día</h2>
          </div>
          <div className="text-sm text-white/45">Los ejercicios se cargan en tiempo real</div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setDay(item.value)}
              className={`rounded-2xl border px-1 py-3 text-xs font-medium transition-colors ${
                day === item.value
                  ? 'border-blue-500/40 bg-blue-500/10 text-white'
                  : 'border-white/8 bg-white/5 text-white/60 hover:border-white/14'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Ejercicios del día</p>
              <h2 className="text-lg font-semibold text-white/90 mt-2">{day}</h2>
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-xs text-white/60">
              <Dumbbell size={14} /> {totalExercises} ejercicios
            </div>
          </div>

          {loading ? (
            <div className="flex h-52 items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin" />
            </div>
          ) : exercises.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/8 p-8 text-center text-sm text-white/35">
              No hay ejercicios programados para este día.
            </div>
          ) : (
            <div className="space-y-3">
              {exercises.map((exercise) => (
                <motion.div
                  key={exercise.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-3xl border border-white/8 bg-white/5 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-white/90">{exercise.name}</p>
                      <p className="text-xs text-white/40">{exercise.muscleGroup}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white/70">
                      <span>{exercise.sets}x{exercise.reps}</span>
                      <span className="rounded-2xl bg-white/10 px-3 py-1">{exercise.weight} kg</span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
                    {editingId === exercise.id ? (
                      <>
                        <input
                          value={editingWeight}
                          onChange={(e) => setEditingWeight(e.target.value)}
                          inputMode="numeric"
                          className="w-28 rounded-2xl bg-white/5 border border-white/8 px-3 py-2 text-sm text-white/80 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => saveWeight(exercise.id)}
                          className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-2xl border border-white/8 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:border-white/14"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEditing(exercise)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-white/8 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-white/14"
                        >
                          <ArrowUpDown size={14} /> Editar peso
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteExercise(exercise.id)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-white/8 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-rose-400/30 hover:text-rose-300"
                        >
                          <Trash2 size={14} /> Eliminar
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Plus size={18} className="text-blue-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Añadir ejercicio</p>
              <h2 className="text-lg font-semibold text-white/90 mt-1">Nueva rutina</h2>
            </div>
          </div>

          <div className="grid gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del ejercicio"
              className="w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={sets}
                onChange={(e) => setSets(e.target.value)}
                placeholder="Series"
                inputMode="numeric"
                className="w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
              />
              <input
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="Reps"
                inputMode="numeric"
                className="w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
              />
            </div>
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="Peso (kg)"
              inputMode="numeric"
              className="w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
            />
            <input
              value={muscleGroup}
              onChange={(e) => setMuscleGroup(e.target.value)}
              placeholder="Grupo muscular"
              className="w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleAdd}
            className="mt-4 inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Añadir ejercicio
          </button>
        </section>
      </div>
    </div>
  )
}
