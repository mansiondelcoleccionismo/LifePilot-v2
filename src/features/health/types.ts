export interface WeightEntry {
  id: string
  weight: number      // kg, decimals allowed
  date: Date          // when the measurement was taken
  note?: string       // optional user comment
  createdAt: Date     // when the record was created in Firestore
}

// Shape accepted by addWeight (id and createdAt are generated server-side)
export type NewWeightEntry = Pick<WeightEntry, 'weight' | 'date'> & { note?: string }

// Shape accepted by updateWeight
export type WeightEntryUpdate = Partial<Pick<WeightEntry, 'weight' | 'date' | 'note'>>
