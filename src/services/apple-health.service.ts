import { db } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'

// Fixed path segment — must match the userId used in the iPhone Shortcut URL
export const OWNER_ID = 'daniel'

export interface AppleStepsEntry {
  fecha: string
  pasos: number
  fuente: 'apple_health'
}

/** Returns step count for a given date from Apple Health (via Shortcuts), or null if not available. */
export async function getAppleSteps(fecha: string): Promise<number | null> {
  try {
    const snap = await getDoc(doc(db, 'usuarios', OWNER_ID, 'pasos', fecha))
    if (!snap.exists()) return null
    const data = snap.data() as AppleStepsEntry
    return typeof data.pasos === 'number' ? data.pasos : null
  } catch {
    return null
  }
}
