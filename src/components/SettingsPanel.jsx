import { useState } from 'react'
import { X, Bell, BellOff, CloudOff, Check } from 'lucide-react'
import Modal from './Modal'
import {
  supported,
  permission,
  requestPermission,
  getPrefs,
  setPrefs,
} from '../lib/notifications'

export default function SettingsPanel({ online, pending, snapshotAt, onClose, onSyncNow }) {
  const [prefs, setLocalPrefs] = useState(getPrefs)
  const [perm, setPerm] = useState(permission())

  async function toggleEnabled() {
    if (!prefs.enabled) {
      const result = await requestPermission()
      setPerm(result)
      if (result !== 'granted') return
    }
    setLocalPrefs(setPrefs({ enabled: !prefs.enabled }))
  }

  const update = (patch) => setLocalPrefs(setPrefs(patch))
  const blocked = perm === 'denied'

  return (
    <Modal onClose={onClose} wide>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-lg text-ink">Settings</h2>
        <button onClick={onClose} className="text-faint hover:text-ink">
          <X size={18} />
        </button>
      </div>

      {/* Reminders ------------------------------------------------------- */}
      <section className="mb-6">
        <h3 className="text-xs font-medium text-muted mb-2">Reminders</h3>

        {!supported() ? (
          <p className="text-sm text-muted bg-accentSoft rounded-lg px-3 py-2">
            This browser doesn't support notifications.
          </p>
        ) : (
          <>
            <button
              onClick={toggleEnabled}
              disabled={blocked}
              className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                prefs.enabled && !blocked
                  ? 'border-accent bg-accentSoft'
                  : 'border-hairlineStrong hover:border-ink'
              }`}
            >
              {prefs.enabled && !blocked ? (
                <Bell size={16} className="text-accent shrink-0" />
              ) : (
                <BellOff size={16} className="text-muted shrink-0" />
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-ink">
                  {prefs.enabled && !blocked ? 'Reminders are on' : 'Turn on reminders'}
                </span>
                <span className="block text-xs text-muted">
                  A summary of what's overdue or due today
                </span>
              </span>
              {prefs.enabled && !blocked && <Check size={16} className="text-accent shrink-0" />}
            </button>

            {blocked && (
              <p className="text-xs text-danger mt-2">
                Notifications are blocked for this site. You'll need to re-allow them in your
                browser's site settings.
              </p>
            )}

            {prefs.enabled && !blocked && (
              <div className="mt-3 space-y-3 pl-1">
                <div className="flex items-center gap-3">
                  <label htmlFor="dailyTime" className="text-sm text-muted flex-1">
                    Daily summary at
                  </label>
                  <input
                    id="dailyTime"
                    type="time"
                    value={prefs.dailyTime}
                    onChange={(e) => update({ dailyTime: e.target.value })}
                    className="rounded-lg border border-hairlineStrong px-2.5 py-1.5 text-sm text-ink bg-panel focus:border-accent outline-none"
                  />
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.perTask}
                    onChange={(e) => update({ perTask: e.target.checked })}
                    className="w-4 h-4 accent-current text-accent"
                  />
                  <span className="text-sm text-muted">
                    Also notify about individual tasks as they fall due
                  </span>
                </label>
              </div>
            )}

            {/* The limitation, stated up front rather than discovered later. */}
            <p className="text-xs text-faint mt-3 leading-relaxed">
              These are local reminders, so they can only fire while Lines is open or was recently
              open in the background. They won't reach you if the app has been closed for a long
              time — that needs push notifications from a server, which this app doesn't run.
              Installing it to your home screen makes them noticeably more reliable.
            </p>
          </>
        )}
      </section>

      {/* Offline --------------------------------------------------------- */}
      <section className="pt-4 border-t border-hairline">
        <h3 className="text-xs font-medium text-muted mb-2">Offline</h3>
        <div className="flex items-start gap-2.5 rounded-lg border border-hairlineStrong px-3 py-2.5">
          <CloudOff size={16} className="text-muted shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink">
              {online ? 'Connected' : 'Offline — working from cached data'}
            </p>
            <p className="text-xs text-muted mt-0.5">
              {pending > 0
                ? `${pending} ${pending === 1 ? 'change' : 'changes'} waiting to sync.`
                : 'Everything is synced.'}
              {snapshotAt && ` Last full load ${new Date(snapshotAt).toLocaleString()}.`}
            </p>
          </div>
          {online && pending > 0 && (
            <button
              onClick={onSyncNow}
              className="shrink-0 text-xs font-medium bg-ink text-panel rounded-lg px-2.5 py-1.5"
            >
              Sync now
            </button>
          )}
        </div>
        <p className="text-xs text-faint mt-2 leading-relaxed">
          Lines keeps a copy of your last load, so it opens and stays usable with no connection.
          Edits made offline are queued and replayed in order when you're back.
        </p>
      </section>
    </Modal>
  )
}
