/**
 * Today as a local-time YYYY-MM-DD string.
 *
 * Not `toISOString().slice(0, 10)` — that is the UTC date, and for anyone west
 * of UTC it rolls over hours before midnight. The app's dates are all local
 * (see the note in recurrence.js), and the UTC version made the Today view,
 * the reminders and recurrence all flip to "tomorrow" at 8pm Eastern while the
 * due badges — computed locally — still said "Today".
 */
export function todayISO(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDue(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  const diffDays = Math.round((d - today) / 86400000)

  if (diffDays === 0) return { label: 'Today', tone: 'due' }
  if (diffDays === 1) return { label: 'Tomorrow', tone: 'soon' }
  if (diffDays > 1 && diffDays <= 6) return { label: `In ${diffDays}d`, tone: 'soon' }
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, tone: 'overdue' }
  return {
    label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    tone: 'later',
  }
}
