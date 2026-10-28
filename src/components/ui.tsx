import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Check, CheckCircle2, Copy, Info, Timer, X, XCircle } from 'lucide-react'
import type { Service, SmsMessage } from '../types'
import { formatClockTime } from '../lib/format'
import type { ToastItem, ToastTone } from '../hooks/useApp'

export function ServiceMark({
  service,
  size = 'md',
}: {
  service: Service
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <span
      className={`service-mark service-mark-${size}`}
      style={{ '--mark': service.color } as CSSProperties}
      aria-hidden="true"
    >
      {service.short}
    </span>
  )
}

export function CopyButton({
  value,
  onCopy,
  label = 'Copy',
  compact = false,
}: {
  value: string
  onCopy: (text: string, label?: string) => Promise<void>
  label?: string
  compact?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const handleClick = async () => {
    await onCopy(value, `${label} copied.`)
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      type="button"
      className={`copy-button ${compact ? 'copy-button-compact' : ''} ${copied ? 'is-copied' : ''}`}
      onClick={handleClick}
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {compact ? null : <span>{copied ? 'Copied' : label}</span>}
    </button>
  )
}

export function CountdownRing({
  remaining,
  total,
}: {
  remaining: number
  total: number
}) {
  const radius = 25
  const circumference = 2 * Math.PI * radius
  const fraction = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0
  const tone =
    remaining <= 30_000 ? 'urgent' : remaining <= 120_000 ? 'warn' : 'calm'

  return (
    <span className={`countdown-ring countdown-ring-${tone}`} aria-hidden="true">
      <svg className="ring-svg" viewBox="0 0 64 64" width="64" height="64">
        <circle className="ring-track" cx="32" cy="32" r={radius} />
        <circle
          className="ring-value"
          cx="32"
          cy="32"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <Timer size={18} />
    </span>
  )
}

export function MessageCard({
  message,
  onCopy,
}: {
  message: SmsMessage
  onCopy: (text: string, label?: string) => Promise<void>
}) {
  const monogram = (message.from || 'S').trim().charAt(0).toUpperCase()

  return (
    <article className="message-card">
      <div className="message-head">
        <span className="message-avatar" aria-hidden="true">
          {monogram}
        </span>
        <div className="message-from">
          <strong>{message.from}</strong>
          <span>Incoming SMS</span>
        </div>
        <span className="message-time">{formatClockTime(message.receivedAt)}</span>
      </div>
      <p className="message-body">{message.body}</p>
      {message.code ? (
        <div className="code-row">
          <span className="code-label">
            <span className="code-dot" />
            Detected code
          </span>
          <span className="code-value">{message.code}</span>
          <CopyButton
            value={message.code}
            onCopy={onCopy}
            label="Copy code"
            compact
          />
        </div>
      ) : null}
    </article>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  )
}

const TOAST_ICON: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 size={17} />,
  error: <XCircle size={17} />,
  info: <Info size={17} />,
}

export function Toasts({
  items,
  onDismiss,
}: {
  items: ToastItem[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <span className="toast-icon">{TOAST_ICON[toast.tone]}</span>
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  tone = 'default',
}: {
  open: boolean
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  onClose: () => void
  tone?: 'default' | 'danger'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={`modal modal-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        <h2>{title}</h2>
        {description ? <p className="modal-description">{description}</p> : null}
        {children}
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  )
}
