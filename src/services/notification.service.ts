import { db } from '@/lib/firebase'
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  query, orderBy, limit, where, Timestamp, onSnapshot,
} from 'firebase/firestore'
import type { NotificationType } from '@/types/notification'

const COL = collection(db, 'notifications')
const today = () => new Date().toISOString().slice(0, 10)

export interface NotificationDoc {
  id: string
  title: string
  body: string
  type: NotificationType
  createdAt: Date
  read: boolean
  key: string
  accionUrl?: string
}

export function subscribeNotifications(
  cb: (notifications: NotificationDoc[]) => void,
): () => void {
  const q = query(COL, orderBy('createdAt', 'desc'), limit(50))
  return onSnapshot(
    q,
    (snap) =>
      cb(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<NotificationDoc, 'id' | 'createdAt'>),
          createdAt: (d.data().createdAt as Timestamp).toDate(),
        })),
      ),
    () => cb([]),
  )
}

/** Creates a notification at most once per key per day. Fire-and-forget. */
export async function notifyOnce(
  key: string,
  data: { title: string; body: string; type: NotificationType; accionUrl?: string },
): Promise<void> {
  try {
    const dayKey = `${key}_${today()}`
    const existing = await getDocs(query(COL, where('key', '==', dayKey), limit(1)))
    if (!existing.empty) return
    await addDoc(COL, { ...data, key: dayKey, read: false, createdAt: Timestamp.now() })
  } catch {
    // silencioso
  }
}

export async function markNotifRead(id: string): Promise<void> {
  try { await updateDoc(doc(db, 'notifications', id), { read: true }) } catch {}
}

export async function markAllNotifsRead(ids: string[]): Promise<void> {
  await Promise.all(ids.map(markNotifRead))
}

/** Auto-cleanup: read >7d and unread >30d. Run once per session. */
let _cleanupDone = false
export async function cleanupOldNotifications(): Promise<void> {
  if (_cleanupDone) return
  _cleanupDone = true
  try {
    const now = new Date()
    const cutRead   = new Date(now); cutRead.setDate(now.getDate() - 7)
    const cutUnread = new Date(now); cutUnread.setDate(now.getDate() - 30)

    const snap = await getDocs(query(COL, orderBy('createdAt', 'asc'), limit(200)))
    const toDelete = snap.docs.filter(d => {
      const data = d.data()
      const ts = (data['createdAt'] as Timestamp).toDate()
      if (data['read']) return ts < cutRead
      return ts < cutUnread
    })
    await Promise.all(toDelete.map(d => deleteDoc(doc(db, 'notifications', d.id))))
  } catch { /* silent */ }
}
