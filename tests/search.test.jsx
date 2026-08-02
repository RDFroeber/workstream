import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ThemeProvider } from '../src/lib/theme'
import SearchDialog from '../src/components/SearchDialog'
import { searchAll, scoreText, normalize, RESULT_LIMIT } from '../src/lib/search'

const noop = () => {}
const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>)

const ws = { id: 'w1', name: 'Website redesign', color: '#6C4FA0', status: 'active', sort_order: 0 }
const ws2 = { id: 'w2', name: 'Q3 hiring', color: '#A34E1F', status: 'active', sort_order: 1 }
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

const data = {
  workstreams: [ws, ws2],
  tasks: [
    t({ id: 't1', title: 'Send the brief' }),
    t({ id: 't2', title: 'Review portfolios', workstream_id: 'w2', sort_order: 0 }),
    t({ id: 't3', title: 'Passport renewal', sort_order: 1 }),
    t({ id: 'seq', title: 'Vendor selection', item_type: 'sequence', sort_order: 2 }),
    t({ id: 's1', title: 'Shortlist three', parent_id: 'seq', item_type: 'step', sort_order: 0 }),
    t({ id: 't4', title: 'Old thing', status: 'done', sort_order: 3 }),
    t({ id: 't5', title: 'Untitled', notes: 'remember the brief deadline', sort_order: 4 }),
  ],
  dependencies: [],
  taskLinks: [],
  inbox: [],
}

// ---------------------------------------------------------------------------

describe('normalize', () => {
  it('folds case', () => {
    expect(normalize('Send The Brief')).toBe('send the brief')
  })

  it('strips accents, so the unaccented spelling still finds it', () => {
    expect(normalize('Café')).toBe('cafe')
    expect(normalize('Ström')).toBe('strom')
  })

  it('handles nothing at all', () => {
    expect(normalize(null)).toBe('')
    expect(normalize(undefined)).toBe('')
  })
})

describe('scoreText ranking', () => {
  it('ranks an exact match highest', () => {
    expect(scoreText('brief', 'brief')).toBe(100)
  })

  it('ranks a prefix above a word start above a mid-word hit', () => {
    // "port" should find "Review portfolios" before "Passport renewal".
    const prefix = scoreText('portfolios review', 'port')
    const wordStart = scoreText('review portfolios', 'port')
    const midWord = scoreText('passport renewal', 'port')
    expect(prefix).toBeGreaterThan(wordStart)
    expect(wordStart).toBeGreaterThan(midWord)
    expect(midWord).toBeGreaterThan(0)
  })

  it('returns zero when there is no match', () => {
    expect(scoreText('send the brief', 'zzz')).toBe(0)
    expect(scoreText('', 'anything')).toBe(0)
  })

  it('does not choke on regex characters in the query', () => {
    // A user typing "(draft)" must not blow up the regex.
    expect(() => scoreText('a (draft) thing', '(draft)')).not.toThrow()
    expect(scoreText('a (draft) thing', '(draft)')).toBeGreaterThan(0)
    expect(() => scoreText('costs $5', '$5')).not.toThrow()
  })
})

describe('searchAll', () => {
  it('returns nothing for an empty query', () => {
    expect(searchAll('', data)).toEqual([])
    expect(searchAll('   ', data)).toEqual([])
  })

  it('finds a task by title', () => {
    const r = searchAll('brief', data)
    expect(r[0].title).toBe('Send the brief')
    expect(r[0].type).toBe('task')
  })

  it('ranks a word-start match above one buried mid-word', () => {
    const titles = searchAll('port', data).map((r) => r.title)
    expect(titles.indexOf('Review portfolios')).toBeLessThan(titles.indexOf('Passport renewal'))
  })

  it('finds a line by name', () => {
    const r = searchAll('hiring', data)
    expect(r[0].type).toBe('line')
    expect(r[0].id).toBe('w2')
  })

  it('names the line a task belongs to', () => {
    expect(searchAll('portfolios', data)[0].subtitle).toBe('Q3 hiring')
  })

  it('names the sequence a step belongs to', () => {
    expect(searchAll('shortlist', data)[0].subtitle).toBe('Website redesign · Vendor selection')
  })

  it('searches notes, and says so', () => {
    const r = searchAll('deadline', data)
    expect(r[0].title).toBe('Untitled')
    expect(r[0].matchedNotes).toBe(true)
  })

  it('prefers a title match over a notes match', () => {
    // Both "Send the brief" and the notes of "Untitled" mention brief.
    const titles = searchAll('brief', data).map((r) => r.title)
    expect(titles[0]).toBe('Send the brief')
    expect(titles).toContain('Untitled')
  })

  it('includes completed work but ranks it below open work', () => {
    // You often search for something precisely because you finished it.
    const withDone = {
      ...data,
      tasks: [
        t({ id: 'a', title: 'Migration notes', status: 'done' }),
        t({ id: 'b', title: 'Migration plan', sort_order: 1 }),
      ],
    }
    const r = searchAll('migration', withDone)
    expect(r.map((x) => x.title)).toEqual(['Migration plan', 'Migration notes'])
  })

  it('marks a sequence as such', () => {
    expect(searchAll('vendor selection', data)[0].type).toBe('sequence')
  })

  it('is case and accent insensitive', () => {
    const accented = {
      workstreams: [ws],
      tasks: [t({ id: 'a', title: 'Café refit' })],
      dependencies: [],
      taskLinks: [],
      inbox: [],
    }
    expect(searchAll('CAFE', accented)).toHaveLength(1)
    expect(searchAll('café', accented)).toHaveLength(1)
  })

  it('breaks ties by due date so repeat searches keep their order', () => {
    const tied = {
      workstreams: [ws],
      tasks: [
        t({ id: 'a', title: 'Review budget', due_date: '2026-12-01' }),
        t({ id: 'b', title: 'Review vendors', due_date: '2026-09-01', sort_order: 1 }),
      ],
      dependencies: [],
      taskLinks: [],
      inbox: [],
    }
    expect(searchAll('review', tied).map((r) => r.title)).toEqual([
      'Review vendors',
      'Review budget',
    ])
  })

  it('caps how much it returns', () => {
    const many = {
      workstreams: [ws],
      tasks: Array.from({ length: 100 }, (_, i) => t({ id: `t${i}`, title: `Task ${i}`, sort_order: i })),
      dependencies: [],
      taskLinks: [],
      inbox: [],
    }
    expect(searchAll('task', many).length).toBe(RESULT_LIMIT)
  })

  it('survives an empty or missing data set', () => {
    expect(searchAll('anything', undefined)).toEqual([])
    expect(searchAll('anything', { workstreams: [], tasks: [] })).toEqual([])
  })
})

