import { create } from 'zustand'
import type { Notification } from '@/types/notification'
import {
  subscribeNotifications,
  markNotifRead,
  markAllNotifsRead,
} from '@/services/notification.service'

interface NotificationsState {
  notifications: Notification[]
  _unsubscribe: (() => void) | null
  startListening: () => void
  stopListening: () => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  _unsubscribe: null,

  startListening: () => {
    if (get()._unsubscribe) return
    const unsub = subscribeNotifications((docs) => set({ notifications: docs }))
    set({ _unsubscribe: unsub })
  },

  stopListening: () => {
    get()._unsubscribe?.()
    set({ _unsubscribe: null, notifications: [] })
  },

  markAsRead: (id) => {
    markNotifRead(id)
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }))
  },

  markAllAsRead: () => {
    const ids = get().notifications.filter((n) => !n.read).map((n) => n.id)
    markAllNotifsRead(ids)
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }))
  },
}))
