import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'

// A fake backend with real in-memory storage, so App's data flow, optimistic
// updates and reload cycle are exercised end to end rather than stubbed out.
const fake = vi.hoisted(() => {
  const db = { workstreams: [], tasks: [], dependencies: [], task_links: [], inbox_items: [] }
  let n = 0
  const id = (p) => `${p}-${++n}`
  const state = { session: { user: { id: 'user-1' } }, failNext: null, authCb: null }

  const maybeFail = () => {
    if (state.failNext) {
      const e = state.failNext
      state.failNext = null
      throw e
    }
  }

  return {
    db,
    state,
    reset() {
      for (const k of Object.keys(db)) db[k] = []
      n = 0
      state.failNext = null
      state.session = { user: { id: 'user-1' } }
    },
    api: {
      getSession: async () => state.session,
      onAuthStateChange: (cb) => {
        state.authCb = cb
        return { unsubscribe: () => {} }
      },
      signOut: vi.fn(async () => {}),
      signIn: vi.fn(async () => ({})),
      signUp: vi.fn(async () => ({})),
      subscribeToTable: () => () => {},

      listWorkstreams: async () => [...db.workstreams].sort((a, b) => a.sort_order - b.sort_order),
      listAllTasks: async () => [...db.tasks].sort((a, b) => a.sort_order - b.sort_order),
      listDependencies: async () => [...db.dependencies],
      listTaskLinks: async () => [...db.task_links],
      listInbox: async () => [...db.inbox_items],

      createWorkstream: async (row) => {
        maybeFail()
        const w = { id: id('w'), status: 'active', ...row }
        db.workstreams.push(w)
        return w
      },
      updateWorkstream: async (wid, patch) => {
        maybeFail()
        const w = db.workstreams.find((x) => x.id === wid)
        Object.assign(w, patch)
        return w
      },
      deleteWorkstream: async (wid) => {
        maybeFail()
        db.workstreams = db.workstreams.filter((x) => x.id !== wid)
        db.tasks = db.tasks.filter((t) => t.workstream_id !== wid)
      },
      createTask: async (row) => {
        maybeFail()
        const t = {
          id: id('t'),
          status: 'todo',
          item_type: 'standalone',
          parent_id: null,
          notes: '',
          due_date: null,
          sort_order: 0,
          ...row,
        }
        db.tasks.push(t)
        return t
      },
      updateTask: async (tid, patch) => {
        maybeFail()
        const t = db.tasks.find((x) => x.id === tid)
        if (!t) throw Object.assign(new Error('no such row'), { status: 406 })
        Object.assign(t, patch)
        return t
      },
      setTaskStatus: async (tid, status) => {
        maybeFail()
        const t = db.tasks.find((x) => x.id === tid)
        Object.assign(t, { status, completed_at: status === 'done' ? 'now' : null })
        return t
      },
      deleteTask: async (tid) => {
        maybeFail()
        db.tasks = db.tasks.filter((x) => x.id !== tid && x.parent_id !== tid)
      },
      reorderTasks: async (updates) => {
        maybeFail()
        for (const u of updates) {
          const t = db.tasks.find((x) => x.id === u.id)
          if (t) t.sort_order = u.sort_order
        }
      },
      reorderWorkstreams: async (updates) => {
        maybeFail()
        for (const u of updates) {
          const w = db.workstreams.find((x) => x.id === u.id)
          if (w) w.sort_order = u.sort_order
        }
      },
      completeRecurring: async (task, nextDue) => {
        maybeFail()
        const t = db.tasks.find((x) => x.id === task.id)
        Object.assign(t, {
          due_date: nextDue,
          status: 'todo',
          recurrence_count: (t.recurrence_count || 0) + 1,
        })
        return t
      },
      resetSequenceCycle: async (seq, stepIds, nextDue) => {
        maybeFail()
        for (const sid of stepIds) {
          const s = db.tasks.find((x) => x.id === sid)
          if (s) s.status = 'todo'
        }
        const t = db.tasks.find((x) => x.id === seq.id)
        Object.assign(t, { due_date: nextDue, status: 'todo' })
        return t
      },
      addDependency: async (row) => {
        maybeFail()
        const d = { id: id('d'), ...row }
        db.dependencies.push(d)
        return d
      },
      removeDependency: async (did) => {
        maybeFail()
        db.dependencies = db.dependencies.filter((x) => x.id !== did)
      },
      addTaskLink: async (a, b) => {
        maybeFail()
        const [x, y] = a < b ? [a, b] : [b, a]
        const l = { id: id('l'), task_a_id: x, task_b_id: y, note: '' }
        db.task_links.push(l)
        return l
      },
      removeTaskLink: async (lid) => {
        maybeFail()
        db.task_links = db.task_links.filter((x) => x.id !== lid)
      },
      addInboxItem: async (text) => {
        maybeFail()
        const i = { id: id('i'), text, created_at: new Date().toISOString() }
        db.inbox_items.push(i)
        return i
      },
      deleteInboxItem: async (iid) => {
        maybeFail()
        db.inbox_items = db.inbox_items.filter((x) => x.id !== iid)
      },
    },
  }
})

