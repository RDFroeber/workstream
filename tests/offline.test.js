import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  applyLocally,
  enqueue,
  getOutbox,
  dequeue,
  outboxCount,
  flushOutbox,
  saveSnapshot,
  loadSnapshot,
  clearOfflineState,
} from '../src/lib/offline'
import { dueItems, runCheck, DEFAULT_PREFS } from '../src/lib/notifications'
import { todayISO } from '../src/lib/dates'
import { parseISO, toISO, addDays } from '../src/lib/recurrence'

const day = (n) => toISO(addDays(parseISO(todayISO()), n))

const empty = () => ({
  workstreams: [],
  tasks: [],
  dependencies: [],
  taskLinks: [],
  inbox: [],
})

beforeEach(() => {
  localStorage.clear()
})

describe('optimistic local application', () => {
  it('creates a task that shows up immediately', () => {
    const d = applyLocally(empty(), 'createTask', [{ workstream_id: 'w1', title: 'Offline task' }])
    expect(d.tasks).toHaveLength(1)
    expect(d.tasks[0].title).toBe('Offline task')
    expect(d.tasks[0].status).toBe('todo')
    expect(d.tasks[0].id).toBeTruthy()
  })

  it('does not mutate the input', () => {
    const before = empty()
    applyLocally(before, 'createTask', [{ workstream_id: 'w1', title: 'x' }])
    expect(before.tasks).toHaveLength(0)
  })

  it('updates and completes a task', () => {
    let d = applyLocally(empty(), 'createTask', [{ workstream_id: 'w1', title: 'A' }])
    const id = d.tasks[0].id
    d = applyLocally(d, 'updateTask', [id, { title: 'B' }])
    expect(d.tasks[0].title).toBe('B')
    d = applyLocally(d, 'setTaskStatus', [id, 'done'])
    expect(d.tasks[0].status).toBe('done')
    expect(d.tasks[0].completed_at).toBeTruthy()
  })

  it('deleting a task takes its steps and links with it', () => {
    let d = empty()
    d.tasks = [
      { id: 'seq', workstream_id: 'w1', title: 'Seq', item_type: 'sequence', parent_id: null },
      { id: 's1', workstream_id: 'w1', title: 'Step', item_type: 'step', parent_id: 'seq' },
      { id: 'other', workstream_id: 'w1', title: 'Other', parent_id: null },
    ]
    d.taskLinks = [{ id: 'l1', task_a_id: 'other', task_b_id: 'seq' }]
    d.dependencies = [{ id: 'd1', task_id: 'other', depends_on_task_id: 'seq' }]
    const after = applyLocally(d, 'deleteTask', ['seq'])
    expect(after.tasks.map((t) => t.id)).toEqual(['other'])
    expect(after.taskLinks).toHaveLength(0)
    expect(after.dependencies).toHaveLength(0)
  })

  it('deleting a line removes its tasks', () => {
    let d = empty()
    d.workstreams = [{ id: 'w1', name: 'A' }, { id: 'w2', name: 'B' }]
    d.tasks = [
      { id: 't1', workstream_id: 'w1' },
      { id: 't2', workstream_id: 'w2' },
    ]
    const after = applyLocally(d, 'deleteWorkstream', ['w1'])
    expect(after.workstreams.map((w) => w.id)).toEqual(['w2'])
    expect(after.tasks.map((t) => t.id)).toEqual(['t2'])
  })

  it('rolls a recurring task forward rather than completing it', () => {
    let d = empty()
    d.tasks = [
      {
        id: 't1',
        workstream_id: 'w1',
        title: 'Weekly',
        status: 'todo',
        due_date: day(0),
        recurrence_unit: 'week',
        recurrence_interval: 1,
        recurrence_count: 2,
      },
    ]
    const after = applyLocally(d, 'completeRecurring', [d.tasks[0], day(7)])
    expect(after.tasks[0].status).toBe('todo')
    expect(after.tasks[0].due_date).toBe(day(7))
    expect(after.tasks[0].recurrence_count).toBe(3)
  })

  it('resets a sequence cycle', () => {
    let d = empty()
    const seq = { id: 'seq', workstream_id: 'w1', item_type: 'sequence', status: 'todo', recurrence_count: 0 }
    d.tasks = [
      seq,
      { id: 's1', parent_id: 'seq', status: 'done' },
      { id: 's2', parent_id: 'seq', status: 'done' },
    ]
    const after = applyLocally(d, 'resetSequenceCycle', [seq, ['s1', 's2'], day(30)])
    expect(after.tasks.filter((t) => t.parent_id === 'seq').every((t) => t.status === 'todo')).toBe(
      true
    )
    expect(after.tasks.find((t) => t.id === 'seq').due_date).toBe(day(30))
  })

  it('normalises a link pair and refuses a duplicate', () => {
    let d = applyLocally(empty(), 'addTaskLink', ['zzz', 'aaa'])
    expect(d.taskLinks[0].task_a_id).toBe('aaa')
    d = applyLocally(d, 'addTaskLink', ['aaa', 'zzz'])
    expect(d.taskLinks).toHaveLength(1)
  })

  it('applies a reorder', () => {
    let d = empty()
    d.tasks = [
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 1 },
    ]
    const after = applyLocally(d, 'reorderTasks', [
      [
        { id: 'a', sort_order: 1 },
        { id: 'b', sort_order: 0 },
      ],
    ])
    expect(after.tasks.find((t) => t.id === 'a').sort_order).toBe(1)
  })

  it('ignores an unknown op instead of throwing', () => {
    expect(() => applyLocally(empty(), 'nonsense', [])).not.toThrow()
  })
})

