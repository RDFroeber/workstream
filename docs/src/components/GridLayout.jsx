import { ChevronRight } from 'lucide-react'
import { summarizeWorkstream } from '../lib/api'
import { useLineColor } from '../lib/theme'
import { lineFill } from '../lib/lineStyle'
import { StatusPill } from './ui'
import SortableList, { SortableItem, DragHandle } from './SortableList'
import { ProgressTrack, upcomingActions, ActionLine } from './lineParts'

/**
 * Layout A — expanded card grid.
 *
 * The same cards as the list, given the width to show the next few actions
 * instead of only one. Two up on tablet, three on a wide desktop.
 */
export default function GridLayout({
  workstreams,
  tasksByWorkstream,
  dependencies,
  tasksById,
  workstreamsById,
  onOpen,
  onReorder,
}) {
  const lineColor = useLineColor()

  return (
    <SortableList
      items={workstreams}
      onReorder={onReorder}
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start"
    >
      {workstreams.map((ws) => {
        const tasks = tasksByWorkstream[ws.id] || []
        const summary = summarizeWorkstream(tasks)
        const next = upcomingActions(tasks, 3)

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
                className={`h-full bg-panel border rounded-card shadow-card px-4 pt-3.5 pb-3 hover:shadow-raised hover:border-hairlineStrong transition-all group cursor-pointer ${
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
                  <ChevronRight
                    size={16}
                    className="text-faint group-hover:text-muted group-hover:translate-x-0.5 transition-all shrink-0"
                  />
                </div>

                <div className="mb-3">
                  <ProgressTrack workstream={ws} summary={summary} />
                </div>

                <div className="space-y-1.5 mb-3 min-h-[3.5rem]">
                  {next.length > 0 ? (
                    next.map((item, i) => (
                      <ActionLine
                        key={item.id}
                        item={item}
                        dependencies={dependencies}
                        tasksById={tasksById}
                        workstreamsById={workstreamsById}
                        muted={i > 0}
                      />
                    ))
                  ) : summary.total > 0 ? (
                    <span className="text-sm text-muted">All caught up on this line</span>
                  ) : (
                    <span className="text-sm text-faint">No tasks yet</span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-hairline">
                  <StatusPill status={ws.status} />
                  <span className="font-mono text-xs text-faint">
                    {summary.hasFiniteWork
                      ? `${summary.done}/${summary.total}`
                      : summary.recurringCount > 0
                        ? `${summary.recurringCount} recurring`
                        : ''}
                  </span>
                </div>
              </div>
            )}
          </SortableItem>
        )
      })}
    </SortableList>
  )
}
