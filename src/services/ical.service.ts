import { fetchWithCorsProxy } from '@/lib/cors-proxy'

const DEFAULT_URL = 'https://p129-caldav.icloud.com/published/2/NDEyMjgxMzAyNDEyMjgxMw4vhUTJs67jeqBZcAXkEN1UPUWQcn2AmZAM5LbiBqRm'
const URL_KEY     = 'lifepilot_ical_url'
const CACHE_KEY   = 'lifepilot_ical_cache'
const CACHE_TTL   = 15 * 60 * 1000  // 15 min

export interface ICalEvent {
  id: string
  title: string
  start: Date
  end: Date
  location?: string
  description?: string
  isAllDay: boolean
}

interface Cache {
  events: SerializedEvent[]
  fetchedAt: number
}

interface SerializedEvent {
  id: string; title: string; start: string; end: string
  location?: string; description?: string; isAllDay: boolean
}

export function getICalUrl(): string {
  return localStorage.getItem(URL_KEY)?.trim() || DEFAULT_URL
}

export function saveICalUrl(url: string) {
  localStorage.setItem(URL_KEY, url.trim())
}

function serialize(ev: ICalEvent): SerializedEvent {
  return { ...ev, start: ev.start.toISOString(), end: ev.end.toISOString() }
}

function deserialize(ev: SerializedEvent): ICalEvent {
  return { ...ev, start: new Date(ev.start), end: new Date(ev.end) }
}

function loadCache(): Cache | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') } catch { return null }
}

function saveCache(events: ICalEvent[]) {
  const cache: Cache = { events: events.map(serialize), fetchedAt: Date.now() }
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
}

function getCachedEvents(): ICalEvent[] {
  const c = loadCache()
  return c ? c.events.map(deserialize) : []
}

// ── iCal text parser ──────────────────────────────────────────────────────────

function unfold(text: string): string {
  // Join lines that start with space or tab (RFC 5545 line folding)
  return text.replace(/\r?\n[ \t]/g, '')
}

function unescape(val: string): string {
  return val.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, '\n').replace(/\\\\/g, '\\')
}

function parseDate(val: string, params: string): { date: Date; isAllDay: boolean } {
  const isAllDayVal = params.includes('VALUE=DATE')

  // All-day: YYYYMMDD
  if (isAllDayVal || /^\d{8}$/.test(val)) {
    const y = +val.slice(0, 4), m = +val.slice(4, 6) - 1, d = +val.slice(6, 8)
    return { date: new Date(y, m, d), isAllDay: true }
  }

  // UTC: YYYYMMDDTHHmmssZ
  if (val.endsWith('Z')) {
    const y = +val.slice(0, 4), mo = +val.slice(4, 6) - 1, d = +val.slice(6, 8)
    const h = +val.slice(9, 11), mi = +val.slice(11, 13), s = +val.slice(13, 15)
    return { date: new Date(Date.UTC(y, mo, d, h, mi, s)), isAllDay: false }
  }

  // Local / TZID: YYYYMMDDTHHmmss — treat as browser local (Daniel is in Spain = Europe/Madrid)
  const y = +val.slice(0, 4), mo = +val.slice(4, 6) - 1, d = +val.slice(6, 8)
  const h = +val.slice(9, 11), mi = +val.slice(11, 13), s = +val.slice(13, 15)
  return { date: new Date(y, mo, d, h, mi, s), isAllDay: false }
}

function parseICalText(text: string): ICalEvent[] {
  const lines = unfold(text).split(/\r?\n/)
  const events: ICalEvent[] = []
  let cur: Partial<ICalEvent & { _startParams: string }> | null = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue }
    if (line === 'END:VEVENT') {
      if (cur?.title && cur.start) {
        events.push({
          id:          cur.id ?? `ical-${Math.random().toString(36).slice(2)}`,
          title:       cur.title,
          start:       cur.start,
          end:         cur.end ?? cur.start,
          location:    cur.location,
          description: cur.description,
          isAllDay:    cur.isAllDay ?? false,
        })
      }
      cur = null
      continue
    }
    if (!cur) continue

    const colon = line.indexOf(':')
    if (colon === -1) continue
    const propFull = line.slice(0, colon)   // e.g. "DTSTART;TZID=Europe/Madrid"
    const val      = line.slice(colon + 1)
    const semi     = propFull.indexOf(';')
    const name     = (semi === -1 ? propFull : propFull.slice(0, semi)).toUpperCase()
    const params   = semi === -1 ? '' : propFull.slice(semi + 1).toUpperCase()

    switch (name) {
      case 'SUMMARY':     cur.title       = unescape(val); break
      case 'LOCATION':    cur.location    = unescape(val); break
      case 'DESCRIPTION': cur.description = unescape(val); break
      case 'UID':         cur.id          = val; break
      case 'DTSTART': {
        const { date, isAllDay } = parseDate(val, params)
        cur.start = date; cur.isAllDay = isAllDay
        break
      }
      case 'DTEND': {
        const { date } = parseDate(val, params)
        cur.end = date
        break
      }
    }
  }

  return events
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchICalEvents(forceRefresh = false): Promise<ICalEvent[]> {
  // Check cache
  const cache = loadCache()
  if (!forceRefresh && cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.events.map(deserialize)
  }

  const url = getICalUrl()

  try {
    const res = await fetchWithCorsProxy(url, { headers: { Accept: 'text/calendar' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Not a valid iCal feed')
    const events = parseICalText(text)
    saveCache(events)
    return events
  } catch (err) {
    // On failure, return stale cache if available
    if (cache) return cache.events.map(deserialize)
    throw err
  }
}

// ── Derived queries ───────────────────────────────────────────────────────────

function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function todayStr(): string {
  return dayStr(new Date())
}

export async function getTodayICalEvents(): Promise<ICalEvent[]> {
  const all = await fetchICalEvents()
  const t = todayStr()
  return all
    .filter(e => dayStr(e.start) === t)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

export async function getUpcomingICalEvents(days = 7): Promise<ICalEvent[]> {
  const all    = await fetchICalEvents()
  const now    = new Date()
  const future = new Date(now.getTime() + days * 86_400_000)
  return all
    .filter(e => e.start >= now && e.start <= future)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

export async function getMonthICalEvents(year: number, month: number): Promise<ICalEvent[]> {
  const all   = await fetchICalEvents()
  const start = new Date(year, month, 1)
  const end   = new Date(year, month + 1, 0, 23, 59, 59)
  return all.filter(e => e.start >= start && e.start <= end)
}

// ── Connection test ───────────────────────────────────────────────────────────

export async function testICalUrl(url: string): Promise<string | null> {
  try {
    const res  = await fetchWithCorsProxy(url, { headers: { Accept: 'text/calendar' } })
    if (!res.ok) return `Error HTTP ${res.status}`
    const text = await res.text()
    if (!text.includes('BEGIN:VCALENDAR')) return 'La URL no contiene un calendario iCal válido'
    const events = parseICalText(text)
    return events.length > 0 ? null : 'Conectado — calendario vacío'
  } catch (err) {
    return err instanceof Error ? err.message : 'Error de conexión'
  }
}

export function getLastSyncTime(): Date | null {
  const c = loadCache()
  return c ? new Date(c.fetchedAt) : null
}
