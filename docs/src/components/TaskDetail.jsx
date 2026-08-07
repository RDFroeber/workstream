import { useState, useRef, useEffect } from 'react'
import {
  X,
  Trash2,
  Plus,
  CheckCircle2,
  Circle,
  Link2,
  CornerUpLeft,
  Repeat,
  RotateCcw,
  Link,
  ExternalLink,
  Sun,
} from 'lucide-react'
import Modal from './Modal'
import { DueBadge } from './ui'
import RecurrenceEditor from './RecurrenceEditor'
import SortableList, { SortableItem, DragHandle } from './SortableList'
import { isRecurring, describeRecurrence } from '../lib/recurrence'
import { todayISO } from '../lib/dates'
import { isNative, openExternal } from '../lib/platform'
import { linksFor, dependentsOf } from '../lib/api'
import { extractLinks, shortenLink } from '../lib/links'
import { useLineColor } from '../lib/theme'

export default function TaskDetail({
  task,
  workstream,
  tasksById,
  workstreamsById,
  dependencies,
  allTasksFlat,
  onClose,
  onNavigate,
  onUpdate,
  onSetStatus,
  onDelete,
  onCreateStep,
  onReorderSteps,
  onAddDependency,
  onRemoveDependency,
  onCompleteCycle,
  taskLinks = [],
  onAddLink,
  onRemoveLink,
}) {
  const lineColor = useLineColor()
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes || '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [newStep, setNewStep] = useState('')
  const [showDepPicker, setShowDepPicker] = useState(false)
  const [showLinkPicker, setShowLinkPicker] = useState(false)

  const isSequence = task.item_type === 'sequence'
  const isStep = task.item_type === 'step'
  const parent = isStep ? tasksById[task.parent_id] : null

  const steps = isSequence
    ? allTasksFlat
        .filter((t) => t.parent_id === task.id)
        .sort((a, b) => a.sort_order - b.sort_order)
    : []
  const allStepsDone = steps.length > 0 && steps.every((s) => s.status === 'done')

  const noteLinks = extractLinks(notes)
  const related = linksFor(task.id, taskLinks)
  const relatedIds = new Set(related.map((r) => r.otherId))
  const blockedBy = dependencies.filter((d) => d.task_id === task.id)
  const blocks = dependencies.filter((d) => d.depends_on_task_id === task.id)

  // What's already been written back. Compared against instead of the task
  // prop, because the prop won't have caught up yet when a second commit fires.
  const savedRef = useRef({ title: task.title, notes: task.notes || '' })

  function commitTitle() {
    const next = title.trim()
    if (next && next !== savedRef.current.title) {
      savedRef.current.title = next
      onUpdate(task.id, { title: next })
    }
  }
  function commitNotes() {
    if (notes !== savedRef.current.notes) {
      savedRef.current.notes = notes
      onUpdate(task.id, { notes })
    }
  }

  // Title and notes only saved on blur, and React does not fire blur when a
  // focused element is unmounted. Pressing Escape, or clicking through to a
  // step, therefore threw the edit away silently. Committing on unmount covers
  // every exit path; savedRef stops it double-writing after a normal blur.
  const commitRef = useRef(() => {})
  commitRef.current = () => {
    commitTitle()
    commitNotes()
  }
  useEffect(() => () => commitRef.current(), [])

  function addStep(e) {
    e.preventDefault()
    if (!newStep.trim()) return
    onCreateStep(task.id, newStep.trim(), steps.length)
    setNewStep('')
  }

  // Rewrite the whole run of sort_orders on drop — this also repairs any
  // duplicate or drifted values left over from earlier inserts.
  function handleReorderSteps(reordered) {
    onReorderSteps(reordered.map((s, i) => ({ id: s.id, sort_order: i })))
  }

  // candidates for "blocked by": every other task except this one and (if sequence) its own steps
  const excludeIds = new Set([task.id, ...steps.map((s) => s.id)])
  // Anything already waiting on this task, however indirectly, is excluded —
  // choosing one would create a cycle and leave both ends blocked forever.
  const wouldCycle = dependentsOf(task.id, dependencies)
  // Existing blockers are excluded too — picking one again just listed the
  // same blocker twice (the same filter the link picker already had).
  const blockedByIds = new Set(blockedBy.map((d) => d.depends_on_task_id))
  const depCandidates = allTasksFlat.filter(
    (t) => !excludeIds.has(t.id) && !wouldCycle.has(t.id) && !blockedByIds.has(t.id)
  )
  // Already-linked tasks are filtered out — offering them again would just hit
  // the database's unique constraint.
  const linkCandidates = allTasksFlat.filter(
    (t) => !excludeIds.has(t.id) && !relatedIds.has(t.id)
  )

  return (
    <Modal onClose={onClose} wide>
      {isStep && parent && (
        <button
          onClick={() => onNavigate(parent.id)}
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink mb-3"
        >
          <CornerUpLeft size={13} /> {parent.title}
        </button>
      )}

      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {!isSequence && (
            <button
              onClick={() => onSetStatus(task, task.status === 'done' ? 'todo' : 'done')}
              className="shrink-0"
            >
              {task.status === 'done' ? (
                <CheckCircle2 size={20} className="text-accent" />
              ) : (
                <Circle size={20} style={{ color: lineColor(workstream?.color) }} />
              )}
            </button>
          )}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            className="font-display font-semibold text-lg text-ink bg-transparent outline-none min-w-0 flex-1"
          />
        </div>
        <button onClick={onClose} className="text-faint hover:text-ink shrink-0">
          <X size={18} />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs text-muted mb-4">
        {workstream && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: lineColor(workstream.color) }}
            />
            {workstream.name}
          </span>
        )}
        {isRecurring(task) && (
          <span className="inline-flex items-center gap-1 text-accent bg-accentSoft rounded-full px-2 py-0.5">
            <Repeat size={11} />
            {describeRecurrence(task)}
          </span>
        )}
      </div>

      {/* Recurring sequences finish a cycle rather than being ticked off once. */}
      {isSequence && isRecurring(task) && steps.length > 0 && allStepsDone && (
        <button
          onClick={onCompleteCycle}
          className="w-full mb-4 rounded-lg bg-accent text-panel text-sm font-medium py-2.5 inline-flex items-center justify-center gap-1.5 hover:bg-accentHover transition-colors"
        >
          <RotateCcw size={15} /> Finish this cycle and reset the steps
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {isSequence ? 'Cycle due' : 'Due date'}
          </label>
          <input
            type="date"
            value={task.due_date || ''}
            onChange={(e) => onUpdate(task.id, { due_date: e.target.value || null })}
            className="w-full rounded-lg border border-hairlineStrong px-2.5 py-1.5 text-sm text-ink bg-panel focus:border-accent outline-none"
          />
        </div>
        {/* Picking for today never touches the due date — it's the day's
            shortlist, not a reschedule. Sequences are containers, so the
            pick lives on their steps instead. */}
        {!isSequence && (
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Today</label>
            <button
              type="button"
              onClick={() => onUpdate(task.id, { focus_date: task.focus_date ? null : todayISO() })}
              aria-pressed={Boolean(task.focus_date)}
              className={`w-full rounded-lg border px-2.5 py-1.5 text-sm inline-flex items-center justify-center gap-1.5 transition-colors ${
                task.focus_date
                  ? 'border-accent bg-accentSoft text-accent'
                  : 'border-hairlineStrong text-muted hover:border-ink hover:text-ink'
              }`}
            >
              <Sun size={14} />
              {task.focus_date ? 'Picked for today' : 'Pick for today'}
            </button>
          </div>
        )}
      </div>

      <div className="mb-5">
        <label className="block text-xs font-medium text-muted mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitNotes}
          rows={3}
          placeholder="Any context worth remembering…"
          className="w-full rounded-lg border border-hairlineStrong px-3 py-2 text-sm text-ink bg-panel focus:border-accent outline-none resize-none"
        />
        {/* Links stay clickable while the notes stay editable — no edit/preview
            toggle to get stuck in. Only http and https are ever rendered. */}
        {noteLinks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {noteLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                title={l.href}
                onClick={(e) => {
                  // In the native wrapper a _blank anchor navigates the app's
                  // own webview to the external site — no tabs, no way back.
                  // The system browser sheet is the correct destination there.
                  if (isNative()) {
                    e.preventDefault()
                    openExternal(l.href)
                  }
                }}
                className="inline-flex items-center gap-1 max-w-full text-xs text-accent bg-accentSoft border border-hairline rounded-full px-2 py-1 hover:border-accent transition-colors"
              >
                <ExternalLink size={11} className="shrink-0" />
                <span className="truncate">{shortenLink(l.href)}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* A single step inside a sequence can't repeat on its own — the whole
          sequence repeats as a cycle instead. */}
      {!isStep && (
        <RecurrenceEditor task={task} onChange={(patch) => onUpdate(task.id, patch)} />
      )}

      {isSequence && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-muted">
              Steps — done in order, top to bottom
            </label>
            <span className="text-xs font-mono text-faint">
              {steps.filter((s) => s.status === 'done').length}/{steps.length}
            </span>
          </div>

          <SortableList items={steps} onReorder={handleReorderSteps} className="space-y-1.5">
            {steps.map((step, i) => {
              const isCurrent =
                step.status !== 'done' && steps.slice(0, i).every((s) => s.status === 'done')
              return (
                <SortableItem key={step.id} id={step.id}>
                  {({ handleProps, isDragging }) => (
                    <div
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                        isCurrent ? 'border-hairlineStrong bg-accentSoft' : 'border-hairline bg-panel'
                      } ${isDragging ? 'shadow-raised opacity-90' : ''}`}
                    >
                      <DragHandle handleProps={handleProps} label={`Reorder ${step.title}`} />
                      <button
                        onClick={() => onSetStatus(step, step.status === 'done' ? 'todo' : 'done')}
                        className="shrink-0"
                      >
                        {step.status === 'done' ? (
                          <CheckCircle2 size={17} className="text-accent" />
                        ) : (
                          <Circle size={17} className={isCurrent ? 'text-ink' : 'text-faint'} />
                        )}
                      </button>
                      <button
                        onClick={() => onNavigate(step.id)}
                        className={`flex-1 text-left text-sm min-w-0 truncate ${
                          step.status === 'done' ? 'line-through text-muted' : 'text-ink'
                        }`}
                      >
                        {step.title}
                      </button>
                      {step.due_date && <DueBadge date={step.due_date} />}
                    </div>
                  )}
                </SortableItem>
              )
            })}
          </SortableList>

          <form onSubmit={addStep} className="flex items-center gap-2 mt-2">
            <input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              placeholder="Add a step…"
              className="flex-1 rounded-lg border border-dashed border-hairlineStrong px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="text-xs font-medium bg-ink text-panel rounded-md px-2.5 py-1.5 inline-flex items-center gap-1"
            >
              <Plus size={13} /> Add
            </button>
          </form>
        </div>
      )}

      {/* Dependencies */}
      <div className="mb-5">
        <label className="block text-xs font-medium text-muted mb-2">Blocked by</label>
        {blockedBy.length === 0 && !showDepPicker && (
          <p className="text-sm text-faint mb-2">Nothing blocking this right now.</p>
        )}
        <div className="space-y-1.5 mb-2">
          {blockedBy.map((d) => {
            const blocker = tasksById[d.depends_on_task_id]
            const blockerWs = blocker ? workstreamsById[blocker.workstream_id] : null
            return (
              <div
                key={d.id}
                className="flex items-center gap-2 text-sm bg-dangerSoft border border-dangerBorder rounded-lg px-2.5 py-1.5"
              >
                <Link2 size={13} className="text-danger shrink-0" />
                <span className="flex-1 min-w-0 truncate text-ink">
                  {blocker?.title || 'Unknown task'}
                  {blockerWs && <span className="text-muted"> · {blockerWs.name}</span>}
                </span>
                <button
                  onClick={() => onRemoveDependency(d.id)}
                  className="text-faint hover:text-danger shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>

        {showDepPicker ? (
          <TaskPicker
            candidates={depCandidates}
            workstreamsById={workstreamsById}
            onPick={(depId) => {
              onAddDependency({ task_id: task.id, depends_on_task_id: depId })
              setShowDepPicker(false)
            }}
            onCancel={() => setShowDepPicker(false)}
          />
        ) : (
          <button
            onClick={() => setShowDepPicker(true)}
            className="text-xs font-medium text-muted hover:text-ink border border-dashed border-hairlineStrong rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1"
          >
            <Plus size={13} /> Link a blocker
          </button>
        )}

        {blocks.length > 0 && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-muted mb-1.5">This blocks</label>
            <div className="space-y-1.5">
              {blocks.map((d) => {
                const dependent = tasksById[d.task_id]
                return (
                  <div key={d.id} className="text-sm text-muted px-2.5 py-1 truncate">
                    → {dependent?.title || 'Unknown task'}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Related — deliberately styled flat and neutral. A relationship that
          carries no scheduling meaning must not look like a blocker, or the
          red-flag signal on the dashboard stops meaning anything. */}
      <div className="mb-5">
        <label className="block text-xs font-medium text-muted mb-2">Related</label>
        {related.length === 0 && !showLinkPicker && (
          <p className="text-sm text-faint mb-2">Nothing linked yet.</p>
        )}
        <div className="space-y-1.5 mb-2">
          {related.map(({ link, otherId }) => {
            const other = tasksById[otherId]
            const otherWs = other ? workstreamsById[other.workstream_id] : null
            return (
              <div
                key={link.id}
                className="flex items-center gap-2 text-sm border border-hairline rounded-lg px-2.5 py-1.5"
              >
                <Link size={13} className="text-faint shrink-0" />
                <button
                  onClick={() => other && onNavigate(other.id)}
                  className="flex-1 min-w-0 text-left truncate text-ink hover:underline"
                >
                  {other?.title || 'Unknown task'}
                </button>
                {otherWs && (
                  <span className="inline-flex items-center gap-1 shrink-0 text-xs text-muted">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: lineColor(otherWs.color) }}
                    />
                    {otherWs.name}
                  </span>
                )}
                <button
                  onClick={() => onRemoveLink(link.id)}
                  className="text-faint hover:text-danger shrink-0"
                  aria-label={`Unlink ${other?.title || 'task'}`}
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>

        {showLinkPicker ? (
          <TaskPicker
            candidates={linkCandidates}
            workstreamsById={workstreamsById}
            onPick={(otherId) => {
              onAddLink(task.id, otherId)
              setShowLinkPicker(false)
            }}
            onCancel={() => setShowLinkPicker(false)}
          />
        ) : (
          <button
            onClick={() => setShowLinkPicker(true)}
            className="text-xs font-medium text-muted hover:text-ink border border-dashed border-hairlineStrong rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1"
          >
            <Plus size={13} /> Link a related task
          </button>
        )}
      </div>

      <div className="pt-3 border-t border-hairline">
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted flex-1">
              {isSequence ? 'Delete this sequence and all its steps?' : 'Delete this item?'}
            </span>
            <button
              onClick={() => onDelete(task.id)}
              className="text-xs font-medium text-panel bg-danger rounded-lg px-3 py-1.5"
            >
              Delete
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="text-xs text-muted">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-danger transition-colors"
          >
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
    </Modal>
  )
}

/** Shared search-and-pick list, used for both blockers and related links. */
function TaskPicker({ candidates, workstreamsById, onPick, onCancel }) {
  // Its own hook call — reaching for the parent's `lineColor` binding threw a
  // ReferenceError the moment the picker opened.
  const lineColor = useLineColor()
  const [query, setQuery] = useState('')
  const filtered = candidates.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="border border-hairlineStrong rounded-lg p-2 bg-panel">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Escape backs out of the picker only. Without the stop, the
          // Modal's window-level listener also fired and closed the whole
          // task — two levels of UI gone for one keypress.
          if (e.key === 'Escape') {
            e.stopPropagation()
            onCancel()
          }
        }}
        placeholder="Search tasks…"
        className="w-full text-sm outline-none px-1.5 py-1 mb-1.5 border-b border-hairline"
      />
      <div className="max-h-40 overflow-y-auto space-y-0.5">
        {filtered.slice(0, 30).map((t) => (
          <button
            key={t.id}
            onClick={() => onPick(t.id)}
            className="w-full text-left text-sm px-1.5 py-1.5 rounded hover:bg-accentSoft flex items-center gap-1.5"
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: workstreamsById[t.workstream_id]
                  ? lineColor(workstreamsById[t.workstream_id].color)
                  : 'rgb(var(--hairline-strong))',
              }}
            />
            <span className="truncate">{t.title}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-faint px-1.5 py-1.5">No matching tasks.</p>
        )}
      </div>
      <button onClick={onCancel} className="text-xs text-muted mt-1.5 px-1.5">
        Cancel
      </button>
    </div>
  )
}
