import type { AIMessage } from '@/types/ai'
import { buildAIContext } from './ai-memory.service'
import { buildGlobalContext, formatContextForAI } from './globalContext.service'

// ── Storage keys ──────────────────────────────────────────────────────────────
const LEGACY_GEMINI_KEY = 'lifepilot_gemini_key'
const GEMINI_KEY_SLOTS = [
  'lifepilot_gemini_key_1',
  'lifepilot_gemini_key_2',
  'lifepilot_gemini_key_3',
] as const

const LEGACY_GROQ_KEY = 'lifepilot_groq_key'
const GROQ_KEY_SLOTS = [
  'lifepilot_groq_key_1',
  'lifepilot_groq_key_2',
  'lifepilot_groq_key_3',
  'lifepilot_groq_key_4',
] as const

const COOLDOWNS_KEY = 'lifepilot_ai_cooldowns'
const COOLDOWN_MS   = 60_000

// ── Key readers ───────────────────────────────────────────────────────────────
function getGeminiKeys(): string[] {
  const numbered = GEMINI_KEY_SLOTS
    .map(k => localStorage.getItem(k)?.trim() ?? '')
    .filter(Boolean)
  if (numbered.length > 0) return numbered
  const legacy = localStorage.getItem(LEGACY_GEMINI_KEY)?.trim() ?? ''
  return legacy ? [legacy] : []
}

function getGroqKeys(): string[] {
  const numbered = GROQ_KEY_SLOTS
    .map(k => localStorage.getItem(k)?.trim() ?? '')
    .filter(Boolean)
  if (numbered.length > 0) return numbered
  // Backward compat: old single-slot key
  const legacy = localStorage.getItem(LEGACY_GROQ_KEY)?.trim() ?? ''
  return legacy ? [legacy] : []
}

export function getGeminiKey(): string {
  return getGeminiKeys()[0] ?? ''
}

export function saveGeminiKey(value: string) {
  const v = value.trim()
  localStorage.setItem('lifepilot_gemini_key_1', v)
  localStorage.setItem(LEGACY_GEMINI_KEY, v)
}

export function hasAnyAIKey(): boolean {
  return getGeminiKeys().length > 0 || getGroqKeys().length > 0
}

// ── Cooldown management ───────────────────────────────────────────────────────
function getCooldowns(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(COOLDOWNS_KEY) ?? '{}') }
  catch { return {} }
}

function isOnCooldown(keyId: string): boolean {
  const ts = getCooldowns()[keyId]
  return !!ts && Date.now() - ts < COOLDOWN_MS
}

function setCooldown(keyId: string) {
  const cds = getCooldowns()
  cds[keyId] = Date.now()
  localStorage.setItem(COOLDOWNS_KEY, JSON.stringify(cds))
}

export function clearCooldowns() {
  localStorage.removeItem(COOLDOWNS_KEY)
}

export function getActiveKeyInfo(): { provider: string; index: number } | null {
  const geminiKeys = getGeminiKeys()
  for (let i = 0; i < geminiKeys.length; i++) {
    if (!isOnCooldown(`gemini_${i}`)) return { provider: 'Gemini', index: i + 1 }
  }
  const groqKeys = getGroqKeys()
  for (let i = 0; i < groqKeys.length; i++) {
    if (!isOnCooldown(`groq_${i}`)) return { provider: 'Groq', index: i + 1 }
  }
  return null
}

// ── API callers ───────────────────────────────────────────────────────────────
class RateLimitError extends Error {}

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
]

// Calls one specific model. Throws RateLimitError on 429/401/403 (key issue),
// throws regular Error on 404 (model not found) or other failures.
async function callGeminiModel(
  key: string,
  model: string,
  prompt: string,
  imageData?: { data: string; mimeType: string },
  maxTokens = 1000,
): Promise<string> {
  const parts: object[] = []
  if (imageData) parts.push({ inlineData: { mimeType: imageData.mimeType, data: imageData.data } })
  parts.push({ text: prompt })

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens },
      }),
    },
  )

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
    const detail = body?.error?.message ?? ''
    const msg = `Gemini ${res.status} [${model}]${detail ? `: ${detail}` : ''}`
    if (res.status === 429 || res.status === 401 || res.status === 403) throw new RateLimitError(msg)
    throw new Error(msg)
  }

  const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

// Tries each model in order with the given key.
// 404/other error → tries next model. 429/401/403 → throws immediately (caller switches key).
async function callGemini(
  key: string,
  prompt: string,
  imageData?: { data: string; mimeType: string },
  maxTokens = 1000,
): Promise<string> {
  let lastErr: unknown
  for (const model of GEMINI_MODELS) {
    try {
      return await callGeminiModel(key, model, prompt, imageData, maxTokens)
    } catch (err) {
      if (err instanceof RateLimitError) throw err
      lastErr = err
    }
  }
  throw lastErr
}

async function callGroq(key: string, prompt: string, maxTokens = 1024): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: maxTokens,
    }),
  })

  if (res.status === 429 || res.status === 401) throw new RateLimitError(`Groq ${res.status}`)
  if (!res.ok) throw new Error(`Groq API error: ${res.status}`)

  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

