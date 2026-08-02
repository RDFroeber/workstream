import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ThemeProvider } from '../src/lib/theme'
import RecurrenceEditor from '../src/components/RecurrenceEditor'
import SortableList, { SortableItem, DragHandle } from '../src/components/SortableList'
import TodayView from '../src/components/TodayView'
import WorkstreamView from '../src/components/WorkstreamView'
import TaskDetail from '../src/components/TaskDetail'
import { upcomingActions, ProgressTrack } from '../src/components/lineParts'
import { formatDue, todayISO } from '../src/lib/dates'
import { lineFill, lineBorderColor } from '../src/lib/lineStyle'
import { extractLinks, shortenLink } from '../src/lib/links'
import { computeNextDue, describeRecurrence, shortRecurrence, isRecurring, WEEKDAYS, UNITS, toISO, addDays, parseISO } from '../src/lib/recurrence'
import { requestPermission, resetSentLog, getPrefs, setPrefs, supported, permission, DEFAULT_PREFS, runCheck } from '../src/lib/notifications'

const noop = () => {}
const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>)
const day = (n) => toISO(addDays(parseISO(todayISO()), n))

beforeEach(() => localStorage.clear())

// ---------------------------------------------------------------------------

describe('RecurrenceEditor', () => {
  const task = { id: 't1', title: 'T' }

  it('offers to make a task repeat, and starts weekly', () => {
    const onChange = vi.fn()
    wrap(<RecurrenceEditor task={task} onChange={onChange} />)
    fireEvent.click(screen.getByText('Make this repeat'))
    expect(onChange).toHaveBeenCalledWith({
      recurrence_unit: 'week',
      recurrence_interval: 1,
      recurrence_days: null,
      recurrence_anchor: 'schedule',
    })
  })

  const repeating = { ...task, recurrence_unit: 'week', recurrence_interval: 1, recurrence_anchor: 'schedule' }

  it('changes the interval and refuses a nonsense one', () => {
    const onChange = vi.fn()
    wrap(<RecurrenceEditor task={repeating} onChange={onChange} />)
    const num = screen.getByRole('spinbutton')
    fireEvent.change(num, { target: { value: '3' } })
    expect(onChange).toHaveBeenCalledWith({ recurrence_interval: 3 })
    fireEvent.change(num, { target: { value: '0' } })
    expect(onChange).toHaveBeenLastCalledWith({ recurrence_interval: 1 })
    fireEvent.change(num, { target: { value: 'abc' } })
    expect(onChange).toHaveBeenLastCalledWith({ recurrence_interval: 1 })
  })

  it('drops weekday choices when the unit stops being weekly', () => {
    // "Every 2 months on Tuesday" is meaningless, so the days are cleared.
    const onChange = vi.fn()
    wrap(<RecurrenceEditor task={{ ...repeating, recurrence_days: [1] }} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'month' } })
    expect(onChange).toHaveBeenCalledWith({ recurrence_unit: 'month', recurrence_days: null })
  })

  it('keeps weekday choices while it stays weekly', () => {
    const onChange = vi.fn()
    wrap(<RecurrenceEditor task={{ ...repeating, recurrence_days: [1] }} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'week' } })
    expect(onChange).toHaveBeenCalledWith({ recurrence_unit: 'week', recurrence_days: [1] })
  })

  it('toggles weekdays on and off', () => {
    const onChange = vi.fn()
    const { rerender } = wrap(<RecurrenceEditor task={repeating} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Monday'))
    expect(onChange).toHaveBeenCalledWith({ recurrence_days: [1] })
    rerender(
      <ThemeProvider>
        <RecurrenceEditor task={{ ...repeating, recurrence_days: [1] }} onChange={onChange} />
      </ThemeProvider>
    )
    fireEvent.click(screen.getByLabelText('Monday'))
    // Back to none means null, not an empty array the database has to interpret.
    expect(onChange).toHaveBeenLastCalledWith({ recurrence_days: null })
  })

  it('shows weekday choices only for weekly rules', () => {
    const { rerender } = wrap(<RecurrenceEditor task={repeating} onChange={noop} />)
    expect(screen.getByLabelText('Monday')).toBeTruthy()
    rerender(
      <ThemeProvider>
        <RecurrenceEditor task={{ ...repeating, recurrence_unit: 'month' }} onChange={noop} />
      </ThemeProvider>
    )
    expect(screen.queryByLabelText('Monday')).toBeNull()
  })

  it('switches the anchor between due date and completion', () => {
    const onChange = vi.fn()
    wrap(<RecurrenceEditor task={repeating} onChange={onChange} />)
    fireEvent.click(screen.getByText('When I finish it'))
    expect(onChange).toHaveBeenCalledWith({ recurrence_anchor: 'completion' })
    fireEvent.click(screen.getByText('Its due date'))
    expect(onChange).toHaveBeenLastCalledWith({ recurrence_anchor: 'schedule' })
  })

  it('stops repeating and clears the rule completely', () => {
    const onChange = vi.fn()
    wrap(<RecurrenceEditor task={{ ...repeating, recurrence_days: [1] }} onChange={onChange} />)
    fireEvent.click(screen.getByText('Stop repeating'))
    expect(onChange).toHaveBeenCalledWith({
      recurrence_unit: null,
      recurrence_days: null,
      recurrence_interval: 1,
    })
  })

  it('shows how many times it has already been done', () => {
    wrap(<RecurrenceEditor task={{ ...repeating, recurrence_count: 7 }} onChange={noop} />)
    expect(screen.getByText(/done 7/)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------

describe('SortableList', () => {
  const items = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
  ]

  it('renders its children with drag handles', () => {
    render(
      <SortableList items={items} onReorder={noop}>
        {items.map((i) => (
          <SortableItem key={i.id} id={i.id}>
            {({ handleProps }) => (
              <div>
                <DragHandle handleProps={handleProps} label={`Reorder ${i.name}`} />
                {i.name}
              </div>
            )}
          </SortableItem>
        ))}
      </SortableList>
    )
    expect(screen.getByLabelText('Reorder Alpha')).toBeTruthy()
    expect(screen.getByLabelText('Reorder Beta')).toBeTruthy()
  })

  it('does not let a handle click bubble into the row underneath', () => {
    // Otherwise grabbing the handle would also open the item.
    const rowClick = vi.fn()
    render(
      <SortableList items={items} onReorder={noop}>
        {items.map((i) => (
          <SortableItem key={i.id} id={i.id}>
            {({ handleProps }) => (
              <div onClick={rowClick}>
                <DragHandle handleProps={handleProps} label={`Reorder ${i.name}`} />
                {i.name}
              </div>
            )}
          </SortableItem>
        ))}
      </SortableList>
    )
    fireEvent.click(screen.getByLabelText('Reorder Alpha'))
    expect(rowClick).not.toHaveBeenCalled()
  })

  it('gives handles the attributes keyboard reordering depends on', () => {
    render(
      <SortableList items={items} onReorder={noop}>
        {items.map((i) => (
          <SortableItem key={i.id} id={i.id}>
            {({ handleProps }) => <DragHandle handleProps={handleProps} label={`Reorder ${i.name}`} />}
          </SortableItem>
        ))}
      </SortableList>
    )
    const handle = screen.getByLabelText('Reorder Alpha')
    expect(handle.getAttribute('aria-roledescription')).toBeTruthy()
    expect(handle.getAttribute('tabindex')).toBe('0')
  })
})

// ---------------------------------------------------------------------------

describe('TodayView', () => {
  const ws = { id: 'w1', name: 'Website', color: '#6C4FA0', status: 'active', sort_order: 0 }
  const base = { workstream_id: 'w1', parent_id: null, item_type: 'standalone', status: 'todo' }

  it('invites you to start when there is nothing at all', () => {
    wrap(<TodayView workstreams={[]} tasksByWorkstream={{}} onOpenTask={noop} onToggleStatus={noop} />)
    expect(screen.getByText(/Add a line and a task/)).toBeTruthy()
  })

  it('separates overdue, due today and undated next steps', () => {
    const tasks = {
      w1: [
        { ...base, id: 'a', title: 'Late thing', due_date: day(-3), sort_order: 0 },
      ],
      w2: [{ ...base, workstream_id: 'w2', id: 'b', title: 'Today thing', due_date: day(0), sort_order: 0 }],
      w3: [{ ...base, workstream_id: 'w3', id: 'c', title: 'Someday thing', sort_order: 0 }],
    }
    const lines = [
      ws,
      { ...ws, id: 'w2', name: 'Hiring' },
      { ...ws, id: 'w3', name: 'Budget' },
    ]
    wrap(<TodayView workstreams={lines} tasksByWorkstream={tasks} onOpenTask={noop} onToggleStatus={noop} />)
    expect(screen.getByText('Overdue')).toBeTruthy()
    expect(screen.getByText('Due today')).toBeTruthy()
    expect(screen.getByText('Next up, undated')).toBeTruthy()
  })

  it('says the coast is clear when nothing is pressing', () => {
    const tasks = { w1: [{ ...base, id: 'c', title: 'Someday', sort_order: 0 }] }
    wrap(<TodayView workstreams={[ws]} tasksByWorkstream={tasks} onOpenTask={noop} onToggleStatus={noop} />)
    expect(screen.getByText(/Nothing overdue and nothing due today/)).toBeTruthy()
  })

  it('skips archived lines', () => {
    const tasks = { w1: [{ ...base, id: 'a', title: 'Hidden', due_date: day(0), sort_order: 0 }] }
    wrap(
      <TodayView
        workstreams={[{ ...ws, status: 'archived' }]}
        tasksByWorkstream={tasks}
        onOpenTask={noop}
        onToggleStatus={noop}
      />
    )
    expect(screen.queryByText('Hidden')).toBeNull()
  })

  it('completes and opens from the daily list', () => {
    const onToggleStatus = vi.fn()
    const onOpenTask = vi.fn()
    const tasks = { w1: [{ ...base, id: 'a', title: 'Do it', due_date: day(0), sort_order: 0 }] }
    wrap(
      <TodayView
        workstreams={[ws]}
        tasksByWorkstream={tasks}
        onOpenTask={onOpenTask}
        onToggleStatus={onToggleStatus}
      />
    )
    fireEvent.click(screen.getByText('Do it'))
    expect(onOpenTask).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------

describe('WorkstreamView', () => {
  const ws = { id: 'w1', name: 'Website', color: '#6C4FA0', status: 'active', sort_order: 0 }
  const base = { workstream_id: 'w1', parent_id: null, item_type: 'standalone', status: 'todo', notes: '' }
  const render_ = (tasks, extra = {}) =>
    wrap(
      <WorkstreamView
        workstream={ws}
        tasks={tasks}
        dependencies={[]}
        tasksById={Object.fromEntries(tasks.map((t) => [t.id, t]))}
        workstreamsById={{ w1: ws }}
        taskLinks={[]}
        onBack={noop}
        onEditWorkstream={noop}
        onOpenTask={noop}
        onCreateTask={noop}
        onToggleStatus={noop}
        onReorderTasks={noop}
        {...extra}
      />
    )

  it('prompts when the line is empty', () => {
    render_([])
    expect(screen.getByText(/Nothing here yet/)).toBeTruthy()
  })

  it('adds a standalone task', () => {
    const onCreateTask = vi.fn()
    render_([], { onCreateTask })
    fireEvent.click(screen.getByText('Task'))
    const input = screen.getByPlaceholderText('New task…')
    fireEvent.change(input, { target: { value: 'A task' } })
    fireEvent.submit(input.closest('form'))
    expect(onCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ item_type: 'standalone', title: 'A task' })
    )
  })

  it('adds a sequence', () => {
    const onCreateTask = vi.fn()
    render_([], { onCreateTask })
    fireEvent.click(screen.getByText('Sequence of steps'))
    const input = screen.getByPlaceholderText(/Name this sequence/)
    fireEvent.change(input, { target: { value: 'Monthly close' } })
    fireEvent.submit(input.closest('form'))
    expect(onCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ item_type: 'sequence', title: 'Monthly close' })
    )
  })

  it('abandons an empty draft on blur', () => {
    render_([])
    fireEvent.click(screen.getByText('Task'))
    fireEvent.blur(screen.getByPlaceholderText('New task…'))
    expect(screen.getByText('Task')).toBeTruthy()
  })

  it('summarises a sequence by its next step and progress', () => {
    render_([
      { ...base, id: 'seq', title: 'Close', item_type: 'sequence', sort_order: 0 },
      { ...base, id: 's1', title: 'Pull reports', parent_id: 'seq', item_type: 'step', status: 'done', sort_order: 0 },
      { ...base, id: 's2', title: 'Reconcile', parent_id: 'seq', item_type: 'step', sort_order: 1 },
    ])
    expect(screen.getByText(/Next: Reconcile/)).toBeTruthy()
    expect(screen.getByText(/\(1\/2\)/)).toBeTruthy()
  })

  it('celebrates a finished sequence and flags an empty one', () => {
    const { rerender } = render_([
      { ...base, id: 'seq', title: 'Close', item_type: 'sequence', sort_order: 0 },
      { ...base, id: 's1', title: 'Only step', parent_id: 'seq', item_type: 'step', status: 'done', sort_order: 0 },
    ])
    expect(screen.getByText('All steps complete')).toBeTruthy()
    rerender(
      <ThemeProvider>
        <WorkstreamView
          workstream={ws}
          tasks={[{ ...base, id: 'seq', title: 'Close', item_type: 'sequence', sort_order: 0 }]}
          dependencies={[]}
          tasksById={{}}
          workstreamsById={{ w1: ws }}
          taskLinks={[]}
          onBack={noop}
          onEditWorkstream={noop}
          onOpenTask={noop}
          onCreateTask={noop}
          onToggleStatus={noop}
          onReorderTasks={noop}
        />
      </ThemeProvider>
    )
    expect(screen.getByText('No steps added yet')).toBeTruthy()
  })

  it('names the blocking task and its line', () => {
    const other = { id: 'x', title: 'Budget sign-off', workstream_id: 'w2', status: 'todo' }
    wrap(
      <WorkstreamView
        workstream={ws}
        tasks={[{ ...base, id: 'a', title: 'Blocked task', sort_order: 0 }]}
        dependencies={[{ id: 'd1', task_id: 'a', depends_on_task_id: 'x' }]}
        tasksById={{ x: other }}
        workstreamsById={{ w1: ws, w2: { id: 'w2', name: 'Finance', color: '#A34E1F' } }}
        taskLinks={[]}
        onBack={noop}
        onEditWorkstream={noop}
        onOpenTask={noop}
        onCreateTask={noop}
        onToggleStatus={noop}
        onReorderTasks={noop}
      />
    )
    expect(screen.getByText(/Budget sign-off.*Finance/)).toBeTruthy()
  })

  it('tucks completed work into a collapsed section', () => {
    render_([
      { ...base, id: 'a', title: 'Open', sort_order: 0 },
      { ...base, id: 'b', title: 'Finished', status: 'done', sort_order: 1 },
    ])
    expect(screen.getByText('1 done')).toBeTruthy()
  })

  it('goes back to the overview', () => {
    const onBack = vi.fn()
    render_([], { onBack })
    fireEvent.click(screen.getByText('All lines'))
    expect(onBack).toHaveBeenCalled()
  })

  it('opens the line settings', () => {
    const onEditWorkstream = vi.fn()
    render_([], { onEditWorkstream })
    fireEvent.click(screen.getByLabelText('Edit line'))
    expect(onEditWorkstream).toHaveBeenCalledWith(ws)
  })
})

// ---------------------------------------------------------------------------

describe('TaskDetail — steps and dependencies', () => {
  const ws = { id: 'w1', name: 'Website', color: '#6C4FA0', status: 'active' }
  const base = { workstream_id: 'w1', parent_id: null, item_type: 'standalone', status: 'todo', notes: '' }
  const seq = { ...base, id: 'seq', title: 'Close', item_type: 'sequence', sort_order: 0 }
  const s1 = { ...base, id: 's1', title: 'Pull reports', parent_id: 'seq', item_type: 'step', sort_order: 0 }
  const s2 = { ...base, id: 's2', title: 'Reconcile', parent_id: 'seq', item_type: 'step', sort_order: 1 }
  const other = { ...base, id: 'o1', title: 'Other task', sort_order: 1 }
  const all = [seq, s1, s2, other]
  const byId = Object.fromEntries(all.map((t) => [t.id, t]))

  const render_ = (task, extra = {}) =>
    wrap(
      <TaskDetail
        task={task}
        workstream={ws}
        tasksById={byId}
        workstreamsById={{ w1: ws }}
        dependencies={[]}
        allTasksFlat={all}
        taskLinks={[]}
        onClose={noop}
        onNavigate={noop}
        onUpdate={noop}
        onSetStatus={noop}
        onDelete={noop}
        onCreateStep={noop}
        onReorderSteps={noop}
        onAddDependency={noop}
        onRemoveDependency={noop}
        onCompleteCycle={noop}
        onAddLink={noop}
        onRemoveLink={noop}
        {...extra}
      />
    )

  it('adds a step to the end of a sequence', () => {
    const onCreateStep = vi.fn()
    render_(seq, { onCreateStep })
    const input = screen.getByPlaceholderText('Add a step…')
    fireEvent.change(input, { target: { value: 'File it' } })
    fireEvent.submit(input.closest('form'))
    expect(onCreateStep).toHaveBeenCalledWith('seq', 'File it', 2)
  })

  it('ignores an empty step', () => {
    const onCreateStep = vi.fn()
    render_(seq, { onCreateStep })
    fireEvent.submit(screen.getByPlaceholderText('Add a step…').closest('form'))
    expect(onCreateStep).not.toHaveBeenCalled()
  })

  it('counts progress through the steps', () => {
    render_(seq, { allTasksFlat: [seq, { ...s1, status: 'done' }, s2, other] })
    expect(screen.getByText('1/2')).toBeTruthy()
  })

  it('walks into a step and back out to its sequence', () => {
    const onNavigate = vi.fn()
    render_(seq, { onNavigate })
    fireEvent.click(screen.getByText('Pull reports'))
    expect(onNavigate).toHaveBeenCalledWith('s1')

    onNavigate.mockClear()
    render_(s1, { onNavigate })
    fireEvent.click(screen.getAllByText('Close')[0])
    expect(onNavigate).toHaveBeenCalledWith('seq')
  })

  it('adds and removes a blocker', () => {
    const onAddDependency = vi.fn()
    render_(other, { onAddDependency })
    fireEvent.click(screen.getByText('Link a blocker'))
    fireEvent.click(screen.getByText('Close'))
    expect(onAddDependency).toHaveBeenCalledWith({ task_id: 'o1', depends_on_task_id: 'seq' })
  })

  it('filters the blocker picker as you type, and copes with no matches', () => {
    render_(other)
    fireEvent.click(screen.getByText('Link a blocker'))
    const search = screen.getByPlaceholderText('Search tasks…')
    fireEvent.change(search, { target: { value: 'zzzz' } })
    expect(screen.getByText('No matching tasks.')).toBeTruthy()
  })

  it('closes the picker again', () => {
    render_(other)
    fireEvent.click(screen.getByText('Link a blocker'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.getByText('Link a blocker')).toBeTruthy()
  })

  it('shows what this task is holding up', () => {
    render_(seq, { dependencies: [{ id: 'd1', task_id: 'o1', depends_on_task_id: 'seq' }] })
    expect(screen.getByText('This blocks')).toBeTruthy()
    expect(screen.getByText(/Other task/)).toBeTruthy()
  })

  it('removes a blocker', () => {
    const onRemoveDependency = vi.fn()
    render_(other, {
      dependencies: [{ id: 'd1', task_id: 'o1', depends_on_task_id: 'seq' }],
      onRemoveDependency,
    })
    fireEvent.click(screen.getByText('Close').closest('div').querySelector('button:last-of-type'))
    expect(onRemoveDependency).toHaveBeenCalledWith('d1')
  })

  it('confirms before deleting, and can be called off', () => {
    const onDelete = vi.fn()
    render_(other, { onDelete })
    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.getByText('Delete')).toBeTruthy()
    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(screen.getAllByText('Delete').find((n) => n.tagName === 'BUTTON'))
    expect(onDelete).toHaveBeenCalledWith('o1')
  })

  it('warns that deleting a sequence takes its steps', () => {
    render_(seq)
    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByText(/all its steps/)).toBeTruthy()
  })

  it('offers the cycle reset only once every step is done', () => {
    const onCompleteCycle = vi.fn()
    const recurring = { ...seq, recurrence_unit: 'month', recurrence_interval: 1 }
    const { rerender } = render_(recurring)
    expect(screen.queryByText(/Finish this cycle/)).toBeNull()
    rerender(
      <ThemeProvider>
        <TaskDetail
          task={recurring}
          workstream={ws}
          tasksById={byId}
          workstreamsById={{ w1: ws }}
          dependencies={[]}
          allTasksFlat={[recurring, { ...s1, status: 'done' }, { ...s2, status: 'done' }]}
          taskLinks={[]}
          onClose={noop}
          onNavigate={noop}
          onUpdate={noop}
          onSetStatus={noop}
          onDelete={noop}
          onCreateStep={noop}
          onReorderSteps={noop}
          onAddDependency={noop}
          onRemoveDependency={noop}
          onCompleteCycle={onCompleteCycle}
          onAddLink={noop}
          onRemoveLink={noop}
        />
      </ThemeProvider>
    )
    fireEvent.click(screen.getByText(/Finish this cycle/))
    expect(onCompleteCycle).toHaveBeenCalled()
  })

  it('sets a due date', () => {
    const onUpdate = vi.fn()
    render_(other, { onUpdate })
    fireEvent.change(document.querySelector('input[type="date"]'), {
      target: { value: '2026-09-01' },
    })
    expect(onUpdate).toHaveBeenCalledWith('o1', { due_date: '2026-09-01' })
  })

  it('clears a due date back to nothing rather than an empty string', () => {
    const onUpdate = vi.fn()
    render_({ ...other, due_date: '2026-09-01' }, { onUpdate })
    fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: '' } })
    expect(onUpdate).toHaveBeenCalledWith('o1', { due_date: null })
  })
})

