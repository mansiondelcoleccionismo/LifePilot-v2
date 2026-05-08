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
import type { CalendarEvent } from '@/types/event'

const COL = 'calendar_events'

export function subscribeCalendarEvents(monthKey: string, callback: (events: CalendarEvent[]) => void) {
  const startDate = `${monthKey}-01`
  const [year, month] = monthKey.split('-').map(Number)
  const endDate = `${monthKey}-${new Date(year, month, 0).getDate().toString().padStart(2, '0')}`

  const q = query(
    collection(db, COL),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'asc'),
    orderBy('time', 'asc'),
  )

  return onSnapshot(q, (snapshot) => {
    const events = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as CalendarEvent[]

    callback(events)
  })
}

export async function addCalendarEvent(event: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>) {
  const docRef = await addDoc(collection(db, COL), {
    ...event,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updateCalendarEvent(id: string, updates: Partial<Omit<CalendarEvent, 'id' | 'createdAt'>>) {
  const docRef = doc(db, COL, id)
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteCalendarEvent(id: string) {
  const docRef = doc(db, COL, id)
  await deleteDoc(docRef)
}