import type { AIMessage } from '@/types/ai'

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
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-pro-exp-03-25',
  'gemini-2.0-flash',
]

async function callGeminiModel(
  key: string,
  model: string,
  prompt: string,
  imageData?: { data: string; mimeType: string },
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
        generationConfig: { temperature: 0.1 },
      }),
    },
  )

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
    const detail = body?.error?.message ?? ''
    const msg = `Gemini ${res.status}${detail ? `: ${detail}` : ''}`
    if (res.status === 429 || res.status === 401 || res.status === 403) throw new RateLimitError(msg)
    throw new Error(msg)
  }

  const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function callGemini(
  key: string,
  prompt: string,
  imageData?: { data: string; mimeType: string },
): Promise<string> {
  let lastErr: unknown
  for (const model of GEMINI_MODELS) {
    try {
      return await callGeminiModel(key, model, prompt, imageData)
    } catch (err) {
      if (err instanceof RateLimitError) throw err
      lastErr = err
    }
  }
  throw lastErr
}

async function callGroq(key: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
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
): Promise<string> {
  // Try all Gemini keys first (supports images)
  const geminiKeys = getGeminiKeys()
  for (let i = 0; i < geminiKeys.length; i++) {
    const keyId = `gemini_${i}`
    if (isOnCooldown(keyId)) continue
    try {
      return await callGemini(geminiKeys[i], prompt, imageData)
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
        return await callGroq(groqKeys[i], prompt)
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
      const detail = raw.replace(/^Gemini \d+:?\s*/, '').trim()
      if (raw.includes('401')) errors.push(`${model}: key inválida (401)`)
      else if (raw.includes('403')) errors.push(`${model}: sin acceso (403)`)
      else if (raw.includes('429')) errors.push(`${model}: quota=0`)
      else errors.push(`${model}: ${detail.slice(0, 60) || raw}`)
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

// ── Backward-compatible exports ───────────────────────────────────────────────
export async function generateBriefing(): Promise<string> {
  return callAI(
    'Eres un asistente personal. Genera un briefing diario breve para el usuario con recomendaciones de productividad, salud y bienestar. Incluye un resumen positivo y una sugerencia de enfoque para el día.',
  )
}

export async function chatWithCoach(messages: AIMessage[], userMessage: string): Promise<string> {
  const history = messages
    .map(m => `${m.role === 'assistant' ? 'Coach' : 'Usuario'}: ${m.content}`)
    .join('\n')
  return callAI(`${history}\nUsuario: ${userMessage}\nCoach:`)
}
