import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn, statusDot, statusTone } from '../lib/utils'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-gradient-to-br from-violet-400 via-violet-600 to-violet-800 shadow-[0_6px_22px_-8px_rgba(112,37,245,.9)]">
        <div className="absolute inset-[1px] rounded-[10px] bg-gradient-to-br from-white/10 to-transparent" />
        <svg viewBox="0 0 24 24" className="relative h-[18px] w-[18px]" fill="none">
          <path d="M7.5 16.5 16.5 7.5M8 7.5h5M16 16.5h-5" stroke="white" strokeWidth="2.1" strokeLinecap="round" />
          <circle cx="18.2" cy="5.8" r="2" fill="#54e6b1" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-semibold tracking-[-0.02em] text-white">LinkPilot</span>
            <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-violet-300">AI</span>
          </div>
          <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-500">Link intelligence</p>
        </div>
      )}
    </div>
  )
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const tone = statusTone[status] || 'text-ink-300'
  return (
    <span className={cn('status-pill', tone)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', statusDot[status] || 'bg-ink-400', status === 'active' && 'animate-pulse')} />
      {label || status.replaceAll('_', ' ')}
    </span>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-violet-300/80">{eyebrow}</p>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.035em] text-white sm:text-[31px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-400 sm:text-[13.5px]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  accent = 'violet',
  badge,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon: ReactNode
  accent?: 'violet' | 'mint' | 'amber' | 'sky' | 'coral'
  badge?: ReactNode
}) {
  const accents = {
    violet: 'from-violet-500/20 text-violet-300 ring-violet-500/20',
    mint: 'from-mint/15 text-mint ring-mint/20',
    amber: 'from-amber/15 text-amber ring-amber/20',
    sky: 'from-sky/15 text-sky ring-sky/20',
    coral: 'from-coral/15 text-coral ring-coral/20',
  }
  return (
    <div className="panel group p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label">{label}</p>
          <div className="mt-2.5 text-[26px] font-semibold tracking-[-0.03em] text-white sm:text-[29px]">{value}</div>
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br to-transparent ring-1', accents[accent])}>
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11.5px] text-ink-400">
        {badge}
        {sub}
      </div>
    </div>
  )
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[14.5px] font-semibold tracking-[-0.015em] text-white">{title}</h2>
        {description && <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ProgressBar({ value, tone = 'violet' }: { value: number; tone?: 'violet' | 'mint' | 'amber' | 'coral' }) {
  const colors = { violet: 'from-violet-500 to-violet-300', mint: 'from-mint/90 to-mint', amber: 'from-amber/90 to-amber', coral: 'from-coral to-coral/80' }
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.055]">
      <div
        className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out', colors[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.015] px-6 text-center', compact ? 'py-8' : 'py-14')}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/[0.08] text-violet-300">
        {icon}
      </div>
      <h3 className="text-[13.5px] font-semibold text-ink-100">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[11.5px] leading-relaxed text-ink-400">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={cn('panel animate-fade-up max-h-[92vh] w-full overflow-y-auto rounded-b-none sm:rounded-2xl', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/[0.06] bg-ink-850/95 px-5 py-4 backdrop-blur-xl sm:px-6">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-white">{title}</h2>
            {description && <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">{description}</p>}
          </div>
          <button className="icon-btn shrink-0" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex rounded-xl border border-white/[0.06] bg-ink-950/60 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-lg font-medium transition-all duration-200',
            size === 'sm' ? 'px-2.5 py-1 text-[10.5px]' : 'px-3 py-1.5 text-[11.5px]',
            value === option.value ? 'bg-white/[0.09] text-white shadow-sm' : 'text-ink-400 hover:text-ink-200',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function InfoNote({ tone = 'violet', icon, children }: { tone?: 'violet' | 'amber' | 'mint' | 'coral'; icon: ReactNode; children: ReactNode }) {
  const tones = {
    violet: 'border-violet-500/15 bg-violet-500/[0.055] text-violet-200',
    amber: 'border-amber/15 bg-amber/[0.055] text-amber',
    mint: 'border-mint/15 bg-mint/[0.055] text-mint',
    coral: 'border-coral/15 bg-coral/[0.055] text-coral',
  }
  return (
    <div className={cn('flex gap-3 rounded-xl border p-3.5 text-[11.5px] leading-relaxed', tones[tone])}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="text-ink-300">{children}</div>
    </div>
  )
}

export function CopyButton({ value, onCopied }: { value: string; onCopied?: () => void }) {
  return (
    <button
      className="icon-btn h-7 w-7 rounded-lg"
      aria-label="Copy"
      onClick={async () => {
        await navigator.clipboard?.writeText(value).catch(() => {})
        onCopied?.()
      }}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
      </svg>
    </button>
  )
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg className={cn('animate-spin text-current', className)} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function Toasts({ toasts }: { toasts: { id: number; message: string; tone: string }[] }) {
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
