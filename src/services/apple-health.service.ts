import { db } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'

// Lee pasos de la colección raíz "pasos/{fecha}" donde escribe la Cloud Function
export async function getAppleSteps(fecha: string): Promise<number | null> {
  try {
    const snap = await getDoc(doc(db, 'pasos', fecha))
    if (!snap.exists()) return null
    const data = snap.data() as { pasos?: number }
    return typeof data.pasos === 'number' ? data.pasos : null
  } catch {
    return null
  }
}
