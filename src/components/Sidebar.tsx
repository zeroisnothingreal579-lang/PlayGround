import {
  ChevronRight,
  History,
  Lock,
  Settings,
  Smartphone,
  Inbox,
  type LucideIcon,
} from 'lucide-react'
import type { ProviderMode, Rental, ViewId } from '../types'

interface NavItem {
  id: ViewId
  label: string
  icon: LucideIcon
}

const NAV: NavItem[] = [
  { id: 'numbers', label: 'Get a number', icon: Smartphone },
  { id: 'inbox', label: 'Active number', icon: Inbox },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  view: ViewId
  onNavigate: (view: ViewId) => void
  activeRental: Rental | null
  historyCount: number
  providerMode: ProviderMode
  providerReady: boolean
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
          <rect x="3.5" y="3.5" width="17" height="17" rx="5.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8.5 10v4M12 7.8v8.4M15.5 10.6v2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <span className="brand-text">
        <strong>hush</strong>
        {compact ? null : <small>numbers for the moment</small>}
      </span>
    </div>
  )
}

export function Sidebar({
  view,
  onNavigate,
  activeRental,
  historyCount,
  providerMode,
  providerReady,
}: SidebarProps) {
  const customReady = providerMode === 'custom' && providerReady

  return (
    <aside className="sidebar">
      <Brand />

      <nav className="side-nav" aria-label="Main">
        <span className="side-label">Workspace</span>
        {NAV.map((item) => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={`side-link ${active ? 'is-active' : ''}`}
              onClick={() => onNavigate(item.id)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {item.id === 'inbox' && activeRental ? <span className="nav-live" /> : null}
              {item.id === 'history' && historyCount > 0 ? (
                <span className="nav-count">{historyCount}</span>
              ) : null}
            </button>
          )
        })}
      </nav>

      <div className="side-spacer" />

      <button type="button" className="side-mode" onClick={() => onNavigate('settings')}>
        <span
          className={`mode-pulse ${
            providerMode === 'demo' ? 'is-demo' : customReady ? 'is-live' : 'is-warn'
          }`}
        />
        <span className="mode-text">
          <small>Connection</small>
          <strong>
            {providerMode === 'demo'
              ? 'Demo inbox'
              : customReady
                ? 'Custom provider'
                : 'Provider setup'}
          </strong>
        </span>
        <ChevronRight size={16} />
      </button>

      <p className="side-note">
        <Lock size={12} /> Stored in this browser only
      </p>
    </aside>
  )
}

export function MobileHeader({
  providerMode,
  providerReady,
  onSettings,
}: {
  providerMode: ProviderMode
  providerReady: boolean
  onSettings: () => void
}) {
  const customReady = providerMode === 'custom' && providerReady
  const pillClass =
    providerMode === 'demo' ? 'is-demo' : customReady ? 'is-live' : 'is-warn'
  return (
    <header className="mobile-header">
      <Brand compact />
      <div className="mobile-header-right">
        <span className={`mode-pill ${pillClass}`}>
          <span className="mode-pulse" />
          {providerMode === 'demo' ? 'Demo' : customReady ? 'Live' : 'Setup'}
        </span>
        <button
          type="button"
          className="icon-button"
          onClick={onSettings}
          aria-label="Open settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  )
}

export function BottomNav({
  view,
  onNavigate,
  activeRental,
}: {
  view: ViewId
  onNavigate: (view: ViewId) => void
  activeRental: Rental | null
}) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {NAV.map((item) => {
        const Icon = item.icon
        const active = view === item.id
        return (
          <button
            key={item.id}
            type="button"
            className={`bottom-link ${active ? 'is-active' : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-current={active ? 'page' : undefined}
          >
            <span className="bottom-icon">
              <Icon size={20} />
              {item.id === 'inbox' && activeRental ? <span className="nav-live" /> : null}
            </span>
            <span>{item.label.split(' ')[0]}</span>
          </button>
        )
      })}
    </nav>
  )
}
