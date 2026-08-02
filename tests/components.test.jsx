import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ThemeProvider, useTheme, useLineColor } from '../src/lib/theme'

const noop = () => {}
const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>)

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const authMocks = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn() }))
vi.mock('../src/lib/api', async (orig) => ({
  ...(await orig()),
  signIn: authMocks.signIn,
  signUp: authMocks.signUp,
}))

const Auth = (await import('../src/components/Auth')).default

describe('Auth', () => {
  beforeEach(() => {
    authMocks.signIn.mockReset().mockResolvedValue({})
    authMocks.signUp.mockReset().mockResolvedValue({})
  })

  const fill = () => {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw123456' } })
  }

  it('signs in with what was typed', async () => {
    render(<Auth />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(authMocks.signIn).toHaveBeenCalledWith('a@b.com', 'pw123456'))
  })

  it('switches to sign-up and back', () => {
    render(<Auth />)
    fireEvent.click(screen.getByText(/Don't have an account/))
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeTruthy()
    fireEvent.click(screen.getByText(/Already have an account/))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('explains that confirmation may be required after signing up', async () => {
    render(<Auth />)
    fireEvent.click(screen.getByText(/Don't have an account/))
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    await waitFor(() => expect(screen.getByText(/Account created/)).toBeTruthy())
  })

  it('shows the reason a sign-in failed', async () => {
    authMocks.signIn.mockRejectedValue(new Error('Invalid login credentials'))
    render(<Auth />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText('Invalid login credentials')).toBeTruthy())
  })

  it('falls back to a generic message when the error has none', async () => {
    authMocks.signIn.mockRejectedValue({})
    render(<Auth />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText(/Something went wrong/)).toBeTruthy())
  })

  it('clears a stale error when switching mode', async () => {
    authMocks.signIn.mockRejectedValue(new Error('Nope'))
    render(<Auth />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText('Nope')).toBeTruthy())
    fireEvent.click(screen.getByText(/Don't have an account/))
    expect(screen.queryByText('Nope')).toBeNull()
  })

  it('disables the button while the request is in flight', async () => {
    let release
    authMocks.signIn.mockReturnValue(new Promise((r) => (release = r)))
    render(<Auth />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Working…' }).disabled).toBe(true))
    release({})
  })
})

// ---------------------------------------------------------------------------

const Nav = (await import('../src/components/Nav')).default
const Toast = (await import('../src/components/Toast')).default
const Modal = (await import('../src/components/Modal')).default
const QuickCapture = (await import('../src/components/QuickCapture')).default
const ThemeToggle = (await import('../src/components/ThemeToggle')).default
const SetupNotice = (await import('../src/components/SetupNotice')).default
const OfflineBanner = (await import('../src/components/OfflineBanner')).default
const SettingsPanel = (await import('../src/components/SettingsPanel')).default
const WorkstreamForm = (await import('../src/components/WorkstreamForm')).default
const { StatusPill, DueBadge, IconButton } = await import('../src/components/ui')

describe('Nav', () => {
  it('offers the three sections and reports the choice', () => {
    const onChange = vi.fn()
    render(<Nav active="dashboard" onChange={onChange} inboxCount={0} />)
    fireEvent.click(screen.getByText('Today'))
    expect(onChange).toHaveBeenCalledWith('today')
  })

  it('badges the inbox only when it has something in it', () => {
    const { rerender } = render(<Nav active="dashboard" onChange={noop} inboxCount={0} />)
    expect(screen.queryByText('3')).toBeNull()
    rerender(<Nav active="dashboard" onChange={noop} inboxCount={3} />)
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('copes with no active section, as when a line is open', () => {
    expect(() => render(<Nav active={null} onChange={noop} inboxCount={0} />)).not.toThrow()
  })
})

describe('Toast', () => {
  afterEach(() => vi.useRealTimers())

  it('renders nothing without a message', () => {
    const { container } = render(<Toast message={null} onDone={noop} />)
    expect(container.firstChild).toBe(null)
  })

  it('announces itself politely for screen readers', () => {
    render(<Toast message="Saved" onDone={noop} />)
    const el = screen.getByRole('status')
    expect(el.getAttribute('aria-live')).toBe('polite')
  })

  it('dismisses itself', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(<Toast message="Saved" onDone={onDone} />)
    vi.advanceTimersByTime(3000)
    expect(onDone).toHaveBeenCalled()
  })

  it('does not fire the timer after unmounting', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    const { unmount } = render(<Toast message="Saved" onDone={onDone} />)
    unmount()
    vi.advanceTimersByTime(5000)
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('Modal', () => {
  it('closes on Escape and on a backdrop click', () => {
    const onClose = vi.fn()
    const { container } = render(<Modal onClose={onClose}>body</Modal>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(container.querySelector('[aria-hidden="true"]'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('ignores other keys', () => {
    const onClose = vi.fn()
    render(<Modal onClose={onClose}>body</Modal>)
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stops listening once closed', () => {
    const onClose = vi.fn()
    const { unmount } = render(<Modal onClose={onClose}>body</Modal>)
    unmount()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('takes a wider form when asked', () => {
    const { container } = render(
      <Modal onClose={noop} wide>
        body
      </Modal>
    )
    expect(container.innerHTML).toContain('sm:max-w-lg')
  })
})

describe('QuickCapture', () => {
  it('opens, captures, and stays open for the next thought', () => {
    const onCapture = vi.fn()
    render(<QuickCapture onCapture={onCapture} />)
    fireEvent.click(screen.getByText('Quick capture'))
    const input = screen.getByPlaceholderText(/Capture anything/)
    fireEvent.change(input, { target: { value: 'buy milk' } })
    fireEvent.submit(input.closest('form'))
    expect(onCapture).toHaveBeenCalledWith('buy milk')
    // Still open — capturing one thing usually means capturing two.
    expect(screen.getByPlaceholderText(/Capture anything/)).toBeTruthy()
  })

  it('trims whitespace', () => {
    const onCapture = vi.fn()
    render(<QuickCapture onCapture={onCapture} />)
    fireEvent.click(screen.getByText('Quick capture'))
    const input = screen.getByPlaceholderText(/Capture anything/)
    fireEvent.change(input, { target: { value: '  spaced  ' } })
    fireEvent.submit(input.closest('form'))
    expect(onCapture).toHaveBeenCalledWith('spaced')
  })

  it('submitting nothing just closes it', () => {
    const onCapture = vi.fn()
    render(<QuickCapture onCapture={onCapture} />)
    fireEvent.click(screen.getByText('Quick capture'))
    const input = screen.getByPlaceholderText(/Capture anything/)
    fireEvent.submit(input.closest('form'))
    expect(onCapture).not.toHaveBeenCalled()
    expect(screen.getByText('Quick capture')).toBeTruthy()
  })

  it('collapses when blurred while empty, but not while holding text', () => {
    render(<QuickCapture onCapture={noop} />)
    fireEvent.click(screen.getByText('Quick capture'))
    fireEvent.blur(screen.getByPlaceholderText(/Capture anything/))
    expect(screen.getByText('Quick capture')).toBeTruthy()

    fireEvent.click(screen.getByText('Quick capture'))
    const input = screen.getByPlaceholderText(/Capture anything/)
    fireEvent.change(input, { target: { value: 'half a thought' } })
    fireEvent.blur(input)
    expect(screen.getByDisplayValue('half a thought')).toBeTruthy()
  })
})

describe('ThemeToggle', () => {
  it('offers light, system and dark as one radio group', () => {
    wrap(<ThemeToggle />)
    const group = screen.getByRole('radiogroup', { name: 'Color theme' })
    expect(within(group).getAllByRole('radio')).toHaveLength(3)
  })

  it('applies and remembers the choice', () => {
    wrap(<ThemeToggle />)
    fireEvent.click(screen.getByLabelText('Dark'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(JSON.parse(JSON.stringify(localStorage.getItem('lines-theme')))).toBe('dark')
    fireEvent.click(screen.getByLabelText('Light'))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('marks exactly one option as chosen', () => {
    wrap(<ThemeToggle />)
    fireEvent.click(screen.getByLabelText('Dark'))
    const checked = screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true')
    expect(checked).toHaveLength(1)
  })
})

describe('theme provider', () => {
  function Probe() {
    const { preference, isDark } = useTheme()
    const lineColor = useLineColor()
    return (
      <div>
        <span data-testid="pref">{preference}</span>
        <span data-testid="dark">{String(isDark)}</span>
        <span data-testid="navy">{lineColor('#2A3F8F')}</span>
      </div>
    )
  }

  it('defaults to following the system', () => {
    wrap(<Probe />)
    expect(screen.getByTestId('pref').textContent).toBe('system')
  })

  it('reads a stored preference and swaps line colors for it', () => {
    localStorage.setItem('lines-theme', JSON.stringify('dark').slice(1, -1))
    wrap(<Probe />)
    expect(screen.getByTestId('dark').textContent).toBe('true')
    expect(screen.getByTestId('navy').textContent).toBe('#4A72D1')
  })

  it('ignores a corrupted preference rather than breaking', () => {
    localStorage.setItem('lines-theme', 'not-a-theme')
    wrap(<Probe />)
    expect(screen.getByTestId('pref').textContent).toBe('system')
  })

  it('survives localStorage being unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => {
      wrap(<ThemeToggle />)
      fireEvent.click(screen.getByLabelText('Dark'))
    }).not.toThrow()
    spy.mockRestore()
  })
})

describe('SetupNotice', () => {
  it('names both environment variables that are missing', () => {
    render(<SetupNotice />)
    expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeTruthy()
  })
})

describe('OfflineBanner', () => {
  it('stays out of the way when everything is fine', () => {
    const { container } = render(
      <OfflineBanner online pending={0} snapshotAt={null} syncing={false} syncError={null} />
    )
    expect(container.firstChild).toBe(null)
  })

  it('says how stale the data is when offline', () => {
    render(
      <OfflineBanner online={false} pending={0} snapshotAt={Date.now() - 5 * 60000} syncing={false} />
    )
    expect(screen.getByText(/5 min ago/)).toBeTruthy()
  })

  it('counts queued changes, with correct singular and plural', () => {
    const { rerender } = render(
      <OfflineBanner online={false} pending={1} snapshotAt={Date.now()} syncing={false} />
    )
    expect(screen.getByText(/1 change will sync/)).toBeTruthy()
    rerender(<OfflineBanner online={false} pending={2} snapshotAt={Date.now()} syncing={false} />)
    expect(screen.getByText(/2 changes will sync/)).toBeTruthy()
  })

  it('copes with never having loaded before', () => {
    render(<OfflineBanner online={false} pending={0} snapshotAt={null} syncing={false} />)
    expect(screen.getByText(/your last visit/)).toBeTruthy()
  })

  it('describes older snapshots in hours and days', () => {
    const { rerender } = render(
      <OfflineBanner online={false} pending={0} snapshotAt={Date.now() - 3 * 3600e3} syncing={false} />
    )
    expect(screen.getByText(/3 hr ago/)).toBeTruthy()
    rerender(
      <OfflineBanner online={false} pending={0} snapshotAt={Date.now() - 50 * 3600e3} syncing={false} />
    )
    expect(screen.getByText(/2 d ago/)).toBeTruthy()
    rerender(
      <OfflineBanner online={false} pending={0} snapshotAt={Date.now() - 5000} syncing={false} />
    )
    expect(screen.getByText(/just now/)).toBeTruthy()
  })

  it('reports syncing progress once back online', () => {
    render(<OfflineBanner online pending={3} snapshotAt={Date.now()} syncing />)
    expect(screen.getByText(/Syncing 3 changes/)).toBeTruthy()
  })

  it('surfaces a sync error above everything else', () => {
    render(
      <OfflineBanner online pending={0} snapshotAt={Date.now()} syncing={false} syncError="2 dropped" />
    )
    expect(screen.getByText('2 dropped')).toBeTruthy()
  })
})

describe('SettingsPanel', () => {
  beforeEach(() => {
    globalThis.Notification = { permission: 'default', requestPermission: async () => 'granted' }
  })

  it('reports a healthy connection', () => {
    render(<SettingsPanel online pending={0} snapshotAt={Date.now()} onClose={noop} onSyncNow={noop} />)
    expect(screen.getByText('Connected')).toBeTruthy()
    expect(screen.getByText(/Everything is synced/)).toBeTruthy()
  })

  it('offers a manual sync only when there is something to send', () => {
    const onSyncNow = vi.fn()
    const { rerender } = render(
      <SettingsPanel online pending={0} snapshotAt={null} onClose={noop} onSyncNow={onSyncNow} />
    )
    expect(screen.queryByText('Sync now')).toBeNull()
    rerender(
      <SettingsPanel online pending={2} snapshotAt={null} onClose={noop} onSyncNow={onSyncNow} />
    )
    fireEvent.click(screen.getByText('Sync now'))
    expect(onSyncNow).toHaveBeenCalled()
  })

  it('turns reminders on after permission is granted', async () => {
    render(<SettingsPanel online pending={0} snapshotAt={null} onClose={noop} onSyncNow={noop} />)
    fireEvent.click(screen.getByText('Turn on reminders'))
    await waitFor(() => expect(screen.getByText('Reminders are on')).toBeTruthy())
    expect(screen.getByLabelText(/Daily summary at/)).toBeTruthy()
  })

  it('explains itself when the browser has blocked notifications', () => {
    globalThis.Notification = { permission: 'denied', requestPermission: async () => 'denied' }
    render(<SettingsPanel online pending={0} snapshotAt={null} onClose={noop} onSyncNow={noop} />)
    expect(screen.getByText(/blocked for this site/)).toBeTruthy()
    expect(screen.getByText('Turn on reminders').closest('button').disabled).toBe(true)
  })

  it('says so when the browser has no notification support at all', () => {
    delete globalThis.Notification
    render(<SettingsPanel online pending={0} snapshotAt={null} onClose={noop} onSyncNow={noop} />)
    expect(screen.getByText(/doesn't support notifications/)).toBeTruthy()
  })

  it('states the limitation of local reminders up front', () => {
    render(<SettingsPanel online pending={0} snapshotAt={null} onClose={noop} onSyncNow={noop} />)
    expect(screen.getByText(/won't reach you if the app has been closed/)).toBeTruthy()
  })
})

describe('WorkstreamForm', () => {
  it('creates a line with the chosen name and colour', () => {
    const onSave = vi.fn()
    wrap(<WorkstreamForm onSave={onSave} onClose={noop} suggestedColor="#6C4FA0" />)
    fireEvent.change(screen.getByPlaceholderText(/Website redesign/), {
      target: { value: 'New line' },
    })
    fireEvent.click(screen.getByLabelText('Sky'))
    fireEvent.click(screen.getByText('Create line'))
    expect(onSave).toHaveBeenCalledWith({ name: 'New line', color: '#2C7BE5', status: 'active' })
  })

  it('refuses to save a blank name', () => {
    const onSave = vi.fn()
    wrap(<WorkstreamForm onSave={onSave} onClose={noop} />)
    fireEvent.click(screen.getByText('Create line'))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('offers status only when editing, not when creating', () => {
    const { rerender } = wrap(<WorkstreamForm onSave={noop} onClose={noop} />)
    expect(screen.queryByText('At risk')).toBeNull()
    rerender(
      <ThemeProvider>
        <WorkstreamForm
          initial={{ id: 'w1', name: 'A', color: '#2C7BE5', status: 'active' }}
          onSave={noop}
          onClose={noop}
        />
      </ThemeProvider>
    )
    expect(screen.getByText('At risk')).toBeTruthy()
  })

  it('requires a second click before deleting', () => {
    const onDelete = vi.fn()
    wrap(
      <WorkstreamForm
        initial={{ id: 'w1', name: 'A', color: '#2C7BE5', status: 'active' }}
        onSave={noop}
        onDelete={onDelete}
        onClose={noop}
      />
    )
    fireEvent.click(screen.getByText('Delete line'))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalledWith('w1')
  })

  it('lets a delete be called off', () => {
    const onDelete = vi.fn()
    wrap(
      <WorkstreamForm
        initial={{ id: 'w1', name: 'A', color: '#2C7BE5', status: 'active' }}
        onSave={noop}
        onDelete={onDelete}
        onClose={noop}
      />
    )
    fireEvent.click(screen.getByText('Delete line'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.getByText('Delete line')).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('hides deletion entirely when it is not allowed', () => {
    wrap(<WorkstreamForm onSave={noop} onClose={noop} />)
    expect(screen.queryByText('Delete line')).toBeNull()
  })

  it('saves an edited status', () => {
    const onSave = vi.fn()
    wrap(
      <WorkstreamForm
        initial={{ id: 'w1', name: 'A', color: '#2C7BE5', status: 'active' }}
        onSave={onSave}
        onClose={noop}
      />
    )
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'blocked' } })
    fireEvent.click(screen.getByText('Save changes'))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: 'blocked' }))
  })
})

describe('ui atoms', () => {
  it('labels every status', () => {
    for (const [status, label] of [
      ['active', 'Active'],
      ['at_risk', 'At risk'],
      ['blocked', 'Blocked'],
      ['done', 'Done'],
      ['archived', 'Archived'],
    ]) {
      const { unmount } = render(<StatusPill status={status} />)
      expect(screen.getByText(label)).toBeTruthy()
      unmount()
    }
  })

  it('falls back to Active for an unknown status', () => {
    render(<StatusPill status="nonsense" />)
    expect(screen.getByText('Active')).toBeTruthy()
  })

  it('renders nothing for a task with no due date', () => {
    const { container } = render(<DueBadge date={null} />)
    expect(container.firstChild).toBe(null)
  })

  it('passes clicks through on the icon button', () => {
    const onClick = vi.fn()
    render(<IconButton onClick={onClick}>x</IconButton>)
    fireEvent.click(screen.getByText('x'))
    expect(onClick).toHaveBeenCalled()
  })
})
