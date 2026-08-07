import { Link2, Repeat, ListOrdered } from 'lucide-react'
import { buildWorkstreamTree } from '../lib/api'
import { isRecurring } from '../lib/recurrence'
import { useLineColor } from '../lib/theme'
import { lineFill } from '../lib/lineStyle'
import { DueBadge } from './ui'

/** The coloured track with a position marker, shared by the list and grid. */
export function ProgressTrack({ workstream, summary }) {
  const lineColor = useLineColor()
  const c = lineColor(workstream.color)
  if (!summary.hasFiniteWork) {
    return (
      <div
        className="h-1.5 rounded-full"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, ${c}55 0 6px, transparent 6px 12px)`,
        }}
      />
    )
  }
  const pct = summary.progress * 100
  return (
    <div className="relative h-1.5 rounded-full bg-hairline">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all"
        style={{ width: `${Math.max(pct, 2)}%`, ...lineFill(c, workstream.color) }}
      />
      <div
        className="absolute rounded-full bg-panel border-2"
        style={{ borderColor: c, width: 12, height: 12, top: -4.5, left: `calc(${pct}% - 6px)` }}
      />
    </div>
  )
}

/**
 * The next few actions on a line, flattened across standalone tasks and the
 * current step of each sequence. The grid has room for several; the list shows
 * one. Both pull from here so they can't drift apart.
 */
export function upcomingActions(tasks, limit = 3) {
  const tree = buildWorkstreamTree(tasks)
  const candidates = tree
    .filter((i) => i.status !== 'done')
    .map((i) => (i.item_type === 'sequence' ? i.nextStep || i : i))
    .filter(Boolean)
  candidates.sort((a, b) => {
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })
  return candidates.slice(0, limit)
}

export function ActionLine({ item, dependencies, tasksById, workstreamsById, muted = false }) {
  const blockingDep = dependencies.find(
    (d) => d.task_id === item.id && tasksById[d.depends_on_task_id]?.status !== 'done'
  )
  const blocker = blockingDep ? tasksById[blockingDep.depends_on_task_id] : null
  const blockerWs = blocker ? workstreamsById[blocker.workstream_id] : null

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        {item.item_type === 'step' && <ListOrdered size={11} className="text-faint shrink-0" />}
        {isRecurring(item) && <Repeat size={11} className="text-faint shrink-0" />}
        <span className={`text-sm truncate ${muted ? 'text-muted' : 'text-ink'}`}>
          {item.title}
        </span>
        {item.due_date && <DueBadge date={item.due_date} />}
      </div>
      {blocker && (
        <div className="flex items-center gap-1 mt-0.5 text-xs text-danger">
          <Link2 size={11} className="shrink-0" />
          <span className="truncate">
            Waiting on "{blocker.title}"{blockerWs ? ` · ${blockerWs.name}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
