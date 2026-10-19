import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  CreditCard, FolderUp, LayoutDashboard, LogOut, Menu, Plus, Settings, ShieldCheck,
  Smartphone, Sparkles, X, Zap,
} from 'lucide-react'
import { Logo } from './Logo'
import { Button, Progress } from './ui'
import { useAuth } from '../lib/auth'
import { cn, formatGbFromMb, initials } from '../lib/utils'
import { useRuntime } from '../lib/runtime'

const primaryNav = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/create', label: 'Create phone', icon: Plus },
  { to: '/app/files', label: 'File transfer', icon: FolderUp },
  { to: '/app/billing', label: 'Billing & usage', icon: CreditCard },
]

const secondaryNav = [
  { to: '/app/settings', label: 'Account settings', icon: Settings },
]

export function RuntimePill({ className }: { className?: string }) {
  const { data } = useRuntime()
  if (!data) return null
  const live = data.mode === 'live'
  const demo = data.mode === 'demo'
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
      live && 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300',
      demo && 'border-amber-400/25 bg-amber-400/[0.08] text-amber-300',
      !live && !demo && 'border-rose-400/25 bg-rose-400/[0.08] text-rose-300',
      className,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-emerald-400 animate-pulse' : demo ? 'bg-amber-400' : 'bg-rose-400')} />
      {live ? 'Live runtime' : demo ? 'Demo mode' : 'Runtime degraded'}
    </span>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, plan, usage, logout } = useAuth()
  const runtime = useRuntime()
  const navigate = useNavigate()
  const storagePct = usage && usage.limits.storageMb ? (usage.storageMb / usage.limits.storageMb) * 100 : 0
  const concurrencyPct = usage && usage.limits.maxConcurrent ? (usage.runningCount / usage.limits.maxConcurrent) * 100 : 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Link to="/app" onClick={onNavigate}><Logo /></Link>
        {onNavigate && (
          <button onClick={onNavigate} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white lg:hidden">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <div>
          <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Workspace</p>
          <div className="space-y-0.5">
            {primaryNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) => cn(
                  'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition',
                  isActive ? 'bg-white/[0.07] text-white' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100',
                )}
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={cn('h-4 w-4', isActive ? 'text-iris-300' : 'text-zinc-500 group-hover:text-zinc-300')} />
                    {item.label}
                    {item.to === '/app/create' && <Sparkles className="ml-auto h-3 w-3 text-iris-400/70" />}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Account</p>
          <div className="space-y-0.5">
            {secondaryNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) => cn(
                  'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition',
                  isActive ? 'bg-white/[0.07] text-white' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100',
                )}
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={cn('h-4 w-4', isActive ? 'text-iris-300' : 'text-zinc-500 group-hover:text-zinc-300')} />
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
            {user?.role === 'admin' && (
              <NavLink
                to="/app/admin"
                onClick={onNavigate}
                className={({ isActive }) => cn(
                  'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition',
                  isActive ? 'bg-white/[0.07] text-white' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100',
                )}
              >
                {({ isActive }) => (
                  <>
                    <ShieldCheck className={cn('h-4 w-4', isActive ? 'text-iris-300' : 'text-zinc-500 group-hover:text-zinc-300')} />
                    Admin console
                  </>
                )}
              </NavLink>
            )}
          </div>
        </div>

        <div className="mx-1 rounded-xl border border-white/[0.07] bg-ink-900/70 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400">Runtime</span>
            <RuntimePill />
          </div>
          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
            {runtime.data?.detail || 'Checking Android runtime…'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Zap className="h-3 w-3 text-electric-400" />
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">{runtime.data?.streamingTransport === 'none' ? 'No transport' : 'WebSocket frames'}</span>
          </div>
        </div>

        <div className="mx-1 rounded-xl border border-iris-400/15 bg-gradient-to-br from-iris-500/[0.12] to-transparent p-3.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-zinc-300">{plan?.name || 'Free'} plan</p>
              <p className="mt-0.5 text-[10px] text-zinc-500">{usage?.deviceCount || 0} / {usage?.limits.maxDevices || 1} phones</p>
            </div>
            <Link to="/app/billing" onClick={onNavigate} className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-medium text-zinc-300 transition hover:border-iris-400/40 hover:text-white">
              Manage
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            <div>
              <div className="mb-1 flex justify-between text-[9px] uppercase tracking-wider text-zinc-500"><span>Storage</span><span>{formatGbFromMb(Math.round(usage?.storageMb || 0))}</span></div>
              <Progress value={storagePct} height="h-1" tone={storagePct > 85 ? 'rose' : 'violet'} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[9px] uppercase tracking-wider text-zinc-500"><span>Live sessions</span><span>{usage?.runningCount || 0}/{usage?.limits.maxConcurrent || 1}</span></div>
              <Progress value={concurrencyPct} height="h-1" tone="cyan" />
            </div>
          </div>
        </div>
      </nav>

      <div className="border-t border-white/[0.07] p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-white/[0.04]">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-iris-400/25 bg-iris-500/15 text-[11px] font-semibold text-iris-200">
            {user ? initials(user.name) : 'CD'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-zinc-200">{user?.name}</p>
            <p className="truncate text-[10px] text-zinc-500">{user?.email}</p>
          </div>
          <button
            onClick={async () => { await logout(); navigate('/login') }}
            title="Sign out"
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-ink-950">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[262px] border-r border-white/[0.07] bg-ink-900/80 backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[290px] border-r border-white/10 bg-ink-900">
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-[262px]">
        <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-ink-950/80 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button onClick={() => setDrawerOpen(true)} className="rounded-lg border border-white/10 p-2 text-zinc-300 hover:bg-white/[0.06] lg:hidden">
              <Menu className="h-4 w-4" />
            </button>
            <Link to="/app" className="lg:hidden"><Logo showWordmark={false} /></Link>
            <div className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex">
              <span className="text-zinc-400">Workspace</span>
              <span className="text-zinc-700">/</span>
              <span className="text-zinc-300">{location.pathname === '/app' ? 'Overview' : location.pathname.split('/').filter(Boolean).slice(-1)[0].replace(/-/g, ' ')}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <RuntimePill className="hidden sm:inline-flex" />
              <Link to="/app/create">
                <Button variant="primary" size="sm" className="h-9">
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline sm:inline">New phone</span>
                </Button>
              </Link>
              <Link to="/app/settings" className="hidden h-9 w-9 place-items-center rounded-full border border-iris-400/25 bg-iris-500/15 text-[11px] font-semibold text-iris-200 sm:grid">
                {user ? initials(user.name) : 'CD'}
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="flex items-stretch justify-around">
          {[
            { to: '/app', label: 'Home', icon: LayoutDashboard, end: true },
            { to: '/app/create', label: 'Create', icon: Smartphone },
            { to: '/app/files', label: 'Files', icon: FolderUp },
            { to: '/app/billing', label: 'Billing', icon: CreditCard },
            { to: '/app/settings', label: 'Account', icon: Settings },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition',
                isActive ? 'text-iris-300' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
