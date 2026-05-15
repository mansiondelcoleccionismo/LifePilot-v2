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
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { FoodEntry, MealType } from '@/types/nutrition'

const COL = 'nutrition_entries'

function dayRange(date: Date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export function subscribeNutritionEntries(
  callback: (entries: FoodEntry[]) => void,
  date?: Date,
) {
  const { start, end } = dayRange(date ?? new Date())

  const q = query(
    collection(db, COL),
    where('createdAt', '>=', start),
    where('createdAt', '<=', end),
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
  meal?: MealType,
  date?: Date,
) {
  const createdAt = date ? Timestamp.fromDate(date) : serverTimestamp()
  await addDoc(collection(db, COL), {
    name, kcal, protein, carbs, fat,
    ...(meal ? { meal } : {}),
    createdAt,
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
