import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeProvider } from '../src/lib/theme'
import { buildNotificationPlan, hashId, DEFAULT_PREFS } from '../src/lib/notifications'
import { todayISO } from '../src/lib/dates'
import { openExternal } from '../src/lib/platform'
import SettingsPanel from '../src/components/SettingsPanel'

const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>)

beforeEach(() => {
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// buildNotificationPlan — the week of reminders handed to iOS
// ---------------------------------------------------------------------------

describe('buildNotificationPlan', () => {
  const ws = { id: 'w1', name: 'Deep work', color: '#123456', status: 'active' }
  // A fixed clock, well before the 09:00 daily time.
  const now = new Date('2026-08-06T07:00:00')
  const shift = (days) => {
    const d = new Date('2026-08-06T12:00:00')
    d.setDate(d.getDate() + days)
    return todayISO(d)
  }
  const task = (id, due, extra = {}) => ({
    id,
    workstream_id: 'w1',
    item_type: 'standalone',
    parent_id: null,
    status: 'todo',
    title: `Task ${id}`,
    due_date: due,
    sort_order: 0,
    ...extra,
  })
  const prefs = { ...DEFAULT_PREFS, enabled: true, dailyTime: '09:00', perTask: false }

  it('returns nothing when reminders are off', () => {
    const plan = buildNotificationPlan({
      workstreams: [ws],
      tasksByWorkstream: { w1: [task('a', shift(1))] },
      prefs: { ...prefs, enabled: false },
      now,
    })
    expect(plan).toEqual([])
  })

  it('schedules a summary on each day inside the horizon that has work due', () => {
    const plan = buildNotificationPlan({
      workstreams: [ws],
      tasksByWorkstream: { w1: [task('a', shift(0)), task('b', shift(2))] },
      prefs,
      now,
    })
    // Day 0 (time not yet passed), day 1 (a is overdue by then), day 2
    // (a overdue + b due), and days 3-6 (both overdue): a summary every day.
    expect(plan).toHaveLength(7)
    expect(plan[0].date).toBe(shift(0))
    expect(plan[0].title).toContain('1 due')
    expect(plan[2].title).toContain('1 overdue')
    expect(plan[2].title).toContain('1 due')
    expect(plan.every((n) => n.time === '09:00')).toBe(true)
  })

  it("skips today's slot once the chosen time has passed", () => {
    const plan = buildNotificationPlan({
      workstreams: [ws],
      tasksByWorkstream: { w1: [task('a', shift(0))] },
      prefs,
      now: new Date('2026-08-06T09:30:00'),
    })
    expect(plan.find((n) => n.date === shift(0))).toBeUndefined()
    // The task is overdue tomorrow, so the reminder continues from there.
    expect(plan.find((n) => n.date === shift(1))).toBeTruthy()
  })

  it('adds per-task entries on the due day only, never for carried-over overdue', () => {
    const plan = buildNotificationPlan({
      workstreams: [ws],
      tasksByWorkstream: { w1: [task('a', shift(1))] },
      prefs: { ...prefs, perTask: true },
      now,
    })
    const perTask = plan.filter((n) => n.body === 'Task a' && n.title === 'Deep work')
    // One individual reminder on the due day; days 2-6 cover it in the
    // summary only, or iOS's 64-notification budget dies in a bad week.
    expect(perTask).toHaveLength(1)
    expect(perTask[0].date).toBe(shift(1))
  })

  it('produces stable int32 ids that fit iOS', () => {
    const a = hashId('summary:2026-08-06')
    expect(a).toBe(hashId('summary:2026-08-06'))
    expect(Number.isInteger(a)).toBe(true)
    expect(hashId('summary:2026-08-07')).not.toBe(a)
  })

  it('never exceeds the signed 32-bit ceiling, whatever the input', () => {
    // The first version of hashId could land ~1000 above INT32_MAX for
    // unlucky hashes — checking a couple of friendly values missed it. Sweep
    // a large keyspace shaped like real ids instead.
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < 200000; i++) {
      const id = hashId(`task:t${i}:2026-0${(i % 9) + 1}-1${i % 9}`)
      if (id < min) min = id
      if (id > max) max = id
    }
    expect(min).toBeGreaterThanOrEqual(1)
    expect(max).toBeLessThanOrEqual(2147483647)
  })

  it('never plans more than the iOS pending limit', () => {
    // A pathological week: 30 tasks due every day.
    const tasks = []
    for (let d = 0; d < 7; d++) {
      for (let i = 0; i < 30; i++) tasks.push(task(`t${d}-${i}`, shift(d)))
    }
    const plan = buildNotificationPlan({
      workstreams: [ws],
      tasksByWorkstream: { w1: tasks },
      prefs: { ...prefs, perTask: true },
      now,
    })
    expect(plan.length).toBeLessThanOrEqual(7 + 40) // summaries + capped per-task
    expect(plan.length).toBeLessThan(64)
  })
})

// ---------------------------------------------------------------------------
// Account deletion — guideline 5.1.1(v)
// ---------------------------------------------------------------------------

describe('SettingsPanel account deletion', () => {
  const props = {
    online: true,
    pending: 0,
    snapshotAt: Date.now(),
    onClose: () => {},
    onSyncNow: () => {},
    data: { workstreams: [], tasks: [], dependencies: [], taskLinks: [], inbox: [] },
  }

  it('requires typing the confirmation word before the button arms', () => {
    const onDeleteAccount = vi.fn()
    wrap(<SettingsPanel {...props} onDeleteAccount={onDeleteAccount} />)

    fireEvent.click(screen.getByText('Delete my account'))
    const armButton = screen.getByRole('button', { name: 'Delete my account' })
    expect(armButton.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'delete' } })
    expect(armButton.disabled).toBe(false)

    fireEvent.click(armButton)
    expect(onDeleteAccount).toHaveBeenCalledTimes(1)
  })

  it('shows the failure and recovers instead of pretending it worked', async () => {
    const onDeleteAccount = vi.fn().mockRejectedValue(new Error('Could not delete the account.'))
    wrap(<SettingsPanel {...props} onDeleteAccount={onDeleteAccount} />)

    fireEvent.click(screen.getByText('Delete my account'))
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'delete' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }))

    await waitFor(() =>
      expect(screen.getByText('Could not delete the account.')).toBeTruthy()
    )
    expect(screen.getByRole('button', { name: 'Delete my account' }).disabled).toBe(false)
  })

  it('blocks deletion while offline, with a reason', () => {
    wrap(<SettingsPanel {...props} online={false} onDeleteAccount={vi.fn()} />)
    fireEvent.click(screen.getByText('Delete my account'))
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'delete' } })
    expect(screen.getByRole('button', { name: 'Delete my account' }).disabled).toBe(true)
    expect(screen.getByText(/deletion needs a connection/)).toBeTruthy()
  })

  it('backs out cleanly', () => {
    wrap(<SettingsPanel {...props} onDeleteAccount={vi.fn()} />)
    fireEvent.click(screen.getByText('Delete my account'))
    fireEvent.click(screen.getByText('Keep it'))
    expect(screen.getByText('Delete my account')).toBeTruthy()
    expect(screen.queryByText('This is permanent.')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Platform helper — web path
// ---------------------------------------------------------------------------

describe('native schedule clearing', () => {
  it('is a safe no-op on the web (sign-out calls it unconditionally)', async () => {
    const { clearNativeSchedules, syncNativeSchedules } = await import(
      '../src/lib/nativeNotifications'
    )
    // Neither should throw or touch anything off-platform.
    await expect(clearNativeSchedules()).resolves.toBeUndefined()
    await expect(
      syncNativeSchedules({ workstreams: [], tasksByWorkstream: {}, prefs: DEFAULT_PREFS })
    ).resolves.toBeUndefined()
  })
})

describe('openExternal on the web', () => {
  it('opens a new window with noopener', async () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null)
    await openExternal('https://example.com')
    expect(spy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
    spy.mockRestore()
  })
})
