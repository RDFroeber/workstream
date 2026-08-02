import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import {
  isPermanentFailure,
  MAX_ATTEMPTS,
  enqueue,
  flushOutbox,
  outboxCount,
  getOutbox,
} from '../src/lib/offline'
import Modal from '../src/components/Modal'
import ThemeToggle from '../src/components/ThemeToggle'
import { ThemeProvider } from '../src/lib/theme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

// ---------------------------------------------------------------------------
// Recognising a write that will never succeed
// ---------------------------------------------------------------------------

describe('isPermanentFailure', () => {
  it('recognises a Postgres constraint violation', () => {
    // The shape Supabase actually raises: a string SQLSTATE, no numeric status.
    // Checking only for a 4xx status classified this as transient, so one of
    // these would retry forever and block everything queued behind it.
    expect(isPermanentFailure({ code: '23505', message: 'duplicate key value' })).toBe(true)
    expect(isPermanentFailure({ code: '23503', message: 'foreign key violation' })).toBe(true)
    expect(isPermanentFailure({ code: '23514', message: 'check constraint' })).toBe(true)
  })

  it('recognises PostgREST request errors', () => {
    expect(isPermanentFailure({ code: 'PGRST116', message: 'no rows returned' })).toBe(true)
    expect(isPermanentFailure({ code: 'PGRST301', message: 'JWT expired' })).toBe(true)
  })

  it('recognises data and access errors', () => {
    expect(isPermanentFailure({ code: '22P02', message: 'invalid input syntax' })).toBe(true)
    expect(isPermanentFailure({ code: '42501', message: 'permission denied' })).toBe(true)
  })

  it('still handles an HTTP-shaped 4xx', () => {
    expect(isPermanentFailure({ status: 400 })).toBe(true)
    expect(isPermanentFailure({ status: 403 })).toBe(true)
  })

  it('treats server trouble and rate limiting as worth retrying', () => {
    expect(isPermanentFailure({ status: 500 })).toBe(false)
    expect(isPermanentFailure({ status: 503 })).toBe(false)
    expect(isPermanentFailure({ status: 429 })).toBe(false)
    expect(isPermanentFailure({ status: 408 })).toBe(false)
  })

  it('treats a connection failure as worth retrying', () => {
    expect(isPermanentFailure(new TypeError('Failed to fetch'))).toBe(false)
    expect(isPermanentFailure({ code: '08006', message: 'connection failure' })).toBe(false)
    expect(isPermanentFailure(undefined)).toBe(false)
  })
})

