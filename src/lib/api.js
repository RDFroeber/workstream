import { supabase } from './supabaseClient'

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Where this copy of the app actually lives, as an absolute URL.
 *
 * Uses the directory of the current page rather than just the origin, so a
 * project subpath like /workstream/ is preserved. Confirmation links are built
 * from this — without it Supabase falls back to the project's Site URL, which
 * defaults to http://localhost:3000, and every confirmation email points at a
 * machine the recipient isn't using.
 */
export function appUrl() {
  if (typeof window === 'undefined') return undefined
  return new URL('.', window.location.href).href
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: appUrl() },
  })
  if (error) throw error
  return data
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/**
 * The event matters, not just the session. Following a recovery link signs the
 * user in with a temporary session and fires PASSWORD_RECOVERY — without
 * surfacing that, the link would just drop them into the app with no way to
 * actually set a new password.
 */
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event))
  return data.subscription
}

/** Emails a recovery link back to wherever this copy of the app is served. */
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() })
  if (error) throw error
}

/**
 * Sign in with Apple.
 *
 * Chosen over Google deliberately: guideline 4.8 only triggers on a
 * third-party/social login, and Sign in with Apple is the option that satisfies
 * it rather than one that creates the obligation. See docs/app-store.md.
 *
 * On the web this is a full-page redirect through Apple and back to appUrl(),
 * which is why email and password stays the primary path — a redirect out of an
 * installed iOS PWA can fail to return to the app's context. A native wrapper
 * would use the system sheet instead and avoid that entirely.
 */
export async function signInWithApple() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: appUrl() },
  })
  if (error) throw error
  return data
}

