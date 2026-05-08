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
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Asset, WealthSnapshot } from '@/types/wealth'

const ASSETS_COL = 'assets'
const SNAPSHOTS_COL = 'wealth_snapshots'

// Fixed rate — update manually or replace with API call when needed
const USD_TO_EUR = 0.92

export function calculateTotal(assets: Asset[]): number {
  return assets.reduce((sum, a) => {
    return sum + (a.currency === 'EUR' ? a.value : a.value * USD_TO_EUR)
  }, 0)
}

export function subscribeAssets(callback: (assets: Asset[]) => void) {
  const q = query(collection(db, ASSETS_COL), orderBy('lastUpdated', 'desc'))
  return onSnapshot(q, (snap) => {
    const assets = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      lastUpdated: d.data().lastUpdated?.toDate() ?? new Date(),
    })) as Asset[]
    callback(assets)
  })
}

export async function addAsset(asset: Omit<Asset, 'id' | 'lastUpdated'>) {
  await addDoc(collection(db, ASSETS_COL), {
    ...asset,
    lastUpdated: serverTimestamp(),
  })
}

export async function updateAsset(id: string, updates: Partial<Omit<Asset, 'id'>>) {
  await updateDoc(doc(db, ASSETS_COL, id), {
    ...updates,
    lastUpdated: serverTimestamp(),
  })
}

export async function deleteAsset(id: string) {
  await deleteDoc(doc(db, ASSETS_COL, id))
}

// Uses date as document ID to allow one snapshot per day (overwrites if re-saved)
export async function saveSnapshot(totalEUR: number): Promise<void> {
  const date = new Date().toISOString().split('T')[0]
  await setDoc(doc(db, SNAPSHOTS_COL, date), {
    date,
    totalEUR,
  })
}

export function subscribeSnapshots(callback: (snapshots: WealthSnapshot[]) => void) {
  const q = query(collection(db, SNAPSHOTS_COL), orderBy('date', 'desc'))
  return onSnapshot(q, (snap) => {
    const snapshots = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as WealthSnapshot[]
    callback(snapshots)
  })
}
