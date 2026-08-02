import { describe, it, expect, vi, beforeEach } from 'vitest'

// A stand-in for the Supabase query builder. Every chain method returns the
// builder, and the builder is thenable, so `await from().select().order()`
// resolves the same way the real client does. Calls are recorded so tests can
// assert on what would actually have hit the database.
const mocks = vi.hoisted(() => {
  const state = { calls: [], result: { data: [], error: null }, user: { id: 'user-1' } }

  const builder = () => {
    const chain = {}
    const record = (name) => (...args) => {
      state.calls.push({ method: name, args })
      return chain
    }
    for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single']) {
      chain[m] = record(m)
    }
    chain.then = (resolve, reject) => Promise.resolve(state.result).then(resolve, reject)
    return chain
  }

  const supabase = {
    from: (table) => {
      state.calls.push({ method: 'from', args: [table] })
      return builder()
    },
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      getSession: async () => ({ data: { session: state.session ?? null } }),
      signUp: async (creds) => {
        state.calls.push({ method: 'signUp', args: [creds] })
        return state.authResult ?? { data: { user: state.user }, error: null }
      },
      signInWithPassword: async (creds) => {
        state.calls.push({ method: 'signIn', args: [creds] })
        return state.authResult ?? { data: { user: state.user }, error: null }
      },
      signOut: async () => state.authResult ?? { error: null },
      resetPasswordForEmail: async (...args) => {
        state.calls.push({ method: 'resetPasswordForEmail', args })
        return state.authResult ?? { data: {}, error: null }
      },
      updateUser: async (...args) => {
        state.calls.push({ method: 'updateUser', args })
        return state.authResult ?? { data: { user: state.user }, error: null }
      },
      onAuthStateChange: (cb) => {
        state.authCallback = cb
        return { data: { subscription: { unsubscribe: () => state.calls.push({ method: 'unsub' }) } } }
      },
    },
    channel: (name) => {
      state.calls.push({ method: 'channel', args: [name] })
      const ch = {
        on: (...args) => {
          state.calls.push({ method: 'on', args })
          return ch
        },
        subscribe: () => {
          state.calls.push({ method: 'subscribe' })
          return ch
        },
      }
      return ch
    },
    removeChannel: (ch) => state.calls.push({ method: 'removeChannel', args: [ch] }),
  }

  return { state, supabase }
})

vi.mock('../src/lib/supabaseClient', () => ({
  supabase: mocks.supabase,
  isConfigured: true,
}))

const api = await import('../src/lib/api')

const lastCall = (method) => [...mocks.state.calls].reverse().find((c) => c.method === method)
const calledWith = (method) => lastCall(method)?.args

