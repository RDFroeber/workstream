import { formatDue } from '../lib/dates'

// Status dots reference theme variables rather than fixed hexes — the light
// palette's red only reaches 2.98:1 on a dark panel.
const STATUS_META = {
  active: { label: 'Active', dot: 'rgb(var(--success))' },
  at_risk: { label: 'At risk', dot: 'rgb(var(--warn))' },
  blocked: { label: 'Blocked', dot: 'rgb(var(--danger))' },
  done: { label: 'Done', dot: 'rgb(var(--muted))' },
  archived: { label: 'Archived', dot: 'rgb(var(--faint))' },
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
    overdue: 'text-danger bg-dangerSoft border-dangerBorder',
    due: 'text-danger bg-dangerSoft border-dangerBorder',
    soon: 'text-warn bg-warnSoft border-warnBorder',
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
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:text-ink hover:bg-ink/5 transition-colors ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
