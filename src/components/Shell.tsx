import {
  Activity,
  BarChart3,
  Bell,
  ChevronDown,
  Command,
  Globe2,
  LayoutDashboard,
  Link2,
  Menu,
  MonitorDot,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useApp } from '../context/AppContext'
import type { NavKey } from '../lib/types'
import { cn, domainOf, truncateMiddle } from '../lib/utils'
import { Logo } from './ui'

const navSections: { label: string; items: { key: NavKey; label: string; icon: typeof LayoutDashboard; badge?: string }[] }[] = [
  {
    label: 'Workspace',
    items: [
      { key: 'overview', label: 'Overview', icon: LayoutDashboard },
      { key: 'inspector', label: 'URL Inspector', icon: Link2 },
      { key: 'sessions', label: 'Browser Sessions', icon: MonitorDot },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { key: 'advertising', label: 'Advertising', icon: Sparkles },
      { key: 'analytics', label: 'Analytics', icon: BarChart3 },
      { key: 'activity', label: 'Activity log', icon: Activity },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { key: 'servers', label: 'Servers & workers', icon: Server },
      { key: 'settings', label: 'Settings', icon: Settings },
    ],
  },
]

const pageLabels: Record<NavKey, string> = {
  overview: 'Overview',
  inspector: 'URL Inspector',
  sessions: 'Browser Sessions',
  advertising: 'Advertising',
  servers: 'Servers & Workers',
  analytics: 'Analytics',
  activity: 'Activity Log',
  settings: 'Settings',
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { page, navigate, health, realtime, overview } = useApp()
  const activeSessions = overview?.analytics.totals.running || 0
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-5 pt-5">
        <Logo />
      </div>

      <div className="mx-3 mb-5 flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-[10px] font-bold text-violet-300">LP</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11.5px] font-medium text-ink-100">Operator workspace</p>
          <p className="mt-0.5 text-[9.5px] uppercase tracking-[0.1em] text-ink-500">Authorized testing</p>
        </div>
        <ChevronDown size={13} className="text-ink-500" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {navSections.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="mb-2 px-3 text-[9.5px] font-semibold uppercase tracking-[0.17em] text-ink-600">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const active = page === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      navigate(item.key)
                      onNavigate?.()
                    }}
                    className={cn('nav-item group w-full text-left', active && 'nav-item-active')}
                  >
                    <Icon size={15.5} className={cn('shrink-0 transition-colors', active ? 'text-violet-300' : 'text-ink-500 group-hover:text-ink-300')} />
                    <span className="flex-1">{item.label}</span>
                    {item.key === 'sessions' && activeSessions > 0 && (
                      <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-violet-300">{activeSessions}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="m-3 mt-0 rounded-xl border border-mint/10 bg-mint/[0.035] p-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
          </span>
          <span className="text-[10.5px] font-semibold text-mint">Policy protection active</span>
          <ShieldCheck size={13} className="ml-auto text-mint/70" />
        </div>
        <p className="mt-2 text-[9.5px] leading-relaxed text-ink-400">Analysis-only. Ads are never clicked and traffic is never fabricated.</p>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.05] px-4 py-3">
        <div className="flex items-center gap-2 text-[10px] text-ink-500">
          <span className={cn('h-1.5 w-1.5 rounded-full', realtime === 'online' ? 'bg-mint' : realtime === 'connecting' ? 'bg-amber' : 'bg-coral')} />
          {realtime === 'online' ? 'Live sync' : realtime === 'connecting' ? 'Connecting' : 'Reconnecting'}
        </div>
        <span className="text-[9.5px] uppercase tracking-[0.12em] text-ink-600">v{health?.version || '1.0.0'}</span>
      </div>
    </div>
  )
}

