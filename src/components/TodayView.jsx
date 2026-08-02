import { Sun, Circle, ListOrdered, Repeat } from 'lucide-react'
import { summarizeWorkstream } from '../lib/api'
import { isRecurring } from '../lib/recurrence'
import { todayISO } from '../lib/dates'
import { DueBadge } from './ui'

export default function TodayView({ workstreams, tasksByWorkstream, onOpenTask, onToggleStatus }) {
  const today = todayISO()

  const overdue = []
  const dueToday = []
  const nextActions = []

  for (const ws of workstreams) {
    if (ws.status === 'archived') continue
    const tasks = tasksByWorkstream[ws.id] || []
    const summary = summarizeWorkstream(tasks)
    const na = summary.nextAction
    if (!na) continue

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
        The single next step from every active line — so nothing quietly slips.
      </p>

      {overdue.length > 0 && (
        <Section title="Overdue" tone="text-danger">
          {overdue.map(({ item, ws }) => (
            <Row key={item.id} item={item} ws={ws} onOpen={onOpenTask} onToggleStatus={onToggleStatus} />
          ))}
        </Section>
      )}

      {dueToday.length > 0 && (
        <Section title="Due today" tone="text-ink">
          {dueToday.map(({ item, ws }) => (
            <Row key={item.id} item={item} ws={ws} onOpen={onOpenTask} onToggleStatus={onToggleStatus} />
          ))}
        </Section>
      )}

      {nothingUrgent && (
        <p className="text-sm text-muted mb-6 bg-accentSoft border border-hairline rounded-card px-3.5 py-3">
          Nothing overdue and nothing due today. Good place to pull from "Next up" below.
        </p>
      )}

      {nextActions.length > 0 && (
        <Section title="Next up, undated" tone="text-muted">
          {nextActions.map(({ item, ws }) => (
            <Row key={item.id} item={item} ws={ws} onOpen={onOpenTask} onToggleStatus={onToggleStatus} />
          ))}
        </Section>
      )}

      {overdue.length === 0 && dueToday.length === 0 && nextActions.length === 0 && (
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

function Row({ item, ws, onOpen, onToggleStatus }) {
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
        className="mt-0.5 shrink-0"
      >
        <Circle size={18} style={{ color: ws.color }} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ws.color }} />
          <span className="text-xs text-muted">{ws.name}</span>
          {isStep && <ListOrdered size={11} className="text-faint" />}
          {isRecurring(item) && <Repeat size={11} className="text-faint" />}
        </div>
        <p className="text-sm text-ink mt-0.5">{item.title}</p>
      </div>
      {item.due_date && <DueBadge date={item.due_date} />}
    </div>
  )
}
