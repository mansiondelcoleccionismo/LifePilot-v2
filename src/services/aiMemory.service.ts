import { db } from '@/lib/firebase'
import {
  collection, addDoc, getDocs, query, where, orderBy, limit,
  Timestamp, deleteDoc, doc,
} from 'firebase/firestore'

const COL = 'ai_memory'

export type AIModulo = 'kira' | 'sommelier' | 'briefing' | 'patrones' | 'ia' | 'general'

interface MemoryDoc {
  id: string
  modulo: string
  fecha: string
  resumen: string
  createdAt: Date
}

function relLabel(fecha: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const diff = Math.round(
    (new Date(today + 'T12:00:00').getTime() - new Date(fecha + 'T12:00:00').getTime()) / 86_400_000,
  )
  if (diff === 0) return 'hoy más temprano'
  if (diff === 1) return 'ayer'
  if (diff < 7) return `hace ${diff} días`
  return `hace ${Math.floor(diff / 7)} semana${Math.floor(diff / 7) > 1 ? 's' : ''}`
}

function toDoc(d: import('firebase/firestore').QueryDocumentSnapshot): MemoryDoc {
  const data = d.data()
  return {
    id: d.id,
    modulo: data['modulo'] as string,
    fecha: data['fecha'] as string,
    resumen: data['resumen'] as string,
    createdAt: (data['createdAt'] as Timestamp).toDate(),
  }
}

export async function getRecentMemories(modulo: string, n = 5): Promise<MemoryDoc[]> {
  try {
    const snap = await getDocs(query(
      collection(db, COL),
      where('modulo', '==', modulo),
      orderBy('createdAt', 'desc'),
      limit(n),
    ))
    return snap.docs.map(toDoc)
  } catch { return [] }
}

export async function getCrossModuleMemory(n = 10): Promise<MemoryDoc[]> {
  try {
    const snap = await getDocs(query(
      collection(db, COL),
      orderBy('createdAt', 'desc'),
      limit(n),
    ))
    return snap.docs.map(toDoc)
  } catch { return [] }
}

export function formatMemoriesForPrompt(memories: MemoryDoc[]): string {
  if (!memories.length) return ''
  const sorted = [...memories].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const lines = sorted.map(m => `- ${relLabel(m.fecha)}: ${m.resumen}`).join('\n')
  return `MEMORIAS RECIENTES DE ESTE MÓDULO:\n${lines}\n\n`
}

// Quick auto-save: simple truncation, no extra AI call
export async function quickSaveMemory(modulo: string, prompt: string, response: string): Promise<void> {
  try {
    const pSlice = prompt.slice(0, 100).replace(/\n/g, ' ')
    const rSlice = response.slice(0, 80).replace(/\n/g, ' ')
    const resumen = `Preguntó: ${pSlice}. IA: ${rSlice}`.slice(0, 200)
    await addDoc(collection(db, COL), {
      modulo,
      fecha: new Date().toISOString().slice(0, 10),
      resumen,
      createdAt: Timestamp.now(),
    })
    _cleanupOld(modulo).catch(() => {})
  } catch { /* silent */ }
}

// Rich save with AI summarization — call explicitly from pages for end-of-session saves
export async function saveMemory(modulo: string, conversation: string): Promise<void> {
  try {
    const { callAI } = await import('./ai.service')
    const summaryPrompt =
      `Resume en UNA frase de máximo 180 caracteres esta conversación. ` +
      `Captura el tema y la respuesta clave. Sin saludos ni formato:\n\n${conversation.slice(0, 2000)}`
    const resumen = await callAI(summaryPrompt, undefined, true, 100)
    if (!resumen.trim()) return
    await addDoc(collection(db, COL), {
      modulo,
      fecha: new Date().toISOString().slice(0, 10),
      resumen: resumen.trim().slice(0, 200),
      createdAt: Timestamp.now(),
    })
    _cleanupOld(modulo).catch(() => {})
  } catch { /* silent */ }
}

async function _cleanupOld(modulo: string): Promise<void> {
  try {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const snap = await getDocs(query(
      collection(db, COL),
      where('modulo', '==', modulo),
      where('createdAt', '<', Timestamp.fromDate(cutoff)),
      limit(20),
    ))
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, COL, d.id))))
  } catch { /* silent */ }
}