function GlobalSearch() {
  const { overview, navigate, setGlobalSearch } = useApp()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
        window.setTimeout(() => inputRef.current?.focus(), 20)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [])

  const pages = useMemo(() => Object.entries(pageLabels).map(([key, label]) => ({ key: key as NavKey, label })), [])
  const lower = query.toLowerCase().trim()
  const pageResults = pages.filter((item) => item.label.toLowerCase().includes(lower)).slice(0, 5)
  const sessionResults = (overview?.activeSessions || [])
    .filter((session) => !lower || `${session.currentUrl} ${session.finalDomain} ${session.status}`.toLowerCase().includes(lower))
    .slice(0, 4)
  const inspectionResults = (overview?.recentInspections || [])
    .filter((inspection) => !lower || `${inspection.originalUrl} ${inspection.finalDomain} ${inspection.pageStatus}`.toLowerCase().includes(lower))
    .slice(0, 4)

  const go = (key: NavKey) => {
    navigate(key)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative hidden w-full max-w-[340px] md:block">
      <div className={cn('flex items-center gap-2 rounded-xl border border-white/[0.065] bg-white/[0.025] px-3 py-2 transition-all', open && 'border-violet-500/30 bg-ink-900')}>
        <Search size={14} className="shrink-0 text-ink-500" />
        <input
          ref={inputRef}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && pageResults[0]) go(pageResults[0].key)
            if (event.key === 'Enter' && !pageResults[0] && sessionResults[0]) {
              setGlobalSearch(sessionResults[0].finalDomain || '')
              go('sessions')
            }
          }}
          placeholder="Search sessions, pages, commands…"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-ink-100 outline-none placeholder:text-ink-500"
        />
        <span className="kbd hidden shrink-0 lg:inline-flex">⌘K</span>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-white/[0.09] bg-ink-850/95 p-2 shadow-2xl backdrop-blur-2xl">
          {!query && (
            <div className="px-2 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-500">Quick navigation</div>
          )}
          <div className="space-y-0.5">
            {pageResults.map((item) => (
              <button key={item.key} onClick={() => go(item.key)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] text-ink-200 hover:bg-white/[0.055]">
                <Command size={13} className="text-ink-500" />
                Go to {item.label}
              </button>
            ))}
            {sessionResults.length > 0 && <div className="px-2 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-500">Active sessions</div>}
            {sessionResults.map((session) => (
              <button
                key={session.id}
                onClick={() => {
                  setGlobalSearch(session.finalDomain || domainOf(session.currentUrl))
                  go('sessions')
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.055]"
              >
                <Globe2 size={13} className="text-violet-300" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-200">{truncateMiddle(session.currentUrl, 52)}</span>
                <span className="text-[10px] text-ink-500">#{session.index}</span>
              </button>
            ))}
            {inspectionResults.length > 0 && <div className="px-2 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-500">Inspections</div>}
            {inspectionResults.map((inspection) => (
              <button key={inspection.id} onClick={() => go('inspector')} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.055]">
                <Link2 size={13} className="text-sky" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-200">{inspection.finalDomain || inspection.originalUrl}</span>
                <span className="text-[10px] text-ink-500">{inspection.pageStatus}</span>
              </button>
            ))}
            {lower && !pageResults.length && !sessionResults.length && !inspectionResults.length && (
              <div className="px-3 py-6 text-center text-[11.5px] text-ink-500">No matching commands or records.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const { page, navigate, overview, realtime, health } = useApp()
  const [mobileOpen, setMobileOpen] = useState(false)
  const activeSessions = overview?.analytics.totals.running || 0
  const mobileNav: { key: NavKey; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'overview', label: 'Home', icon: LayoutDashboard },
    { key: 'inspector', label: 'Inspect', icon: Link2 },
    { key: 'sessions', label: 'Sessions', icon: MonitorDot },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'settings', label: 'Settings', icon: Settings },
  ]
  return (
    <div className="shell-grid relative z-[1]">
      <aside className="sticky top-0 hidden h-screen border-r border-white/[0.055] bg-ink-900/55 backdrop-blur-2xl lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute bottom-0 left-0 top-0 w-[280px] animate-fade-in border-r border-white/[0.08] bg-ink-900/95 backdrop-blur-2xl">
            <button className="absolute right-3 top-3 icon-btn z-10" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X size={15} />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-[62px] items-center gap-3 border-b border-white/[0.05] bg-ink-950/70 px-3 backdrop-blur-2xl sm:px-5 lg:px-7">
          <button className="icon-btn lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={17} />
          </button>
          <div className="lg:hidden"><Logo compact /></div>
          <div className="hidden h-5 w-px bg-white/[0.07] lg:block" />
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden text-[10px] uppercase tracking-[0.15em] text-ink-500 sm:inline">Workspace</span>
            <span className="hidden text-ink-600 sm:inline">/</span>
            <span className="truncate text-[12.5px] font-medium text-ink-200">{pageLabels[page]}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />
            <button className="icon-btn md:hidden" onClick={() => navigate('inspector')} aria-label="Search">
              <Search size={16} />
            </button>
            <div className="hidden items-center gap-2 rounded-xl border border-white/[0.055] bg-white/[0.02] px-2.5 py-1.5 sm:flex">
              <span className={cn('h-1.5 w-1.5 rounded-full', realtime === 'online' ? 'bg-mint' : 'bg-amber')} />
              <span className="text-[10px] font-medium text-ink-400">{health?.capabilities?.automation === 'playwright' ? 'Browser ready' : 'Analysis mode'}</span>
            </div>
            <button className="icon-btn relative" onClick={() => navigate('activity')} aria-label="Activity">
              <Bell size={15} />
              {overview?.activity?.length ? <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-violet-400 ring-2 ring-ink-950" /> : null}
            </button>
            <div className="hidden h-8 w-px bg-white/[0.06] sm:block" />
            <button className="flex items-center gap-2 rounded-xl p-0.5 pr-1 transition-colors hover:bg-white/[0.04]" onClick={() => navigate('settings')}>
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-violet-500/30 to-violet-800/30 text-[10.5px] font-semibold text-violet-200 ring-1 ring-violet-500/20">
                OP
              </div>
              <div className="hidden text-left xl:block">
                <p className="text-[10.5px] font-medium text-ink-200">Operator</p>
                <p className="text-[9px] text-ink-500">Authorized</p>
              </div>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] flex-1 px-3 pb-24 pt-5 sm:px-5 sm:pt-6 lg:px-7 lg:pb-10">{children}</main>

        <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.07] bg-ink-950/95 backdrop-blur-2xl lg:hidden">
          <div className="grid grid-cols-5">
            {mobileNav.map((item) => {
              const Icon = item.icon
              const active = page === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => navigate(item.key)}
                  className={cn('flex flex-col items-center gap-1 py-2.5 text-[9.5px] font-medium transition-colors', active ? 'text-violet-300' : 'text-ink-500')}
                >
                  <span className="relative">
                    <Icon size={18} />
                    {item.key === 'sessions' && activeSessions > 0 && <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-violet-500 px-0.5 text-[7.5px] font-bold text-white">{activeSessions}</span>}
                  </span>
                  {item.label}
                </button>
              )
            })}
          </div>
        </nav>
      </div>
      <ToastsWrapper />
    </div>
  )
}

function ToastsWrapper() {
  const { toasts } = useApp()
  if (!toasts.length) return null
  return (
    <div className="pointer-events-none fixed bottom-20 right-3 z-[60] flex w-[calc(100%-1.5rem)] max-w-sm flex-col gap-2 sm:bottom-5 sm:right-5">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'animate-fade-up pointer-events-auto flex items-center gap-2.5 rounded-xl border bg-ink-800/95 px-4 py-3 text-[12px] shadow-2xl backdrop-blur-xl',
            toast.tone === 'error' ? 'border-coral/25 text-coral' : toast.tone === 'warn' ? 'border-amber/25 text-amber' : toast.tone === 'success' ? 'border-mint/25 text-mint' : 'border-white/10 text-ink-100',
          )}
        >
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', toast.tone === 'error' ? 'bg-coral' : toast.tone === 'warn' ? 'bg-amber' : toast.tone === 'success' ? 'bg-mint' : 'bg-violet-400')} />
          {toast.message}
        </div>
      ))}
    </div>
  )
}