describe('outbox does not wedge', () => {
  it('drops a real constraint violation and carries on with the rest', async () => {
    enqueue('addTaskLink', ['a', 'b'])
    enqueue('createTask', [{ title: 'the next one' }])
    let seen = []
    const res = await flushOutbox({
      addTaskLink: async () => {
        throw { code: '23505', message: 'duplicate key value violates unique constraint' }
      },
      createTask: async (row) => {
        seen.push(row.title)
        return { id: 't1' }
      },
    })
    expect(res.failed).toHaveLength(1)
    expect(seen).toEqual(['the next one'])
    expect(outboxCount()).toBe(0)
  })

  it('gives up on a write that keeps failing for an unrecognised reason', async () => {
    enqueue('createTask', [{ title: 'cursed' }])
    const handlers = {
      createTask: async () => {
        throw new Error('something odd')
      },
    }
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      const res = await flushOutbox(handlers)
      expect(res.remaining).toBe(1)
      expect(getOutbox()[0].attempts).toBe(i + 1)
    }
    const final = await flushOutbox(handlers)
    expect(final.failed).toHaveLength(1)
    expect(outboxCount()).toBe(0)
  })

  it('resets nothing on success, so a recovered write is not penalised', async () => {
    enqueue('createTask', [{ title: 'fine' }])
    const res = await flushOutbox({ createTask: async () => ({ id: 't1' }) })
    expect(res.sent).toBe(1)
    expect(outboxCount()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Things the audit found broken
// ---------------------------------------------------------------------------

describe('service worker can deliver an update', () => {
  const cfg = fs.readFileSync(path.join(process.cwd(), 'vite.config.js'), 'utf8')

  it('is set to take over rather than wait for a prompt that never comes', () => {
    // With 'prompt' the new worker only calls skipWaiting() on a message from
    // updateSW(), raised by an onNeedRefresh handler this app doesn't have.
    // Every user would be pinned to whichever build they first loaded.
    expect(cfg).toContain("registerType: 'autoUpdate'")
    expect(cfg).not.toContain("registerType: 'prompt'")
  })
})

describe('theme-color follows the in-app toggle', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')

  it('has a tag the toggle can actually find', () => {
    // Every theme-color tag used to carry a media attribute, so the toggle's
    // querySelector for one without a media attribute matched nothing.
    const metas = [...html.matchAll(/<meta name="theme-color"[^>]*>/g)].map((m) => m[0])
    expect(metas.length).toBeGreaterThan(0)
    expect(metas.filter((m) => !m.includes('media')).length).toBeGreaterThan(0)
  })

  it('sets it before first paint', () => {
    expect(html.slice(0, html.indexOf('</head>'))).toContain('theme-color')
  })

  it('updates it when the theme changes', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('content', '#F7F8FA')
    document.head.appendChild(meta)

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    )
    fireEvent.click(screen.getByLabelText('Dark'))
    expect(meta.getAttribute('content')).toBe('#14181D')
    fireEvent.click(screen.getByLabelText('Light'))
    expect(meta.getAttribute('content')).toBe('#F7F8FA')
    meta.remove()
  })
})

describe('Modal announces itself as a dialog', () => {
  it('has dialog semantics', () => {
    // Without these a screen reader treats it as ordinary page content, with
    // everything behind it still in the reading order.
    render(<Modal onClose={() => {}}>body</Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })
})

describe('header is one width across every layout', () => {
  const app = fs.readFileSync(path.join(process.cwd(), 'src', 'App.jsx'), 'utf8')
  const header = app.slice(app.indexOf('<header'), app.indexOf('</header>'))

  it('does not inherit the body width', () => {
    // Taking max-w-2xl from the list layout left the bar ~250px short of what
    // its own contents need, and the flex children overlapped in place.
    expect(header).toContain('max-w-7xl')
    expect(header).not.toContain('shellWidth')
  })

  it('has no leftover width variable pretending to control it', () => {
    expect(app).not.toContain('shellWidth')
  })

  it('centres the nav independently of what sits either side', () => {
    // justify-between only centres the middle item when the outer groups are
    // the same width, so anything added to one side drags the nav sideways.
    expect(header).toContain('grid-cols-[1fr_auto_1fr]')
    expect(header).toContain('justify-self-center')
    // Only className attributes count — the word appears in the comment
    // explaining why it isn't used.
    const classNames = [...header.matchAll(/className="([^"]*)"/g)].map((m) => m[1])
    expect(classNames.some((c) => c.includes('justify-between'))).toBe(false)
  })

  it('renders the same thing on every tab', () => {
    // The layout switcher used to live here and only on the dashboard, so the
    // right-hand group changed width between tabs and moved the nav with it.
    // Nothing in the bar may depend on the current view.
    expect(header).not.toContain('LayoutSwitcher')
    expect(header).not.toMatch(/view === '/)
    expect(header).not.toMatch(/activeWorkstreamId \?\?|activeWorkstreamId &&/)
  })

  it('puts the layout switcher with the thing it controls', () => {
    const dash = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'DashboardView.jsx'),
      'utf8'
    )
    expect(dash).toContain('LayoutSwitcher')
  })
})

// ---------------------------------------------------------------------------
// Notification delivery
// ---------------------------------------------------------------------------

describe('notification delivery does not hang', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'notifications.js'), 'utf8')

  it('does not await a promise that may never settle', () => {
    // navigator.serviceWorker.ready never resolves *or* rejects when nothing is
    // registered, so the old code produced no notification and no fallback —
    // in dev, and on any load before the worker activates.
    expect(src).toContain('navigator.serviceWorker?.controller')
    expect(src).toContain('Promise.race')
  })

  it('falls back to the plain constructor', () => {
    expect(src).toMatch(/new Notification\(title, options\)/)
  })

  it('tolerates Safari refusing the constructor outside a worker', () => {
    const fallback = src.slice(src.indexOf('Promise.race'), src.indexOf('return true'))
    expect(fallback).toContain('catch')
  })
})

