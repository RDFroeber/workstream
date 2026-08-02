import { Plus, Link2, ChevronRight, Waypoints, Repeat, Archive } from 'lucide-react'
import { summarizeWorkstream } from '../lib/api'
import { isRecurring } from '../lib/recurrence'
import { StatusPill, DueBadge } from './ui'
import SortableList, { SortableItem, DragHandle } from './SortableList'
import { useLineColor } from '../lib/theme'
import { lineFill } from '../lib/lineStyle'

/** Title, line count and the "New line" button — the single header every layout uses. */
export function DashboardHeader({
  workstreams,
  onNewWorkstream,
  archivedCount = 0,
  showArchived = false,
  onToggleArchived,
}) {
  const attention = workstreams.filter(
    (w) => w.status === 'at_risk' || w.status === 'blocked'
  ).length
  return (
    <div className="flex items-start justify-between mb-6 gap-3">
      <div className="min-w-0">
        <h1 className="font-display font-semibold text-2xl text-ink tracking-tight">System map</h1>
        <p className="text-sm text-muted mt-0.5">
          {workstreams.length} {workstreams.length === 1 ? 'line' : 'lines'}
          {attention > 0 && <span className="text-warn"> · {attention} need attention</span>}
        </p>
        {archivedCount > 0 && onToggleArchived && (
          <button
            onClick={onToggleArchived}
            aria-pressed={showArchived}
            className="inline-flex items-center gap-1 text-xs text-faint hover:text-muted mt-1 transition-colors"
          >
            <Archive size={11} />
            {showArchived ? 'Hide' : 'Show'} {archivedCount} archived
          </button>
        )}
      </div>
      <button
        onClick={onNewWorkstream}
        className="inline-flex items-center gap-1.5 text-sm font-medium bg-ink text-panel rounded-lg px-3 py-2 hover:opacity-90 transition-opacity shrink-0"
      >
        <Plus size={16} /> New line
      </button>
    </div>
  )
}

export default function DashboardView({
  workstreams,
  tasksByWorkstream,
  dependencies,
  tasksById,
  onOpen,
  onNewWorkstream,
  onReorder,
  archivedCount = 0,
  showArchived = false,
  onToggleArchived,
}) {
  const lineColor = useLineColor()

  return (
    <div className="max-w-2xl mx-auto px-4 pb-28 pt-5">
      <DashboardHeader
        workstreams={workstreams}
        onNewWorkstream={onNewWorkstream}
        archivedCount={archivedCount}
        showArchived={showArchived}
        onToggleArchived={onToggleArchived}
      />

      {workstreams.length === 0 ? (
        <EmptyState onNewWorkstream={onNewWorkstream} />
      ) : (
        <SortableList items={workstreams} onReorder={onReorder} className="space-y-3">
          {workstreams.map((ws) => {
            const tasks = tasksByWorkstream[ws.id] || []
            const summary = summarizeWorkstream(tasks)
            const na = summary.nextAction

            // is the next action currently blocked by an unfinished dependency?
            const blockingDep = na
              ? dependencies.find(
                  (d) =>
                    d.task_id === na.id &&
                    tasksById[d.depends_on_task_id] &&
                    tasksById[d.depends_on_task_id].status !== 'done'
                )
              : null
            const blockerTask = blockingDep ? tasksById[blockingDep.depends_on_task_id] : null

            const progress = summary.progress

            return (
              <SortableItem key={ws.id} id={ws.id}>
                {({ handleProps, isDragging }) => (
              <div
                role="button"
                tabIndex={0}
                // Without this the card's accessible name is its whole
                // contents read aloud — name, status, progress and next action
                // run together as one string.
                aria-label={`Open ${ws.name}`}
                onClick={() => onOpen(ws.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpen(ws.id)
                  }
                }}
                className={`w-full text-left bg-panel border rounded-card shadow-card px-4 pt-3.5 pb-3 hover:shadow-raised hover:border-hairlineStrong transition-all group cursor-pointer ${
                  isDragging ? 'border-hairlineStrong shadow-raised' : 'border-hairline'
                }`}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <DragHandle handleProps={handleProps} label={`Reorder ${ws.name}`} />
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={lineFill(lineColor(ws.color), ws.color)}
                    />
                    <span className="font-display font-semibold text-[15px] text-ink truncate">
                      {ws.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusPill status={ws.status} />
                    <ChevronRight
                      size={16}
                      className="text-faint group-hover:text-muted group-hover:translate-x-0.5 transition-all"
                    />
                  </div>
                </div>

                {/* the line: a filled track for finite work, a dashed one for
                    lines that are pure upkeep and have nothing to finish */}
                {summary.hasFiniteWork ? (
                  <div className="relative h-1.5 rounded-full mb-2 bg-hairline">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all"
                      style={{
                        width: `${Math.max(progress * 100, 2)}%`,
                        ...lineFill(lineColor(ws.color), ws.color),
                      }}
                    />
                    <div
                      className="absolute rounded-full bg-panel border-2"
                      style={{
                        borderColor: lineColor(ws.color),
                        width: 12,
                        height: 12,
                        top: -4.5,
                        left: `calc(${progress * 100}% - 6px)`,
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="h-1.5 mb-2 rounded-full"
                    style={{
                      backgroundImage: `repeating-linear-gradient(90deg, ${lineColor(ws.color)}55 0 6px, transparent 6px 12px)`,
                    }}
                  />
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {na ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isRecurring(na) && (
                          <Repeat size={12} className="text-faint shrink-0" />
                        )}
                        <span className="text-sm text-ink truncate">{na.title}</span>
                        {na.due_date && <DueBadge date={na.due_date} />}
                      </div>
                    ) : summary.total > 0 ? (
                      <span className="text-sm text-muted">All caught up on this line</span>
                    ) : summary.recurringCount > 0 ? (
                      <span className="text-sm text-muted">Upkeep only — nothing due</span>
                    ) : (
                      <span className="text-sm text-faint">No tasks yet</span>
                    )}
                    {blockerTask && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-danger">
                        <Link2 size={11} />
                        <span className="truncate">Waiting on "{blockerTask.title}"</span>
                      </div>
                    )}
                  </div>
                  {summary.hasFiniteWork ? (
                    <span className="font-mono text-xs text-faint shrink-0">
                      {summary.done}/{summary.total}
                    </span>
                  ) : summary.recurringCount > 0 ? (
                    <span className="font-mono text-xs text-faint shrink-0 inline-flex items-center gap-1">
                      <Repeat size={11} />
                      {summary.recurringCount}
                    </span>
                  ) : null}
                </div>
              </div>
                )}
              </SortableItem>
            )
          })}
        </SortableList>
      )}
    </div>
  )
}

function EmptyState({ onNewWorkstream }) {
  return (
    <div className="text-center py-16 px-6 border border-dashed border-hairlineStrong rounded-card">
      <Waypoints size={28} className="mx-auto text-faint mb-3" strokeWidth={1.6} />
      <h2 className="font-display font-semibold text-ink mb-1">No lines yet</h2>
      <p className="text-sm text-muted mb-5 max-w-xs mx-auto">
        Each workstream gets its own line. Add one for every thing you're juggling — you can
        always add more.
      </p>
      <button
        onClick={onNewWorkstream}
        className="inline-flex items-center gap-1.5 text-sm font-medium bg-ink text-panel rounded-lg px-4 py-2 hover:opacity-90 transition-opacity"
      >
        <Plus size={16} /> Add your first line
      </button>
    </div>
  )
}
