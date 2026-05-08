import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Headphones, GraduationCap, Plus, X, Edit, Trash2, Filter, Book, Mic, PlayCircle } from 'lucide-react'
import { addBook, subscribeBooks, updateBook, deleteBook, addPodcast, subscribePodcasts, updatePodcast, deletePodcast, addCourse, subscribeCourses, updateCourse, deleteCourse } from '@/services/learning.service'
import type { Book as BookType, Podcast, Course, LearningStatus } from '@/types/learning'

type TabType = 'books' | 'podcasts' | 'courses'

const tabConfig = {
  books: {
    label: 'Libros',
    icon: BookOpen,
    emoji: '📚',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  podcasts: {
    label: 'Podcasts',
    icon: Headphones,
    emoji: '🎧',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  courses: {
    label: 'Cursos',
    icon: GraduationCap,
    emoji: '🎓',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
}

const statusOptions = [
  { value: 'todos' as const, label: 'Todos' },
  { value: 'leyendo' as const, label: 'Leyendo' },
  { value: 'pendiente' as const, label: 'Pendiente' },
  { value: 'completado' as const, label: 'Completado' },
]

export function AprenderPage() {
  const [activeTab, setActiveTab] = useState<TabType>('books')
  const [statusFilter, setStatusFilter] = useState<'todos' | LearningStatus>('todos')
  const [books, setBooks] = useState<BookType[]>([])
  const [podcasts, setPodcasts] = useState<Podcast[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<BookType | Podcast | Course | null>(null)

  // Form state
  const [itemTitle, setItemTitle] = useState('')
  const [itemAuthor, setItemAuthor] = useState('') // for books
  const [itemChannel, setItemChannel] = useState('') // for podcasts
  const [itemPlatform, setItemPlatform] = useState('') // for courses
  const [itemStatus, setItemStatus] = useState<LearningStatus>('pendiente')
  const [itemProgress, setItemProgress] = useState(0)
  const [itemNotes, setItemNotes] = useState('')

  useEffect(() => {
    const unsubscribeBooks = subscribeBooks((fetchedBooks) => {
      setBooks(fetchedBooks)
      setLoading(false)
    })

    const unsubscribePodcasts = subscribePodcasts((fetchedPodcasts) => {
      setPodcasts(fetchedPodcasts)
    })

    const unsubscribeCourses = subscribeCourses((fetchedCourses) => {
      setCourses(fetchedCourses)
    })

    return () => {
      unsubscribeBooks()
      unsubscribePodcasts()
      unsubscribeCourses()
    }
  }, [])

  const filteredItems = useMemo(() => {
    let items: (BookType | Podcast | Course)[] = []

    switch (activeTab) {
      case 'books':
        items = books
        break
      case 'podcasts':
        items = podcasts
        break
      case 'courses':
        items = courses
        break
    }

    if (statusFilter === 'todos') {
      return items
    }

    return items.filter(item => item.status === statusFilter)
  }, [activeTab, statusFilter, books, podcasts, courses])

  const itemCounts = useMemo(() => {
    const counts = {
      books: { total: books.length, leyendo: 0, pendiente: 0, completado: 0 },
      podcasts: { total: podcasts.length, leyendo: 0, pendiente: 0, completado: 0 },
      courses: { total: courses.length, leyendo: 0, pendiente: 0, completado: 0 },
    }

    books.forEach(book => counts.books[book.status]++)
    podcasts.forEach(podcast => counts.podcasts[podcast.status]++)
    courses.forEach(course => counts.courses[course.status]++)

    return counts
  }, [books, podcasts, courses])

  const handleAddItem = () => {
    if (!itemTitle.trim()) return

    const baseItem = {
      title: itemTitle.trim(),
      status: itemStatus,
      notes: itemNotes.trim() || undefined,
    }

    switch (activeTab) {
      case 'books':
        if (!itemAuthor.trim()) return
        addBook({
          ...baseItem,
          author: itemAuthor.trim(),
          progress: itemProgress,
        })
        break
      case 'podcasts':
        if (!itemChannel.trim()) return
        addPodcast({
          ...baseItem,
          channel: itemChannel.trim(),
        })
        break
      case 'courses':
        if (!itemPlatform.trim()) return
        addCourse({
          ...baseItem,
          platform: itemPlatform.trim(),
          progress: itemProgress,
        })
        break
    }

    resetForm()
  }

  const handleEditItem = (item: BookType | Podcast | Course) => {
    setEditingItem(item)
    setItemTitle(item.title)
    setItemStatus(item.status)
    setItemNotes(item.notes || '')

    if ('author' in item) {
      setItemAuthor(item.author)
      setItemProgress(item.progress)
    } else if ('channel' in item) {
      setItemChannel(item.channel)
    } else if ('platform' in item) {
      setItemPlatform(item.platform)
      setItemProgress(item.progress)
    }

    setShowForm(true)
  }

  const handleUpdateItem = () => {
    if (!editingItem || !itemTitle.trim()) return

    const baseUpdates = {
      title: itemTitle.trim(),
      status: itemStatus,
      notes: itemNotes.trim() || undefined,
    }

    switch (activeTab) {
      case 'books':
        if (!itemAuthor.trim()) return
        updateBook(editingItem.id, {
          ...baseUpdates,
          author: itemAuthor.trim(),
          progress: itemProgress,
        })
        break
      case 'podcasts':
        if (!itemChannel.trim()) return
        updatePodcast(editingItem.id, {
          ...baseUpdates,
          channel: itemChannel.trim(),
        })
        break
      case 'courses':
        if (!itemPlatform.trim()) return
        updateCourse(editingItem.id, {
          ...baseUpdates,
          platform: itemPlatform.trim(),
          progress: itemProgress,
        })
        break
    }

    resetForm()
  }

  const handleDeleteItem = (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este elemento?')) return

    switch (activeTab) {
      case 'books':
        deleteBook(id)
        break
      case 'podcasts':
        deletePodcast(id)
        break
      case 'courses':
        deleteCourse(id)
        break
    }
  }

  const resetForm = () => {
    setItemTitle('')
    setItemAuthor('')
    setItemChannel('')
    setItemPlatform('')
    setItemStatus('pendiente')
    setItemProgress(0)
    setItemNotes('')
    setShowForm(false)
    setEditingItem(null)
  }

  const renderItemCard = (item: BookType | Podcast | Course) => {
    const hasProgress = 'progress' in item
    const subtitle = 'author' in item ? item.author : 'channel' in item ? item.channel : 'platform' in item ? item.platform : ''

    return (
      <motion.div
        key={item.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5 group hover:border-white/14 transition"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white/90 mb-1 truncate">
              {item.title}
            </h3>
            <p className="text-xs text-white/50 truncate mb-2">
              {subtitle}
            </p>
            <div className="flex items-center gap-2">
              <div className={`px-2 py-1 rounded-full text-xs ${
                item.status === 'leyendo' ? 'bg-blue-500/20 text-blue-300' :
                item.status === 'pendiente' ? 'bg-amber-500/20 text-amber-300' :
                'bg-emerald-500/20 text-emerald-300'
              }`}>
                {item.status === 'leyendo' ? 'Leyendo' :
                 item.status === 'pendiente' ? 'Pendiente' : 'Completado'}
              </div>
            </div>
          </div>
          <div className="flex gap-1 transition opacity-100 md:opacity-0 md:group-hover:opacity-100">
            <button
              onClick={() => handleEditItem(item)}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
            >
              <Edit size={12} className="text-white/70" />
            </button>
            <button
              onClick={() => handleDeleteItem(item.id)}
              className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition"
            >
              <Trash2 size={12} className="text-red-400" />
            </button>
          </div>
        </div>

        {hasProgress && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-white/50 mb-1">
              <span>Progreso</span>
              <span>{item.progress}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${item.progress}%` }}
              />
            </div>
          </div>
        )}

        {item.notes && (
          <p className="text-xs text-white/60 line-clamp-2">
            {item.notes}
          </p>
        )}
      </motion.div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/35">Aprendizaje · Conocimiento</p>
            <h1 className="text-3xl font-bold text-white/90 mt-1">Aprender</h1>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            <Plus size={16} /> Añadir {tabConfig[activeTab].label.toLowerCase()}
          </button>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex gap-1 p-1 rounded-2xl bg-white/5 border border-white/8">
          {(Object.entries(tabConfig) as [TabType, typeof tabConfig.books][]).map(([key, config]) => {
            const Icon = config.icon
            const isActive = activeTab === key
            const count = itemCounts[key]

            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  isActive
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/60 hover:text-white/80'
                }`}
              >
                <Icon size={16} />
                <span>{config.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  isActive ? 'bg-white/20' : 'bg-white/10'
                }`}>
                  {count.total}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Status Filter */}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={16} className="text-white/40 shrink-0" />
          <div className="flex gap-2 flex-wrap">
            {statusOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setStatusFilter(option.value)}
                className={`px-4 py-2 rounded-xl text-sm transition ${
                  statusFilter === option.value
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'bg-white/5 text-white/60 hover:text-white/80 border border-transparent'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Items Grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {filteredItems.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-white/8 bg-[#1E1E28] p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                {activeTab === 'books' ? <Book size={24} className="text-white/30" /> :
                 activeTab === 'podcasts' ? <Mic size={24} className="text-white/30" /> :
                 <PlayCircle size={24} className="text-white/30" />}
              </div>
              <p className="text-sm text-white/40">
                {statusFilter === 'todos'
                  ? `No tienes ${tabConfig[activeTab].label.toLowerCase()} registrados`
                  : `No hay ${tabConfig[activeTab].label.toLowerCase()} con estado "${statusOptions.find(o => o.value === statusFilter)?.label.toLowerCase()}"`
                }
              </p>
              <p className="text-xs text-white/30 mt-1">
                ¡Añade tu primer {tabConfig[activeTab].label.toLowerCase().slice(0, -1)}!
              </p>
            </div>
          ) : (
            filteredItems.map(renderItemCard)
          )}
        </motion.div>
      </AnimatePresence>

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
              className="w-full max-w-md rounded-3xl border border-white/8 bg-[#1E1E28] p-6 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white/90">
                  {editingItem ? 'Editar' : 'Añadir'} {tabConfig[activeTab].label.toLowerCase().slice(0, -1)}
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
                    value={itemTitle}
                    onChange={(e) => setItemTitle(e.target.value)}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                    placeholder={`Título del ${tabConfig[activeTab].label.toLowerCase().slice(0, -1)}`}
                  />
                </div>

                {activeTab === 'books' && (
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Autor</label>
                    <input
                      value={itemAuthor}
                      onChange={(e) => setItemAuthor(e.target.value)}
                      className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                      placeholder="Nombre del autor"
                    />
                  </div>
                )}

                {activeTab === 'podcasts' && (
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Canal</label>
                    <input
                      value={itemChannel}
                      onChange={(e) => setItemChannel(e.target.value)}
                      className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                      placeholder="Nombre del canal/podcast"
                    />
                  </div>
                )}

                {activeTab === 'courses' && (
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Plataforma</label>
                    <input
                      value={itemPlatform}
                      onChange={(e) => setItemPlatform(e.target.value)}
                      className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                      placeholder="Udemy, Coursera, etc."
                    />
                  </div>
                )}

                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Estado</label>
                  <select
                    value={itemStatus}
                    onChange={(e) => setItemStatus(e.target.value as LearningStatus)}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="leyendo">Leyendo</option>
                    <option value="completado">Completado</option>
                  </select>
                </div>

                {(activeTab === 'books' || activeTab === 'courses') && (
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Progreso (%)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={itemProgress}
                      onChange={(e) => setItemProgress(Number(e.target.value))}
                      className="mt-2 w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider"
                    />
                    <div className="flex justify-between text-xs text-white/50 mt-1">
                      <span>0%</span>
                      <span className="font-medium">{itemProgress}%</span>
                      <span>100%</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Notas (opcional)</label>
                  <textarea
                    value={itemNotes}
                    onChange={(e) => setItemNotes(e.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none resize-none"
                    placeholder="Notas adicionales..."
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={editingItem ? handleUpdateItem : handleAddItem}
                    disabled={!itemTitle.trim() ||
                      (activeTab === 'books' && !itemAuthor.trim()) ||
                      (activeTab === 'podcasts' && !itemChannel.trim()) ||
                      (activeTab === 'courses' && !itemPlatform.trim())}
                    className="flex-1 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingItem ? 'Actualizar' : 'Añadir'} {tabConfig[activeTab].label.toLowerCase().slice(0, -1)}
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