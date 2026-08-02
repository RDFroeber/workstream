export function todayISO() {
  return new Date().toISOString().slice(0, 10)
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
