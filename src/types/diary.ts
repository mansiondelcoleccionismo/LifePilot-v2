export interface DiaryEntry {
  id: string
  date: string
  mood: 1 | 2 | 3 | 4 | 5
  note: string
  tags: string[]
  createdAt: Date
}
