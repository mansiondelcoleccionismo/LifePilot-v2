import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { FoodEntry } from '@/types/nutrition'

const COL = 'nutrition_entries'

export function subscribeNutritionEntries(callback: (entries: FoodEntry[]) => void) {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)

  const q = query(
    collection(db, COL),
    where('createdAt', '>=', startOfDay),
    where('createdAt', '<=', endOfDay),
    orderBy('createdAt', 'desc'),
  )

  return onSnapshot(q, (snap) => {
    const entries = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: docSnap.data().createdAt?.toDate() ?? new Date(),
    })) as FoodEntry[]
    callback(entries)
  })
}

export async function addNutritionEntry(
  name: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
) {
  await addDoc(collection(db, COL), {
    name,
    kcal,
    protein,
    carbs,
    fat,
    createdAt: serverTimestamp(),
  })
}

export async function updateNutritionEntry(
  id: string,
  data: Partial<Omit<FoodEntry, 'id' | 'createdAt'>>,
) {
  await updateDoc(doc(db, COL, id), data)
}

export async function deleteNutritionEntry(id: string) {
  await deleteDoc(doc(db, COL, id))
}
