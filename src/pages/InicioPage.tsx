import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, CheckSquare, TrendingUp, Flame, Calendar } from 'lucide-react'
import { useTasks } from '@/hooks/useTasks'
import { useToday } from '@/hooks/useToday'
import { subscribeNutritionEntries } from '@/services/nutrition.service'
import { subscribeCalendarEvents } from '@/services/calendar.service'
import { subscribeDiaryEntries } from '@/services/diary.service'
import type { FoodEntry } from '@/types/nutrition'
import type { CalendarEvent } from '@/types/event'
import type { DiaryEntry } from '@/types/diary'

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28 } },
}

function Card({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <motion.div variants={item} className={`rounded-2xl bg-[#1E1E28] border border-white/8 p-5 ${className}`}>
      {children}
    </motion.div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold tracking-widest uppercase text-white/25 mb-2">{children}</p>
}

export function InicioPage() {
  const { tasks, pending, completed, loading: tasksLoading } = useTasks()
  const { today, greeting } = useToday()
  const [nutritionEntries, setNutritionEntries] = useState<FoodEntry[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const todayStr = new Date().toISOString().split('T')[0] // YYYY-MM-DD format

  const todayTasks = useMemo(() => {
    return tasks.filter((task) => !task.completed).slice(0, 4)
  }, [tasks])

  const pendingTasks = useMemo(() => tasks.filter((task) => !task.completed), [tasks])

  // Calculate today's nutrition totals
  const todayNutrition = useMemo(() => {
    const todayEntries = nutritionEntries.filter(entry => {
      const entryDate = new Date(entry.createdAt).toISOString().split('T')[0]
      return entryDate === todayStr
    })

    return todayEntries.reduce((totals, entry) => ({
      calories: totals.calories + entry.kcal,
      protein: totals.protein + entry.protein,
      carbs: totals.carbs + entry.carbs,
      fat: totals.fat + entry.fat,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
  }, [nutritionEntries, todayStr])

  // Calculate today's events
  const todayEvents = useMemo(() => {
    return events
      .filter(event => {
        const eventDate = new Date(event.date).toISOString().split('T')[0]
        return eventDate === todayStr
      })
      .sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time)
        return 0
      })
      .slice(0, 3) // Show only first 3 events
  }, [events, todayStr])

  // Calculate streak (consecutive days with diary entries)
  const streak = useMemo(() => {
    if (diaryEntries.length === 0) return 0

    // Get unique dates with diary entries, sorted descending
    const diaryDates = [...new Set(
      diaryEntries.map(entry => new Date(entry.createdAt).toISOString().split('T')[0])
    )].sort().reverse()

    if (diaryDates.length === 0) return 0

    let currentStreak = 0
    const today = new Date().toISOString().split('T')[0]

    // Check if today has an entry
    if (!diaryDates.includes(today)) return 0

    // Count consecutive days backwards from today
    let checkDate = new Date(today)
    while (diaryDates.includes(checkDate.toISOString().split('T')[0])) {
      currentStreak++
      checkDate.setDate(checkDate.getDate() - 1)
    }

    return currentStreak
  }, [diaryEntries])

  const currentMonthKey = new Date().toISOString().slice(0, 7) // YYYY-MM format

  useEffect(() => {
    const unsubscribeNutrition = subscribeNutritionEntries((fetchedEntries) => {
      setNutritionEntries(fetchedEntries)
    })

    const unsubscribeEvents = subscribeCalendarEvents(currentMonthKey, (fetchedEvents) => {
      setEvents(fetchedEvents)
    })

    const unsubscribeDiary = subscribeDiaryEntries(currentMonthKey, (fetchedEntries) => {
      setDiaryEntries(fetchedEntries)
    })

    setLoading(false)

    return () => {
      unsubscribeNutrition()
      unsubscribeEvents()
      unsubscribeDiary()
    }
  }, [currentMonthKey])

  const isLoading = loading || tasksLoading

  if (isLoading) {
    return (
      <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-white/10 rounded-lg mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-white/5 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <p className="text-white/35 text-sm capitalize">{today}</p>
        <h1 className="text-3xl font-bold text-white/90 mt-1">{greeting}, Daniel.</h1>
      </motion.div>

      <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        <Card className="lg:col-span-3 bg-linear-to-br from-blue-950/60 to-[#1E1E28] border-blue-900/30 flex gap-4">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
            <Sparkles size={18} className="text-blue-400" />
          </div>
          <div>
            <Label>Briefing IA · Hoy</Label>
            <p className="text-sm text-white/55 leading-relaxed">
              {pendingTasks.length > 0 ? (
                <>Tienes <span className="text-white/85 font-medium">{pendingTasks.length} tareas pendientes</span></>
              ) : (
                <>¡Todas tus tareas están completadas! 🎉</>
              )}
              {todayNutrition.calories > 0 && (
                <> y has consumido <span className="text-white/85 font-medium">{Math.round(todayNutrition.calories)} kcal</span></>
              )}
              {streak > 0 && (
                <>. Streak: <span className="text-emerald-400 font-semibold">{streak} 🔥</span></>
              )}
              {todayEvents.length > 0 && (
                <>. Tienes {todayEvents.length} evento{todayEvents.length !== 1 ? 's' : ''} programado{todayEvents.length !== 1 ? 's' : ''} para hoy.</>
              )}
              {!pendingTasks.length && todayNutrition.calories > 0 && streak > 0 ? ' Hoy es un día excelente para mantener el momentum.' : ' Hoy es un buen día para rendir.'}
            </p>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Flame size={14} className="text-orange-400" />
            <Label>Macros · Hoy</Label>
            <span className="ml-auto text-[11px] text-white/25">{Math.round(todayNutrition.calories)} / 2200 kcal</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/6 overflow-hidden mb-4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((todayNutrition.calories / 2200) * 100, 100)}%` }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="h-full rounded-full bg-linear-to-r from-orange-500 to-amber-400"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Proteína', value: `${Math.round(todayNutrition.protein)}g`, color: 'text-blue-400' },
              { label: 'Carbos', value: `${Math.round(todayNutrition.carbs)}g`, color: 'text-amber-400' },
              { label: 'Grasa', value: `${Math.round(todayNutrition.fat)}g`, color: 'text-rose-400' },
            ].map((m) => (
              <div key={m.label} className="bg-white/4 rounded-xl p-3 text-center">
                <p className={`text-base font-semibold ${m.color}`}>{m.value}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare size={14} className="text-emerald-400" />
            <Label>Tareas de hoy</Label>
            <span className="ml-auto text-[11px] text-white/25">{completed} / {tasks.length}</span>
          </div>
          <div className="space-y-2">
            {todayTasks.length > 0 ? (
              todayTasks.slice(0, 4).map((task) => (
                <div key={task.id} className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${task.completed ? 'bg-emerald-500/20' : 'border border-white/15'}`}>
                    {task.completed && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                  </div>
                  <span className={`text-sm ${task.completed ? 'line-through text-white/25' : 'text-white/60'}`}>{task.title}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-white/30">No hay tareas programadas para hoy</p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-violet-400" />
            <Label>Métricas</Label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Peso', value: '78.4 kg', delta: '-0.3', pos: true },
              { label: 'Sueño', value: '7h 20m', delta: '+20m', pos: true },
              { label: 'Pasos', value: '8,240', delta: '-1.2k', pos: false },
              { label: 'Streak', value: `${streak} días`, delta: '+1', pos: true },
            ].map((s) => (
              <div key={s.label} className="bg-white/4 rounded-xl p-3">
                <p className="text-[10px] text-white/30 mb-1">{s.label}</p>
                <p className="text-sm font-semibold text-white/80">{s.value}</p>
                <p className={`text-[10px] font-medium mt-0.5 ${s.pos ? 'text-emerald-400' : 'text-rose-400'}`}>{s.delta}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="md:col-span-2 lg:col-span-3">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={14} className="text-cyan-400" />
            <Label>Próximos eventos · Hoy</Label>
          </div>
          <div className="space-y-2">
            {todayEvents.length > 0 ? (
              todayEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/2 border border-white/4">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    event.category === 'trabajo' ? 'bg-blue-400' :
                    event.category === 'personal' ? 'bg-purple-400' :
                    event.category === 'salud' ? 'bg-emerald-400' :
                    'bg-gray-400'
                  }`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white/80">{event.title}</p>
                    {event.time && <p className="text-xs text-white/40">{event.time}</p>}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-white/30">No hay eventos programados para hoy</p>
            )}
          </div>
        </Card>

      </motion.div>
    </div>
  )
}