// ---------------------------------------------------------------------------
// Offline support
//
// Two separate problems, solved separately:
//
//   Reads  — the last successful load is kept as a snapshot so the app can show
//            your lines with no network. The snapshot carries a timestamp, so
//            the UI can say how stale it is rather than pretending it's live.
//
//   Writes — mutations made offline go into a durable outbox and are replayed
//            in order when the connection returns. Each one also applies
//            immediately to the in-memory data, so the app behaves normally
//            instead of appearing to swallow your edits.
//
// Deliberately not solved: multi-device conflict resolution. This is a
// single-user app and the server is last-write-wins; two devices editing the
// same task offline will resolve to whichever syncs last.
// ---------------------------------------------------------------------------

const SNAPSHOT_KEY = 'lines-snapshot'
const OUTBOX_KEY = 'lines-outbox'

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // Quota exceeded or private browsing — offline just won't persist.
    return false
  }
}

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

// --- snapshot --------------------------------------------------------------

export function saveSnapshot(data) {
  return write(SNAPSHOT_KEY, { savedAt: Date.now(), data })
}

export function loadSnapshot() {
  const s = read(SNAPSHOT_KEY, null)
  if (!s || !s.data) return null
  return s
}

export function clearOfflineState() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY)
    localStorage.removeItem(OUTBOX_KEY)
  } catch {
    /* nothing to clear */
  }
}

// --- outbox ----------------------------------------------------------------

export function getOutbox() {
  const q = read(OUTBOX_KEY, [])
  return Array.isArray(q) ? q : []
}

export function enqueue(op, args) {
  const queue = getOutbox()
  queue.push({ id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, op, args })
  write(OUTBOX_KEY, queue)
  return queue.length
}

export function dequeue(id) {
  write(
    OUTBOX_KEY,
    getOutbox().filter((o) => o.id !== id)
  )
}

export function outboxCount() {
  return getOutbox().length
}

/**
 * Replay queued writes oldest-first against `handlers`.
 *
 * Order matters: a task created offline and then renamed has to be created
 * before the rename, so this stops at the first failure rather than skipping
 * ahead. A write that fails because the server rejected it (rather than because
 * the network died) would otherwise block the queue forever, so those are
 * dropped and reported.
 */
export async function flushOutbox(handlers) {
  const queue = getOutbox()
  const failed = []
  let sent = 0

  for (const item of queue) {
    const handler = handlers[item.op]
    if (!handler) {
      // Unknown op — from an older version of the app. Drop it rather than
      // wedging the queue.
      dequeue(item.id)
      failed.push({ item, reason: 'unsupported' })
      continue
    }
    try {
      await handler(...item.args)
      dequeue(item.id)
      sent++
    } catch (err) {
      if (!isOnline()) break // connection dropped again; keep the rest queued
      const status = err?.status ?? err?.code
      const permanent = typeof status === 'number' && status >= 400 && status < 500
      if (permanent) {
        dequeue(item.id)
        failed.push({ item, reason: err?.message || 'rejected' })
      } else {
        break // transient — try the whole tail again next time
      }
    }
  }

  return { sent, failed, remaining: outboxCount() }
}

// --- optimistic local application -----------------------------------------

