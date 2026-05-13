import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Send, ChevronDown, Sparkles } from 'lucide-react'
import { callAI } from '@/services/ai.service'
import { addContent } from '@/services/entertainment.service'
import { resolvePosterUrl, hasTmdbKey } from '@/services/tmdb.service'
import type { Content, Platform } from '@/types/entertainment'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SommelierRec {
  titulo: string
  tituloOriginal: string
  tipo: string
  plataforma: string
  duracion: number
  año: number
  razon: string
}

type ChatMsgInput =
  | { role: 'sommelier'; text: string }
  | { role: 'user'; text: string }
  | { role: 'recs'; text: string; recs: SommelierRec[] }

type ChatMsg = ChatMsgInput & { id: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanMarkdown(text: string): string {
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

function useTypewriter(text: string, speed = 8) {
  const [displayed, setDisplayed] = useState('')
  useEffect(() => {
    setDisplayed('')
    if (!text) return
    let i = 0
    const id = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(id)
    }, speed)
    return () => clearInterval(id)
  }, [text])
  return displayed
}

function platStyle(p: string): string {
  if (p === 'Netflix') return 'bg-red-500/20 text-red-300 border-red-500/30'
  if (p.includes('Amazon') || p.includes('Prime')) return 'bg-blue-400/20 text-blue-300 border-blue-400/30'
  if (p === 'HBO' || p.includes('Max')) return 'bg-purple-500/20 text-purple-300 border-purple-500/30'
  if (p === 'YouTube') return 'bg-red-400/20 text-red-300 border-red-400/30'
  return 'bg-white/8 text-white/40 border-white/10'
}

const VALID_PLATFORMS = new Set<Platform>(['Netflix', 'Amazon Prime', 'YouTube', 'HBO', 'Físico', 'Otro'])
function normalizePlatform(p: string): Platform {
  if (VALID_PLATFORMS.has(p as Platform)) return p as Platform
  if (p.includes('Amazon') || p.includes('Prime')) return 'Amazon Prime'
  if (p.includes('HBO') || p.includes('Max')) return 'HBO'
  return 'Otro'
}