beforeEach(() => {
  mocks.state.calls = []
  mocks.state.result = { data: [], error: null }
  mocks.state.authResult = null
  mocks.state.session = null
})

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('auth', () => {
  it('signs up and signs in', async () => {
    await api.signUp('a@b.com', 'pw123456')
    expect(calledWith('signUp')[0]).toMatchObject({ email: 'a@b.com', password: 'pw123456' })
    await api.signIn('a@b.com', 'pw123456')
    expect(calledWith('signIn')[0].email).toBe('a@b.com')
  })

  it('tells Supabase where to send the confirmation link back to', async () => {
    // Without this the link is built from the project's Site URL, which
    // defaults to http://localhost:3000 — so every confirmation email points
    // at a machine the recipient isn't using.
    await api.signUp('a@b.com', 'pw123456')
    const redirect = calledWith('signUp')[0].options.emailRedirectTo
    expect(redirect).toBe(api.appUrl())
    expect(redirect).toMatch(/^https?:\/\//)
  })

  it('surfaces an auth error rather than swallowing it', async () => {
    mocks.state.authResult = { data: null, error: new Error('Invalid login credentials') }
    await expect(api.signIn('a@b.com', 'wrong')).rejects.toThrow('Invalid login credentials')
    await expect(api.signUp('a@b.com', 'wrong')).rejects.toThrow()
    await expect(api.signOut()).rejects.toThrow()
  })

  it('returns null when there is no session', async () => {
    expect(await api.getSession()).toBe(null)
  })

  it('returns the session when there is one', async () => {
    mocks.state.session = { user: { id: 'user-1' } }
    expect(await api.getSession()).toEqual({ user: { id: 'user-1' } })
  })

  it('hands back an unsubscribe handle for the auth listener', () => {
    const cb = vi.fn()
    const sub = api.onAuthStateChange(cb)
    mocks.state.authCallback('SIGNED_IN', { user: { id: 'user-1' } })
    expect(cb).toHaveBeenCalledWith({ user: { id: 'user-1' } }, 'SIGNED_IN')
    sub.unsubscribe()
    expect(lastCall('unsub')).toBeTruthy()
  })

  it('passes the event through, not only the session', () => {
    // A recovery link produces a normal-looking session; only the event
    // distinguishes it, and it decides whether to ask for a new password.
    const cb = vi.fn()
    api.onAuthStateChange(cb)
    mocks.state.authCallback('PASSWORD_RECOVERY', { user: { id: 'user-1' } })
    expect(cb).toHaveBeenCalledWith(expect.anything(), 'PASSWORD_RECOVERY')
  })

  it('asks for the reset link to come back to this copy of the app', async () => {
    await api.requestPasswordReset('a@b.com')
    const [email, opts] = calledWith('resetPasswordForEmail')
    expect(email).toBe('a@b.com')
    expect(opts.redirectTo).toBe(api.appUrl())
  })

  it('surfaces a failed reset request', async () => {
    mocks.state.authResult = { data: null, error: new Error('rate limited') }
    await expect(api.requestPasswordReset('a@b.com')).rejects.toThrow('rate limited')
  })

  it('sets a new password', async () => {
    await api.updatePassword('a-new-password')
    expect(calledWith('updateUser')[0]).toEqual({ password: 'a-new-password' })
  })

  it('surfaces a rejected password', async () => {
    mocks.state.authResult = { data: null, error: new Error('Password should be at least 6 characters') }
    await expect(api.updatePassword('short')).rejects.toThrow(/at least 6/)
  })
})

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

describe('reads', () => {
  it('lists workstreams in their stored order', async () => {
    mocks.state.result = { data: [{ id: 'w1' }], error: null }
    const out = await api.listWorkstreams()
    expect(out).toEqual([{ id: 'w1' }])
    expect(calledWith('from')[0]).toBe('workstreams')
    expect(calledWith('order')).toEqual(['sort_order', { ascending: true }])
  })

  it('scopes a task list to one workstream', async () => {
    await api.listTasksForWorkstream('w1')
    expect(calledWith('eq')).toEqual(['workstream_id', 'w1'])
  })

  it('lists all tasks, dependencies, links and inbox items', async () => {
    await api.listAllTasks()
    expect(calledWith('from')[0]).toBe('tasks')
    await api.listDependencies()
    expect(calledWith('from')[0]).toBe('dependencies')
    await api.listTaskLinks()
    expect(calledWith('from')[0]).toBe('task_links')
    await api.listInbox()
    expect(calledWith('from')[0]).toBe('inbox_items')
  })

  it('throws when the database returns an error', async () => {
    mocks.state.result = { data: null, error: new Error('permission denied') }
    await expect(api.listWorkstreams()).rejects.toThrow('permission denied')
    await expect(api.listAllTasks()).rejects.toThrow()
    await expect(api.listDependencies()).rejects.toThrow()
    await expect(api.listTaskLinks()).rejects.toThrow()
    await expect(api.listInbox()).rejects.toThrow()
    await expect(api.listTasksForWorkstream('w1')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

describe('writes', () => {
  it('stamps the owner on every insert', async () => {
    // Row-level security rejects a row without the right user_id, so this is
    // the difference between working and silently failing for every insert.
    mocks.state.result = { data: { id: 'w1' }, error: null }
    await api.createWorkstream({ name: 'A', color: '#000000' })
    expect(calledWith('insert')[0].user_id).toBe('user-1')

    await api.createTask({ workstream_id: 'w1', title: 'T' })
    expect(calledWith('insert')[0].user_id).toBe('user-1')

    await api.addDependency({ task_id: 't1', depends_on_task_id: 't2' })
    expect(calledWith('insert')[0].user_id).toBe('user-1')

    await api.addTaskLink('t1', 't2')
    expect(calledWith('insert')[0].user_id).toBe('user-1')

    await api.addInboxItem('captured')
    expect(calledWith('insert')[0].user_id).toBe('user-1')
  })

  it('gives a new task sane defaults', async () => {
    mocks.state.result = { data: { id: 't1' }, error: null }
    await api.createTask({ workstream_id: 'w1', title: 'T' })
    const row = calledWith('insert')[0]
    expect(row).toMatchObject({
      status: 'todo',
      item_type: 'standalone',
      parent_id: null,
      due_date: null,
      notes: '',
      recurrence_unit: null,
      recurrence_interval: 1,
      recurrence_anchor: 'schedule',
    })
  })

  it('carries recurrence through on create', async () => {
    mocks.state.result = { data: { id: 't1' }, error: null }
    await api.createTask({
      workstream_id: 'w1',
      title: 'T',
      recurrence_unit: 'week',
      recurrence_interval: 2,
      recurrence_days: [1, 4],
      recurrence_anchor: 'completion',
    })
    expect(calledWith('insert')[0]).toMatchObject({
      recurrence_unit: 'week',
      recurrence_interval: 2,
      recurrence_days: [1, 4],
      recurrence_anchor: 'completion',
    })
  })

  it('stamps completed_at when a task is finished and clears it when reopened', async () => {
    mocks.state.result = { data: { id: 't1' }, error: null }
    await api.setTaskStatus('t1', 'done')
    expect(calledWith('update')[0].completed_at).toBeTruthy()
    await api.setTaskStatus('t1', 'todo')
    expect(calledWith('update')[0].completed_at).toBe(null)
  })

  it('rolls a recurring task forward instead of completing it', async () => {
    mocks.state.result = { data: { id: 't1' }, error: null }
    await api.completeRecurring({ id: 't1', recurrence_count: 4 }, '2026-09-01')
    const patch = calledWith('update')[0]
    expect(patch.status).toBe('todo')
    expect(patch.due_date).toBe('2026-09-01')
    expect(patch.completed_at).toBe(null)
    expect(patch.recurrence_count).toBe(5)
    expect(patch.last_completed_at).toBeTruthy()
  })

  it('treats a missing recurrence count as zero', async () => {
    mocks.state.result = { data: { id: 't1' }, error: null }
    await api.completeRecurring({ id: 't1' }, '2026-09-01')
    expect(calledWith('update')[0].recurrence_count).toBe(1)
  })

  it('resets every step when a sequence cycle completes', async () => {
    mocks.state.result = { data: { id: 'seq' }, error: null }
    await api.resetSequenceCycle({ id: 'seq', recurrence_count: 0 }, ['s1', 's2'], '2026-09-01')
    const updates = mocks.state.calls.filter((c) => c.method === 'update')
    expect(updates.some((u) => u.args[0].status === 'todo' && u.args[0].completed_at === null)).toBe(
      true
    )
    expect(calledWith('update')[0].due_date).toBe('2026-09-01')
  })

  it('handles a sequence with no steps', async () => {
    mocks.state.result = { data: { id: 'seq' }, error: null }
    await expect(
      api.resetSequenceCycle({ id: 'seq', recurrence_count: 0 }, [], '2026-09-01')
    ).resolves.toBeTruthy()
  })

  it('normalises a link pair before inserting', async () => {
    mocks.state.result = { data: { id: 'l1' }, error: null }
    await api.addTaskLink('zzz', 'aaa')
    const row = calledWith('insert')[0]
    expect(row.task_a_id).toBe('aaa')
    expect(row.task_b_id).toBe('zzz')
  })

  it('refuses to link a task to itself', async () => {
    await expect(api.addTaskLink('t1', 't1')).rejects.toThrow(/itself/)
  })

  it('deletes workstreams, tasks, dependencies, links and inbox items', async () => {
    for (const [fn, table] of [
      [() => api.deleteWorkstream('w1'), 'workstreams'],
      [() => api.deleteTask('t1'), 'tasks'],
      [() => api.removeDependency('d1'), 'dependencies'],
      [() => api.removeTaskLink('l1'), 'task_links'],
      [() => api.deleteInboxItem('i1'), 'inbox_items'],
    ]) {
      mocks.state.calls = []
      await fn()
      expect(calledWith('from')[0]).toBe(table)
      expect(lastCall('delete')).toBeTruthy()
    }
  })

  it('throws when a write fails', async () => {
    mocks.state.result = { data: null, error: new Error('constraint violation') }
    await expect(api.createWorkstream({ name: 'A' })).rejects.toThrow('constraint violation')
    await expect(api.updateWorkstream('w1', {})).rejects.toThrow()
    await expect(api.deleteWorkstream('w1')).rejects.toThrow()
    await expect(api.createTask({ workstream_id: 'w1', title: 'T' })).rejects.toThrow()
    await expect(api.updateTask('t1', {})).rejects.toThrow()
    await expect(api.deleteTask('t1')).rejects.toThrow()
    await expect(api.addDependency({})).rejects.toThrow()
    await expect(api.removeDependency('d1')).rejects.toThrow()
    await expect(api.addTaskLink('a', 'b')).rejects.toThrow()
    await expect(api.removeTaskLink('l1')).rejects.toThrow()
    await expect(api.addInboxItem('x')).rejects.toThrow()
    await expect(api.deleteInboxItem('i1')).rejects.toThrow()
    await expect(api.reorderTasks([{ id: 't1', sort_order: 0 }])).rejects.toThrow()
    await expect(api.reorderWorkstreams([{ id: 'w1', sort_order: 0 }])).rejects.toThrow()
  })

  it('reorders without complaint when the list is empty', async () => {
    await expect(api.reorderTasks([])).resolves.toBeUndefined()
    await expect(api.reorderWorkstreams([])).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

describe('realtime', () => {
  it('subscribes scoped to the current user and returns a cleanup', () => {
    // Without the user filter every client would wake on every other user's row.
    const onChange = vi.fn()
    const off = api.subscribeToTable('tasks', 'user-1', onChange)
    expect(calledWith('channel')[0]).toBe('tasks-user-1')
    const onArgs = mocks.state.calls.find((c) => c.method === 'on').args
    expect(onArgs[1].filter).toBe('user_id=eq.user-1')
    expect(onArgs[1].table).toBe('tasks')
    off()
    expect(lastCall('removeChannel')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Pure derivations
// ---------------------------------------------------------------------------

describe('buildWorkstreamTree', () => {
  const t = (o) => ({ item_type: 'standalone', status: 'todo', sort_order: 0, ...o })

  it('returns an empty tree for no tasks', () => {
    expect(api.buildWorkstreamTree([])).toEqual([])
  })

  it('keeps steps out of the top level', () => {
    const tree = api.buildWorkstreamTree([
      t({ id: 'seq', item_type: 'sequence', parent_id: null }),
      t({ id: 's1', item_type: 'step', parent_id: 'seq' }),
    ])
    expect(tree.map((n) => n.id)).toEqual(['seq'])
    expect(tree[0].steps.map((s) => s.id)).toEqual(['s1'])
  })

  it('sorts steps and finds the first incomplete one', () => {
    const tree = api.buildWorkstreamTree([
      t({ id: 'seq', item_type: 'sequence', parent_id: null }),
      t({ id: 's2', item_type: 'step', parent_id: 'seq', sort_order: 1 }),
      t({ id: 's1', item_type: 'step', parent_id: 'seq', sort_order: 0, status: 'done' }),
    ])
    expect(tree[0].steps.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(tree[0].nextStep.id).toBe('s2')
    expect(tree[0].doneCount).toBe(1)
    expect(tree[0].totalSteps).toBe(2)
  })

  it('reports no next step when every step is done', () => {
    const tree = api.buildWorkstreamTree([
      t({ id: 'seq', item_type: 'sequence', parent_id: null }),
      t({ id: 's1', item_type: 'step', parent_id: 'seq', status: 'done' }),
    ])
    expect(tree[0].nextStep).toBe(null)
  })

  it('handles a sequence with no steps at all', () => {
    const tree = api.buildWorkstreamTree([t({ id: 'seq', item_type: 'sequence', parent_id: null })])
    expect(tree[0].steps).toEqual([])
    expect(tree[0].nextStep).toBe(null)
    expect(tree[0].totalSteps).toBe(0)
  })

  it('gives standalone tasks an empty steps list rather than undefined', () => {
    const tree = api.buildWorkstreamTree([t({ id: 'a', parent_id: null })])
    expect(tree[0].steps).toEqual([])
  })
})

describe('summarizeWorkstream', () => {
  const t = (o) => ({ item_type: 'standalone', status: 'todo', sort_order: 0, ...o })

  it('is empty and safe with no tasks', () => {
    const s = api.summarizeWorkstream([])
    expect(s).toMatchObject({ total: 0, done: 0, progress: 0, nextAction: null })
    expect(s.hasFiniteWork).toBe(false)
  })

  it('prefers the earliest due date for the next action', () => {
    const s = api.summarizeWorkstream([
      t({ id: 'a', title: 'Later', due_date: '2026-12-01', sort_order: 0 }),
      t({ id: 'b', title: 'Sooner', due_date: '2026-08-01', sort_order: 1 }),
    ])
    expect(s.nextAction.title).toBe('Sooner')
  })

  it('puts dated work ahead of undated work', () => {
    const s = api.summarizeWorkstream([
      t({ id: 'a', title: 'Undated', sort_order: 0 }),
      t({ id: 'b', title: 'Dated', due_date: '2026-12-01', sort_order: 1 }),
    ])
    expect(s.nextAction.title).toBe('Dated')
  })

  it('falls back to manual order when nothing is dated', () => {
    const s = api.summarizeWorkstream([
      t({ id: 'b', title: 'Second', sort_order: 1 }),
      t({ id: 'a', title: 'First', sort_order: 0 }),
    ])
    expect(s.nextAction.title).toBe('First')
  })

  it('offers a sequence current step rather than the sequence itself', () => {
    const s = api.summarizeWorkstream([
      t({ id: 'seq', title: 'Seq', item_type: 'sequence', parent_id: null }),
      t({ id: 's1', title: 'Step one', item_type: 'step', parent_id: 'seq' }),
    ])
    expect(s.nextAction.title).toBe('Step one')
  })

  it('reports no next action when everything is done', () => {
    const s = api.summarizeWorkstream([t({ id: 'a', status: 'done' })])
    expect(s.nextAction).toBe(null)
    expect(s.progress).toBe(1)
  })
})
