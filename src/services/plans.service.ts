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
import type { Plan } from '@/types/plan'

const COL = 'plans'

export function subscribePlans(callback: (plans: Plan[]) => void) {
  const q = query(
    collection(db, COL),
    orderBy('createdAt', 'desc')
  )

  return onSnapshot(q, (snapshot) => {
    const plans = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      steps: doc.data().steps?.map((step: any) => ({
        ...step,
        createdAt: step.createdAt?.toDate() || new Date(),
        updatedAt: step.updatedAt?.toDate() || new Date(),
      })) || [],
    })) as Plan[]

    callback(plans)
  })
}

export async function addPlan(plan: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>) {
  const docRef = await addDoc(collection(db, COL), {
    ...plan,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updatePlan(id: string, updates: Partial<Omit<Plan, 'id' | 'createdAt'>>) {
  const docRef = doc(db, COL, id)
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function deletePlan(id: string) {
  const docRef = doc(db, COL, id)
  await deleteDoc(docRef)
}

export async function updatePlanStep(planId: string, stepId: string, completed: boolean) {
  const planRef = doc(db, COL, planId)

  // First get the current plan to update the step
  const planDoc = await import('firebase/firestore').then(({ getDoc }) => getDoc(planRef))
  if (!planDoc.exists()) return

  const plan = planDoc.data() as Plan
  const updatedSteps = plan.steps.map(step =>
    step.id === stepId
      ? { ...step, completed, updatedAt: new Date() }
      : step
  )

  await updateDoc(planRef, {
    steps: updatedSteps,
    updatedAt: serverTimestamp(),
  })
}

export async function addPlanStep(planId: string, stepTitle: string) {
  const planRef = doc(db, COL, planId)

  const newStep = {
    id: Date.now().toString(),
    title: stepTitle,
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  // First get the current plan to add the step
  const planDoc = await import('firebase/firestore').then(({ getDoc }) => getDoc(planRef))
  if (!planDoc.exists()) return

  const plan = planDoc.data() as Plan
  const updatedSteps = [...plan.steps, newStep]

  await updateDoc(planRef, {
    steps: updatedSteps,
    updatedAt: serverTimestamp(),
  })
}

export async function deletePlanStep(planId: string, stepId: string) {
  const planRef = doc(db, COL, planId)

  // First get the current plan to remove the step
  const planDoc = await import('firebase/firestore').then(({ getDoc }) => getDoc(planRef))
  if (!planDoc.exists()) return

  const plan = planDoc.data() as Plan
  const updatedSteps = plan.steps.filter(step => step.id !== stepId)

  await updateDoc(planRef, {
    steps: updatedSteps,
    updatedAt: serverTimestamp(),
  })
}