const jwUrl = (t: string) => `https://www.justwatch.com/es/buscar?q=${encodeURIComponent(t)}`

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
  let count = 0
  let dominant = ''
  for (const day of days) {
    const types = byDay.get(day)!
    const seriesCount = types.filter(t => t === 'serie' || t === 'anime').length
    const dayType = seriesCount > types.length / 2 ? 'series' : 'películas'
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
  const displayed = useTypewriter(text)
  return (
    <div className="flex gap-3 items-start">
      <Avatar />
      <div className="flex-1 max-w-[88%] rounded-2xl rounded-tl-sm bg-white/6 border border-white/8 px-4 py-3">
        <p className="text-sm text-white/82 leading-relaxed whitespace-pre-wrap">
          {displayed || <Dots />}
        </p>
      </div>
    </div>
  )
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-violet-600/30 border border-violet-500/20 px-4 py-2.5">
        <p className="text-sm text-white/82">{text}</p>
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

// ── Rec Card ──────────────────────────────────────────────────────────────────

function RecCard({ rec, index, onStart, onSave }: {
  rec: SommelierRec; index: number; onStart: () => void; onSave: () => void
}) {
  const [poster, setPoster] = useState<string | undefined>()

  useEffect(() => {
    if (!hasTmdbKey()) return
    resolvePosterUrl({ title: rec.titulo, year: rec.año }).then(u => { if (u) setPoster(u) })
  }, [rec.titulo, rec.año])

  const hue = titleHue(rec.titulo)
  const init = posterInitials(rec.titulo)
  const dur = rec.duracion >= 60
    ? `${Math.floor(rec.duracion / 60)}h${rec.duracion % 60 > 0 ? ` ${rec.duracion % 60}m` : ''}`
    : `${rec.duracion}m`

  return (
    <motion.div
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.14, duration: 0.38 }}
      className="flex gap-3 rounded-2xl border border-white/8 bg-white/4 p-3 hover:border-white/14 transition"
    >
      <div className="shrink-0 w-17.5 rounded-xl overflow-hidden shadow-lg" style={{ aspectRatio: '2/3' }}>
        {poster
          ? <img src={poster} alt={rec.titulo} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center font-bold text-white/90 text-lg select-none"
              style={{ background: `hsl(${hue}, 40%, 22%)` }}>{init}</div>
        }
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div>
          <h4 className="font-semibold text-white/90 text-sm leading-tight line-clamp-1">{rec.titulo}</h4>
          {rec.tituloOriginal && rec.tituloOriginal !== rec.titulo && (
            <p className="text-[11px] text-white/30 line-clamp-1 italic">{rec.tituloOriginal}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${platStyle(rec.plataforma)}`}>
            {rec.plataforma}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/6 text-white/40 border border-white/8">{dur}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/6 text-white/40 border border-white/8">{rec.año}</span>
        </div>
        <p className="text-[11px] text-white/50 italic leading-snug line-clamp-2">{rec.razon}</p>
        <div className="flex gap-2 mt-auto pt-0.5">
          <a
            href={jwUrl(rec.titulo)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onStart}
            className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-500 px-2 py-1.5 text-[11px] font-semibold text-white text-center transition"
          >
            ▶ Ver esta
          </a>
          <button onClick={onSave}
            className="px-2.5 py-1.5 rounded-xl bg-white/6 hover:bg-white/12 text-[11px] text-white/60 border border-white/8 transition">
            💾 Guardar
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const QUICK_CHIPS = [
  { label: 'Sorpréndeme', emoji: '🎲' },
  { label: 'Documental', emoji: '📚' },
  { label: 'Película corta', emoji: '⏱️' },
  { label: 'Serie para engancharme', emoji: '📺' },
  { label: 'Algo de España', emoji: '🇪🇸' },
  { label: 'Menos de 90min', emoji: '⚡' },
]

interface Props {
  content: Content[]
  todayMood: number | null
  hour: number
  isNight: boolean
}

export function ContentSommelier({ content, todayMood, hour, isNight }: Props) {
  const [collapsed, setCollapsed] = useState(!isNight)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [welcomed, setWelcomed] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
Contexto: Son las ${hour}h. Su mood hoy es ${todayMood ? `${todayMood}/5` : 'desconocido'}.
Últimas vistas: ${lastStr}.
${streak}

Genera un saludo de exactamente 2 frases que:
1. Mencione algo específico de su historial reciente
2. Haga una sugerencia de tipo de contenido para esta noche o le invite a decirte qué le apetece

Tono: cercano, como un amigo cinéfilo. En español.
No uses markdown, asteriscos, numeración ni ningún tipo de formato. Solo texto plano.
Responde SOLO con las 2 frases, sin JSON, sin introducción.`

      const resp = await callAI(prompt, undefined, true, 500)
      addMsg({ role: 'sommelier', text: cleanMarkdown(resp.trim()) })
    } catch {
      addMsg({ role: 'sommelier', text: '¡Buenas noches! ¿Qué te apetece ver hoy? Puedo sorprenderte o ayudarte a elegir según tu estado de ánimo.' })
    } finally {
      setLoading(false)
    }
  }, [welcomed, loading, lastWatched, content, hour, todayMood, addMsg])

  useEffect(() => {
    if (!collapsed) generateWelcome()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed])

  const handleSend = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setInput('')
    addMsg({ role: 'user', text: trimmed })
    setLoading(true)

    try {
      const lastStr = lastWatched
        .map(c => `${c.title}${c.rating ? ` (${c.rating}/10)` : ''}`)
        .join(', ') || 'nada reciente'

      const prompt = `Eres el sommelier de cine personal de Daniel.
Perfil: Le gustan thrillers, documentales históricos (España s.XX, guerra civil, transición, franquismo), anime de culto, cine de autor, true crime, geopolítica. Plataformas: Netflix y Amazon Prime.
Evita: romance, comedia romántica, superhéroes Marvel.
Visto recientemente: ${lastStr}
Petición de esta noche: '${trimmed}'
Hora: ${hour}h · Mood: ${todayMood ? `${todayMood}/5` : 'sin dato'}

Recomienda exactamente 3 títulos. Para cada uno incluye:
- Título exacto tal como aparece en Netflix/Prime/TMDB
- Tipo: pelicula/serie/documental/anime
- Plataforma disponible en España ahora mismo (si no estás seguro pon 'Buscar en JustWatch')
- Duración en minutos (o min/episodio para series)
- Una frase de máximo 12 palabras explicando por qué encaja con la petición
- Año de estreno

No uses markdown, asteriscos ni formato en los textos del JSON. Solo texto plano.
Responde SOLO con este JSON válido, sin texto extra ni bloques de código:
{"respuesta":"frase del sommelier presentando las opciones, máx 15 palabras","recomendaciones":[{"titulo":"string","tituloOriginal":"string","tipo":"string","plataforma":"string","duracion":0,"año":0,"razon":"string"}]}`

      const raw = await callAI(prompt, undefined, true, 1000)
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0]) as { respuesta: string; recomendaciones: SommelierRec[] }
        addMsg({ role: 'sommelier', text: cleanMarkdown(parsed.respuesta) })
        addMsg({
          role: 'recs', text: '',
          recs: parsed.recomendaciones.map(r => ({ ...r, razon: cleanMarkdown(r.razon) })),
        })
      } else {
        addMsg({ role: 'sommelier', text: cleanMarkdown(raw.trim()) })
      }
    } catch {
      addMsg({ role: 'sommelier', text: 'Algo salió mal con la IA. Prueba de nuevo en un momento.' })
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 80)
    }
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

  // ── Collapsed pill ──────────────────────────────────────────────────────────
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
          <p className="text-xs text-white/35">¿Qué veo esta noche? · Recomendaciones personalizadas con IA</p>
        </div>
        <Sparkles size={14} className="text-violet-400 shrink-0 group-hover:text-violet-300 transition" />
      </motion.button>
    )
  }

  // ── Expanded panel ──────────────────────────────────────────────────────────
  return (
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
            <p className="text-[11px] text-violet-300/60">IA personalizada · {hour}h</p>
          </div>
        </div>
        <button onClick={() => setCollapsed(true)}
          className="w-7 h-7 rounded-xl bg-white/6 hover:bg-white/10 flex items-center justify-center transition">
          <ChevronDown size={13} className="text-white/50" />
        </button>
      </div>

      {/* Chat */}
      <div className="px-5 py-4 space-y-4 max-h-105 overflow-y-auto">
        {messages.length === 0 && loading && <LoadingBubble />}

        {messages.slice(-6).map(msg => {
          if (msg.role === 'sommelier') return <SommelierBubble key={msg.id} text={msg.text} />
          if (msg.role === 'user') return <UserBubble key={msg.id} text={msg.text} />
          if (msg.role === 'recs') return (
            <div key={msg.id} className="space-y-2.5">
              {msg.recs.map((rec, i) => (
                <RecCard key={i} rec={rec} index={i}
                  onStart={() => saveRec(rec, 'viendo')}
                  onSave={() => saveRec(rec, 'pendiente')}
                />
              ))}
            </div>
          )
          return null
        })}

        {loading && messages.length > 0 && <LoadingBubble />}
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
  )
}
