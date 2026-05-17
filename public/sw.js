// ── IndexedDB helpers ─────────────────────────────────────────────────────────
const DB_NAME = 'lifepilot_sw'
const DB_VER  = 1
const STORE   = 'alarms'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess  = e => resolve(e.target.result)
    req.onerror    = e => reject(e.target.error)
  })
}

function dbGetAll(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

function dbPut(db, record) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(record)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

function dbClear(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = resolve
    tx.onerror    = () => reject(tx.error)
  })
}

// ── Next fire timestamp (mirrors notifications.service.ts logic) ──────────────
function nextFireTs(hour, minute, dayOfWeek) {
  const now    = new Date()
  const target = new Date()
  target.setHours(hour, minute, 0, 0)

  if (dayOfWeek != null) {
    const diff      = (dayOfWeek - now.getDay() + 7) % 7
    const sameAndPast = diff === 0 && now >= target
    target.setDate(target.getDate() + (sameAndPast ? 7 : diff))
  } else {
    if (now >= target) target.setDate(target.getDate() + 1)
  }
  return target.getTime()
}

// ── Check and fire due alarms ─────────────────────────────────────────────────
async function checkAndFireAlarms() {
  const db     = await openDB()
  const alarms = await dbGetAll(db)
  const now    = Date.now()

  for (const alarm of alarms) {
    if (alarm.fireAt > now) continue
    await self.registration.showNotification(alarm.title, {
      body:  alarm.body,
      tag:   alarm.id,
      icon:  alarm.icon || '/favicon.svg',
      badge: alarm.icon || '/favicon.svg',
    })
    // Reschedule: update fireAt to next occurrence
    const nextFire = nextFireTs(alarm.hour, alarm.minute, alarm.dayOfWeek)
    await dbPut(db, { ...alarm, fireAt: nextFire })
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
self.addEventListener('install',  () => self.skipWaiting())
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()))

// ── Messages from the app ─────────────────────────────────────────────────────
self.addEventListener('message', async event => {
  const { type, alarms } = event.data || {}
  if (type === 'SET_ALARMS') {
    const db = await openDB()
    await dbClear(db)
    for (const a of alarms) await dbPut(db, a)
  }
  if (type === 'CHECK_ALARMS') {
    await checkAndFireAlarms()
  }
})

// ── Fire alarms opportunistically whenever the app triggers a fetch ───────────
self.addEventListener('fetch', event => {
  checkAndFireAlarms().catch(() => {})
})

// ── Periodic background sync (Android Chrome / Edge) ─────────────────────────
self.addEventListener('periodicsync', event => {
  if (event.tag === 'lifepilot-alarms') event.waitUntil(checkAndFireAlarms())
})

// ── Server push (future) ──────────────────────────────────────────────────────
self.addEventListener('push', event => {
  event.waitUntil(checkAndFireAlarms())
})

// ── Notification click — focus or open the app ────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow(self.registration.scope)
    }),
  )
})
