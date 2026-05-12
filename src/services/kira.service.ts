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
import type { KiraActivity, KiraMilestone, KiraActivityLog, KiraDiaryEntry, KiraAchievedMilestone } from '@/types/kira'

// ── Legacy collections ─────────────────────────────────────────────────────
const ACTIVITIES_COL  = 'kira_activities'
const MILESTONES_COL  = 'kira_milestones'
const ACTIVITY_LOG_COL = 'kira_activity_log'
const DIARY_COL        = 'kira_diary'
const ACHIEVED_COL     = 'kira_achieved_milestones'

// ── Legacy: planned activities CRUD ───────────────────────────────────────
export function subscribeKiraActivities(callback: (activities: KiraActivity[]) => void) {
  const q = query(collection(db, ACTIVITIES_COL), orderBy('createdAt', 'asc'))
  return onSnapshot(q, snapshot => {
    const docs = snapshot.docs.map(d => ({
      id: d.id, ...d.data(),
      createdAt: d.data().createdAt?.toDate() || new Date(),
      updatedAt: d.data().updatedAt?.toDate() || new Date(),
    })) as KiraActivity[]
    // Sort by date in the client to avoid composite index requirement
    callback(docs.sort((a, b) => a.date.localeCompare(b.date)))
  })
}

export async function addKiraActivity(activity: Omit<KiraActivity, 'id' | 'createdAt' | 'updatedAt'>) {
  return (await addDoc(collection(db, ACTIVITIES_COL), {
    ...activity, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })).id
}

export async function updateKiraActivity(id: string, updates: Partial<Omit<KiraActivity, 'id' | 'createdAt'>>) {
  await updateDoc(doc(db, ACTIVITIES_COL, id), { ...updates, updatedAt: serverTimestamp() })
}

export async function deleteKiraActivity(id: string) {
  await deleteDoc(doc(db, ACTIVITIES_COL, id))
}

// ── Legacy: milestones CRUD ────────────────────────────────────────────────
export function subscribeKiraMilestones(callback: (milestones: KiraMilestone[]) => void) {
  const q = query(collection(db, MILESTONES_COL), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snapshot => {
    const docs = snapshot.docs.map(d => ({
      id: d.id, ...d.data(),
      createdAt: d.data().createdAt?.toDate() || new Date(),
      updatedAt: d.data().updatedAt?.toDate() || new Date(),
    })) as KiraMilestone[]
    // Sort by date desc in the client to avoid composite index requirement
    callback(docs.sort((a, b) => b.date.localeCompare(a.date)))
  })
}

export async function addKiraMilestone(milestone: Omit<KiraMilestone, 'id' | 'createdAt' | 'updatedAt'>) {
  return (await addDoc(collection(db, MILESTONES_COL), {
    ...milestone, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })).id
}

export async function updateKiraMilestone(id: string, updates: Partial<Omit<KiraMilestone, 'id' | 'createdAt'>>) {
  await updateDoc(doc(db, MILESTONES_COL, id), { ...updates, updatedAt: serverTimestamp() })
}

export async function deleteKiraMilestone(id: string) {
  await deleteDoc(doc(db, MILESTONES_COL, id))
}

// ── Activity log ───────────────────────────────────────────────────────────
export function subscribeKiraActivityLogs(callback: (logs: KiraActivityLog[]) => void) {
  const q = query(collection(db, ACTIVITY_LOG_COL), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(d => ({
      id: d.id, ...d.data(),
      createdAt: d.data().createdAt?.toDate() || new Date(),
    })) as KiraActivityLog[])
  })
}

export async function addKiraActivityLog(log: Omit<KiraActivityLog, 'id' | 'createdAt'>) {
  return (await addDoc(collection(db, ACTIVITY_LOG_COL), {
    ...log, createdAt: serverTimestamp(),
  })).id
}

// ── Diary ──────────────────────────────────────────────────────────────────
export function subscribeKiraDiaryEntries(callback: (entries: KiraDiaryEntry[]) => void) {
  const q = query(collection(db, DIARY_COL), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(d => ({
      id: d.id, ...d.data(),
      createdAt: d.data().createdAt?.toDate() || new Date(),
    })) as KiraDiaryEntry[])
  })
}

export async function addKiraDiaryEntry(entry: Omit<KiraDiaryEntry, 'id' | 'createdAt'>) {
  return (await addDoc(collection(db, DIARY_COL), {
    ...entry, createdAt: serverTimestamp(),
  })).id
}

export async function deleteKiraDiaryEntry(id: string) {
  await deleteDoc(doc(db, DIARY_COL, id))
}

// ── Achieved milestones ────────────────────────────────────────────────────
export function subscribeKiraAchievedMilestones(callback: (achieved: KiraAchievedMilestone[]) => void) {
  const q = query(collection(db, ACHIEVED_COL), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(d => ({
      id: d.id, ...d.data(),
      createdAt: d.data().createdAt?.toDate() || new Date(),
    })) as KiraAchievedMilestone[])
  })
}

export async function addKiraAchievedMilestone(milestoneId: string, achievedAt: string) {
  return (await addDoc(collection(db, ACHIEVED_COL), {
    milestoneId, achievedAt, createdAt: serverTimestamp(),
  })).id
}
