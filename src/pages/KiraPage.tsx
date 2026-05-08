import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Calendar, CheckCircle, X, Edit, Trash2, Sparkles, Heart } from 'lucide-react'
import { addKiraActivity, subscribeKiraActivities, updateKiraActivity, deleteKiraActivity, addKiraMilestone, subscribeKiraMilestones, updateKiraMilestone, deleteKiraMilestone } from '@/services/kira.service'
import type { KiraActivity, KiraMilestone, KiraActivityCategory } from '@/types/kira'

const categoryInfo = {
  juego: { label: 'Juego', color: 'bg-pink-500', emoji: '🎮' },
  aprendizaje: { label: 'Aprendizaje', color: 'bg-purple-500', emoji: '📚' },
  deporte: { label: 'Deporte', color: 'bg-blue-500', emoji: '⚽' },
  cultura: { label: 'Cultura', color: 'bg-emerald-500', emoji: '🎨' },
  familia: { label: 'Familia', color: 'bg-rose-500', emoji: '👨‍👩‍👧' },
}

export function KiraPage() {
  const [activities, setActivities] = useState<KiraActivity[]>([])
  const [milestones, setMilestones] = useState<KiraMilestone[]>([])
  const [loading, setLoading] = useState(true)
  const [showActivityForm, setShowActivityForm] = useState(false)
  const [showMilestoneForm, setShowMilestoneForm] = useState(false)
  const [editingActivity, setEditingActivity] = useState<KiraActivity | null>(null)
  const [editingMilestone, setEditingMilestone] = useState<KiraMilestone | null>(null)

  // Activity form state
  const [activityTitle, setActivityTitle] = useState('')
  const [activityDate, setActivityDate] = useState('')
  const [activityCategory, setActivityCategory] = useState<KiraActivityCategory>('juego')
  const [activityNotes, setActivityNotes] = useState('')

  // Milestone form state
  const [milestoneTitle, setMilestoneTitle] = useState('')
  const [milestoneDate, setMilestoneDate] = useState('')
  const [milestoneDescription, setMilestoneDescription] = useState('')
  const [milestoneEmoji, setMilestoneEmoji] = useState('🎉')

  useEffect(() => {
    const unsubscribeActivities = subscribeKiraActivities((fetchedActivities) => {
      setActivities(fetchedActivities)
      setLoading(false)
    })

    const unsubscribeMilestones = subscribeKiraMilestones((fetchedMilestones) => {
      setMilestones(fetchedMilestones)
    })

    return () => {
      unsubscribeActivities()
      unsubscribeMilestones()
    }
  }, [])

  const handleAddActivity = () => {
    if (!activityTitle.trim() || !activityDate) return

    const activityData = {
      title: activityTitle.trim(),
      date: activityDate,
      category: activityCategory,
      notes: activityNotes.trim() || undefined,
      completed: false,
    }

    if (editingActivity) {
      updateKiraActivity(editingActivity.id, activityData)
    } else {
      addKiraActivity(activityData)
    }

    resetActivityForm()
  }

  const handleAddMilestone = () => {
    if (!milestoneTitle.trim() || !milestoneDate || !milestoneDescription.trim()) return

    const milestoneData = {
      title: milestoneTitle.trim(),
      date: milestoneDate,
      description: milestoneDescription.trim(),
      emoji: milestoneEmoji,
    }

    if (editingMilestone) {
      updateKiraMilestone(editingMilestone.id, milestoneData)
    } else {
      addKiraMilestone(milestoneData)
    }

    resetMilestoneForm()
  }

  const handleToggleComplete = (activity: KiraActivity) => {
    updateKiraActivity(activity.id, { completed: !activity.completed })
  }

  const handleEditActivity = (activity: KiraActivity) => {
    setEditingActivity(activity)
    setActivityTitle(activity.title)
    setActivityDate(activity.date)
    setActivityCategory(activity.category)
    setActivityNotes(activity.notes || '')
    setShowActivityForm(true)
  }

  const handleEditMilestone = (milestone: KiraMilestone) => {
    setEditingMilestone(milestone)
    setMilestoneTitle(milestone.title)
    setMilestoneDate(milestone.date)
    setMilestoneDescription(milestone.description)
    setMilestoneEmoji(milestone.emoji)
    setShowMilestoneForm(true)
  }

  const handleDeleteActivity = (id: string) => {
    if (confirm('¿Estás seguro de que quieres eliminar esta actividad?')) {
      deleteKiraActivity(id)
    }
  }

  const handleDeleteMilestone = (id: string) => {
    if (confirm('¿Estás seguro de que quieres eliminar este hito?')) {
      deleteKiraMilestone(id)
    }
  }

  const resetActivityForm = () => {
    setActivityTitle('')
    setActivityDate('')
    setActivityCategory('juego')
    setActivityNotes('')
    setShowActivityForm(false)
    setEditingActivity(null)
  }

  const resetMilestoneForm = () => {
    setMilestoneTitle('')
    setMilestoneDate('')
    setMilestoneDescription('')
    setMilestoneEmoji('🎉')
    setShowMilestoneForm(false)
    setEditingMilestone(null)
  }

  const upcomingActivities = activities.filter(activity => !activity.completed)
  const completedActivities = activities.filter(activity => activity.completed)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    })
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-6xl mx-auto">
      {/* Header especial */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <div className="inline-flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-linear-to-br from-pink-400 to-purple-500 flex items-center justify-center shadow-lg">
            <span className="text-3xl">👧</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-linear-to-r from-pink-400 to-purple-500 bg-clip-text text-transparent">
              Kira
            </h1>
            <p className="text-white/60 text-sm">Actividades y momentos especiales</p>
          </div>
        </div>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => setShowActivityForm(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-pink-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-pink-400 shadow-lg"
          >
            <Plus size={16} /> Nueva actividad
          </button>
          <button
            onClick={() => setShowMilestoneForm(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-purple-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-400 shadow-lg"
          >
            <Sparkles size={16} /> Nuevo hito
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Próximas actividades */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-pink-500/10 flex items-center justify-center">
              <Calendar size={20} className="text-pink-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Actividades</p>
              <h2 className="text-xl font-semibold text-white/90 mt-1">Próximas actividades</h2>
            </div>
          </div>

          {upcomingActivities.length === 0 ? (
            <div className="rounded-3xl border border-white/8 bg-[#1E1E28] p-8 text-center">
              <Calendar size={32} className="text-white/20 mx-auto mb-3" />
              <p className="text-sm text-white/40">No hay actividades pendientes</p>
              <p className="text-xs text-white/30 mt-1">¡Añade una nueva actividad!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingActivities.map(activity => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-3xl border border-white/8 bg-[#1E1E28] p-4 group hover:border-white/14 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <button
                          onClick={() => handleToggleComplete(activity)}
                          className="w-6 h-6 rounded-full border-2 border-pink-400 flex items-center justify-center hover:bg-pink-400/20 transition"
                        >
                          {activity.completed && <CheckCircle size={14} className="text-pink-400" />}
                        </button>
                        <h3 className="text-sm font-medium text-white/90 truncate">
                          {activity.title}
                        </h3>
                        <span className="text-lg">{categoryInfo[activity.category].emoji}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`px-2 py-1 rounded-full text-xs ${categoryInfo[activity.category].color} text-white`}>
                          {categoryInfo[activity.category].label}
                        </div>
                        <span className="text-xs text-white/40">
                          {formatDate(activity.date)}
                        </span>
                      </div>
                      {activity.notes && (
                        <p className="text-xs text-white/50 line-clamp-2">
                          {activity.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => handleEditActivity(activity)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
                      >
                        <Edit size={12} className="text-white/70" />
                      </button>
                      <button
                        onClick={() => handleDeleteActivity(activity.id)}
                        className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition"
                      >
                        <Trash2 size={12} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Actividades completadas */}
          {completedActivities.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-medium text-white/60 mb-3">Completadas</h3>
              <div className="space-y-2">
                {completedActivities.slice(0, 5).map(activity => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 rounded-2xl bg-green-500/10 p-3"
                  >
                    <CheckCircle size={16} className="text-green-400 shrink-0" />
                    <span className="text-sm text-white/70 line-through truncate">
                      {activity.title}
                    </span>
                    <span className="text-xs text-white/40 shrink-0">
                      {categoryInfo[activity.category].emoji}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Hitos */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center">
              <Heart size={20} className="text-purple-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Momentos</p>
              <h2 className="text-xl font-semibold text-white/90 mt-1">Hitos importantes</h2>
            </div>
          </div>

          {milestones.length === 0 ? (
            <div className="rounded-3xl border border-white/8 bg-[#1E1E28] p-8 text-center">
              <Sparkles size={32} className="text-white/20 mx-auto mb-3" />
              <p className="text-sm text-white/40">No hay hitos registrados</p>
              <p className="text-xs text-white/30 mt-1">¡Registra momentos especiales!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {milestones.map((milestone, index) => (
                <motion.div
                  key={milestone.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="relative"
                >
                  {/* Timeline line */}
                  {index < milestones.length - 1 && (
                    <div className="absolute left-6 top-12 w-0.5 h-full bg-linear-to-b from-purple-500/50 to-transparent" />
                  )}

                  <div className="rounded-3xl border border-white/8 bg-[#1E1E28] p-4 group hover:border-white/14 transition">
                    <div className="flex items-start gap-4">
                      {/* Timeline dot */}
                      <div className="w-12 h-12 rounded-full bg-linear-to-br from-purple-400 to-pink-500 flex items-center justify-center shadow-lg shrink-0">
                        <span className="text-lg">{milestone.emoji}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-white/90 mb-1">
                              {milestone.title}
                            </h3>
                            <p className="text-xs text-purple-300 mb-2">
                              {formatDate(milestone.date)}
                            </p>
                            <p className="text-sm text-white/70">
                              {milestone.description}
                            </p>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => handleEditMilestone(milestone)}
                              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
                            >
                              <Edit size={12} className="text-white/70" />
                            </button>
                            <button
                              onClick={() => handleDeleteMilestone(milestone.id)}
                              className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition"
                            >
                              <Trash2 size={12} className="text-red-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Activity Form Modal */}
      {showActivityForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={resetActivityForm}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md rounded-3xl border border-white/8 bg-[#1E1E28] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white/90">
                {editingActivity ? 'Editar actividad' : 'Nueva actividad'}
              </h3>
              <button
                onClick={resetActivityForm}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
              >
                <X size={16} className="text-white/70" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Título</label>
                <input
                  value={activityTitle}
                  onChange={(e) => setActivityTitle(e.target.value)}
                  className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                  placeholder="Título de la actividad"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Fecha</label>
                <input
                  type="date"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                  className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Categoría</label>
                <select
                  value={activityCategory}
                  onChange={(e) => setActivityCategory(e.target.value as KiraActivityCategory)}
                  className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                >
                  {Object.entries(categoryInfo).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.emoji} {info.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Notas (opcional)</label>
                <textarea
                  value={activityNotes}
                  onChange={(e) => setActivityNotes(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none resize-none"
                  placeholder="Detalles adicionales..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleAddActivity}
                  disabled={!activityTitle.trim() || !activityDate}
                  className="flex-1 rounded-2xl bg-pink-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-pink-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingActivity ? 'Actualizar' : 'Crear'} actividad
                </button>
                <button
                  onClick={resetActivityForm}
                  className="px-5 py-3 text-sm text-white/70 hover:text-white transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Milestone Form Modal */}
      {showMilestoneForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={resetMilestoneForm}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md rounded-3xl border border-white/8 bg-[#1E1E28] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white/90">
                {editingMilestone ? 'Editar hito' : 'Nuevo hito'}
              </h3>
              <button
                onClick={resetMilestoneForm}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
              >
                <X size={16} className="text-white/70" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Título</label>
                <input
                  value={milestoneTitle}
                  onChange={(e) => setMilestoneTitle(e.target.value)}
                  className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                  placeholder="Título del hito"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Fecha</label>
                <input
                  type="date"
                  value={milestoneDate}
                  onChange={(e) => setMilestoneDate(e.target.value)}
                  className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Descripción</label>
                <textarea
                  value={milestoneDescription}
                  onChange={(e) => setMilestoneDescription(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none resize-none"
                  placeholder="Describe este momento especial..."
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Emoji</label>
                <input
                  value={milestoneEmoji}
                  onChange={(e) => setMilestoneEmoji(e.target.value)}
                  className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none text-center"
                  placeholder="🎉"
                  maxLength={2}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleAddMilestone}
                  disabled={!milestoneTitle.trim() || !milestoneDate || !milestoneDescription.trim()}
                  className="flex-1 rounded-2xl bg-purple-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingMilestone ? 'Actualizar' : 'Crear'} hito
                </button>
                <button
                  onClick={resetMilestoneForm}
                  className="px-5 py-3 text-sm text-white/70 hover:text-white transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}