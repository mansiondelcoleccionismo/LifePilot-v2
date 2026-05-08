import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Film, Tv, Gamepad2, X, Edit, Trash2, Star, Filter } from 'lucide-react'
import { addMovie, subscribeMovies, updateMovie, deleteMovie, addShow, subscribeShows, updateShow, deleteShow, addGame, subscribeGames, updateGame, deleteGame } from '@/services/entertainment.service'
import type { Movie, Show, Game, EntertainmentStatus } from '@/types/entertainment'

type TabType = 'movies' | 'shows' | 'games'

const tabConfig = {
  movies: {
    label: 'Películas',
    icon: Film,
    emoji: '🎬',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
  shows: {
    label: 'Series',
    icon: Tv,
    emoji: '📺',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  games: {
    label: 'Juegos',
    icon: Gamepad2,
    emoji: '🎮',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
}

const statusOptions = [
  { value: 'todos' as const, label: 'Todos' },
  { value: 'pendiente' as const, label: 'Pendiente' },
  { value: 'viendo' as const, label: 'Viendo' },
  { value: 'completado' as const, label: 'Completado' },
]

export function OcioPage() {
  const [activeTab, setActiveTab] = useState<TabType>('movies')
  const [statusFilter, setStatusFilter] = useState<'todos' | EntertainmentStatus>('todos')
  const [movies, setMovies] = useState<Movie[]>([])
  const [shows, setShows] = useState<Show[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<Movie | Show | Game | null>(null)

  // Form state
  const [itemTitle, setItemTitle] = useState('')
  const [itemPlatform, setItemPlatform] = useState('')
  const [itemStatus, setItemStatus] = useState<EntertainmentStatus>('pendiente')
  const [itemGenre, setItemGenre] = useState('')
  const [itemRating, setItemRating] = useState<number>(0)
  const [itemNotes, setItemNotes] = useState('')
  // Games specific
  const [itemHoursPlayed, setItemHoursPlayed] = useState<number>(0)

  useEffect(() => {
    const unsubscribeMovies = subscribeMovies((fetchedMovies) => {
      setMovies(fetchedMovies)
      setLoading(false)
    })

    const unsubscribeShows = subscribeShows((fetchedShows) => {
      setShows(fetchedShows)
    })

    const unsubscribeGames = subscribeGames((fetchedGames) => {
      setGames(fetchedGames)
    })

    return () => {
      unsubscribeMovies()
      unsubscribeShows()
      unsubscribeGames()
    }
  }, [])

  const filteredItems = useMemo(() => {
    let items: (Movie | Show | Game)[] = []

    switch (activeTab) {
      case 'movies':
        items = movies
        break
      case 'shows':
        items = shows
        break
      case 'games':
        items = games
        break
    }

    if (statusFilter === 'todos') {
      return items
    }

    return items.filter(item => item.status === statusFilter)
  }, [activeTab, statusFilter, movies, shows, games])

  const handleAddItem = () => {
    if (!itemTitle.trim() || !itemPlatform.trim()) return

    const baseItem = {
      title: itemTitle.trim(),
      platform: itemPlatform.trim(),
      status: itemStatus,
      genre: itemGenre.trim() || undefined,
      rating: itemRating > 0 ? itemRating : undefined,
      notes: itemNotes.trim() || undefined,
    }

    switch (activeTab) {
      case 'movies':
        addMovie(baseItem)
        break
      case 'shows':
        addShow(baseItem)
        break
      case 'games':
        addGame({
          ...baseItem,
          hoursPlayed: itemHoursPlayed > 0 ? itemHoursPlayed : undefined,
        })
        break
    }

    resetForm()
  }

  const handleEditItem = (item: Movie | Show | Game) => {
    setEditingItem(item)
    setItemTitle(item.title)
    setItemPlatform(item.platform)
    setItemStatus(item.status)
    setItemGenre(item.genre || '')
    setItemRating(item.rating || 0)
    setItemNotes(item.notes || '')

    if ('hoursPlayed' in item) {
      setItemHoursPlayed(item.hoursPlayed || 0)
    }

    setShowForm(true)
  }

  const handleUpdateItem = () => {
    if (!editingItem || !itemTitle.trim() || !itemPlatform.trim()) return

    const baseUpdates = {
      title: itemTitle.trim(),
      platform: itemPlatform.trim(),
      status: itemStatus,
      genre: itemGenre.trim() || undefined,
      rating: itemRating > 0 ? itemRating : undefined,
      notes: itemNotes.trim() || undefined,
    }

    switch (activeTab) {
      case 'movies':
        updateMovie(editingItem.id, baseUpdates)
        break
      case 'shows':
        updateShow(editingItem.id, baseUpdates)
        break
      case 'games':
        updateGame(editingItem.id, {
          ...baseUpdates,
          hoursPlayed: itemHoursPlayed > 0 ? itemHoursPlayed : undefined,
        })
        break
    }

    resetForm()
  }

  const handleDeleteItem = (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este elemento?')) return

    switch (activeTab) {
      case 'movies':
        deleteMovie(id)
        break
      case 'shows':
        deleteShow(id)
        break
      case 'games':
        deleteGame(id)
        break
    }
  }

  const resetForm = () => {
    setItemTitle('')
    setItemPlatform('')
    setItemStatus('pendiente')
    setItemGenre('')
    setItemRating(0)
    setItemNotes('')
    setItemHoursPlayed(0)
    setShowForm(false)
    setEditingItem(null)
  }

  const renderItemCard = (item: Movie | Show | Game) => {
    const hasRating = item.rating && item.rating > 0
    const hasHoursPlayed = 'hoursPlayed' in item && item.hoursPlayed && item.hoursPlayed > 0

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
              {item.platform}
            </p>
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-1 rounded-full text-xs ${
                item.status === 'pendiente' ? 'bg-amber-500/20 text-amber-300' :
                item.status === 'viendo' ? 'bg-blue-500/20 text-blue-300' :
                'bg-emerald-500/20 text-emerald-300'
              }`}>
                {item.status === 'pendiente' ? 'Pendiente' :
                 item.status === 'viendo' ? 'Viendo' : 'Completado'}
              </span>
              {hasRating && (
                <div className="flex items-center gap-1">
                  <Star size={12} className="text-yellow-400 fill-yellow-400" />
                  <span className="text-xs text-white/60">{item.rating}/10</span>
                </div>
              )}
            </div>
            {hasHoursPlayed && (
              <p className="text-xs text-white/40 mb-2">
                {(item as Game).hoursPlayed} horas jugadas
              </p>
            )}
            {item.notes && (
              <p className="text-xs text-white/40 line-clamp-2">
                {item.notes}
              </p>
            )}
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
      </motion.div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/35">Entretenimiento · Ocio</p>
            <h1 className="text-3xl font-bold text-white/90 mt-1">Ocio</h1>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-500"
          >
            <Plus size={16} /> Añadir {tabConfig[activeTab].label.toLowerCase().slice(0, -1)}
          </button>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex gap-1 p-1 rounded-2xl bg-white/5 border border-white/8">
          {(Object.entries(tabConfig) as [TabType, typeof tabConfig.movies][]).map(([key, config]) => {
            const Icon = config.icon
            const isActive = activeTab === key
            const count = key === 'movies' ? movies.length : key === 'shows' ? shows.length : games.length

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
                  {count}
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
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
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
                {activeTab === 'movies' ? <Film size={24} className="text-white/30" /> :
                 activeTab === 'shows' ? <Tv size={24} className="text-white/30" /> :
                 <Gamepad2 size={24} className="text-white/30" />}
              </div>
              <p className="text-sm text-white/40">
                {statusFilter === 'todos'
                  ? `No tienes ${tabConfig[activeTab].label.toLowerCase()} registradas`
                  : `No hay ${tabConfig[activeTab].label.toLowerCase()} con estado "${statusOptions.find(o => o.value === statusFilter)?.label.toLowerCase()}"`
                }
              </p>
              <p className="text-xs text-white/30 mt-1">
                ¡Añade tu primera {tabConfig[activeTab].label.toLowerCase().slice(0, -1)}!
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
                    placeholder={`Título de la ${tabConfig[activeTab].label.toLowerCase().slice(0, -1)}`}
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Plataforma</label>
                  <select
                    value={itemPlatform}
                    onChange={(e) => setItemPlatform(e.target.value)}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                  >
                    <option value="">Seleccionar plataforma...</option>
                    {['Netflix', 'HBO', 'Amazon Prime', 'Disney+', 'Apple TV+', 'Movistar+', 'YouTube', 'Steam', 'PlayStation', 'Xbox', 'Nintendo Switch', 'PC', 'Otro'].map(platform => (
                      <option key={platform} value={platform}>{platform}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Estado</label>
                    <select
                      value={itemStatus}
                      onChange={(e) => setItemStatus(e.target.value as EntertainmentStatus)}
                      className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="viendo">Viendo</option>
                      <option value="completado">Completado</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Valoración (opcional)</label>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.5"
                        value={itemRating}
                        onChange={(e) => setItemRating(Number(e.target.value))}
                        className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider"
                      />
                      <span className="text-sm text-white/60 min-w-[3ch]">{itemRating || 0}</span>
                    </div>
                  </div>
                </div>

                {activeTab === 'games' && (
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Horas jugadas</label>
                    <input
                      type="number"
                      min="0"
                      value={itemHoursPlayed}
                      onChange={(e) => setItemHoursPlayed(Number(e.target.value))}
                      className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-3 py-2 text-sm text-white/80 focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Género (opcional)</label>
                  <input
                    value={itemGenre}
                    onChange={(e) => setItemGenre(e.target.value)}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                    placeholder="Acción, Comedia, Drama..."
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Notas (opcional)</label>
                  <textarea
                    value={itemNotes}
                    onChange={(e) => setItemNotes(e.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-2xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none resize-none"
                    placeholder="Comentarios personales..."
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={editingItem ? handleUpdateItem : handleAddItem}
                    disabled={!itemTitle.trim() || !itemPlatform.trim()}
                    className="flex-1 rounded-2xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
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