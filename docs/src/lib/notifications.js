// ---------------------------------------------------------------------------
// Local notifications
//
// These are local, not push — there's no server. What that means differs by
// platform:
//
// WEB: the app can only raise a notification while its page or service worker
// is alive — "open in a tab", "installed and backgrounded recently", and the
// moment you next open it, but NOT "closed for two days". `runCheck` is the
// once-a-minute tick that does this.
//
// NATIVE (the iOS wrapper): iOS delivers scheduled local notifications with
// the app fully closed, so instead of a tick the app plans the next week of
// reminders (`buildNotificationPlan`) and hands them to the system every time
// it has fresh data — see nativeNotifications.js. The honest limitation
// changes shape: reminders keep firing for a week without opening the app,
// then stop until the next open.
//
// The settings panel states whichever limitation applies rather than implying
// the app will nag you reliably forever.
// ---------------------------------------------------------------------------

import { Capacitor } from '@capacitor/core'
import { todayISO } from './dates'
import { buildWorkstreamTree } from './api'
import { isNative } from './platform'

const PREFS_KEY = 'lines-notify-prefs'
const SENT_KEY = 'lines-notify-sent'

export const DEFAULT_PREFS = {
  enabled: false,
  dailyTime: '09:00', // local clock time for the morning summary
  perTask: true, // also notify when an individual task falls due
}

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private browsing — preferences just won't persist */
  }
}

// The webview inside the iOS wrapper has no Notification API at all, so the
// native path goes through the LocalNotifications plugin instead. The plugin
// is async-only, so its answer is cached here and warmed by initNotifications
// at startup; the rest of the app keeps the same synchronous vocabulary
// ('default' | 'granted' | 'denied') either way.
let nativePermissionCache = 'default'

function mapNativePermission(display) {
  if (display === 'granted') return 'granted'
  if (display === 'denied') return 'denied'
  return 'default' // 'prompt' / 'prompt-with-rationale'
}

/** Call once at startup. A no-op on the web. */
export async function initNotifications() {
  if (!isNative()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const { display } = await LocalNotifications.checkPermissions()
    nativePermissionCache = mapNativePermission(display)
  } catch {
    nativePermissionCache = 'denied'
  }
}

export function supported() {
  if (isNative()) return true
  return typeof window !== 'undefined' && 'Notification' in window
}

export function permission() {
  if (isNative()) return nativePermissionCache
  return supported() ? Notification.permission : 'unsupported'
}

export async function requestPermission() {
  if (isNative()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const { display } = await LocalNotifications.requestPermissions()
      nativePermissionCache = mapNativePermission(display)
      return nativePermissionCache
    } catch {
      nativePermissionCache = 'denied'
      return 'denied'
    }
  }
  if (!supported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export function getPrefs() {
  return { ...DEFAULT_PREFS, ...read(PREFS_KEY, {}) }
}

export function setPrefs(patch) {
  const next = { ...getPrefs(), ...patch }
  write(PREFS_KEY, next)
  return next
}

// --- de-duplication --------------------------------------------------------
// Keyed by day so a reminder fires once per task per day, not on every tick.

function sentLog() {
  const log = read(SENT_KEY, {})
  const today = todayISO()
  // Drop anything from previous days so this can't grow forever.
  const pruned = Object.fromEntries(Object.entries(log).filter(([k]) => k.endsWith(today)))
  return pruned
}

function markSent(key) {
  const log = sentLog()
  log[key] = Date.now()
  write(SENT_KEY, log)
}

function alreadySent(key) {
  return key in sentLog()
}

export function resetSentLog() {
  write(SENT_KEY, {})
}

// --- what's actually due ---------------------------------------------------

/**
 * Flatten to the items a reminder would be about: incomplete, dated, and
 * either overdue or due today. Sequences contribute their current step only —
 * being told about step 5 of something you haven't started is noise.
 */
export function dueItems(workstreams, tasksByWorkstream, today = todayISO()) {
  const overdue = []
  const dueToday = []

  for (const ws of workstreams) {
    if (ws.status === 'archived') continue
    const tree = buildWorkstreamTree(tasksByWorkstream[ws.id] || [])
    for (const node of tree) {
      let item
      if (node.item_type === 'sequence') {
        // Fall back to the sequence itself when the current step carries no
        // date. A recurring checklist keeps its date on the container and
        // leaves the steps undated, so keying only off the step meant those
        // never produced a reminder at all.
        item = node.nextStep?.due_date ? node.nextStep : node.due_date ? node : null
      } else {
        item = node
      }
      if (!item || item.status === 'done' || !item.due_date) continue
      if (item.due_date < today) overdue.push({ item, ws })
      else if (item.due_date === today) dueToday.push({ item, ws })
    }
  }
  return { overdue, dueToday }
}

function show(title, body, tag) {
  const options = { body, tag, icon: './icon-192.png', badge: './icon-192.png' }
  try {
    // Prefer the service worker: a notification raised through it survives the
    // page being backgrounded, and on iOS it's the only way that works.
    //
    // `serviceWorker.ready` never settles when nothing is registered — not
    // resolved, not rejected — so awaiting it directly meant no notification
    // and no fallback at all in dev, or on any load before the worker
    // activates. Racing it against a short timer keeps that from swallowing
    // the reminder silently.
    if (navigator.serviceWorker?.controller) {
      Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('no worker')), 1500)),
      ])
        .then((reg) => reg.showNotification(title, options))
        .catch(() => {
          try {
            new Notification(title, options)
          } catch {
            /* Safari refuses the constructor outside a worker; nothing else to try */
          }
        })
      return true
    }
    new Notification(title, options)
    return true
  } catch {
    return false
  }
}

