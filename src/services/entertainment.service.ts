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
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Content, ContentStatus, ContentType, ContentStats } from '@/types/entertainment'

const COL = 'entertainment'

export function subscribeContent(callback: (items: Content[]) => void) {
  const q = query(collection(db, COL), orderBy('addedAt', 'desc'))
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        ...data,
        addedAt: data.addedAt?.toDate?.() ?? new Date(),
        watchedAt: data.watchedAt?.toDate?.() ?? undefined,
      } as Content
    })
    callback(items)
  })
}

export async function addContent(content: Omit<Content, 'id' | 'addedAt'>) {
  const ref = await addDoc(collection(db, COL), {
    ...content,
    addedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateContent(id: string, updates: Partial<Omit<Content, 'id' | 'addedAt'>>) {
  await updateDoc(doc(db, COL, id), updates)
}

export async function deleteContent(id: string) {
  await deleteDoc(doc(db, COL, id))
}

export async function updateProgress(id: string, episode: number) {
  await updateDoc(doc(db, COL, id), { currentEpisode: episode })
}

export async function markWatched(id: string, rating?: number) {
  await updateDoc(doc(db, COL, id), {
    status: 'visto' as ContentStatus,
    watchedAt: new Date(),
    ...(rating !== undefined ? { rating } : {}),
  })
}

export async function seedPhysicalCollection(items: Omit<Content, 'id'>[]) {
  const batch = writeBatch(db)
  for (const item of items) {
    const ref = doc(collection(db, COL))
    batch.set(ref, { ...item, addedAt: serverTimestamp() })
  }
  await batch.commit()
}

export async function importFromCSV(csvText: string): Promise<{ imported: number; skipped: number }> {
  const lines = csvText.split('\n').filter(Boolean)
  const header = lines[0].toLowerCase()
  const hasTitleCol = header.includes('title') || header.includes('título')
  const dataLines = hasTitleCol ? lines.slice(1) : lines

  let imported = 0
  let skipped = 0

  for (const line of dataLines) {
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim())
    const title = cols[0]
    if (!title) { skipped++; continue }

    try {
      await addContent({
        title,
        type: 'pelicula',
        status: 'visto',
        platform: 'Otro',
        year: parseInt(cols[1]) || undefined,
        rating: parseFloat(cols[2]) || undefined,
        watchedAt: cols[3] ? new Date(cols[3]) : undefined,
      })
      imported++
    } catch {
      skipped++
    }
  }

  return { imported, skipped }
}

export function getStats(items: Content[]): ContentStats {
  const watched = items.filter(i => i.status === 'visto')
  const ratedItems = watched.filter(i => (i.rating ?? 0) > 0)
  const avgRating = ratedItems.length > 0
    ? ratedItems.reduce((sum, i) => sum + (i.rating ?? 0), 0) / ratedItems.length
    : 0

  const byType: Partial<Record<ContentType, number>> = {}
  const genreMap: Record<string, number> = {}
  const directorMap: Record<string, number> = {}
  const byMonthMap: Record<string, number> = {}

  for (const item of items) {
    byType[item.type] = (byType[item.type] ?? 0) + 1
  }

  for (const item of watched) {
    item.genres?.forEach(g => { genreMap[g] = (genreMap[g] ?? 0) + 1 })
    if (item.director) directorMap[item.director] = (directorMap[item.director] ?? 0) + 1
    const d = item.watchedAt ?? item.addedAt
    const key = new Date(d).toISOString().slice(0, 7)
    byMonthMap[key] = (byMonthMap[key] ?? 0) + 1
  }

  const estimatedHours = Math.round(
    watched.reduce((sum, i) => {
      const dur = i.duration ?? 90
      const eps = i.type === 'serie' || i.type === 'anime' ? (i.totalEpisodes ?? 1) : 1
      return sum + (dur * eps) / 60
    }, 0)
  )

  return {
    totalItems: items.length,
    totalWatched: watched.length,
    totalWatching: items.filter(i => i.status === 'viendo').length,
    totalPending: items.filter(i => i.status === 'pendiente').length,
    estimatedHours,
    avgRating: Math.round(avgRating * 10) / 10,
    byType,
    byMonth: Object.entries(byMonthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, count]) => ({ month, count })),
    topGenres: Object.entries(genreMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([genre, count]) => ({ genre, count })),
    topDirectors: Object.entries(directorMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([director, count]) => ({ director, count })),
  }
}
