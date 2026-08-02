import { useState } from 'react'
import { signIn, signUp, requestPasswordReset } from '../lib/api'
import { Waypoints } from 'lucide-react'

export default function Auth() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  function switchTo(next) {
    setMode(next)
    setError('')
    setNotice('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(email)
        // Deliberately the same message whether or not the address has an
        // account — otherwise this form becomes a way to test which email
        // addresses are registered.
        setNotice(
          "If there's an account for that address, a reset link is on its way. The link is good for one hour."
        )
      } else if (mode === 'signin') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
        setNotice('Account created. If email confirmation is on in your Supabase project, check your inbox — otherwise you are signed in already.')
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
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
          <h1 className="font-display font-semibold text-xl text-ink mb-1">
            {mode === 'forgot'
              ? 'Reset your password'
              : mode === 'signin'
                ? 'Welcome back'
                : 'Create your account'}
          </h1>
          <p className="text-sm text-muted mb-5">
            {mode === 'forgot'
              ? "Enter your email and we'll send you a link to set a new one."
              : mode === 'signin'
                ? 'Sign in to see every line, on every device.'
                : 'One account, synced across your phone and computer.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-hairlineStrong px-3 py-2 text-sm text-ink bg-panel focus:border-accent outline-none"
                placeholder="you@example.com"
              />
            </div>
            {mode !== 'forgot' && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-hairlineStrong px-3 py-2 text-sm text-ink bg-panel focus:border-accent outline-none"
                placeholder="••••••••"
              />
            </div>
            )}

            {error && (
              <p className="text-sm text-danger bg-dangerSoft border border-dangerBorder rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {notice && (
              <p className="text-sm text-accent bg-accentSoft border border-hairline rounded-lg px-3 py-2">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-accent text-panel text-sm font-medium py-2.5 mt-1 hover:bg-accentHover transition-colors disabled:opacity-60"
            >
              {busy
                ? 'Working…'
                : mode === 'forgot'
                  ? 'Send reset link'
                  : mode === 'signin'
                    ? 'Sign in'
                    : 'Sign up'}
            </button>
          </form>

          <div className="mt-4 space-y-2">
            <button
              onClick={() => switchTo(mode === 'signin' ? 'signup' : 'signin')}
              className="w-full text-center text-sm text-muted hover:text-ink transition-colors"
            >
              {mode === 'signup' || mode === 'forgot'
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
            {mode === 'signin' && (
              <button
                onClick={() => switchTo('forgot')}
                className="w-full text-center text-sm text-faint hover:text-ink transition-colors"
              >
                Forgot your password?
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