describe('outbox', () => {
  it('queues and counts', () => {
    enqueue('createTask', [{ title: 'A' }])
    enqueue('createTask', [{ title: 'B' }])
    expect(outboxCount()).toBe(2)
    expect(getOutbox()[0].op).toBe('createTask')
  })

  it('removes a single entry', () => {
    enqueue('createTask', [{ title: 'A' }])
    const id = getOutbox()[0].id
    dequeue(id)
    expect(outboxCount()).toBe(0)
  })

  it('replays oldest first', async () => {
    // Order matters: a task created offline then renamed must be created first.
    const seen = []
    enqueue('createTask', [{ title: 'A' }])
    enqueue('updateTask', ['id', { title: 'B' }])
    const res = await flushOutbox({
      createTask: async (...a) => seen.push(['createTask', a]),
      updateTask: async (...a) => seen.push(['updateTask', a]),
    })
    expect(seen.map((s) => s[0])).toEqual(['createTask', 'updateTask'])
    expect(res.sent).toBe(2)
    expect(outboxCount()).toBe(0)
  })

  it('stops at a transient failure and keeps the tail queued', async () => {
    enqueue('createTask', [{ title: 'A' }])
    enqueue('createTask', [{ title: 'B' }])
    const res = await flushOutbox({
      createTask: async () => {
        const e = new Error('gateway')
        e.status = 503
        throw e
      },
    })
    expect(res.sent).toBe(0)
    expect(outboxCount()).toBe(2)
  })

  it('drops a permanently rejected write rather than wedging the queue', async () => {
    enqueue('createTask', [{ title: 'bad' }])
    enqueue('createTask', [{ title: 'good' }])
    let calls = 0
    const res = await flushOutbox({
      createTask: async () => {
        calls++
        if (calls === 1) {
          const e = new Error('violates constraint')
          e.status = 400
          throw e
        }
      },
    })
    expect(res.sent).toBe(1)
    expect(res.failed).toHaveLength(1)
    expect(outboxCount()).toBe(0)
  })

  it('drops an op it no longer understands', async () => {
    enqueue('opFromAnOlderVersion', [])
    const res = await flushOutbox({})
    expect(res.failed[0].reason).toBe('unsupported')
    expect(outboxCount()).toBe(0)
  })
})

describe('snapshot', () => {
  it('round-trips with a timestamp', () => {
    const d = empty()
    d.workstreams = [{ id: 'w1', name: 'A' }]
    saveSnapshot(d)
    const snap = loadSnapshot()
    expect(snap.data.workstreams).toHaveLength(1)
    expect(typeof snap.savedAt).toBe('number')
  })

  it('returns null with nothing stored', () => {
    expect(loadSnapshot()).toBe(null)
  })

  it('is cleared on sign out, so the next account sees nothing of this one', () => {
    saveSnapshot(empty())
    enqueue('createTask', [{}])
    clearOfflineState()
    expect(loadSnapshot()).toBe(null)
    expect(outboxCount()).toBe(0)
  })
})

// ---------------------------------------------------------------------------

