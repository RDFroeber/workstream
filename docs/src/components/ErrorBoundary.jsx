import { Component } from 'react'
import { AlertTriangle, RotateCcw, Download, Trash2 } from 'lucide-react'
import { loadSnapshot, clearOfflineState } from '../lib/offline'
import { downloadJSON } from '../lib/export'

/**
 * Catches a render error instead of letting it blank the page.
 *
 * Has to be a class — React has no hook equivalent. Note the limits: this
 * catches errors thrown while rendering, in lifecycle methods, and in
 * constructors. It does NOT catch errors inside event handlers, in async code,
 * or in the boundary itself. Those still reach the console; this is about the
 * failure mode where the whole screen goes white.
 *
 * The download button matters more than it looks. If the app can't render, the
 * normal export in Settings is unreachable — which is exactly the moment you'd
 * want a copy of your data. It reads the cached snapshot rather than live
 * state, since live state is what just failed.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, downloaded: false, confirmingClear: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Nowhere to report to — no error service — so at least make it findable
    // in the console for anyone debugging.
    console.error('Lines crashed while rendering:', error, info?.componentStack)
  }

  handleRetry = () => {
    this.setState({ error: null, confirmingClear: false })
  }

  handleDownload = () => {
    const snap = loadSnapshot()
    const ok = snap ? downloadJSON(snap.data) : false
    this.setState({ downloaded: ok ? 'done' : 'empty' })
  }

  handleClear = () => {
    // Last resort: a corrupted snapshot can make the app crash on every load,
    // and there'd otherwise be no way out from inside the app.
    clearOfflineState()
    window.location.reload()
  }

  render() {
    const { error, downloaded, confirmingClear } = this.state
    if (!error) return this.props.children

    const snap = loadSnapshot()

    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4 py-10">
        <div className="w-full max-w-md">
          <div className="bg-panel border border-hairline rounded-card shadow-card p-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={18} className="text-danger" />
              <h1 className="font-display font-semibold text-xl text-ink">Something broke</h1>
            </div>
            <p className="text-sm text-muted mb-5">
              Lines hit an error and stopped rendering. Your data is safe on the server — this went
              wrong on screen, not in the database.
            </p>

            <div className="space-y-2">
              <button
                onClick={this.handleRetry}
                className="w-full rounded-lg bg-accent text-panel text-sm font-medium py-2.5 inline-flex items-center justify-center gap-2 hover:bg-accentHover transition-colors"
              >
                <RotateCcw size={15} /> Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full rounded-lg border border-hairlineStrong text-ink text-sm font-medium py-2.5 hover:border-ink transition-colors"
              >
                Reload the page
              </button>
            </div>

            <div className="mt-5 pt-4 border-t border-hairline">
              <button
                onClick={this.handleDownload}
                disabled={!snap}
                className="w-full rounded-lg border border-hairlineStrong text-ink text-sm font-medium py-2.5 inline-flex items-center justify-center gap-2 hover:border-ink transition-colors disabled:opacity-50"
              >
                <Download size={15} /> Download a copy of your data
              </button>
              <p className="text-xs text-faint mt-2">
                {!snap
                  ? "There's no cached copy on this device yet."
                  : downloaded === 'done'
                    ? 'Saved. This is the last copy this device loaded.'
                    : downloaded === 'empty'
                      ? "The download couldn't start. Try the reload above."
                      : `From the last full load${
                          snap.savedAt ? ` on ${new Date(snap.savedAt).toLocaleString()}` : ''
                        }.`}
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-hairline">
              {confirmingClear ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted flex-1">
                    Clear the cached copy and reload? Anything not yet synced will be lost.
                  </span>
                  <button
                    onClick={this.handleClear}
                    className="text-xs font-medium text-panel bg-danger rounded-lg px-3 py-1.5"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => this.setState({ confirmingClear: false })}
                    className="text-xs text-muted"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => this.setState({ confirmingClear: true })}
                  className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-danger transition-colors"
                >
                  <Trash2 size={13} /> Still broken? Clear cached data
                </button>
              )}
            </div>

            {error?.message && (
              <details className="mt-4">
                <summary className="text-xs text-faint cursor-pointer select-none">
                  Error details
                </summary>
                <pre className="mt-2 text-[11px] font-mono text-muted bg-paper border border-hairline rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap">
                  {error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      </div>
    )
  }
}
