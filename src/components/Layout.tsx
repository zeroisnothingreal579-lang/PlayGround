import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Info,
  LayoutDashboard,
  Link2,
  Megaphone,
  Menu,
  MonitorPlay,
  Plus,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useApp } from '../lib/AppContext'
import { cn, isActiveStatus } from '../lib/utils'
import type { ViewId } from '../types'
import { Logo, LogoMark } from './Logo'

const navItems: { id: ViewId; label: string; icon: typeof LayoutDashboard; group: 'Operate' | 'Intelligence' | 'System' }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Operate' },
  { id: 'inspector', label: 'URL Inspector', icon: Link2, group: 'Operate' },
  { id: 'sessions', label: 'Sessions', icon: MonitorPlay, group: 'Operate' },
  { id: 'ads', label: 'Advertising', icon: Megaphone, group: 'Intelligence' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, group: 'Intelligence' },
  { id: 'servers', label: 'Workers & Network', icon: Server, group: 'System' },
  { id: 'settings', label: 'Settings', icon: Settings2, group: 'System' },
]

const titles: Record<ViewId, { title: string; description: string }> = {
  overview: { title: 'Command center', description: 'Live probe health and redirect intelligence' },
  inspector: { title: 'URL Inspector', description: 'Redirect chains, destination signals and page evidence' },
  sessions: { title: 'Browser sessions', description: 'Isolated multi-window inspection grid' },
  ads: { title: 'Advertising analysis', description: 'Observed placements and monetization boundaries' },
  servers: { title: 'Workers & network', description: 'Runtime capacity and connection health' },
  analytics: { title: 'Analytics', description: 'Probe outcomes and verified platform metrics' },
  settings: { title: 'Settings', description: 'Configuration, credentials and safety boundaries' },
}

