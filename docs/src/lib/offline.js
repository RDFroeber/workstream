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

/**
 * `localId` is the temporary id a create operation handed to the local data.
 * It's recorded so the flush can swap it for the real server id in every
 * queued operation that came after — otherwise renaming a task you created
 * offline sends the server an id it has never seen, and the edit is lost.
 */
export function enqueue(op, args, localId = null) {
  const queue = getOutbox()
  queue.push({
    id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    op,
    args,
    localId,
  })
  write(OUTBOX_KEY, queue)
  return queue.length
}

/** Replace every occurrence of a temporary id anywhere inside an argument list. */
export function remapArgs(args, mapping) {
  if (!Object.keys(mapping).length) return args
  const swap = (v) => {
    if (typeof v === 'string') return mapping[v] ?? v
    if (Array.isArray(v)) return v.map(swap)
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]))
    }
    return v
  }
  return args.map(swap)
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
 * The session is the problem, not the write.
 *
 * A JWT that expired while the user was offline makes every queued write come
 * back 401 (or PGRST301, PostgREST's "JWT expired"). Classifying that as
 * permanent dropped the entire outbox — a day of offline edits gone because a
 * token aged out. These failures pause the queue instead; the writes are fine
 * and will succeed as soon as the user is signed in again.
 */
export function isAuthFailure(err) {
  const status = err?.status
  if (status === 401 || status === 403) return true
  const code = err?.code
  // PGRST301: JWT expired/invalid. PGRST302: anonymous requests disallowed.
  return code === 'PGRST301' || code === 'PGRST302'
}

/** A write that will never succeed, however many times it's retried.
 *
 * Supabase doesn't raise HTTP-shaped errors: a PostgrestError carries `code` as
 * a string — a Postgres SQLSTATE like '23505', or a PostgREST code like
 * 'PGRST116' — and no numeric status at all. Checking only for a 4xx status
 * therefore classified every real rejection as transient, so one constraint
 * violation would wedge the queue forever and every later edit would pile up
 * behind it.
 *
 * Auth failures are carved out: the write itself is sound, only the session
 * has lapsed, so dropping it would destroy data that re-authenticating saves.
 */
export function isPermanentFailure(err) {
  if (isAuthFailure(err)) return false
  const status = err?.status
  if (typeof status === 'number') {
    // 408 and 429 are worth retrying; the rest of the 4xx range is not.
    if (status === 408 || status === 429) return false
    return status >= 400 && status < 500
  }
  const code = err?.code
  if (typeof code === 'string') {
    if (code.startsWith('PGRST')) return true
    // SQLSTATE classes: 22 data exception, 23 integrity constraint violation,
    // 42 syntax error or access rule violation. All are bad requests, not
    // temporary outages.
    if (/^(22|23|42)/.test(code)) return true
  }
  return false
}

/** After this many transient failures a write is abandoned rather than retried
 *  indefinitely, so an unrecognised error can't stall the queue for good. */
export const MAX_ATTEMPTS = 5

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
  // Temporary id -> real id, filled in as creates come back from the server.
  const mapping = {}
  let sent = 0
  let authNeeded = false

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
      const args = remapArgs(item.args, mapping)
      const result = await handler(...args)
      dequeue(item.id)
      // A create that was referenced later: remember what the server called
      // it — and write the swap into the stored queue, not just this loop's
      // memory. An interrupted flush used to lose the mapping: the create was
      // already dequeued, so the next flush sent the temporary id verbatim,
      // Postgres rejected it as an invalid uuid, and the queued edit was
      // dropped as "permanent".
      if (item.localId && result?.id) {
        mapping[item.localId] = result.id
        const swap = { [item.localId]: result.id }
        write(
          OUTBOX_KEY,
          getOutbox().map((o) => ({ ...o, args: remapArgs(o.args, swap) }))
        )
      }
      sent++
    } catch (err) {
      if (!isOnline()) break // connection dropped again; keep the rest queued
      if (isAuthFailure(err)) {
        // The session lapsed, not the write. Keep everything queued and tell
        // the caller to get the user signed in again.
        authNeeded = true
        break
      }
      if (isPermanentFailure(err)) {
        dequeue(item.id)
        failed.push({ item, reason: err?.message || 'rejected' })
        continue
      }
      // Transient. Count the attempt, and give up on it eventually rather than
      // letting one unrecognised error stall everything queued behind it.
      const attempts = (item.attempts || 0) + 1
      if (attempts >= MAX_ATTEMPTS) {
        dequeue(item.id)
        failed.push({ item, reason: err?.message || 'gave up after repeated failures' })
        continue
      }
      write(
        OUTBOX_KEY,
        getOutbox().map((o) => (o.id === item.id ? { ...o, attempts } : o))
      )
      break // try the whole tail again next time
    }
  }

  return { sent, failed, remaining: outboxCount(), authNeeded }
}

