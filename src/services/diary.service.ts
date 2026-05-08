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
import type { DiaryEntry } from '@/types/diary'

const COL = 'diary_entries'

export function subscribeDiaryEntries(monthKey: string, callback: (entries: DiaryEntry[]) => void) {
  const startDate = `${monthKey}-01`
  const [year, month] = monthKey.split('-').map(Number)
  const endDate = `${monthKey}-${new Date(year, month, 0).getDate().toString().padStart(2, '0')}`

  const q = query(
    collection(db, COL),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'asc'),
  )

  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: docSnap.data().createdAt?.toDate() ?? new Date(),
    })) as DiaryEntry[]
    callback(entries)
  })
}

export async function addDiaryEntry(date: string, mood: DiaryEntry['mood'], note: string, tags: string[]) {
  await addDoc(collection(db, COL), {
    date,
    mood,
    note,
    tags,
    createdAt: serverTimestamp(),
  })
}

export async function updateDiaryEntry(id: string, data: Partial<Omit<DiaryEntry, 'id'>>) {
  await updateDoc(doc(db, COL, id), data)
}

export async function deleteDiaryEntry(id: string) {
  await deleteDoc(doc(db, COL, id))
}
