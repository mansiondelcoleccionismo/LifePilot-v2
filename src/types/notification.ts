export type NotificationType = 'achievement' | 'reminder' | 'info' | 'warning'

export interface Notification {
  id: string
  title: string
  body: string
  createdAt: Date
  read: boolean
  type: NotificationType
}
