import { useState } from 'react'
import {
  ArrowLeft,
  Plus,
  ListOrdered,
  Circle,
  CheckCircle2,
  Settings2,
  Link2,
  Repeat,
  Link,
} from 'lucide-react'
import { buildWorkstreamTree, linkedIdsFor } from '../lib/api'
import { isRecurring, describeRecurrence } from '../lib/recurrence'
import { StatusPill, DueBadge } from './ui'
import SortableList, { SortableItem, DragHandle } from './SortableList'
import { useLineColor } from '../lib/theme'
import { lineFill } from '../lib/lineStyle'

/**
 * Fresh 0..n-1 ordering for the open items, with the completed ones appended
 * after them. Extracted from the drop handler so it can be tested: dnd-kit's
 * gesture needs real pointer events, which jsdom doesn't have.
 *
 * Done items have to be renumbered too. Leaving their old values in place lets
 * a completed task keep a sort_order that collides with an open one, and the
 * next drop then produces an ambiguous order.
 */
export function buildReorderUpdates(openItems, doneItems = []) {
  const updates = openItems.map((t, i) => ({ id: t.id, sort_order: i }))
  doneItems.forEach((t, i) => updates.push({ id: t.id, sort_order: openItems.length + i }))
  return updates
}

export default function WorkstreamView({
  workstream,
  tasks,
  dependencies,
  tasksById,
  workstreamsById,
  onBack,
  onEditWorkstream,
  onOpenTask,
  onCreateTask,
  onToggleStatus,
  onReorderTasks,
  embedded = false,
  taskLinks = [],
}) {
  const lineColor = useLineColor()
  const [adding, setAdding] = useState(null) // null | 'standalone' | 'sequence'
  const [draftTitle, setDraftTitle] = useState('')

  const tree = buildWorkstreamTree(tasks)
  const openItems = tree.filter((t) => t.status !== 'done')
  const doneItems = tree.filter((t) => t.status === 'done')

  function handleReorder(reordered) {
    onReorderTasks(buildReorderUpdates(reordered, doneItems))
  }

  function submitDraft(e) {
    e.preventDefault()
    if (!draftTitle.trim()) return
    onCreateTask({
      workstream_id: workstream.id,
      item_type: adding,
      title: draftTitle.trim(),
      sort_order: tree.length,
    })
    setDraftTitle('')
    setAdding(null)
  }

  return (
    <div className={embedded ? 'px-4 pb-6 pt-4' : 'max-w-2xl mx-auto px-4 pb-28 pt-4'}>
      {!embedded && (
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink mb-4 -ml-1 px-1 py-1"
        >
          <ArrowLeft size={15} /> All lines
        </button>
      )}

      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={lineFill(lineColor(workstream.color), workstream.color)}
          />
          <h1 className="font-display font-semibold text-2xl text-ink tracking-tight truncate">
            {workstream.name}
          </h1>
        </div>
        <button
          onClick={() => onEditWorkstream(workstream)}
          className="shrink-0 text-faint hover:text-ink p-1.5"
          aria-label="Edit line"
        >
          <Settings2 size={18} />
        </button>
      </div>
      <div className="mb-6">
        <StatusPill status={workstream.status} />
      </div>

      <SortableList items={openItems} onReorder={handleReorder} className="space-y-2">
        {openItems.map((item) => (
          <SortableItem key={item.id} id={item.id}>
            {({ handleProps, isDragging }) => (
              <TaskRow
                item={item}
                color={lineColor(workstream.color)}
                dependencies={dependencies}
                tasksById={tasksById}
                workstreamsById={workstreamsById}
                onOpen={() => onOpenTask(item)}
                onToggleStatus={onToggleStatus}
                handleProps={handleProps}
                isDragging={isDragging}
                taskLinks={taskLinks}
              />
            )}
          </SortableItem>
        ))}
      </SortableList>

      {adding ? (
        <form
          onSubmit={submitDraft}
          className="mt-3 flex items-center gap-2 bg-panel border border-hairlineStrong rounded-card p-2.5"
        >
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder={adding === 'sequence' ? 'Name this sequence…' : 'New task…'}
            className="flex-1 text-sm outline-none bg-transparent px-1"
            onBlur={() => {
              if (!draftTitle.trim()) setAdding(null)
            }}
          />
          <button
            type="submit"
            className="text-xs font-medium bg-ink text-panel rounded-md px-2.5 py-1.5"
          >
            Add
          </button>
        </form>
      ) : (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setAdding('standalone')}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm text-muted border border-dashed border-hairlineStrong rounded-card py-2.5 hover:border-ink hover:text-ink transition-colors"
          >
            <Plus size={15} /> Task
          </button>
          <button
            onClick={() => setAdding('sequence')}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm text-muted border border-dashed border-hairlineStrong rounded-card py-2.5 hover:border-ink hover:text-ink transition-colors"
          >
            <ListOrdered size={15} /> Sequence of steps
          </button>
        </div>
      )}

      {doneItems.length > 0 && (
        <details className="mt-6 group">
          <summary className="text-xs font-medium text-faint cursor-pointer select-none">
            {doneItems.length} done
          </summary>
          <div className="space-y-2 mt-2 opacity-60">
            {doneItems.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                color={lineColor(workstream.color)}
                dependencies={dependencies}
                tasksById={tasksById}
                workstreamsById={workstreamsById}
                onOpen={() => onOpenTask(item)}
                onToggleStatus={onToggleStatus}
                taskLinks={taskLinks}
              />
            ))}
          </div>
        </details>
      )}

      {tree.length === 0 && !adding && (
        <p className="text-sm text-faint text-center py-10">
          Nothing here yet. Add a one-off task, or a sequence if the work has ordered steps.
        </p>
      )}
    </div>
  )
}

