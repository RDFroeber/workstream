import { useState } from 'react'
import { signIn, signUp, requestPasswordReset, signInWithApple } from '../lib/api'
import { Waypoints } from 'lucide-react'

/** Apple's mark. Their guidelines require this glyph on the button, not a substitute. */
function AppleMark(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.38 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.42zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
    </svg>
  )
}

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

  async function handleApple() {
    setError('')
    setBusy(true)
    try {
      // On the web this redirects away and nothing below runs. In the native
      // app it resolves in place — the system sheet closes, the session is
      // set, and the auth listener swaps this screen out.
      await signInWithApple()
      setBusy(false)
    } catch (err) {
      // The user closing Apple's sheet is a choice, not a failure.
      const cancelled = /cancel|1001/i.test(err?.message || '') || err?.code === '1001'
      if (!cancelled) {
        setError(
          err?.message || 'Could not reach Apple. Try again, or use your email and password.'
        )
      }
      setBusy(false)
    }
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

          {mode !== 'forgot' && (
            <>
              <button
                type="button"
                onClick={handleApple}
                disabled={busy}
                className="w-full rounded-lg bg-ink text-panel text-sm font-medium py-2.5 inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                <AppleMark />
                {mode === 'signin' ? 'Sign in with Apple' : 'Sign up with Apple'}
              </button>
              <div className="flex items-center gap-3 my-4">
                <span className="h-px flex-1 bg-hairline" />
                <span className="text-xs text-faint">or</span>
                <span className="h-px flex-1 bg-hairline" />
              </div>
            </>
          )}

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
