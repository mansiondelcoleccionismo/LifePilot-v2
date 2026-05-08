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
import type { Movie, Show, Game } from '@/types/entertainment'

const MOVIES_COL = 'movies'
const SHOWS_COL = 'shows'
const GAMES_COL = 'games'

// Movies CRUD
export function subscribeMovies(callback: (movies: Movie[]) => void) {
  const q = query(
    collection(db, MOVIES_COL),
    orderBy('createdAt', 'desc')
  )

  return onSnapshot(q, (snapshot) => {
    const movies = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Movie[]

    callback(movies)
  })
}

export async function addMovie(movie: Omit<Movie, 'id' | 'createdAt' | 'updatedAt'>) {
  const docRef = await addDoc(collection(db, MOVIES_COL), {
    ...movie,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updateMovie(id: string, updates: Partial<Omit<Movie, 'id' | 'createdAt'>>) {
  const docRef = doc(db, MOVIES_COL, id)
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteMovie(id: string) {
  const docRef = doc(db, MOVIES_COL, id)
  await deleteDoc(docRef)
}

// Shows CRUD
export function subscribeShows(callback: (shows: Show[]) => void) {
  const q = query(
    collection(db, SHOWS_COL),
    orderBy('createdAt', 'desc')
  )

  return onSnapshot(q, (snapshot) => {
    const shows = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Show[]

    callback(shows)
  })
}

export async function addShow(show: Omit<Show, 'id' | 'createdAt' | 'updatedAt'>) {
  const docRef = await addDoc(collection(db, SHOWS_COL), {
    ...show,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updateShow(id: string, updates: Partial<Omit<Show, 'id' | 'createdAt'>>) {
  const docRef = doc(db, SHOWS_COL, id)
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteShow(id: string) {
  const docRef = doc(db, SHOWS_COL, id)
  await deleteDoc(docRef)
}

// Games CRUD
export function subscribeGames(callback: (games: Game[]) => void) {
  const q = query(
    collection(db, GAMES_COL),
    orderBy('createdAt', 'desc')
  )

  return onSnapshot(q, (snapshot) => {
    const games = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Game[]

    callback(games)
  })
}

export async function addGame(game: Omit<Game, 'id' | 'createdAt' | 'updatedAt'>) {
  const docRef = await addDoc(collection(db, GAMES_COL), {
    ...game,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updateGame(id: string, updates: Partial<Omit<Game, 'id' | 'createdAt'>>) {
  const docRef = doc(db, GAMES_COL, id)
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteGame(id: string) {
  const docRef = doc(db, GAMES_COL, id)
  await deleteDoc(docRef)
}