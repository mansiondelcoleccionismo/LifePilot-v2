import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { PLANES } from '@/data/planes'

const COL = 'plan_logs'

export interface PlanLog {
  id: string
  planId: string
  planNombre: string
  planEmoji: string
  date: Date
  withKira: boolean
  rating?: number
  kiraLikes?: boolean
  note?: string
  weather?: string
  createdAt: Date
}

export async function logPlan(
  planId: string,
  data: { withKira: boolean; weather?: string },
): Promise<string> {
  const plan = PLANES.find(p => p.id === planId)
  const docRef = await addDoc(collection(db, COL), {
    planId,
    planNombre: plan?.nombre ?? planId,
    planEmoji: plan?.emoji ?? '📌',
    date: serverTimestamp(),
    withKira: data.withKira,
    weather: data.weather ?? null,
    createdAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updatePlanLog(
  logId: string,
  updates: { rating?: number; kiraLikes?: boolean; note?: string },
): Promise<void> {
  await updateDoc(doc(db, COL, logId), { ...updates })
}

export function subscribePlanHistory(callback: (logs: PlanLog[]) => void): () => void {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snapshot => {
    const logs = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      date: d.data().date?.toDate() ?? new Date(),
      createdAt: d.data().createdAt?.toDate() ?? new Date(),
    })) as PlanLog[]
    callback(logs)
  })
}

export async function getRecentPlans(weeks = 3): Promise<string[]> {
  const since = new Date()
  since.setDate(since.getDate() - weeks * 7)
  const q = query(
    collection(db, COL),
    where('createdAt', '>=', since),
    orderBy('createdAt', 'desc'),
  )
  const snap = await getDocs(q)
  return [...new Set(snap.docs.map(d => d.data().planId as string))]
}

export async function getPlanStats(planId: string): Promise<{
  vecesHecho: number
  puntuacionMedia: number
  ultimaVez?: Date
}> {
  const q = query(
    collection(db, COL),
    where('planId', '==', planId),
    orderBy('createdAt', 'desc'),
  )
  const snap = await getDocs(q)
  const logs = snap.docs.map(d => d.data())
  const withRating = logs.filter(l => l.rating != null)
  const puntuacionMedia =
    withRating.length > 0
      ? withRating.reduce((s, l) => s + (l.rating as number), 0) / withRating.length
      : 0
  return {
    vecesHecho: logs.length,
    puntuacionMedia,
    ultimaVez: logs[0]?.createdAt?.toDate?.() ?? undefined,
  }
}
