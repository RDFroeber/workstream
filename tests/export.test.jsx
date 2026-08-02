import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  buildExportBundle,
  toJSON,
  csvCell,
  toCSV,
  tasksToRows,
  tasksToCSV,
  exportFilename,
  downloadFile,
  downloadJSON,
  downloadCSV,
  EXPORT_VERSION,
} from '../src/lib/export'
import ErrorBoundary from '../src/components/ErrorBoundary'
import { saveSnapshot } from '../src/lib/offline'

const ws = { id: 'w1', name: 'Website', color: '#6C4FA0', status: 'active', sort_order: 0 }
const ws2 = { id: 'w2', name: 'Hiring', color: '#A34E1F', status: 'active', sort_order: 1 }
const t = (o) => ({
  workstream_id: 'w1',
  parent_id: null,
  item_type: 'standalone',
  status: 'todo',
  notes: '',
  due_date: null,
  sort_order: 0,
  ...o,
})

const sample = () => ({
  workstreams: [ws, ws2],
  tasks: [
    t({ id: 't1', title: 'Send the brief', due_date: '2026-09-01' }),
    t({ id: 'seq', title: 'Monthly close', item_type: 'sequence', sort_order: 1 }),
    t({ id: 's1', title: 'Pull reports', parent_id: 'seq', item_type: 'step', sort_order: 0 }),
    t({ id: 't2', title: 'Review portfolios', workstream_id: 'w2' }),
  ],
  dependencies: [{ id: 'd1', task_id: 't1', depends_on_task_id: 't2' }],
  taskLinks: [{ id: 'l1', task_a_id: 't1', task_b_id: 't2' }],
  inbox: [{ id: 'i1', text: 'a thought' }],
})

beforeEach(() => localStorage.clear())

// ---------------------------------------------------------------------------