/**
 * One tick of the reminder loop. Pure-ish: give it the data and the clock and
 * it decides what, if anything, to raise. Returns what it fired, for testing.
 */
export function runCheck({ workstreams, tasksByWorkstream, prefs, now = new Date(), emit = show }) {
  if (!prefs.enabled || permission() !== 'granted') return []
  const today = todayISO()
  const { overdue, dueToday } = dueItems(workstreams, tasksByWorkstream, today)
  const fired = []

  // Daily summary, once the clock passes the chosen time.
  const [h, m] = (prefs.dailyTime || '09:00').split(':').map(Number)
  const past = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)
  const summaryKey = `summary:${today}`
  if (past && !alreadySent(summaryKey) && (overdue.length || dueToday.length)) {
    const parts = []
    if (overdue.length) parts.push(`${overdue.length} overdue`)
    if (dueToday.length) parts.push(`${dueToday.length} due today`)
    const lines = [...new Set([...overdue, ...dueToday].map((x) => x.ws.name))]
    emit(
      `Lines — ${parts.join(', ')}`,
      lines.slice(0, 4).join(' · ') + (lines.length > 4 ? ` and ${lines.length - 4} more` : ''),
      summaryKey
    )
    markSent(summaryKey)
    fired.push(summaryKey)
  }

  // Individual tasks, once each per day.
  if (prefs.perTask) {
    for (const { item, ws } of [...overdue, ...dueToday]) {
      const key = `task:${item.id}:${today}`
      if (alreadySent(key)) continue
      // Don't double-notify for things the summary just covered.
      if (fired.includes(summaryKey)) {
        markSent(key)
        continue
      }
      if (!past) continue
      emit(ws.name, item.title, key)
      markSent(key)
      fired.push(key)
    }
  }

  return fired
}


// --- native scheduling plan -------------------------------------------------

/**
 * Deterministic int32 id for a scheduled notification. iOS requires numeric
 * ids, and deriving them from content (rather than counting up) means the
 * same reminder always gets the same id across reschedules.
 */
export function hashId(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0
  }
  // Into [1000, 2^31 - 1]: notification ids are bridged as SIGNED 32-bit
  // ints, so the ceiling is 2147483647 — the modulus leaves headroom for the
  // +1000 floor. (An earlier version used (h >>> 1) + 1000, which can land
  // ~1000 above the ceiling and get mangled in the bridge.)
  return ((h >>> 0) % 2147482647) + 1000
}

const shiftISO = (iso, days) => {
  const d = new Date(iso + 'T12:00:00') // noon dodges DST edges
  d.setDate(d.getDate() + days)
  return todayISO(d)
}

/**
 * The week of reminders the app would want iOS to deliver, computed from the
 * data it has right now. Pure: give it the data, the prefs and the clock and
 * it returns [{ id, title, body, date: 'YYYY-MM-DD', time: 'HH:MM' }].
 *
 * Scheduled notifications are static — iOS can't recount what's overdue at
 * delivery time — so each day's summary is precomputed on the assumption that
 * nothing gets completed in between. Opening the app reschedules everything
 * from fresh data, which keeps the lie small. The horizon is a week: past
 * that, unopened, the numbers would be pure fiction.
 *
 * iOS caps pending local notifications at 64 per app, so the plan stays well
 * under it: at most 7 summaries + `limit` per-task entries.
 */
export function buildNotificationPlan({
  workstreams,
  tasksByWorkstream,
  prefs,
  now = new Date(),
  horizonDays = 7,
  limit = 40,
}) {
  if (!prefs.enabled) return []
  const [h, m] = (prefs.dailyTime || '09:00').split(':').map(Number)
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const today = todayISO(now)
  const pastToday = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)

  const plan = []
  let perTaskBudget = limit

  for (let offset = 0; offset < horizonDays; offset++) {
    // Today's slot only exists if the chosen time hasn't passed — the user is
    // in the app right now, which is itself the reminder.
    if (offset === 0 && pastToday) continue
    const day = offset === 0 ? today : shiftISO(today, offset)
    const { overdue, dueToday } = dueItems(workstreams, tasksByWorkstream, day)
    if (!overdue.length && !dueToday.length) continue

    const parts = []
    if (overdue.length) parts.push(`${overdue.length} overdue`)
    if (dueToday.length) parts.push(`${dueToday.length} due`)
    const lineNames = [...new Set([...overdue, ...dueToday].map((x) => x.ws.name))]
    plan.push({
      id: hashId(`summary:${day}`),
      title: `Lines — ${parts.join(', ')}`,
      body:
        lineNames.slice(0, 4).join(' · ') +
        (lineNames.length > 4 ? ` and ${lineNames.length - 4} more` : ''),
      date: day,
      time,
    })

    // Individual tasks on the day they fall due. Overdue carry-overs stay in
    // the summary only — repeating each one daily would burn through iOS's
    // 64-notification budget in one bad week.
    if (prefs.perTask) {
      for (const { item, ws } of dueToday) {
        if (perTaskBudget <= 0) break
        plan.push({
          id: hashId(`task:${item.id}:${day}`),
          title: ws.name,
          body: item.title,
          date: day,
          time,
        })
        perTaskBudget--
      }
    }
  }
  return plan
}