describe('due detection for reminders', () => {
  const ws = { id: 'w1', name: 'Website', status: 'active' }
  const base = { workstream_id: 'w1', parent_id: null, item_type: 'standalone', status: 'todo' }

  it('separates overdue from due today', () => {
    const tasks = {
      w1: [
        { ...base, id: 'a', title: 'Late', due_date: day(-2), sort_order: 0 },
        { ...base, id: 'b', title: 'Now', due_date: day(0), sort_order: 1 },
        { ...base, id: 'c', title: 'Later', due_date: day(5), sort_order: 2 },
      ],
    }
    const { overdue, dueToday } = dueItems([ws], tasks)
    expect(overdue.map((x) => x.item.id)).toEqual(['a'])
    expect(dueToday.map((x) => x.item.id)).toEqual(['b'])
  })

  it('ignores completed and undated work', () => {
    const tasks = {
      w1: [
        { ...base, id: 'a', title: 'Done', due_date: day(-1), status: 'done', sort_order: 0 },
        { ...base, id: 'b', title: 'Undated', sort_order: 1 },
      ],
    }
    const { overdue, dueToday } = dueItems([ws], tasks)
    expect(overdue).toHaveLength(0)
    expect(dueToday).toHaveLength(0)
  })

  it('only surfaces the current step of a sequence', () => {
    // Being reminded about step 5 of something not yet started is noise.
    const tasks = {
      w1: [
        { ...base, id: 'seq', title: 'Close', item_type: 'sequence', sort_order: 0 },
        { ...base, id: 's1', title: 'Step 1', parent_id: 'seq', item_type: 'step', due_date: day(0), sort_order: 0 },
        { ...base, id: 's2', title: 'Step 2', parent_id: 'seq', item_type: 'step', due_date: day(0), sort_order: 1 },
      ],
    }
    const { dueToday } = dueItems([ws], tasks)
    expect(dueToday.map((x) => x.item.id)).toEqual(['s1'])
  })

  it('skips archived lines', () => {
    const tasks = { w1: [{ ...base, id: 'a', title: 'X', due_date: day(0), sort_order: 0 }] }
    const { dueToday } = dueItems([{ ...ws, status: 'archived' }], tasks)
    expect(dueToday).toHaveLength(0)
  })
})

describe('reminder loop', () => {
  // jsdom has no Notification API, so without this stub runCheck bails out at
  // the permission gate and every assertion below passes for the wrong reason.
  beforeEach(() => {
    globalThis.Notification = { permission: 'granted' }
  })

  const ws = { id: 'w1', name: 'Website', status: 'active' }
  const tasksByWorkstream = {
    w1: [
      {
        workstream_id: 'w1',
        parent_id: null,
        item_type: 'standalone',
        status: 'todo',
        id: 'a',
        title: 'Send the brief',
        due_date: day(0),
        sort_order: 0,
      },
    ],
  }
  const at = (h, m = 0) => {
    const d = new Date()
    d.setHours(h, m, 0, 0)
    return d
  }

  it('stays silent when reminders are off', () => {
    const emit = vi.fn()
    runCheck({
      workstreams: [ws],
      tasksByWorkstream,
      prefs: { ...DEFAULT_PREFS, enabled: false },
      now: at(12),
      emit,
    })
    expect(emit).not.toHaveBeenCalled()
  })

  it('stays silent before the chosen time', () => {
    const emit = vi.fn()
    runCheck({
      workstreams: [ws],
      tasksByWorkstream,
      prefs: { ...DEFAULT_PREFS, enabled: true, dailyTime: '09:00' },
      now: at(7),
      emit,
    })
    expect(emit).not.toHaveBeenCalled()
  })

  it('fires once and only once per day', () => {
    // The loop ticks every minute; without the sent log this would fire 60
    // times an hour.
    const emit = vi.fn()
    const prefs = { ...DEFAULT_PREFS, enabled: true, dailyTime: '09:00' }
    const args = { workstreams: [ws], tasksByWorkstream, prefs, now: at(10), emit }
    runCheck(args)
    const first = emit.mock.calls.length
    runCheck(args)
    runCheck(args)
    expect(first).toBeGreaterThan(0)
    expect(emit.mock.calls.length).toBe(first)
  })

  it('says nothing when there is nothing due', () => {
    const emit = vi.fn()
    runCheck({
      workstreams: [ws],
      tasksByWorkstream: { w1: [] },
      prefs: { ...DEFAULT_PREFS, enabled: true },
      now: at(12),
      emit,
    })
    expect(emit).not.toHaveBeenCalled()
  })
})

describe('service worker config', () => {
  const cfg = fs.readFileSync(path.join(process.cwd(), 'vite.config.js'), 'utf8')

  it('falls back to the cached shell for navigations', () => {
    expect(cfg).toContain("navigateFallback: 'index.html'")
  })

  it('never caches Supabase responses', () => {
    // Serving stale task data that looks live would be worse than an error.
    expect(cfg).toMatch(/supabase[\s\S]{0,120}NetworkOnly/)
  })
})