// ── Main rotation function ────────────────────────────────────────────────────
export async function callAI(
  prompt: string,
  imageData?: { data: string; mimeType: string },
  skipContext = false,
  maxTokens = 1000,
): Promise<string> {
  let fullPrompt = prompt
  if (!skipContext) {
    const profileCtx = buildAIContext()
    const liveCtx = await buildGlobalContext().then(formatContextForAI).catch(() => '')
    const combined = liveCtx
      ? `${liveCtx}\n\n${profileCtx}`
      : profileCtx
    fullPrompt = combined ? combined + prompt : prompt
  }
  // Try all Gemini keys first (supports images)
  const geminiKeys = getGeminiKeys()
  for (let i = 0; i < geminiKeys.length; i++) {
    const keyId = `gemini_${i}`
    if (isOnCooldown(keyId)) continue
    try {
      return await callGemini(geminiKeys[i], fullPrompt, imageData, maxTokens)
    } catch (err) {
      if (err instanceof RateLimitError) { setCooldown(keyId); continue }
      throw err
    }
  }

  // Fall through to Groq (no image support)
  if (!imageData) {
    const groqKeys = getGroqKeys()
    for (let i = 0; i < groqKeys.length; i++) {
      const keyId = `groq_${i}`
      if (isOnCooldown(keyId)) continue
      try {
        return await callGroq(groqKeys[i], fullPrompt, maxTokens)
      } catch (err) {
        if (err instanceof RateLimitError) { setCooldown(keyId); continue }
        throw err
      }
    }
  }

  throw new Error('Sin créditos de IA disponibles. Espera 60 segundos o añade más API keys en Ajustes.')
}

// ── Test helpers ──────────────────────────────────────────────────────────────
export async function testGeminiKey(key: string): Promise<string | null> {
  const errors: string[] = []
  for (const model of GEMINI_MODELS) {
    try {
      const result = await callGeminiModel(key, model, 'Di "ok".', undefined)
      return result.length > 0 ? null : `${model}: respuesta vacía`
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'error desconocido'
      if (raw.includes('401')) return 'Key inválida (401)'
      if (raw.includes('403')) return 'Sin acceso (403)'
      if (raw.includes('429')) return 'Quota agotada (429)'
      errors.push(`${model}: ${raw.slice(0, 60)}`)
    }
  }
  return errors.join(' · ')
}

export async function testGroqKey(key: string): Promise<string | null> {
  try {
    const result = await callGroq(key, 'Di "ok" en una palabra.')
    return result.length > 0 ? null : 'Respuesta vacía'
  } catch (err) {
    if (err instanceof RateLimitError) {
      const msg = err.message
      if (msg.includes('401')) return 'Key inválida (401)'
      if (msg.includes('429')) return 'Límite de peticiones alcanzado (429)'
      return msg
    }
    return err instanceof Error ? err.message : 'Error desconocido'
  }
}

// ── Ocio recommendations ─────────────────────────────────────────────────────
export interface OcioRecommendation {
  title: string
  titleOriginal: string
  platform: string
  duration: number
  reason: string
  type: 'pelicula' | 'serie' | 'documental'
  posterUrl?: string
}

export async function getOcioRecommendations(params: {
  lastWatched: Array<{ title: string; rating?: number; type: string }>
  mood?: number
  hour: number
  platforms: string[]
}): Promise<OcioRecommendation[]> {
  const { lastWatched, mood, hour, platforms } = params
  const lastStr = lastWatched.length
    ? lastWatched.slice(0, 5).map(c => `${c.title} (${c.rating ?? '?'}/10)`).join(', ')
    : 'nada reciente'
  const availableTime = Math.round(Math.max((24 - hour) * 60, 90))
  const moodStr = mood ? `${mood}/5` : 'sin dato'

  const prompt = `Eres un experto en cine, series y documentales con gusto sofisticado.
Daniel (35 años, España) ha visto recientemente: ${lastStr}.
Géneros favoritos: thriller, drama social, documental histórico, anime de culto, cine de autor, true crime, geopolítica, historia España (franquismo, transición, guerra civil), crimen organizado real.
Evita: romance, comedia romántica, superhéroes Marvel.
Plataformas disponibles: ${platforms.join(', ')}.
Hora actual: ${hour}h. Tiempo disponible: ~${availableTime} min. Mood: ${moodStr}.

Recomiéndalo exactamente 3 títulos para esta noche. Usa títulos que existan realmente.

Responde ÚNICAMENTE con JSON válido, sin texto extra:
[{"title":"título en español","titleOriginal":"título original en inglés/japonés","platform":"plataforma donde está disponible en España ahora","duration":minutos,"reason":"razón específica máx 15 palabras","type":"pelicula|serie|documental"}]`

  const raw = await callAI(prompt, undefined, true)
  const match = raw.match(/\[[\s\S]*?\]/)
  if (!match) return []
  try {
    return JSON.parse(match[0]) as OcioRecommendation[]
  } catch {
    return []
  }
}

// ── Backward-compatible exports ───────────────────────────────────────────────
export async function generateBriefing(): Promise<string> {
  return callAI(
    'Eres un asistente personal de salud y productividad. Con el contexto del usuario, genera un briefing diario breve: saludo personalizado, qué tipo de día es hoy (entreno/pádel/descanso), target calórico del día y una recomendación clave. Máximo 3 frases. En español.',
  )
}

export async function chatWithCoach(messages: AIMessage[], userMessage: string): Promise<string> {
  const history = messages
    .map(m => `${m.role === 'assistant' ? 'Coach' : 'Usuario'}: ${m.content}`)
    .join('\n')
  return callAI(`${history}\nUsuario: ${userMessage}\nCoach:`)
}
