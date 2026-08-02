import { useEffect, useMemo, useState, useCallback } from 'react'
import { LogOut, Waypoints } from 'lucide-react'
import Auth from './components/Auth'
import Nav from './components/Nav'
import QuickCapture from './components/QuickCapture'
import DashboardView, { DashboardHeader } from './components/DashboardView'
import TodayView from './components/TodayView'
import InboxView from './components/InboxView'
import WorkstreamView from './components/WorkstreamView'
import WorkstreamForm from './components/WorkstreamForm'
import TaskDetail from './components/TaskDetail'
import Toast from './components/Toast'
import SetupNotice from './components/SetupNotice'
import ThemeToggle from './components/ThemeToggle'
import LayoutSwitcher from './components/LayoutSwitcher'
import GridLayout from './components/GridLayout'
import TimelineLayout from './components/TimelineLayout'
import SplitLayout from './components/SplitLayout'
import { isConfigured } from './lib/supabaseClient'
import * as api from './lib/api'
import { nextLineColor } from './lib/colors'
import { isRecurring, computeNextDue } from './lib/recurrence'
import { todayISO, formatDue } from './lib/dates'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading, null = signed out
  const [workstreams, setWorkstreams] = useState([])
  const [tasks, setTasks] = useState([])
  const [dependencies, setDependencies] = useState([])
  const [inbox, setInbox] = useState([])

  const [view, setView] = useState('dashboard') // dashboard | today | inbox
  const [activeWorkstreamId, setActiveWorkstreamId] = useState(null)
  const [editingWorkstream, setEditingWorkstream] = useState(null) // null | 'new' | workstream
  const [openTaskId, setOpenTaskId] = useState(null)
  const [toast, setToast] = useState(null)
  // Desktop layout choice. Persisted, but only ever applied at md and above —
  // the stacked list is the right answer on a phone regardless of what's saved.
  const [layout, setLayoutState] = useState(() => {
    try {
      const v = localStorage.getItem('lines-layout')
      return ['list', 'grid', 'timeline', 'split'].includes(v) ? v : 'list'
    } catch {
      return 'list'
    }
  })
  const [splitSelectedId, setSplitSelectedId] = useState(null)

  const setLayout = useCallback((next) => {
    setLayoutState(next)
    try {
      localStorage.setItem('lines-layout', next)
    } catch {
      /* private browsing — the choice just won't persist */
    }
  }, [])

  // Below the tablet breakpoint every layout collapses to the list.
  const [isWide, setIsWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = (e) => setIsWide(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const effectiveLayout = isWide ? layout : 'list'
  const shellWidth = effectiveLayout === 'list' ? 'max-w-2xl' : 'max-w-7xl'

  // --- auth bootstrap ------------------------------------------------------
  useEffect(() => {
    if (!isConfigured) return
    api.getSession().then(setSession)
    const sub = api.onAuthStateChange(setSession)
    return () => sub.unsubscribe()
  }, [])

  // --- data loading + realtime ---------------------------------------------
  const loadAll = useCallback(async () => {
    const [ws, tk, dep, ib] = await Promise.all([
      api.listWorkstreams(),
      api.listAllTasks(),
      api.listDependencies(),
      api.listInbox(),
    ])
    setWorkstreams(ws)
    setTasks(tk)
    setDependencies(dep)
    setInbox(ib)
  }, [])

  useEffect(() => {
    if (!session) return
    loadAll()
    const userId = session.user.id
    const unsubs = [
      api.subscribeToTable('workstreams', userId, loadAll),
      api.subscribeToTable('tasks', userId, loadAll),
      api.subscribeToTable('dependencies', userId, loadAll),
      api.subscribeToTable('inbox_items', userId, loadAll),
    ]
    return () => unsubs.forEach((u) => u())
  }, [session, loadAll])

  // --- derived lookups -------------------------------------------------------
  const tasksById = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks])
  const workstreamsById = useMemo(
    () => Object.fromEntries(workstreams.map((w) => [w.id, w])),
    [workstreams]
  )
  const tasksByWorkstream = useMemo(() => {
    const map = {}
    for (const t of tasks) {
      if (!map[t.workstream_id]) map[t.workstream_id] = []
      map[t.workstream_id].push(t)
    }
    return map
  }, [tasks])

  const activeWorkstream = activeWorkstreamId ? workstreamsById[activeWorkstreamId] : null
  const openTask = openTaskId ? tasksById[openTaskId] : null

  // --- actions ---------------------------------------------------------------
  async function handleSaveWorkstream(patch) {
    if (editingWorkstream === 'new') {
      const created = await api.createWorkstream({ ...patch, sort_order: workstreams.length })
      setEditingWorkstream(null)
      loadAll()
      setActiveWorkstreamId(created.id)
    } else {
      await api.updateWorkstream(editingWorkstream.id, patch)
      setEditingWorkstream(null)
      loadAll()
    }
  }

  async function handleDeleteWorkstream(id) {
    await api.deleteWorkstream(id)
    setEditingWorkstream(null)
    setActiveWorkstreamId(null)
    loadAll()
  }

  async function handleCreateTask(payload) {
    await api.createTask(payload)
    loadAll()
  }

  async function handleSetStatus(task, status) {
    // Ticking off a recurring task rolls it forward to its next date instead of
    // filing it away — it should stay on the list, not pile up in "done".
    if (status === 'done' && isRecurring(task)) {
      const nextDue = computeNextDue(task, todayISO())
      await api.completeRecurring(task, nextDue)
      setToast(`Nice — next one ${formatDue(nextDue)?.label.toLowerCase() ?? nextDue}`)
    } else {
      await api.setTaskStatus(task.id, status)
    }
    loadAll()
  }

  // A recurring sequence (e.g. a monthly checklist) finishes a whole cycle:
  // reset every step and roll the sequence's own due date forward.
  async function handleCompleteCycle(sequence) {
    const stepIds = tasks.filter((t) => t.parent_id === sequence.id).map((t) => t.id)
    const nextDue = computeNextDue(sequence, todayISO())
    await api.resetSequenceCycle(sequence, stepIds, nextDue)
    setToast(`Cycle complete — resets for ${formatDue(nextDue)?.label.toLowerCase() ?? nextDue}`)
    setOpenTaskId(null)
    loadAll()
  }

  async function handleReorderWorkstreams(reordered) {
    setWorkstreams(reordered) // optimistic, so the drop feels instant
    await api.reorderWorkstreams(reordered.map((w, i) => ({ id: w.id, sort_order: i })))
    loadAll()
  }

  async function handleReorderTasks(updates) {
    await api.reorderTasks(updates)
    loadAll()
  }

  async function handleUpdateTask(id, patch) {
    await api.updateTask(id, patch)
    loadAll()
  }

  async function handleDeleteTask(id) {
    await api.deleteTask(id)
    setOpenTaskId(null)
    loadAll()
  }

  async function handleCreateStep(sequenceId, title, sortOrder) {
    const seq = tasksById[sequenceId]
    await api.createTask({
      workstream_id: seq.workstream_id,
      parent_id: sequenceId,
      item_type: 'step',
      title,
      sort_order: sortOrder,
    })
    loadAll()
  }

  async function handleReorderSteps(updates) {
    await api.reorderTasks(updates)
    loadAll()
  }

  async function handleAddDependency(payload) {
    await api.addDependency(payload)
    loadAll()
  }

  async function handleRemoveDependency(id) {
    await api.removeDependency(id)
    loadAll()
  }

  async function handleCapture(text) {
    await api.addInboxItem(text)
    loadAll()
  }

  async function handleTriage(item, workstreamId) {
    await api.createTask({
      workstream_id: workstreamId,
      item_type: 'standalone',
      title: item.text,
      sort_order: (tasksByWorkstream[workstreamId] || []).length,
    })
    await api.deleteInboxItem(item.id)
    loadAll()
  }

  async function handleDismissInbox(id) {
    await api.deleteInboxItem(id)
    loadAll()
  }

  function openWorkstream(id) {
    setActiveWorkstreamId(id)
  }

  function openTaskDetail(item) {
    setOpenTaskId(item.id)
  }

  // --- render ------------------------------------------------------------
  if (!isConfigured) {
    return <SetupNotice />
  }
  if (session === undefined) {
    return <div className="min-h-screen bg-paper" />
  }
  if (session === null) {
    return <Auth />
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur border-b border-hairline">
        <div className={`${shellWidth} mx-auto px-4 h-14 flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <Waypoints size={18} className="text-accent" strokeWidth={2.2} />
            <span className="font-display font-semibold text-ink">Lines</span>
          </div>
          <div className="hidden sm:block">
            <Nav
              active={activeWorkstreamId ? null : view}
              onChange={(v) => {
                setActiveWorkstreamId(null)
                setView(v)
              }}
              inboxCount={inbox.length}
            />
          </div>
          <div className="flex items-center gap-2">
            {!activeWorkstreamId && view === 'dashboard' && (
              <LayoutSwitcher value={layout} onChange={setLayout} />
            )}
            <ThemeToggle />
            <button
              onClick={() => api.signOut()}
              className="text-faint hover:text-ink p-1.5"
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      <main>
        {activeWorkstream ? (
          <WorkstreamView
            workstream={activeWorkstream}
            tasks={tasksByWorkstream[activeWorkstream.id] || []}
            dependencies={dependencies}
            tasksById={tasksById}
            workstreamsById={workstreamsById}
            onBack={() => setActiveWorkstreamId(null)}
            onEditWorkstream={(ws) => setEditingWorkstream(ws)}
            onOpenTask={openTaskDetail}
            onCreateTask={handleCreateTask}
            onToggleStatus={handleSetStatus}
            onReorderTasks={handleReorderTasks}
          />
        ) : view === 'dashboard' ? (
          effectiveLayout === 'list' ? (
            <DashboardView
              workstreams={workstreams}
              tasksByWorkstream={tasksByWorkstream}
              dependencies={dependencies}
              tasksById={tasksById}
              onOpen={openWorkstream}
              onNewWorkstream={() => setEditingWorkstream('new')}
              onReorder={handleReorderWorkstreams}
            />
          ) : (
            <div className="max-w-7xl mx-auto px-4 pb-28 pt-5">
              <DashboardHeader
                workstreams={workstreams}
                onNewWorkstream={() => setEditingWorkstream('new')}
              />
              {effectiveLayout === 'grid' && (
                <GridLayout
                  workstreams={workstreams}
                  tasksByWorkstream={tasksByWorkstream}
                  dependencies={dependencies}
                  tasksById={tasksById}
                  workstreamsById={workstreamsById}
                  onOpen={openWorkstream}
                  onReorder={handleReorderWorkstreams}
                />
              )}
              {effectiveLayout === 'timeline' && (
                <TimelineLayout
                  workstreams={workstreams}
                  tasksByWorkstream={tasksByWorkstream}
                  onOpen={openWorkstream}
                  onOpenTask={openTaskDetail}
                />
              )}
              {effectiveLayout === 'split' && (
                <SplitLayout
                  workstreams={workstreams}
                  tasksByWorkstream={tasksByWorkstream}
                  dependencies={dependencies}
                  tasksById={tasksById}
                  workstreamsById={workstreamsById}
                  selectedId={splitSelectedId}
                  onSelect={setSplitSelectedId}
                  onEditWorkstream={(ws) => setEditingWorkstream(ws)}
                  onOpenTask={openTaskDetail}
                  onCreateTask={handleCreateTask}
                  onToggleStatus={handleSetStatus}
                  onReorderTasks={handleReorderTasks}
                />
              )}
            </div>
          )
        ) : view === 'today' ? (
          <TodayView
            workstreams={workstreams}
            tasksByWorkstream={tasksByWorkstream}
            onOpenTask={(item) => {
              setActiveWorkstreamId(item.workstream_id)
              setOpenTaskId(item.id)
            }}
            onToggleStatus={handleSetStatus}
          />
        ) : (
          <InboxView
            items={inbox}
            workstreams={workstreams}
            onTriage={handleTriage}
            onDismiss={handleDismissInbox}
          />
        )}
      </main>

      <QuickCapture onCapture={handleCapture} />

      <div className="sm:hidden">
        <Nav
          active={activeWorkstreamId ? null : view}
          onChange={(v) => {
            setActiveWorkstreamId(null)
            setView(v)
          }}
          inboxCount={inbox.length}
        />
      </div>

      {editingWorkstream && (
        <WorkstreamForm
          key={editingWorkstream === 'new' ? 'new' : editingWorkstream.id}
          initial={editingWorkstream === 'new' ? null : editingWorkstream}
          suggestedColor={
            editingWorkstream === 'new' ? nextLineColor(workstreams.map((w) => w.color)) : undefined
          }
          usedColors={workstreams
            .filter((w) => editingWorkstream === 'new' || w.id !== editingWorkstream.id)
            .map((w) => w.color)}
          onSave={handleSaveWorkstream}
          onDelete={editingWorkstream !== 'new' ? handleDeleteWorkstream : undefined}
          onClose={() => setEditingWorkstream(null)}
        />
      )}

      {openTask && (
        <TaskDetail
          key={openTask.id}
          task={openTask}
          workstream={workstreamsById[openTask.workstream_id]}
          tasksById={tasksById}
          workstreamsById={workstreamsById}
          dependencies={dependencies}
          allTasksFlat={tasks}
          onClose={() => setOpenTaskId(null)}
          onNavigate={(id) => setOpenTaskId(id)}
          onUpdate={handleUpdateTask}
          onSetStatus={handleSetStatus}
          onDelete={handleDeleteTask}
          onCreateStep={handleCreateStep}
          onReorderSteps={handleReorderSteps}
          onAddDependency={handleAddDependency}
          onRemoveDependency={handleRemoveDependency}
          onCompleteCycle={() => handleCompleteCycle(openTask)}
        />
      )}

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
