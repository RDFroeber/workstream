import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ThemeProvider } from '../src/lib/theme'
import GridLayout from '../src/components/GridLayout'
import InboxView from '../src/components/InboxView'
import SettingsPanel from '../src/components/SettingsPanel'
import { getPrefs } from '../src/lib/notifications'
import { appUrl } from '../src/lib/api'

const noop = () => {}
const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>)

beforeEach(() => localStorage.clear())

// ---------------------------------------------------------------------------
// GridLayout — the branchiest component, at 25% branch coverage
// ---------------------------------------------------------------------------

describe('GridLayout', () => {
  const ws = { id: 'w1', name: 'Website', color: '#6C4FA0', status: 'active', sort_order: 0 }
  const base = { workstream_id: 'w1', parent_id: null, item_type: 'standalone', status: 'todo' }

  const render_ = (tasks, extra = {}) =>
    wrap(
      <GridLayout
        workstreams={[ws]}
        tasksByWorkstream={{ w1: tasks }}
        dependencies={[]}
        tasksById={Object.fromEntries(tasks.map((t) => [t.id, t]))}
        workstreamsById={{ w1: ws }}
        onOpen={noop}
        onReorder={noop}
        {...extra}
      />
    )

  it('opens a card with the keyboard, not just the mouse', () => {
    // The card is a div with role=button, so Enter and Space have to be wired
    // up by hand — a real button would have got them for free.
    const onOpen = vi.fn()
    render_([{ ...base, id: 't1', title: 'A task', sort_order: 0 }], { onOpen })
    const card = screen.getByRole('button', { name: 'Open Website' })
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith('w1')
    fireEvent.keyDown(card, { key: ' ' })
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('ignores other keys', () => {
    const onOpen = vi.fn()
    render_([], { onOpen })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open Website' }), { key: 'Tab' })
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('says a line is empty rather than showing a blank card', () => {
    render_([])
    expect(screen.getByText('No tasks yet')).toBeTruthy()
  })

  it('says when a line is finished', () => {
    render_([{ ...base, id: 't1', title: 'Done thing', status: 'done', sort_order: 0 }])
    expect(screen.getByText('All caught up on this line')).toBeTruthy()
    expect(screen.getByText('1/1')).toBeTruthy()
  })

  it('counts recurring upkeep separately from finite progress', () => {
    // A line of pure upkeep has no denominator, so it must not show 0/0.
    render_([
      {
        ...base,
        id: 't1',
        title: 'Weekly review',
        sort_order: 0,
        recurrence_unit: 'week',
        recurrence_interval: 1,
      },
    ])
    expect(screen.getByText('1 recurring')).toBeTruthy()
    expect(screen.queryByText('0/0')).toBeNull()
  })

  it('shows a done-over-total count for ordinary work', () => {
    render_([
      { ...base, id: 't1', title: 'One', status: 'done', sort_order: 0 },
      { ...base, id: 't2', title: 'Two', sort_order: 1 },
    ])
    expect(screen.getByText('1/2')).toBeTruthy()
  })

  it('names what a card is waiting on', () => {
    const blocker = { id: 'x', title: 'Budget sign-off', workstream_id: 'w2', status: 'todo' }
    wrap(
      <GridLayout
        workstreams={[ws]}
        tasksByWorkstream={{ w1: [{ ...base, id: 't1', title: 'Blocked', sort_order: 0 }] }}
        dependencies={[{ id: 'd1', task_id: 't1', depends_on_task_id: 'x' }]}
        tasksById={{ x: blocker }}
        workstreamsById={{ w1: ws, w2: { id: 'w2', name: 'Finance', color: '#A34E1F' } }}
        onOpen={noop}
        onReorder={noop}
      />
    )
    expect(screen.getByText(/Budget sign-off.*Finance/)).toBeTruthy()
  })

  it('mutes everything after the first upcoming action', () => {
    // The next thing should read louder than the two behind it.
    const { container } = render_([
      { ...base, id: 't1', title: 'First', sort_order: 0 },
      { ...base, id: 't2', title: 'Second', sort_order: 1 },
    ])
    expect(container.querySelector('.text-ink.truncate')).toBeTruthy()
    expect(screen.getByText('Second').className).toContain('text-muted')
  })

  it('shows a sequence by its current step', () => {
    render_([
      { ...base, id: 'seq', title: 'Close', item_type: 'sequence', sort_order: 0 },
      { ...base, id: 's1', title: 'Pull reports', parent_id: 'seq', item_type: 'step', sort_order: 0 },
    ])
    expect(screen.getByText('Pull reports')).toBeTruthy()
    expect(screen.queryByText('Close')).toBeNull()
  })

  it('stays reorderable', () => {
    render_([])
    expect(screen.getByLabelText('Reorder Website')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// InboxView
// ---------------------------------------------------------------------------

describe('InboxView', () => {
  const ws = { id: 'w1', name: 'Website', color: '#6C4FA0' }
  const item = { id: 'i1', text: 'Captured thought' }

  it('celebrates an empty inbox', () => {
    wrap(<InboxView items={[]} workstreams={[ws]} onTriage={noop} onDismiss={noop} />)
    expect(screen.getByText(/Inbox zero/)).toBeTruthy()
  })

  it('throws an item away', () => {
    const onDismiss = vi.fn()
    wrap(<InboxView items={[item]} workstreams={[ws]} onTriage={noop} onDismiss={onDismiss} />)
    const row = screen.getByText('Captured thought').closest('div').parentElement
    fireEvent.click(within(row).getAllByRole('button')[0])
    expect(onDismiss).toHaveBeenCalledWith('i1')
  })

  it('sends an item to a line', () => {
    const onTriage = vi.fn()
    wrap(<InboxView items={[item]} workstreams={[ws]} onTriage={onTriage} onDismiss={noop} />)
    fireEvent.click(screen.getByText(/Send to a line/))
    fireEvent.click(screen.getByText('Website'))
    expect(onTriage).toHaveBeenCalledWith(item, 'w1')
  })

  it('backs out of the line picker', () => {
    wrap(<InboxView items={[item]} workstreams={[ws]} onTriage={noop} onDismiss={noop} />)
    fireEvent.click(screen.getByText(/Send to a line/))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.getByText(/Send to a line/)).toBeTruthy()
    expect(screen.queryByText('Website')).toBeNull()
  })

  it('keeps each item picker independent', () => {
    const second = { id: 'i2', text: 'Another thought' }
    wrap(
      <InboxView items={[item, second]} workstreams={[ws]} onTriage={noop} onDismiss={noop} />
    )
    fireEvent.click(screen.getAllByText(/Send to a line/)[0])
    // Only the row that was opened should show the picker.
    expect(screen.getAllByText(/Send to a line/)).toHaveLength(1)
    expect(screen.getAllByText('Website')).toHaveLength(1)
  })

  it('lists every line as a destination', () => {
    const lines = [ws, { id: 'w2', name: 'Hiring', color: '#A34E1F' }]
    wrap(<InboxView items={[item]} workstreams={lines} onTriage={noop} onDismiss={noop} />)
    fireEvent.click(screen.getByText(/Send to a line/))
    expect(screen.getByText('Website')).toBeTruthy()
    expect(screen.getByText('Hiring')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// SettingsPanel — reminder preferences were at 40% function coverage
// ---------------------------------------------------------------------------

describe('SettingsPanel reminder preferences', () => {
  const open = (props = {}) =>
    render(
      <SettingsPanel
        online
        pending={0}
        snapshotAt={null}
        onClose={noop}
        onSyncNow={noop}
        {...props}
      />
    )

  beforeEach(() => {
    globalThis.Notification = { permission: 'granted', requestPermission: async () => 'granted' }
    localStorage.setItem(
      'lines-notify-prefs',
      JSON.stringify({ enabled: true, dailyTime: '09:00', perTask: true })
    )
  })

  it('changes the daily summary time and remembers it', async () => {
    open()
    fireEvent.change(screen.getByLabelText(/Daily summary at/), { target: { value: '07:30' } })
    await waitFor(() => expect(getPrefs().dailyTime).toBe('07:30'))
  })

  it('turns per-task reminders off and back on', async () => {
    open()
    const box = screen.getByRole('checkbox')
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    await waitFor(() => expect(getPrefs().perTask).toBe(false))
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(getPrefs().perTask).toBe(true))
  })

  it('turns reminders off again without asking permission twice', () => {
    const requestPermission = vi.fn()
    globalThis.Notification = { permission: 'granted', requestPermission }
    open()
    fireEvent.click(screen.getByText('Reminders are on'))
    expect(getPrefs().enabled).toBe(false)
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('hides the detail settings while reminders are off', () => {
    localStorage.setItem('lines-notify-prefs', JSON.stringify({ enabled: false }))
    open()
    expect(screen.queryByLabelText(/Daily summary at/)).toBeNull()
  })

  it('does not enable reminders if permission is refused', async () => {
    globalThis.Notification = { permission: 'default', requestPermission: async () => 'denied' }
    localStorage.setItem('lines-notify-prefs', JSON.stringify({ enabled: false }))
    open()
    fireEvent.click(screen.getByText('Turn on reminders'))
    await waitFor(() => expect(screen.getByText(/blocked for this site/)).toBeTruthy())
    expect(getPrefs().enabled).toBe(false)
  })

  it('closes', () => {
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.click(screen.getByText('Settings').parentElement.querySelector('button'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows when the last full load happened', () => {
    const when = Date.now() - 60000
    open({ snapshotAt: when })
    expect(screen.getByText(new RegExp('Last full load'))).toBeTruthy()
  })

  it('says it is offline when it is', () => {
    open({ online: false })
    expect(screen.getByText(/Offline — working from cached data/)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Confirmation email redirect
// ---------------------------------------------------------------------------

describe('appUrl', () => {
  it('is an absolute url ending in a slash', () => {
    // Supabase needs an absolute address; a relative one is silently ignored
    // and the project's Site URL is used instead.
    const url = appUrl()
    expect(url).toMatch(/^https?:\/\//)
    expect(url.endsWith('/')).toBe(true)
  })

  it('keeps a project subpath rather than collapsing to the origin', () => {
    // On GitHub Pages the app lives at /workstream/, and a confirmation link
    // to the bare origin lands on a 404.
    const original = window.location.href
    delete window.location
    window.location = new URL('https://example.github.io/workstream/index.html')
    expect(appUrl()).toBe('https://example.github.io/workstream/')
    window.location = new URL(original)
  })
})
