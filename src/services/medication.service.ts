import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  getDoc,
  getDocs,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Medication, MedicationLog } from '@/types/medication'

const MED_COL = 'medications'
const LOGS_COL = 'medication_logs'

const TIME_ORDER: Record<string, number> = { mañana: 0, mediodía: 1, noche: 2 }

export function subscribeMedications(callback: (meds: Medication[]) => void) {
  const q = query(collection(db, MED_COL), orderBy('createdAt', 'asc'))
  return onSnapshot(q, (snap) => {
    const meds = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate() ?? new Date(),
      updatedAt: d.data().updatedAt?.toDate() ?? new Date(),
    })) as Medication[]
    meds.sort((a, b) => (TIME_ORDER[a.time] ?? 3) - (TIME_ORDER[b.time] ?? 3))
    callback(meds)
  })
}

export async function addMedication(
  med: Omit<Medication, 'id' | 'createdAt' | 'updatedAt'>,
) {
  await addDoc(collection(db, MED_COL), {
    ...med,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateMedication(
  id: string,
  updates: Partial<Omit<Medication, 'id' | 'createdAt'>>,
) {
  await updateDoc(doc(db, MED_COL, id), {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteMedication(id: string) {
  await deleteDoc(doc(db, MED_COL, id))
}

// Subcollection path: medication_logs/{YYYY-MM-DD}/medications/{medicationId}
export async function toggleMedicationTaken(
  medicationId: string,
  date: string,
): Promise<void> {
  const logRef = doc(db, LOGS_COL, date, 'medications', medicationId)
  const snap = await getDoc(logRef)
  const currentTaken = snap.exists() ? (snap.data().taken as boolean) : false
  await setDoc(logRef, {
    taken: !currentTaken,
    takenAt: !currentTaken ? serverTimestamp() : null,
  })
}

export function subscribeDayLogs(
  date: string,
  callback: (logs: Record<string, MedicationLog>) => void,
) {
  const ref = collection(db, LOGS_COL, date, 'medications')
  return onSnapshot(ref, (snap) => {
    const logs: Record<string, MedicationLog> = {}
    snap.docs.forEach((d) => {
      logs[d.id] = {
        taken: d.data().taken ?? false,
        takenAt: d.data().takenAt?.toDate(),
      }
    })
    callback(logs)
  })
}

export async function fetchDayLogs(
  date: string,
): Promise<Record<string, MedicationLog>> {
  const snap = await getDocs(collection(db, LOGS_COL, date, 'medications'))
  const logs: Record<string, MedicationLog> = {}
  snap.docs.forEach((d) => {
    logs[d.id] = {
      taken: d.data().taken ?? false,
      takenAt: d.data().takenAt?.toDate(),
    }
  })
  return logs
}
