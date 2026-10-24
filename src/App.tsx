import { AlertTriangle, ArrowRight, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Shell } from './components/Shell'
import { Logo, Spinner } from './components/ui'
import { useApp } from './context/AppContext'
import ActivityPage from './pages/ActivityPage'
import AdvertisingPage from './pages/AdvertisingPage'
import AnalyticsPage from './pages/AnalyticsPage'
import InspectorPage from './pages/InspectorPage'
import OverviewPage from './pages/OverviewPage'
import ServersPage from './pages/ServersPage'
import SessionsPage from './pages/SessionsPage'
import SettingsPage from './pages/SettingsPage'

function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 animate-pulse-ring rounded-2xl" />
        <Logo compact />
      </div>
      <p className="mt-5 text-[12px] font-medium text-ink-300">Initializing LinkPilot workspace</p>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-ink-500"><Spinner size={11} />Connecting to worker control plane…</div>
    </div>
  )
}

function AuthGate() {
  const { submitToken } = useApp()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!value.trim()) return
    setBusy(true)
    setError('')
    const ok = await submitToken(value.trim())
    setBusy(false)
    if (!ok) setError('That access token was rejected.')
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md p-6 sm:p-8">
        <div className="glow-orb -right-16 -top-24 h-56 w-56 bg-violet-600/20" />
        <div className="relative">
          <Logo />
          <div className="mt-8 flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-300">
            <KeyRound size={18} />
          </div>
          <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.03em] text-white">Workspace access</h1>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-400">This deployment requires a bearer token. Paste the access token configured by your administrator.</p>
          <div className="mt-5">
            <label className="label" htmlFor="access-token">Access token</label>
            <input
              id="access-token"
              type="password"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void submit()}
              className="input mt-2"
              placeholder="lpk_••••••••••••"
              autoFocus
            />
            {error && <p className="mt-2 text-[10.5px] text-coral">{error}</p>}
          </div>
          <button className="btn-primary mt-4 w-full py-2.5" onClick={() => void submit()} disabled={busy || !value.trim()}>
            {busy ? <Spinner /> : <ArrowRight size={14} />}
            Enter workspace
          </button>
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-mint/10 bg-mint/[0.025] p-3">
            <ShieldCheck size={13} className="mt-0.5 shrink-0 text-mint" />
            <p className="text-[9.5px] leading-relaxed text-ink-500">Tokens are held in this browser and sent only to the LinkPilot API. They are never included in page content or logs.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function BootError({ message }: { message: string }) {
  const { refresh } = useApp()
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-lg p-6 sm:p-8">
        <Logo />
        <div className="mt-8 flex h-10 w-10 items-center justify-center rounded-xl border border-coral/20 bg-coral/10 text-coral">
          <AlertTriangle size={18} />
        </div>
        <h1 className="mt-4 text-[21px] font-semibold tracking-[-0.03em] text-white">Control plane unavailable</h1>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-400">The dashboard loaded, but it could not reach the LinkPilot API. Start the Node server or check the deployment configuration.</p>
        <div className="mt-4 rounded-lg border border-coral/15 bg-coral/[0.04] p-3 font-mono text-[9.5px] leading-relaxed text-coral/90">{message}</div>
        <button className="btn-primary mt-4 w-full py-2.5" onClick={async () => { setBusy(true); await refresh(); setBusy(false) }} disabled={busy}>
          {busy ? <Spinner /> : <RefreshCw size={13} />}
          Retry connection
        </button>
        <p className="mt-3 text-center text-[9px] text-ink-600">Expected runtime: <span className="mono">node server/index.mjs</span></p>
      </div>
    </div>
  )
}

function PageRouter() {
  const { page } = useApp()
  switch (page) {
    case 'inspector':
      return <InspectorPage />
    case 'sessions':
      return <SessionsPage />
    case 'advertising':
      return <AdvertisingPage />
    case 'servers':
      return <ServersPage />
    case 'analytics':
      return <AnalyticsPage />
    case 'activity':
      return <ActivityPage />
    case 'settings':
      return <SettingsPage />
    default:
      return <OverviewPage />
  }
}

export default function App() {
  const { loading, bootError, authRequired, overview } = useApp()
  if (authRequired) return <AuthGate />
  if (loading && !overview) return <LoadingScreen />
  if (bootError && !overview) return <BootError message={bootError} />
  return (
    <Shell>
      <PageRouter />
    </Shell>
  )
}
