import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Exercise, WorkoutDay } from '@/types/exercise'

const COL = 'exercises'

export function subscribeExercises(day: WorkoutDay, callback: (exercises: Exercise[]) => void) {
  const q = query(
    collection(db, COL),
    where('day', '==', day),
    orderBy('createdAt', 'desc'),
  )

  return onSnapshot(q, (snapshot) => {
    const exercises = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as Exercise[]
    callback(exercises)
  })
}

export async function addExercise(
  name: string,
  sets: number,
  reps: number,
  weight: number,
  day: WorkoutDay,
  muscleGroup: string,
) {
  await addDoc(collection(db, COL), {
    name,
    sets,
    reps,
    weight,
    day,
    muscleGroup,
    createdAt: serverTimestamp(),
  })
}

export async function updateExercise(id: string, data: Partial<Omit<Exercise, 'id'>>) {
  await updateDoc(doc(db, COL, id), data)
}

export async function deleteExercise(id: string) {
  await deleteDoc(doc(db, COL, id))
}
