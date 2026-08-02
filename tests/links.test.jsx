import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { normalizeLinkPair, linkedIdsFor, linksFor, areLinked } from '../src/lib/api'
import TaskDetail from '../src/components/TaskDetail'
import WorkstreamView from '../src/components/WorkstreamView'
import { ThemeProvider } from '../src/lib/theme'

const noop = () => {}
const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>)

describe('link pair normalisation', () => {
  it('orders a pair the same way regardless of direction', () => {
    // Otherwise linking A to B and later B to A creates two rows and the task
    // lists the same relationship twice.
    expect(normalizeLinkPair('aaa', 'bbb')).toEqual(['aaa', 'bbb'])
    expect(normalizeLinkPair('bbb', 'aaa')).toEqual(['aaa', 'bbb'])
  })

  it('is stable for realistic uuids', () => {
    const a = '0f8c1d2e-1111-4aaa-8bbb-000000000001'
    const b = 'f10b2c3d-2222-4ccc-9ddd-000000000002'
    expect(normalizeLinkPair(a, b)).toEqual(normalizeLinkPair(b, a))
  })
})

describe('link lookups', () => {
  const links = [
    { id: 'l1', task_a_id: 't1', task_b_id: 't2' },
    { id: 'l2', task_a_id: 't1', task_b_id: 't5' },
    { id: 'l3', task_a_id: 't3', task_b_id: 't4' },
  ]

  it('finds links in both directions', () => {
    expect(linkedIdsFor('t1', links).sort()).toEqual(['t2', 't5'])
    // t2 is stored on the b side, and must still see the link.
    expect(linkedIdsFor('t2', links)).toEqual(['t1'])
  })

  it('returns nothing for an unlinked task', () => {
    expect(linkedIdsFor('t9', links)).toEqual([])
  })

  it('pairs each link row with the id at the other end', () => {
    const got = linksFor('t2', links)
    expect(got).toHaveLength(1)
    expect(got[0].otherId).toBe('t1')
    expect(got[0].link.id).toBe('l1')
  })

  it('detects an existing link from either side', () => {
    expect(areLinked('t1', 't2', links)).toBe(true)
    expect(areLinked('t2', 't1', links)).toBe(true)
    expect(areLinked('t1', 't3', links)).toBe(false)
  })
})

// ---------------------------------------------------------------------------

const ws1 = { id: 'w1', name: 'Website redesign', color: '#6C4FA0', status: 'active', sort_order: 0 }
const ws2 = { id: 'w2', name: 'Q3 hiring', color: '#A34E1F', status: 'active', sort_order: 1 }
const workstreamsById = { w1: ws1, w2: ws2 }

const base = { parent_id: null, item_type: 'standalone', status: 'todo', notes: '' }
const t1 = { ...base, id: 't1', workstream_id: 'w1', title: 'Send the brief', sort_order: 0 }
const t2 = { ...base, id: 't2', workstream_id: 'w2', title: 'Draft the job spec', sort_order: 0 }
const t3 = { ...base, id: 't3', workstream_id: 'w1', title: 'Pick a vendor', sort_order: 1 }
const t4 = { ...base, id: 't4', workstream_id: 'w1', title: 'Approve budget', sort_order: 2 }
const allTasks = [t1, t2, t3, t4]
const tasksById = Object.fromEntries(allTasks.map((t) => [t.id, t]))

const renderDetail = (props = {}) =>
  wrap(
    <TaskDetail
      task={t1}
      workstream={ws1}
      tasksById={tasksById}
      workstreamsById={workstreamsById}
      dependencies={[]}
      allTasksFlat={allTasks}
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
      {...props}
    />
  )