// ---------------------------------------------------------------------------

describe('lineParts', () => {
  const base = { workstream_id: 'w1', parent_id: null, item_type: 'standalone', status: 'todo' }

  it('returns at most the requested number of actions', () => {
    const tasks = Array.from({ length: 6 }, (_, i) => ({
      ...base,
      id: `t${i}`,
      title: `Task ${i}`,
      sort_order: i,
    }))
    expect(upcomingActions(tasks, 3)).toHaveLength(3)
    expect(upcomingActions(tasks, 10)).toHaveLength(6)
  })

  it('is empty for a finished line', () => {
    expect(upcomingActions([{ ...base, id: 'a', status: 'done', sort_order: 0 }])).toEqual([])
  })

  it('draws a dashed track for a line with only upkeep', () => {
    const { container } = wrap(
      <ProgressTrack
        workstream={{ id: 'w1', color: '#6C4FA0' }}
        summary={{ hasFiniteWork: false, progress: 0 }}
      />
    )
    expect(container.innerHTML).toContain('repeating-linear-gradient')
  })

  it('draws a filled track with a marker for finite work', () => {
    const { container } = wrap(
      <ProgressTrack
        workstream={{ id: 'w1', color: '#6C4FA0' }}
        summary={{ hasFiniteWork: true, progress: 0.5 }}
      />
    )
    expect(container.innerHTML).not.toContain('repeating-linear-gradient')
    expect(container.innerHTML).toContain('50%')
  })
})

