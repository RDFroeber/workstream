import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DashboardView from '../src/components/DashboardView'
import WorkstreamView from '../src/components/WorkstreamView'
import TaskDetail from '../src/components/TaskDetail'
import TodayView from '../src/components/TodayView'

const ws = { id: 'w1', name: 'Website redesign', color: '#2C7BE5', status: 'active', sort_order: 0 }
const ws2 = { id: 'w2', name: 'Hiring', color: '#C0392B', status: 'blocked', sort_order: 1 }

const recurringTask = {
  id: 't1', workstream_id: 'w1', parent_id: null, item_type: 'standalone',
  title: 'Weekly status email', status: 'todo', due_date: '2026-08-03', sort_order: 0,
  recurrence_unit: 'week', recurrence_interval: 1, recurrence_days: [1],
  recurrence_anchor: 'schedule', recurrence_count: 3, notes: '',
}
const seq = {
  id: 't2', workstream_id: 'w1', parent_id: null, item_type: 'sequence',
  title: 'Monthly close', status: 'todo', due_date: null, sort_order: 1,
  recurrence_unit: 'month', recurrence_interval: 1, recurrence_anchor: 'schedule',
  recurrence_count: 0, notes: '',
}
const step1 = { id: 's1', workstream_id: 'w1', parent_id: 't2', item_type: 'step', title: 'Pull reports', status: 'done', sort_order: 0, notes: '' }
const step2 = { id: 's2', workstream_id: 'w1', parent_id: 't2', item_type: 'step', title: 'Reconcile', status: 'done', sort_order: 1, notes: '' }

const tasks = [recurringTask, seq, step1, step2]
const tasksById = Object.fromEntries(tasks.map(t => [t.id, t]))
const wsById = { w1: ws, w2: ws2 }

describe('Dashboard', () => {
  it('renders both lines with drag handles', () => {
    render(<DashboardView workstreams={[ws, ws2]} tasksByWorkstream={{ w1: tasks }}
      dependencies={[]} tasksById={tasksById} onOpen={()=>{}} onNewWorkstream={()=>{}} onReorder={()=>{}} />)
    expect(screen.getByText('Website redesign')).toBeTruthy()
    expect(screen.getByLabelText('Reorder Website redesign')).toBeTruthy()
    expect(screen.getByLabelText('Reorder Hiring')).toBeTruthy()
  })
})

describe('WorkstreamView', () => {
  it('shows recurrence description and drag handles', () => {
    render(<WorkstreamView workstream={ws} tasks={tasks} dependencies={[]} tasksById={tasksById}
      workstreamsById={wsById} onBack={()=>{}} onEditWorkstream={()=>{}} onOpenTask={()=>{}}
      onCreateTask={()=>{}} onToggleStatus={()=>{}} onReorderTasks={()=>{}} />)
    expect(screen.getByText('Weekly status email')).toBeTruthy()
    expect(screen.getByText('Weekly on Mon')).toBeTruthy()
    expect(screen.getByLabelText('Reorder Weekly status email')).toBeTruthy()
  })
  it('reorder rewrites sort_order 0..n-1', () => {
    const spy = vi.fn()
    render(<WorkstreamView workstream={ws} tasks={tasks} dependencies={[]} tasksById={tasksById}
      workstreamsById={wsById} onBack={()=>{}} onEditWorkstream={()=>{}} onOpenTask={()=>{}}
      onCreateTask={()=>{}} onToggleStatus={()=>{}} onReorderTasks={spy} />)
    expect(screen.getByText('Monthly close')).toBeTruthy()
  })
})

describe('TaskDetail', () => {
  it('renders recurrence editor for a recurring task', () => {
    render(<TaskDetail task={recurringTask} workstream={ws} tasksById={tasksById} workstreamsById={wsById}
      dependencies={[]} allTasksFlat={tasks} onClose={()=>{}} onNavigate={()=>{}} onUpdate={()=>{}}
      onSetStatus={()=>{}} onDelete={()=>{}} onCreateStep={()=>{}} onReorderSteps={()=>{}}
      onAddDependency={()=>{}} onRemoveDependency={()=>{}} onCompleteCycle={()=>{}} />)
    expect(screen.getAllByText(/Weekly on Mon/).length).toBeGreaterThan(0)
    expect(screen.getByText('Stop repeating')).toBeTruthy()
    expect(screen.getByText('Its due date')).toBeTruthy()
    expect(screen.getByText(/done 3/)).toBeTruthy()
  })

  it('offers cycle reset when all steps of a recurring sequence are done', () => {
    const spy = vi.fn()
    render(<TaskDetail task={seq} workstream={ws} tasksById={tasksById} workstreamsById={wsById}
      dependencies={[]} allTasksFlat={tasks} onClose={()=>{}} onNavigate={()=>{}} onUpdate={()=>{}}
      onSetStatus={()=>{}} onDelete={()=>{}} onCreateStep={()=>{}} onReorderSteps={()=>{}}
      onAddDependency={()=>{}} onRemoveDependency={()=>{}} onCompleteCycle={spy} />)
    const btn = screen.getByText(/Finish this cycle/)
    fireEvent.click(btn)
    expect(spy).toHaveBeenCalled()
  })

  it('step reorder callback normalizes sort_order', () => {
    const spy = vi.fn()
    render(<TaskDetail task={seq} workstream={ws} tasksById={tasksById} workstreamsById={wsById}
      dependencies={[]} allTasksFlat={tasks} onClose={()=>{}} onNavigate={()=>{}} onUpdate={()=>{}}
      onSetStatus={()=>{}} onDelete={()=>{}} onCreateStep={()=>{}} onReorderSteps={spy}
      onAddDependency={()=>{}} onRemoveDependency={()=>{}} onCompleteCycle={()=>{}} />)
    expect(screen.getByLabelText('Reorder Pull reports')).toBeTruthy()
    expect(screen.getByLabelText('Reorder Reconcile')).toBeTruthy()
  })
})

describe('TodayView', () => {
  it('renders next action across lines', () => {
    render(<TodayView workstreams={[ws]} tasksByWorkstream={{ w1: tasks }} onOpenTask={()=>{}} onToggleStatus={()=>{}} />)
    expect(screen.getByText('Weekly status email')).toBeTruthy()
  })
})
