import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import TaskDetail from '../src/components/TaskDetail'
import { ThemeProvider } from '../src/lib/theme'
import { extractLinks, shortenLink } from '../src/lib/links'
import { applyLocally, enqueue, flushOutbox, remapArgs, newId, CREATE_OPS } from '../src/lib/offline'

const noop = () => {}
const ws = { id: 'w1', name: 'Web', color: '#6C4FA0', status: 'active' }
const t1 = {
  id: 't1',
  workstream_id: 'w1',
  parent_id: null,
  item_type: 'standalone',
  title: 'Send brief',
  status: 'todo',
  notes: '',
  sort_order: 0,
}
const seq = { ...t1, id: 's0', item_type: 'sequence', title: 'Seq', sort_order: 1 }
const step = {
  ...t1,
  id: 'st1',
  parent_id: 's0',
  item_type: 'step',
  title: 'Step one',
  sort_order: 0,
}
const all = [t1, seq, step]
const byId = Object.fromEntries(all.map((t) => [t.id, t]))

/**
 * Mirrors how App actually hosts the panel: closing really unmounts it, and
 * navigating swaps the task behind a `key` so the panel remounts. A mock
 * onClose that leaves the component mounted would hide exactly the bug these
 * tests exist to catch.
 */
function Harness({ task, onUpdate, onNavigateSpy, ...extra }) {
  const [open, setOpen] = useState(true)
  const [current, setCurrent] = useState(task)
  if (!open) return null
  return (
    <ThemeProvider>
      <TaskDetail
        key={current.id}
        task={current}
        workstream={ws}
        tasksById={byId}
        workstreamsById={{ w1: ws }}
        dependencies={[]}
        allTasksFlat={all}
        taskLinks={[]}
        onClose={() => setOpen(false)}
        onNavigate={(id) => {
          onNavigateSpy?.(id)
          setCurrent(byId[id])
        }}
        onUpdate={onUpdate}
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
    </ThemeProvider>
  )
}

function setup(task = t1, extra = {}) {
  const onUpdate = vi.fn()
  const onNavigate = vi.fn()
  const utils = render(
    <Harness task={task} onUpdate={onUpdate} onNavigateSpy={onNavigate} {...extra} />
  )
  return { onUpdate, onNavigate, ...utils }
}

const notesField = () => screen.getByPlaceholderText(/context worth remembering/)

// ---------------------------------------------------------------------------
// Regression: unsaved edits used to be discarded on any exit that wasn't a blur.
// React doesn't fire blur when a focused element is unmounted, so Escape and
// navigating to a step both silently threw the edit away.
// ---------------------------------------------------------------------------

