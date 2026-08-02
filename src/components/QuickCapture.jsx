import { useState, useRef } from 'react'
import { Plus, ArrowUp } from 'lucide-react'

export default function QuickCapture({ onCapture }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  function submit(e) {
    e.preventDefault()
    if (!text.trim()) {
      setOpen(false)
      return
    }
    onCapture(text.trim())
    setText('')
    inputRef.current?.focus()
  }

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-0 right-0 z-40 px-4 flex justify-center pointer-events-none">
      <div className="w-full max-w-md pointer-events-auto">
        {open ? (
          <form
            onSubmit={submit}
            className="flex items-center gap-2 bg-ink rounded-full shadow-raised px-2 py-2 pl-4"
          >
            <input
              ref={inputRef}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => {
                if (!text.trim()) setOpen(false)
              }}
              placeholder="Capture anything — sort it later…"
              className="flex-1 bg-transparent text-white placeholder:text-white/50 text-sm outline-none min-w-0"
            />
            <button
              type="submit"
              className="shrink-0 w-9 h-9 rounded-full bg-white text-ink flex items-center justify-center"
              aria-label="Save"
            >
              <ArrowUp size={17} />
            </button>
          </form>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="mx-auto flex items-center gap-1.5 bg-ink text-white text-sm font-medium rounded-full shadow-raised px-5 py-3 hover:bg-black transition-colors"
          >
            <Plus size={16} /> Quick capture
          </button>
        )}
      </div>
    </div>
  )
}
