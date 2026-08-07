import { LayoutGrid, Sun, Inbox } from 'lucide-react'

const TABS = [
  { id: 'dashboard', label: 'Lines', icon: LayoutGrid },
  { id: 'today', label: 'Today', icon: Sun },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
]

export default function Nav({ active, onChange, inboxCount }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-panel/95 backdrop-blur border-t border-hairline pb-[env(safe-area-inset-bottom)] sm:relative sm:border-t-0 sm:bg-transparent sm:pb-0">
      <div className="max-w-2xl mx-auto flex sm:justify-center sm:gap-1 px-2 sm:px-0 sm:py-3">
        {TABS.map((t) => {
          const Icon = t.icon
          const isActive = active === t.id
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`relative flex-1 sm:flex-none flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 py-2.5 sm:py-1.5 sm:px-3.5 sm:rounded-full text-xs sm:text-sm font-medium transition-colors ${
                isActive ? 'text-ink sm:bg-ink sm:text-panel' : 'text-faint hover:text-muted'
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.3 : 2} />
              {t.label}
              {t.id === 'inbox' && inboxCount > 0 && (
                <span className="absolute -top-0.5 right-[28%] sm:static sm:ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-danger text-panel text-[10px] flex items-center justify-center font-mono">
                  {inboxCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
