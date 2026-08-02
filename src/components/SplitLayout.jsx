import { useEffect } from 'react'
import { summarizeWorkstream } from '../lib/api'
import { useLineColor } from '../lib/theme'
import { lineFill } from '../lib/lineStyle'
import { DueBadge } from './ui'
import WorkstreamView from './WorkstreamView'

/**
 * Layout D — split.
 *
 * Every line in a rail on the left, the selected one open on the right. Keeps
 * the three-tier structure but collapses the top two onto one screen, so you
 * stop paying the click-back-click-forward tax while actually working.
 */
export default function SplitLayout({
  workstreams,
  tasksByWorkstream,
  dependencies,
  tasksById,
  workstreamsById,
  selectedId,
  onSelect,
  onEditWorkstream,
  onOpenTask,
  onCreateTask,
  onToggleStatus,
  onReorderTasks,
}) {
  const lineColor = useLineColor()
  const selected = workstreams.find((w) => w.id === selectedId) || workstreams[0]

  // Keep a valid selection when lines are added, removed or reordered.
  useEffect(() => {
    if (workstreams.length && !workstreams.some((w) => w.id === selectedId)) {
      onSelect(workstreams[0].id)
    }
  }, [workstreams, selectedId, onSelect])

  return (
    <div className="grid grid-cols-[minmax(200px,260px)_minmax(0,1fr)] gap-4 items-start">
      <nav aria-label="Lines" className="space-y-0.5 sticky top-20">
        {workstreams.map((ws) => {
          const tasks = tasksByWorkstream[ws.id] || []
          const summary = summarizeWorkstream(tasks)
          const na = summary.nextAction
          const active = selected && ws.id === selected.id
          return (
            <button
              key={ws.id}
              onClick={() => onSelect(ws.id)}
              aria-current={active ? 'true' : undefined}
              className={`w-full text-left rounded-r-card pl-2.5 pr-2 py-2 border-l-[3px] transition-colors ${
                active ? 'bg-panel border-l-transparent shadow-card' : 'hover:bg-panel/60'
              }`}
              style={{ borderLeftColor: lineColor(ws.color) }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="text-[13px] truncate flex-1 text-ink"
                  style={{ fontWeight: active ? 600 : 400 }}
                >
                  {ws.name}
                </span>
                <span className="font-mono text-[10px] text-faint shrink-0">
                  {summary.hasFiniteWork ? `${summary.done}/${summary.total}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                <span className="text-[11px] text-muted truncate flex-1">
                  {na ? na.title : summary.total > 0 ? 'All caught up' : 'No tasks yet'}
                </span>
                {na?.due_date && <DueBadge date={na.due_date} />}
              </div>
            </button>
          )
        })}
      </nav>

      <div
        role="region"
        aria-label={selected ? `${selected.name} details` : 'Line details'}
        className="bg-panel border border-hairline rounded-card shadow-card min-h-[60vh]"
      >
        {selected ? (
          <WorkstreamView
            key={selected.id}
            workstream={selected}
            tasks={tasksByWorkstream[selected.id] || []}
            dependencies={dependencies}
            tasksById={tasksById}
            workstreamsById={workstreamsById}
            onBack={null}
            onEditWorkstream={onEditWorkstream}
            onOpenTask={onOpenTask}
            onCreateTask={onCreateTask}
            onToggleStatus={onToggleStatus}
            onReorderTasks={onReorderTasks}
            embedded
          />
        ) : (
          <p className="text-sm text-faint text-center py-16">No lines yet.</p>
        )}
      </div>
    </div>
  )
}
