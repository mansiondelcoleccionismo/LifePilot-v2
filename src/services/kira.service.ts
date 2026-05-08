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
import type { KiraActivity, KiraMilestone } from '@/types/kira'

const ACTIVITIES_COL = 'kira_activities'
const MILESTONES_COL = 'kira_milestones'

// Activities CRUD
export function subscribeKiraActivities(callback: (activities: KiraActivity[]) => void) {
  const q = query(
    collection(db, ACTIVITIES_COL),
    orderBy('date', 'asc'),
    orderBy('createdAt', 'asc')
  )

  return onSnapshot(q, (snapshot) => {
    const activities = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as KiraActivity[]

    callback(activities)
  })
}

export async function addKiraActivity(activity: Omit<KiraActivity, 'id' | 'createdAt' | 'updatedAt'>) {
  const docRef = await addDoc(collection(db, ACTIVITIES_COL), {
    ...activity,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updateKiraActivity(id: string, updates: Partial<Omit<KiraActivity, 'id' | 'createdAt'>>) {
  const docRef = doc(db, ACTIVITIES_COL, id)
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteKiraActivity(id: string) {
  const docRef = doc(db, ACTIVITIES_COL, id)
  await deleteDoc(docRef)
}

// Milestones CRUD
export function subscribeKiraMilestones(callback: (milestones: KiraMilestone[]) => void) {
  const q = query(
    collection(db, MILESTONES_COL),
    orderBy('date', 'desc'),
    orderBy('createdAt', 'desc')
  )

  return onSnapshot(q, (snapshot) => {
    const milestones = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as KiraMilestone[]

    callback(milestones)
  })
}

export async function addKiraMilestone(milestone: Omit<KiraMilestone, 'id' | 'createdAt' | 'updatedAt'>) {
  const docRef = await addDoc(collection(db, MILESTONES_COL), {
    ...milestone,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updateKiraMilestone(id: string, updates: Partial<Omit<KiraMilestone, 'id' | 'createdAt'>>) {
  const docRef = doc(db, MILESTONES_COL, id)
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteKiraMilestone(id: string) {
  const docRef = doc(db, MILESTONES_COL, id)
  await deleteDoc(docRef)
}