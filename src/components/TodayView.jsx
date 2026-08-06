import { Sun, Circle, ListOrdered, Repeat } from 'lucide-react'
import { summarizeWorkstream } from '../lib/api'
import { isRecurring } from '../lib/recurrence'
import { todayISO } from '../lib/dates'
import { DueBadge } from './ui'
import { useLineColor } from '../lib/theme'

/**
 * The tasks the user has explicitly picked for today, newest picks last.
 *
 * A pick is a dated flag (`focus_date`), separate from the due date — choosing
 * what to work on today shouldn't rewrite the schedule. Picks from earlier
 * days carry over until the task is done or unpicked, rather than silently
 * evaporating at midnight with the work unfinished.
 *
 * Exported for tests; pure.
 */
export function pickedItems(workstreams, tasksByWorkstream, today = todayISO()) {
  const picked = []
  for (const ws of workstreams) {
    if (ws.status === 'archived') continue
    for (const t of tasksByWorkstream[ws.id] || []) {
      if (!t.focus_date || t.status === 'done' || t.item_type === 'sequence') continue
      if (t.focus_date > today) continue // a pick can't come from the future
      picked.push({ item: t, ws, carriedOver: t.focus_date < today })
    }
  }
  picked.sort((a, b) => {
    if (a.item.focus_date !== b.item.focus_date)
      return a.item.focus_date.localeCompare(b.item.focus_date)
    return (a.item.sort_order ?? 0) - (b.item.sort_order ?? 0)
  })
  return picked
}

export default function TodayView({
  workstreams,
  tasksByWorkstream,
  onOpenTask,
  onToggleStatus,
  onToggleFocus,
}) {
  const today = todayISO()

  const picked = pickedItems(workstreams, tasksByWorkstream, today)
  const pickedIds = new Set(picked.map((p) => p.item.id))

  const overdue = []
  const dueToday = []
  const nextActions = []

  for (const ws of workstreams) {
    if (ws.status === 'archived') continue
    const tasks = tasksByWorkstream[ws.id] || []
    const summary = summarizeWorkstream(tasks)
    const na = summary.nextAction
    if (!na) continue
    // Already shown in the picked section — listing it again below would make
    // the same task look like two pieces of work.
    if (pickedIds.has(na.id)) continue

    if (na.due_date && na.due_date < today) overdue.push({ item: na, ws })
    else if (na.due_date === today) dueToday.push({ item: na, ws })
    else nextActions.push({ item: na, ws })
  }

  const nothingUrgent = overdue.length === 0 && dueToday.length === 0

  return (
    <div className="max-w-2xl mx-auto px-4 pb-28 pt-5">
      <div className="flex items-center gap-2 mb-1">
        <Sun size={20} className="text-warn" />
        <h1 className="font-display font-semibold text-2xl text-ink tracking-tight">Today</h1>
      </div>
      <p className="text-sm text-muted mb-6">
        Your picks for the day, then the single next step from every active line.
      </p>

      {picked.length > 0 && (
        <Section title="Picked for today" tone="text-warn">
          {picked.map(({ item, ws, carriedOver }) => (
            <Row
              key={item.id}
              item={item}
              ws={ws}
              onOpen={onOpenTask}
              onToggleStatus={onToggleStatus}
              onToggleFocus={onToggleFocus}
              pinned
              carriedOver={carriedOver}
            />
          ))}
        </Section>
      )}

      {overdue.length > 0 && (
        <Section title="Overdue" tone="text-danger">
          {overdue.map(({ item, ws }) => (
            <Row
              key={item.id}
              item={item}
              ws={ws}
              onOpen={onOpenTask}
              onToggleStatus={onToggleStatus}
              onToggleFocus={onToggleFocus}
            />
          ))}
        </Section>
      )}

      {dueToday.length > 0 && (
        <Section title="Due today" tone="text-ink">
          {dueToday.map(({ item, ws }) => (
            <Row
              key={item.id}
              item={item}
              ws={ws}
              onOpen={onOpenTask}
              onToggleStatus={onToggleStatus}
              onToggleFocus={onToggleFocus}
            />
          ))}
        </Section>
      )}

      {nothingUrgent && picked.length === 0 && (
        <p className="text-sm text-muted mb-6 bg-accentSoft border border-hairline rounded-card px-3.5 py-3">
          Nothing overdue and nothing due today. Tap the sun on any task below to pick it for
          today's list.
        </p>
      )}

      {nextActions.length > 0 && (
        <Section title="Next up, undated" tone="text-muted">
          {nextActions.map(({ item, ws }) => (
            <Row
              key={item.id}
              item={item}
              ws={ws}
              onOpen={onOpenTask}
              onToggleStatus={onToggleStatus}
              onToggleFocus={onToggleFocus}
            />
          ))}
        </Section>
      )}

      {picked.length === 0 &&
        overdue.length === 0 &&
        dueToday.length === 0 &&
        nextActions.length === 0 && (
          <p className="text-sm text-faint text-center py-10">
            Add a line and a task to see your daily rollup here.
          </p>
        )}
    </div>
  )
}

function Section({ title, tone, children }) {
  return (
    <div className="mb-6">
      <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${tone}`}>{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({
  item,
  ws,
  onOpen,
  onToggleStatus,
  onToggleFocus,
  pinned = false,
  carriedOver = false,
}) {
  const lineColor = useLineColor()
  const isStep = item.item_type === 'step'
  return (
    <div
      onClick={() => onOpen(item)}
      className="flex items-start gap-3 bg-panel border border-hairline rounded-card px-3.5 py-3 hover:border-hairlineStrong cursor-pointer transition-colors"
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleStatus(item, 'done')
        }}
        aria-label={`Mark ${item.title} done`}
        className="mt-0.5 shrink-0"
      >
        <Circle size={18} style={{ color: lineColor(ws.color) }} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: lineColor(ws.color) }}
          />
          <span className="text-xs text-muted">{ws.name}</span>
          {isStep && <ListOrdered size={11} className="text-faint" />}
          {isRecurring(item) && <Repeat size={11} className="text-faint" />}
          {carriedOver && <span className="text-[11px] text-faint">carried over</span>}
        </div>
        <p className="text-sm text-ink mt-0.5">{item.title}</p>
      </div>
      {item.due_date && <DueBadge date={item.due_date} />}
      {onToggleFocus && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleFocus(item)
          }}
          aria-pressed={pinned}
          aria-label={pinned ? `Remove ${item.title} from today` : `Pick ${item.title} for today`}
          title={pinned ? 'Remove from today' : 'Pick for today'}
          className={`mt-0.5 shrink-0 p-0.5 transition-colors ${
            pinned ? 'text-warn' : 'text-faint/60 hover:text-warn'
          }`}
        >
          <Sun size={15} fill={pinned ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  )
}