// Only the network-touching functions are faked. The pure derivations
// (summarizeWorkstream, buildWorkstreamTree, linksFor…) stay real, since
// replacing them would test the mock rather than the app.
vi.mock('../src/lib/api', async (orig) => ({ ...(await orig()), ...fake.api }))
vi.mock('../src/lib/supabaseClient', () => ({ supabase: {}, isConfigured: true }))

const App = (await import('../src/App')).default
const { ThemeProvider } = await import('../src/lib/theme')

// Rendering settles an async load, so the initial paint is wrapped in act to
// keep genuine warnings from being buried under act() noise.
const renderApp = async () => {
  let utils
  await act(async () => {
    utils = render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    )
  })
  return utils
}

// Nav renders twice — once in the header for wide screens, once fixed to the
// bottom for phones — and "Lines" is also the wordmark, so this scopes the
// click to an actual nav element.
const clickNav = (label) => {
  for (const nav of screen.getAllByRole('navigation')) {
    const item = within(nav).queryByText(label)
    if (item) return fireEvent.click(item)
  }
  throw new Error(`no nav item labelled ${label}`)
}

const setOnline = (value) => {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

async function addLine(name) {
  fireEvent.click(screen.getByText('New line'))
  fireEvent.change(await screen.findByPlaceholderText(/Website redesign/), {
    target: { value: name },
  })
  fireEvent.click(screen.getByText('Create line'))
  await waitFor(() => expect(screen.queryByText('Create line')).toBeNull())
}

beforeEach(() => {
  fake.reset()
  localStorage.clear()
  setOnline(true)
  window.matchMedia = (q) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
})

afterEach(() => vi.useRealTimers())

// ---------------------------------------------------------------------------

describe('App — happy path', () => {
  it('shows the empty state before anything exists', async () => {
    await renderApp()
    expect(await screen.findByText('No lines yet')).toBeTruthy()
  })

  it('creates a line and opens it', async () => {
    await renderApp()
    await screen.findByText('No lines yet')
    await addLine('Website redesign')
    await waitFor(() => expect(fake.db.workstreams).toHaveLength(1))
    // Creating a line jumps straight into it.
    expect(await screen.findByText('Website redesign')).toBeTruthy()
  })

  it('adds a task, completes it, and files it under done', async () => {
    await renderApp()
    await screen.findByText('No lines yet')
    await addLine('Website redesign')

    fireEvent.click(await screen.findByText('Task'))
    const input = screen.getByPlaceholderText('New task…')
    fireEvent.change(input, { target: { value: 'Send the brief' } })
    fireEvent.click(screen.getByText('Add'))
    await waitFor(() => expect(fake.db.tasks).toHaveLength(1))

    fireEvent.click(await screen.findByLabelText('Mark done'))
    await waitFor(() => expect(fake.db.tasks[0].status).toBe('done'))
    expect(await screen.findByText('1 done')).toBeTruthy()
  })

  it('captures to the inbox and triages into a line', async () => {
    await renderApp()
    await screen.findByText('No lines yet')
    await addLine('Website redesign')
    fireEvent.click(screen.getByText('All lines'))

    fireEvent.click(await screen.findByText('Quick capture'))
    const cap = screen.getByPlaceholderText(/Capture anything/)
    fireEvent.change(cap, { target: { value: 'random thought' } })
    fireEvent.submit(cap.closest('form'))
    await waitFor(() => expect(fake.db.inbox_items).toHaveLength(1))

    clickNav('Inbox')
    fireEvent.click(await screen.findByText(/Send to a line/))
    fireEvent.click(await screen.findByText('Website redesign'))
    await waitFor(() => {
      expect(fake.db.inbox_items).toHaveLength(0)
      expect(fake.db.tasks.some((t) => t.title === 'random thought')).toBe(true)
    })
  })

  it('moves between the three sections', async () => {
    await renderApp()
    await screen.findByText('No lines yet')
    clickNav('Today')
    expect(await screen.findByText(/single next step from every active line/)).toBeTruthy()
    clickNav('Inbox')
    expect(await screen.findByText(/Inbox zero/)).toBeTruthy()
    clickNav('Lines')
    expect(await screen.findByText('System map')).toBeTruthy()
  })

  it('deletes a line and everything in it', async () => {
    await renderApp()
    await screen.findByText('No lines yet')
    await addLine('Doomed')
    fireEvent.click(await screen.findByLabelText('Edit line'))
    fireEvent.click(await screen.findByText('Delete line'))
    fireEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(fake.db.workstreams).toHaveLength(0))
    expect(await screen.findByText('No lines yet')).toBeTruthy()
  })

  it('signs out and clears the cached snapshot behind it', async () => {
    await renderApp()
    await screen.findByText('No lines yet')
    await addLine('Private')
    await waitFor(() => expect(localStorage.getItem('lines-snapshot')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Sign out'))
    // Otherwise the next account to sign in on this browser sees the last one's data.
    expect(localStorage.getItem('lines-snapshot')).toBe(null)
    expect(fake.api.signOut).toHaveBeenCalled()
  })
})

describe('App — auth gate', () => {
  it('shows the sign-in screen with no session', async () => {
    fake.state.session = null
    await renderApp()
    expect(await screen.findByText('Welcome back')).toBeTruthy()
  })

  it('lets the app in once a session arrives', async () => {
    fake.state.session = null
    await renderApp()
    await screen.findByText('Welcome back')
    await act(async () => {
      fake.state.authCb({ user: { id: 'user-1' } })
    })
    expect(await screen.findByText('System map')).toBeTruthy()
  })
})

describe('App — offline', () => {
  it('queues an edit made offline and shows what is waiting', async () => {
    await renderApp()
    await screen.findByText('No lines yet')
    await addLine('Website redesign')
    fireEvent.click(screen.getByText('All lines'))
    await screen.findByText('System map')

    setOnline(false)
    fireEvent.click(await screen.findByText('Quick capture'))
    const cap = screen.getByPlaceholderText(/Capture anything/)
    fireEvent.change(cap, { target: { value: 'offline thought' } })
    fireEvent.submit(cap.closest('form'))

    // Visible straight away, but not on the server yet.
    expect(await screen.findByText(/Offline/)).toBeTruthy()
    expect(fake.db.inbox_items).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('lines-outbox'))).toHaveLength(1)
  })

  it('replays the queue when the connection returns', async () => {
    await renderApp()
    await screen.findByText('No lines yet')
    await addLine('Website redesign')
    fireEvent.click(screen.getByText('All lines'))
    await screen.findByText('System map')

    setOnline(false)
    fireEvent.click(await screen.findByText('Quick capture'))
    const cap = screen.getByPlaceholderText(/Capture anything/)
    fireEvent.change(cap, { target: { value: 'offline thought' } })
    fireEvent.submit(cap.closest('form'))
    await screen.findByText(/Offline/)

    await act(async () => setOnline(true))
    await waitFor(() => expect(fake.db.inbox_items).toHaveLength(1))
    expect(fake.db.inbox_items[0].text).toBe('offline thought')
    await waitFor(() => expect(JSON.parse(localStorage.getItem('lines-outbox'))).toHaveLength(0))
  })

  it('keeps a line created offline usable, then syncs it with a real id', async () => {
    // The bug this guards: the local id used to reach the server verbatim.
    await renderApp()
    await screen.findByText('No lines yet')
    setOnline(false)
    await addLine('Made offline')
    expect(await screen.findByText('Made offline')).toBeTruthy()
    expect(fake.db.workstreams).toHaveLength(0)

    await act(async () => setOnline(true))
    await waitFor(() => expect(fake.db.workstreams).toHaveLength(1))
    expect(fake.db.workstreams[0].name).toBe('Made offline')
  })

  it('recovers from a load failure by showing the cached snapshot', async () => {
    await renderApp()
    await screen.findByText('No lines yet')
    await addLine('Cached line')
    fireEvent.click(screen.getByText('All lines'))
    await screen.findByText('Cached line')

    // Reload with the network refusing.
    const original = fake.api.listWorkstreams
    fake.api.listWorkstreams = async () => {
      throw new Error('network down')
    }
    const { unmount } = await renderApp()
    expect(await screen.findAllByText('Cached line')).not.toHaveLength(0)
    fake.api.listWorkstreams = original
    unmount()
  })
})

