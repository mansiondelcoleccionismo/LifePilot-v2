import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PageHeader } from '@/components/layout/PageContainer'
import {
  Plus, Star, Play, X, Search, Film, Tv, BookOpen, Zap,
  BarChart2, List, Check, ChevronRight, Trash2, Upload,
  Sparkles, Clock, Monitor, Package,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  subscribeContent, addContent, updateContent, deleteContent,
  updateProgress, markWatched, getStats, seedPhysicalCollection, importFromCSV,
} from '@/services/entertainment.service'
import {
  searchContent as tmdbSearch, getContentDetails, getSimilar,
  getTrending, hasTmdbKey, saveTmdbKey, resolvePosterUrl,
} from '@/services/tmdb.service'
import { getOcioRecommendations } from '@/services/ai.service'
import type { OcioRecommendation } from '@/services/ai.service'
import { ContentSommelier } from '@/components/ocio/ContentSommelier'
import type { TmdbResult } from '@/services/tmdb.service'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { PHYSICAL_COLLECTION, PHYSICAL_SEED_FLAG } from '@/data/physical-collection'
import type { Content, ContentType, Platform, ContentStatus } from '@/types/entertainment'

// ── Constants ─────────────────────────────────────────────────────────────────

type Tab = 'lista' | 'viendo' | 'visto' | 'descubrir' | 'stats'

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'lista', label: 'Mi Lista', emoji: '📋' },
  { id: 'viendo', label: 'Viendo', emoji: '▶' },
  { id: 'visto', label: 'Visto', emoji: '✅' },
  { id: 'descubrir', label: 'Descubrir', emoji: '🔍' },
  { id: 'stats', label: 'Stats', emoji: '📊' },
]

const TYPE_FILTERS: { value: ContentType | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pelicula', label: 'Peli' },
  { value: 'serie', label: 'Serie' },
  { value: 'documental', label: 'Doc' },
  { value: 'anime', label: 'Anime' },
]

const PLATFORMS: Platform[] = ['Netflix', 'Amazon Prime', 'YouTube', 'HBO', 'Físico', 'Otro']

const TYPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: 'pelicula', label: 'Película' },
  { value: 'serie', label: 'Serie' },
  { value: 'documental', label: 'Documental' },
  { value: 'anime', label: 'Anime' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'youtube', label: 'YouTube' },
]

const CURATED_DOCS = [
  { title: 'Fariña', year: 2018, tmdbRating: 8.1, synopsis: 'El narcotráfico gallego en los 80. Mejor que Narcos por su fidelidad a la realidad.', posterUrl: undefined },
  { title: 'The Act of Killing', year: 2012, tmdbRating: 8.2, synopsis: 'Los ejecutores del genocidio indonesio de 1965 recrean sus crímenes.' },
  { title: 'Making a Murderer', year: 2015, tmdbRating: 8.6, synopsis: 'True crime estadounidense. Steven Avery y la investigación que lo condena.' },
  { title: 'Icarus', year: 2017, tmdbRating: 7.9, synopsis: 'Un ciclista aficionado destapa el mayor escándalo de dopaje de la historia.' },
  { title: 'The Imposter', year: 2012, tmdbRating: 7.8, synopsis: 'Un adolescente desaparecido reaparece... pero no es quien dice ser.' },
  { title: 'Bowling for Columbine', year: 2002, tmdbRating: 8.1, synopsis: 'Michael Moore investiga la cultura de las armas en EEUU tras Columbine.' },
]

const CURATED_ANIME = [
  { title: 'Monster', year: 2004, tmdbRating: 8.7, synopsis: 'Un neurocirujano salva la vida de un niño que resulta ser un asesino en serie.' },
  { title: 'Vinland Saga', year: 2019, tmdbRating: 8.8, synopsis: 'Vikingos, venganza y redención. Una de las mejores series de anime de la historia.' },
  { title: 'Mushishi', year: 2005, tmdbRating: 8.6, synopsis: 'Un viajero que estudia los Mushi, criaturas primitivas en el límite entre vida y no-vida.' },
  { title: 'Fullmetal Alchemist: Brotherhood', year: 2009, tmdbRating: 9.1, synopsis: 'Dos hermanos alquimistas buscan la Piedra Filosofal para recuperar sus cuerpos.' },
  { title: 'Legend of the Galactic Heroes', year: 1988, tmdbRating: 9.0, synopsis: 'Épica espacial operática. La guerra entre dos imperios galácticos durante décadas.' },
  { title: 'Ping Pong The Animation', year: 2014, tmdbRating: 8.6, synopsis: 'El ping pong como metáfora de la identidad, el talento y la pasión.' },
]

