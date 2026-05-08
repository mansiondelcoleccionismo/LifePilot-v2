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
import type { Book, Podcast, Course } from '@/types/learning'

const BOOKS_COL = 'books'
const PODCASTS_COL = 'podcasts'
const COURSES_COL = 'courses'

// Books CRUD
export function subscribeBooks(callback: (books: Book[]) => void) {
  const q = query(
    collection(db, BOOKS_COL),
    orderBy('createdAt', 'desc')
  )

  return onSnapshot(q, (snapshot) => {
    const books = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Book[]

    callback(books)
  })
}

export async function addBook(book: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>) {
  const docRef = await addDoc(collection(db, BOOKS_COL), {
    ...book,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updateBook(id: string, updates: Partial<Omit<Book, 'id' | 'createdAt'>>) {
  const docRef = doc(db, BOOKS_COL, id)
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteBook(id: string) {
  const docRef = doc(db, BOOKS_COL, id)
  await deleteDoc(docRef)
}

// Podcasts CRUD
export function subscribePodcasts(callback: (podcasts: Podcast[]) => void) {
  const q = query(
    collection(db, PODCASTS_COL),
    orderBy('createdAt', 'desc')
  )

  return onSnapshot(q, (snapshot) => {
    const podcasts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Podcast[]

    callback(podcasts)
  })
}

export async function addPodcast(podcast: Omit<Podcast, 'id' | 'createdAt' | 'updatedAt'>) {
  const docRef = await addDoc(collection(db, PODCASTS_COL), {
    ...podcast,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updatePodcast(id: string, updates: Partial<Omit<Podcast, 'id' | 'createdAt'>>) {
  const docRef = doc(db, PODCASTS_COL, id)
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function deletePodcast(id: string) {
  const docRef = doc(db, PODCASTS_COL, id)
  await deleteDoc(docRef)
}

// Courses CRUD
export function subscribeCourses(callback: (courses: Course[]) => void) {
  const q = query(
    collection(db, COURSES_COL),
    orderBy('createdAt', 'desc')
  )

  return onSnapshot(q, (snapshot) => {
    const courses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Course[]

    callback(courses)
  })
}

export async function addCourse(course: Omit<Course, 'id' | 'createdAt' | 'updatedAt'>) {
  const docRef = await addDoc(collection(db, COURSES_COL), {
    ...course,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updateCourse(id: string, updates: Partial<Omit<Course, 'id' | 'createdAt'>>) {
  const docRef = doc(db, COURSES_COL, id)
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteCourse(id: string) {
  const docRef = doc(db, COURSES_COL, id)
  await deleteDoc(docRef)
}