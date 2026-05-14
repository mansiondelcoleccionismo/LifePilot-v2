import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, ChevronDown, Sparkles, RefreshCw, X } from 'lucide-react'
import { callAI } from '@/services/ai.service'
import { addContent } from '@/services/entertainment.service'
import {
  resolvePosterUrl, hasTmdbKey, searchContent, getContentDetails,
  type TmdbResult,
} from '@/services/tmdb.service'
import type { Content, Platform } from '@/types/entertainment'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SommelierRec {
  titulo: string
  tituloOriginal: string
  tipo: string
  plataforma: string
  canal: string        // YouTube channel name when plataforma === 'YouTube Gratis'
  duracion: number
  año: number
  razon: string
}

type ChatMsgInput =
  | { role: 'sommelier'; text: string }
  | { role: 'user'; text: string }
  | { role: 'recs'; recs: SommelierRec[]; intro: string }
  | { role: 'error'; onRetry: () => void }

type ChatMsg = ChatMsgInput & { id: string }

// ── Dismissed titles (localStorage) ──────────────────────────────────────────

const DISMISSED_KEY = 'lifepilot_sommelier_dismissed'

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') } catch { return [] }
}

function persistDismiss(title: string) {
  const current = getDismissed()
  if (!current.includes(title)) {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...current, title]))
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_{1,2}(.+?)_{1,2}/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/^---+$/gm, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractJson<T>(raw: string): T | null {
  const stripped = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '')
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try { return JSON.parse(stripped.slice(start, end + 1)) as T }
  catch { return null }
}

function platStyle(p: string): string {
  if (p === 'Netflix') return 'bg-red-500/20 text-red-300 border-red-500/30'
  if (p.includes('Amazon') || p.includes('Prime')) return 'bg-blue-400/20 text-blue-300 border-blue-400/30'
  if (p === 'HBO' || p.includes('Max')) return 'bg-purple-500/20 text-purple-300 border-purple-500/30'
  if (p === 'YouTube' || p === 'YouTube Gratis') return 'bg-red-500/20 text-red-300 border-red-500/30'
  return 'bg-white/8 text-white/40 border-white/10'
}

const VALID_PLATFORMS = new Set<Platform>(['Netflix', 'Amazon Prime', 'YouTube', 'HBO', 'Físico', 'Otro'])
function normalizePlatform(p: string): Platform {
  if (VALID_PLATFORMS.has(p as Platform)) return p as Platform
  if (p.includes('Amazon') || p.includes('Prime')) return 'Amazon Prime'
  if (p.includes('HBO') || p.includes('Max')) return 'HBO'
  if (p === 'YouTube Gratis') return 'YouTube'
  return 'Otro'
}

