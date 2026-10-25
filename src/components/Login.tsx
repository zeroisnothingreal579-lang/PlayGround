import { useState, type FormEvent } from 'react'
import { ArrowRight, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useApp } from '../lib/AppContext'
import { LogoMark } from './Logo'

export function Login() {
  const { login, auth } = useApp()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!password) return
    setLoading(true)
    setError(null)
    try {
      await login(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute left-[8%] top-[10%] h-72 w-72 rounded-full bg-violet-600/20 blur-[110px]" />
      <div className="pointer-events-none absolute bottom-[6%] right-[6%] h-80 w-80 rounded-full bg-fuchsia-600/10 blur-[120px]" />
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(circle_at_center,black,transparent_78%)]" />
      <div className="relative w-full max-w-[420px] animate-slide-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="h-16 w-16 shadow-glow" />
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-white">
            LinkPilot <span className="text-violet-300">AI</span>
          </h1>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
            Multi-window URL inspection, redirect intelligence, and advertising analysis.
          </p>
        </div>
        <form onSubmit={submit} className="awwwards-border rounded-3xl bg-ink-850/85 p-6 shadow-2xl backdrop-blur-2xl sm:p-7">
          <div className="mb-5 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10 text-violet-300">
              <LockKeyhole className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Operator access</p>
              <p className="text-[11px] text-slate-500">Authenticate to enter the control center.</p>
            </div>
          </div>
          <label className="label mb-2 block" htmlFor="dashboard-password">Dashboard password</label>
          <input
            id="dashboard-password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter operator password"
            className="input !py-3"
          />
          {error && <p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
          <button type="submit" disabled={loading || !password} className="btn-primary mt-4 w-full !py-3">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {loading ? 'Authenticating…' : 'Enter control center'}
          </button>
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/[0.05] bg-white/[0.015] p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/80" />
            <p className="text-[10px] leading-relaxed text-slate-500">
              Sessions perform passive page inspection only. Ad clicking, CAPTCHA bypass, rewarded-link manipulation and artificial traffic are not supported.
            </p>
          </div>
        </form>
        <p className="mt-5 text-center text-[10px] uppercase tracking-[0.18em] text-slate-700">
          {auth?.environment || 'secure environment'} · v1.0
        </p>
      </div>
    </div>
  )
}

export function BootScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="h-12 w-12 animate-pulse-soft" />
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
          Loading control center
        </div>
      </div>
    </div>
  )
}
