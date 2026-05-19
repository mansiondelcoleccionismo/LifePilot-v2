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
    enabled: true,
    title: '💊 Medicación — Mañana',
    body: 'Seroxat 20mg — recuerda tomarlo ahora',
    hour: 9, minute: 30,
  },
  {
    id: 'med_night',
    enabled: true,
    title: '💊 Medicación — Noche',
    body: 'Tranquimazin Retard 0.5mg — recuerda tomarlo ahora',
    hour: 22, minute: 30,
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
  {
    id: 'padel_lunes',
    enabled: true,
    title: '🎾 ¡Reserva la pista de pádel!',
    body: 'Recuerda reservar la pista para el lunes. ¡Que no se te adelanten!',
    hour: 11, minute: 0, dayOfWeek: 0,
  },
  {
    id: 'padel_miercoles',
    enabled: true,
    title: '🎾 ¡Reserva la pista de pádel!',
    body: 'Recuerda reservar la pista para el miércoles. ¡Hazlo ahora!',
    hour: 9, minute: 45, dayOfWeek: 2,
  },
]

// ── Timer registry (in-tab fallback) ─────────────────────────────────────────
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export function msUntilNext(hour: number, minute: number, dayOfWeek?: number): number {
  const now    = new Date()
  const target = new Date()
  target.setHours(hour, minute, 0, 0)

  if (dayOfWeek !== undefined) {
    const days        = (dayOfWeek - now.getDay() + 7) % 7
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

// ── SW alarm registration ─────────────────────────────────────────────────────

function swNextFireTs(hour: number, minute: number, dayOfWeek?: number): number {
  const now    = new Date()
  const target = new Date()
  target.setHours(hour, minute, 0, 0)
  if (dayOfWeek !== undefined) {
    const diff      = (dayOfWeek - now.getDay() + 7) % 7
    const sameAndPast = diff === 0 && now >= target
    target.setDate(target.getDate() + (sameAndPast ? 7 : diff))
  } else {
    if (now >= target) target.setDate(target.getDate() + 1)
  }
  return target.getTime()
}

export async function registerAlarmsInSW(settings: NotificationSettings) {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    if (!reg.active) return
    const icon   = `${location.origin}${import.meta.env.BASE_URL}favicon.svg`
    const alarms = settings.reminders
      .filter(r => r.enabled)
      .map(r => ({
        id:        r.id,
        title:     r.title,
        body:      r.body,
        icon,
        hour:      r.hour,
        minute:    r.minute,
        dayOfWeek: r.dayOfWeek ?? null,
        fireAt:    swNextFireTs(r.hour, r.minute, r.dayOfWeek),
      }))
    reg.active.postMessage({ type: 'SET_ALARMS', alarms })

    // Register periodic background sync where available (Android Chrome)
    if ('periodicSync' in reg) {
      try {
        await (reg as any).periodicSync.register('lifepilot-alarms', {
          minInterval: 60 * 60 * 1000,
        })
      } catch { /* permission not granted */ }
    }
  } catch { /* ignore */ }
}

// ── Missed reminders (last 2 h) ───────────────────────────────────────────────
const MISSED_WINDOW_MS = 2 * 60 * 60 * 1000

export function checkMissedReminders(): Reminder[] {
  const settings = loadNotificationSettings()
  if (!('Notification' in window) || Notification.permission !== 'granted') return []

  const now    = Date.now()
  const missed: Reminder[] = []

  for (const r of settings.reminders) {
    if (!r.enabled) continue
    const period = r.dayOfWeek !== undefined
      ? 7 * 24 * 3600 * 1000
      : 24 * 3600 * 1000
    const next = swNextFireTs(r.hour, r.minute, r.dayOfWeek)
    const prev = next - period
    if (prev > now - MISSED_WINDOW_MS && prev < now) {
      missed.push(r)
    }
  }
  return missed
}

// ── Missed → Firebase notifications ──────────────────────────────────────────

const REMINDER_URLS: Record<string, string> = {
  med_morning:     '/medicacion',
  med_night:       '/medicacion',
  padel_lunes:     '/calendario',
  padel_miercoles: '/calendario',
  diary:           '/diario',
  kira:            '/kira',
  metrics:         '/salud/peso',
}

export async function checkAndNotifyMissedReminders(): Promise<void> {
  const missed = checkMissedReminders()
  if (!missed.length) return
  const { notifyOnce } = await import('./notification.service')
  await Promise.allSettled(
    missed.map(r =>
      notifyOnce(`missed_${r.id}`, {
        title: r.title,
        body: r.body,
        type: 'reminder',
        accionUrl: REMINDER_URLS[r.id],
      }),
    ),
  )
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
  registerAlarmsInSW(settings)
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  return Notification.requestPermission()
}

export function initNotifications() {
  if (!('Notification' in window)) return
  const settings = loadNotificationSettings()
  settings.reminders.forEach(scheduleOne)
  registerAlarmsInSW(settings)
}
