import type { AIMessage } from '@/types/ai'

const STORAGE_KEY = 'lifepilot_gemini_key'
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent'

export function getGeminiKey() {
  return window.localStorage.getItem(STORAGE_KEY) ?? ''
}

export function saveGeminiKey(value: string) {
  window.localStorage.setItem(STORAGE_KEY, value)
}

async function fetchGemini(promptText: string) {
  const apiKey = getGeminiKey()
  if (!apiKey) {
    throw new Error('Gemini API key no encontrada')
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: {
        text: promptText,
      },
      temperature: 0.7,
      candidateCount: 1,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Gemini API error: ${response.status} ${body}`)
  }

  const data = await response.json()
  const candidate = data?.candidates?.[0]
  const content = candidate?.content?.map((item: any) => item?.text || '').join('')
  return content || data?.outputText || ''
}

export async function generateBriefing() {
  const prompt = `Eres un asistente personal. Genera un briefing diario breve para el usuario con recomendaciones de productividad, salud y bienestar. Incluye un resumen positivo y una sugerencia de enfoque para el día.`
  return await fetchGemini(prompt)
}

export async function chatWithCoach(messages: AIMessage[], userMessage: string) {
  const history = messages
    .map((message) => {
      const label = message.role === 'assistant' ? 'Coach' : 'Usuario'
      return `${label}: ${message.content}`
    })
    .join('\n')

  const prompt = `${history}\nUsuario: ${userMessage}\nCoach:`
  const answer = await fetchGemini(prompt)
  return answer
}
