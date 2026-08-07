// ---------------------------------------------------------------------------
// Scheduling through iOS.
//
// The web build reminds by checking once a minute while alive (runCheck). The
// native wrapper does better: it hands the next week of reminders to iOS as
// scheduled local notifications, which fire with the app fully closed. The
// trade-off is staleness — a scheduled notification can't recount what's due
// at delivery time — so the whole set is thrown away and rebuilt from fresh
// data every time the app loads, resumes, or the prefs change.
// ---------------------------------------------------------------------------

import { isNative } from './platform'
import { buildNotificationPlan } from './notifications'

// The latest requested state always wins. A sync can be requested while one
// is mid-flight (a flush replaying edits fires several in a row); dropping
// the newer request would leave iOS holding schedules built from stale data —
// including reminders for tasks that just got completed. So requests overwrite
// a single slot, and the running loop drains it until it's empty.
let pendingArgs = null
let running = false

export async function syncNativeSchedules(args) {
  if (!isNative()) return
  pendingArgs = args
  if (running) return
  running = true
  try {
    while (pendingArgs) {
      const current = pendingArgs
      pendingArgs = null
      await doSync(current)
    }
  } catch {
    // A failed reschedule must never take the app down; the old schedules (or
    // none) simply remain until the next successful sync.
  } finally {
    running = false
  }
}

/** Cancel everything pending. For sign-out and account deletion — reminders
 *  about an account you've left (or destroyed) must not keep arriving. */
export async function clearNativeSchedules() {
  if (!isNative()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await cancelAllPending(LocalNotifications)
  } catch {
    /* nothing to clear, or the plugin is unavailable — either way, done */
  }
}

async function cancelAllPending(LocalNotifications) {
  // Everything pending is ours, so a full clear is simpler and safer than
  // diffing — a diff that missed a cancellation would nag about done work.
  const { notifications: pending } = await LocalNotifications.getPending()
  if (pending?.length) {
    await LocalNotifications.cancel({
      notifications: pending.map((n) => ({ id: n.id })),
    })
  }
}

async function doSync({ workstreams, tasksByWorkstream, prefs }) {
  const { LocalNotifications } = await import('@capacitor/local-notifications')

  await cancelAllPending(LocalNotifications)

  if (!prefs.enabled) return

  // Ask the plugin directly rather than trusting the module-level cache in
  // notifications.js: on a cold start this sync can run before the cache is
  // warmed, and a stale 'default' here would mean "cancel everything,
  // schedule nothing" — a week of silence from one lost race.
  const { display } = await LocalNotifications.checkPermissions()
  if (display !== 'granted') return

  const plan = buildNotificationPlan({ workstreams, tasksByWorkstream, prefs })
  if (!plan.length) return

  await LocalNotifications.schedule({
    notifications: plan.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      schedule: {
        at: new Date(`${n.date}T${n.time}:00`),
      },
      // One thread per day, so a busy morning collapses into a neat group
      // in Notification Center instead of a wall.
      threadIdentifier: n.date,
    })),
  })
}
