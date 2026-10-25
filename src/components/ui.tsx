import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { cn, classForStatus, statusDot } from '../lib/utils'
import type { SessionStatus } from '../types'

export function StatusBadge({ status, pulse = false }: { status: SessionStatus | string; pulse?: boolean }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return (
    <span className={cn('chip', classForStatus(status))}>
      <span className={cn('h-1.5 w-1.5 rounded-full', statusDot(status), pulse && 'animate-pulse')} />
      {label}
    </span>
  )
}

export function ProgressBar({ value, className, tone = 'violet' }: { value: number; className?: string; tone?: 'violet' | 'emerald' | 'rose' | 'amber' }) {
  const color = tone === 'emerald' ? 'bg-emerald-400' : tone === 'rose' ? 'bg-rose-400' : tone === 'amber' ? 'bg-amber-400' : 'progress-shimmer'
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-700', color)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  data,
  tone = 'violet',
  onClick,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon: ReactNode
  data?: number[]
  tone?: 'violet' | 'emerald' | 'amber' | 'sky'
  onClick?: () => void
}) {
  const toneMap = {
    violet: { icon: 'text-violet-300 bg-violet-500/10 border-violet-500/15', line: '#a78bfa' },
    emerald: { icon: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/15', line: '#34d399' },
    amber: { icon: 'text-amber-300 bg-amber-500/10 border-amber-500/15', line: '#fbbf24' },
    sky: { icon: 'text-sky-300 bg-sky-500/10 border-sky-500/15', line: '#38bdf8' },
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'panel panel-hover group relative overflow-hidden p-5 text-left',
        onClick ? 'cursor-pointer' : 'cursor-default',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl border', toneMap.icon)}>{icon}</div>
        {data && data.length > 1 && <MiniSparkline data={data} color={toneMap.line} />}
      </div>
      <p className="mt-5 text-[26px] font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{label}</p>
      {sub && <div className="mt-3 text-xs text-slate-500">{sub}</div>}
      {onClick && (
        <ArrowUpRight className="absolute right-4 top-14 h-4 w-4 text-slate-700 opacity-0 transition group-hover:opacity-100" />
      )}
    </button>
  )
}

export function MiniSparkline({ data, color = '#a78bfa', width = 72, height = 28 }: { data: number[]; color?: string; width?: number; height?: number }) {
  const max = Math.max(1, ...data)
  const points = data
    .map((value, index) => `${(index / Math.max(1, data.length - 1)) * width},${height - (value / max) * (height - 4) - 2}`)
    .join(' ')
  return (
    <svg width={width} height={height} className="overflow-visible opacity-80" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="label mb-2 text-violet-300/80">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-4xl',
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  width?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handle)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handle)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative max-h-[92vh] w-full animate-slide-up overflow-hidden rounded-t-3xl border border-white/[0.09] bg-ink-850 shadow-2xl sm:rounded-3xl',
          width,
        )}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4 sm:px-6">
            <div className="min-w-0">
              {title && <div className="truncate text-lg font-semibold text-white">{title}</div>}
              {subtitle && <div className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} className="btn-ghost h-9 w-9 shrink-0 !p-0" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="max-h-[calc(92vh-72px)] overflow-y-auto">{children}</div>
      </div>
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
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-6 py-10' : 'px-6 py-20')}>
      <div className="dot-grid mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.02] text-violet-300">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="label mb-2 block">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] leading-relaxed text-slate-600">{hint}</span>}
    </label>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5 text-left transition hover:border-white/[0.1]',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span>
        <span className="block text-xs font-semibold text-slate-200">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{description}</span>}
      </span>
      <span className={cn('mt-0.5 flex h-5 w-9 shrink-0 rounded-full p-0.5 transition', checked ? 'bg-violet-500' : 'bg-white/10')}>
        <span className={cn('h-4 w-4 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </span>
    </button>
  )
}

export function CodeChip({ children }: { children: ReactNode }) {
  return <code className="rounded-md border border-white/[0.06] bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-violet-200">{children}</code>
}