// ---------------------------------------------------------------------------
// Blocker cycles and cascade cleanup
// ---------------------------------------------------------------------------
import { dependentsOf } from '../src/lib/api'
import { applyLocally } from '../src/lib/offline'

describe('dependentsOf', () => {
  it('finds a direct dependent', () => {
    expect([...dependentsOf('b', [{ task_id: 'a', depends_on_task_id: 'b' }])]).toEqual(['a'])
  })

  it('follows the chain', () => {
    // C waits on B waits on A. Letting A wait on C would close the loop.
    const deps = [
      { task_id: 'b', depends_on_task_id: 'a' },
      { task_id: 'c', depends_on_task_id: 'b' },
    ]
    expect([...dependentsOf('a', deps)].sort()).toEqual(['b', 'c'])
  })

  it('is empty for a task nothing waits on', () => {
    expect([...dependentsOf('x', [{ task_id: 'a', depends_on_task_id: 'b' }])]).toEqual([])
  })

  it('terminates on a cycle that already exists', () => {
    // Older data could already contain one; the walk must not spin forever.
    const deps = [
      { task_id: 'a', depends_on_task_id: 'b' },
      { task_id: 'b', depends_on_task_id: 'a' },
    ]
    expect([...dependentsOf('a', deps)].sort()).toEqual(['a', 'b'])
  })

  it('copes with no dependencies at all', () => {
    expect([...dependentsOf('a', [])]).toEqual([])
  })
})

describe('deleting a line offline cleans up after itself', () => {
  it('drops dependencies and links that pointed into it', () => {
    // The database cascades these; the local copy did not, so offline the
    // screen disagreed with itself until the next sync.
    const before = {
      workstreams: [{ id: 'w1' }, { id: 'w2' }],
      tasks: [
        { id: 't1', workstream_id: 'w1' },
        { id: 't2', workstream_id: 'w2' },
      ],
      dependencies: [{ id: 'dep', task_id: 't2', depends_on_task_id: 't1' }],
      taskLinks: [{ id: 'l1', task_a_id: 't1', task_b_id: 't2' }],
      inbox: [],
    }
    const after = applyLocally(before, 'deleteWorkstream', ['w1'])
    expect(after.tasks.map((t) => t.id)).toEqual(['t2'])
    expect(after.dependencies).toEqual([])
    expect(after.taskLinks).toEqual([])
  })

  it('leaves unrelated links alone', () => {
    const before = {
      workstreams: [{ id: 'w1' }, { id: 'w2' }],
      tasks: [
        { id: 't1', workstream_id: 'w1' },
        { id: 't2', workstream_id: 'w2' },
        { id: 't3', workstream_id: 'w2' },
      ],
      dependencies: [{ id: 'dep', task_id: 't3', depends_on_task_id: 't2' }],
      taskLinks: [{ id: 'l1', task_a_id: 't2', task_b_id: 't3' }],
      inbox: [],
    }
    const after = applyLocally(before, 'deleteWorkstream', ['w1'])
    expect(after.dependencies).toHaveLength(1)
    expect(after.taskLinks).toHaveLength(1)
  })
})
