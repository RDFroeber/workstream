import { describe, it, expect } from 'vitest'
import { computeNextDue, describeRecurrence, addMonthsClamped, parseISO, toISO } from '../src/lib/recurrence'

const daily = { recurrence_unit: 'day', recurrence_interval: 1, recurrence_anchor: 'schedule' }
const monthly = { recurrence_unit: 'month', recurrence_interval: 1, recurrence_anchor: 'schedule' }

describe('computeNextDue — schedule anchor', () => {
  it('advances one day when completed on time', () => {
    expect(computeNextDue({ ...daily, due_date: '2026-08-01' }, '2026-08-01')).toBe('2026-08-02')
  })

  it('keeps advancing past today when the task was neglected for a month', () => {
    // Without the catch-up loop this would return 2026-07-02 — still overdue.
    expect(computeNextDue({ ...daily, due_date: '2026-07-01' }, '2026-08-01')).toBe('2026-08-02')
  })

  it('holds a monthly task to its date even when finished late', () => {
    // Rent due the 1st, paid the 5th, still due the 1st next month.
    expect(computeNextDue({ ...monthly, due_date: '2026-08-01' }, '2026-08-05')).toBe('2026-09-01')
  })

  it('clamps month-end instead of spilling into the next month', () => {
    expect(computeNextDue({ ...monthly, due_date: '2026-01-31' }, '2026-01-31')).toBe('2026-02-28')
  })
})

describe('computeNextDue — completion anchor', () => {
  it('counts from the day it was actually done, not the old due date', () => {
    const task = {
      recurrence_unit: 'day',
      recurrence_interval: 5,
      recurrence_anchor: 'completion',
      due_date: '2026-07-20',
    }
    expect(computeNextDue(task, '2026-08-01')).toBe('2026-08-06')
  })

  it('works with no due date set at all', () => {
    const task = { recurrence_unit: 'week', recurrence_interval: 1, recurrence_anchor: 'schedule' }
    expect(computeNextDue(task, '2026-08-01')).toBe('2026-08-08')
  })
})

describe('computeNextDue — specific weekdays', () => {
  const monThu = {
    recurrence_unit: 'week',
    recurrence_interval: 1,
    recurrence_days: [1, 4],
    recurrence_anchor: 'schedule',
  }

  it('steps to the next selected weekday within the same week', () => {
    // Mon 2026-08-03 -> Thu 2026-08-06
    expect(computeNextDue({ ...monThu, due_date: '2026-08-03' }, '2026-08-03')).toBe('2026-08-06')
  })

  it('wraps to the first selected weekday of the next week', () => {
    // Thu 2026-08-06 -> Mon 2026-08-10
    expect(computeNextDue({ ...monThu, due_date: '2026-08-06' }, '2026-08-06')).toBe('2026-08-10')
  })

  it('skips a whole week when the interval is 2', () => {
    // Thu 2026-08-06 -> Mon 2026-08-17, not 2026-08-10
    const biweekly = { ...monThu, recurrence_interval: 2, due_date: '2026-08-06' }
    expect(computeNextDue(biweekly, '2026-08-06')).toBe('2026-08-17')
  })
})

describe('addMonthsClamped', () => {
  it('clamps Jan 31 to Feb 28 in a non-leap year', () => {
    expect(toISO(addMonthsClamped(parseISO('2026-01-31'), 1))).toBe('2026-02-28')
  })
  it('clamps Jan 31 to Feb 29 in a leap year', () => {
    expect(toISO(addMonthsClamped(parseISO('2028-01-31'), 1))).toBe('2028-02-29')
  })
  it('leaves a safe day of month alone', () => {
    expect(toISO(addMonthsClamped(parseISO('2026-03-15'), 3))).toBe('2026-06-15')
  })
})

describe('describeRecurrence', () => {
  it('returns null for non-recurring tasks', () => {
    expect(describeRecurrence({ title: 'one off' })).toBe(null)
  })
  it('uses natural words for an interval of 1', () => {
    expect(describeRecurrence(daily)).toBe('Daily')
  })
  it('names the weekdays', () => {
    expect(
      describeRecurrence({ recurrence_unit: 'week', recurrence_interval: 2, recurrence_days: [1, 4] })
    ).toBe('Every 2 weeks on Mon, Thu')
  })
  it('flags the completion anchor', () => {
    expect(
      describeRecurrence({ recurrence_unit: 'day', recurrence_interval: 3, recurrence_anchor: 'completion' })
    ).toBe('Every 3 days · after each completion')
  })
})

// ---------------------------------------------------------------------------
// Progress accounting: recurring work is upkeep, not progress
// ---------------------------------------------------------------------------
import { summarizeWorkstream } from '../src/lib/api'

describe('summarizeWorkstream progress vs. recurring upkeep', () => {
  const base = { workstream_id: 'w1', parent_id: null, item_type: 'standalone', status: 'todo' }

  it('does not count recurring tasks in the progress denominator', () => {
    const tasks = [
      { ...base, id: 'a', title: 'Weekly email', sort_order: 0, recurrence_unit: 'week', recurrence_interval: 1 },
      { ...base, id: 'b', title: 'Ship the redesign', sort_order: 1 },
      { ...base, id: 'c', title: 'Write the brief', sort_order: 2, status: 'done' },
    ]
    const s = summarizeWorkstream(tasks)
    expect(s.total).toBe(2) // only the two finite tasks
    expect(s.done).toBe(1)
    expect(s.progress).toBe(0.5)
    expect(s.recurringCount).toBe(1)
    expect(s.hasFiniteWork).toBe(true)
  })

  it('flags a line made only of recurring upkeep', () => {
    const tasks = [
      { ...base, id: 'a', title: 'Water plants', sort_order: 0, recurrence_unit: 'day', recurrence_interval: 3 },
      { ...base, id: 'b', title: 'Weekly review', sort_order: 1, recurrence_unit: 'week', recurrence_interval: 1 },
    ]
    const s = summarizeWorkstream(tasks)
    expect(s.hasFiniteWork).toBe(false)
    expect(s.total).toBe(0)
    expect(s.recurringCount).toBe(2)
    // it should still surface a next action rather than looking empty
    expect(s.nextAction).toBeTruthy()
  })

  it('still reaches 100% when all finite work is done alongside recurring tasks', () => {
    const tasks = [
      { ...base, id: 'a', title: 'Standup', sort_order: 0, recurrence_unit: 'day', recurrence_interval: 1 },
      { ...base, id: 'b', title: 'Launch', sort_order: 1, status: 'done' },
    ]
    const s = summarizeWorkstream(tasks)
    expect(s.progress).toBe(1)
  })
})
