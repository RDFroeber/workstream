// ---------------------------------------------------------------------------
// Getting your data out.
//
// Two formats, for two different reasons:
//
//   JSON — everything, losslessly, including ids and the relationships between
//          rows. This is the backup, and what you'd re-import from.
//   CSV  — the tasks flattened into something a spreadsheet can open. Lossy by
//          design: relationships become readable text rather than ids.
//
// The string building is kept separate from the browser download so it can be
// tested, and so the error boundary can export from the cached snapshot when
// the app itself is too broken to render.
// ---------------------------------------------------------------------------

import { buildWorkstreamTree } from './api'
import { describeRecurrence } from './recurrence'

export const EXPORT_VERSION = 1

/** Everything, in a shape that could be read back in later. */
export function buildExportBundle(data, now = new Date()) {
  const d = data || {}
  return {
    format: 'lines-export',
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    counts: {
      workstreams: (d.workstreams || []).length,
      tasks: (d.tasks || []).length,
      dependencies: (d.dependencies || []).length,
      taskLinks: (d.taskLinks || []).length,
      inbox: (d.inbox || []).length,
    },
    workstreams: d.workstreams || [],
    tasks: d.tasks || [],
    dependencies: d.dependencies || [],
    taskLinks: d.taskLinks || [],
    inbox: d.inbox || [],
  }
}

export function toJSON(bundle) {
  return JSON.stringify(bundle, null, 2)
}

/**
 * One CSV cell.
 *
 * A task title containing a comma, a quote, or a newline from the notes field
 * would otherwise shift every following column — which is the classic way a
 * CSV export looks fine until the one row that matters is unreadable.
 */
export function csvCell(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCSV(rows, headers) {
  const lines = [headers.map(csvCell).join(',')]
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(','))
  // CRLF and a BOM: Excel on Windows misreads plain UTF-8, and this file exists
  // to be opened in a spreadsheet.
  return '\uFEFF' + lines.join('\r\n')
}

const TASK_HEADERS = [
  'Line',
  'Type',
  'Sequence',
  'Title',
  'Status',
  'Due date',
  'Repeats',
  'Blocked by',
  'Related to',
  'Notes',
]

/** Tasks flattened for a spreadsheet, with relationships spelled out. */
export function tasksToRows(data) {
  const d = data || {}
  const tasksById = Object.fromEntries((d.tasks || []).map((t) => [t.id, t]))
  const nameOf = (id) => tasksById[id]?.title || '(deleted)'

  const rows = []
  for (const ws of d.workstreams || []) {
    const mine = (d.tasks || []).filter((t) => t.workstream_id === ws.id)
    const tree = buildWorkstreamTree(mine)

    const emit = (task, parentTitle) => {
      const blockedBy = (d.dependencies || [])
        .filter((x) => x.task_id === task.id)
        .map((x) => nameOf(x.depends_on_task_id))
      const related = (d.taskLinks || [])
        .filter((x) => x.task_a_id === task.id || x.task_b_id === task.id)
        .map((x) => nameOf(x.task_a_id === task.id ? x.task_b_id : x.task_a_id))
      rows.push({
        Line: ws.name,
        Type: task.item_type,
        Sequence: parentTitle || '',
        Title: task.title,
        Status: task.status,
        'Due date': task.due_date || '',
        Repeats: describeRecurrence(task) || '',
        'Blocked by': blockedBy.join('; '),
        'Related to': related.join('; '),
        Notes: task.notes || '',
      })
    }

    for (const node of tree) {
      emit(node, '')
      // Steps follow their sequence, so the ordering in the file matches the
      // ordering on screen.
      for (const step of node.steps || []) emit(step, node.title)
    }
  }
  return rows
}

export function tasksToCSV(data) {
  return toCSV(tasksToRows(data), TASK_HEADERS)
}

/** e.g. lines-export-2026-08-02.json */
export function exportFilename(extension, now = new Date()) {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
  return `lines-export-${stamp}.${extension}`
}

/** Hand a string to the browser as a file. Returns false where that isn't possible. */
export function downloadFile(filename, contents, mime = 'application/json') {
  try {
    const blob = new Blob([contents], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch {
    return false
  }
}

export function downloadJSON(data, now = new Date()) {
  return downloadFile(exportFilename('json', now), toJSON(buildExportBundle(data, now)), 'application/json')
}

export function downloadCSV(data, now = new Date()) {
  return downloadFile(exportFilename('csv', now), tasksToCSV(data), 'text/csv')
}
