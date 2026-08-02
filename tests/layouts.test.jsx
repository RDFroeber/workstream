import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import GridLayout from '../src/components/GridLayout'
import TimelineLayout from '../src/components/TimelineLayout'
import SplitLayout from '../src/components/SplitLayout'
import LayoutSwitcher, { LAYOUTS } from '../src/components/LayoutSwitcher'
import { ThemeProvider } from '../src/lib/theme'
import { todayISO } from '../src/lib/dates'
import { parseISO, toISO, addDays } from '../src/lib/recurrence'

const noop = () => {}
const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>)

const day = (n) => toISO(addDays(parseISO(todayISO()), n))

const ws1 = { id: 'w1', name: 'Website redesign', color: '#6C4FA0', status: 'active', sort_order: 0 }
const ws2 = { id: 'w2', name: 'Q3 hiring', color: '#A34E1F', status: 'blocked', sort_order: 1 }
const ws3 = { id: 'w3', name: 'Board deck', color: '#F05BB4', status: 'active', sort_order: 2 }
const workstreams = [ws1, ws2, ws3]
const workstreamsById = Object.fromEntries(workstreams.map((w) => [w.id, w]))

const base = { parent_id: null, item_type: 'standalone', status: 'todo', notes: '' }
const tasks1 = [
  { ...base, id: 't1', workstream_id: 'w1', title: 'Send the brief', due_date: day(1), sort_order: 0 },
  { ...base, id: 't2', workstream_id: 'w1', title: 'Pick a vendor', due_date: day(3), sort_order: 1 },
  { ...base, id: 't3', workstream_id: 'w1', title: 'Draft the IA', sort_order: 2 },
  { ...base, id: 't4', workstream_id: 'w1', title: 'Ship it', status: 'done', sort_order: 3 },
]
const tasks2 = [
  { ...base, id: 't5', workstream_id: 'w2', title: 'Review portfolios', due_date: day(1), sort_order: 0 },
]
const tasks3 = [
  { ...base, id: 't6', workstream_id: 'w3', title: 'Pull Q2 numbers', due_date: day(1), sort_order: 0 },
]
const tasksByWorkstream = { w1: tasks1, w2: tasks2, w3: tasks3 }
const tasksById = Object.fromEntries([...tasks1, ...tasks2, ...tasks3].map((t) => [t.id, t]))

// ---------------------------------------------------------------------------

describe('LayoutSwitcher', () => {
  it('offers the list plus the three desktop layouts', () => {
    expect(LAYOUTS.map((l) => l.id)).toEqual(['list', 'grid', 'timeline', 'split'])
  })

  it('is hidden below the tablet breakpoint', () => {
    // The layouts are explicitly tablet-and-up; on a phone there's nothing to pick.
    const { container } = render(<LayoutSwitcher value="list" onChange={noop} />)
    expect(container.firstChild.className).toContain('hidden')
    expect(container.firstChild.className).toContain('md:inline-flex')
  })

  it('marks the active layout for assistive tech', () => {
    render(<LayoutSwitcher value="timeline" onChange={noop} />)
    expect(screen.getByLabelText('Timeline').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByLabelText('Grid').getAttribute('aria-checked')).toBe('false')
  })

  it('reports the chosen layout', () => {
    const spy = vi.fn()
    render(<LayoutSwitcher value="list" onChange={spy} />)
    fireEvent.click(screen.getByLabelText('Split'))
    expect(spy).toHaveBeenCalledWith('split')
  })
})

describe('Grid layout', () => {
  const renderGrid = (props = {}) =>
    wrap(
      <GridLayout
        workstreams={workstreams}
        tasksByWorkstream={tasksByWorkstream}
        dependencies={[]}
        tasksById={tasksById}
        workstreamsById={workstreamsById}
        onOpen={noop}
        onReorder={noop}
        {...props}
      />
    )

  it('shows every line', () => {
    renderGrid()
    workstreams.forEach((w) => expect(screen.getByText(w.name)).toBeTruthy())
  })

  it('shows several upcoming actions, not just the next one', () => {
    // This is the whole reason the grid exists — the list shows one.
    renderGrid()
    expect(screen.getByText('Send the brief')).toBeTruthy()
    expect(screen.getByText('Pick a vendor')).toBeTruthy()
    expect(screen.getByText('Draft the IA')).toBeTruthy()
  })

  it('leaves completed work out', () => {
    renderGrid()
    expect(screen.queryByText('Ship it')).toBeNull()
  })

  it('opens a line when its card is activated', () => {
    const spy = vi.fn()
    renderGrid({ onOpen: spy })
    fireEvent.click(screen.getByText('Board deck'))
    expect(spy).toHaveBeenCalledWith('w3')
  })

  it('is reorderable like the list', () => {
    renderGrid()
    expect(screen.getByLabelText('Reorder Website redesign')).toBeTruthy()
  })

  it('has no nested buttons', () => {
    const { container } = renderGrid()
    expect(container.querySelectorAll('button button').length).toBe(0)
  })
})

