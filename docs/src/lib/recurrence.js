// ---------------------------------------------------------------------------
// Recurrence — pure date math, no network, no timezone surprises.
// All dates are handled as local-time YYYY-MM-DD strings, matching the rest of
// the app (a `date` column in Postgres, never a timestamp).
// ---------------------------------------------------------------------------

export const UNITS = [
  { value: 'day', label: 'day' },
  { value: 'week', label: 'week' },
  { value: 'month', label: 'month' },
  { value: 'year', label: 'year' },
]

export const WEEKDAYS = [
  { value: 0, short: 'S', label: 'Sunday' },
  { value: 1, short: 'M', label: 'Monday' },
  { value: 2, short: 'T', label: 'Tuesday' },
  { value: 3, short: 'W', label: 'Wednesday' },
  { value: 4, short: 'T', label: 'Thursday' },
  { value: 5, short: 'F', label: 'Friday' },
  { value: 6, short: 'S', label: 'Saturday' },
]

export function parseISO(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

// Adding a month to Jan 31 should land on Feb 28/29, not spill into March.
export function addMonthsClamped(date, n) {
  const targetDay = date.getDate()
  const d = new Date(date.getFullYear(), date.getMonth() + n, 1)
  const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(targetDay, daysInTarget))
  return d
}

export function isRecurring(task) {
  return Boolean(task?.recurrence_unit)
}

/**
 * Advance one interval from `from`.
 * For weekly-with-specific-days, step to the next selected weekday; when the
 * week rolls over, skip ahead by (interval - 1) extra weeks.
 */
function advanceOnce(from, task) {
  const interval = Math.max(1, task.recurrence_interval || 1)
  const unit = task.recurrence_unit
  const days = Array.isArray(task.recurrence_days) ? [...task.recurrence_days].sort((a, b) => a - b) : []

  if (unit === 'week' && days.length > 0) {
    const currentDow = from.getDay()
    const nextDow = days.find((d) => d > currentDow)
    if (nextDow !== undefined) {
      // Still more selected days left in this week.
      return addDays(from, nextDow - currentDow)
    }
    // Wrap to the first selected day of a later week.
    const daysToSunday = 7 - currentDow
    const wrapped = addDays(from, daysToSunday + days[0])
    return interval > 1 ? addDays(wrapped, (interval - 1) * 7) : wrapped
  }

  switch (unit) {
    case 'day':
      return addDays(from, interval)
    case 'week':
      return addDays(from, interval * 7)
    case 'month':
      return addMonthsClamped(from, interval)
    case 'year':
      return addMonthsClamped(from, interval * 12)
    default:
      return addDays(from, interval)
  }
}

/**
 * The next due date after completing a recurring task.
 *
 * anchor 'schedule'   — count from the date it was *due* (rent on the 1st stays
 *                       on the 1st even if you paid late)
 * anchor 'completion' — count from the date you actually *did* it (water the
 *                       plants 5 days after the last watering)
 *
 * With the schedule anchor, a long-neglected task keeps advancing until it
 * lands in the future — otherwise a daily task ignored for a month would just
 * come back still overdue.
 */
export function computeNextDue(task, completedOnISO) {
  const completedOn = parseISO(completedOnISO)
  const anchor = task.recurrence_anchor || 'schedule'

  let cursor
  if (anchor === 'completion' || !task.due_date) {
    cursor = completedOn
  } else {
    cursor = parseISO(task.due_date)
  }

  let next = advanceOnce(cursor, task)

  // Don't hand back a date that's already gone. For fixed-length intervals
  // (daily, and weekly without specific days) the catch-up is arithmetic —
  // the old loop capped out at 400 steps, so a daily task neglected for more
  // than ~13 months came back with a date still in the past.
  const interval = Math.max(1, task.recurrence_interval || 1)
  const days = Array.isArray(task.recurrence_days) ? task.recurrence_days : []
  const fixedStep =
    task.recurrence_unit === 'day'
      ? interval
      : task.recurrence_unit === 'week' && days.length === 0
        ? interval * 7
        : null
  if (fixedStep && next <= completedOn) {
    // Math.round absorbs the ±1h a DST boundary adds to a local-date diff.
    const behind = Math.round((completedOn - next) / 86400000)
    next = addDays(next, (Math.floor(behind / fixedStep) + 1) * fixedStep)
  }

  // Variable-length intervals (months, years, weekly-on-days) still iterate;
  // even monthly needs 400 steps to cover 33 years, so the guard is ample.
  let guard = 0
  while (next <= completedOn && guard < 400) {
    next = advanceOnce(next, task)
    guard++
  }

  return toISO(next)
}

/** Human-readable summary, e.g. "Every 2 weeks on Mon, Thu · from completion" */
export function describeRecurrence(task) {
  if (!isRecurring(task)) return null
  const interval = Math.max(1, task.recurrence_interval || 1)
  const unit = task.recurrence_unit
  const days = Array.isArray(task.recurrence_days) ? [...task.recurrence_days].sort((a, b) => a - b) : []

  let base
  if (interval === 1) {
    base = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[unit] || 'Repeats'
  } else {
    base = `Every ${interval} ${unit}s`
  }

  if (unit === 'week' && days.length > 0) {
    const names = days.map((d) => WEEKDAYS[d].label.slice(0, 3))
    base += ` on ${names.join(', ')}`
  }

  if ((task.recurrence_anchor || 'schedule') === 'completion') {
    base += ' · after each completion'
  }

  return base
}

/** Short label for dense rows, e.g. "2w" or "1mo" */
export function shortRecurrence(task) {
  if (!isRecurring(task)) return null
  const interval = Math.max(1, task.recurrence_interval || 1)
  const suffix = { day: 'd', week: 'w', month: 'mo', year: 'y' }[task.recurrence_unit] || ''
  return `${interval}${suffix}`
}
