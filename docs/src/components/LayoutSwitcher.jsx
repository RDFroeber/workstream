import { LayoutGrid, CalendarRange, Columns2, Rows3 } from 'lucide-react'

export const LAYOUTS = [
  { id: 'list', label: 'List', Icon: Rows3, hint: 'One line per row' },
  { id: 'grid', label: 'Grid', Icon: LayoutGrid, hint: 'Cards, with the next few actions' },
  { id: 'timeline', label: 'Timeline', Icon: CalendarRange, hint: 'Everything against a date axis' },
  { id: 'split', label: 'Split', Icon: Columns2, hint: 'Lines beside the open one' },
]

/**
 * Desktop layout picker. Hidden below the tablet breakpoint — the stacked list
 * is the right answer on a phone and there's nothing to choose between.
 */
export default function LayoutSwitcher({ value, onChange }) {
  return (
    <div
      role="radiogroup"
      aria-label="Layout"
      className="hidden md:inline-flex items-center gap-0.5 rounded-full border border-hairline p-0.5"
    >
      {LAYOUTS.map(({ id, label, Icon, hint }) => {
        const active = value === id
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={`${label} — ${hint}`}
            onClick={() => onChange(id)}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium transition-colors ${
              active ? 'bg-ink text-panel' : 'text-faint hover:text-muted'
            }`}
          >
            <Icon size={13} strokeWidth={2.2} />
            <span className="hidden lg:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