/** Sets a new password for the signed-in (or recovery-session) user. */
export async function updatePassword(password) {
  const { data, error } = await supabase.auth.updateUser({ password })
  if (error) throw error
  return data
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// ---------------------------------------------------------------------------
// Workstreams
// ---------------------------------------------------------------------------

export async function listWorkstreams() {
  const { data, error } = await supabase
    .from('workstreams')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

export async function createWorkstream({ name, color, sort_order = 0 }) {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('workstreams')
    .insert({ name, color, sort_order, user_id: userData.user.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateWorkstream(id, patch) {
  const { data, error } = await supabase
    .from('workstreams')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteWorkstream(id) {
  const { error } = await supabase.from('workstreams').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Tasks (standalone | sequence | step)
// ---------------------------------------------------------------------------

export async function listTasksForWorkstream(workstreamId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('workstream_id', workstreamId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

export async function listAllTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

export async function createTask({
  workstream_id,
  parent_id = null,
  item_type = 'standalone', // 'standalone' | 'sequence' | 'step'
  title,
  notes = '',
  due_date = null,
  sort_order = 0,
  recurrence_unit = null,
  recurrence_interval = 1,
  recurrence_days = null,
  recurrence_anchor = 'schedule',
}) {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      workstream_id,
      parent_id,
      item_type,
      title,
      notes,
      due_date,
      sort_order,
      recurrence_unit,
      recurrence_interval,
      recurrence_days,
      recurrence_anchor,
      status: 'todo',
      user_id: userData.user.id,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTask(id, patch) {
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function setTaskStatus(id, status) {
  const patch = { status }
  if (status === 'done') patch.completed_at = new Date().toISOString()
  else patch.completed_at = null
  return updateTask(id, patch)
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

export async function reorderTasks(updates) {
  // updates: [{ id, sort_order }, ...]
  const results = await Promise.all(
    updates.map((u) => supabase.from('tasks').update({ sort_order: u.sort_order }).eq('id', u.id))
  )
  const failed = results.find((r) => r.error)
  if (failed) throw failed.error
}

export async function reorderWorkstreams(updates) {
  const results = await Promise.all(
    updates.map((u) =>
      supabase.from('workstreams').update({ sort_order: u.sort_order }).eq('id', u.id)
    )
  )
  const failed = results.find((r) => r.error)
  if (failed) throw failed.error
}

/**
 * Completing a recurring task doesn't file it away — it rolls forward to its
 * next occurrence and stays on the list. This keeps the "done" pile from
 * filling up with 365 copies of the same daily task.
 */
export async function completeRecurring(task, nextDueISO) {
  return updateTask(task.id, {
    due_date: nextDueISO,
    status: 'todo',
    completed_at: null,
    last_completed_at: new Date().toISOString(),
    recurrence_count: (task.recurrence_count || 0) + 1,
  })
}

/**
 * A recurring sequence (e.g. a monthly close checklist) finishes a cycle:
 * every step resets to todo and the sequence's due date rolls forward.
 */
export async function resetSequenceCycle(sequence, stepIds, nextDueISO) {
  if (stepIds.length > 0) {
    const results = await Promise.all(
      stepIds.map((id) =>
        supabase.from('tasks').update({ status: 'todo', completed_at: null }).eq('id', id)
      )
    )
    const failed = results.find((r) => r.error)
    if (failed) throw failed.error
  }
  return completeRecurring(sequence, nextDueISO)
}

// ---------------------------------------------------------------------------
// Dependencies (cross-task, usually cross-workstream)
// ---------------------------------------------------------------------------

export async function listDependencies() {
  const { data, error } = await supabase.from('dependencies').select('*')
  if (error) throw error
  return data
}

export async function addDependency({ task_id, depends_on_task_id, note = '' }) {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('dependencies')
    .insert({ task_id, depends_on_task_id, note, user_id: userData.user.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeDependency(id) {
  const { error } = await supabase.from('dependencies').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Task links — "related to", undirected and non-blocking
// ---------------------------------------------------------------------------

/**
 * Links are stored with the lower uuid first so a pair can only exist once.
 * Without this, linking A to B and later B to A would create two rows and the
 * task would list the same relationship twice.
 */
export function normalizeLinkPair(a, b) {
  return a < b ? [a, b] : [b, a]
}

export async function listTaskLinks() {
  const { data, error } = await supabase.from('task_links').select('*')
  if (error) throw error
  return data
}

export async function addTaskLink(taskId, otherTaskId, note = '') {
  if (taskId === otherTaskId) throw new Error('A task cannot be linked to itself.')
  const [task_a_id, task_b_id] = normalizeLinkPair(taskId, otherTaskId)
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('task_links')
    .insert({ task_a_id, task_b_id, note, user_id: userData.user.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeTaskLink(id) {
  const { error } = await supabase.from('task_links').delete().eq('id', id)
  if (error) throw error
}

/** Every task id linked to `taskId`, in either direction. */
export function linkedIdsFor(taskId, links) {
  const out = []
  for (const l of links) {
    if (l.task_a_id === taskId) out.push(l.task_b_id)
    else if (l.task_b_id === taskId) out.push(l.task_a_id)
  }
  return out
}

/** The link rows touching `taskId`, paired with the id at the other end. */
export function linksFor(taskId, links) {
  return links
    .filter((l) => l.task_a_id === taskId || l.task_b_id === taskId)
    .map((l) => ({
      link: l,
      otherId: l.task_a_id === taskId ? l.task_b_id : l.task_a_id,
    }))
}

export function areLinked(a, b, links) {
  const [x, y] = normalizeLinkPair(a, b)
  return links.some((l) => l.task_a_id === x && l.task_b_id === y)
}

// ---------------------------------------------------------------------------
// Inbox (frictionless capture)
// ---------------------------------------------------------------------------

export async function listInbox() {
  const { data, error } = await supabase
    .from('inbox_items')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function addInboxItem(text) {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('inbox_items')
    .insert({ text, user_id: userData.user.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteInboxItem(id) {
  const { error } = await supabase.from('inbox_items').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Realtime — keeps multiple open devices in sync
// ---------------------------------------------------------------------------

export function subscribeToTable(table, userId, onChange) {
  const channel = supabase
    .channel(`${table}-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
      onChange
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// ---------------------------------------------------------------------------
// Derived helpers (pure functions, no network) — shared view logic
// ---------------------------------------------------------------------------

// Given all tasks for one workstream, return top-level items (standalone + sequence)
// each annotated with their steps (if a sequence) and a computed "next step".
export function buildWorkstreamTree(tasks) {
  const byParent = {}
  for (const t of tasks) {
    const key = t.parent_id || 'root'
    if (!byParent[key]) byParent[key] = []
    byParent[key].push(t)
  }
  const roots = (byParent['root'] || []).sort((a, b) => a.sort_order - b.sort_order)
  return roots.map((t) => {
    if (t.item_type !== 'sequence') return { ...t, steps: [] }
    const steps = (byParent[t.id] || []).sort((a, b) => a.sort_order - b.sort_order)
    const nextStep = steps.find((s) => s.status !== 'done') || null
    const doneCount = steps.filter((s) => s.status === 'done').length
    return { ...t, steps, nextStep, doneCount, totalSteps: steps.length }
  })
}

// Compute a single workstream's summary: status counts, progress, next action.
export function summarizeWorkstream(tasks) {
  const tree = buildWorkstreamTree(tasks)
  const leafItems = []
  for (const item of tree) {
    if (item.item_type === 'sequence') leafItems.push(...item.steps)
    else leafItems.push(item)
  }

  // Recurring work never "completes" — counting it would peg every line with a
  // weekly task at 0% forever. Progress measures finite work; upkeep is
  // reported separately.
  const finite = leafItems.filter((i) => !i.recurrence_unit)
  const recurringTop = tree.filter((i) => i.recurrence_unit)

  const total = finite.length
  const done = finite.filter((i) => i.status === 'done').length

  // next action = earliest-due incomplete top-level standalone task, or next
  // incomplete step of the earliest-sort sequence — whichever is due sooner.
  const candidates = tree
    .filter((i) => i.status !== 'done')
    .map((i) => {
      if (i.item_type !== 'sequence') return i
      if (i.nextStep) return i.nextStep
      // Every step done means there is nothing left to do, so the sequence
      // shouldn't keep presenting itself as the next action — the line would
      // never read "all caught up". An empty sequence is different: adding its
      // first step genuinely is the next action.
      return i.steps.length === 0 ? i : null
    })
    .filter(Boolean)

  candidates.sort((a, b) => {
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })

  return {
    total,
    done,
    progress: total === 0 ? 0 : done / total,
    hasFiniteWork: total > 0,
    recurringCount: recurringTop.length,
    nextAction: candidates[0] || null,
    tree,
  }
}