const jwUrl  = (t: string) => `https://www.justwatch.com/es/buscar?q=${encodeURIComponent(t)}`
const ytUrl  = (titulo: string, canal: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(canal ? `${titulo} ${canal}` : titulo)}`

function watchUrl(rec: SommelierRec): string {
  return rec.plataforma === 'YouTube Gratis' ? ytUrl(rec.titulo, rec.canal) : jwUrl(rec.titulo)
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-red-400 shrink-0" aria-hidden>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/>
    </svg>
  )
}

const SKIP_WORDS = new Set(['el', 'la', 'los', 'las', 'the', 'a', 'an', 'un', 'una', 'de', 'of'])
function posterInitials(title: string): string {
  const words = title.split(/\s+/).filter(w => !SKIP_WORDS.has(w.toLowerCase()))
  if (!words.length) return title.slice(0, 2).toUpperCase()
  return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : (words[0][0] + words[1][0]).toUpperCase()
}
function titleHue(title: string): number {
  let h = 0
  for (const c of title) h = ((h << 5) - h + c.charCodeAt(0)) | 0
  return Math.abs(h) % 360
}
function fmtDuration(min: number): string {
  if (min <= 0) return ''
  return min >= 60
    ? `${Math.floor(min / 60)}h${min % 60 > 0 ? ` ${min % 60}m` : ''}`
    : `${min}m`
}

function streakInfo(content: Content[]): string {
  const watched = content.filter(c => c.status === 'visto' && c.watchedAt)
  if (watched.length < 2) return ''
  const byDay = new Map<string, string[]>()
  for (const item of watched) {
    const day = new Date(item.watchedAt!).toISOString().slice(0, 10)
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(item.type)
  }
  const days = [...byDay.keys()].sort().reverse()
  let count = 0; let dominant = ''
  for (const day of days) {
    const types = byDay.get(day)!
    const isSeries = types.filter(t => t === 'serie' || t === 'anime').length > types.length / 2
    const dayType = isSeries ? 'series' : 'películas'
    if (count === 0) dominant = dayType
    if (dayType !== dominant) break
    count++
    if (count >= 5) break
  }
  return count > 1 ? `Lleva ${count} noches seguidas viendo ${dominant}.` : ''
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function Avatar() {
  return (
    <div className="shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center text-base"
      style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
      🎬
    </div>
  )
}

function Dots() {
  return (
    <div className="flex gap-1.5 items-center py-0.5">
      {[0, 1, 2].map(i => (
        <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.28 }} />
      ))}
    </div>
  )
}

function SommelierBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-3 items-start">
      <Avatar />
      <div className="flex-1 max-w-[88%] rounded-2xl rounded-tl-sm bg-white/6 border border-white/8 px-4 py-3">
        <p className="text-sm text-white/85 leading-relaxed">{text}</p>
      </div>
    </div>
  )
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-violet-600/30 border border-violet-500/20 px-4 py-2.5">
        <p className="text-sm text-white/85">{text}</p>
      </div>
    </div>
  )
}

function LoadingBubble() {
  return (
    <div className="flex gap-3 items-start">
      <Avatar />
      <div className="rounded-2xl rounded-tl-sm bg-white/6 border border-white/8 px-4 py-3.5">
        <Dots />
      </div>
    </div>
  )
}

function ErrorBubble({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex gap-3 items-start">
      <Avatar />
      <div className="flex-1 max-w-[88%] rounded-2xl rounded-tl-sm bg-rose-500/8 border border-rose-500/20 px-4 py-3">
        <p className="text-sm text-white/60 mb-2">No pude obtener las recomendaciones. ¿Lo intentamos de nuevo?</p>
        <button onClick={onRetry}
          className="flex items-center gap-1.5 text-xs text-violet-300 hover:text-violet-200 transition">
          <RefreshCw size={11} /> Intentar de nuevo
        </button>
      </div>
    </div>
  )
}

// ── Rec Detail Modal ──────────────────────────────────────────────────────────

function RecDetailModal({
  rec, initialPoster, onClose, onStart, onSave, onDismiss,
}: {
  rec: SommelierRec
  initialPoster: string | undefined
  onClose: () => void
  onStart: () => void
  onSave: () => void
  onDismiss: () => void
}) {
  const [details, setDetails]           = useState<TmdbResult | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [showTrailer, setShowTrailer]   = useState(false)

  const hue  = titleHue(rec.titulo)
  const init = posterInitials(rec.titulo)
  const type = rec.tipo === 'serie' || rec.tipo === 'anime' ? 'tv' : 'movie'

  // Use the high-res poster from details once loaded, fall back to initial
  const activePoster = details?.posterUrl ?? initialPoster

  useEffect(() => {
    if (!hasTmdbKey()) return
    let cancelled = false

    async function load() {
      setDetailsLoading(true)
      try {
        // 1. Search for tmdbId
        let results = await searchContent(rec.titulo, type)

        // 2. Try original title if no results
        if (!results.length && rec.tituloOriginal && rec.tituloOriginal !== rec.titulo) {
          results = await searchContent(rec.tituloOriginal, type)
        }

        // 3. Cross-type fallback
        if (!results.length) {
          const alt = type === 'movie' ? 'tv' : 'movie'
          results = await searchContent(rec.titulo, alt)
        }

        const tmdbId = results[0]?.tmdbId
        if (!tmdbId || cancelled) return

        // 4. Get full details (poster w500, synopsis, director, cast, trailer)
        const detail = await getContentDetails(tmdbId, type)
        if (!cancelled) setDetails(detail)
      } catch (e) {
        console.error('[Modal] Failed to load TMDB details:', e)
      } finally {
        if (!cancelled) setDetailsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.titulo])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const durStr = fmtDuration(rec.duracion)

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/75 z-50 flex items-end md:items-center justify-center"
        onClick={onClose}
      >
        {/* Panel */}
        <motion.div
          key="modal-panel"
          initial={{ opacity: 0, y: 48 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 48 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="relative w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl md:rounded-3xl border border-white/10"
          style={{ background: 'linear-gradient(180deg, #16132a 0%, #0f0d1c 100%)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle (mobile) */}
          <div className="md:hidden w-10 h-1 rounded-full bg-white/15 mx-auto mt-3" />

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white/60 hover:text-white/90 transition"
          >
            <X size={15} />
          </button>

          {/* Hero poster */}
          <div className="relative h-64 md:h-72 overflow-hidden rounded-t-3xl md:rounded-t-3xl">
            {activePoster ? (
              <img src={activePoster} alt={rec.titulo} className="w-full h-full object-cover object-top" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-5xl font-bold text-white/50 select-none"
                style={{ background: `hsl(${hue}, 40%, 16%)` }}>
                {init}
              </div>
            )}
            {/* Fade to panel bg */}
            <div className="absolute inset-0 bg-linear-to-t from-[#16132a] via-[#16132a]/30 to-transparent" />
          </div>

          {/* Content */}
          <div className="px-5 pb-6 -mt-10 relative">
            {/* Title */}
            <h2 className="text-xl font-bold text-white/95 leading-tight">{rec.titulo}</h2>
            {rec.tituloOriginal && rec.tituloOriginal !== rec.titulo && (
              <p className="text-[13px] text-white/35 italic mt-0.5">{rec.tituloOriginal}</p>
            )}

            {/* Meta pills */}
            <div className="flex flex-wrap gap-1.5 mt-3 mb-4">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1 ${platStyle(rec.plataforma)}`}>
                {rec.plataforma === 'YouTube Gratis' && <YouTubeIcon />}
                {rec.plataforma}
              </span>
              {rec.canal && (
                <span className="px-2.5 py-1 rounded-full text-xs bg-white/6 text-white/40 border border-white/8">
                  📺 {rec.canal}
                </span>
              )}
              {rec.año > 0 && (
                <span className="px-2.5 py-1 rounded-full text-xs bg-white/8 text-white/50 border border-white/10">
                  {rec.año}
                </span>
              )}
              {durStr && (
                <span className="px-2.5 py-1 rounded-full text-xs bg-white/8 text-white/50 border border-white/10">
                  {durStr}
                </span>
              )}
              {details?.tmdbRating && (
                <span className="px-2.5 py-1 rounded-full text-xs bg-amber-500/15 text-amber-300 border border-amber-500/25 flex items-center gap-1">
                  ⭐ {details.tmdbRating}
                </span>
              )}
            </div>

            {/* Sommelier reason */}
            <div className="rounded-2xl bg-violet-500/8 border border-violet-500/20 px-4 py-3 mb-4">
              <p className="text-[10px] uppercase tracking-widest text-violet-400/55 mb-1.5">Por qué te lo recomiendo</p>
              <p className="text-[13px] text-white/70 italic leading-relaxed">{rec.razon}</p>
            </div>

            {/* TMDB details */}
            {detailsLoading ? (
              <div className="space-y-2.5 mb-5">
                {[100, 90, 75].map(w => (
                  <div key={w} className="h-3.5 bg-white/6 rounded-lg animate-pulse" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : details ? (
              <div className="mb-4 space-y-4">
                {/* Synopsis */}
                {details.synopsis && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/25 mb-2">Sinopsis</p>
                    <p className="text-[13px] text-white/65 leading-relaxed">{details.synopsis}</p>
                  </div>
                )}

                {/* Director + cast */}
                {(details.director || details.cast?.length) && (
                  <div className="space-y-1.5">
                    {details.director && (
                      <div className="flex gap-3">
                        <span className="text-[10px] text-white/30 w-14 shrink-0 pt-0.5">Director</span>
                        <span className="text-[13px] text-white/70 flex-1">{details.director}</span>
                      </div>
                    )}
                    {details.cast?.length ? (
                      <div className="flex gap-3">
                        <span className="text-[10px] text-white/30 w-14 shrink-0 pt-0.5">Reparto</span>
                        <span className="text-[13px] text-white/70 flex-1">{details.cast.join(', ')}</span>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Trailer */}
                {details.trailerUrl && !showTrailer && (
                  <button
                    onClick={() => setShowTrailer(true)}
                    className="w-full rounded-2xl bg-white/5 border border-white/10 py-3 flex items-center justify-center gap-2 text-[13px] text-white/55 hover:bg-white/8 hover:text-white/75 transition"
                  >
                    ▶ Ver tráiler
                  </button>
                )}
                {details.trailerUrl && showTrailer && (
                  <div className="relative w-full rounded-2xl overflow-hidden" style={{ paddingTop: '56.25%' }}>
                    <iframe
                      src={details.trailerUrl + '?autoplay=1'}
                      className="absolute inset-0 w-full h-full"
                      allow="autoplay; encrypted-media"
                      allowFullScreen
                      title={`Tráiler: ${rec.titulo}`}
                    />
                  </div>
                )}
              </div>
            ) : null}

            {/* Action buttons */}
            <div className="space-y-2 pt-1">
              <a
                href={watchUrl(rec)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onStart}
                className="flex items-center justify-center gap-2 w-full rounded-2xl bg-violet-600 hover:bg-violet-500 py-3.5 text-sm font-semibold text-white transition"
              >
                {rec.plataforma === 'YouTube Gratis'
                  ? <><YouTubeIcon /> Buscar en YouTube</>
                  : '▶ Ver esta'
                }
              </a>
              <button
                onClick={onSave}
                className="w-full rounded-2xl bg-white/6 hover:bg-white/10 border border-white/10 py-3 text-sm text-white/70 hover:text-white/90 transition"
              >
                💾 Guardar en mi lista
              </button>
              <button
                onClick={onDismiss}
                className="w-full py-2.5 text-xs text-white/28 hover:text-rose-400/60 transition"
              >
                ❌ No me interesa — no volver a sugerir
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── Rec Card ──────────────────────────────────────────────────────────────────

function RecCard({ rec, index, onOpen, onStart, onSave }: {
  rec: SommelierRec
  index: number
  onOpen: (poster: string | undefined) => void
  onStart: () => void
  onSave: () => void
}) {
  const [poster, setPoster] = useState<string | undefined>()

  useEffect(() => {
    if (!hasTmdbKey()) return
    const year = rec.año > 0 ? rec.año : undefined
    resolvePosterUrl({
      title: rec.titulo,
      year,
      originalTitle: rec.tituloOriginal !== rec.titulo ? rec.tituloOriginal : undefined,
      mediaType: rec.tipo === 'serie' || rec.tipo === 'anime' ? 'tv' : 'movie',
    }).then(u => { if (u) setPoster(u) })
  }, [rec.titulo, rec.tituloOriginal, rec.año, rec.tipo])

  const hue  = titleHue(rec.titulo)
  const init = posterInitials(rec.titulo)
  const dur  = fmtDuration(rec.duracion)

  const handleCardClick = () => onOpen(poster)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
      onClick={handleCardClick}
      className="flex gap-3 rounded-2xl border border-white/8 bg-white/4 p-3 hover:border-violet-500/30 hover:bg-white/6 transition-all cursor-pointer"
    >
      {/* Poster thumbnail */}
      <div className="shrink-0 w-18 rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: '2/3' }}>
        {poster
          ? <img src={poster} alt={rec.titulo} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center font-bold text-white/90 text-lg select-none"
              style={{ background: `hsl(${hue}, 40%, 22%)` }}>{init}</div>
        }
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div>
          <h4 className="font-semibold text-white/92 text-sm leading-tight">{rec.titulo}</h4>
          {rec.tituloOriginal && rec.tituloOriginal !== rec.titulo && (
            <p className="text-[11px] text-white/28 italic truncate">{rec.tituloOriginal}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1 ${platStyle(rec.plataforma)}`}>
            {rec.plataforma === 'YouTube Gratis' && <YouTubeIcon />}
            {rec.plataforma === 'YouTube Gratis' ? 'YouTube Gratis' : rec.plataforma}
          </span>
          {dur && <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/6 text-white/40 border border-white/8">{dur}</span>}
          {rec.año > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/6 text-white/40 border border-white/8">{rec.año}</span>}
        </div>
        {rec.canal && (
          <p className="text-[10px] text-white/35 truncate">📺 {rec.canal}</p>
        )}
        <p className="text-[11px] text-white/55 leading-snug line-clamp-2 italic">{rec.razon}</p>
        <div className="flex gap-2 mt-auto pt-0.5">
          <a
            href={watchUrl(rec)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => { e.stopPropagation(); onStart() }}
            className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-500 px-2 py-1.5 text-[11px] font-semibold text-white text-center transition"
          >
            {rec.plataforma === 'YouTube Gratis' ? '▶ Buscar en YouTube' : '▶ Ver esta'}
          </a>
          <button
            onClick={e => { e.stopPropagation(); onSave() }}
            className="px-2.5 py-1.5 rounded-xl bg-white/6 hover:bg-white/12 text-[11px] text-white/55 border border-white/8 transition"
          >
            💾 Guardar
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Quick chips ───────────────────────────────────────────────────────────────

const QUICK_CHIPS = [
  { label: 'Sorpréndeme', emoji: '🎲' },
  { label: 'Documental', emoji: '📚' },
  { label: 'Película corta', emoji: '⏱️' },
  { label: 'Serie para engancharme', emoji: '📺' },
  { label: 'Algo de España', emoji: '🇪🇸' },
  { label: 'Menos de 90 min', emoji: '⚡' },
]

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  content: Content[]
  todayMood: number | null
  hour: number
  isNight: boolean
}

export function ContentSommelier({ content, todayMood, hour, isNight }: Props) {
  const [collapsed, setCollapsed] = useState(!isNight)
  const [messages, setMessages]   = useState<ChatMsg[]>([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [welcomed, setWelcomed]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  // Modal state
  const [modalRec, setModalRec]         = useState<SommelierRec | null>(null)
  const [modalPoster, setModalPoster]   = useState<string | undefined>()

  // Dismissed titles
  const [dismissedTitles, setDismissedTitles] = useState<Set<string>>(
    () => new Set(getDismissed()),
  )

  const lastWatched = content
    .filter(c => c.status === 'visto')
    .sort((a, b) => new Date(b.watchedAt ?? b.addedAt).getTime() - new Date(a.watchedAt ?? a.addedAt).getTime())
    .slice(0, 5)

  const addMsg = useCallback((msg: ChatMsgInput) => {
    setMessages(prev => [...prev, { ...msg, id: crypto.randomUUID() } as ChatMsg])
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Welcome ────────────────────────────────────────────────────────────────

  const generateWelcome = useCallback(async () => {
    if (welcomed || loading) return
    setWelcomed(true)
    setLoading(true)
    try {
      const lastStr = lastWatched.length
        ? lastWatched.map(c => `${c.title}${c.rating ? ` (${c.rating}/10)` : ''}`).join(', ')
        : 'nada reciente'
      const streak = streakInfo(content)

      const prompt = `Eres el sommelier de contenido personal de Daniel (35 años, España).
Son las ${hour}h. Mood hoy: ${todayMood ? `${todayMood}/5` : 'sin dato'}.
Últimas vistas: ${lastStr}. ${streak}

Escribe exactamente 2 frases en español:
- Frase 1: algo concreto sobre su historial reciente (menciona un título o patrón de lo que ha visto)
- Frase 2: una sugerencia de tipo de contenido para esta noche o invítale a que te diga qué le apetece

Tono: amigo cinéfilo cercano. Sin formato, sin asteriscos, solo texto.`

      const resp = await callAI(prompt, undefined, true, 600)
      addMsg({ role: 'sommelier', text: cleanText(resp) })
    } catch {
      addMsg({ role: 'sommelier', text: `Buenas noches. ${lastWatched[0] ? `Vi que terminaste ${lastWatched[0].title}, buen gusto.` : '¿Qué te apetece esta noche?'} Dime qué te pide el cuerpo o pulsa uno de los chips de abajo.` })
    } finally {
      setLoading(false)
    }
  }, [welcomed, loading, lastWatched, content, hour, todayMood, addMsg])

  useEffect(() => {
    if (!collapsed) generateWelcome()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed])

  // ── Send ───────────────────────────────────────────────────────────────────

  const requestRecs = useCallback(async (text: string) => {
    setLoading(true)
    try {
      const lastStr = lastWatched
        .map(c => `${c.title}${c.rating ? ` (${c.rating}/10)` : ''}`)
        .join(', ') || 'sin historial'
      const dismissedStr = dismissedTitles.size > 0
        ? ` Títulos que NO quiere que le sugieras: ${[...dismissedTitles].join(', ')}.`
        : ''

      const prompt = `Eres el sommelier de cine personal de Daniel. Responde SOLO con el JSON, sin ningún texto antes ni después, sin bloques de código markdown.

Perfil: thrillers, documental histórico (España s.XX, guerra civil, franquismo), anime de culto, cine de autor, true crime, geopolítica. Plataformas principales: Netflix y Amazon Prime. Evita: romance, comedia romántica, superhéroes Marvel.${dismissedStr}
Historial: ${lastStr}
Petición: "${text}"
Contexto: ${hour}h, mood ${todayMood ?? '?'}/5

CANALES DE YOUTUBE DE DOCUMENTALES (usar cuando pida documentales de YouTube o gratis):
- "DW Documental": documentales internacionales serios en español
- "RTVE Play": España S.XX, guerra civil, transición, franquismo — PRIORIZAR si pide historia española
- "Documentales Completos en Español": variado
- "Al Jazeera Español": geopolítica, conflictos internacionales
- "Euronews en español": actualidad internacional
- "La 2 Documentales": cultura y sociedad española
- "Historia de España RTVE": específico historia española
- "Malbert Investiga": conspiraciones y misterios históricos
- "RawRoger": misterios, casos reales, sucesos extraños
Cuando recomiendes un canal de YouTube: pon plataforma="YouTube Gratis", canal=nombre exacto del canal, título exacto del documental para buscarlo.

Devuelve exactamente este JSON con 3 recomendaciones reales y disponibles:
{"intro":"Una frase tuya de máximo 10 palabras presentando las opciones","recs":[{"titulo":"título exacto","tituloOriginal":"título original","tipo":"pelicula|serie|documental|anime","plataforma":"Netflix|Amazon Prime|YouTube Gratis|Buscar en JustWatch","canal":"nombre del canal si YouTube Gratis, vacío si no","duracion":90,"año":2020,"razon":"por qué encaja, máx 10 palabras"},{"titulo":"...","tituloOriginal":"...","tipo":"...","plataforma":"...","canal":"","duracion":0,"año":0,"razon":"..."},{"titulo":"...","tituloOriginal":"...","tipo":"...","plataforma":"...","canal":"","duracion":0,"año":0,"razon":"..."}]}`

      const raw    = await callAI(prompt, undefined, true, 2500)
      const parsed = extractJson<{ intro: string; recs: SommelierRec[] }>(raw)

      if (parsed?.recs?.length) {
        addMsg({ role: 'sommelier', text: cleanText(parsed.intro || 'Aquí tienes mis recomendaciones para esta noche:') })
        addMsg({ role: 'recs', intro: '', recs: parsed.recs.map(r => ({ ...r, razon: cleanText(r.razon) })) })
      } else {
        addMsg({ role: 'error', onRetry: () => requestRecs(text) })
      }
    } catch {
      addMsg({ role: 'error', onRetry: () => requestRecs(text) })
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [lastWatched, hour, todayMood, dismissedTitles, addMsg])

  const handleSend = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setInput('')
    addMsg({ role: 'user', text: trimmed })
    requestRecs(trimmed)
  }

  const saveRec = (rec: SommelierRec, status: 'pendiente' | 'viendo') => {
    addContent({
      title: rec.titulo,
      type: rec.tipo as 'pelicula' | 'serie' | 'documental' | 'anime',
      status,
      platform: normalizePlatform(rec.plataforma),
      year: rec.año,
      duration: rec.duracion,
      recommended: true,
      recommendReason: rec.razon,
    }).catch(() => {})
  }

  const openModal = (rec: SommelierRec, poster: string | undefined) => {
    setModalRec(rec)
    setModalPoster(poster)
  }

  const closeModal = () => {
    setModalRec(null)
    setModalPoster(undefined)
  }

  const dismissRec = (title: string) => {
    persistDismiss(title)
    setDismissedTitles(prev => new Set([...prev, title]))
    closeModal()
  }

  // ── Collapsed ──────────────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => setCollapsed(false)}
        className="w-full mb-6 flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 hover:bg-white/6 px-4 py-3.5 transition text-left group"
      >
        <span className="text-xl">🎬</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white/80">Sommelier de Contenido</p>
          <p className="text-xs text-white/35">¿Qué veo esta noche? · IA personalizada</p>
        </div>
        <Sparkles size={14} className="text-violet-400 shrink-0 group-hover:text-violet-300 transition" />
      </motion.button>
    )
  }

  // ── Expanded ───────────────────────────────────────────────────────────────

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #12101f 0%, #0e0c1a 100%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-base shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
              🎬
            </div>
            <div>
              <p className="text-sm font-semibold text-white/90">Sommelier de Contenido</p>
              <p className="text-[11px] text-violet-300/55">IA personalizada · {hour}h</p>
            </div>
          </div>
          <button onClick={() => setCollapsed(true)}
            className="w-7 h-7 rounded-xl bg-white/6 hover:bg-white/10 flex items-center justify-center transition">
            <ChevronDown size={13} className="text-white/50" />
          </button>
        </div>

        {/* Chat area */}
        <div className="px-5 py-4 space-y-4 max-h-104 overflow-y-auto">
          <AnimatePresence initial={false}>
            {messages.length === 0 && loading && <LoadingBubble key="init-loading" />}

            {messages.slice(-8).map(msg => {
              if (msg.role === 'sommelier') return (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <SommelierBubble text={msg.text} />
                </motion.div>
              )
              if (msg.role === 'user') return (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <UserBubble text={msg.text} />
                </motion.div>
              )
              if (msg.role === 'error') return (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <ErrorBubble onRetry={() => {
                    setMessages(prev => prev.filter(m => m.id !== msg.id))
                    msg.onRetry()
                  }} />
                </motion.div>
              )
              if (msg.role === 'recs') {
                const visibleRecs = msg.recs.filter(r => !dismissedTitles.has(r.titulo))
                if (!visibleRecs.length) return null
                return (
                  <motion.div key={msg.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2.5">
                    {visibleRecs.map((rec, i) => (
                      <RecCard
                        key={rec.titulo}
                        rec={rec}
                        index={i}
                        onOpen={(poster) => openModal(rec, poster)}
                        onStart={() => saveRec(rec, 'viendo')}
                        onSave={() => saveRec(rec, 'pendiente')}
                      />
                    ))}
                  </motion.div>
                )
              }
              return null
            })}

            {loading && messages.length > 0 && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <LoadingBubble />
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* Quick chips */}
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {QUICK_CHIPS.map(chip => (
            <button key={chip.label}
              onClick={() => handleSend(`${chip.emoji} ${chip.label}`)}
              disabled={loading}
              className="px-3 py-1.5 rounded-full text-xs border border-white/10 bg-white/5 text-white/55 hover:bg-violet-500/20 hover:border-violet-500/40 hover:text-white/80 transition disabled:opacity-40">
              {chip.emoji} {chip.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="px-4 pb-4">
          <div className="flex gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 focus-within:border-violet-500/40 transition">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input) } }}
              placeholder="¿Qué te apetece esta noche?"
              className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none min-w-0"
            />
            <button onClick={() => handleSend(input)} disabled={loading || !input.trim()}
              className="shrink-0 w-8 h-8 rounded-xl bg-violet-600 hover:bg-violet-500 flex items-center justify-center transition disabled:opacity-40">
              <Send size={13} className="text-white" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Detail modal */}
      {modalRec && (
        <RecDetailModal
          rec={modalRec}
          initialPoster={modalPoster}
          onClose={closeModal}
          onStart={() => { saveRec(modalRec, 'viendo'); closeModal() }}
          onSave={() => { saveRec(modalRec, 'pendiente'); closeModal() }}
          onDismiss={() => dismissRec(modalRec.titulo)}
        />
      )}
    </>
  )
}
