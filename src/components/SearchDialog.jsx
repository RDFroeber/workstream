import { useState, useMemo, useRef, useEffect } from 'react'
import { Search, CornerDownLeft, ListOrdered, Repeat, FileText, Waypoints, Inbox } from 'lucide-react'
import { searchAll } from '../lib/search'
import { useLineColor } from '../lib/theme'
import { lineFill } from '../lib/lineStyle'
import { DueBadge } from './ui'

/**
 * Search across every line, opened with the button in the header or with
 * Cmd/Ctrl-K.
 *
 * Results are keyboard-navigable throughout: the input keeps focus while the
 * arrow keys move a highlighted row, which is the pattern people expect from a
 * search box and avoids the tab-through-forty-results alternative.
 */
export default function SearchDialog({ data, onOpenTask, onOpenLine, onOpenInbox, onClose }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const lineColor = useLineColor()
  const listRef = useRef(null)

  const results = useMemo(() => searchAll(query, data), [query, data])

  // A new query invalidates the old highlight position.
  useEffect(() => setActive(0), [query])

  // The page behind the overlay shouldn't scroll under the palette.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${active}"]`)
    // Guarded: this runs in an effect, so an environment without
    // scrollIntoView would take the whole dialog down rather than just
    // failing to scroll.
    if (typeof el?.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  }, [active])

  function choose(result) {
    if (!result) return
    if (result.type === 'line') onOpenLine(result.id)
    else if (result.type === 'inbox') onOpenInbox?.()
    else onOpenTask(result.task)
    onClose()
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="relative w-full max-w-lg bg-panel border border-hairline rounded-card shadow-raised overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-4 border-b border-hairline">
          <Search size={16} className="text-faint shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks and lines…"
            aria-label="Search tasks and lines"
            aria-controls="search-results"
            className="flex-1 bg-transparent text-sm text-ink py-3.5 outline-none placeholder:text-faint"
          />
          <kbd className="hidden sm:block text-[10px] font-mono text-faint border border-hairline rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>

        <div id="search-results" ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {query.trim() && results.length === 0 && (
            <p className="text-sm text-muted px-4 py-6 text-center">
              Nothing matches "{query.trim()}".
            </p>
          )}
          {!query.trim() && (
            <p className="text-sm text-faint px-4 py-6 text-center">
              Search across every line — titles and notes.
            </p>
          )}

          {results.map((r, i) => {
            const isActive = i === active
            const done = r.task?.status === 'done'
            return (
              <button
                key={`${r.type}-${r.id}`}
                data-index={i}
                onClick={() => choose(r)}
                onMouseEnter={() => setActive(i)}
                aria-current={isActive ? 'true' : undefined}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors ${
                  isActive ? 'bg-accentSoft' : ''
                }`}
              >
                <span className="shrink-0">
                  {r.type === 'line' ? (
                    <Waypoints size={14} className="text-faint" />
                  ) : r.type === 'inbox' ? (
                    <Inbox size={14} className="text-faint" />
                  ) : r.type === 'sequence' ? (
                    <ListOrdered size={14} style={{ color: lineColor(r.workstream.color) }} />
                  ) : (
                    <span
                      className="block w-2 h-2 rounded-full"
                      style={lineFill(lineColor(r.workstream.color), r.workstream.color)}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm truncate ${done ? 'line-through text-muted' : 'text-ink'}`}
                  >
                    {r.title}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted truncate">
                    {r.subtitle}
                    {r.matchedNotes && (
                      <span className="inline-flex items-center gap-0.5 text-faint">
                        <FileText size={10} /> in notes
                      </span>
                    )}
                    {r.task && r.task.recurrence_unit && <Repeat size={10} className="text-faint" />}
                  </span>
                </span>
                {r.task?.due_date && <DueBadge date={r.task.due_date} />}
                {isActive && <CornerDownLeft size={13} className="text-faint shrink-0" />}
              </button>
            )
          })}
        </div>

        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-hairline flex items-center gap-3 text-[11px] text-faint">
            <span>↑↓ to move</span>
            <span>↵ to open</span>
            <span className="ml-auto">
              {results.length} {results.length === 1 ? 'result' : 'results'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
