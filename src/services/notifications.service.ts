export interface Reminder {
  id: string
  enabled: boolean
  title: string
  body: string
  hour: number
  minute: number
  dayOfWeek?: number  // undefined = daily; 0=Sun … 6=Sat = weekly
}

export interface NotificationSettings {
  reminders: Reminder[]
}

const STORAGE_KEY = 'lifepilot_notifications'

export const DEFAULT_REMINDERS: Reminder[] = [
  {
    id: 'metrics',
    enabled: false,
    title: 'LifePilot',
    body: '⚖️ Hora de registrar tu peso y métricas semanales',
    hour: 21, minute: 0, dayOfWeek: 0,
  },
  {
    id: 'med_morning',
    enabled: false,
    title: 'LifePilot',
    body: '💊 Recuerda tomar tu medicación de la mañana',
    hour: 9, minute: 30,
  },
  {
    id: 'med_night',
    enabled: false,
    title: 'LifePilot',
    body: '💊 Recuerda tomar tu medicación de la noche',
    hour: 22, minute: 0,
  },
  {
    id: 'diary',
    enabled: false,
    title: 'LifePilot',
    body: '📝 ¿Cómo ha ido el día? Registra tu estado de ánimo',
    hour: 22, minute: 30,
  },
  {
    id: 'kira',
    enabled: false,
    title: 'LifePilot',
    body: '👧 En 15 min llegas a casa — ¿qué plan tienes con Kira hoy?',
    hour: 17, minute: 15,
  },
]

// ── Timer registry ────────────────────────────────────────────────────────────
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function msUntilNext(hour: number, minute: number, dayOfWeek?: number): number {
  const now = new Date()
  const target = new Date()
  target.setHours(hour, minute, 0, 0)

  if (dayOfWeek !== undefined) {
    const days = (dayOfWeek - now.getDay() + 7) % 7
    const sameDayPast = days === 0 && now.getTime() >= target.getTime()
    target.setDate(target.getDate() + (sameDayPast ? 7 : days))
  } else {
    if (now.getTime() >= target.getTime()) target.setDate(target.getDate() + 1)
  }

  return target.getTime() - now.getTime()
}

async function showNotification(title: string, body: string, tag: string) {
  const opts: NotificationOptions = {
    body,
    tag,
    icon: `${location.origin}${import.meta.env.BASE_URL}favicon.svg`,
  }
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification(title, opts)
      return
    } catch { /* fall through */ }
  }
  new Notification(title, opts)
}

function scheduleOne(reminder: Reminder) {
  cancelOne(reminder.id)
  if (!reminder.enabled || Notification.permission !== 'granted') return
  const ms = msUntilNext(reminder.hour, reminder.minute, reminder.dayOfWeek)
  timers.set(
    reminder.id,
    setTimeout(() => {
      showNotification(reminder.title, reminder.body, reminder.id)
      scheduleOne(reminder)
    }, ms),
  )
}

function cancelOne(id: string) {
  const t = timers.get(id)
  if (t !== undefined) { clearTimeout(t); timers.delete(id) }
}

// ── Public API ────────────────────────────────────────────────────────────────
export function cancelAllNotifications() {
  timers.forEach(clearTimeout)
  timers.clear()
}

export function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as NotificationSettings
      // Merge saved state with defaults to pick up any new reminders
      const reminders = DEFAULT_REMINDERS.map(def => {
        const saved = parsed.reminders?.find(r => r.id === def.id)
        return saved ? { ...def, ...saved } : { ...def }
      })
      return { reminders }
    }
  } catch { /* ignore */ }
  return { reminders: DEFAULT_REMINDERS.map(r => ({ ...r })) }
}

export function saveNotificationSettings(settings: NotificationSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  cancelAllNotifications()
  settings.reminders.forEach(scheduleOne)
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  return Notification.requestPermission()
}

export function initNotifications() {
  if (!('Notification' in window)) return
  const settings = loadNotificationSettings()
  settings.reminders.forEach(scheduleOne)
}
