import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Target, Calendar, CheckCircle, Circle, X, Edit, Trash2, MapPin, Home, Users, DollarSign, User } from 'lucide-react'
import { addPlan, subscribePlans, updatePlan, deletePlan, updatePlanStep, addPlanStep, deletePlanStep } from '@/services/plans.service'
import type { Plan, PlanCategory, PlanStatus, PlanStep } from '@/types/plan'

const categoryIcons = {
  viaje: MapPin,
  hogar: Home,
  familia: Users,
  finanzas: DollarSign,
  personal: User,
}

export function PlanesPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<PlanCategory | 'todos'>('todos')

  // Form state
  const [planTitle, setPlanTitle] = useState('')
  const [planDescription, setPlanDescription] = useState('')
  const [planCategory, setPlanCategory] = useState<PlanCategory>('personal')
  const [planStatus, setPlanStatus] = useState<PlanStatus>('idea')
  const [planTargetDate, setPlanTargetDate] = useState('')
  const [planSteps, setPlanSteps] = useState<string[]>([''])

  useEffect(() => {
    const unsubscribe = subscribePlans((fetchedPlans) => {
      setPlans(fetchedPlans)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const filteredPlans = useMemo(() => {
    if (selectedCategory === 'todos') return plans
    return plans.filter(plan => plan.category === selectedCategory)
  }, [plans, selectedCategory])

  const plansByCategory = useMemo(() => {
    const grouped: Record<PlanCategory, Plan[]> = {
      viaje: [],
      hogar: [],
      familia: [],
      finanzas: [],
      personal: [],
    }

    filteredPlans.forEach(plan => {
      grouped[plan.category].push(plan)
    })

    return grouped
  }, [filteredPlans])

  const handleAddPlan = () => {
    if (!planTitle.trim() || !planDescription.trim()) return

    const steps: PlanStep[] = planSteps
      .filter(step => step.trim())
      .map(step => ({
        id: Date.now().toString() + Math.random(),
        title: step.trim(),
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))

    const planData = {
      title: planTitle.trim(),
      description: planDescription.trim(),
      category: planCategory,
      status: planStatus,
      targetDate: planTargetDate || undefined,
      steps,
    }

    if (editingPlan) {
      updatePlan(editingPlan.id, planData)
    } else {
      addPlan(planData)
    }

    resetForm()
  }

  const handleEditPlan = (plan: Plan) => {
    setEditingPlan(plan)
    setPlanTitle(plan.title)
    setPlanDescription(plan.description)
    setPlanCategory(plan.category)
    setPlanStatus(plan.status)
    setPlanTargetDate(plan.targetDate || '')
    setPlanSteps(plan.steps.map(step => step.title))
    setShowForm(true)
  }

  const handleDeletePlan = (id: string) => {
    if (confirm('¿Estás seguro de que quieres eliminar este plan?')) {
      deletePlan(id)
    }
  }

  const handleToggleStep = (planId: string, stepId: string, completed: boolean) => {
    updatePlanStep(planId, stepId, completed)
  }

  const handleAddStepToPlan = (planId: string, stepTitle: string) => {
    if (stepTitle.trim()) {
      addPlanStep(planId, stepTitle.trim())
    }
  }

  const handleDeleteStep = (planId: string, stepId: string) => {
    deletePlanStep(planId, stepId)
  }

  const resetForm = () => {
    setPlanTitle('')
    setPlanDescription('')
    setPlanCategory('personal')
    setPlanStatus('idea')
    setPlanTargetDate('')
    setPlanSteps([''])
    setShowForm(false)
    setEditingPlan(null)
  }

  const addStepField = () => {
    setPlanSteps([...planSteps, ''])
  }

  const updateStepField = (index: number, value: string) => {
    const newSteps = [...planSteps]
    newSteps[index] = value
    setPlanSteps(newSteps)
  }

  const removeStepField = (index: number) => {
    if (planSteps.length > 1) {
      setPlanSteps(planSteps.filter((_, i) => i !== index))
    }
  }

  const getProgressPercentage = (plan: Plan) => {
    if (plan.steps.length === 0) return 0
    const completedSteps = plan.steps.filter(step => step.completed).length
    return Math.round((completedSteps / plan.steps.length) * 100)
  }

  const renderPlanCard = (plan: Plan) => {
    const progress = getProgressPercentage(plan)
    const Icon = categoryIcons[plan.category]

    return (
      <motion.div
        key={plan.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-white/8 bg-[#1E1E28] p-6 group hover:border-white/14 transition"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              plan.category === 'viaje' ? 'bg-emerald-500/10' :
              plan.category === 'hogar' ? 'bg-blue-500/10' :
              plan.category === 'familia' ? 'bg-rose-500/10' :
              plan.category === 'finanzas' ? 'bg-amber-500/10' :
              'bg-purple-500/10'
            }`}>
              <Icon size={20} className={
                plan.category === 'viaje' ? 'text-emerald-400' :
                plan.category === 'hogar' ? 'text-blue-400' :
                plan.category === 'familia' ? 'text-rose-400' :
                plan.category === 'finanzas' ? 'text-amber-400' :
                'text-purple-400'
              } />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white/90 mb-1">
                {plan.title}
              </h3>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-xs ${
                  plan.status === 'idea' ? 'bg-gray-500/20 text-gray-300' :
                  plan.status === 'planificando' ? 'bg-blue-500/20 text-blue-300' :
                  plan.status === 'activo' ? 'bg-emerald-500/20 text-emerald-300' :
                  'bg-green-600/20 text-green-300'
                }`}>
                  {plan.status === 'idea' ? 'Idea' :
                   plan.status === 'planificando' ? 'Planificando' :
                   plan.status === 'activo' ? 'Activo' : 'Completado'}
                </span>
                {plan.targetDate && (
                  <span className="text-xs text-white/40 flex items-center gap-1">
                    <Calendar size={12} />
                    {new Date(plan.targetDate).toLocaleDateString('es-ES', {
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-1 transition opacity-100 md:opacity-0 md:group-hover:opacity-100">
            <button
              onClick={() => handleEditPlan(plan)}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
            >
              <Edit size={12} className="text-white/70" />
            </button>
            <button
              onClick={() => handleDeletePlan(plan.id)}
              className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition"
            >
              <Trash2 size={12} className="text-red-400" />
            </button>
          </div>
        </div>

        <p className="text-sm text-white/70 mb-4 line-clamp-2">
          {plan.description}
        </p>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-white/50 mb-1">
            <span>Progreso</span>
            <span>{progress}% ({plan.steps.filter(s => s.completed).length}/{plan.steps.length})</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        {plan.steps.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-white/50 uppercase tracking-wider">
              Pasos ({plan.steps.filter(s => s.completed).length}/{plan.steps.length})
            </h4>
            {plan.steps.slice(0, 3).map(step => (
              <div
                key={step.id}
                className="flex items-center gap-2 text-sm"
              >
                <button
                  onClick={() => handleToggleStep(plan.id, step.id, !step.completed)}
                  className={`w-4 h-4 rounded border flex items-center justify-center transition ${
                    step.completed
                      ? 'bg-emerald-500 border-emerald-500'
                      : 'border-white/30 hover:border-white/50'
                  }`}
                >
                  {step.completed && <CheckCircle size={10} className="text-white" />}
                </button>
                <span className={`flex-1 ${step.completed ? 'line-through text-white/40' : 'text-white/80'}`}>
                  {step.title}
                </span>
              </div>
            ))}
            {plan.steps.length > 3 && (
              <p className="text-xs text-white/40">
                +{plan.steps.length - 3} pasos más...
              </p>
            )}
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/35">Objetivos · Metas</p>
            <h1 className="text-3xl font-bold text-white/90 mt-1">Planes</h1>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            <Plus size={16} /> Nuevo plan
          </button>
        </div>
      </motion.div>

      {/* Category Filter */}
      <div className="mb-6">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedCategory('todos')}
            className={`px-4 py-2 rounded-xl text-sm transition ${
              selectedCategory === 'todos'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'bg-white/5 text-white/60 hover:text-white/80 border border-transparent'
            }`}
          >
            Todos
          </button>
          {Object.entries({
            viaje: { label: 'Viaje', emoji: '✈️' },
            hogar: { label: 'Hogar', emoji: '🏠' },
            familia: { label: 'Familia', emoji: '👨‍👩‍👧' },
            finanzas: { label: 'Finanzas', emoji: '💰' },
            personal: { label: 'Personal', emoji: '🎯' },
          }).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setSelectedCategory(key as PlanCategory)}
              className={`px-4 py-2 rounded-xl text-sm transition ${
                selectedCategory === key
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-white/5 text-white/60 hover:text-white/80 border border-transparent'
              }`}
            >
              {config.emoji} {config.label}
            </button>
          ))}
        </div>
      </div>

      {/* Plans Grid */}
      <div className="space-y-8">
        {Object.entries(plansByCategory).map(([category, categoryPlans]) => {
          if (categoryPlans.length === 0) return null

          const categoryConfig = {
            viaje: { label: 'Viaje', emoji: '✈️', color: 'text-emerald-400' },
            hogar: { label: 'Hogar', emoji: '🏠', color: 'text-blue-400' },
            familia: { label: 'Familia', emoji: '👨‍👩‍👧', color: 'text-rose-400' },
            finanzas: { label: 'Finanzas', emoji: '💰', color: 'text-amber-400' },
            personal: { label: 'Personal', emoji: '🎯', color: 'text-purple-400' },
          }[category as PlanCategory]

          return (
            <div key={category}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">{categoryConfig.emoji}</span>
                <h2 className={`text-xl font-semibold ${categoryConfig.color}`}>
                  {categoryConfig.label}
                </h2>
                <span className="text-sm text-white/40">
                  ({categoryPlans.length})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryPlans.map(renderPlanCard)}
              </div>
            </div>
          )
        })}
      </div>

      {filteredPlans.length === 0 && !loading && (
        <div className="text-center py-12">
          <Target size={48} className="text-white/20 mx-auto mb-4" />
          <p className="text-lg text-white/40 mb-2">
            {selectedCategory === 'todos' ? 'No tienes planes' : `No hay planes en ${selectedCategory}`}
          </p>
          <p className="text-sm text-white/30">
            ¡Crea tu primer plan para empezar a trabajar en tus metas!
          </p>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={resetForm}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-2xl rounded-3xl border border-white/8 bg-[#1E1E28] p-6 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white/90">
                  {editingPlan ? 'Editar plan' : 'Nuevo plan'}
                </h3>
                <button
                  onClick={resetForm}
                  className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
                >
                  <X size={16} className="text-white/70" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Título</label>
                  <input
                    value={planTitle}
                    onChange={(e) => setPlanTitle(e.target.value)}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                    placeholder="Título del plan"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Descripción</label>
                  <textarea
                    value={planDescription}
                    onChange={(e) => setPlanDescription(e.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none resize-none"
                    placeholder="Describe tu plan..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Categoría</label>
                    <select
                      value={planCategory}
                      onChange={(e) => setPlanCategory(e.target.value as PlanCategory)}
                      className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                    >
                      <option value="personal">🎯 Personal</option>
                      <option value="viaje">✈️ Viaje</option>
                      <option value="hogar">🏠 Hogar</option>
                      <option value="familia">👨‍👩‍👧 Familia</option>
                      <option value="finanzas">💰 Finanzas</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Estado</label>
                    <select
                      value={planStatus}
                      onChange={(e) => setPlanStatus(e.target.value as PlanStatus)}
                      className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                    >
                      <option value="idea">💡 Idea</option>
                      <option value="planificando">📝 Planificando</option>
                      <option value="activo">🚀 Activo</option>
                      <option value="completado">✅ Completado</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Fecha objetivo (opcional)</label>
                  <input
                    type="date"
                    value={planTargetDate}
                    onChange={(e) => setPlanTargetDate(e.target.value)}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Pasos del plan</label>
                    <button
                      onClick={addStepField}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      + Añadir paso
                    </button>
                  </div>
                  <div className="space-y-2">
                    {planSteps.map((step, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          value={step}
                          onChange={(e) => updateStepField(index, e.target.value)}
                          className="flex-1 rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                          placeholder={`Paso ${index + 1}`}
                        />
                        {planSteps.length > 1 && (
                          <button
                            onClick={() => removeStepField(index)}
                            className="w-8 h-8 rounded-xl bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition"
                          >
                            <X size={14} className="text-red-400" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleAddPlan}
                    disabled={!planTitle.trim() || !planDescription.trim()}
                    className="flex-1 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingPlan ? 'Actualizar plan' : 'Crear plan'}
                  </button>
                  <button
                    onClick={resetForm}
                    className="px-5 py-3 text-sm text-white/70 hover:text-white transition"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}