import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({ children, onClose, wide = false }) {
  const panelRef = useRef(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // Focus trap. Without it, Tab walks out of the dialog into the page
      // behind the overlay — focus lands on controls you can't see, and
      // Enter starts activating them.
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter(
          (el) => el.offsetParent !== null || el === document.activeElement
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const inside = panelRef.current.contains(document.activeElement)
        if (!inside) {
          e.preventDefault()
          first.focus()
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The page behind the overlay shouldn't scroll while the dialog is up —
  // otherwise a long task detail scrolls the dashboard underneath it, and the
  // page is somewhere else entirely when the dialog closes.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Focus starts inside the dialog unless something in it (an autoFocus
  // input) already claimed it.
  useEffect(() => {
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) {
      const target = panel.querySelector(FOCUSABLE)
      target?.focus()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`relative bg-panel w-full ${
          wide ? 'sm:max-w-lg' : 'sm:max-w-md'
        } rounded-t-2xl sm:rounded-card border border-hairline shadow-raised p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 max-h-[88vh] overflow-y-auto`}
      >
        {children}
      </div>
    </div>
  )
}
