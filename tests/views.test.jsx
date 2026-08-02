import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ThemeProvider } from '../src/lib/theme'
import DashboardView from '../src/components/DashboardView'
import WorkstreamView, { buildReorderUpdates } from '../src/components/WorkstreamView'

const noop = () => {}
const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>)

const ws = { id: 'w1', name: 'Website', color: '#6C4FA0', status: 'active', sort_order: 0 }
const ws2 = { id: 'w2', name: 'Finance', color: '#A34E1F', status: 'active', sort_order: 1 }
const base = { workstream_id: 'w1', parent_id: null, item_type: 'standalone', status: 'todo', notes: '' }

// ---------------------------------------------------------------------------
// DashboardView
// ---------------------------------------------------------------------------

describe('DashboardView', () => {
  const render_ = (tasks, extra = {}) =>
    wrap(
      <DashboardView
        workstreams={[ws]}
        tasksByWorkstream={{ w1: tasks }}
        dependencies={[]}
        tasksById={Object.fromEntries(tasks.map((t) => [t.id, t]))}
        onOpen={noop}
        onNewWorkstream={noop}
        onReorder={noop}
        {...extra}
      />
    )

  it('opens a row with the keyboard as well as the mouse', () => {
    // The row is a div with role=button, so Enter and Space need wiring by
    // hand — a real button would inherit them.
    const onOpen = vi.fn()
    render_([{ ...base, id: 't1', title: 'A task', sort_order: 0 }], { onOpen })
    const row = screen.getByRole('button', { name: 'Open Website' })
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith('w1')
    fireEvent.keyDown(row, { key: ' ' })
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('ignores keys that are not activation keys', () => {
    const onOpen = vi.fn()
    render_([], { onOpen })
    for (const key of ['Tab', 'Escape', 'a', 'ArrowDown']) {
      fireEvent.keyDown(screen.getByRole('button', { name: 'Open Website' }), { key })
    }
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('names what the next action is waiting on', () => {
    const blocker = { id: 'x', title: 'Budget sign-off', workstream_id: 'w2', status: 'todo' }
    wrap(
      <DashboardView
        workstreams={[ws]}
        tasksByWorkstream={{ w1: [{ ...base, id: 't1', title: 'Blocked', sort_order: 0 }] }}
        dependencies={[{ id: 'd1', task_id: 't1', depends_on_task_id: 'x' }]}
        tasksById={{ x: blocker }}
        onOpen={noop}
        onNewWorkstream={noop}
        onReorder={noop}
      />
    )
    expect(screen.getByText(/Waiting on "Budget sign-off"/)).toBeTruthy()
  })

  it('stops flagging a blocker once it is done', () => {
    const blocker = { id: 'x', title: 'Budget sign-off', workstream_id: 'w2', status: 'done' }
    wrap(
      <DashboardView
        workstreams={[ws]}
        tasksByWorkstream={{ w1: [{ ...base, id: 't1', title: 'Was blocked', sort_order: 0 }] }}
        dependencies={[{ id: 'd1', task_id: 't1', depends_on_task_id: 'x' }]}
        tasksById={{ x: blocker }}
        onOpen={noop}
        onNewWorkstream={noop}
        onReorder={noop}
      />
    )
    expect(screen.queryByText(/Waiting on/)).toBeNull()
  })

  it('ignores a dependency pointing at a task that no longer exists', () => {
    // A deleted blocker must not crash the whole overview.
    expect(() =>
      wrap(
        <DashboardView
          workstreams={[ws]}
          tasksByWorkstream={{ w1: [{ ...base, id: 't1', title: 'Orphan dep', sort_order: 0 }] }}
          dependencies={[{ id: 'd1', task_id: 't1', depends_on_task_id: 'gone' }]}
          tasksById={{}}
          onOpen={noop}
          onNewWorkstream={noop}
          onReorder={noop}
        />
      )
    ).not.toThrow()
    expect(screen.queryByText(/Waiting on/)).toBeNull()
  })

  it('does not confuse another task blocker with this one', () => {
    const blocker = { id: 'x', title: 'Budget sign-off', workstream_id: 'w2', status: 'todo' }
    wrap(
      <DashboardView
        workstreams={[ws]}
        tasksByWorkstream={{ w1: [{ ...base, id: 't1', title: 'Next up', sort_order: 0 }] }}
        // The dependency belongs to a different task entirely.
        dependencies={[{ id: 'd1', task_id: 'someone-else', depends_on_task_id: 'x' }]}
        tasksById={{ x: blocker }}
        onOpen={noop}
        onNewWorkstream={noop}
        onReorder={noop}
      />
    )
    expect(screen.queryByText(/Waiting on/)).toBeNull()
  })

  it('marks a recurring next action', () => {
    render_([
      {
        ...base,
        id: 't1',
        title: 'Weekly review',
        sort_order: 0,
        recurrence_unit: 'week',
        recurrence_interval: 1,
      },
    ])
    expect(screen.getByText('Weekly review')).toBeTruthy()
    // It's the next action, so the "nothing due" wording must not appear.
    expect(screen.queryByText('Upkeep only — nothing due')).toBeNull()
  })

  it('counts lines needing attention in the subtitle', () => {
    wrap(
      <DashboardView
        workstreams={[ws, { ...ws2, status: 'blocked' }]}
        tasksByWorkstream={{}}
        dependencies={[]}
        tasksById={{}}
        onOpen={noop}
        onNewWorkstream={noop}
        onReorder={noop}
      />
    )
    expect(screen.getByText(/1 need attention/)).toBeTruthy()
    expect(screen.getByText(/2 lines/)).toBeTruthy()
  })

  it('uses the singular for a single line', () => {
    render_([])
    expect(screen.getByText(/^1 line$/)).toBeTruthy()
  })

  it('starts a new line from the empty state', () => {
    const onNewWorkstream = vi.fn()
    wrap(
      <DashboardView
        workstreams={[]}
        tasksByWorkstream={{}}
        dependencies={[]}
        tasksById={{}}
        onOpen={noop}
        onNewWorkstream={onNewWorkstream}
        onReorder={noop}
      />
    )
    fireEvent.click(screen.getByText('Add your first line'))
    expect(onNewWorkstream).toHaveBeenCalled()
  })

  it('says a line of pure upkeep has nothing due', () => {
    render_([
      {
        ...base,
        id: 't1',
        title: 'Weekly review',
        status: 'done',
        sort_order: 0,
        recurrence_unit: 'week',
        recurrence_interval: 1,
      },
    ])
    expect(screen.getByText('Upkeep only — nothing due')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// WorkstreamView
// ---------------------------------------------------------------------------

describe('buildReorderUpdates', () => {
  it('numbers the open items from zero', () => {
    expect(buildReorderUpdates([{ id: 'a' }, { id: 'b' }])).toEqual([
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 1 },
    ])
  })

  it('renumbers completed items after the open ones', () => {
    // Leaving their old values would let a done task collide with an open one
    // and make the next drop ambiguous.
    expect(
      buildReorderUpdates([{ id: 'a' }, { id: 'b' }], [{ id: 'x' }, { id: 'y' }])
    ).toEqual([
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 1 },
      { id: 'x', sort_order: 2 },
      { id: 'y', sort_order: 3 },
    ])
  })

  it('handles a list with nothing open', () => {
    expect(buildReorderUpdates([], [{ id: 'x' }])).toEqual([{ id: 'x', sort_order: 0 }])
  })

  it('handles a list with nothing done', () => {
    expect(buildReorderUpdates([{ id: 'a' }])).toEqual([{ id: 'a', sort_order: 0 }])
  })

  it('produces no duplicate orderings', () => {
    const out = buildReorderUpdates([{ id: 'a' }, { id: 'b' }], [{ id: 'x' }])
    expect(new Set(out.map((u) => u.sort_order)).size).toBe(out.length)
  })

  it('is empty for an empty line', () => {
    expect(buildReorderUpdates([], [])).toEqual([])
  })
})

describe('WorkstreamView interactions', () => {
  const render_ = (tasks, extra = {}) =>
    wrap(
      <WorkstreamView
        workstream={ws}
        tasks={tasks}
        dependencies={[]}
        tasksById={Object.fromEntries(tasks.map((t) => [t.id, t]))}
        workstreamsById={{ w1: ws, w2: ws2 }}
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

  it('opens a sequence instead of ticking it off', () => {
    // A sequence isn't done until its steps are, so its circle navigates in
    // rather than pretending the whole thing can be completed in one click.
    const onOpenTask = vi.fn()
    const onToggleStatus = vi.fn()
    render_([{ ...base, id: 'seq', title: 'Monthly close', item_type: 'sequence', sort_order: 0 }], {
      onOpenTask,
      onToggleStatus,
    })
    fireEvent.click(screen.getByLabelText('Mark done'))
    expect(onOpenTask).toHaveBeenCalled()
    expect(onToggleStatus).not.toHaveBeenCalled()
  })

  it('ticks a standalone task off and back on', () => {
    const onToggleStatus = vi.fn()
    const { rerender } = render_([{ ...base, id: 't1', title: 'A task', sort_order: 0 }], {
      onToggleStatus,
    })
    fireEvent.click(screen.getByLabelText('Mark done'))
    expect(onToggleStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 'done')

    rerender(
      <ThemeProvider>
        <WorkstreamView
          workstream={ws}
          tasks={[{ ...base, id: 't1', title: 'A task', status: 'done', sort_order: 0 }]}
          dependencies={[]}
          tasksById={{}}
          workstreamsById={{ w1: ws }}
          taskLinks={[]}
          onBack={noop}
          onEditWorkstream={noop}
          onOpenTask={noop}
          onCreateTask={noop}
          onToggleStatus={onToggleStatus}
          onReorderTasks={noop}
        />
      </ThemeProvider>
    )
    fireEvent.click(screen.getByText('1 done'))
    fireEvent.click(screen.getByLabelText('Mark not done'))
    expect(onToggleStatus).toHaveBeenLastCalledWith(expect.objectContaining({ id: 't1' }), 'todo')
  })

  it('opens a completed task from the done section', () => {
    const onOpenTask = vi.fn()
    render_(
      [
        { ...base, id: 't1', title: 'Open one', sort_order: 0 },
        { ...base, id: 't2', title: 'Finished one', status: 'done', sort_order: 1 },
      ],
      { onOpenTask }
    )
    fireEvent.click(screen.getByText('1 done'))
    fireEvent.click(screen.getByText('Finished one'))
    expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }))
  })

  it('refuses a whitespace-only task', () => {
    const onCreateTask = vi.fn()
    render_([], { onCreateTask })
    fireEvent.click(screen.getByText('Task'))
    const input = screen.getByPlaceholderText('New task…')
    fireEvent.change(input, { target: { value: '    ' } })
    fireEvent.submit(input.closest('form'))
    expect(onCreateTask).not.toHaveBeenCalled()
  })

  it('trims a title before creating', () => {
    const onCreateTask = vi.fn()
    render_([], { onCreateTask })
    fireEvent.click(screen.getByText('Task'))
    const input = screen.getByPlaceholderText('New task…')
    fireEvent.change(input, { target: { value: '  Padded title  ' } })
    fireEvent.submit(input.closest('form'))
    expect(onCreateTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Padded title' }))
  })

  it('adds new items after the ones already there', () => {
    const onCreateTask = vi.fn()
    render_(
      [
        { ...base, id: 't1', title: 'First', sort_order: 0 },
        { ...base, id: 't2', title: 'Second', sort_order: 1 },
      ],
      { onCreateTask }
    )
    fireEvent.click(screen.getByText('Task'))
    const input = screen.getByPlaceholderText('New task…')
    fireEvent.change(input, { target: { value: 'Third' } })
    fireEvent.submit(input.closest('form'))
    expect(onCreateTask).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 2 }))
  })

  it('keeps a half-typed draft when the field loses focus', () => {
    render_([])
    fireEvent.click(screen.getByText('Task'))
    const input = screen.getByPlaceholderText('New task…')
    fireEvent.change(input, { target: { value: 'half a thought' } })
    fireEvent.blur(input)
    expect(screen.getByDisplayValue('half a thought')).toBeTruthy()
  })

  it('shows the count of related tasks on a row', () => {
    render_([{ ...base, id: 't1', title: 'Linked task', sort_order: 0 }], {
      taskLinks: [
        { id: 'l1', task_a_id: 't1', task_b_id: 'other' },
        { id: 'l2', task_a_id: 'another', task_b_id: 't1' },
      ],
    })
    expect(screen.getByTitle('2 related tasks')).toBeTruthy()
  })

  it('shows a due badge and a repeat rule together', () => {
    render_([
      {
        ...base,
        id: 't1',
        title: 'Recurring dated task',
        due_date: '2026-12-01',
        sort_order: 0,
        recurrence_unit: 'month',
        recurrence_interval: 2,
      },
    ])
    expect(screen.getByText('Every 2 months')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Regressions from the audit
// ---------------------------------------------------------------------------

import { summarizeWorkstream } from '../src/lib/api'
import { dueItems } from '../src/lib/notifications'
import { DashboardHeader } from '../src/components/DashboardView'

describe('a finished sequence stops claiming to be the next action', () => {
  const t = (o) => ({ workstream_id: 'w1', item_type: 'standalone', status: 'todo', sort_order: 0, ...o })

  it('reports nothing left when every step is done', () => {
    // It used to fall back to the sequence container, so the line never read
    // "all caught up" no matter how much you finished.
    const s = summarizeWorkstream([
      t({ id: 'seq', title: 'Close', item_type: 'sequence', parent_id: null }),
      t({ id: 's1', title: 'Step', item_type: 'step', parent_id: 'seq', status: 'done' }),
    ])
    expect(s.nextAction).toBe(null)
  })

  it('still points at a sequence with no steps yet', () => {
    // Adding the first step genuinely is the next action.
    const s = summarizeWorkstream([
      t({ id: 'seq', title: 'Empty sequence', item_type: 'sequence', parent_id: null }),
    ])
    expect(s.nextAction?.title).toBe('Empty sequence')
  })

  it('moves on to the next line item once a sequence is finished', () => {
    const s = summarizeWorkstream([
      t({ id: 'seq', title: 'Close', item_type: 'sequence', parent_id: null }),
      t({ id: 's1', title: 'Step', item_type: 'step', parent_id: 'seq', status: 'done' }),
      t({ id: 'other', title: 'Something else', parent_id: null, sort_order: 1 }),
    ])
    expect(s.nextAction?.title).toBe('Something else')
  })
})

describe('reminders for a recurring checklist', () => {
  const ws = { id: 'w1', name: 'Ops', status: 'active' }
  const t = (o) => ({ workstream_id: 'w1', item_type: 'standalone', status: 'todo', sort_order: 0, ...o })

  it('uses the sequence date when its steps carry none', () => {
    // A recurring checklist keeps its date on the container and leaves the
    // steps undated, so keying only off the step meant no reminder ever fired.
    const { overdue } = dueItems(
      [ws],
      {
        w1: [
          t({ id: 'seq', title: 'Monthly close', item_type: 'sequence', parent_id: null, due_date: '2020-01-01' }),
          t({ id: 's1', title: 'Step', item_type: 'step', parent_id: 'seq' }),
        ],
      },
      '2026-08-02'
    )
    expect(overdue.map((x) => x.item.title)).toEqual(['Monthly close'])
  })

  it('still prefers a dated step over the container', () => {
    const { overdue } = dueItems(
      [ws],
      {
        w1: [
          t({ id: 'seq', title: 'Monthly close', item_type: 'sequence', parent_id: null, due_date: '2020-01-01' }),
          t({ id: 's1', title: 'Dated step', item_type: 'step', parent_id: 'seq', due_date: '2020-02-01' }),
        ],
      },
      '2026-08-02'
    )
    expect(overdue.map((x) => x.item.title)).toEqual(['Dated step'])
  })

  it('says nothing about an undated sequence', () => {
    const { overdue, dueToday } = dueItems(
      [ws],
      { w1: [t({ id: 'seq', title: 'No dates anywhere', item_type: 'sequence', parent_id: null })] },
      '2026-08-02'
    )
    expect(overdue).toHaveLength(0)
    expect(dueToday).toHaveLength(0)
  })
})

describe('archived lines', () => {
  it('offers to reveal them, and says how many', () => {
    const onToggleArchived = vi.fn()
    wrap(
      <DashboardHeader
        workstreams={[ws]}
        onNewWorkstream={noop}
        archivedCount={3}
        showArchived={false}
        onToggleArchived={onToggleArchived}
      />
    )
    const toggle = screen.getByText(/Show 3 archived/)
    expect(toggle).toBeTruthy()
    fireEvent.click(toggle)
    expect(onToggleArchived).toHaveBeenCalled()
  })

  it('offers to hide them again', () => {
    wrap(
      <DashboardHeader
        workstreams={[ws]}
        onNewWorkstream={noop}
        archivedCount={3}
        showArchived
        onToggleArchived={noop}
      />
    )
    expect(screen.getByText(/Hide 3 archived/)).toBeTruthy()
  })

  it('stays out of the way when there are none', () => {
    wrap(<DashboardHeader workstreams={[ws]} onNewWorkstream={noop} archivedCount={0} />)
    expect(screen.queryByText(/archived/)).toBeNull()
  })

  it('is the same header every layout renders', () => {
    // Two copies of this markup is how the list view drifted from the others.
    const src = require('fs').readFileSync('src/components/DashboardView.jsx', 'utf8')
    expect(src.split('System map').length - 1).toBe(1)
  })
})