const newId = () => `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

/**
 * Apply an operation to an in-memory data set, so an offline edit shows up
 * straight away. Mirrors what the server would do, closely enough that the
 * screen doesn't visibly change when the real write lands later.
 */
export function applyLocally(data, op, args) {
  const d = {
    workstreams: [...data.workstreams],
    tasks: [...data.tasks],
    dependencies: [...data.dependencies],
    taskLinks: [...data.taskLinks],
    inbox: [...data.inbox],
  }

  switch (op) {
    case 'createWorkstream': {
      d.workstreams.push({ id: newId(), status: 'active', ...args[0] })
      break
    }
    case 'updateWorkstream': {
      const [id, patch] = args
      d.workstreams = d.workstreams.map((w) => (w.id === id ? { ...w, ...patch } : w))
      break
    }
    case 'deleteWorkstream': {
      const [id] = args
      d.workstreams = d.workstreams.filter((w) => w.id !== id)
      d.tasks = d.tasks.filter((t) => t.workstream_id !== id)
      break
    }
    case 'createTask': {
      d.tasks.push({
        id: newId(),
        status: 'todo',
        item_type: 'standalone',
        notes: '',
        due_date: null,
        parent_id: null,
        sort_order: 0,
        recurrence_interval: 1,
        recurrence_count: 0,
        ...args[0],
      })
      break
    }
    case 'updateTask': {
      const [id, patch] = args
      d.tasks = d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t))
      break
    }
    case 'setTaskStatus': {
      const [id, status] = args
      d.tasks = d.tasks.map((t) =>
        t.id === id
          ? { ...t, status, completed_at: status === 'done' ? new Date().toISOString() : null }
          : t
      )
      break
    }
    case 'deleteTask': {
      const [id] = args
      d.tasks = d.tasks.filter((t) => t.id !== id && t.parent_id !== id)
      d.dependencies = d.dependencies.filter(
        (x) => x.task_id !== id && x.depends_on_task_id !== id
      )
      d.taskLinks = d.taskLinks.filter((x) => x.task_a_id !== id && x.task_b_id !== id)
      break
    }
    case 'reorderTasks': {
      const [updates] = args
      const byId = Object.fromEntries(updates.map((u) => [u.id, u.sort_order]))
      d.tasks = d.tasks.map((t) => (t.id in byId ? { ...t, sort_order: byId[t.id] } : t))
      break
    }
    case 'reorderWorkstreams': {
      const [updates] = args
      const byId = Object.fromEntries(updates.map((u) => [u.id, u.sort_order]))
      d.workstreams = d.workstreams
        .map((w) => (w.id in byId ? { ...w, sort_order: byId[w.id] } : w))
        .sort((a, b) => a.sort_order - b.sort_order)
      break
    }
    case 'completeRecurring': {
      const [task, nextDue] = args
      d.tasks = d.tasks.map((t) =>
        t.id === task.id
          ? {
              ...t,
              due_date: nextDue,
              status: 'todo',
              completed_at: null,
              last_completed_at: new Date().toISOString(),
              recurrence_count: (t.recurrence_count || 0) + 1,
            }
          : t
      )
      break
    }
    case 'resetSequenceCycle': {
      const [sequence, stepIds, nextDue] = args
      const ids = new Set(stepIds)
      d.tasks = d.tasks.map((t) => {
        if (ids.has(t.id)) return { ...t, status: 'todo', completed_at: null }
        if (t.id === sequence.id) {
          return {
            ...t,
            due_date: nextDue,
            status: 'todo',
            completed_at: null,
            last_completed_at: new Date().toISOString(),
            recurrence_count: (t.recurrence_count || 0) + 1,
          }
        }
        return t
      })
      break
    }
    case 'addDependency': {
      d.dependencies.push({ id: newId(), ...args[0] })
      break
    }
    case 'removeDependency': {
      d.dependencies = d.dependencies.filter((x) => x.id !== args[0])
      break
    }
    case 'addTaskLink': {
      const [a, b, note = ''] = args
      const [task_a_id, task_b_id] = a < b ? [a, b] : [b, a]
      const exists = d.taskLinks.some(
        (l) => l.task_a_id === task_a_id && l.task_b_id === task_b_id
      )
      if (!exists) d.taskLinks.push({ id: newId(), task_a_id, task_b_id, note })
      break
    }
    case 'removeTaskLink': {
      d.taskLinks = d.taskLinks.filter((x) => x.id !== args[0])
      break
    }
    case 'addInboxItem': {
      d.inbox.push({ id: newId(), text: args[0], created_at: new Date().toISOString() })
      break
    }
    case 'deleteInboxItem': {
      d.inbox = d.inbox.filter((x) => x.id !== args[0])
      break
    }
    default:
      break
  }

  return d
}
