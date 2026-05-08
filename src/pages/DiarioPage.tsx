import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, Sparkles, ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react'
import { addDiaryEntry, subscribeDiaryEntries, updateDiaryEntry } from '@/services/diary.service'
import type { DiaryEntry } from '@/types/diary'

const moodOptions = [
  { value: 1 as const, label: '😢', color: 'bg-rose-500' },
  { value: 2 as const, label: '😕', color: 'bg-orange-500' },
  { value: 3 as const, label: '😐', color: 'bg-amber-400' },
  { value: 4 as const, label: '🙂', color: 'bg-emerald-400' },
  { value: 5 as const, label: '😄', color: 'bg-emerald-600' },
]

const tagsList = ['trabajo', 'familia', 'salud', 'ejercicio', 'descanso'] as const

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const dayCount = new Date(year, month + 1, 0).getDate()
  const startOffset = (firstDay.getDay() + 6) % 7
  return Array.from({ length: startOffset + dayCount }, (_, index) => {
    const dayNumber = index - startOffset + 1
    return dayNumber > 0 ? dayNumber : null
  })
}

export function DiarioPage() {
  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(getDayKey(today))
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [mood, setMood] = useState<DiaryEntry['mood']>(3)
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])

  const monthKey = formatMonthKey(currentMonth)

  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeDiaryEntries(monthKey, (data) => {
      setEntries(data)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [monthKey])

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.date === selectedDate),
    [entries, selectedDate],
  )

  useEffect(() => {
    if (selectedEntry) {
      setMood(selectedEntry.mood)
      setNote(selectedEntry.note)
      setTags(selectedEntry.tags)
    } else {
      setMood(3)
      setNote('')
      setTags([])
    }
  }, [selectedEntry])

  const days = getMonthDays(currentMonth.getFullYear(), currentMonth.getMonth())

  const moodByDay = useMemo(() => {
    return entries.reduce<Record<string, DiaryEntry>>((acc, entry) => {
      acc[entry.date] = entry
      return acc
    }, {})
  }, [entries])

  const monthLabel = `${monthNames[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`

  const toggleTag = (tag: string) => {
    setTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    )
  }

  const handleSave = async () => {
    if (selectedEntry) {
      await updateDiaryEntry(selectedEntry.id, { mood, note, tags })
    } else {
      await addDiaryEntry(selectedDate, mood, note, tags)
    }
  }

  const prevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/35">Diario · Registro emocional</p>
            <h1 className="text-3xl font-bold text-white/90 mt-1">Conecta con tu día</h1>
          </div>
          <div className="rounded-2xl border border-white/8 bg-[#1E1E28]/80 px-4 py-3 text-sm text-white/65">
            {selectedEntry ? 'Entrada guardada' : 'Nueva entrada'}
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                <CalendarDays size={20} className="text-blue-300" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Calendario mensual</p>
                <h2 className="text-lg font-semibold text-white/90 mt-1">Mood por día</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={prevMonth}
                className="rounded-2xl border border-white/8 bg-white/5 p-2 text-white/70 hover:border-white/14"
              >
                <ArrowLeft size={16} />
              </button>
              <div className="text-sm font-semibold text-white/90">{monthLabel}</div>
              <button
                type="button"
                onClick={nextMonth}
                className="rounded-2xl border border-white/8 bg-white/5 p-2 text-white/70 hover:border-white/14"
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 text-[11px] uppercase tracking-[0.25em] text-white/30 mb-3">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((label) => (
              <div key={label} className="text-center">{label}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {days.map((dayNumber, index) => {
              const currentDay = dayNumber
                ? new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayNumber)
                : null
              const dayKey = currentDay ? getDayKey(currentDay) : ''
              const entry = dayKey ? moodByDay[dayKey] : undefined
              const isSelected = dayKey === selectedDate

              return (
                <button
                  key={`${currentMonth.getMonth()}-${index}`}
                  type="button"
                  disabled={!dayNumber}
                  onClick={() => dayNumber && setSelectedDate(dayKey)}
                  className={`min-h-19.5 rounded-3xl border p-3 text-left transition ${
                    !dayNumber
                      ? 'cursor-default border-transparent bg-transparent'
                      : isSelected
                      ? 'border-blue-500/40 bg-blue-500/10'
                      : 'border-white/8 bg-white/5 hover:border-white/14'
                  }`}
                >
                  {dayNumber && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white/90">{dayNumber}</span>
                      {entry && (
                        <span className={`h-2.5 w-2.5 rounded-full ${moodOptions[entry.mood - 1].color}`} />
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-6 rounded-3xl border border-white/8 bg-white/5 p-4">
            <p className="text-xs text-white/40 uppercase tracking-[0.3em]">Leyenda</p>
            <div className="mt-3 grid grid-cols-5 gap-2 text-center text-[11px] text-white/70">
              {moodOptions.map((option) => (
                <div key={option.value} className="rounded-2xl bg-white/5 px-2 py-3">
                  <div className={`mx-auto mb-1 h-6 w-6 rounded-full ${option.color}`} />
                  <span>{option.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <Sparkles size={20} className="text-emerald-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Entrada seleccionada</p>
              <h2 className="text-lg font-semibold text-white/90 mt-1">{selectedDate}</h2>
            </div>
          </div>

          <div className="rounded-3xl border border-white/8 bg-white/5 p-4 mb-5">
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/35 mb-3">Estado</p>
            <div className="grid grid-cols-5 gap-2">
              {moodOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMood(option.value)}
                  className={`rounded-3xl border px-3 py-3 text-lg transition ${
                    mood === option.value
                      ? 'border-blue-500/40 bg-blue-500/10'
                      : 'border-white/8 bg-white/5 hover:border-white/14'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5 rounded-3xl border border-white/8 bg-white/5 p-4">
            <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Nota del día</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={7}
              className="mt-3 w-full rounded-3xl bg-[#1E1E28] border border-white/8 px-4 py-3 text-sm text-white/80 placeholder:text-white/30 focus:outline-none"
              placeholder="Escribe aquí tus reflexiones..."
            />
          </div>

          <div className="mb-5 rounded-3xl border border-white/8 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/35 mb-3">Tags</p>
            <div className="flex flex-wrap gap-2">
              {tagsList.map((tag) => {
                const active = tags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-2xl border px-3 py-2 text-sm transition ${
                      active
                        ? 'border-blue-500/40 bg-blue-500/10 text-white'
                        : 'border-white/8 bg-white/5 text-white/70 hover:border-white/14'
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </div>

          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            <CheckCircle size={16} /> Guardar entrada
          </button>
        </section>
      </div>
    </div>
  )
}
