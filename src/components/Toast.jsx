import { useEffect } from 'react'
import { Repeat } from 'lucide-react'

/**
 * Ticking a recurring task makes it reappear with a new date rather than
 * disappear — without a word of confirmation that reads as "nothing happened."
 * This is that confirmation.
 */
export default function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 2600)
    return () => clearTimeout(t)
  }, [message, onDone])

  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
    >
      <div className="bg-ink text-white text-sm rounded-full px-4 py-2 shadow-raised inline-flex items-center gap-2">
        <Repeat size={14} />
        {message}
      </div>
    </div>
  )
}
