import { create } from 'zustand'
import type { Notification } from '@/types/notification'

interface NotificationsState {
  notifications: Notification[]
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  addNotification: (n: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void
}

const h = (hours: number) => new Date(Date.now() - hours * 3_600_000)

const MOCK: Notification[] = [
  {
    id: '1',
    title: 'Rutina completada',
    body: 'Has completado tu rutina de hoy. ¡Buen trabajo!',
    createdAt: h(2),
    read: false,
    type: 'achievement',
  },
  {
    id: '2',
    title: 'Nuevo récord personal',
    body: 'Nuevo récord en press banca: 95 kg × 3 reps',
    createdAt: h(5),
    read: false,
    type: 'achievement',
  },
  {
    id: '3',
    title: 'Objetivo nutricional',
    body: 'Has alcanzado tu objetivo de proteínas del día',
    createdAt: h(26),
    read: true,
    type: 'info',
  },
  {
    id: '4',
    title: 'Recordatorio semanal',
    body: 'No olvides registrar tu peso esta semana',
    createdAt: h(50),
    read: true,
    type: 'reminder',
  },
]

export const useNotificationsStore = create<NotificationsState>((set) => ({
  notifications: MOCK,
  markAsRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),
  markAllAsRead: () =>
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
  addNotification: (n) =>
    set((s) => ({
      notifications: [
        { ...n, id: Date.now().toString(), createdAt: new Date(), read: false },
        ...s.notifications,
      ],
    })),
}))