describe('Related section', () => {
  it('says so when nothing is linked', () => {
    renderDetail()
    expect(screen.getByText('Related')).toBeTruthy()
    expect(screen.getByText('Nothing linked yet.')).toBeTruthy()
  })

  it('shows a linked task from the other side of the pair', () => {
    // t1 is stored on the b side here, so this fails if lookups are one-way.
    renderDetail({ taskLinks: [{ id: 'l1', task_a_id: 't0', task_b_id: 't1' }] })
    // t0 is unknown, but the row must still render rather than vanish.
    expect(screen.getByText('Unknown task')).toBeTruthy()
  })

  it('names the other line for a cross-line link', () => {
    renderDetail({ taskLinks: [{ id: 'l1', task_a_id: 't1', task_b_id: 't2' }] })
    expect(screen.getByText('Draft the job spec')).toBeTruthy()
    expect(screen.getByText('Q3 hiring')).toBeTruthy()
  })

  it('supports links within the same line too', () => {
    renderDetail({ taskLinks: [{ id: 'l1', task_a_id: 't1', task_b_id: 't3' }] })
    expect(screen.getByText('Pick a vendor')).toBeTruthy()
  })

  it('adds a link through the picker', () => {
    const spy = vi.fn()
    renderDetail({ onAddLink: spy })
    fireEvent.click(screen.getByText('Link a related task'))
    fireEvent.click(screen.getByText('Approve budget'))
    expect(spy).toHaveBeenCalledWith('t1', 't4')
  })

  it('does not offer the task itself', () => {
    renderDetail()
    fireEvent.click(screen.getByText('Link a related task'))
    const picker = screen.getByPlaceholderText('Search tasks…').closest('div')
    expect(within(picker).queryByText('Send the brief')).toBeNull()
  })

  it('does not offer an already-linked task', () => {
    // Offering it would just hit the database unique constraint.
    renderDetail({ taskLinks: [{ id: 'l1', task_a_id: 't1', task_b_id: 't3' }] })
    fireEvent.click(screen.getByText('Link a related task'))
    const picker = screen.getByPlaceholderText('Search tasks…').closest('div')
    expect(within(picker).queryByText('Pick a vendor')).toBeNull()
    expect(within(picker).getByText('Approve budget')).toBeTruthy()
  })

  it('unlinks', () => {
    const spy = vi.fn()
    renderDetail({ taskLinks: [{ id: 'l1', task_a_id: 't1', task_b_id: 't2' }], onRemoveLink: spy })
    fireEvent.click(screen.getByLabelText('Unlink Draft the job spec'))
    expect(spy).toHaveBeenCalledWith('l1')
  })

  it('keeps related links visually distinct from blockers', () => {
    // A non-blocking relationship must not borrow the blocker's red styling,
    // or the dashboard's red flag stops meaning anything.
    const { container } = renderDetail({
      taskLinks: [{ id: 'l1', task_a_id: 't1', task_b_id: 't2' }],
      dependencies: [{ id: 'd1', task_id: 't1', depends_on_task_id: 't3' }],
    })
    const blocker = screen.getByText('Pick a vendor').closest('div')
    const relatedRow = screen.getByText('Draft the job spec').closest('div')
    expect(blocker.className).toContain('dangerSoft')
    expect(relatedRow.className).not.toContain('danger')
    expect(container.querySelectorAll('button button').length).toBe(0)
  })
})

describe('link indicator on task rows', () => {
  const renderWs = (taskLinks) =>
    wrap(
      <WorkstreamView
        workstream={ws1}
        tasks={[t1, t3, t4]}
        dependencies={[]}
        tasksById={tasksById}
        workstreamsById={workstreamsById}
        taskLinks={taskLinks}
        onBack={noop}
        onEditWorkstream={noop}
        onOpenTask={noop}
        onCreateTask={noop}
        onToggleStatus={noop}
        onReorderTasks={noop}
      />
    )

  it('counts related tasks on the row', () => {
    renderWs([
      { id: 'l1', task_a_id: 't1', task_b_id: 't2' },
      { id: 'l2', task_a_id: 't1', task_b_id: 't3' },
    ])
    expect(screen.getByTitle('2 related tasks')).toBeTruthy()
    expect(screen.getByTitle('1 related task')).toBeTruthy()
  })

  it('shows nothing when there are no links', () => {
    renderWs([])
    expect(screen.queryByTitle(/related task/)).toBeNull()
  })
})

describe('task_links schema', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase', 'migration-003-task-links.sql'),
    'utf8'
  )

  it('stops a task linking to itself', () => {
    expect(sql).toContain('task_a_id <> task_b_id')
  })

  it('enforces canonical ordering so a pair cannot exist twice', () => {
    expect(sql).toContain('task_a_id < task_b_id')
    expect(sql).toMatch(/unique \(task_a_id, task_b_id\)/)
  })

  it('locks rows to their owner and enables realtime', () => {
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('supabase_realtime add table task_links')
  })

  it('is also in the base schema for fresh installs', () => {
    const base = fs.readFileSync(path.join(process.cwd(), 'supabase', 'schema.sql'), 'utf8')
    expect(base).toContain('create table if not exists task_links')
    expect(base).toContain('"own task_links"')
  })
})
