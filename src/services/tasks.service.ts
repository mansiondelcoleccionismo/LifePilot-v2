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
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Task } from '@/types/task'

const COL = 'tasks'

export function subscribeTasks(callback: (tasks: Task[]) => void) {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) => {
    const tasks = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate() ?? new Date(),
    })) as Task[]
    callback(tasks)
  })
}

export async function addTask(title: string, priority: Task['priority'] = 'medium') {
  await addDoc(collection(db, COL), {
    title,
    completed: false,
    priority,
    createdAt: serverTimestamp(),
  })
}

export async function toggleTask(id: string, completed: boolean) {
  await updateDoc(doc(db, COL, id), { completed })
}

export async function deleteTask(id: string) {
  await deleteDoc(doc(db, COL, id))
}