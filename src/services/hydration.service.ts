import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { loadProfile, getDayKind } from './metabolic.service'

const COL = 'hydration'
const HYDRATION_TARGET_KEY = 'lifepilot_hydration_base_target'

export interface HydrationData {
  date:      string
  glasses:   number
  target:    number
  updatedAt: Date | null
}

// ── Target calculation ────────────────────────────────────────────────────────

export function getHydrationTarget(): number {
  const base = parseInt(localStorage.getItem(HYDRATION_TARGET_KEY) ?? '8', 10) || 8
  try {
    const profile  = loadProfile()
    const dow      = new Date().getDay()
    const dayKind  = getDayKind(profile, dow)
    if (dayKind === 'padel' || dayKind === 'padel_training') return Math.max(base, 12)
    if (dayKind === 'training') return Math.max(base, 10)
  } catch { /* ignore */ }
  return base
}

export function setBaseHydrationTarget(glasses: number): void {
  localStorage.setItem(HYDRATION_TARGET_KEY, String(Math.max(4, Math.min(20, glasses))))
}

export function getBaseHydrationTarget(): number {
  return parseInt(localStorage.getItem(HYDRATION_TARGET_KEY) ?? '8', 10) || 8
}

// ── Firebase CRUD ─────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function docRef(date: string) {
  return doc(db, COL, date)
}

export async function getTodayHydration(): Promise<HydrationData> {
  const date = todayKey()
  const target = getHydrationTarget()
  try {
    const snap = await getDoc(docRef(date))
    if (!snap.exists()) return { date, glasses: 0, target, updatedAt: null }
    const d = snap.data()
    return {
      date,
      glasses:   (d['glasses'] as number) ?? 0,
      target:    (d['target']  as number) ?? target,
      updatedAt: d['updatedAt']?.toDate?.() ?? null,
    }
  } catch {
    return { date, glasses: 0, target, updatedAt: null }
  }
}

async function writeGlasses(glasses: number): Promise<void> {
  const date   = todayKey()
  const target = getHydrationTarget()
  await setDoc(docRef(date), {
    date,
    glasses:   Math.max(0, glasses),
    target,
    updatedAt: serverTimestamp(),
  })
}

export async function addGlass(current: number): Promise<number> {
  const next = current + 1
  await writeGlasses(next)
  return next
}

export async function removeGlass(current: number): Promise<number> {
  const next = Math.max(0, current - 1)
  await writeGlasses(next)
  return next
}
