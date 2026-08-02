// ---------------------------------------------------------------------------
// Search across every line.
//
// Deliberately substring-and-prefix rather than fuzzy. Fuzzy matching scores
// well in demos and badly in use: it returns results you can't explain, and
// with a few hundred tasks that "why is that first?" moment costs more than the
// occasional typo it rescues. What's here is predictable — if it matched, you
// can see why.
// ---------------------------------------------------------------------------

import { buildWorkstreamTree } from './api'

export const RESULT_LIMIT = 40

/**
 * Lowercase, and strip accents, so "cafe" finds "café" and vice versa. Typing
 * the unaccented form is the common case, and failing to match it reads as the
 * search being broken.
 */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Higher is better. Zero means no match. */
export function scoreText(haystack, needle) {
  const h = normalize(haystack)
  if (!h) return 0
  if (h === needle) return 100
  if (h.startsWith(needle)) return 80
  // A match at the start of any word beats one buried mid-word: searching
  // "port" should rank "Review portfolios" above "Passport renewal".
  if (new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(h)) return 60
  if (h.includes(needle)) return 40
  return 0
}

/**
 * Everything matching `query`, best first.
 *
 * Returns a flat list of `{ type, id, title, subtitle, workstream, task, score }`.
 * Completed work is included but ranked below open work — you often search for
 * something precisely because you already finished it.
 */
export function searchAll(query, data, limit = RESULT_LIMIT) {
  const needle = normalize(query)
  if (!needle) return []

  const d = data || {}
  const workstreams = d.workstreams || []
  const tasks = d.tasks || []
  const results = []

  for (const ws of workstreams) {
    const score = scoreText(ws.name, needle)
    if (score) {
      results.push({
        type: 'line',
        id: ws.id,
        title: ws.name,
        subtitle: ws.status === 'archived' ? 'Archived line' : 'Line',
        workstream: ws,
        task: null,
        // Slightly under an equivalent task match: you're usually looking for a
        // task, and a line is one click away on the overview anyway.
        score: score - 5,
      })
    }
  }

  const byId = Object.fromEntries(workstreams.map((w) => [w.id, w]))
  for (const ws of workstreams) {
    const tree = buildWorkstreamTree(tasks.filter((t) => t.workstream_id === ws.id))
    const visit = (task, parent) => {
      const titleScore = scoreText(task.title, needle)
      const noteScore = task.notes ? Math.min(scoreText(task.notes, needle), 30) : 0
      const best = Math.max(titleScore, noteScore)
      if (best) {
        results.push({
          type: task.item_type === 'sequence' ? 'sequence' : 'task',
          id: task.id,
          title: task.title,
          subtitle: parent ? `${ws.name} · ${parent.title}` : ws.name,
          workstream: byId[task.workstream_id] || ws,
          task,
          matchedNotes: noteScore > 0 && titleScore === 0,
          score: best - (task.status === 'done' ? 25 : 0),
        })
      }
      for (const step of task.steps || []) visit(step, task)
    }
    for (const node of tree) visit(node, null)
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    // Then whatever is due soonest, then alphabetically — so repeat searches
    // return the same order rather than shuffling.
    const ad = a.task?.due_date
    const bd = b.task?.due_date
    if (ad && bd && ad !== bd) return ad.localeCompare(bd)
    if (ad && !bd) return -1
    if (bd && !ad) return 1
    return a.title.localeCompare(b.title)
  })

  return results.slice(0, limit)
}