describe('JSON bundle', () => {
  it('carries a format marker and a version', () => {
    // Anything reading this back needs to know what it is and which shape.
    const b = buildExportBundle(sample())
    expect(b.format).toBe('lines-export')
    expect(b.version).toBe(EXPORT_VERSION)
    expect(b.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('includes every table, losslessly', () => {
    const b = buildExportBundle(sample())
    expect(b.workstreams).toHaveLength(2)
    expect(b.tasks).toHaveLength(4)
    expect(b.dependencies).toHaveLength(1)
    expect(b.taskLinks).toHaveLength(1)
    expect(b.inbox).toHaveLength(1)
    // Ids survive, so relationships can be rebuilt.
    expect(b.tasks.find((x) => x.id === 's1').parent_id).toBe('seq')
  })

  it('counts what it contains', () => {
    expect(buildExportBundle(sample()).counts).toEqual({
      workstreams: 2,
      tasks: 4,
      dependencies: 1,
      taskLinks: 1,
      inbox: 1,
    })
  })

  it('produces a file with nothing in it rather than throwing', () => {
    const b = buildExportBundle(undefined)
    expect(b.counts.tasks).toBe(0)
    expect(() => toJSON(b)).not.toThrow()
  })

  it('round-trips through JSON', () => {
    const parsed = JSON.parse(toJSON(buildExportBundle(sample())))
    expect(parsed.tasks.map((x) => x.id).sort()).toEqual(['s1', 'seq', 't1', 't2'])
  })
})

// ---------------------------------------------------------------------------

describe('CSV escaping', () => {
  it('leaves ordinary text alone', () => {
    expect(csvCell('Send the brief')).toBe('Send the brief')
  })

  it('quotes a value containing a comma', () => {
    // Otherwise every following column shifts by one.
    expect(csvCell('Migrate, then verify')).toBe('"Migrate, then verify"')
  })

  it('doubles embedded quotes', () => {
    expect(csvCell('Call it "done"')).toBe('"Call it ""done"""')
  })

  it('quotes a value containing a newline', () => {
    // Notes are a textarea, so this is the common case, not the exotic one.
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"')
  })

  it('handles a carriage return', () => {
    expect(csvCell('a\r\nb')).toBe('"a\r\nb"')
  })

  it('renders empty for null and undefined, not the words', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('keeps zero and false rather than blanking them', () => {
    expect(csvCell(0)).toBe('0')
    expect(csvCell(false)).toBe('false')
  })

  it('survives a title that is nothing but delimiters', () => {
    expect(csvCell('",\n"')).toBe('""",\n"""')
  })
})

describe('CSV assembly', () => {
  it('puts headers first and one row per record', () => {
    const csv = toCSV([{ a: 1, b: 2 }], ['a', 'b'])
    const lines = csv.replace('\uFEFF', '').split('\r\n')
    expect(lines[0]).toBe('a,b')
    expect(lines[1]).toBe('1,2')
  })

  it('starts with a byte order mark, because this opens in Excel', () => {
    expect(toCSV([], ['a']).startsWith('\uFEFF')).toBe(true)
  })

  it('uses CRLF line endings', () => {
    expect(toCSV([{ a: 1 }, { a: 2 }], ['a'])).toContain('\r\n')
  })

  it('leaves a missing field empty rather than writing undefined', () => {
    expect(toCSV([{ a: 1 }], ['a', 'b']).replace('\uFEFF', '').split('\r\n')[1]).toBe('1,')
  })
})

describe('task rows', () => {
  it('groups by line and keeps steps under their sequence', () => {
    const rows = tasksToRows(sample())
    expect(rows.map((r) => r.Title)).toEqual([
      'Send the brief',
      'Monthly close',
      'Pull reports',
      'Review portfolios',
    ])
    expect(rows.find((r) => r.Title === 'Pull reports').Sequence).toBe('Monthly close')
  })

  it('names the line each task belongs to', () => {
    const rows = tasksToRows(sample())
    expect(rows.find((r) => r.Title === 'Review portfolios').Line).toBe('Hiring')
  })

  it('spells relationships out as names, not ids', () => {
    // A spreadsheet full of uuids helps nobody.
    const row = tasksToRows(sample()).find((r) => r.Title === 'Send the brief')
    expect(row['Blocked by']).toBe('Review portfolios')
    expect(row['Related to']).toBe('Review portfolios')
  })

  it('marks a relationship whose other end is gone', () => {
    const data = sample()
    data.dependencies = [{ id: 'd9', task_id: 't1', depends_on_task_id: 'vanished' }]
    expect(tasksToRows(data).find((r) => r.Title === 'Send the brief')['Blocked by']).toBe(
      '(deleted)'
    )
  })

  it('describes a repeat rule in words', () => {
    const data = sample()
    data.tasks[0] = t({
      id: 't1',
      title: 'Weekly review',
      recurrence_unit: 'week',
      recurrence_interval: 2,
    })
    expect(tasksToRows(data).find((r) => r.Title === 'Weekly review').Repeats).toBe('Every 2 weeks')
  })

  it('produces nothing for an account with no lines', () => {
    expect(tasksToRows({ workstreams: [], tasks: [] })).toEqual([])
    expect(tasksToRows(undefined)).toEqual([])
  })

  it('escapes properly all the way through to the file', () => {
    const data = sample()
    data.tasks[0] = t({ id: 't1', title: 'Migrate, verify', notes: 'said "go"\nthen went' })
    const csv = tasksToCSV(data)
    expect(csv).toContain('"Migrate, verify"')
    expect(csv).toContain('"said ""go""\nthen went"')
  })
})

describe('filenames', () => {
  it('is dated and has the right extension', () => {
    const name = exportFilename('json', new Date(2026, 7, 2))
    expect(name).toBe('lines-export-2026-08-02.json')
  })

  it('pads single-digit months and days', () => {
    expect(exportFilename('csv', new Date(2026, 0, 5))).toBe('lines-export-2026-01-05.csv')
  })
})

describe('download', () => {
  let clicked
  beforeEach(() => {
    clicked = []
    global.URL.createObjectURL = vi.fn(() => 'blob:fake')
    global.URL.revokeObjectURL = vi.fn()
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag)
      if (tag === 'a') el.click = () => clicked.push({ href: el.href, download: el.download })
      return el
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('hands a named file to the browser', () => {
    expect(downloadFile('x.json', '{}', 'application/json')).toBe(true)
    expect(clicked[0].download).toBe('x.json')
  })

  it('cleans up the object url afterwards', () => {
    vi.useFakeTimers()
    downloadFile('x.json', '{}')
    vi.advanceTimersByTime(2000)
    expect(URL.revokeObjectURL).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('leaves no anchor behind in the document', () => {
    downloadFile('x.json', '{}')
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
  })

  it('reports failure rather than throwing', () => {
    global.URL.createObjectURL = () => {
      throw new Error('nope')
    }
    expect(downloadFile('x.json', '{}')).toBe(false)
  })

  it('exports both formats with the right names', () => {
    const when = new Date(2026, 7, 2)
    downloadJSON(sample(), when)
    downloadCSV(sample(), when)
    expect(clicked.map((c) => c.download)).toEqual([
      'lines-export-2026-08-02.json',
      'lines-export-2026-08-02.csv',
    ])
  })
})

// ---------------------------------------------------------------------------

const Boom = () => {
  throw new Error('render exploded')
}
const Fine = () => <div>the app</div>

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // The boundary logs deliberately; keep the test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  // restoreAllMocks, not just the console spy: one test here replaces
  // document.createElement, and leaving that in place made the next describe
  // capture the spy as its "original" and recurse until the stack blew.
  afterEach(() => vi.restoreAllMocks())

  it('stays out of the way when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <Fine />
      </ErrorBoundary>
    )
    expect(screen.getByText('the app')).toBeTruthy()
  })

  it('shows a message instead of a blank page', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something broke')).toBeTruthy()
  })

  it('says the data is safe, because that is the first worry', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByText(/Your data is safe on the server/)).toBeTruthy()
  })

  it('logs the failure so it is findable', () => {
    const logged = vi.mocked(console.error)
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    expect(logged).toHaveBeenCalled()
  })

  it('offers the error message without making it the headline', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByText('Error details')).toBeTruthy()
    expect(screen.getByText('render exploded')).toBeTruthy()
  })

  it('can recover when the cause has passed', () => {
    let shouldThrow = true
    const Flaky = () => {
      if (shouldThrow) throw new Error('once')
      return <div>recovered</div>
    }
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    )
    shouldThrow = false
    fireEvent.click(screen.getByText('Try again'))
    expect(screen.getByText('recovered')).toBeTruthy()
  })

  it('offers the data download only when there is a cached copy', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByText(/Download a copy of your data/).closest('button').disabled).toBe(true)
    expect(screen.getByText(/no cached copy on this device/)).toBeTruthy()
  })

  it('rescues data from the cached snapshot', () => {
    // The Settings export is unreachable when the app can't render, which is
    // exactly when you want a copy.
    saveSnapshot({ workstreams: [ws], tasks: [], dependencies: [], taskLinks: [], inbox: [] })
    global.URL.createObjectURL = vi.fn(() => 'blob:fake')
    global.URL.revokeObjectURL = vi.fn()
    let downloaded = null
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag)
      if (tag === 'a') el.click = () => (downloaded = el.download)
      return el
    })
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    fireEvent.click(screen.getByText(/Download a copy of your data/))
    expect(downloaded).toMatch(/^lines-export-.*\.json$/)
    expect(screen.getByText(/Saved\./)).toBeTruthy()
  })

  it('asks before clearing the cache, since unsynced work would go with it', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    fireEvent.click(screen.getByText(/Clear cached data/))
    expect(screen.getByText(/Anything not yet synced will be lost/)).toBeTruthy()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.getByText(/Clear cached data/)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------

describe('wiring', () => {
  const main = require('fs').readFileSync(
    require('path').join(process.cwd(), 'src', 'main.jsx'),
    'utf8'
  )

  it('wraps the app', () => {
    expect(main).toContain('<ErrorBoundary>')
  })

  it('sits outside the theme provider', () => {
    // If ThemeProvider itself throws there still has to be something above it.
    // The fallback styles come from CSS variables on <html>, not from context,
    // so it renders correctly either way.
    expect(main.indexOf('<ErrorBoundary>')).toBeLessThan(main.indexOf('<ThemeProvider>'))
  })
})

describe('export from Settings', () => {
  let clicked
  beforeEach(() => {
    clicked = []
    globalThis.Notification = { permission: 'default', requestPermission: async () => 'granted' }
    global.URL.createObjectURL = vi.fn(() => 'blob:fake')
    global.URL.revokeObjectURL = vi.fn()
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag)
      if (tag === 'a') el.click = () => clicked.push(el.download)
      return el
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('offers both formats and explains the difference', async () => {
    const SettingsPanel = (await import('../src/components/SettingsPanel')).default
    render(
      <SettingsPanel
        online
        pending={0}
        snapshotAt={null}
        onClose={() => {}}
        onSyncNow={() => {}}
        data={sample()}
      />
    )
    expect(screen.getByText('Everything, for a backup')).toBeTruthy()
    expect(screen.getByText('Tasks, for a spreadsheet')).toBeTruthy()
    fireEvent.click(screen.getByText('JSON'))
    fireEvent.click(screen.getByText('CSV'))
    expect(clicked).toHaveLength(2)
    expect(clicked[0]).toMatch(/\.json$/)
    expect(clicked[1]).toMatch(/\.csv$/)
  })

  it('says plainly that the CSV is not a full backup', () => {
    // Someone relying on the spreadsheet as their only copy would lose the
    // relationships between tasks.
    return import('../src/components/SettingsPanel').then(({ default: SettingsPanel }) => {
      render(
        <SettingsPanel
          online
          pending={0}
          snapshotAt={null}
          onClose={() => {}}
          onSyncNow={() => {}}
          data={sample()}
        />
      )
      expect(screen.getByText(/not a complete backup/)).toBeTruthy()
    })
  })
})

describe('ErrorBoundary recovery paths', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it('reloads the page on request', () => {
    const reload = vi.fn()
    const original = window.location
    delete window.location
    window.location = { ...original, reload }
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    fireEvent.click(screen.getByText('Reload the page'))
    expect(reload).toHaveBeenCalled()
    window.location = original
  })

  it('clears the cache and reloads as a last resort', () => {
    // A corrupted snapshot can crash the app on every load, and there'd be no
    // way out from inside the app without this.
    saveSnapshot({ workstreams: [ws], tasks: [], dependencies: [], taskLinks: [], inbox: [] })
    const reload = vi.fn()
    const original = window.location
    delete window.location
    window.location = { ...original, reload }
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    fireEvent.click(screen.getByText(/Clear cached data/))
    fireEvent.click(screen.getByText('Clear'))
    expect(localStorage.getItem('lines-snapshot')).toBe(null)
    expect(reload).toHaveBeenCalled()
    window.location = original
  })

  it('reports a download that could not start', () => {
    saveSnapshot({ workstreams: [], tasks: [], dependencies: [], taskLinks: [], inbox: [] })
    global.URL.createObjectURL = () => {
      throw new Error('blocked')
    }
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    fireEvent.click(screen.getByText(/Download a copy of your data/))
    expect(screen.getByText(/couldn't start/)).toBeTruthy()
  })

  it('dates the cached copy so you know how old it is', () => {
    saveSnapshot({ workstreams: [ws], tasks: [], dependencies: [], taskLinks: [], inbox: [] })
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByText(/From the last full load on/)).toBeTruthy()
  })
})
