import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { buildWorkstreamTree } from '../lib/api'
import { useLineColor } from '../lib/theme'
import { lineFill } from '../lib/lineStyle'
import { parseISO, toISO, addDays } from '../lib/recurrence'
import { todayISO } from '../lib/dates'

const DAYS = 14

/**
 * Layout C — timeline.
 *
 * Every dated task placed on a shared axis, one track per line. This is the
 * only view that can answer "is anything about to collide?", which neither the
 * dashboard nor Today can show — they both sort by urgency without revealing
 * that four things land on the same afternoon.
 */
export default function TimelineLayout({
  workstreams,
  tasksByWorkstream,
  onOpenTask,
  onOpen,
}) {
  const lineColor = useLineColor()
  const [offset, setOffset] = useState(0)

  const start = useMemo(() => addDays(parseISO(todayISO()), offset * 7), [offset])
  const days = useMemo(
    () => Array.from({ length: DAYS }, (_, i) => addDays(start, i)),
    [start]
  )
  const dayKeys = days.map(toISO)
  const windowStart = dayKeys[0]
  const windowEnd = dayKeys[dayKeys.length - 1]
  const today = todayISO()

  // Dated, incomplete items per line — sequences contribute their steps.
  const tracks = workstreams.map((ws) => {
    const tasks = tasksByWorkstream[ws.id] || []
    const tree = buildWorkstreamTree(tasks)
    const items = []
    for (const node of tree) {
      if (node.item_type === 'sequence') {
        for (const s of node.steps) if (s.status !== 'done' && s.due_date) items.push(s)
        if (node.due_date && node.status !== 'done') items.push(node)
      } else if (node.status !== 'done' && node.due_date) {
        items.push(node)
      }
    }
    const inWindow = items.filter((i) => i.due_date >= windowStart && i.due_date <= windowEnd)
    const overdue = items.filter((i) => i.due_date < today)
    return { ws, inWindow, overdue }
  })

  // Days where three or more lines are all due something.
  const crunch = dayKeys.filter((k) => {
    const lines = tracks.filter((t) => t.inWindow.some((i) => i.due_date === k))
    return lines.length >= 3
  })

  const colWidth = `minmax(0, 1fr)`

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="w-7 h-7 rounded-lg text-muted hover:text-ink hover:bg-ink/5 flex items-center justify-center"
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setOffset(0)}
            className="text-xs font-medium text-muted hover:text-ink px-2 py-1 rounded-lg"
          >
            {offset === 0 ? 'Next two weeks' : 'Back to today'}
          </button>
          <button
            onClick={() => setOffset((o) => o + 1)}
            className="w-7 h-7 rounded-lg text-muted hover:text-ink hover:bg-ink/5 flex items-center justify-center"
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {crunch.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-warn">
            <AlertTriangle size={13} />
            {crunch.length === 1
              ? '1 day with three or more lines due'
              : `${crunch.length} days with three or more lines due`}
          </span>
        )}
      </div>

      <div className="bg-panel border border-hairline rounded-card shadow-card overflow-x-auto">
        <div className="min-w-[720px] p-3">
          {/* axis */}
          <div
            className="grid gap-px mb-2 pl-[152px]"
            style={{ gridTemplateColumns: `repeat(${DAYS}, ${colWidth})` }}
          >
            {days.map((d) => {
              const key = toISO(d)
              const isToday = key === today
              const weekend = d.getDay() === 0 || d.getDay() === 6
              return (
                <div key={key} className="text-center">
                  <div
                    className={`text-[10px] uppercase tracking-wide ${
                      isToday ? 'text-accent font-semibold' : weekend ? 'text-faint' : 'text-muted'
                    }`}
                  >
                    {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
                  </div>
                  <div
                    className={`text-[11px] font-mono ${
                      isToday ? 'text-accent font-semibold' : 'text-faint'
                    }`}
                  >
                    {d.getDate()}
                  </div>
                </div>
              )
            })}
          </div>

          {/* tracks */}
          <div className="space-y-1">
            {tracks.map(({ ws, inWindow, overdue }) => (
              <div key={ws.id} className="flex items-stretch">
                <button
                  onClick={() => onOpen(ws.id)}
                  className="w-[152px] shrink-0 pr-3 flex items-center gap-2 text-left group"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={lineFill(lineColor(ws.color), ws.color)}
                  />
                  <span className="text-xs text-ink truncate group-hover:underline">{ws.name}</span>
                  {overdue.length > 0 && (
                    <span className="ml-auto shrink-0 text-[10px] font-mono text-danger">
                      {overdue.length}!
                    </span>
                  )}
                </button>

                <div
                  className="grid gap-px flex-1 rounded"
                  style={{ gridTemplateColumns: `repeat(${DAYS}, ${colWidth})` }}
                >
                  {dayKeys.map((key) => {
                    const here = inWindow.filter((i) => i.due_date === key)
                    const isToday = key === today
                    const isCrunch = crunch.includes(key)
                    return (
                      <div
                        key={key}
                        className={`min-h-[26px] py-1 flex flex-col gap-0.5 items-center justify-center ${
                          isToday
                            ? 'bg-accentSoft'
                            : isCrunch
                              ? 'bg-warnSoft'
                              : 'odd:bg-transparent'
                        }`}
                      >
                        {here.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => onOpenTask(item)}
                            title={item.title}
                            className="w-full mx-0.5 h-3.5 rounded-full hover:opacity-80 transition-opacity"
                            style={lineFill(lineColor(ws.color), ws.color)}
                            aria-label={`${item.title}, due ${key}`}
                          />
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {tracks.every((t) => t.inWindow.length === 0) && (
            <p className="text-sm text-faint text-center py-8">
              Nothing dated in this window. Undated tasks don't appear on the timeline — they're on
              the other layouts.
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-faint mt-2">
        Only dated work appears here. A red count beside a line means it has overdue items outside
        this window.
      </p>
    </div>
  )
}
