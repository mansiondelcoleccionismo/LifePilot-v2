import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  doc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  type CollectionReference,
  type DocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { WeightEntry, NewWeightEntry, WeightEntryUpdate } from './types'

// ── Collection ref ────────────────────────────────────────────────────────────
function col(userId: string): CollectionReference {
  return collection(db, 'users', userId, 'weights')
}

// ── Firestore → domain ────────────────────────────────────────────────────────
function toEntry(snap: DocumentSnapshot): WeightEntry {
  const d = snap.data()!
  const entry: WeightEntry = {
    id:        snap.id,
    weight:    d['weight'] as number,
    date:      (d['date'] as Timestamp).toDate(),
    createdAt: d['createdAt'] instanceof Timestamp ? d['createdAt'].toDate() : new Date(),
  }
  if (d['note'] !== undefined) entry.note = d['note'] as string
  return entry
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns all weight entries for a user, ordered by measurement date descending.
 */
export async function getWeights(userId: string): Promise<WeightEntry[]> {
  const q = query(col(userId), orderBy('date', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(toEntry)
}

/**
 * Adds a new weight entry and returns it with the generated id and createdAt.
 */
export async function addWeight(
  userId: string,
  entry: NewWeightEntry,
): Promise<WeightEntry> {
  const payload: Record<string, unknown> = {
    weight:    entry.weight,
    date:      entry.date,
    createdAt: serverTimestamp(),
  }
  if (entry.note !== undefined) payload['note'] = entry.note

  const ref = await addDoc(col(userId), payload)
  return {
    id:        ref.id,
    weight:    entry.weight,
    date:      entry.date,
    note:      entry.note,
    createdAt: new Date(),
  }
}

/**
 * Partially updates a weight entry. Only the supplied fields are written.
 */
export async function updateWeight(
  userId: string,
  id: string,
  partial: WeightEntryUpdate,
): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (partial.weight !== undefined) payload['weight'] = partial.weight
  if (partial.date   !== undefined) payload['date']   = partial.date
  if (partial.note   !== undefined) payload['note']   = partial.note

  await updateDoc(doc(col(userId), id), payload)
}

/**
 * Deletes a weight entry permanently.
 */
export async function deleteWeight(userId: string, id: string): Promise<void> {
  await deleteDoc(doc(col(userId), id))
}

/**
 * Returns the most recent weight entry by measurement date, or null if none exist.
 */
export async function getLastWeight(userId: string): Promise<WeightEntry | null> {
  const q = query(col(userId), orderBy('date', 'desc'), limit(1))
  const snap = await getDocs(q)
  if (snap.empty) return null
  return toEntry(snap.docs[0])
}