// ---------------------------------------------------------------------------

describe('SearchDialog', () => {
  const open = (extra = {}) =>
    wrap(
      <SearchDialog data={data} onOpenTask={noop} onOpenLine={noop} onClose={noop} {...extra} />
    )
  const field = () => screen.getByLabelText('Search tasks and lines')

  it('invites a query before anything is typed', () => {
    open()
    expect(screen.getByText(/Search across every line/)).toBeTruthy()
  })

  it('shows matches as you type', () => {
    open()
    fireEvent.change(field(), { target: { value: 'brief' } })
    expect(screen.getByText('Send the brief')).toBeTruthy()
  })

  it('says so when nothing matches', () => {
    open()
    fireEvent.change(field(), { target: { value: 'zzzzz' } })
    expect(screen.getByText(/Nothing matches "zzzzz"/)).toBeTruthy()
  })

  it('opens a task with Enter', () => {
    const onOpenTask = vi.fn()
    open({ onOpenTask })
    fireEvent.change(field(), { target: { value: 'brief' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }))
  })

  it('moves the highlight with the arrow keys', () => {
    const onOpenTask = vi.fn()
    const two = {
      workstreams: [ws],
      tasks: [
        t({ id: 'first', title: 'Review budget' }),
        t({ id: 'second', title: 'Review vendors', sort_order: 1 }),
      ],
      dependencies: [],
      taskLinks: [],
      inbox: [],
    }
    open({ onOpenTask, data: two })
    fireEvent.change(field(), { target: { value: 'review' } })
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    // The second result, not the first.
    expect(onOpenTask.mock.calls[0][0].id).toBe('second')
  })

  it('will not run off either end of the list', () => {
    open()
    fireEvent.change(field(), { target: { value: 'brief' } })
    for (let i = 0; i < 5; i++) fireEvent.keyDown(field(), { key: 'ArrowUp' })
    for (let i = 0; i < 20; i++) fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(() => fireEvent.keyDown(field(), { key: 'Enter' })).not.toThrow()
  })

  it('opens a line rather than a task when a line is chosen', () => {
    const onOpenLine = vi.fn()
    open({ onOpenLine })
    fireEvent.change(field(), { target: { value: 'hiring' } })
    fireEvent.click(screen.getByText('Q3 hiring'))
    expect(onOpenLine).toHaveBeenCalledWith('w2')
  })

  it('closes on Escape and on a backdrop click', () => {
    const onClose = vi.fn()
    const { container } = open({ onClose })
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(container.querySelector('[aria-hidden="true"]'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('closes after opening something', () => {
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.change(field(), { target: { value: 'brief' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onClose).toHaveBeenCalled()
  })

  it('does nothing on Enter with no results', () => {
    const onOpenTask = vi.fn()
    const onClose = vi.fn()
    open({ onOpenTask, onClose })
    fireEvent.change(field(), { target: { value: 'zzzzz' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onOpenTask).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('resets the highlight when the query changes', () => {
    // Otherwise the highlight points at a row that is no longer there.
    const onOpenTask = vi.fn()
    open({ onOpenTask })
    fireEvent.change(field(), { target: { value: 'review' } })
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.change(field(), { target: { value: 'brief' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }))
  })

  it('announces itself as a dialog', () => {
    open()
    const dialog = screen.getByRole('dialog', { name: 'Search' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('counts what it found', () => {
    open()
    fireEvent.change(field(), { target: { value: 'brief' } })
    expect(screen.getByText(/results?$/)).toBeTruthy()
  })

  it('has no nested buttons', () => {
    const { container } = open()
    fireEvent.change(field(), { target: { value: 'e' } })
    expect(container.querySelectorAll('button button')).toHaveLength(0)
  })
})

describe('search wiring', () => {
  const app = require('fs').readFileSync(
    require('path').join(process.cwd(), 'src', 'App.jsx'),
    'utf8'
  )

  it('is bound to the shortcut people already try', () => {
    expect(app).toMatch(/metaKey \|\| e\.ctrlKey/)
    expect(app).toMatch(/'k'/)
  })

  it('lands on the task line as well as the task', () => {
    // So closing the panel leaves you somewhere sensible.
    const handler = app.slice(app.indexOf('<SearchDialog'), app.indexOf('onClose={() => setShowSearch'))
    expect(handler).toContain('setActiveWorkstreamId(task.workstream_id)')
    expect(handler).toContain('setOpenTaskId(task.id)')
  })
})