function Toasts() {
  const { toasts, dismissToast } = useApp()
  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 lg:bottom-5">
      {toasts.map((toast) => {
        const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertTriangle : Info
        const tone = toast.kind === 'success'
          ? 'border-emerald-500/25 bg-emerald-950/90 text-emerald-200'
          : toast.kind === 'error'
            ? 'border-rose-500/25 bg-rose-950/90 text-rose-200'
            : 'border-white/10 bg-ink-800/95 text-slate-200'
        return (
          <div key={toast.id} className={cn('pointer-events-auto flex items-start gap-2.5 rounded-xl border p-3 shadow-2xl backdrop-blur-xl animate-slide-up', tone)}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1 text-xs leading-relaxed">{toast.message}</p>
            <button type="button" onClick={() => dismissToast(toast.id)} className="rounded p-0.5 text-current/60 hover:text-current">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function Layout({
  view,
  onNavigate,
  children,
}: {
  view: ViewId
  onNavigate: (view: ViewId) => void
  children: ReactNode
}) {
  const { runs, connected, config, auth, logout } = useApp()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [clock, setClock] = useState(() => new Date())
  const activeSessions = runs.reduce(
    (sum, run) => sum + run.sessions.filter((session) => isActiveStatus(session.status)).length,
    0,
  )
  const title = titles[view] || titles.overview

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    setDrawerOpen(false)
  }, [view])

  const navigate = (next: ViewId) => {
    onNavigate(next)
    setDrawerOpen(false)
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-[72px] shrink-0 items-center justify-between px-5">
        <button type="button" onClick={() => navigate('overview')} className="text-left">
          <Logo />
        </button>
        <button type="button" className="btn-ghost h-8 w-8 !p-0 lg:hidden" onClick={() => setDrawerOpen(false)}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-3 mb-5 rounded-xl border border-violet-500/15 bg-gradient-to-br from-violet-500/[0.09] to-transparent p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.8)]' : 'bg-amber-400')} />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">
              {connected ? 'Live control' : 'Reconnecting'}
            </span>
          </div>
          <span className="num text-[10px] text-slate-500">{activeSessions} active</span>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          {activeSessions ? 'Browser workers are reporting telemetry.' : 'Socket ready. No sessions in flight.'}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        {(['Operate', 'Intelligence', 'System'] as const).map((group) => (
          <div key={group} className="mb-5">
            <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-700">{group}</p>
            <div className="space-y-1">
              {navItems.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon
                const active = view === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.id)}
                    className={cn(
                      'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] font-medium transition',
                      active
                        ? 'bg-violet-500/[0.12] text-white'
                        : 'text-slate-500 hover:bg-white/[0.035] hover:text-slate-200',
                    )}
                  >
                    {active && <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-violet-400" />}
                    <Icon className={cn('h-[17px] w-[17px] transition', active ? 'text-violet-300' : 'text-slate-600 group-hover:text-slate-400')} />
                    <span className="flex-1">{item.label}</span>
                    {item.id === 'sessions' && activeSessions > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-violet-500/20 px-1 text-[9px] font-bold text-violet-200">
                        {activeSessions}
                      </span>
                    )}
                    {item.id === 'ads' && runs.some((run) => run.adCount > 0) && (
                      <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400/70" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="m-3 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400/80" />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">Safe automation</span>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
          Passive inspection only. No ad clicks, CAPTCHA solving, reward bypass or artificial traffic.
        </p>
      </div>

      <div className="border-t border-white/[0.05] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-[11px] font-bold text-violet-200">
            OP
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-slate-300">Operator</p>
            <p className="truncate text-[9px] text-slate-600">{config?.region || 'local'} · {config?.environment || 'env'}</p>
          </div>
          {auth?.authEnabled && (
            <button type="button" onClick={() => void logout()} className="text-[9px] uppercase tracking-wider text-slate-600 hover:text-slate-300">
              Exit
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[256px] border-r border-white/[0.055] bg-ink-900/75 backdrop-blur-2xl lg:block">
        {sidebar}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] animate-slide-up border-r border-white/[0.07] bg-ink-900 shadow-2xl" style={{ animationDuration: '.25s' }}>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-[256px]">
        <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-ink-950/75 backdrop-blur-2xl">
          <div className="mx-auto flex h-[66px] max-w-[1500px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button type="button" onClick={() => setDrawerOpen(true)} className="btn-ghost h-9 w-9 !p-0 lg:hidden" aria-label="Open navigation">
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-3 lg:hidden">
              <LogoMark className="h-7 w-7" />
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-[13px] font-semibold text-slate-200">{title.title}</p>
              <p className="truncate text-[10px] text-slate-600">{title.description}</p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className={cn('hidden items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider sm:flex', connected ? 'border-emerald-500/15 bg-emerald-500/[0.07] text-emerald-300' : 'border-amber-500/15 bg-amber-500/[0.07] text-amber-300')}>
                {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {connected ? 'Live' : 'Polling'}
              </div>
              <div className="hidden items-center gap-1.5 rounded-lg border border-violet-500/15 bg-violet-500/[0.07] px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-violet-300 md:flex">
                <Sparkles className="h-3 w-3" />
                {config?.aiMode === 'llm' ? config.aiModel : 'Heuristic AI'}
              </div>
              <div className="hidden rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 font-mono text-[10px] text-slate-500 xl:block">
                {clock.toISOString().slice(11, 16)} UTC
              </div>
              <button type="button" onClick={() => navigate('inspector')} className="btn-primary !px-3 !py-2 text-[11px]">
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New probe</span>
              </button>
            </div>
          </div>
        </header>

        <main className="safe-area mx-auto max-w-[1500px] px-4 pb-24 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-10">
          <div key={view} className="animate-slide-up">{children}</div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-ink-900/90 backdrop-blur-2xl lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1.5">
          {(['overview', 'inspector', 'sessions', 'ads', 'analytics'] as ViewId[]).map((id) => {
            const item = navItems.find((entry) => entry.id === id)!
            const Icon = item.icon
            const active = view === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => navigate(id)}
                className={cn('flex min-w-[52px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[8px] font-semibold uppercase tracking-wider transition', active ? 'text-violet-300' : 'text-slate-600')}
              >
                <Icon className="h-[18px] w-[18px]" />
                {id === 'sessions' ? 'Sessions' : id === 'inspector' ? 'Inspect' : id === 'overview' ? 'Home' : id === 'ads' ? 'Ads' : 'Stats'}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex min-w-[52px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[8px] font-semibold uppercase tracking-wider text-slate-600"
          >
            <Activity className="h-[18px] w-[18px]" />
            More
          </button>
        </div>
      </nav>

      <Toasts />
    </div>
  )
}
