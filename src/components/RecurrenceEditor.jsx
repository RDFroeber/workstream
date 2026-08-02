import { Repeat, X } from 'lucide-react'
import { UNITS, WEEKDAYS, describeRecurrence } from '../lib/recurrence'

/**
 * Editor for a task's repeat rule. Controlled — every change writes straight
 * through to the task via onChange.
 */
export default function RecurrenceEditor({ task, onChange }) {
  const active = Boolean(task.recurrence_unit)
  const unit = task.recurrence_unit || 'week'
  const interval = task.recurrence_interval || 1
  const days = Array.isArray(task.recurrence_days) ? task.recurrence_days : []
  const anchor = task.recurrence_anchor || 'schedule'

  function enable() {
    onChange({
      recurrence_unit: 'week',
      recurrence_interval: 1,
      recurrence_days: null,
      recurrence_anchor: 'schedule',
    })
  }

  function disable() {
    onChange({ recurrence_unit: null, recurrence_days: null, recurrence_interval: 1 })
  }

  function toggleDay(d) {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b)
    onChange({ recurrence_days: next.length ? next : null })
  }

  if (!active) {
    return (
      <div className="mb-5">
        <label className="block text-xs font-medium text-muted mb-2">Repeat</label>
        <button
          onClick={enable}
          className="text-xs font-medium text-muted hover:text-ink border border-dashed border-hairlineStrong rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5"
        >
          <Repeat size={13} /> Make this repeat
        </button>
      </div>
    )
  }

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-muted">Repeat</label>
        <button
          onClick={disable}
          className="text-xs text-faint hover:text-danger inline-flex items-center gap-1"
        >
          <X size={12} /> Stop repeating
        </button>
      </div>

      <div className="border border-hairlineStrong rounded-lg p-3 bg-white space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Every</span>
          <input
            type="number"
            min={1}
            max={365}
            value={interval}
            onChange={(e) =>
              onChange({ recurrence_interval: Math.max(1, Number(e.target.value) || 1) })
            }
            className="w-16 rounded-lg border border-hairlineStrong px-2 py-1.5 text-sm text-ink text-center outline-none focus:border-accent"
          />
          <select
            value={unit}
            onChange={(e) =>
              onChange({
                recurrence_unit: e.target.value,
                // weekday picks only make sense for weekly
                recurrence_days: e.target.value === 'week' ? task.recurrence_days : null,
              })
            }
            className="flex-1 rounded-lg border border-hairlineStrong px-2 py-1.5 text-sm text-ink bg-white outline-none focus:border-accent"
          >
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {interval === 1 ? u.label : `${u.label}s`}
              </option>
            ))}
          </select>
        </div>

        {unit === 'week' && (
          <div>
            <p className="text-xs text-muted mb-1.5">On these days (optional)</p>
            <div className="flex gap-1">
              {WEEKDAYS.map((d) => {
                const on = days.includes(d.value)
                return (
                  <button
                    key={d.value}
                    onClick={() => toggleDay(d.value)}
                    aria-label={d.label}
                    aria-pressed={on}
                    className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                      on
                        ? 'bg-accent text-white'
                        : 'bg-transparent text-muted border border-hairlineStrong hover:border-ink'
                    }`}
                  >
                    {d.short}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs text-muted mb-1.5">Count the next one from</p>
          <div className="grid grid-cols-2 gap-1.5">
            <AnchorOption
              active={anchor === 'schedule'}
              onClick={() => onChange({ recurrence_anchor: 'schedule' })}
              title="Its due date"
              hint="Stays on schedule even if you finish late"
            />
            <AnchorOption
              active={anchor === 'completion'}
              onClick={() => onChange({ recurrence_anchor: 'completion' })}
              title="When I finish it"
              hint="Next one is counted from today"
            />
          </div>
        </div>

        <p className="text-xs text-accent bg-accentSoft rounded-lg px-2.5 py-2">
          {describeRecurrence({ ...task, recurrence_unit: unit })}
          {task.recurrence_count > 0 && (
            <span className="text-muted">
              {' '}
              · done {task.recurrence_count}×
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

function AnchorOption({ active, onClick, title, hint }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border px-2.5 py-2 transition-colors ${
        active ? 'border-accent bg-accentSoft' : 'border-hairlineStrong hover:border-ink'
      }`}
    >
      <span className="block text-xs font-medium text-ink">{title}</span>
      <span className="block text-[11px] text-muted leading-snug mt-0.5">{hint}</span>
    </button>
  )
}
