import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ThemeProvider } from '../src/lib/theme'
import { todayISO } from '../src/lib/dates'
import { computeNextDue, parseISO, addDays, toISO } from '../src/lib/recurrence'
import {
  applyLocally,
  enqueue,
  getOutbox,
  overlayOutbox,
  flushOutbox,
  outboxCount,
  newId,
  clearOfflineState,
} from '../src/lib/offline'

const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>)

beforeEach(() => {
  localStorage.clear()
  clearOfflineState()
})

// ---------------------------------------------------------------------------
// todayISO must be the LOCAL date
//
// The old implementation sliced toISOString(), which is UTC. West of UTC the
// app flipped to "tomorrow" hours before midnight: the Today view marked
// tasks due today as overdue at 8pm Eastern, the daily reminder fired the
// evening before, and completing a recurring task after 8pm advanced it from
// the wrong day.
// ---------------------------------------------------------------------------

describe('todayISO', () => {
  const originalTZ = process.env.TZ

  afterEach(() => {
    vi.useRealTimers()
    if (originalTZ === undefined) delete process.env.TZ
    else process.env.TZ = originalTZ
  })

  it('returns the local date, not the UTC one, late in the evening', () => {
    process.env.TZ = 'America/New_York'
    // 9pm Eastern on Aug 6 = 1am UTC on Aug 7.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T01:00:00Z'))
    expect(todayISO()).toBe('2026-08-06')
  })

  it('returns the local date east of UTC too, early in the morning', () => {
    process.env.TZ = 'Asia/Tokyo'
    // 5am in Tokyo on Aug 7 = 8pm UTC on Aug 6.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-06T20:00:00Z'))
    expect(todayISO()).toBe('2026-08-07')
  })

  it('agrees with formatDue about which day "today" is', () => {
    // Whatever the environment's zone, the two must be computed the same way —
    // this is the pair that visibly contradicted each other in the UI.
    const local = new Date()
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
    expect(todayISO()).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// Snapshot + outbox: each queued edit applies exactly once
//
// The old flow saved the optimistic state as the snapshot AND replayed the
// queue over it at load, so a task created offline rendered twice after a
// reload. The contract now: the snapshot is server truth; overlayOutbox
// layers the queue on top, once, with stable temporary ids.
// ---------------------------------------------------------------------------

describe('overlayOutbox', () => {
  const base = () => ({
    workstreams: [{ id: 'w1', name: 'Line', color: '#123456', sort_order: 0 }],
    tasks: [],
    dependencies: [],
    taskLinks: [],
    inbox: [],
  })

  it('applies a queued create exactly once per load, however many loads happen', () => {
    const localId = newId()
    enqueue('createTask', [{ workstream_id: 'w1', title: 'Offline task' }], localId)

    const first = overlayOutbox(base())
    expect(first.tasks).toHaveLength(1)

    // The reload path: same base snapshot, same queue. Still one task.
    const second = overlayOutbox(base())
    expect(second.tasks).toHaveLength(1)
    expect(second.tasks[0].id).toBe(first.tasks[0].id)
  })

  it('replays with the recorded local id, so queued edits to an offline-created task land', () => {
    const localId = newId()
    enqueue('createTask', [{ workstream_id: 'w1', title: 'First draft' }], localId)
    enqueue('updateTask', [localId, { title: 'Renamed while still offline' }])

    const d = overlayOutbox(base())
    expect(d.tasks).toHaveLength(1)
    expect(d.tasks[0].id).toBe(localId)
    expect(d.tasks[0].title).toBe('Renamed while still offline')
  })
})

// ---------------------------------------------------------------------------
// flushOutbox: interrupted flushes must not lose the local→server id mapping
// ---------------------------------------------------------------------------

describe('flushOutbox id remapping survives an interruption', () => {
  it('rewrites the stored queue after a create, so the tail carries real ids', async () => {
    const localId = newId()
    enqueue('createTask', [{ workstream_id: 'w1', title: 'made offline' }], localId)
    enqueue('updateTask', [localId, { title: 'renamed offline' }])

    // First flush: the create lands, then the connection hiccups on the rename.
    let flaky = true
    const seen = []
    const handlers = {
      createTask: async () => ({ id: 'real-uuid-1' }),
      updateTask: async (id, patch) => {
        if (flaky) throw new TypeError('Failed to fetch')
        seen.push(id)
        return { id, ...patch }
      },
    }
    const first = await flushOutbox(handlers)
    expect(first.sent).toBe(1)
    expect(first.remaining).toBe(1)
    // The regression: the stored queue used to still say `local_…` here, and
    // the next flush sent that to Postgres, which rejected it as permanent.
    expect(JSON.stringify(getOutbox()[0].args)).not.toContain(localId)
    expect(getOutbox()[0].args[0]).toBe('real-uuid-1')

    // Second flush — a fresh call with no in-memory state — delivers the real id.
    flaky = false
    const second = await flushOutbox(handlers)
    expect(second.sent).toBe(1)
    expect(seen).toEqual(['real-uuid-1'])
    expect(outboxCount()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// flushOutbox: an expired session pauses the queue instead of dropping it
// ---------------------------------------------------------------------------

describe('flushOutbox on auth failure', () => {
  it('keeps every queued write and reports authNeeded on a 401', async () => {
    enqueue('createTask', [{ title: 'a' }])
    enqueue('createTask', [{ title: 'b' }])
    const res = await flushOutbox({
      createTask: async () => {
        throw { status: 401, message: 'JWT expired' }
      },
    })
    expect(res.authNeeded).toBe(true)
    expect(res.failed).toHaveLength(0)
    expect(res.remaining).toBe(2)
    // And no attempt was burned — signing back in shouldn't inherit a countdown.
    expect(getOutbox()[0].attempts).toBeUndefined()
  })

  it('treats PGRST301 the same way', async () => {
    enqueue('createTask', [{ title: 'a' }])
    const res = await flushOutbox({
      createTask: async () => {
        throw { code: 'PGRST301', message: 'JWT expired' }
      },
    })
    expect(res.authNeeded).toBe(true)
    expect(res.remaining).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// deleteTask cleans up references to a deleted sequence's steps
// ---------------------------------------------------------------------------

describe('applyLocally deleteTask', () => {
  it('removes dependencies and links that point at the deleted steps', () => {
    const d = {
      workstreams: [{ id: 'w1' }],
      tasks: [
        { id: 'seq', workstream_id: 'w1', item_type: 'sequence', parent_id: null },
        { id: 's1', workstream_id: 'w1', item_type: 'step', parent_id: 'seq' },
        { id: 'other', workstream_id: 'w1', item_type: 'standalone', parent_id: null },
      ],
      dependencies: [
        { id: 'd1', task_id: 'other', depends_on_task_id: 's1' }, // points at a step
        { id: 'd2', task_id: 'other', depends_on_task_id: 'seq' }, // points at the sequence
      ],
      taskLinks: [{ id: 'l1', task_a_id: 'other', task_b_id: 's1' }],
      inbox: [],
    }
    const after = applyLocally(d, 'deleteTask', ['seq'])
    expect(after.tasks.map((t) => t.id)).toEqual(['other'])
    // Both the step's and the sequence's references are gone — the step's
    // used to survive locally and leave the screen disagreeing with itself.
    expect(after.dependencies).toHaveLength(0)
    expect(after.taskLinks).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// computeNextDue catches up however long a task was neglected
// ---------------------------------------------------------------------------

describe('computeNextDue long-neglect catch-up', () => {
  it('brings a daily task ignored for three years back to tomorrow', () => {
    const task = {
      recurrence_unit: 'day',
      recurrence_interval: 1,
      recurrence_anchor: 'schedule',
      due_date: '2023-08-06',
    }
    // 400 loop iterations used to cap out ~13 months back — this returned a
    // date still in the past.
    const next = computeNextDue(task, '2026-08-06')
    expect(next).toBe('2026-08-07')
  })

  it('keeps a fortnightly cadence aligned to the original schedule', () => {
    const task = {
      recurrence_unit: 'week',
      recurrence_interval: 2,
      recurrence_anchor: 'schedule',
      due_date: '2010-01-04',
    }
    const next = computeNextDue(task, '2026-08-06')
    expect(next > '2026-08-06').toBe(true)
    const daysFromOrigin = Math.round((parseISO(next) - parseISO('2010-01-04')) / 86400000)
    expect(daysFromOrigin % 14).toBe(0)
    // And it's the first future occurrence, not one a cycle late.
    expect(toISO(addDays(parseISO(next), -14)) <= '2026-08-06').toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The blocker picker no longer offers tasks that already block this one
// ---------------------------------------------------------------------------

describe('TaskDetail blocker picker', () => {
  it('excludes existing blockers from the candidates', async () => {
    const TaskDetail = (await import('../src/components/TaskDetail')).default
    const t1 = { id: 't1', workstream_id: 'w1', item_type: 'standalone', title: 'Main', status: 'todo', notes: '' }
    const t2 = { id: 't2', workstream_id: 'w1', item_type: 'standalone', title: 'Already blocking', status: 'todo' }
    const t3 = { id: 't3', workstream_id: 'w1', item_type: 'standalone', title: 'Free candidate', status: 'todo' }
    const ws = { id: 'w1', name: 'Line', color: '#123456' }

    wrap(
      <TaskDetail
        task={t1}
        workstream={ws}
        tasksById={{ t1, t2, t3 }}
        workstreamsById={{ w1: ws }}
        dependencies={[{ id: 'd1', task_id: 't1', depends_on_task_id: 't2' }]}
        allTasksFlat={[t1, t2, t3]}
        onClose={() => {}}
        onNavigate={() => {}}
        onUpdate={() => {}}
        onSetStatus={() => {}}
        onDelete={() => {}}
        onCreateStep={() => {}}
        onReorderSteps={() => {}}
        onAddDependency={() => {}}
        onRemoveDependency={() => {}}
        onCompleteCycle={() => {}}
        taskLinks={[]}
        onAddLink={() => {}}
        onRemoveLink={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Link a blocker/ }))
    const picker = screen.getByPlaceholderText('Search tasks…').closest('div')
    // "Already blocking" appears in the blocked-by list above, but must not be
    // offered again inside the picker — that's how duplicates were made.
    expect(within(picker).queryByText('Already blocking')).toBeNull()
    expect(within(picker).getByText('Free candidate')).toBeTruthy()
  })
})
