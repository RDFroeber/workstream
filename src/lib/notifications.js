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
      const item = node.item_type === 'sequence' ? node.nextStep : node
      if (!item || item.status === 'done' || !item.due_date) continue
      if (item.due_date < today) overdue.push({ item, ws })
      else if (item.due_date === today) dueToday.push({ item, ws })
    }
  }
  return { overdue, dueToday }
}

function show(title, body, tag) {
  try {
    // Through the service worker when possible, so the notification survives
    // the page being backgrounded.
    if (navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(title, { body, tag, icon: './icon-192.png', badge: './icon-192.png' }))
        .catch(() => new Notification(title, { body, tag }))
      return true
    }
    new Notification(title, { body, tag, icon: './icon-192.png' })
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
