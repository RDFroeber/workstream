import { Waypoints } from 'lucide-react'

/** Shown when the Supabase env vars are missing, instead of a blank page. */
export default function SetupNotice() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <Waypoints size={22} className="text-accent" strokeWidth={2.2} />
          <span className="font-display font-semibold text-lg tracking-tight text-ink">Lines</span>
        </div>
        <div className="bg-panel border border-hairline rounded-card shadow-card p-6">
          <h1 className="font-display font-semibold text-xl text-ink mb-2">One step left</h1>
          <p className="text-sm text-muted mb-4">
            This app needs to know where your database lives. Add these two values, then reload.
          </p>
          <ol className="text-sm text-ink space-y-2.5 mb-4 list-decimal list-inside">
            <li>
              Open your Supabase project → <span className="font-medium">Project Settings → API</span>
            </li>
            <li>
              Copy the <span className="font-medium">Project URL</span> and the{' '}
              <span className="font-medium">anon public</span> key
            </li>
            <li>
              Put them in a <code className="font-mono text-xs bg-accentSoft px-1 py-0.5 rounded">.env</code>{' '}
              file locally, or in your host's environment variables
            </li>
          </ol>
          <pre className="font-mono text-[11px] bg-ink text-white rounded-lg p-3 overflow-x-auto leading-relaxed">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...`}
          </pre>
          <p className="text-xs text-muted mt-3">
            On Vercel or Netlify these go in the project's environment variable settings, and you'll
            need to redeploy after adding them.
          </p>
        </div>
      </div>
    </div>
  )
}
