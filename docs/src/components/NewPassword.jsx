import { useState } from 'react'
import { Waypoints, KeyRound } from 'lucide-react'
import { updatePassword, signOut } from '../lib/api'

const MIN_LENGTH = 8

/**
 * Where a recovery link lands.
 *
 * Supabase signs the user in with a temporary session when they follow the
 * link, so they're technically "in" already — without this screen they'd be
 * dropped straight into the app with their old, forgotten password still set.
 */
export default function NewPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`)
      return
    }
    if (password !== confirm) {
      setError("Those don't match.")
      return
    }
    setBusy(true)
    try {
      await updatePassword(password)
      onDone()
    } catch (err) {
      setError(err?.message || 'That password could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Waypoints size={22} className="text-accent" strokeWidth={2.2} />
          <span className="font-display font-semibold text-lg tracking-tight text-ink">Lines</span>
        </div>

        <div className="bg-panel border border-hairline rounded-card shadow-card p-6">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound size={18} className="text-accent" />
            <h1 className="font-display font-semibold text-xl text-ink">Set a new password</h1>
          </div>
          <p className="text-sm text-muted mb-5">
            You're signed in from the link in your email. Choose a new password to finish.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoFocus
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-hairlineStrong px-3 py-2 text-sm text-ink bg-panel focus:border-accent outline-none"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1" htmlFor="confirm-password">
                Confirm it
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg border border-hairlineStrong px-3 py-2 text-sm text-ink bg-panel focus:border-accent outline-none"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-danger bg-dangerSoft border border-dangerBorder rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-accent text-panel text-sm font-medium py-2.5 mt-1 hover:bg-accentHover transition-colors disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save and continue'}
            </button>
          </form>

          {/* An escape hatch: a recovery link opened by mistake shouldn't
              trap someone on a screen with no way out. */}
          <button
            onClick={() => signOut()}
            className="w-full text-center text-sm text-muted mt-4 hover:text-ink transition-colors"
          >
            Cancel and sign out
          </button>
        </div>
      </div>
    </div>
  )
}
