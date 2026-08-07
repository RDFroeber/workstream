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
 * Two very different mechanics behind one function:
 *
 * WEB: a full-page redirect through Apple and back to appUrl(). This is why
 * email and password stays the primary path there — a redirect out of an
 * installed PWA can fail to return to the app's context.
 *
 * NATIVE (the iOS wrapper): the system sheet, no redirect at all. Apple hands
 * back an identity token, which goes straight to Supabase as an id_token
 * sign-in. The nonce dance is Apple's replay protection: Apple receives the
 * SHA-256 of a random nonce and embeds it in the token; Supabase receives the
 * raw nonce and checks the hash matches. Requires the app's bundle id in the
 * Apple provider's "Authorized Client IDs" in the Supabase dashboard.
 */
export async function signInWithApple() {
  const { isNative } = await import('./platform')
  if (isNative()) {
    const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')
    const { App: CapApp } = await import('@capacitor/app')
    const { id: bundleId } = await CapApp.getInfo()

    const rawNonce = [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce))
    const hashedNonce = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const { response } = await SignInWithApple.authorize({
      clientId: bundleId,
      redirectURI: appUrl(), // unused natively, required by the plugin's type
      scopes: 'email name',
      nonce: hashedNonce,
    })
    if (!response?.identityToken) throw new Error('Apple did not return a sign-in token.')

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: response.identityToken,
      nonce: rawNonce,
    })
    if (error) throw error
    return data
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: appUrl() },
  })
  if (error) throw error
  return data
}

/**
 * Permanently delete the signed-in user's account and everything in it.
 *
 * The client can't delete its own auth user — that needs the service-role
 * key, which must never ship in the app — so the actual deletion happens in
 * the delete-account edge function (supabase/functions/delete-account). It
 * verifies the caller's JWT and deletes that user, nothing else; every table
 * cascades from auth.users, so the rows go with it.
 *
 * Required by App Store guideline 5.1.1(v): any app with account creation
 * must offer account deletion in the app.
 */
export async function deleteAccount() {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
  if (error) {
    throw new Error(
      'Could not delete the account. Check your connection and try again — if it keeps failing, contact support.'
    )
  }
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

/**
 * The signed-in user's id, or a readable error.
 *
 * Without the check, a lapsed session surfaced as
 * "Cannot read properties of null (reading 'id')" — technically true,
 * usefully false.
 */
async function requireUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user?.id) {
    throw new Error('You are signed out. Sign in again to save changes.')
  }
  return data.user.id
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
  const user_id = await requireUserId()
  const { data, error } = await supabase
    .from('workstreams')
    .insert({ name, color, sort_order, user_id })
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
  const user_id = await requireUserId()
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
      user_id,
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
  if (status === 'done') {
    patch.completed_at = new Date().toISOString()
    // Finishing a task retires it from the day's picks (see focus_date).
    patch.focus_date = null
  } else {
    patch.completed_at = null
  }
  return updateTask(id, patch)
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

/**
 * One round-trip for the whole reordering, via a SQL function
 * (supabase/migration-006-reorder.sql) — n parallel single-row updates
 * meant n requests and a half-reordered list if any one of them failed.
 *
 * Falls back to per-row updates when the function isn't installed, so a
 * deployment that hasn't run the migration keeps working (just slower).
 */
async function reorderVia(fn, table, updates) {
  try {
    const { error } = await supabase.rpc(fn, { updates })
    if (!error) return
    if (!isMissingFunction(error)) throw error
  } catch (err) {
    // supabase.rpc itself threw (e.g. a much older client) — fall through
    // to the per-row path unless it's a real server rejection.
    if (err && !isMissingFunction(err) && (err.code || err.status)) throw err
  }
  const results = await Promise.all(
    updates.map((u) => supabase.from(table).update({ sort_order: u.sort_order }).eq('id', u.id))
  )
  const failed = results.find((r) => r.error)
  if (failed) throw failed.error
}

// PGRST202: PostgREST could not find the function. 42883: Postgres
// "function does not exist" (schema cache already refreshed).
function isMissingFunction(err) {
  return err?.code === 'PGRST202' || err?.code === '42883'
}

export async function reorderTasks(updates) {
  // updates: [{ id, sort_order }, ...]
  return reorderVia('reorder_tasks', 'tasks', updates)
}

export async function reorderWorkstreams(updates) {
  return reorderVia('reorder_workstreams', 'workstreams', updates)
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
    // Today's occurrence is done; the next one starts unpicked.
    focus_date: null,
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
        supabase
          .from('tasks')
          .update({ status: 'todo', completed_at: null, focus_date: null })
          .eq('id', id)
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
  const user_id = await requireUserId()
  const { data, error } = await supabase
    .from('dependencies')
    .insert({ task_id, depends_on_task_id, note, user_id })
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
  const user_id = await requireUserId()
  const { data, error } = await supabase
    .from('task_links')
    .insert({ task_a_id, task_b_id, note, user_id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeTaskLink(id) {
  const { error } = await supabase.from('task_links').delete().eq('id', id)
  if (error) throw error
}

/**
 * Every task that (directly or transitively) already waits on `taskId`.
 *
 * Offering these as blockers would let you build a cycle — A waits on B while B
 * waits on A — and both tasks would then show as permanently blocked with no
 * way to tell which to do first. Nothing in the database prevents it, so the
 * picker has to.
 */
export function dependentsOf(taskId, dependencies) {
  const found = new Set()
  const queue = [taskId]
  while (queue.length) {
    const current = queue.shift()
    for (const d of dependencies) {
      if (d.depends_on_task_id === current && !found.has(d.task_id)) {
        found.add(d.task_id)
        queue.push(d.task_id)
      }
    }
  }
  return found
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
  const user_id = await requireUserId()
  const { data, error } = await supabase
    .from('inbox_items')
    .insert({ text, user_id })
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