/**
 * The queued edits, replayed once over a base data set.
 *
 * The snapshot always holds the last state the *server* confirmed; anything
 * still in the outbox is layered on top for display. Keeping those two roles
 * separate is what makes the replay idempotent — the old scheme saved the
 * post-edit state as the snapshot *and* replayed the queue over it, so every
 * queued create rendered twice after an offline reload.
 *
 * Each op replays with its recorded localId, so a task created offline gets
 * the same temporary id on every reload and the queued edits that reference
 * it still land on it.
 */
export function overlayOutbox(base) {
  let d = base
  for (const item of getOutbox()) d = applyLocally(d, item.op, item.args, item.localId)
  return d
}

// --- optimistic local application -----------------------------------------

export const CREATE_OPS = new Set([
  'createWorkstream',
  'createTask',
  'addDependency',
  'addTaskLink',
  'addInboxItem',
])

export const newId = () => `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

/**
 * Apply an operation to an in-memory data set, so an offline edit shows up
 * straight away. Mirrors what the server would do, closely enough that the
 * screen doesn't visibly change when the real write lands later.
 */
export function applyLocally(data, op, args, localId = null) {
  const mkId = () => localId || newId()
  const d = {
    workstreams: [...data.workstreams],
    tasks: [...data.tasks],
    dependencies: [...data.dependencies],
    taskLinks: [...data.taskLinks],
    inbox: [...data.inbox],
  }

  switch (op) {
    case 'createWorkstream': {
      d.workstreams.push({ id: mkId(), status: 'active', ...args[0] })
      break
    }
    case 'updateWorkstream': {
      const [id, patch] = args
      d.workstreams = d.workstreams.map((w) => (w.id === id ? { ...w, ...patch } : w))
      break
    }
    case 'deleteWorkstream': {
      const [id] = args
      // Mirror the database's ON DELETE CASCADE. Dropping only the workstream
      // and its tasks left dependencies and links pointing at rows that no
      // longer exist, which the server cleans up but the local copy did not —
      // so offline the screen disagreed with itself until the next sync.
      const orphaned = new Set(d.tasks.filter((t) => t.workstream_id === id).map((t) => t.id))
      d.workstreams = d.workstreams.filter((w) => w.id !== id)
      d.tasks = d.tasks.filter((t) => t.workstream_id !== id)
      d.dependencies = d.dependencies.filter(
        (x) => !orphaned.has(x.task_id) && !orphaned.has(x.depends_on_task_id)
      )
      d.taskLinks = d.taskLinks.filter(
        (x) => !orphaned.has(x.task_a_id) && !orphaned.has(x.task_b_id)
      )
      break
    }
    case 'createTask': {
      d.tasks.push({
        id: mkId(),
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
          ? {
              ...t,
              status,
              completed_at: status === 'done' ? new Date().toISOString() : null,
              // Finishing a task retires it from the day's picks.
              ...(status === 'done' ? { focus_date: null } : {}),
            }
          : t
      )
      break
    }
    case 'deleteTask': {
      const [id] = args
      // Deleting a sequence takes its steps with it — and, mirroring the
      // database's ON DELETE CASCADE, any dependency or link pointing at
      // those steps, not just at the sequence itself. Same class of bug as
      // the deleteWorkstream case above, fixed the same way.
      const removed = new Set([
        id,
        ...d.tasks.filter((t) => t.parent_id === id).map((t) => t.id),
      ])
      d.tasks = d.tasks.filter((t) => !removed.has(t.id))
      d.dependencies = d.dependencies.filter(
        (x) => !removed.has(x.task_id) && !removed.has(x.depends_on_task_id)
      )
      d.taskLinks = d.taskLinks.filter(
        (x) => !removed.has(x.task_a_id) && !removed.has(x.task_b_id)
      )
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
              // Today's occurrence is done; the next one starts unpicked.
              focus_date: null,
            }
          : t
      )
      break
    }
    case 'resetSequenceCycle': {
      const [sequence, stepIds, nextDue] = args
      const ids = new Set(stepIds)
      d.tasks = d.tasks.map((t) => {
        if (ids.has(t.id)) return { ...t, status: 'todo', completed_at: null, focus_date: null }
        if (t.id === sequence.id) {
          return {
            ...t,
            due_date: nextDue,
            status: 'todo',
            completed_at: null,
            last_completed_at: new Date().toISOString(),
            recurrence_count: (t.recurrence_count || 0) + 1,
            focus_date: null,
          }
        }
        return t
      })
      break
    }
    case 'addDependency': {
      d.dependencies.push({ id: mkId(), ...args[0] })
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
      if (!exists) d.taskLinks.push({ id: mkId(), task_a_id, task_b_id, note })
      break
    }
    case 'removeTaskLink': {
      d.taskLinks = d.taskLinks.filter((x) => x.id !== args[0])
      break
    }
    case 'addInboxItem': {
      d.inbox.push({ id: mkId(), text: args[0], created_at: new Date().toISOString() })
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
