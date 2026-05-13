import { getGoogleToken } from '@/store/auth.store'

export class TokenExpiredError extends Error {
  constructor() { super('TOKEN_EXPIRED') }
}

export interface GCalEvent {
  id: string
  title: string
  start: string
  end: string
  color?: string
  description?: string
  allDay: boolean
  source: 'google'
}

const CACHE_KEY = 'lifepilot_gcal_cache'

function cached(): GCalEvent[] {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]') } catch { return [] }
}
function setCache(events: GCalEvent[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(events))
}

async function gFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = getGoogleToken()
  if (!token) throw new TokenExpiredError()
  const res = await fetch(url, {
    ...options,
    headers: { ...options?.headers, Authorization: `Bearer ${token}` },
  })
  if (res.status === 401 || res.status === 403) throw new TokenExpiredError()
  return res
}

function parseGCalEvent(raw: Record<string, unknown>): GCalEvent {
  const start = raw.start as { dateTime?: string; date?: string }
  const end   = raw.end   as { dateTime?: string; date?: string }
  const allDay = !start.dateTime
  return {
    id: String(raw.id ?? ''),
    title: String(raw.summary ?? '(Sin título)'),
    start: (start.dateTime ?? start.date ?? '') as string,
    end:   (end.dateTime   ?? end.date   ?? '') as string,
    color: undefined,
    description: raw.description ? String(raw.description) : undefined,
    allDay,
    source: 'google',
  }
}

export async function getCalendarEvents(daysAhead = 7): Promise<GCalEvent[]> {
  const now    = new Date()
  const future = new Date(now.getTime() + daysAhead * 86_400_000)
  const params = new URLSearchParams({
    timeMin:      now.toISOString(),
    timeMax:      future.toISOString(),
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '50',
  })
  try {
    const res  = await gFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`)
    const data = await res.json() as { items?: Record<string, unknown>[] }
    const events = (data.items ?? []).map(parseGCalEvent)
    setCache(events)
    return events
  } catch (err) {
    if (err instanceof TokenExpiredError) throw err
    return cached()
  }
}

export async function getTodayEvents(): Promise<GCalEvent[]> {
  const todayStr = new Date().toISOString().slice(0, 10)
  const events   = await getCalendarEvents(1)
  return events.filter(e => e.start.startsWith(todayStr))
}

export async function getMonthEvents(year: number, month: number): Promise<GCalEvent[]> {
  const start = new Date(year, month, 1)
  const end   = new Date(year, month + 1, 0, 23, 59, 59)
  const params = new URLSearchParams({
    timeMin:      start.toISOString(),
    timeMax:      end.toISOString(),
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '100',
  })
  try {
    const res  = await gFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`)
    const data = await res.json() as { items?: Record<string, unknown>[] }
    return (data.items ?? []).map(parseGCalEvent)
  } catch (err) {
    if (err instanceof TokenExpiredError) throw err
    return []
  }
}

export async function createCalendarEvent(
  title: string,
  start: Date,
  end: Date,
  description?: string,
): Promise<GCalEvent> {
  const res = await gFetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary:     title,
        description: description,
        start: { dateTime: start.toISOString() },
        end:   { dateTime: end.toISOString() },
      }),
    },
  )
  const data = await res.json() as Record<string, unknown>
  return parseGCalEvent(data)
}
