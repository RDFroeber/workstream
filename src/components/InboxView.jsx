import { useState } from 'react'
import { Inbox, X, ArrowRight } from 'lucide-react'

export default function InboxView({ items, workstreams, onTriage, onDismiss }) {
  return (
    <div className="max-w-2xl mx-auto px-4 pb-28 pt-5">
      <h1 className="font-display font-semibold text-2xl text-ink tracking-tight mb-1">Inbox</h1>
      <p className="text-sm text-muted mb-6">
        Everything you've captured but haven't sorted yet. Give each one a home.
      </p>

      {items.length === 0 ? (
        <div className="text-center py-16 px-6 border border-dashed border-hairlineStrong rounded-card">
          <Inbox size={26} className="mx-auto text-faint mb-3" strokeWidth={1.6} />
          <p className="text-sm text-muted">Inbox zero. Use quick capture any time something comes to mind.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <InboxRow
              key={item.id}
              item={item}
              workstreams={workstreams}
              onTriage={onTriage}
              onDismiss={onDismiss}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function InboxRow({ item, workstreams, onTriage, onDismiss }) {
  const [picking, setPicking] = useState(false)

  return (
    <div className="bg-panel border border-hairline rounded-card px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink flex-1">{item.text}</p>
        <button onClick={() => onDismiss(item.id)} className="text-faint hover:text-danger shrink-0">
          <X size={15} />
        </button>
      </div>

      {picking ? (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {workstreams.map((ws) => (
            <button
              key={ws.id}
              onClick={() => onTriage(item, ws.id)}
              className="inline-flex items-center gap-1.5 text-xs font-medium border border-hairlineStrong rounded-full px-2.5 py-1 hover:border-ink transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: ws.color }} />
              {ws.name}
            </button>
          ))}
          <button onClick={() => setPicking(false)} className="text-xs text-muted px-1.5 py-1">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setPicking(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent mt-2 hover:underline"
        >
          Send to a line <ArrowRight size={12} />
        </button>
      )}
    </div>
  )
}
