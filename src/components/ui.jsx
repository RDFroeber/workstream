import { formatDue } from '../lib/dates'

const STATUS_META = {
  active: { label: 'Active', dot: '#1E8A6E' },
  at_risk: { label: 'At risk', dot: '#B8790F' },
  blocked: { label: 'Blocked', dot: '#C0392B' },
  done: { label: 'Done', dot: '#6B7685' },
  archived: { label: 'Archived', dot: '#9AA3B0' },
}

export function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.active
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  )
}

export const STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, m]) => ({
  value,
  label: m.label,
}))

export function DueBadge({ date, className = '' }) {
  const due = formatDue(date)
  if (!due) return null
  const toneClasses = {
    overdue: 'text-danger bg-red-50 border-red-100',
    due: 'text-danger bg-red-50 border-red-100',
    soon: 'text-warn bg-amber-50 border-amber-100',
    later: 'text-muted bg-transparent border-hairline',
  }
  return (
    <span
      className={`inline-flex items-center text-[11px] font-mono font-medium px-1.5 py-0.5 rounded border ${toneClasses[due.tone]} ${className}`}
    >
      {due.label}
    </span>
  )
}

export function IconButton({ children, className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:text-ink hover:bg-black/5 transition-colors ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