// ---------------------------------------------------------------------------

describe('dates', () => {
  it('describes every relative window', () => {
    expect(formatDue(null)).toBe(null)
    expect(formatDue(day(0))).toEqual({ label: 'Today', tone: 'due' })
    expect(formatDue(day(1))).toEqual({ label: 'Tomorrow', tone: 'soon' })
    expect(formatDue(day(4))).toEqual({ label: 'In 4d', tone: 'soon' })
    expect(formatDue(day(-2))).toEqual({ label: '2d overdue', tone: 'overdue' })
    expect(formatDue(day(30)).tone).toBe('later')
  })

  it('gives today in the format the database expects', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('lineStyle', () => {
  it('leaves ordinary colors unadorned', () => {
    expect(lineFill('#6C4FA0', '#6C4FA0')).toEqual({ background: '#6C4FA0' })
    expect(lineBorderColor('#6C4FA0', '#6C4FA0')).toBe('#6C4FA0')
  })

  it('outlines the one low-contrast exception', () => {
    // Amber can't clear 3:1 on white, so it gets an edge to hold its shape.
    expect(lineFill('#E08E0B', '#E08E0B').boxShadow).toBeTruthy()
    expect(lineBorderColor('#E08E0B', '#E08E0B')).toContain('rgba')
  })

  it('keys off the stored color, not the theme-swapped one', () => {
    expect(lineFill('#somethingelse', '#E08E0B').boxShadow).toBeTruthy()
  })
})

describe('links', () => {
  it('keeps a balanced bracket but drops an unbalanced one', () => {
    expect(extractLinks('(see https://example.com/a)')[0].label).toBe('https://example.com/a')
    expect(extractLinks('https://en.wikipedia.org/wiki/Foo_(bar)')[0].label).toContain('(bar)')
  })

  it('falls back gracefully for an unparseable value', () => {
    expect(shortenLink('not a url')).toBe('not a url')
  })

  it('keeps the root path tidy', () => {
    expect(shortenLink('https://example.com')).toBe('example.com')
  })
})

describe('recurrence helpers', () => {
  it('knows what does and does not repeat', () => {
    expect(isRecurring({ recurrence_unit: 'day' })).toBe(true)
    expect(isRecurring({})).toBe(false)
    expect(isRecurring(null)).toBe(false)
  })

  it('gives a compact label for dense rows', () => {
    expect(shortRecurrence({ recurrence_unit: 'week', recurrence_interval: 2 })).toBe('2w')
    expect(shortRecurrence({ recurrence_unit: 'month', recurrence_interval: 1 })).toBe('1mo')
    expect(shortRecurrence({})).toBe(null)
  })

  it('exposes the units and weekdays the editor needs', () => {
    expect(UNITS.map((u) => u.value)).toEqual(['day', 'week', 'month', 'year'])
    expect(WEEKDAYS).toHaveLength(7)
  })

  it('treats an unknown unit as days rather than throwing', () => {
    const next = computeNextDue(
      { recurrence_unit: 'fortnight', recurrence_interval: 1, due_date: day(0) },
      day(0)
    )
    expect(next).toBe(day(1))
  })

  it('describes an interval of one in plain words', () => {
    expect(describeRecurrence({ recurrence_unit: 'day', recurrence_interval: 1 })).toBe('Daily')
    expect(describeRecurrence({ recurrence_unit: 'year', recurrence_interval: 1 })).toBe('Yearly')
  })
})

describe('notification preferences', () => {
  beforeEach(() => {
    delete globalThis.Notification
  })

  it('reports a browser with no support', () => {
    expect(supported()).toBe(false)
    expect(permission()).toBe('unsupported')
    expect(runCheck({ workstreams: [], tasksByWorkstream: {}, prefs: { enabled: true } })).toEqual([])
  })

  it('does not prompt when permission was already decided', async () => {
    globalThis.Notification = { permission: 'denied', requestPermission: vi.fn() }
    expect(await requestPermission()).toBe('denied')
    expect(globalThis.Notification.requestPermission).not.toHaveBeenCalled()
  })

  it('returns unsupported rather than throwing when there is no API', async () => {
    expect(await requestPermission()).toBe('unsupported')
  })

  it('treats a rejected prompt as a refusal', async () => {
    globalThis.Notification = {
      permission: 'default',
      requestPermission: () => Promise.reject(new Error('nope')),
    }
    expect(await requestPermission()).toBe('denied')
  })

  it('starts from sensible defaults and remembers changes', () => {
    expect(getPrefs()).toEqual(DEFAULT_PREFS)
    setPrefs({ dailyTime: '07:30' })
    expect(getPrefs().dailyTime).toBe('07:30')
    expect(getPrefs().enabled).toBe(false)
  })

  it('survives a corrupted preferences blob', () => {
    localStorage.setItem('lines-notify-prefs', '{not json')
    expect(getPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('can forget what it has already sent', () => {
    globalThis.Notification = { permission: 'granted' }
    const ws = { id: 'w1', name: 'W', status: 'active' }
    const tasks = {
      w1: [
        {
          workstream_id: 'w1',
          parent_id: null,
          item_type: 'standalone',
          status: 'todo',
          id: 'a',
          title: 'X',
          due_date: day(0),
          sort_order: 0,
        },
      ],
    }
    const emit = vi.fn()
    const now = new Date()
    now.setHours(23, 0, 0, 0)
    const args = { workstreams: [ws], tasksByWorkstream: tasks, prefs: { ...DEFAULT_PREFS, enabled: true }, now, emit }
    runCheck(args)
    const first = emit.mock.calls.length
    resetSentLog()
    runCheck(args)
    expect(emit.mock.calls.length).toBeGreaterThan(first)
  })
})

// ---------------------------------------------------------------------------

import { reorderOnDrop } from '../src/components/SortableList'

describe('drop calculation', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('moves an item down the list', () => {
    expect(reorderOnDrop(items, { active: { id: 'a' }, over: { id: 'c' } }).map((i) => i.id)).toEqual(
      ['b', 'c', 'a']
    )
  })

  it('moves an item up the list', () => {
    expect(reorderOnDrop(items, { active: { id: 'c' }, over: { id: 'a' } }).map((i) => i.id)).toEqual(
      ['c', 'a', 'b']
    )
  })

  it('does nothing when dropped where it started', () => {
    expect(reorderOnDrop(items, { active: { id: 'a' }, over: { id: 'a' } })).toBe(null)
  })

  it('does nothing when dropped outside the list', () => {
    expect(reorderOnDrop(items, { active: { id: 'a' }, over: null })).toBe(null)
  })

  it('ignores a drag of something no longer present', () => {
    // A realtime delete can land mid-drag.
    expect(reorderOnDrop(items, { active: { id: 'gone' }, over: { id: 'a' } })).toBe(null)
    expect(reorderOnDrop(items, { active: { id: 'a' }, over: { id: 'gone' } })).toBe(null)
  })

  it('leaves the original array untouched', () => {
    reorderOnDrop(items, { active: { id: 'a' }, over: { id: 'c' } })
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })
})
