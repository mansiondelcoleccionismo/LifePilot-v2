import {
  collection, addDoc, deleteDoc, doc, getDocs,
  updateDoc, increment, orderBy, query, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

const COL = 'food_favorites'

export interface FoodFavorite {
  id: string
  name: string
  emoji: string
  category: string
  imageUrl?: string
  per100g: { kcal: number; protein: number; carbs: number; fat: number }
  defaultGrams: number
  usageCount: number
}

// Preloaded items — stored as per100g + defaultGrams
const PRELOADED: Omit<FoodFavorite, 'id' | 'usageCount'>[] = [
  {
    name: 'Café con leche Dolce Gusto', emoji: '☕', category: 'bebidas',
    defaultGrams: 200,
    per100g: { kcal: 30, protein: 1, carbs: 4, fat: 1 },
  },
  {
    name: 'Yogur griego Bonarea', emoji: '🥛', category: 'lácteos',
    defaultGrams: 125,
    per100g: { kcal: 88, protein: 8, carbs: 3.2, fat: 4.8 },
  },
  {
    name: 'Mini bocadillo jamón york y queso', emoji: '🥪', category: 'bocadillos',
    defaultGrams: 120,
    per100g: { kcal: 233, protein: 11.7, carbs: 26.7, fat: 7.5 },
  },
  {
    name: 'Pechuga de pollo a la plancha', emoji: '🍗', category: 'proteínas',
    defaultGrams: 150,
    per100g: { kcal: 110, protein: 20.7, carbs: 0, fat: 2 },
  },
  {
    name: 'Arroz cocido', emoji: '🍚', category: 'carbohidratos',
    defaultGrams: 100,
    per100g: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  },
  {
    name: 'Tortilla de 2 huevos', emoji: '🍳', category: 'proteínas',
    defaultGrams: 100,
    per100g: { kcal: 180, protein: 14, carbs: 1, fat: 13 },
  },
  {
    name: 'Plátano mediano', emoji: '🍌', category: 'frutas',
    defaultGrams: 100,
    per100g: { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3 },
  },
  {
    name: 'Whey proteína (1 scoop)', emoji: '💪', category: 'suplementos',
    defaultGrams: 30,
    per100g: { kcal: 400, protein: 80, carbs: 10, fat: 6.7 },
  },
  {
    name: 'Almendras', emoji: '🥜', category: 'snacks',
    defaultGrams: 30,
    per100g: { kcal: 580, protein: 20, carbs: 20, fat: 50 },
  },
  {
    name: 'Leche semidesnatada', emoji: '🥛', category: 'lácteos',
    defaultGrams: 200,
    per100g: { kcal: 46, protein: 3.2, carbs: 4.7, fat: 1.6 },
  },
]

export async function initFavorites(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, COL))
    if (!snap.empty) return
    for (const fav of PRELOADED) {
      await addDoc(collection(db, COL), { ...fav, usageCount: 0, createdAt: serverTimestamp() })
    }
  } catch { /* offline — skip preload */ }
}

export async function getFavorites(): Promise<FoodFavorite[]> {
  try {
    const snap = await getDocs(query(collection(db, COL), orderBy('usageCount', 'desc')))
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as FoodFavorite))
  } catch {
    return []
  }
}

export async function addFavorite(
  fav: Omit<FoodFavorite, 'id' | 'usageCount'>,
): Promise<string> {
  const ref = await addDoc(collection(db, COL), { ...fav, usageCount: 0, createdAt: serverTimestamp() })
  return ref.id
}

export async function removeFavorite(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}

export async function incrementUsage(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, COL, id), { usageCount: increment(1) })
  } catch { /* ignore */ }
}
