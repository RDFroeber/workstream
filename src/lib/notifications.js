// ---------------------------------------------------------------------------
// Local notifications
//
// These are local, not push. There's no server, so the app can only raise a
// notification while its page or service worker is alive — that covers "open in
// a tab", "installed and backgrounded recently", and the moment you next open
// it, but NOT "closed for two days". Real background delivery needs Web Push
// with a VAPID server, which is a different piece of infrastructure.
//
// The app is honest about this in the settings panel rather than implying it
// will nag you reliably.
// ---------------------------------------------------------------------------

import { todayISO } from './dates'
import { buildWorkstreamTree } from './api'

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

export function supported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function permission() {
  return supported() ? Notification.permission : 'unsupported'
}

export async function requestPermission() {
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