const CURATED_GEOPOLITICA = [
  { title: 'The Looming Tower', year: 2018, tmdbRating: 8.1, synopsis: 'La rivalidad entre FBI y CIA que facilitó el 11-S. Basado en hechos reales.' },
  { title: 'Fauda', year: 2015, tmdbRating: 8.3, synopsis: 'Operaciones encubiertas israelíes en Cisjordania. Serie brutal y sin filtros.' },
  { title: 'The Bureau', year: 2015, tmdbRating: 8.6, synopsis: 'Espionaje francés al nivel de Le Carré. Protagonista infiltrado en Siria.' },
  { title: 'Narcos: Mexico', year: 2018, tmdbRating: 8.1, synopsis: 'El cártel de Guadalajara y el origen del narcotráfico mexicano moderno.' },
  { title: 'McMafia', year: 2018, tmdbRating: 7.8, synopsis: 'Crimen organizado global. Un hijo de mafiosos ruso que intenta alejarse del negocio.' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function titleToHue(title: string): number {
  let h = 0
  for (let i = 0; i < title.length; i++) { h = (h << 5) - h + title.charCodeAt(i); h |= 0 }
  return Math.abs(h) % 360
}

const SKIP_WORDS = new Set(['el', 'la', 'los', 'las', 'the', 'a', 'an', 'un', 'una', 'de', 'of'])

function titleInitials(title: string): string {
  const words = title.split(/\s+/).filter(w => !SKIP_WORDS.has(w.toLowerCase()))
  if (words.length === 0) return title.slice(0, 2).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function usePosterUrl(staticUrl?: string, tmdbId?: number, title?: string, year?: number) {
  const [resolved, setResolved] = useState<string | undefined>(staticUrl)
  useEffect(() => {
    if (staticUrl) { setResolved(staticUrl); return }
    if (!hasTmdbKey()) return
    if (!tmdbId && !title) return
    let cancelled = false
    resolvePosterUrl({ tmdbId, title: title ?? '', year })
      .then(u => { if (!cancelled && u) setResolved(u) })
    return () => { cancelled = true }
  }, [staticUrl, tmdbId, title, year])
  return resolved
}

function PosterImg({ url, title, className = '', tmdbId, year }: {
  url?: string; title: string; className?: string; tmdbId?: number; year?: number
}) {
  const [err, setErr] = useState(false)
  const resolvedUrl = usePosterUrl(url, tmdbId, title, year)
  const hue = titleToHue(title)
  const initials = titleInitials(title)

  if (resolvedUrl && !err) {
    return <img src={resolvedUrl} alt={title} className={`object-cover ${className}`} loading="lazy" onError={() => setErr(true)} />
  }
  return (
    <div
      className={`flex items-center justify-center text-white font-bold leading-tight select-none ${className}`}
      style={{ background: `hsl(${hue}, 40%, 22%)` }}
    >
      <span className="text-lg tracking-wide opacity-90">{initials}</span>
    </div>
  )
}

function SkeletonPoster({ className = '' }: { className?: string }) {
  return <div className={`rounded-xl bg-white/5 animate-pulse ${className}`} style={{ aspectRatio: '2/3' }} />
}

function StatusBadge({ status }: { status: ContentStatus }) {
  const map = {
    pendiente: { label: '⏳', bg: 'bg-amber-500/80' },
    viendo: { label: '▶', bg: 'bg-blue-500/80' },
    visto: { label: '✓', bg: 'bg-emerald-500/80' },
    abandonado: { label: '✗', bg: 'bg-red-500/60' },
  }
  const { label, bg } = map[status]
  return (
    <span className={`${bg} text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full`}>{label}</span>
  )
}

// ── Recommendation Card ───────────────────────────────────────────────────────

function RecommendationCard({
  rec, index, onStart, onAdd,
}: { rec: OcioRecommendation; index: number; onStart: () => void; onAdd: () => void }) {
  const platColor =
    rec.platform === 'Netflix' ? 'bg-red-500/20 text-red-300' :
    rec.platform.includes('Amazon') ? 'bg-blue-400/20 text-blue-300' :
    rec.platform === 'HBO' ? 'bg-purple-500/20 text-purple-300' :
    'bg-white/10 text-white/50'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.12, duration: 0.4 }}
      className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-3 hover:border-violet-500/30 transition-all"
    >
      <div className="shrink-0 w-17 rounded-lg overflow-hidden shadow-lg" style={{ aspectRatio: '2/3' }}>
        {rec.posterUrl ? (
          <img src={rec.posterUrl} alt={rec.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-white/8 flex items-center justify-center text-white/20 text-xs font-bold text-center p-1">
            {rec.title.slice(0, 3)}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <h4 className="font-semibold text-white/90 text-sm leading-tight line-clamp-1">{rec.title}</h4>
          <p className="text-[11px] text-white/35 mb-1.5 line-clamp-1 italic">{rec.titleOriginal}</p>
          <div className="flex flex-wrap gap-1 mb-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${platColor}`}>{rec.platform}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/8 text-white/40">
              {rec.duration >= 60 ? `${Math.floor(rec.duration / 60)}h ${rec.duration % 60}m` : `${rec.duration}m`}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/8 text-white/40">{rec.type}</span>
          </div>
          <p className="text-[11px] text-white/45 italic leading-snug line-clamp-2">{rec.reason}</p>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={onStart}
            className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white transition"
          >
            ▶ Empezar
          </button>
          <button
            onClick={onAdd}
            className="rounded-xl bg-white/10 hover:bg-white/15 px-3 py-1.5 text-xs text-white/70 transition"
          >
            + Lista
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Poster Card ───────────────────────────────────────────────────────────────

function PosterCard({ item, onClick }: { item: Content; onClick: () => void }) {
  return (
    <motion.div
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative cursor-pointer rounded-xl overflow-hidden group shadow-md"
      style={{ aspectRatio: '2/3' }}
    >
      <PosterImg url={item.posterUrl} title={item.title} tmdbId={item.tmdbId} year={item.year} className="w-full h-full" />
      <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="absolute bottom-0 left-0 right-0 p-2.5">
          <p className="text-white text-xs font-semibold leading-tight line-clamp-2">{item.title}</p>
          {item.rating && (
            <div className="flex items-center gap-1 mt-1">
              <Star size={10} className="text-yellow-400 fill-yellow-400" />
              <span className="text-[10px] text-white/80">{item.rating}/10</span>
            </div>
          )}
        </div>
      </div>
      <div className="absolute top-1.5 right-1.5">
        <StatusBadge status={item.status} />
      </div>
    </motion.div>
  )
}

// ── Horizontal scroll section ─────────────────────────────────────────────────

function HSection({
  title, items, loading = false, onItemClick,
}: {
  title: string
  items: Array<{ tmdbId?: number; title: string; posterUrl?: string; year?: number; tmdbRating?: number; synopsis?: string }>
  loading?: boolean
  onItemClick: (item: HSection['items'][0]) => void
}) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-3">{title}</h3>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonPoster key={i} className="shrink-0 w-25" />)
          : items.map((item, i) => (
              <motion.div
                key={item.tmdbId ?? i}
                whileHover={{ scale: 1.05 }}
                onClick={() => onItemClick(item)}
                className="shrink-0 w-25 cursor-pointer"
              >
                <div className="w-25 rounded-xl overflow-hidden mb-1.5 shadow-md" style={{ aspectRatio: '2/3' }}>
                  <PosterImg url={item.posterUrl} title={item.title} tmdbId={item.tmdbId} year={item.year} className="w-full h-full" />
                </div>
                <p className="text-[11px] text-white/65 line-clamp-2 leading-tight">{item.title}</p>
                {item.tmdbRating && (
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <Star size={9} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-[10px] text-white/35">{item.tmdbRating.toFixed(1)}</span>
                  </div>
                )}
              </motion.div>
            ))
        }
      </div>
    </div>
  )
}

// Hack to satisfy TypeScript
type HSection = { items: Array<{ tmdbId?: number; title: string; posterUrl?: string; year?: number; tmdbRating?: number; synopsis?: string }> }

// ── Modo Noche ────────────────────────────────────────────────────────────────

function ModoNoche({
  content, todayMood, hour,
}: { content: Content[]; todayMood: number | null; hour: number }) {
  const [recs, setRecs] = useState<OcioRecommendation[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const subtitle = todayMood === null ? '¿Qué te apetece esta noche?'
    : todayMood >= 4 ? 'Buen día, te mereces una buena peli 🎬'
    : todayMood === 3 ? 'Día normal, algo entretenido'
    : 'Día duro, algo ligero o un documental'

  const minDisp = Math.round((24 - hour) * 60)

  const fetchRecs = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const lastWatched = content
        .filter(c => c.status === 'visto')
        .sort((a, b) => new Date(b.watchedAt ?? b.addedAt).getTime() - new Date(a.watchedAt ?? a.addedAt).getTime())
        .slice(0, 10)
        .map(c => ({ title: c.title, rating: c.rating, type: c.type }))

      const result = await getOcioRecommendations({
        lastWatched,
        mood: todayMood ?? undefined,
        hour,
        platforms: ['Netflix', 'Amazon Prime'],
      })
      setRecs(result)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al obtener recomendaciones')
    } finally {
      setLoading(false)
    }
  }, [content, todayMood, hour])

  const handleStart = (rec: OcioRecommendation) => {
    addContent({
      title: rec.title,
      type: rec.type,
      status: 'viendo',
      platform: PLATFORMS.includes(rec.platform as Platform) ? (rec.platform as Platform) : 'Otro',
      duration: rec.duration,
      recommended: true,
      recommendReason: rec.reason,
    })
  }

  const handleAdd = (rec: OcioRecommendation) => {
    addContent({
      title: rec.title,
      type: rec.type,
      status: 'pendiente',
      platform: PLATFORMS.includes(rec.platform as Platform) ? (rec.platform as Platform) : 'Otro',
      duration: rec.duration,
      recommended: true,
      recommendReason: rec.reason,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 rounded-3xl border border-violet-500/20 bg-linear-to-b from-violet-950/60 to-[#1a1a2e]/80 backdrop-blur-sm overflow-hidden"
    >
      <div
        className="flex items-center justify-between p-5 cursor-pointer"
        onClick={() => setCollapsed(v => !v)}
      >
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-lg">🌙</span>
            <h2 className="text-base font-bold text-white/90">Para esta noche</h2>
            <span className="text-xs text-violet-300/70 bg-violet-500/15 px-2 py-0.5 rounded-full">
              {hour}:00 · ~{minDisp} min
            </span>
          </div>
          <p className="text-sm text-white/45">{subtitle}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); fetchRecs() }}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 px-3 py-2 text-xs font-semibold text-white transition"
        >
          <Sparkles size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Pensando...' : recs.length ? 'Nuevas' : 'Sorpréndeme'}
        </button>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-5 pb-5"
          >
            {err && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-red-300 mb-4">
                {err}
              </div>
            )}
            {recs.length === 0 && !loading && (
              <div className="text-center py-4 text-white/30 text-sm">
                Pulsa "Sorpréndeme" para ver recomendaciones personalizadas ✨
              </div>
            )}
            {loading && (
              <div className="grid gap-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex gap-3 rounded-2xl border border-white/8 bg-white/5 p-3 animate-pulse">
                    <div className="w-17 rounded-lg bg-white/8 shrink-0" style={{ aspectRatio: '2/3' }} />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-white/8 rounded w-3/4" />
                      <div className="h-2 bg-white/6 rounded w-1/2" />
                      <div className="h-2 bg-white/5 rounded w-full" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {recs.length > 0 && !loading && (
              <div className="grid gap-3">
                {recs.map((rec, i) => (
                  <RecommendationCard
                    key={i}
                    rec={rec}
                    index={i}
                    onStart={() => handleStart(rec)}
                    onAdd={() => handleAdd(rec)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Tab Mi Lista ──────────────────────────────────────────────────────────────

function TabMiLista({ content, onItemClick, onAdd }: {
  content: Content[]
  onItemClick: (item: Content) => void
  onAdd: () => void
}) {
  const [typeFilter, setTypeFilter] = useState<ContentType | 'todos'>('todos')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'addedAt' | 'tmdbRating' | 'duration'>('addedAt')

  const pending = content.filter(c => c.status === 'pendiente')
  const filtered = useMemo(() => {
    let items = typeFilter === 'todos' ? pending : pending.filter(i => i.type === typeFilter)
    if (search) items = items.filter(i => i.title.toLowerCase().includes(search.toLowerCase()))
    return [...items].sort((a, b) => {
      if (sort === 'tmdbRating') return (b.tmdbRating ?? 0) - (a.tmdbRating ?? 0)
      if (sort === 'duration') return (a.duration ?? 999) - (b.duration ?? 999)
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
    })
  }, [pending, typeFilter, search, sort])

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {TYPE_FILTERS.map(f => (
          <button key={f.value} onClick={() => setTypeFilter(f.value)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${typeFilter === f.value ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-white/5 text-white/55 hover:text-white/80'}`}>
            {f.label}
          </button>
        ))}
        <div className="ml-auto">
          <select value={sort} onChange={e => setSort(e.target.value as typeof sort)}
            className="rounded-xl bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-white/55 focus:outline-none">
            <option value="addedAt">Reciente</option>
            <option value="tmdbRating">Puntuación</option>
            <option value="duration">Duración</option>
          </select>
        </div>
      </div>
      <div className="mb-4 relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar en tu lista..." className="w-full rounded-xl bg-white/5 border border-white/8 pl-9 pr-4 py-2.5 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-violet-500/40" />
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Film size={36} className="mx-auto mb-3 text-white/15" />
          <p className="text-sm text-white/30">Tu lista está vacía</p>
          <button onClick={onAdd} className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-xs text-white hover:bg-violet-500 transition">
            Añadir contenido
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map((item, i) => (
            <motion.div key={item.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.025 }}>
              <PosterCard item={item} onClick={() => onItemClick(item)} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab Viendo ────────────────────────────────────────────────────────────────

function TabViendo({ content, onItemClick }: { content: Content[]; onItemClick: (item: Content) => void }) {
  const watching = content.filter(c => c.status === 'viendo')

  const handleEpisode = (item: Content, delta: number) => {
    const next = Math.min((item.currentEpisode ?? 1) + delta, item.totalEpisodes ?? 999)
    updateProgress(item.id, next)
  }

  const handleDone = (item: Content) => {
    markWatched(item.id)
  }

  return (
    <div className="space-y-4">
      {watching.length === 0 ? (
        <div className="text-center py-16">
          <Play size={36} className="mx-auto mb-3 text-white/15" />
          <p className="text-sm text-white/30">No estás viendo nada ahora</p>
          <p className="text-xs text-white/20 mt-1">Empieza algo desde "Descubrir" o desde tu lista</p>
        </div>
      ) : watching.map(item => {
        const hasSeries = (item.totalEpisodes ?? 0) > 1
        const progress = hasSeries ? ((item.currentEpisode ?? 1) / (item.totalEpisodes!)) * 100 : 0
        return (
          <motion.div key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            className="flex gap-4 rounded-2xl border border-white/8 bg-[#1a1a28] p-4 hover:border-white/14 transition">
            <div className="w-16 shrink-0 rounded-lg overflow-hidden shadow-lg cursor-pointer" style={{ aspectRatio: '2/3' }} onClick={() => onItemClick(item)}>
              <PosterImg url={item.posterUrl} title={item.title} tmdbId={item.tmdbId} year={item.year} className="w-full h-full" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <h3 className="font-semibold text-white/90 text-sm truncate">{item.title}</h3>
                  <p className="text-xs text-white/40">{item.platform} · {item.type} · {item.year}</p>
                </div>
                <span className="shrink-0 text-xs text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded-full">Viendo</span>
              </div>
              {hasSeries && (
                <div className="mt-2 mb-3">
                  <div className="flex justify-between text-xs text-white/40 mb-1">
                    <span>Ep {item.currentEpisode ?? 1} de {item.totalEpisodes}</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
              <div className="flex gap-2 mt-2">
                {hasSeries && (
                  <button onClick={() => handleEpisode(item, 1)}
                    disabled={(item.currentEpisode ?? 1) >= (item.totalEpisodes ?? 0)}
                    className="rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 px-3 py-1.5 text-xs font-medium text-white transition">
                    + Episodio
                  </button>
                )}
                <button onClick={() => handleDone(item)}
                  className="rounded-xl bg-emerald-700/50 hover:bg-emerald-600/50 border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-300 transition">
                  ✓ Terminé
                </button>
                <button onClick={() => onItemClick(item)} className="ml-auto rounded-xl bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs text-white/50 transition">
                  ···
                </button>
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Tab Visto ─────────────────────────────────────────────────────────────────

function TabVisto({ content, onItemClick }: { content: Content[]; onItemClick: (item: Content) => void }) {
  const watched = [...content.filter(c => c.status === 'visto')]
    .sort((a, b) => new Date(b.watchedAt ?? b.addedAt).getTime() - new Date(a.watchedAt ?? a.addedAt).getTime())

  const byMonth = useMemo(() => {
    const map = new Map<string, Content[]>()
    for (const item of watched) {
      const d = item.watchedAt ?? item.addedAt
      const key = new Date(d).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      const k = key.charAt(0).toUpperCase() + key.slice(1)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(item)
    }
    return Array.from(map.entries())
  }, [watched])

  const handleRate = (id: string, stars: number) => {
    updateContent(id, { rating: stars * 2 })
  }

  return (
    <div className="space-y-8">
      {watched.length === 0 ? (
        <div className="text-center py-16">
          <Check size={36} className="mx-auto mb-3 text-white/15" />
          <p className="text-sm text-white/30">Todavía no has marcado nada como visto</p>
        </div>
      ) : byMonth.map(([month, items]) => (
        <div key={month}>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-[0.2em]">{month}</h3>
            <span className="text-[10px] text-white/25">{items.length} títulos</span>
            <div className="flex-1 h-px bg-white/6" />
          </div>
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} onClick={() => onItemClick(item)}
                className="flex gap-3 items-center rounded-xl border border-white/8 bg-[#1a1a28] p-3 hover:border-white/14 cursor-pointer transition">
                <div className="w-10 shrink-0 rounded-md overflow-hidden shadow" style={{ aspectRatio: '2/3' }}>
                  <PosterImg url={item.posterUrl} title={item.title} tmdbId={item.tmdbId} year={item.year} className="w-full h-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white/85 truncate">{item.title}</p>
                  <p className="text-xs text-white/35">{item.year} · {item.type}</p>
                </div>
                <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} onClick={() => handleRate(item.id, star)} className="transition hover:scale-125">
                      <Star size={13} className={star * 2 <= (item.rating ?? 0) ? 'text-yellow-400 fill-yellow-400' : 'text-white/15'} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tab Descubrir ─────────────────────────────────────────────────────────────

function TabDescubrir({ content, onDiscover }: {
  content: Content[]
  onDiscover: (item: { tmdbId?: number; title: string; posterUrl?: string; year?: number; tmdbRating?: number; synopsis?: string }) => void
}) {
  const [trending, setTrending] = useState<TmdbResult[]>([])
  const [similar, setSimilar] = useState<TmdbResult[]>([])
  const [loadingTrend, setLoadingTrend] = useState(false)
  const [loadingSim, setLoadingSim] = useState(false)

  const lastWatched = useMemo(() => {
    return content
      .filter(c => c.status === 'visto' && c.tmdbId)
      .sort((a, b) => new Date(b.watchedAt ?? b.addedAt).getTime() - new Date(a.watchedAt ?? a.addedAt).getTime())[0]
  }, [content])

  useEffect(() => {
    if (!hasTmdbKey()) return
    setLoadingTrend(true)
    getTrending('all', 'week').then(setTrending).catch(() => {}).finally(() => setLoadingTrend(false))
  }, [])

  useEffect(() => {
    if (!hasTmdbKey() || !lastWatched?.tmdbId) return
    const type = lastWatched.type === 'serie' || lastWatched.type === 'anime' ? 'tv' : 'movie'
    setLoadingSim(true)
    getSimilar(lastWatched.tmdbId, type).then(setSimilar).catch(() => {}).finally(() => setLoadingSim(false))
  }, [lastWatched])

  return (
    <div>
      {hasTmdbKey() && (
        <>
          <HSection
            title="🔥 Tendencias esta semana"
            items={trending}
            loading={loadingTrend}
            onItemClick={onDiscover}
          />
          {lastWatched && (
            <HSection
              title={`🎯 Porque te gustó ${lastWatched.title}`}
              items={similar}
              loading={loadingSim}
              onItemClick={onDiscover}
            />
          )}
        </>
      )}
      <HSection
        title="📺 Documentales imprescindibles"
        items={CURATED_DOCS}
        onItemClick={onDiscover}
      />
      <HSection
        title="🎌 Anime de culto"
        items={CURATED_ANIME}
        onItemClick={onDiscover}
      />
      <HSection
        title="🌍 Geopolítica y crimen organizado"
        items={CURATED_GEOPOLITICA}
        onItemClick={onDiscover}
      />
      <HSection
        title="📦 Tu colección física"
        items={PHYSICAL_COLLECTION.slice(0, 15)}
        onItemClick={onDiscover}
      />
    </div>
  )
}

// ── Tab Stats ─────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2']

function TabStats({ content }: { content: Content[] }) {
  const stats = useMemo(() => getStats(content), [content])

  const typeData = Object.entries(stats.byType).map(([type, count]) => ({
    name: { pelicula: 'Películas', serie: 'Series', documental: 'Docs', anime: 'Anime', podcast: 'Podcasts', youtube: 'YouTube' }[type] ?? type,
    value: count ?? 0,
  }))

  const monthData = stats.byMonth.map(({ month, count }) => ({
    name: month.slice(5),
    count,
  }))

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.totalItems, icon: List, color: 'text-violet-400' },
          { label: 'Vistos', value: stats.totalWatched, icon: Check, color: 'text-emerald-400' },
          { label: 'Horas', value: `${stats.estimatedHours}h`, icon: Clock, color: 'text-blue-400' },
          { label: 'Nota media', value: stats.avgRating > 0 ? `${stats.avgRating}/10` : '—', icon: Star, color: 'text-yellow-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-white/8 bg-[#1a1a28] p-4">
            <Icon size={16} className={`${color} mb-2`} />
            <p className="text-2xl font-bold text-white/90">{value}</p>
            <p className="text-xs text-white/40 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Monthly bar chart */}
      {monthData.length > 0 && (
        <div className="rounded-2xl border border-white/8 bg-[#1a1a28] p-5">
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-4">Contenido por mes</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthData} barSize={28}>
              <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} width={24} />
              <Tooltip
                contentStyle={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                itemStyle={{ color: '#a78bfa' }}
              />
              <Bar dataKey="count" fill="#7c3aed" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Type distribution */}
      {typeData.length > 0 && (
        <div className="rounded-2xl border border-white/8 bg-[#1a1a28] p-5">
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-4">Por tipo</h3>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={typeData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0}>
                  {typeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {typeData.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-white/60">{item.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-white/80">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top genres */}
      {stats.topGenres.length > 0 && (
        <div className="rounded-2xl border border-white/8 bg-[#1a1a28] p-5">
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-3">Top géneros</h3>
          <div className="space-y-2">
            {stats.topGenres.map(({ genre, count }, i) => (
              <div key={genre} className="flex items-center gap-3">
                <span className="text-xs text-white/30 w-4">#{i + 1}</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: `${(count / stats.topGenres[0].count) * 100}%` }} />
                </div>
                <span className="text-xs text-white/60 w-24 truncate">{genre}</span>
                <span className="text-xs text-violet-400 font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top directors */}
      {stats.topDirectors.length > 0 && (
        <div className="rounded-2xl border border-white/8 bg-[#1a1a28] p-5">
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-3">Directores más vistos</h3>
          <div className="space-y-2.5">
            {stats.topDirectors.map(({ director, count }, i) => (
              <div key={director} className="flex items-center gap-3">
                <span className="text-sm">{['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i]}</span>
                <span className="flex-1 text-sm text-white/75">{director}</span>
                <span className="text-xs text-white/40">{count} {count === 1 ? 'título' : 'títulos'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add Content Modal ─────────────────────────────────────────────────────────

function AddContentModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TmdbResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<TmdbResult | null>(null)
  const [platform, setPlatform] = useState<Platform>('Netflix')
  const [status, setStatus] = useState<ContentStatus>('pendiente')
  const [rating, setRating] = useState(0)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualType, setManualType] = useState<ContentType>('pelicula')
  const [mode, setMode] = useState<'search' | 'manual'>('search')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!query.trim() || !hasTmdbKey()) { setResults([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try { setResults(await tmdbSearch(query)) }
      catch { setResults([]) }
      finally { setSearching(false) }
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const reset = () => {
    setQuery(''); setResults([]); setSelected(null); setPlatform('Netflix')
    setStatus('pendiente'); setRating(0); setNotes(''); setSaving(false)
    setManualTitle(''); setMode('search')
  }

  const handleClose = () => { reset(); onClose() }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (selected) {
        await addContent({
          tmdbId: selected.tmdbId,
          title: selected.title,
          type: selected.mediaType === 'serie' ? 'serie' : selected.mediaType === 'anime' ? 'anime' : 'pelicula',
          status,
          platform,
          posterUrl: selected.posterUrl,
          year: selected.year,
          duration: selected.duration,
          totalEpisodes: selected.totalEpisodes,
          tmdbRating: selected.tmdbRating,
          genres: selected.genres,
          director: selected.director,
          synopsis: selected.synopsis,
          trailerUrl: selected.trailerUrl,
          rating: status === 'visto' && rating > 0 ? rating : undefined,
          watchedAt: status === 'visto' ? new Date() : undefined,
          userNotes: notes || undefined,
        })
      } else if (manualTitle.trim()) {
        await addContent({
          title: manualTitle.trim(),
          type: manualType,
          status,
          platform,
          rating: status === 'visto' && rating > 0 ? rating : undefined,
          watchedAt: status === 'visto' ? new Date() : undefined,
          userNotes: notes || undefined,
        })
      }
      handleClose()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const canSave = selected !== null || manualTitle.trim().length > 0

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={handleClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full md:max-w-lg rounded-t-3xl md:rounded-3xl border border-white/10 bg-[#141420] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h3 className="font-semibold text-white/90">Añadir contenido</h3>
          <button onClick={handleClose} className="w-8 h-8 rounded-xl bg-white/8 hover:bg-white/12 flex items-center justify-center transition">
            <X size={15} className="text-white/60" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 rounded-xl bg-white/5">
            {(['search', 'manual'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition ${mode === m ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/70'}`}>
                {m === 'search' ? '🔍 Buscar en TMDB' : '✏️ Manual'}
              </button>
            ))}
          </div>

          {mode === 'search' ? (
            <>
              {!hasTmdbKey() && (
                <TmdbKeyInput />
              )}
              {hasTmdbKey() && (
                <>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      value={query}
                      onChange={e => { setQuery(e.target.value); setSelected(null) }}
                      placeholder="Busca una película, serie o anime..."
                      className="w-full rounded-xl bg-white/5 border border-white/8 pl-9 pr-4 py-3 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-violet-500/40"
                    />
                    {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />}
                  </div>

                  <AnimatePresence>
                    {results.length > 0 && !selected && (
                      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="space-y-1 max-h-60 overflow-y-auto rounded-xl border border-white/8 bg-white/3 p-1">
                        {results.map(r => (
                          <button key={r.tmdbId} onClick={() => { setSelected(r); setQuery(r.title) }}
                            className="flex items-center gap-3 w-full rounded-lg hover:bg-white/8 p-2 text-left transition">
                            <div className="w-9 shrink-0 rounded overflow-hidden" style={{ aspectRatio: '2/3' }}>
                              <PosterImg url={r.posterUrl} title={r.title} tmdbId={r.tmdbId} year={r.year} className="w-full h-full" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm text-white/85 truncate">{r.title}</p>
                              <p className="text-xs text-white/35">{r.year} · {r.mediaType}</p>
                            </div>
                            {r.tmdbRating && (
                              <div className="ml-auto flex items-center gap-1 shrink-0">
                                <Star size={10} className="text-yellow-400 fill-yellow-400" />
                                <span className="text-xs text-white/50">{r.tmdbRating}</span>
                              </div>
                            )}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {selected && (
                    <div className="flex gap-3 rounded-xl border border-violet-500/30 bg-violet-500/8 p-3">
                      <div className="w-12 shrink-0 rounded-lg overflow-hidden" style={{ aspectRatio: '2/3' }}>
                        <PosterImg url={selected.posterUrl} title={selected.title} tmdbId={selected.tmdbId} year={selected.year} className="w-full h-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white/90">{selected.title}</p>
                        <p className="text-xs text-white/40">{selected.year} · {selected.mediaType}</p>
                        {selected.tmdbRating && (
                          <div className="flex items-center gap-1 mt-1">
                            <Star size={10} className="text-yellow-400 fill-yellow-400" />
                            <span className="text-xs text-white/60">{selected.tmdbRating}/10 en TMDB</span>
                          </div>
                        )}
                      </div>
                      <button onClick={() => setSelected(null)} className="shrink-0 w-6 h-6 rounded-lg bg-white/8 flex items-center justify-center">
                        <X size={12} className="text-white/50" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <input value={manualTitle} onChange={e => setManualTitle(e.target.value)}
                placeholder="Título del contenido"
                className="w-full rounded-xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/80 placeholder:text-white/25 focus:outline-none" />
              <select value={manualType} onChange={e => setManualType(e.target.value as ContentType)}
                className="w-full rounded-xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/70 focus:outline-none">
                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          )}

          {/* Common fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-white/30 mb-1.5 block">Plataforma</label>
              <select value={platform} onChange={e => setPlatform(e.target.value as Platform)}
                className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-sm text-white/70 focus:outline-none">
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-white/30 mb-1.5 block">Estado</label>
              <select value={status} onChange={e => setStatus(e.target.value as ContentStatus)}
                className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-sm text-white/70 focus:outline-none">
                <option value="pendiente">Pendiente</option>
                <option value="viendo">Viendo</option>
                <option value="visto">Visto</option>
              </select>
            </div>
          </div>

          {status === 'visto' && (
            <div>
              <label className="text-[10px] uppercase tracking-widest text-white/30 mb-1.5 block">Puntuación</label>
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={10} step={0.5} value={rating}
                  onChange={e => setRating(Number(e.target.value))}
                  className="flex-1 h-2 rounded-lg appearance-none bg-white/10 cursor-pointer accent-violet-500" />
                <span className="text-sm font-semibold text-violet-300 w-8 text-right">{rating || '—'}</span>
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/30 mb-1.5 block">Notas personales</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Tu opinión, contexto, lo que quieras recordar..."
              className="w-full rounded-xl bg-white/5 border border-white/8 px-4 py-3 text-sm text-white/70 placeholder:text-white/20 focus:outline-none resize-none" />
          </div>

          <button onClick={handleSave} disabled={!canSave || saving}
            className="w-full rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed py-3.5 text-sm font-semibold text-white transition">
            {saving ? 'Guardando...' : 'Añadir a mi colección'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── TMDB Key Input ────────────────────────────────────────────────────────────

function TmdbKeyInput() {
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-4 space-y-3">
      <p className="text-xs text-amber-300/80">
        Para buscar automáticamente en TMDB y obtener pósters, añade tu API key gratuita de{' '}
        <span className="underline">themoviedb.org</span> → Ajustes → API.
      </p>
      <div className="flex gap-2">
        <input value={key} onChange={e => setKey(e.target.value)}
          placeholder="API Key de TMDB..."
          className="flex-1 rounded-xl bg-white/8 border border-white/10 px-3 py-2 text-xs text-white/70 focus:outline-none" />
        <button onClick={() => { saveTmdbKey(key); setSaved(true); window.location.reload() }}
          disabled={!key.trim() || saved}
          className="rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3 py-2 text-xs font-medium text-white transition">
          {saved ? '✓' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── Content Detail Modal ──────────────────────────────────────────────────────

function ContentDetailModal({ item, onClose, onDelete }: {
  item: Content
  onClose: () => void
  onDelete: (id: string) => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)

  const handleStatus = (newStatus: ContentStatus) => {
    const updates: Partial<Content> = { status: newStatus }
    if (newStatus === 'visto') updates.watchedAt = new Date()
    updateContent(item.id, updates)
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full md:max-w-md rounded-t-3xl md:rounded-3xl border border-white/10 bg-[#141420] max-h-[85vh] overflow-y-auto"
      >
        {/* Header with poster */}
        <div className="relative">
          {item.posterUrl && (
            <img src={item.posterUrl} alt={item.title}
              className="w-full h-40 object-cover object-top opacity-30" />
          )}
          <div className="absolute inset-0 bg-linear-to-b from-transparent to-[#141420]" />
          <button onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-black/60 flex items-center justify-center">
            <X size={15} className="text-white/70" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 flex gap-4 p-4">
            <div className="w-16 shrink-0 rounded-xl overflow-hidden shadow-xl" style={{ aspectRatio: '2/3' }}>
              <PosterImg url={item.posterUrl} title={item.title} tmdbId={item.tmdbId} year={item.year} className="w-full h-full" />
            </div>
            <div className="self-end pb-1">
              <h2 className="font-bold text-white text-base leading-tight">{item.title}</h2>
              <p className="text-xs text-white/45 mt-0.5">{item.year} · {item.director} · {item.platform}</p>
              {item.tmdbRating && (
                <div className="flex items-center gap-1 mt-1">
                  <Star size={11} className="text-yellow-400 fill-yellow-400" />
                  <span className="text-xs text-white/60">{item.tmdbRating}/10 TMDB</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Genres */}
          {item.genres && item.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.genres.map(g => (
                <span key={g} className="px-2.5 py-1 rounded-full text-[11px] bg-white/6 text-white/50">{g}</span>
              ))}
            </div>
          )}

          {/* Synopsis */}
          {item.synopsis && (
            <p className="text-sm text-white/60 leading-relaxed">{item.synopsis}</p>
          )}

          {/* Notes */}
          {item.userNotes && (
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-xs text-white/30 uppercase tracking-widest mb-1">Mis notas</p>
              <p className="text-sm text-white/70 italic">{item.userNotes}</p>
            </div>
          )}

          {/* Status actions */}
          <div className="grid grid-cols-3 gap-2">
            {(['pendiente', 'viendo', 'visto'] as ContentStatus[]).map(s => (
              <button key={s} onClick={() => handleStatus(s)}
                className={`py-2.5 rounded-xl text-xs font-medium transition ${item.status === s ? 'bg-violet-600 text-white' : 'bg-white/6 text-white/50 hover:bg-white/10'}`}>
                {s === 'pendiente' ? '⏳ Pendiente' : s === 'viendo' ? '▶ Viendo' : '✓ Visto'}
              </button>
            ))}
          </div>

          {/* Delete */}
          <div className="pt-2 border-t border-white/6">
            {confirmDel ? (
              <div className="flex gap-3">
                <button onClick={() => { onDelete(item.id); onClose() }}
                  className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 py-2.5 text-xs font-medium text-white transition">
                  Confirmar eliminación
                </button>
                <button onClick={() => setConfirmDel(false)}
                  className="flex-1 rounded-xl bg-white/8 py-2.5 text-xs text-white/60 transition">
                  Cancelar
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDel(true)}
                className="flex items-center gap-2 text-xs text-white/30 hover:text-red-400 transition">
                <Trash2 size={12} /> Eliminar de la colección
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function OcioPage() {
  const [content, setContent] = useState<Content[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('lista')
  const [showAdd, setShowAdd] = useState(false)
  const [detailItem, setDetailItem] = useState<Content | null>(null)
  const [todayMood, setTodayMood] = useState<number | null>(null)
  const [seeding, setSeeding] = useState(false)
  const tabRef = useRef<HTMLDivElement>(null)

  const hour = new Date().getHours()
  const isNight = hour >= 20 && hour < 24

  // Subscribe to Firebase content
  useEffect(() => {
    const unsub = subscribeContent((items) => {
      setContent(items)
      setLoading(false)
    })
    return unsub
  }, [])

  // Read today's mood from diary
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const q = query(collection(db, 'diary_entries'), where('date', '==', today))
    getDocs(q).then(snap => {
      if (!snap.empty) {
        const entry = snap.docs[0].data()
        setTodayMood(entry.mood ?? null)
      }
    }).catch(() => {})
  }, [])

  const handleSeedPhysical = async () => {
    if (seeding) return
    setSeeding(true)
    try {
      await seedPhysicalCollection(PHYSICAL_COLLECTION)
      localStorage.setItem(PHYSICAL_SEED_FLAG, '1')
    } catch (e) {
      console.error(e)
    } finally {
      setSeeding(false)
    }
  }

  const handleDiscover = (item: { tmdbId?: number; title: string; posterUrl?: string; year?: number; tmdbRating?: number; synopsis?: string }) => {
    addContent({
      tmdbId: item.tmdbId,
      title: item.title,
      type: 'pelicula',
      status: 'pendiente',
      platform: 'Otro',
      posterUrl: item.posterUrl,
      year: item.year,
      tmdbRating: item.tmdbRating,
      synopsis: item.synopsis,
    }).catch(() => {})
  }

  const physicalSeeded = !!localStorage.getItem(PHYSICAL_SEED_FLAG)

  const tabCounts: Record<Tab, number> = {
    lista: content.filter(c => c.status === 'pendiente').length,
    viendo: content.filter(c => c.status === 'viendo').length,
    visto: content.filter(c => c.status === 'visto').length,
    descubrir: 0,
    stats: 0,
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-4xl mx-auto pb-28">
      <PageHeader
        breadcrumb="Entretenimiento"
        title="Ocio"
        actions={
          <>
            {!physicalSeeded && (
              <button onClick={handleSeedPhysical} disabled={seeding}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 px-3 py-2 text-xs text-white/50 transition disabled:opacity-50">
                <Package size={12} />
                {seeding ? 'Importando...' : 'Colección física'}
              </button>
            )}
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 rounded-2xl bg-violet-600 hover:bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition">
              <Plus size={15} /> Añadir
            </button>
          </>
        }
      />

      {/* Sommelier de Contenido */}
      {!loading && (
        <ContentSommelier content={content} todayMood={todayMood} hour={hour} isNight={isNight} />
      )}

      {/* Tabs */}
      <div ref={tabRef} className="mb-6 -mx-4 px-4 overflow-x-auto scrollbar-hide">
        <div className="flex gap-1 min-w-max">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition ${activeTab === tab.id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/70 hover:bg-white/5'}`}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
              {tabCounts[tab.id] > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === tab.id ? 'bg-white/20 text-white/90' : 'bg-white/8 text-white/40'}`}>
                  {tabCounts[tab.id]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => <SkeletonPoster key={i} />)}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'lista' && (
              <TabMiLista content={content} onItemClick={setDetailItem} onAdd={() => setShowAdd(true)} />
            )}
            {activeTab === 'viendo' && (
              <TabViendo content={content} onItemClick={setDetailItem} />
            )}
            {activeTab === 'visto' && (
              <TabVisto content={content} onItemClick={setDetailItem} />
            )}
            {activeTab === 'descubrir' && (
              <TabDescubrir content={content} onDiscover={handleDiscover} />
            )}
            {activeTab === 'stats' && (
              <TabStats content={content} />
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showAdd && <AddContentModal isOpen={showAdd} onClose={() => setShowAdd(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {detailItem && (
          <ContentDetailModal
            item={detailItem}
            onClose={() => setDetailItem(null)}
            onDelete={(id) => { deleteContent(id); setDetailItem(null) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