describe('App — layouts', () => {
  beforeEach(() => {
    // Pretend we're on a tablet or wider.
    window.matchMedia = (q) => ({
      matches: q.includes('768px'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  })

  it('switches layout and remembers the choice', async () => {
    await renderApp()
    await screen.findByText('No lines yet')
    fireEvent.click(screen.getByLabelText('Grid'))
    await waitFor(() => expect(localStorage.getItem('lines-layout')).toBe('grid'))
    fireEvent.click(screen.getByLabelText('Timeline'))
    await waitFor(() => expect(localStorage.getItem('lines-layout')).toBe('timeline'))
  })

  it('restores a saved layout on the next visit', async () => {
    localStorage.setItem('lines-layout', 'timeline')
    await renderApp()
    await waitFor(() =>
      expect(screen.getByLabelText('Timeline').getAttribute('aria-checked')).toBe('true')
    )
  })

  it('ignores a nonsense saved layout', async () => {
    localStorage.setItem('lines-layout', 'hologram')
    await renderApp()
    await waitFor(() =>
      expect(screen.getByLabelText('List').getAttribute('aria-checked')).toBe('true')
    )
  })
})

describe('App — recurring completion', () => {
  it('rolls forward and says so instead of disappearing', async () => {
    fake.db.workstreams.push({ id: 'w1', name: 'Ops', color: '#6C4FA0', status: 'active', sort_order: 0 })
    fake.db.tasks.push({
      id: 't1',
      workstream_id: 'w1',
      parent_id: null,
      item_type: 'standalone',
      title: 'Weekly review',
      status: 'todo',
      notes: '',
      due_date: '2026-08-03',
      sort_order: 0,
      recurrence_unit: 'week',
      recurrence_interval: 1,
      recurrence_anchor: 'schedule',
      recurrence_count: 0,
    })
    await renderApp()
    fireEvent.click(await screen.findByText('Ops'))
    fireEvent.click(await screen.findByLabelText('Mark done'))
    await waitFor(() => expect(fake.db.tasks[0].recurrence_count).toBe(1))
    expect(fake.db.tasks[0].status).toBe('todo')
    // A tick that appears to do nothing reads as a bug, so it's confirmed.
    expect(await screen.findByText(/next one/)).toBeTruthy()
  })
})

describe('App — server rejection', () => {
  it('reports a failed write rather than leaving the optimistic edit as a lie', async () => {
    await renderApp()
    await screen.findByText('No lines yet')
    fake.state.failNext = new Error('violates check constraint')
    fireEvent.click(screen.getByText('New line'))
    fireEvent.change(await screen.findByPlaceholderText(/Website redesign/), {
      target: { value: 'Doomed' },
    })
    fireEvent.click(screen.getByText('Create line'))
    expect(await screen.findByText(/violates check constraint/)).toBeTruthy()
    expect(fake.db.workstreams).toHaveLength(0)
  })
})

describe('App — the other layouts in place', () => {
  beforeEach(() => {
    window.matchMedia = (q) => ({
      matches: q.includes('768px'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    fake.db.workstreams.push(
      { id: 'w1', name: 'Website', color: '#6C4FA0', status: 'active', sort_order: 0 },
      { id: 'w2', name: 'Hiring', color: '#A34E1F', status: 'blocked', sort_order: 1 }
    )
    fake.db.tasks.push(
      {
        id: 't1',
        workstream_id: 'w1',
        parent_id: null,
        item_type: 'standalone',
        title: 'Send the brief',
        status: 'todo',
        notes: '',
        due_date: '2026-08-05',
        sort_order: 0,
      },
      {
        id: 't2',
        workstream_id: 'w2',
        parent_id: null,
        item_type: 'standalone',
        title: 'Review portfolios',
        status: 'todo',
        notes: '',
        due_date: null,
        sort_order: 0,
      }
    )
  })

  it('shows several upcoming actions per card in the grid', async () => {
    localStorage.setItem('lines-layout', 'grid')
    await renderApp()
    expect(await screen.findByText('Send the brief')).toBeTruthy()
    expect(screen.getByText('Review portfolios')).toBeTruthy()
  })

  it('opens a line straight from a grid card', async () => {
    localStorage.setItem('lines-layout', 'grid')
    await renderApp()
    fireEvent.click(await screen.findByText('Website'))
    expect(await screen.findByText('All lines')).toBeTruthy()
  })

  it('lays every line out as a timeline track', async () => {
    localStorage.setItem('lines-layout', 'timeline')
    await renderApp()
    expect(await screen.findByText(/Only dated work appears here/)).toBeTruthy()
    expect(screen.getByText('Website')).toBeTruthy()
  })

  it('works a line without leaving the split view', async () => {
    localStorage.setItem('lines-layout', 'split')
    await renderApp()
    const rail = await screen.findByRole('navigation', { name: 'Lines' })
    fireEvent.click(within(rail).getByText('Hiring'))
    const detail = await screen.findByRole('region', { name: 'Hiring details' })
    expect(within(detail).getByText('Review portfolios')).toBeTruthy()
    // No back-and-forth: both are on screen at once.
    expect(within(rail).getByText('Website')).toBeTruthy()
  })

  it('opens a task from the split view and saves an edit to it', async () => {
    localStorage.setItem('lines-layout', 'split')
    await renderApp()
    const detail = await screen.findByRole('region', { name: 'Website details' })
    fireEvent.click(within(detail).getByText('Send the brief'))
    const notes = await screen.findByPlaceholderText(/context worth remembering/)
    fireEvent.change(notes, { target: { value: 'from the split view' } })
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(fake.db.tasks[0].notes).toBe('from the split view'))
  })

  it('opens settings and reports the connection', async () => {
    await renderApp()
    fireEvent.click(await screen.findByLabelText('Settings'))
    expect(await screen.findByText('Settings')).toBeTruthy()
    expect(screen.getByText('Connected')).toBeTruthy()
  })
})
