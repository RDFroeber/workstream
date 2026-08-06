import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ThemeProvider } from '../src/lib/theme'
import { todayISO } from '../src/lib/dates'
import { applyLocally } from '../src/lib/offline'
import TodayView, { pickedItems } from '../src/components/TodayView'
import WorkstreamView from '../src/components/WorkstreamView'
import { searchAll } from '../src/lib/search'

const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>)

beforeEach(() => {
  localStorage.clear()
})

const TODAY = '2026-08-06'
const YESTERDAY = '2026-08-05'
const TOMORROW = '2026-08-07'

// ---------------------------------------------------------------------------
// pickedItems — the pure selection logic
// ---------------------------------------------------------------------------

describe('pickedItems', () => {
  const ws = { id: 'w1', name: 'Deep work', color: '#123456', status: 'active' }
  const archived = { id: 'w2', name: 'Old', color: '#123456', status: 'archived' }

  it('collects incomplete picked tasks and skips done, sequences, and archived lines', () => {
    const tasks = {
      w1: [
        { id: 'a', item_type: 'standalone', status: 'todo', focus_date: TODAY, sort_order: 0 },
        { id: 'b', item_type: 'standalone', status: 'done', focus_date: TODAY, sort_order: 1 },
        { id: 'c', item_type: 'sequence', status: 'todo', focus_date: TODAY, sort_order: 2 },
        { id: 'd', item_type: 'step', status: 'todo', focus_date: TODAY, sort_order: 3 },
        { id: 'e', item_type: 'standalone', status: 'todo', focus_date: null, sort_order: 4 },
      ],
      w2: [{ id: 'f', item_type: 'standalone', status: 'todo', focus_date: TODAY, sort_order: 0 }],
    }
    const out = pickedItems([ws, archived], tasks, TODAY)
    expect(out.map((p) => p.item.id)).toEqual(['a', 'd'])
  })

  it('carries over picks from earlier days and marks them, but ignores future ones', () => {
    const tasks = {
      w1: [
        { id: 'old', item_type: 'standalone', status: 'todo', focus_date: YESTERDAY, sort_order: 0 },
        { id: 'now', item_type: 'standalone', status: 'todo', focus_date: TODAY, sort_order: 1 },
        { id: 'future', item_type: 'standalone', status: 'todo', focus_date: TOMORROW, sort_order: 2 },
      ],
    }
    const out = pickedItems([ws], tasks, TODAY)
    expect(out.map((p) => p.item.id)).toEqual(['old', 'now'])
    expect(out[0].carriedOver).toBe(true)
    expect(out[1].carriedOver).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TodayView — the section, no double-listing, unpick control
// ---------------------------------------------------------------------------

describe('TodayView with picks', () => {
  const ws = { id: 'w1', name: 'Deep work', color: '#123456', status: 'active' }
  const noop = () => {}

  it('shows picked tasks in their own section and not again in the others', () => {
    // "Write the memo" is due today AND is the line's next action — it must
    // appear once, in the picked section, or the day looks twice as long.
    const tasks = {
      w1: [
        {
          id: 't1',
          item_type: 'standalone',
          status: 'todo',
          title: 'Write the memo',
          due_date: todayISO(),
          focus_date: todayISO(),
          sort_order: 0,
        },
      ],
    }
    wrap(
      <TodayView
        workstreams={[ws]}
        tasksByWorkstream={tasks}
        onOpenTask={noop}
        onToggleStatus={noop}
        onToggleFocus={noop}
      />
    )
    expect(screen.getByText('Picked for today')).toBeTruthy()
    expect(screen.getAllByText('Write the memo')).toHaveLength(1)
    expect(screen.queryByText('Due today')).toBeNull()
  })

  it('unpicking calls onToggleFocus with the task', () => {
    const onToggleFocus = vi.fn()
    const task = {
      id: 't1',
      item_type: 'standalone',
      status: 'todo',
      title: 'Write the memo',
      due_date: null,
      focus_date: todayISO(),
      sort_order: 0,
    }
    wrap(
      <TodayView
        workstreams={[ws]}
        tasksByWorkstream={{ w1: [task] }}
        onOpenTask={noop}
        onToggleStatus={noop}
        onToggleFocus={onToggleFocus}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove Write the memo from today' }))
    expect(onToggleFocus).toHaveBeenCalledWith(task)
  })

  it('offers a pick control on the unpicked rows below', () => {
    const onToggleFocus = vi.fn()
    const task = {
      id: 't1',
      item_type: 'standalone',
      status: 'todo',
      title: 'Sharpen the axe',
      due_date: null,
      focus_date: null,
      sort_order: 0,
    }
    wrap(
      <TodayView
        workstreams={[ws]}
        tasksByWorkstream={{ w1: [task] }}
        onOpenTask={noop}
        onToggleStatus={noop}
        onToggleFocus={onToggleFocus}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pick Sharpen the axe for today' }))
    // The "Next up" rows carry the tree-annotated task (steps: [] added), so
    // assert on identity by id rather than reference.
    expect(onToggleFocus).toHaveBeenCalledTimes(1)
    expect(onToggleFocus.mock.calls[0][0].id).toBe('t1')
  })

  it('labels carried-over picks', () => {
    const task = {
      id: 't1',
      item_type: 'standalone',
      status: 'todo',
      title: 'Still not done',
      due_date: null,
      focus_date: '2000-01-01',
      sort_order: 0,
    }
    wrap(
      <TodayView
        workstreams={[ws]}
        tasksByWorkstream={{ w1: [task] }}
        onOpenTask={noop}
        onToggleStatus={noop}
        onToggleFocus={noop}
      />
    )
    expect(screen.getByText('carried over')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// WorkstreamView — pick from the line itself
// ---------------------------------------------------------------------------

describe('WorkstreamView pick control', () => {
  const ws = { id: 'w1', name: 'Deep work', color: '#123456', status: 'active' }
  const noop = () => {}
  const renderView = (tasks, onToggleFocus = noop) =>
    wrap(
      <WorkstreamView
        workstream={ws}
        tasks={tasks}
        dependencies={[]}
        tasksById={Object.fromEntries(tasks.map((t) => [t.id, t]))}
        workstreamsById={{ w1: ws }}
        onBack={noop}
        onEditWorkstream={noop}
        onOpenTask={noop}
        onCreateTask={noop}
        onToggleStatus={noop}
        onReorderTasks={noop}
        onToggleFocus={onToggleFocus}
        taskLinks={[]}
      />
    )

  it('picks a task without opening it', () => {
    const onToggleFocus = vi.fn()
    const task = {
      id: 't1',
      workstream_id: 'w1',
      item_type: 'standalone',
      status: 'todo',
      title: 'Draft the plan',
      parent_id: null,
      sort_order: 0,
      focus_date: null,
    }
    renderView([task], onToggleFocus)
    fireEvent.click(screen.getByRole('button', { name: 'Pick Draft the plan for today' }))
    expect(onToggleFocus).toHaveBeenCalledTimes(1)
    expect(onToggleFocus.mock.calls[0][0].id).toBe('t1')
  })

  it('does not offer a pick on sequences — the pick lives on their steps', () => {
    const seq = {
      id: 'seq',
      workstream_id: 'w1',
      item_type: 'sequence',
      status: 'todo',
      title: 'Monthly close',
      parent_id: null,
      sort_order: 0,
    }
    renderView([seq])
    expect(screen.queryByRole('button', { name: /Pick Monthly close/ })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Completion retires the pick — locally and (mirrored) on the server
// ---------------------------------------------------------------------------

describe('completing a task clears its pick', () => {
  const base = () => ({
    workstreams: [{ id: 'w1' }],
    tasks: [
      {
        id: 't1',
        workstream_id: 'w1',
        item_type: 'standalone',
        status: 'todo',
        focus_date: TODAY,
        recurrence_unit: null,
      },
    ],
    dependencies: [],
    taskLinks: [],
    inbox: [],
  })

  it('setTaskStatus done clears focus_date; back to todo does not restore it', () => {
    let d = applyLocally(base(), 'setTaskStatus', ['t1', 'done'])
    expect(d.tasks[0].focus_date).toBeNull()
    d = applyLocally(d, 'setTaskStatus', ['t1', 'todo'])
    expect(d.tasks[0].focus_date).toBeNull()
  })

  it('completeRecurring rolls forward unpicked', () => {
    const data = base()
    data.tasks[0].recurrence_unit = 'day'
    const d = applyLocally(data, 'completeRecurring', [data.tasks[0], TOMORROW])
    expect(d.tasks[0].due_date).toBe(TOMORROW)
    expect(d.tasks[0].focus_date).toBeNull()
  })

  it('resetSequenceCycle clears picks on the reset steps', () => {
    const data = {
      workstreams: [{ id: 'w1' }],
      tasks: [
        { id: 'seq', item_type: 'sequence', status: 'todo', recurrence_unit: 'month' },
        { id: 's1', item_type: 'step', parent_id: 'seq', status: 'done', focus_date: TODAY },
      ],
      dependencies: [],
      taskLinks: [],
      inbox: [],
    }
    const d = applyLocally(data, 'resetSequenceCycle', [data.tasks[0], ['s1'], TOMORROW])
    const step = d.tasks.find((t) => t.id === 's1')
    expect(step.status).toBe('todo')
    expect(step.focus_date).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Search now covers inbox captures
// ---------------------------------------------------------------------------

describe('search includes the inbox', () => {
  it('finds an untriaged capture by its text', () => {
    const data = {
      workstreams: [],
      tasks: [],
      inbox: [{ id: 'i1', text: 'Call the plumber about the leak' }],
    }
    const results = searchAll('plumber', data)
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('inbox')
    expect(results[0].title).toBe('Call the plumber about the leak')
  })

  it('still returns nothing for a non-matching query', () => {
    const data = { workstreams: [], tasks: [], inbox: [{ id: 'i1', text: 'buy milk' }] }
    expect(searchAll('plumber', data)).toHaveLength(0)
  })
})
