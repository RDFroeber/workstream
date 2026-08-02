import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { LogOut, Waypoints, Settings } from 'lucide-react'
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
import NewPassword from './components/NewPassword'
import ThemeToggle from './components/ThemeToggle'
import OfflineBanner from './components/OfflineBanner'
import SettingsPanel from './components/SettingsPanel'
import * as offline from './lib/offline'
import { runCheck, getPrefs } from './lib/notifications'
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
  const [taskLinks, setTaskLinks] = useState([])
  const [inbox, setInbox] = useState([])

  const [view, setView] = useState('dashboard') // dashboard | today | inbox
  const [activeWorkstreamId, setActiveWorkstreamId] = useState(null)
  const [editingWorkstream, setEditingWorkstream] = useState(null) // null | 'new' | workstream
  const [openTaskId, setOpenTaskId] = useState(null)
  const [toast, setToast] = useState(null)
  const [online, setOnline] = useState(offline.isOnline)
  const [pending, setPending] = useState(offline.outboxCount)
  const [snapshotAt, setSnapshotAt] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [recovering, setRecovering] = useState(false)
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

  // --- auth bootstrap ------------------------------------------------------
  useEffect(() => {
    if (!isConfigured) return
    api.getSession().then(setSession)
    const sub = api.onAuthStateChange((next, event) => {
      setSession(next)
      // Following a recovery link signs the user in with a temporary session.
      // Without catching the event they'd land in the app with the forgotten
      // password still set and no prompt to change it.
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') setRecovering(false)
    })
    return () => sub.unsubscribe()
  }, [])

  // --- data loading + realtime ---------------------------------------------
  const applyData = useCallback((d) => {
    setWorkstreams(d.workstreams)
    setTasks(d.tasks)
    setDependencies(d.dependencies)
    setTaskLinks(d.taskLinks)
    setInbox(d.inbox)
  }, [])

  const loadAll = useCallback(async () => {
    // Offline, or the network died mid-flight: fall back to the last snapshot
    // rather than blanking the screen. Anything still in the outbox is replayed
    // over the top so your own edits stay visible.
    if (!offline.isOnline()) {
      const snap = offline.loadSnapshot()
      if (snap) {
        let d = snap.data
        for (const item of offline.getOutbox()) d = offline.applyLocally(d, item.op, item.args)
        applyData(d)
        setSnapshotAt(snap.savedAt)
      }
      return
    }
    try {
      const [ws, tk, dep, links, ib] = await Promise.all([
        api.listWorkstreams(),
        api.listAllTasks(),
        api.listDependencies(),
        api.listTaskLinks(),
        api.listInbox(),
      ])
      const d = { workstreams: ws, tasks: tk, dependencies: dep, taskLinks: links, inbox: ib }
      applyData(d)
      offline.saveSnapshot(d)
      setSnapshotAt(Date.now())
    } catch (err) {
      const snap = offline.loadSnapshot()
      if (snap) {
        applyData(snap.data)
        setSnapshotAt(snap.savedAt)
      }
      if (offline.isOnline()) setSyncError('Could not reach the server. Showing cached data.')
    }
  }, [applyData])

  useEffect(() => {
    if (!session) return
    loadAll()
    const userId = session.user.id
    const unsubs = [
      api.subscribeToTable('workstreams', userId, loadAll),
      api.subscribeToTable('tasks', userId, loadAll),
      api.subscribeToTable('dependencies', userId, loadAll),
      api.subscribeToTable('task_links', userId, loadAll),
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

  // --- offline-aware mutation -------------------------------------------------

  const dataRef = useRef({
    workstreams: [],
    tasks: [],
    dependencies: [],
    taskLinks: [],
    inbox: [],
  })
  useEffect(() => {
    dataRef.current = { workstreams, tasks, dependencies, taskLinks, inbox }
  }, [workstreams, tasks, dependencies, taskLinks, inbox])

  /**
   * Every write goes through here. The local data is updated first so the app
   * responds the same whether or not there's a connection; the write then
   * either goes to the server or into the outbox.
   */
  const mutate = useCallback(
    async (op, ...args) => {
      // Creates get their temporary id here rather than inside the reducer, so
      // the queued operation and the local data agree on what to call the new
      // row. The flush swaps it for the server's id in everything queued after.
      const localId = offline.CREATE_OPS.has(op) ? offline.newId() : null
      const next = offline.applyLocally(dataRef.current, op, args, localId)
      // Advance the ref synchronously. The effect that syncs it from state
      // doesn't run until after the next render, so two mutations in a row —
      // triaging an inbox item creates a task and then deletes the item —
      // would have had the second one read pre-first-mutation data and undo it.
      dataRef.current = next
      applyData(next)
      offline.saveSnapshot(next)

      if (!offline.isOnline()) {
        setPending(offline.enqueue(op, args, localId))
        return null
      }
      try {
        const result = await api[op](...args)
        await loadAll()
        return result
      } catch (err) {
        if (!offline.isOnline()) {
          setPending(offline.enqueue(op, args, localId))
          return null
        }
        // A real server rejection — reload so the screen matches the server
        // rather than leaving the optimistic edit sitting there as a lie.
        setSyncError(err?.message || 'That change could not be saved.')
        await loadAll()
        return null
      }
    },
    [applyData, loadAll]
  )

  const flush = useCallback(async () => {
    if (!offline.isOnline() || offline.outboxCount() === 0) return
    setSyncing(true)
    setSyncError(null)
    const { failed, remaining } = await offline.flushOutbox(api)
    setPending(remaining)
    setSyncing(false)
    if (failed.length) {
      setSyncError(
        `${failed.length} queued ${failed.length === 1 ? 'change' : 'changes'} could not be saved and ${failed.length === 1 ? 'was' : 'were'} dropped.`
      )
    }
    await loadAll()
  }, [loadAll])

  // Connection changes
  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      flush()
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [flush])

  // Drain anything left over from a previous session on start-up.
  useEffect(() => {
    if (session && offline.isOnline() && offline.outboxCount() > 0) flush()
  }, [session, flush])

  // --- reminders --------------------------------------------------------------
  // The check reads current data through a ref rather than through the effect's
  // dependencies. Depending on the data directly tore down and rebuilt the
  // interval on every edit, and ran an immediate check each time, so a busy
  // session checked constantly instead of once a minute.
  const reminderData = useRef({ workstreams, tasksByWorkstream })
  useEffect(() => {
    reminderData.current = { workstreams, tasksByWorkstream }
  }, [workstreams, tasksByWorkstream])

  useEffect(() => {
    if (!session) return
    const tick = () => {
      try {
        const { workstreams: ws, tasksByWorkstream: tbw } = reminderData.current
        runCheck({ workstreams: ws, tasksByWorkstream: tbw, prefs: getPrefs() })
      } catch {
        /* a failed reminder must never take the app down */
      }
    }
    tick()
    const id = setInterval(tick, 60_000)
    // Re-check on focus, the realistic moment a backgrounded app catches up on
    // anything it slept through.
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', tick)
    }
  }, [session])

  // --- actions ---------------------------------------------------------------
  async function handleSaveWorkstream(patch) {
    if (editingWorkstream === 'new') {
      const created = await mutate('createWorkstream', {
        ...patch,
        sort_order: workstreams.length,
      })
      setEditingWorkstream(null)
      // Offline there's no server id to jump to, so stay on the overview.
      if (created?.id) setActiveWorkstreamId(created.id)
    } else {
      await mutate('updateWorkstream', editingWorkstream.id, patch)
      setEditingWorkstream(null)
    }
  }

  async function handleDeleteWorkstream(id) {
    await mutate('deleteWorkstream', id)
    setEditingWorkstream(null)
    setActiveWorkstreamId(null)
  }

  async function handleCreateTask(payload) {
    await mutate('createTask', payload)
  }

  async function handleSetStatus(task, status) {
    // Ticking off a recurring task rolls it forward to its next date instead of
    // filing it away — it should stay on the list, not pile up in "done".
    if (status === 'done' && isRecurring(task)) {
      const nextDue = computeNextDue(task, todayISO())
      await mutate('completeRecurring', task, nextDue)
      setToast(`Nice — next one ${formatDue(nextDue)?.label.toLowerCase() ?? nextDue}`)
    } else {
      await mutate('setTaskStatus', task.id, status)
    }
  }

  // A recurring sequence (e.g. a monthly checklist) finishes a whole cycle:
  // reset every step and roll the sequence's own due date forward.
  async function handleCompleteCycle(sequence) {
    const stepIds = tasks.filter((t) => t.parent_id === sequence.id).map((t) => t.id)
    const nextDue = computeNextDue(sequence, todayISO())
    await mutate('resetSequenceCycle', sequence, stepIds, nextDue)
    setToast(`Cycle complete — resets for ${formatDue(nextDue)?.label.toLowerCase() ?? nextDue}`)
    setOpenTaskId(null)
  }

  async function handleReorderWorkstreams(reordered) {
    await mutate(
      'reorderWorkstreams',
      reordered.map((w, i) => ({ id: w.id, sort_order: i }))
    )
  }

  async function handleReorderTasks(updates) {
    await mutate('reorderTasks', updates)
  }

  async function handleUpdateTask(id, patch) {
    await mutate('updateTask', id, patch)
  }

  async function handleDeleteTask(id) {
    setOpenTaskId(null)
    await mutate('deleteTask', id)
  }

  async function handleCreateStep(sequenceId, title, sortOrder) {
    const seq = tasksById[sequenceId]
    await mutate('createTask', {
      workstream_id: seq.workstream_id,
      parent_id: sequenceId,
      item_type: 'step',
      title,
      sort_order: sortOrder,
    })
  }

  async function handleReorderSteps(updates) {
    await mutate('reorderTasks', updates)
  }

  async function handleAddDependency(payload) {
    await mutate('addDependency', payload)
  }

  async function handleAddLink(taskId, otherTaskId) {
    await mutate('addTaskLink', taskId, otherTaskId)
  }

  async function handleRemoveLink(id) {
    await mutate('removeTaskLink', id)
  }

  async function handleRemoveDependency(id) {
    await mutate('removeDependency', id)
  }

  async function handleCapture(text) {
    await mutate('addInboxItem', text)
  }

  async function handleTriage(item, workstreamId) {
    await mutate('createTask', {
      workstream_id: workstreamId,
      item_type: 'standalone',
      title: item.text,
      sort_order: (tasksByWorkstream[workstreamId] || []).length,
    })
    await mutate('deleteInboxItem', item.id)
  }

  async function handleDismissInbox(id) {
    await mutate('deleteInboxItem', id)
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
  if (recovering) {
    return <NewPassword onDone={() => setRecovering(false)} />
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur border-b border-hairline">
        {/* The bar keeps one width no matter which layout the body is using.
            Inheriting the body's max-w-2xl in List view left the header ~250px
            short of what its own contents need, and the flex children silently
            overlapped instead of wrapping. */}
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Waypoints size={18} className="text-accent" strokeWidth={2.2} />
            <span className="hidden sm:inline font-display font-semibold text-ink">Lines</span>
          </div>
          <div className="hidden sm:block min-w-0">
            <Nav
              active={activeWorkstreamId ? null : view}
              onChange={(v) => {
                setActiveWorkstreamId(null)
                setView(v)
              }}
              inboxCount={inbox.length}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!activeWorkstreamId && view === 'dashboard' && (
              <LayoutSwitcher value={layout} onChange={setLayout} />
            )}
            <ThemeToggle />
            <button
              onClick={() => setShowSettings(true)}
              className="relative text-faint hover:text-ink p-1.5"
              aria-label="Settings"
            >
              <Settings size={17} />
              {pending > 0 && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-warn" />
              )}
            </button>
            <button
              onClick={() => {
                offline.clearOfflineState()
                api.signOut()
              }}
              className="text-faint hover:text-ink p-1.5"
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      <OfflineBanner
        online={online}
        pending={pending}
        snapshotAt={snapshotAt}
        syncing={syncing}
        syncError={syncError}
      />

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
            taskLinks={taskLinks}
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
                  taskLinks={taskLinks}
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
          taskLinks={taskLinks}
          onAddLink={handleAddLink}
          onRemoveLink={handleRemoveLink}
        />
      )}

      {showSettings && (
        <SettingsPanel
          online={online}
          pending={pending}
          snapshotAt={snapshotAt}
          onClose={() => setShowSettings(false)}
          onSyncNow={flush}
        />
      )}

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
