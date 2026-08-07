import { CloudOff, RefreshCw, AlertTriangle } from 'lucide-react'

function ago(ts) {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  return `${Math.round(hrs / 24)} d ago`
}

/**
 * Says plainly when the app is working from cached data and how many edits are
 * waiting. Silence would be worse than a banner — an app that looks live while
 * quietly queueing writes is how people lose work.
 */
export default function OfflineBanner({ online, pending, snapshotAt, syncing, syncError }) {
  if (online && pending === 0 && !syncError) return null

  if (!online) {
    return (
      <div className="bg-warnSoft border-b border-warnBorder">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 text-xs text-warn">
          <CloudOff size={14} className="shrink-0" />
          <span>
            Offline — showing data from {snapshotAt ? ago(snapshotAt) : 'your last visit'}.
            {pending > 0 && ` ${pending} ${pending === 1 ? 'change' : 'changes'} will sync when you reconnect.`}
          </span>
        </div>
      </div>
    )
  }

  if (syncError) {
    return (
      <div className="bg-dangerSoft border-b border-dangerBorder">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 text-xs text-danger">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{syncError}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-accentSoft border-b border-hairline">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 text-xs text-accent">
        <RefreshCw size={14} className={`shrink-0 ${syncing ? 'animate-spin' : ''}`} />
        <span>
          {syncing ? 'Syncing' : 'Waiting to sync'} {pending}{' '}
          {pending === 1 ? 'change' : 'changes'}…
        </span>
      </div>
    </div>
  )
}