function TaskRow({
  item,
  color,
  dependencies,
  tasksById,
  workstreamsById,
  onOpen,
  onToggleStatus,
  handleProps,
  isDragging,
  taskLinks = [],
}) {
  const linkCount = linkedIdsFor(item.id, taskLinks).length
  const isSequence = item.item_type === 'sequence'
  const isDone = item.status === 'done'

  const blockingDep = dependencies.find(
    (d) => d.task_id === item.id && tasksById[d.depends_on_task_id]?.status !== 'done'
  )
  const blocker = blockingDep ? tasksById[blockingDep.depends_on_task_id] : null
  const blockerWs = blocker ? workstreamsById[blocker.workstream_id] : null

  return (
    <div
      onClick={onOpen}
      className={`flex items-start gap-2.5 bg-panel border rounded-card px-3.5 py-3 hover:border-hairlineStrong cursor-pointer transition-colors ${
        isDragging ? 'border-hairlineStrong shadow-raised' : 'border-hairline'
      }`}
    >
      {handleProps && (
        <DragHandle handleProps={handleProps} className="mt-0.5" label={`Reorder ${item.title}`} />
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (!isSequence) onToggleStatus(item, isDone ? 'todo' : 'done')
          else onOpen()
        }}
        className="mt-0.5 shrink-0"
        aria-label={isDone ? 'Mark not done' : 'Mark done'}
      >
        {isSequence ? (
          <ListOrdered size={18} style={{ color }} />
        ) : isDone ? (
          <CheckCircle2 size={18} className="text-muted" />
        ) : (
          <Circle size={18} style={{ color }} strokeWidth={2} />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {isRecurring(item) && <Repeat size={12} className="text-faint shrink-0" />}
          <span className={`text-sm text-ink truncate ${isDone ? 'line-through text-muted' : ''}`}>
            {item.title}
          </span>
          {linkCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-xs text-faint shrink-0"
              title={`${linkCount} related ${linkCount === 1 ? 'task' : 'tasks'}`}
            >
              <Link size={11} />
              {linkCount}
            </span>
          )}
        </div>

        {isSequence ? (
          <p className="text-xs text-muted mt-0.5">
            {item.nextStep ? (
              <>
                Next: {item.nextStep.title}{' '}
                <span className="font-mono text-faint">
                  ({item.doneCount}/{item.totalSteps})
                </span>
              </>
            ) : item.totalSteps > 0 ? (
              <span className="text-accent">All steps complete</span>
            ) : (
              'No steps added yet'
            )}
          </p>
        ) : (
          (item.due_date || isRecurring(item)) && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {item.due_date && <DueBadge date={item.due_date} />}
              {isRecurring(item) && (
                <span className="text-[11px] text-faint">{describeRecurrence(item)}</span>
              )}
            </div>
          )
        )}

        {blocker && (
          <div className="flex items-center gap-1 mt-1 text-xs text-danger">
            <Link2 size={11} />
            <span className="truncate">
              Blocked by "{blocker.title}"{blockerWs ? ` (${blockerWs.name})` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