describe('Timeline layout', () => {
  const renderTimeline = (props = {}) =>
    wrap(
      <TimelineLayout
        workstreams={workstreams}
        tasksByWorkstream={tasksByWorkstream}
        onOpen={noop}
        onOpenTask={noop}
        {...props}
      />
    )

  it('lists every line as a track', () => {
    renderTimeline()
    workstreams.forEach((w) => expect(screen.getByText(w.name)).toBeTruthy())
  })

  it('places dated tasks on the axis', () => {
    renderTimeline()
    expect(screen.getByLabelText(`Send the brief, due ${day(1)}`)).toBeTruthy()
    expect(screen.getByLabelText(`Pick a vendor, due ${day(3)}`)).toBeTruthy()
  })

  it('flags a day where three or more lines all come due', () => {
    // The one thing neither the dashboard nor Today can surface.
    renderTimeline()
    expect(screen.getByText(/three or more lines due/)).toBeTruthy()
  })

  it('does not flag a quiet stretch', () => {
    const spread = {
      w1: [{ ...base, id: 'a', workstream_id: 'w1', title: 'A', due_date: day(1), sort_order: 0 }],
      w2: [{ ...base, id: 'b', workstream_id: 'w2', title: 'B', due_date: day(4), sort_order: 0 }],
      w3: [{ ...base, id: 'c', workstream_id: 'w3', title: 'C', due_date: day(7), sort_order: 0 }],
    }
    renderTimeline({ tasksByWorkstream: spread })
    expect(screen.queryByText(/three or more lines due/)).toBeNull()
  })

  it('says plainly that undated work is not shown', () => {
    renderTimeline()
    expect(screen.getByText(/Only dated work appears here/)).toBeTruthy()
  })

  it('opens a task from the axis', () => {
    const spy = vi.fn()
    renderTimeline({ onOpenTask: spy })
    fireEvent.click(screen.getByLabelText(`Send the brief, due ${day(1)}`))
    expect(spy).toHaveBeenCalled()
  })

  it('has no nested buttons', () => {
    const { container } = renderTimeline()
    expect(container.querySelectorAll('button button').length).toBe(0)
  })
})

describe('Split layout', () => {
  const renderSplit = (props = {}) =>
    wrap(
      <SplitLayout
        workstreams={workstreams}
        tasksByWorkstream={tasksByWorkstream}
        dependencies={[]}
        tasksById={tasksById}
        workstreamsById={workstreamsById}
        selectedId="w1"
        onSelect={noop}
        onEditWorkstream={noop}
        onOpenTask={noop}
        onCreateTask={noop}
        onToggleStatus={noop}
        onReorderTasks={noop}
        {...props}
      />
    )

  it('shows all lines in the rail and opens one beside them', () => {
    renderSplit()
    const rail = screen.getByRole('navigation', { name: 'Lines' })
    workstreams.forEach((w) => expect(within(rail).getByText(w.name)).toBeTruthy())
    // The selected line's tasks are visible without navigating. The title also
    // appears in the rail as that line's next action, so scope the check.
    const detail = screen.getByRole('region', { name: 'Website redesign details' })
    expect(within(detail).getByText('Send the brief')).toBeTruthy()
    expect(within(detail).getByText('Draft the IA')).toBeTruthy()
  })

  it('marks the open line as current', () => {
    renderSplit()
    const rail = screen.getByRole('navigation', { name: 'Lines' })
    const current = within(rail)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-current') === 'true')
    expect(current.length).toBe(1)
  })

  it('switches lines from the rail', () => {
    const spy = vi.fn()
    renderSplit({ onSelect: spy })
    const rail = screen.getByRole('navigation', { name: 'Lines' })
    fireEvent.click(within(rail).getByText('Q3 hiring'))
    expect(spy).toHaveBeenCalledWith('w2')
  })

  it('drops the back link, since there is nowhere to go back to', () => {
    renderSplit()
    expect(screen.queryByText('All lines')).toBeNull()
  })

  it('recovers if the selected line disappears', () => {
    const spy = vi.fn()
    renderSplit({ selectedId: 'deleted-id', onSelect: spy })
    expect(spy).toHaveBeenCalledWith('w1')
  })
})

describe('layout wiring', () => {
  const app = fs.readFileSync(path.join(process.cwd(), 'src', 'App.jsx'), 'utf8')

  it('falls back to the list below the tablet breakpoint', () => {
    expect(app).toContain('(min-width: 768px)')
    expect(app).toContain("isWide ? layout : 'list'")
  })

  it('remembers the chosen layout', () => {
    expect(app).toContain("localStorage.setItem('lines-layout'")
  })

  it('widens the shell for the desktop layouts', () => {
    expect(app).toContain('max-w-7xl')
  })
})
