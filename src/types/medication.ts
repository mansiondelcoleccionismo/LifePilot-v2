export type MedicationUnit = 'mg' | 'ml' | 'UI' | 'g'
export type MedicationTime = 'mañana' | 'mediodía' | 'noche'

export interface Medication {
  id: string
  name: string
  dose: number
  unit: MedicationUnit
  time: MedicationTime
  createdAt: Date
  updatedAt: Date
}

export interface MedicationLog {
  taken: boolean
  takenAt?: Date
}

export interface MedicationWithStatus extends Medication {
  taken: boolean
  takenAt?: Date
}
