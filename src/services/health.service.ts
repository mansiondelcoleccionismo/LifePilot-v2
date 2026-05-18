import { db } from '@/lib/firebase'
import {
  doc, getDoc, setDoc, getDocs, collection,
  query, where, orderBy, Timestamp,
} from 'firebase/firestore'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthData {
  date: string                // YYYY-MM-DD  ← also the Firestore doc ID
  steps?: number
  sleepHours?: number
  sleepMinutes?: number
  sleepQuality?: 'mala' | 'regular' | 'buena' | 'excelente'
  weight?: number
  heartRateAvg?: number
  source: 'ios_shortcuts' | 'manual'
  createdAt: Date
}

const COL = 'health_data'

// ── Helpers ───────────────────────────────────────────────────────────────────

function toFirestore(data: HealthData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    out[k] = k === 'createdAt' ? Timestamp.fromDate(v as Date) : v
  }
  return out
}

function fromFirestore(raw: Record<string, unknown>): HealthData {
  return {
    ...raw,
    createdAt: (raw.createdAt as Timestamp | undefined)?.toDate?.() ?? new Date(),
  } as HealthData
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** Saves health data for a given date. Merges into existing doc so partial updates
 *  (e.g. only steps from one Shortcut) don't wipe other fields. */
export async function saveHealthData(data: HealthData): Promise<boolean> {
  await setDoc(doc(db, COL, data.date), toFirestore(data), { merge: true })
  return true
}

export async function getHealthData(date: string): Promise<HealthData | null> {
  const snap = await getDoc(doc(db, COL, date))
  if (!snap.exists()) return null
  return fromFirestore(snap.data() as Record<string, unknown>)
}

export async function getHealthDataRange(startDate: string, endDate: string): Promise<HealthData[]> {
  const q = query(
    collection(db, COL),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => fromFirestore(d.data() as Record<string, unknown>))
}

/** Returns up to n days of data ending today, sorted oldest→newest. */
export async function getLastNDays(n: number): Promise<HealthData[]> {
  const end   = new Date()
  const start = new Date()
  start.setDate(start.getDate() - n + 1)
  return getHealthDataRange(
    start.toISOString().slice(0, 10),
    end.toISOString().slice(0, 10),
  )
}

// ── Helper used by multiple pages ─────────────────────────────────────────────

export function calcSleepTotal(d: HealthData): number {
  return (d.sleepHours ?? 0) + (d.sleepMinutes ?? 0) / 60
}
