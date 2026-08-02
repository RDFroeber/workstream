import { useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { PALETTE } from '../lib/colors'
import { STATUS_OPTIONS } from './ui'
import Modal from './Modal'
import ColorPicker from './ColorPicker'

export default function WorkstreamForm({
  initial,
  suggestedColor,
  usedColors = [],
  onSave,
  onDelete,
  onClose,
}) {
  const [name, setName] = useState(initial?.name || '')
  const [color, setColor] = useState(initial?.color || suggestedColor || PALETTE[0].hex)
  const [status, setStatus] = useState(initial?.status || 'active')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), color, status })
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg text-ink">
          {initial ? 'Edit line' : 'New line'}
        </h2>
        <button onClick={onClose} className="text-faint hover:text-ink">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Website redesign"
            className="w-full rounded-lg border border-hairlineStrong px-3 py-2 text-sm text-ink bg-panel focus:border-accent outline-none"
          />
        </div>

        <ColorPicker value={color} onChange={setColor} usedColors={usedColors} />

        {initial && (
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-hairlineStrong px-3 py-2 text-sm text-ink bg-panel focus:border-accent outline-none"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-accent text-panel text-sm font-medium py-2.5 hover:bg-accentHover transition-colors"
          >
            {initial ? 'Save changes' : 'Create line'}
          </button>
        </div>

        {initial && onDelete && (
          <div className="pt-2 border-t border-hairline">
            {confirmingDelete ? (
              <div className="flex items-center gap-2 pt-3">
                <span className="text-xs text-muted flex-1">
                  Delete this line and everything in it? This can't be undone.
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(initial.id)}
                  className="text-xs font-medium text-panel bg-danger rounded-lg px-3 py-1.5"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="text-xs font-medium text-muted"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-danger mt-3 transition-colors"
              >
                <Trash2 size={13} /> Delete line
              </button>
            )}
          </div>
        )}
      </form>
    </Modal>
  )
}
