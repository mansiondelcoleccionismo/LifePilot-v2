import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Send, Sparkles, Key, MessageSquare, Loader2 } from 'lucide-react'
import { getGeminiKey, saveGeminiKey, chatWithCoach, generateBriefing } from '@/services/ai.service'
import type { AIMessage } from '@/types/ai'

const initialSystemMessage: AIMessage = {
  role: 'assistant',
  content: 'Soy tu coach IA. Estoy aquí para ayudarte con tu briefing diario y responder tus preguntas de forma positiva y práctica.',
  timestamp: new Date().toISOString(),
}

export function IAPage() {
  const [apiKey, setApiKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [briefing, setBriefing] = useState('')
  const [messages, setMessages] = useState<AIMessage[]>([initialSystemMessage])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    const key = getGeminiKey()
    setApiKey(key)
    setSavedKey(key)
  }, [])

  const handleSaveKey = () => {
    saveGeminiKey(apiKey.trim())
    setSavedKey(apiKey.trim())
    setFeedback('API key guardada correctamente')
    setTimeout(() => setFeedback(''), 2400)
  }

  const handleGenerateBriefing = async () => {
    setLoading(true)
    setBriefing('')
    try {
      const result = await generateBriefing()
      setBriefing(result)
    } catch (error) {
      setBriefing(`Error: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!input.trim()) return
    const userMessage: AIMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    try {
      const answer = await chatWithCoach(updatedMessages, userMessage.content)
      const assistantMessage: AIMessage = {
        role: 'assistant',
        content: answer,
        timestamp: new Date().toISOString(),
      }
      setMessages((current) => [...current, assistantMessage])
    } catch (error) {
      const errorMessage: AIMessage = {
        role: 'assistant',
        content: `Error: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
      }
      setMessages((current) => [...current, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/35">IA · Gemini</p>
            <h1 className="text-3xl font-bold text-white/90 mt-1">Coach inteligente</h1>
          </div>
          <div className="rounded-2xl border border-white/8 bg-[#1E1E28]/80 px-4 py-3 text-sm text-white/65">
            {savedKey ? 'API key configurada' : 'Configura tu key'}
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <Sparkles size={22} className="text-blue-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Conexión Gemini</p>
              <h2 className="text-lg font-semibold text-white/90 mt-1">Clave API</h2>
            </div>
          </div>
          <div className="grid gap-3">
            <div className="rounded-3xl border border-white/8 bg-white/5 p-4">
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/35">Gemini API key</label>
              <div className="mt-3 flex gap-3 flex-col sm:flex-row">
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full rounded-2xl bg-[#1E1E28] border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                  placeholder="Introduce tu API key"
                />
                <button
                  onClick={handleSaveKey}
                  className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
                >
                  <Key size={16} /> Guardar
                </button>
              </div>
              {feedback && <p className="mt-3 text-sm text-emerald-300">{feedback}</p>}
            </div>

            <div className="rounded-3xl border border-white/8 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-white/35">Briefing</p>
                  <h2 className="text-lg font-semibold text-white/90 mt-1">Resumen del día</h2>
                </div>
                <button
                  onClick={handleGenerateBriefing}
                  className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                >
                  Generar briefing
                </button>
              </div>
              <div className="mt-4 min-h-30 rounded-3xl bg-[#1E1E28] border border-white/8 p-4 text-sm text-white/80">
                {loading ? (
                  <div className="flex items-center gap-2 text-white/70">
                    <Loader2 className="animate-spin" size={16} /> Generando briefing...
                  </div>
                ) : briefing ? (
                  <p>{briefing}</p>
                ) : (
                  <p className="text-white/35">Pulsa el botón para generar un resumen diario.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/8 bg-[#1E1E28] p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center">
              <MessageSquare size={22} className="text-white/80" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/25">Coach IA</p>
              <h2 className="text-lg font-semibold text-white/90 mt-1">Chat interactivo</h2>
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-3 rounded-3xl border border-white/8 bg-white/5 p-4 max-h-130 overflow-y-auto">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-3xl p-4 ${
                  message.role === 'assistant'
                    ? 'bg-[#1E1E28] text-white/90 self-start'
                    : 'bg-blue-500/10 text-white/90 self-end'
                }`}
              >
                <p className="text-xs uppercase tracking-[0.25em] text-white/40 mb-2">{message.role === 'assistant' ? 'Coach' : 'Tú'}</p>
                <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                <p className="mt-3 text-[10px] text-white/40">{new Date(message.timestamp).toLocaleString('es-ES')}</p>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-white/8 bg-[#1E1E28] p-4">
            <div className="grid gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={4}
                className="w-full rounded-3xl bg-[#1E1E28] border border-white/8 px-4 py-3 text-sm text-white/80 focus:outline-none"
                placeholder="Escribe tu pregunta o petición para el coach"
              />
              <button
                onClick={handleSendMessage}
                disabled={!input.trim() || loading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-white/10"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                Enviar mensaje
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
