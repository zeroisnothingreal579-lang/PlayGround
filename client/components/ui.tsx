import { forwardRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { cn, STATUS_META } from '../lib/utils'
import type { DeviceStatus } from '@shared/contracts'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-to-b from-iris-500 to-iris-600 text-white shadow-[0_8px_24px_-10px_rgba(124,58,237,.8)] hover:from-iris-400 hover:to-iris-500 border border-iris-400/40',
  secondary: 'bg-white/[0.05] text-zinc-100 border border-white/10 hover:bg-white/[0.09] hover:border-white/20',
  ghost: 'text-zinc-400 hover:text-white hover:bg-white/[0.06] border border-transparent',
  danger: 'bg-rose-500/12 text-rose-300 border border-rose-400/25 hover:bg-rose-500/20 hover:text-rose-200',
  success: 'bg-emerald-500/12 text-emerald-300 border border-emerald-400/25 hover:bg-emerald-500/20',
  outline: 'border border-white/15 text-zinc-200 hover:bg-white/[0.06] hover:border-white/25',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-sm rounded-xl gap-2',
  icon: 'h-9 w-9 rounded-lg',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'focus-ring inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  )
})

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...props}>
      {children}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'focus-ring h-11 w-full rounded-xl border border-white/10 bg-ink-900/80 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition hover:border-white/15 focus:border-iris-400/60 focus:ring-iris-500/40',
        className,
      )}
      {...props}
    />
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'focus-ring w-full rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 transition hover:border-white/15 focus:border-iris-400/60',
        className,
      )}
      {...props}
    />
  )
})

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        'focus-ring h-11 w-full appearance-none rounded-xl border border-white/10 bg-ink-900/80 px-3.5 text-sm text-zinc-100 transition hover:border-white/15 focus:border-iris-400/60',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
})

export function Field({ label, hint, error, children, className }: {
  label: string
  hint?: string
  error?: string | null
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-zinc-300">
        {label}
        {hint && <span className="font-normal text-zinc-500">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1.5 block text-xs text-rose-400">{error}</span>}
    </label>
  )
}

export function Badge({ children, tone = 'default', className }: {
  children: React.ReactNode
  tone?: 'default' | 'violet' | 'green' | 'amber' | 'rose' | 'cyan'
  className?: string
}) {
  const tones = {
    default: 'border-white/10 bg-white/[0.05] text-zinc-300',
    violet: 'border-iris-400/25 bg-iris-500/10 text-iris-300',
    green: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-400/25 bg-amber-500/10 text-amber-300',
    rose: 'border-rose-400/25 bg-rose-500/10 text-rose-300',
    cyan: 'border-electric-400/25 bg-electric-500/10 text-electric-300',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider', tones[tone], className)}>
      {children}
    </span>
  )
}

export function StatusBadge({ status, isDemo, className }: { status: DeviceStatus; isDemo?: boolean; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium', meta.bg, meta.text, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot, (status === 'running' || status === 'starting') && 'animate-pulse')} />
      {isDemo && status === 'running' ? 'Demo on' : meta.label}
    </span>
  )
}

export function Progress({ value, tone = 'violet', className, height = 'h-1.5' }: {
  value: number
  tone?: 'violet' | 'green' | 'amber' | 'rose' | 'cyan'
  className?: string
  height?: string
}) {
  const tones = {
    violet: 'from-iris-500 to-electric-400',
    green: 'from-emerald-500 to-emerald-300',
    amber: 'from-amber-500 to-amber-300',
    rose: 'from-rose-500 to-rose-300',
    cyan: 'from-electric-500 to-electric-300',
  }
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-white/[0.07]', height, className)}>
      <div
        className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-700', tones[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export function Toggle({ checked, onChange, disabled, label }: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition',
        checked ? 'border-iris-400/50 bg-iris-500' : 'border-white/10 bg-ink-700',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-iris-400', className)} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-lg bg-white/[0.04]', className)} />
}

export function Modal({ open, onClose, title, description, children, footer, width = 'max-w-lg' }: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: React.ReactNode
  footer?: React.ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative z-10 w-full animate-rise rounded-t-2xl border border-white/10 bg-ink-850 shadow-2xl sm:rounded-2xl', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] p-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
            {description && <p className="mt-1 text-sm leading-relaxed text-zinc-400">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children && <div className="p-5">{children}</div>}
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-white/[0.07] p-4 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function EmptyState({ icon: Icon, title, description, action, className }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-14 text-center', className)}>
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-ink-800 text-iris-300">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-display text-base font-semibold text-white">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-zinc-400">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-iris-300/80">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
