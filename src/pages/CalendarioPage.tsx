import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, Plus, X, Clock, Palette, Tag, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react'
import { addCalendarEvent, subscribeCalendarEvents, updateCalendarEvent, deleteCalendarEvent } from '@/services/calendar.service'
import type { CalendarEvent, EventCategory, EventColor } from '@/types/event'

const categoryLabels: Record<EventCategory, string> = {
  personal: 'Personal',
  familia: 'Familia',
  salud: 'Salud',
  trabajo: 'Trabajo',
}

const categoryColors: Record<EventCategory, string> = {
  personal: 'bg-blue-500',
  familia: 'bg-emerald-500',
  salud: 'bg-rose-500',
  trabajo: 'bg-amber-500',
}

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const dayCount = new Date(year, month + 1, 0).getDate()
  const startOffset = (firstDay.getDay() + 6) % 7 // Monday first
  return Array.from({ length: startOffset + dayCount }, (_, index) => {
    const dayNumber = index - startOffset + 1
    return dayNumber > 0 ? dayNumber : null
  })
}

export function CalendarioPage() {
  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showEventForm, setShowEventForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)

  // Form state
  const [eventTitle, setEventTitle] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [eventColor, setEventColor] = useState<EventColor>('#3B82F6')
  const [eventCategory, setEventCategory] = useState<EventCategory>('personal')

  const monthKey = formatMonthKey(currentMonth)
  const monthDays = useMemo(() => getMonthDays(currentMonth.getFullYear(), currentMonth.getMonth()), [currentMonth])

  // Group events by date
  const eventsByDate = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {}
    events.forEach(event => {
      if (!grouped[event.date]) {
        grouped[event.date] = []
      }
      grouped[event.date].push(event)
    })
    return grouped
  }, [events])

  // Get events for selected date
  const selectedDateEvents = selectedDate ? eventsByDate[selectedDate] || [] : []

  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeCalendarEvents(monthKey, (fetchedEvents) => {
      setEvents(fetchedEvents)
      setLoading(false)
    })

    return unsubscribe
  }, [monthKey])

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev)
      if (direction === 'prev') {
        newMonth.setMonth(prev.getMonth() - 1)
      } else {
        newMonth.setMonth(prev.getMonth() + 1)
      }
      return newMonth
    })
    setSelectedDate(null)
  }

  const handleDayClick = (dayNumber: number) => {
    const clickedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayNumber)
    const dayKey = getDayKey(clickedDate)
    setSelectedDate(dayKey)
    setShowEventForm(false)
    setEditingEvent(null)
  }

  const handleAddEvent = () => {
    if (!selectedDate || !eventTitle.trim()) return

    const eventData = {
      title: eventTitle.trim(),
      date: selectedDate,
      time: eventTime || undefined,
      color: eventColor,
      category: eventCategory,
    }

    if (editingEvent) {
      updateCalendarEvent(editingEvent.id, eventData)
    } else {
      addCalendarEvent(eventData)
    }

    resetForm()
  }

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event)
    setEventTitle(event.title)
    setEventTime(event.time || '')
    setEventColor(event.color as EventColor)
    setEventCategory(event.category)
    setShowEventForm(true)
  }

  const handleDeleteEvent = (eventId: string) => {
    if (confirm('¿Estás seguro de que quieres eliminar este evento?')) {
      deleteCalendarEvent(eventId)
    }
  }

  const resetForm = () => {
    setEventTitle('')
    setEventTime('')
    setEventColor('#3B82F6')
    setEventCategory('personal')
    setShowEventForm(false)
    setEditingEvent(null)
  }

  const isToday = (dayNumber: number) => {
    const today = new Date()
    return today.getDate() === dayNumber &&
           today.getMonth() === currentMonth.getMonth() &&
           today.getFullYear() === currentMonth.getFullYear()
  }

  const isSelected = (dayNumber: number) => {
    if (!selectedDate) return false
    const [year, month, day] = selectedDate.split('-').map(Number)
    return day === dayNumber &&
           month - 1 === currentMonth.getMonth() &&
           year === currentMonth.getFullYear()
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/35">Calendario · Eventos</p>
            <h1 className="text-3xl font-bold text-white/90 mt-1">Calendario</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateMonth('prev')}
              className="w-10 h-10 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center hover:border-white/14 transition"
            >
              <ArrowLeft size={18} className="text-white/70" />
            </button>
            <div className="text-center min-w-35">
              <p className="text-sm text-white/35">{currentMonth.getFullYear()}</p>
              <p className="text-lg font-semibold text-white/90">{monthNames[currentMonth.getMonth()]}</p>
            </div>
            <button
              onClick={() => navigateMonth('next')}
              className="w-10 h-10 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center hover:border-white/14 transition"
            >
              <ArrowRight size={18} className="text-white/70" />
            </button>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-3">
          <div className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-4">
              {dayNames.map(day => (
                <div key={day} className="text-center text-sm font-medium text-white/40 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map((dayNumber, index) => (
                <div
                  key={index}
                  className={`aspect-square rounded-2xl border transition cursor-pointer ${
                    dayNumber
                      ? isSelected(dayNumber)
                        ? 'border-blue-500/40 bg-blue-500/10'
                        : isToday(dayNumber)
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-white/8 bg-white/5 hover:border-white/14'
                      : 'border-transparent'
                  }`}
                  onClick={() => dayNumber && handleDayClick(dayNumber)}
                >
                  {dayNumber && (
                    <div className="h-full p-2 flex flex-col">
                      <span className={`text-sm font-medium mb-1 ${
                        isToday(dayNumber) ? 'text-emerald-300' : 'text-white/70'
                      }`}>
                        {dayNumber}
                      </span>
                      <div className="flex flex-wrap gap-0.5 flex-1">
                        {(eventsByDate[getDayKey(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayNumber))] || [])
                          .slice(0, 3)
                          .map(event => (
                          <div
                            key={event.id}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: event.color }}
                          />
                        ))}
                        {(eventsByDate[getDayKey(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayNumber))] || []).length > 3 && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="lg:col-span-1">
          <AnimatePresence mode="wait">
            {selectedDate ? (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white/90">
                    {new Date(selectedDate).toLocaleDateString('es-ES', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long'
                    })}
                  </h3>
                  <button
                    onClick={() => setShowEventForm(true)}
                    className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center hover:bg-blue-500 transition"
                  >
                    <Plus size={16} className="text-white" />
                  </button>
                </div>

                {selectedDateEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar size={32} className="text-white/20 mx-auto mb-3" />
                    <p className="text-sm text-white/40">No hay eventos para este día</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDateEvents.map(event => (
                      <div
                        key={event.id}
                        className="rounded-2xl border border-white/8 bg-white/5 p-3 group hover:border-white/14 transition cursor-pointer"
                        onClick={() => handleEditEvent(event)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: event.color }}
                              />
                              <h4 className="text-sm font-medium text-white/90 truncate">
                                {event.title}
                              </h4>
                            </div>
                            {event.time && (
                              <div className="flex items-center gap-1 text-xs text-white/50">
                                <Clock size={12} />
                                {event.time}
                              </div>
                            )}
                            <div className="flex items-center gap-1 mt-1">
                              <div className={`px-2 py-0.5 rounded-full text-xs ${categoryColors[event.category]} text-white`}>
                                {categoryLabels[event.category]}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteEvent(event.id)
                            }}
                            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition"
                          >
                            <Trash2 size={12} className="text-red-400" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5 text-center"
              >
                <Calendar size={32} className="text-white/20 mx-auto mb-3" />
                <p className="text-sm text-white/40">Selecciona un día para ver los eventos</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Event Form Modal */}
      <AnimatePresence>
        {showEventForm && (
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
              className="w-full max-w-md rounded-3xl border border-white/8 bg-[#1E1E28] p-6 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white/90">
                  {editingEvent ? 'Editar evento' : 'Nuevo evento'}
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
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                    placeholder="Título del evento"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Hora (opcional)</label>
                  <input
                    type="time"
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Color</label>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'].map(color => (
                      <button
                        key={color}
                        onClick={() => setEventColor(color as EventColor)}
                        className={`w-8 h-8 rounded-full border-2 transition ${
                          eventColor === color ? 'border-white/40' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Categoría</label>
                  <select
                    value={eventCategory}
                    onChange={(e) => setEventCategory(e.target.value as EventCategory)}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                  >
                    <option value="personal">Personal</option>
                    <option value="familia">Familia</option>
                    <option value="salud">Salud</option>
                    <option value="trabajo">Trabajo</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleAddEvent}
                    disabled={!eventTitle.trim()}
                    className="flex-1 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingEvent ? 'Actualizar' : 'Crear'} evento
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