import clsx, { type ClassValue } from 'clsx'

export function cn(...values: ClassValue[]) {
  return clsx(values)
}

export function timeAgo(value?: string | null) {
  if (!value) return '—'
  const delta = Date.now() - new Date(value).getTime()
  if (delta < 0) return 'just now'
  const seconds = Math.round(delta / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatTime(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function elapsed(start?: string | null, end?: string | null) {
  if (!start) return '0s'
  const finish = end ? new Date(end).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((finish - new Date(start).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m ${remainder.toString().padStart(2, '0')}s`
}

export function formatNumber(value: number, compact = false) {
  return new Intl.NumberFormat('en-US', compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}).format(value)
}

export function formatCurrency(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

export function truncateMiddle(value: string, max = 56) {
  if (!value || value.length <= max) return value
  const side = Math.floor((max - 1) / 2)
  return `${value.slice(0, side)}…${value.slice(-side)}`
}

export function domainOf(value?: string) {
  if (!value) return ''
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

export function parseCsvUrls(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const urls: string[] = []
  for (const line of lines) {
    if (/^https?:\/\//i.test(line)) {
      urls.push(line)
      continue
    }
    const cells = line.split(',').map((cell) => cell.replace(/^"|"$/g, '').trim())
    const candidate = cells.find((cell) => /^https?:\/\//i.test(cell))
    if (candidate) urls.push(candidate)
  }
  return [...new Set(urls)]
}

export const statusTone: Record<string, string> = {
  ok: 'text-mint',
  completed: 'text-mint',
  active: 'text-mint',
  online: 'text-mint',
  success: 'text-mint',
  running: 'text-violet-300',
  loading: 'text-sky',
  launching: 'text-sky',
  queued: 'text-ink-300',
  paused: 'text-amber',
  warning: 'text-amber',
  warn: 'text-amber',
  medium: 'text-amber',
  captcha: 'text-amber',
  blocked: 'text-coral',
  error: 'text-coral',
  failed: 'text-coral',
  stopped: 'text-ink-300',
  high: 'text-coral',
  low: 'text-mint',
}

export const statusDot: Record<string, string> = {
  ok: 'bg-mint',
  completed: 'bg-mint',
  active: 'bg-mint',
  online: 'bg-mint',
  success: 'bg-mint',
  running: 'bg-violet-400',
  loading: 'bg-sky',
  launching: 'bg-sky',
  queued: 'bg-ink-400',
  paused: 'bg-amber',
  warn: 'bg-amber',
  medium: 'bg-amber',
  captcha: 'bg-amber',
  blocked: 'bg-coral',
  error: 'bg-coral',
  failed: 'bg-coral',
  stopped: 'bg-ink-500',
  high: 'bg-coral',
  low: 'bg-mint',
}
