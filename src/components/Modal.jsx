import { useEffect } from 'react'

export default function Modal({ children, onClose, wide = false }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative bg-panel w-full ${
          wide ? 'sm:max-w-lg' : 'sm:max-w-md'
        } rounded-t-2xl sm:rounded-card border border-hairline shadow-raised p-5 sm:p-6 max-h-[88vh] overflow-y-auto`}
      >
        {children}
      </div>
    </div>
  )
}