describe('unsaved edits are never dropped', () => {
  it('saves notes when the panel is closed with Escape', () => {
    const { onUpdate } = setup()
    fireEvent.change(notesField(), { target: { value: 'important detail' } })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onUpdate).toHaveBeenCalledWith('t1', { notes: 'important detail' })
  })

  it('saves the title when closed with Escape', () => {
    const { onUpdate } = setup()
    fireEvent.change(screen.getByDisplayValue('Send brief'), { target: { value: 'Renamed' } })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onUpdate).toHaveBeenCalledWith('t1', { title: 'Renamed' })
  })

  it('saves notes when navigating into a step', () => {
    const { onUpdate } = setup(seq)
    fireEvent.change(notesField(), { target: { value: 'note text' } })
    fireEvent.click(screen.getByText('Step one'))
    expect(onUpdate).toHaveBeenCalledWith('s0', { notes: 'note text' })
  })

  it('still saves on an ordinary blur', () => {
    const { onUpdate } = setup()
    fireEvent.change(notesField(), { target: { value: 'via blur' } })
    fireEvent.blur(notesField())
    expect(onUpdate).toHaveBeenCalledWith('t1', { notes: 'via blur' })
  })

  it('does not write the same edit twice when blur is followed by unmount', () => {
    const { onUpdate, unmount } = setup()
    fireEvent.change(notesField(), { target: { value: 'once' } })
    fireEvent.blur(notesField())
    unmount()
    const noteWrites = onUpdate.mock.calls.filter((c) => 'notes' in c[1])
    expect(noteWrites).toHaveLength(1)
  })

  it('writes nothing when nothing was changed', () => {
    const { onUpdate, unmount } = setup()
    unmount()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('refuses to save an empty title', () => {
    const { onUpdate, unmount } = setup()
    fireEvent.change(screen.getByDisplayValue('Send brief'), { target: { value: '   ' } })
    unmount()
    expect(onUpdate.mock.calls.filter((c) => 'title' in c[1])).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------

describe('links in notes', () => {
  it('finds a plain url', () => {
    expect(extractLinks('see https://example.com/docs for context')).toEqual([
      { href: 'https://example.com/docs', label: 'https://example.com/docs' },
    ])
  })

  it('handles a bare www address', () => {
    expect(extractLinks('www.example.com')[0].href).toBe('https://www.example.com/')
  })

  it('does not swallow sentence punctuation', () => {
    expect(extractLinks('read https://example.com/a.').Length).toBeUndefined()
    expect(extractLinks('read https://example.com/a.')[0].label).toBe('https://example.com/a')
  })

  it('finds several and de-duplicates', () => {
    const found = extractLinks('https://a.com and https://b.com and https://a.com again')
    expect(found.map((f) => f.href)).toEqual(['https://a.com/', 'https://b.com/'])
  })

  it('refuses dangerous protocols', () => {
    // These end up in an href, so anything but http(s) is dropped outright.
    expect(extractLinks('javascript:alert(1)')).toEqual([])
    expect(extractLinks('data:text/html,<script>')).toEqual([])
    expect(extractLinks('file:///etc/passwd')).toEqual([])
  })

  it('returns nothing for empty or link-free text', () => {
    expect(extractLinks('')).toEqual([])
    expect(extractLinks(null)).toEqual([])
    expect(extractLinks('just some notes')).toEqual([])
  })

  it('shortens for display', () => {
    expect(shortenLink('https://www.example.com/')).toBe('example.com')
    expect(shortenLink('https://example.com/a/very/long/path/that/keeps/going')).toContain('…')
  })

  it('renders a clickable chip beneath the notes field', () => {
    setup({ ...t1, notes: 'spec at https://example.com/spec' })
    const link = screen.getByTitle('https://example.com/spec')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('https://example.com/spec')
    expect(link.getAttribute('target')).toBe('_blank')
    // Without noopener the opened page can reach back through window.opener.
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('picks up a link as soon as it is typed, without leaving the field', () => {
    setup()
    fireEvent.change(notesField(), { target: { value: 'https://example.com/new' } })
    expect(screen.getByTitle('https://example.com/new')).toBeTruthy()
  })

  it('keeps the notes editable rather than swapping to a preview', () => {
    setup({ ...t1, notes: 'https://example.com' })
    expect(notesField().tagName).toBe('TEXTAREA')
  })
})

// ---------------------------------------------------------------------------
// Regression: a row created offline got a temporary id, and every later edit
// referencing it was sent to the server verbatim, rejected, and dropped.
// ---------------------------------------------------------------------------

describe('offline ids survive syncing', () => {
  beforeEach(() => localStorage.clear())

  it('rewrites a temporary id everywhere it was used', () => {
    const args = remapArgs(['local_1', { parent_id: 'local_1', title: 'x' }], {
      local_1: 'server-1',
    })
    expect(args[0]).toBe('server-1')
    expect(args[1].parent_id).toBe('server-1')
  })

  it('leaves arguments alone when nothing was created offline', () => {
    const original = ['abc', { a: 1 }]
    expect(remapArgs(original, {})).toBe(original)
  })

  it('reaches ids nested in arrays, like a reorder', () => {
    const out = remapArgs([[{ id: 'local_1', sort_order: 0 }]], { local_1: 'server-1' })
    expect(out[0][0].id).toBe('server-1')
  })

  it('creates offline, edits, and syncs without losing the edits', async () => {
    const localId = newId()
    let d = { workstreams: [{ id: 'w1' }], tasks: [], dependencies: [], taskLinks: [], inbox: [] }
    d = applyLocally(d, 'createTask', [{ workstream_id: 'w1', title: 'New task' }], localId)
    enqueue('createTask', [{ workstream_id: 'w1', title: 'New task' }], localId)
    d = applyLocally(d, 'updateTask', [localId, { title: 'Renamed' }])
    enqueue('updateTask', [localId, { title: 'Renamed' }])
    d = applyLocally(d, 'updateTask', [localId, { due_date: '2026-09-01' }])
    enqueue('updateTask', [localId, { due_date: '2026-09-01' }])

    const received = []
    const res = await flushOutbox({
      createTask: async () => ({ id: 'server-uuid' }),
      updateTask: async (id, patch) => {
        // A temporary id reaching the server is the bug this guards against.
        if (String(id).startsWith('local_')) {
          const e = new Error('no such row')
          e.status = 406
          throw e
        }
        received.push([id, patch])
        return { id }
      },
    })

    expect(res.sent).toBe(3)
    expect(res.failed).toHaveLength(0)
    expect(received.map((r) => r[0])).toEqual(['server-uuid', 'server-uuid'])
  })

  it('links a task created offline to an existing one', async () => {
    const localId = newId()
    enqueue('createTask', [{ workstream_id: 'w1', title: 'New' }], localId)
    enqueue('addTaskLink', [localId, 'existing-task'])
    const seen = []
    const res = await flushOutbox({
      createTask: async () => ({ id: 'server-uuid' }),
      addTaskLink: async (a, b) => {
        seen.push([a, b])
        return { id: 'link-1' }
      },
    })
    expect(res.failed).toHaveLength(0)
    expect(seen[0]).toEqual(['server-uuid', 'existing-task'])
  })

  it('knows which operations create something', () => {
    expect(CREATE_OPS.has('createTask')).toBe(true)
    expect(CREATE_OPS.has('addTaskLink')).toBe(true)
    expect(CREATE_OPS.has('updateTask')).toBe(false)
  })

  it('uses the id it was given so the queue and the screen agree', () => {
    const d = applyLocally(
      { workstreams: [], tasks: [], dependencies: [], taskLinks: [], inbox: [] },
      'createTask',
      [{ workstream_id: 'w1', title: 'x' }],
      'chosen-id'
    )
    expect(d.tasks[0].id).toBe('chosen-id')
  })
})

// ---------------------------------------------------------------------------
// Two smaller bugs found in the same audit.
// ---------------------------------------------------------------------------
import TimelineLayout from '../src/components/TimelineLayout'
import InboxView from '../src/components/InboxView'
import { toISO, addDays, parseISO } from '../src/lib/recurrence'
import { todayISO } from '../src/lib/dates'

const day = (n) => toISO(addDays(parseISO(todayISO()), n))

describe('timeline does not double-count a sequence', () => {
  const line = { id: 'w1', name: 'Web', color: '#6C4FA0', status: 'active', sort_order: 0 }
  const b = { workstream_id: 'w1', parent_id: null, item_type: 'standalone', status: 'todo' }

  it('plots the current step, not the step and its container', () => {
    const tasks = {
      w1: [
        { ...b, id: 'seq', title: 'Seq', item_type: 'sequence', due_date: day(1), sort_order: 0 },
        { ...b, id: 's1', title: 'Step', parent_id: 'seq', item_type: 'step', due_date: day(1), sort_order: 0 },
      ],
    }
    const { container } = render(
      <ThemeProvider>
        <TimelineLayout workstreams={[line]} tasksByWorkstream={tasks} onOpen={noop} onOpenTask={noop} />
      </ThemeProvider>
    )
    const marks = container.querySelectorAll('[aria-label*="due"]')
    expect(marks).toHaveLength(1)
    expect(marks[0].getAttribute('aria-label')).toContain('Step')
  })

  it('plots only the next step, not every future one', () => {
    const tasks = {
      w1: [
        { ...b, id: 'seq', title: 'Seq', item_type: 'sequence', sort_order: 0 },
        { ...b, id: 's1', title: 'One', parent_id: 'seq', item_type: 'step', due_date: day(1), sort_order: 0 },
        { ...b, id: 's2', title: 'Two', parent_id: 'seq', item_type: 'step', due_date: day(2), sort_order: 1 },
      ],
    }
    const { container } = render(
      <ThemeProvider>
        <TimelineLayout workstreams={[line]} tasksByWorkstream={tasks} onOpen={noop} onOpenTask={noop} />
      </ThemeProvider>
    )
    expect(container.querySelectorAll('[aria-label*="due"]')).toHaveLength(1)
  })

  it('still plots a dated sequence that has no steps yet', () => {
    const tasks = {
      w1: [{ ...b, id: 'seq', title: 'Seq', item_type: 'sequence', due_date: day(1), sort_order: 0 }],
    }
    const { container } = render(
      <ThemeProvider>
        <TimelineLayout workstreams={[line]} tasksByWorkstream={tasks} onOpen={noop} onOpenTask={noop} />
      </ThemeProvider>
    )
    expect(container.querySelectorAll('[aria-label*="due"]')).toHaveLength(1)
  })
})

describe('inbox triage with no lines', () => {
  it('explains itself instead of opening onto nothing', () => {
    render(
      <ThemeProvider>
        <InboxView
          items={[{ id: 'i1', text: 'Captured thing' }]}
          workstreams={[]}
          onTriage={noop}
          onDismiss={noop}
        />
      </ThemeProvider>
    )
    fireEvent.click(screen.getByText(/Send to a line/))
    expect(screen.getByText(/No lines yet/)).toBeTruthy()
  })
})
