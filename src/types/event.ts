export type EventCategory = 'personal' | 'familia' | 'salud' | 'trabajo'

export interface CalendarEvent {
  id: string
  title: string
  date: string // YYYY-MM-DD
  time?: string // HH:MM
  color: string
  category: EventCategory
  createdAt: Date
  updatedAt: Date
}

export const EVENT_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // emerald
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
] as const

export type EventColor = typeof EVENT_COLORS[number]