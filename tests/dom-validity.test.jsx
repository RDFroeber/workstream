import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import DashboardView from '../src/components/DashboardView'
import WorkstreamView from '../src/components/WorkstreamView'
import TaskDetail from '../src/components/TaskDetail'

const ws = { id: 'w1', name: 'Website redesign', color: '#2C7BE5', status: 'active', sort_order: 0 }
const wsById = { w1: ws }

const task = {
  id: 't1', workstream_id: 'w1', parent_id: null, item_type: 'standalone',
  title: 'Send the brief', status: 'todo', due_date: '2026-08-03', sort_order: 0, notes: '',
}
const seq = {
  id: 't2', workstream_id: 'w1', parent_id: null, item_type: 'sequence',
  title: 'Monthly close', status: 'todo', due_date: null, sort_order: 1, notes: '',
  recurrence_unit: 'month', recurrence_interval: 1, recurrence_anchor: 'schedule', recurrence_count: 0,
}
const step = {
  id: 's1', workstream_id: 'w1', parent_id: 't2', item_type: 'step',
  title: 'Pull reports', status: 'todo', sort_order: 0, notes: '',
}
const tasks = [task, seq, step]
const tasksById = Object.fromEntries(tasks.map((t) => [t.id, t]))

const noop = () => {}

/**
 * A <button> inside a <button> is invalid HTML — browsers may drop the inner
 * one or fire both handlers. Adding drag handles to clickable cards is exactly
 * the change that tends to introduce this, so it's worth asserting.
 */
function expectNoNestedButtons(container) {
  expect(container.querySelectorAll('button button').length).toBe(0)
}

describe('DOM validity with drag handles added', () => {
  it('dashboard cards have no nested buttons', () => {
    const { container } = render(
      <DashboardView
        workstreams={[ws]}
        tasksByWorkstream={{ w1: tasks }}
        dependencies={[]}
        tasksById={tasksById}
        onOpen={noop}
        onNewWorkstream={noop}
        onReorder={noop}
      />
    )
    expectNoNestedButtons(container)
  })

  it('dashboard cards stay keyboard-reachable after losing their button wrapper', () => {
    const { container } = render(
      <DashboardView
        workstreams={[ws]}
        tasksByWorkstream={{ w1: tasks }}
        dependencies={[]}
        tasksById={tasksById}
        onOpen={noop}
        onNewWorkstream={noop}
        onReorder={noop}
      />
    )
    const card = container.querySelector('[role="button"]')
    expect(card).toBeTruthy()
    expect(card.getAttribute('tabindex')).toBe('0')
  })

  it('workstream task rows have no nested buttons', () => {
    const { container } = render(
      <WorkstreamView
        workstream={ws}
        tasks={tasks}
        dependencies={[]}
        tasksById={tasksById}
        workstreamsById={wsById}
        onBack={noop}
        onEditWorkstream={noop}
        onOpenTask={noop}
        onCreateTask={noop}
        onToggleStatus={noop}
        onReorderTasks={noop}
      />
    )
    expectNoNestedButtons(container)
  })

  it('sequence steps have no nested buttons', () => {
    const { container } = render(
      <TaskDetail
        task={seq}
        workstream={ws}
        tasksById={tasksById}
        workstreamsById={wsById}
        dependencies={[]}
        allTasksFlat={tasks}
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
      />
    )
    expectNoNestedButtons(container)
  })

  it('every drag handle is labelled and keyboard-operable', () => {
    const { container } = render(
      <WorkstreamView
        workstream={ws}
        tasks={tasks}
        dependencies={[]}
        tasksById={tasksById}
        workstreamsById={wsById}
        onBack={noop}
        onEditWorkstream={noop}
        onOpenTask={noop}
        onCreateTask={noop}
        onToggleStatus={noop}
        onReorderTasks={noop}
      />
    )
    const handles = container.querySelectorAll('[aria-label^="Reorder"]')
    expect(handles.length).toBe(2) // one standalone task, one sequence
    handles.forEach((h) => {
      expect(h.tagName).toBe('BUTTON')
      // dnd-kit attaches these; without them keyboard reordering silently dies
      expect(h.getAttribute('aria-roledescription')).toBeTruthy()
    })
  })

  it('a step cannot be given its own repeat rule', () => {
    const { queryByText } = render(
      <TaskDetail
        task={step}
        workstream={ws}
        tasksById={tasksById}
        workstreamsById={wsById}
        dependencies={[]}
        allTasksFlat={tasks}
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
      />
    )
    expect(queryByText('Make this repeat')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Color picker
// ---------------------------------------------------------------------------
import ColorPicker from '../src/components/ColorPicker'
import { PALETTE } from '../src/lib/colors'
import { fireEvent } from '@testing-library/react'

describe('ColorPicker', () => {
  it('renders every palette color as its own labelled swatch', () => {
    const { container } = render(<ColorPicker value={PALETTE[0].hex} onChange={noop} />)
    PALETTE.forEach((c) => {
      expect(container.querySelector(`[aria-label^="${c.name}"]`), c.name).toBeTruthy()
    })
  })

  it('flags colors already used by other lines', () => {
    const taken = PALETTE[3].hex
    const { container } = render(
      <ColorPicker value={PALETTE[0].hex} onChange={noop} usedColors={[taken]} />
    )
    const swatch = container.querySelector(`[aria-label="${PALETTE[3].name}, already in use"]`)
    expect(swatch).toBeTruthy()
  })

  it('does not flag the color this line already has as "in use"', () => {
    const mine = PALETTE[3].hex
    const { container } = render(
      <ColorPicker value={mine} onChange={noop} usedColors={[mine]} />
    )
    expect(container.querySelector(`[aria-label="${PALETTE[3].name}, already in use"]`)).toBeNull()
  })

  it('narrows to the eight-color safe set when toggled', () => {
    const { container, getByText } = render(<ColorPicker value={PALETTE[0].hex} onChange={noop} />)
    const before = container.querySelectorAll('[aria-pressed]').length
    fireEvent.click(getByText('High-contrast set'))
    const after = container.querySelectorAll('[aria-pressed]').length
    expect(after).toBeLessThan(before)
  })

  it('keeps a pre-existing color selectable after a palette change', () => {
    // #E08E0B was in the original ten and is no longer offered — a line still
    // using it must not appear to have no color at all.
    const { getByLabelText } = render(<ColorPicker value="#E08E0B" onChange={noop} />)
    expect(getByLabelText('Keep the current color')).toBeTruthy()
  })

  it('has no nested buttons', () => {
    const { container } = render(
      <ColorPicker value={PALETTE[0].hex} onChange={noop} usedColors={[PALETTE[2].hex]} />
    )
    expectNoNestedButtons(container)
  })
})
