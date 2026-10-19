import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles, User } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Button, Field, Input } from '../components/ui'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import { cn } from '../lib/utils'

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState(mode === 'login' ? 'demo@clouddroid.app' : '')
  const [password, setPassword] = useState(mode === 'login' ? 'CloudDroid123!' : '')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const from = (location.state as any)?.from || '/app'

  useEffect(() => {
    if (user) navigate(from, { replace: true })
  }, [user, navigate, from])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') await login(email.trim(), password)
      else await register(name.trim(), email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const isRegister = mode === 'register'

  return (
    <div className="min-h-screen bg-ink-950 lg:grid lg:grid-cols-[1.05fr,.95fr]">
      <div className="relative hidden overflow-hidden border-r border-white/[0.07] bg-ink-900 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="pointer-events-none absolute -left-20 top-20 h-96 w-96 rounded-full bg-iris-600/20 blur-[100px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-electric-500/10 blur-[90px]" />

        <div className="relative flex flex-1 flex-col p-10 xl:p-14">
          <Link to="/"><Logo /></Link>
          <div className="my-auto max-w-lg py-12">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-zinc-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> AOSP Android 15 · live runtime
            </span>
            <h1 className="mt-6 font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] text-white xl:text-5xl">
              Your Android,<br /><span className="gradient-text">always on.</span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-zinc-400">
              Access a full Android workspace from any browser. Your phones keep their apps, files and settings between sessions.
            </p>

            <div className="mt-9 space-y-3">
              {[
                ['Real AOSP instances', 'KVM-backed, streamed from the actual framebuffer'],
                ['Persistent workspace', 'Storage, settings and installed apps survive reboots'],
                ['Private by default', 'Per-user ownership, one-time tickets, audit trail'],
              ].map(([title, detail]) => (
                <div key={title} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check className="h-3 w-3" /></span>
                  <div>
                    <p className="text-[13px] font-medium text-white">{title}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-zinc-600">
            <ShieldCheck className="h-3.5 w-3.5" /> Encrypted production transport · No server credentials exposed to the browser
          </div>
        </div>
      </div>

      <div className="relative flex min-h-screen flex-col">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30 lg:hidden" />
        <div className="relative flex items-center justify-between p-5 sm:p-8 lg:justify-end">
          <Link to="/" className="lg:hidden"><Logo /></Link>
          <Link to="/" className="flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-200">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to home
          </Link>
        </div>

        <div className="relative flex flex-1 items-center justify-center px-5 pb-12 sm:px-8">
          <div className="w-full max-w-sm">
            <div className="mb-7">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
                {isRegister ? 'Create your workspace' : 'Welcome back'}
              </h2>
              <p className="mt-1.5 text-sm text-zinc-400">
                {isRegister ? 'Provision your first cloud phone in minutes.' : 'Sign in to manage your cloud phones.'}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {isRegister && (
                <Field label="Full name">
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Rivera" className="pl-10" autoComplete="name" />
                  </div>
                </Field>
              )}
              <Field label="Email address">
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="pl-10" autoComplete="email" />
                </div>
              </Field>
              <Field label="Password" hint={isRegister ? '8+ characters' : undefined}>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••••••"
                    className="pl-10 pr-11"
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                  />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition hover:text-zinc-300">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>

              {error && <div className="rounded-lg border border-rose-400/20 bg-rose-500/[0.07] px-3 py-2.5 text-xs text-rose-300">{error}</div>}

              <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
                {isRegister ? 'Create account' : 'Sign in'} {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>

              {isRegister && (
                <p className="text-center text-[10px] leading-relaxed text-zinc-600">
                  By creating an account you agree to use Android images only as permitted by their licenses.
                </p>
              )}
            </form>

            {!isRegister && (
              <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-medium text-zinc-300">Preview account</p>
                    <p className="mt-0.5 font-mono text-[10px] text-zinc-500">demo@clouddroid.app · CloudDroid123!</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEmail('demo@clouddroid.app'); setPassword('CloudDroid123!') }}
                    className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-300 transition hover:border-iris-400/40 hover:text-white"
                  >
                    Fill
                  </button>
                </div>
              </div>
            )}

            <p className="mt-6 text-center text-xs text-zinc-500">
              {isRegister ? 'Already have an account?' : 'New to CloudDroid?'}{' '}
              <Link to={isRegister ? '/login' : '/register'} className={cn('font-medium text-iris-300 transition hover:text-iris-200')}>
                {isRegister ? 'Sign in' : 'Create an account'}
              </Link>
            </p>
          </div>
        </div>
        <div className="relative flex items-center justify-center gap-2 px-5 pb-6 text-[10px] text-zinc-600">
          <Sparkles className="h-3 w-3" /> Demo environment devices are clearly labelled
        </div>
      </div>
    </div>
  )
}
