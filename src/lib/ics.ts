const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function pad(n: number) { return String(n).padStart(2, '0') }

function iCalDate(d: Date) {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  )
}

function nextOccurrence(dayOfWeek: number, hour: number, minute: number): Date {
  const now    = new Date()
  const target = new Date()
  target.setHours(hour, minute, 0, 0)
  const diff        = (dayOfWeek - now.getDay() + 7) % 7
  const sameAndPast = diff === 0 && now >= target
  target.setDate(target.getDate() + (sameAndPast ? 7 : diff))
  return target
}

export function generateICS(
  title: string,
  body: string,
  dayOfWeek: number,
  hour: number,
  minute: number,
) {
  const dtstart = nextOccurrence(dayOfWeek, hour, minute)
  const dtend   = new Date(dtstart.getTime() + 15 * 60 * 1000)

  const uid = `lifepilot-${dayOfWeek}-${hour}-${minute}@lifepilot`

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LifePilot//LifePilot//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART;TZID=Europe/Madrid:${iCalDate(dtstart)}`,
    `DTEND;TZID=Europe/Madrid:${iCalDate(dtend)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[dayOfWeek]}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${body.replace(/\n/g, '\\n')}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT0M',
    `DESCRIPTION:${title}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
