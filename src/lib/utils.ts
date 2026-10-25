import type { ActivityEntry, BrowserSession, Run, SessionStatus } from '../types'

export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ')
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US', { notation: value >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

export function formatCurrency(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const code = currency && currency !== 'MIXED' ? currency.toUpperCase() : undefined
  try {
    return new Intl.NumberFormat('en-US', {
      style: code ? 'currency' : 'decimal',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${code || currency || ''} ${value.toFixed(2)}`.trim()
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

export function formatUptime(seconds: number): string {
  if (!seconds) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return '—'
  const diff = Date.now() - timestamp
  if (diff < 45_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.round(diff / 86_400_000)}d ago`
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(timestamp)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

export function shortUrl(value: string | null | undefined, max = 52): string {
  if (!value) return '—'
  const cleaned = value.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned
}

export function domainOf(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

export function classForStatus(status: SessionStatus | string): string {
  switch (status) {
    case 'complete':
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
    case 'blocked':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-300'
    case 'error':
      return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
    case 'stopped':
      return 'border-slate-400/20 bg-slate-400/10 text-slate-300'
    case 'paused':
      return 'border-sky-400/20 bg-sky-400/10 text-sky-300'
    case 'queued':
      return 'border-white/10 bg-white/5 text-slate-400'
    case 'analyzing':
    case 'inspecting':
    case 'opening':
    case 'resolving':
      return 'border-violet-400/25 bg-violet-400/10 text-violet-200'
    default:
      return 'border-white/10 bg-white/5 text-slate-400'
  }
}

export function statusDot(status: SessionStatus | string): string {
  switch (status) {
    case 'complete':
      return 'bg-emerald-400'
    case 'blocked':
      return 'bg-amber-400'
    case 'error':
      return 'bg-rose-400'
    case 'paused':
      return 'bg-sky-400'
    case 'stopped':
      return 'bg-slate-500'
    case 'queued':
      return 'bg-slate-600'
    default:
      return 'bg-violet-400'
  }
}

export function isActiveStatus(status: SessionStatus): boolean {
  return ['resolving', 'opening', 'inspecting', 'analyzing'].includes(status)
}

export function isTerminal(status: SessionStatus): boolean {
  return ['complete', 'blocked', 'stopped', 'error'].includes(status)
}

export function runProgress(run: Run): number {
  if (!run.sessions.length) return 0
  const total = run.sessions.reduce((sum, session) => {
    if (isTerminal(session.status)) return sum + 100
    return sum + Math.max(0, Math.min(100, session.progress))
  }, 0)
  return Math.round(total / run.sessions.length)
}

export function deriveActivity(runs: Run[]): ActivityEntry[] {
  const entries: ActivityEntry[] = []
  for (const run of runs) {
    for (const session of run.sessions) {
      for (const log of session.logs) {
        entries.push({
          id: log.id,
          at: log.at,
          kind: log.action === 'safety' ? 'safety' : log.action === 'ad_scan' || log.action === 'redirect' ? 'analysis' : 'session',
          message: log.message,
          runId: run.id,
          sessionId: session.id,
        })
      }
    }
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 36)
}

export function allAds(runs: Run[]): { run: Run; session: BrowserSession }[] {
  return runs.flatMap((run) => run.sessions.filter((session) => session.ads.length > 0).map((session) => ({ run, session })))
}

export function parseCsvUrls(text: string): string[] {
  const urls: string[] = []
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  for (const line of lines) {
    const cells = line.match(/("([^"]|"")*"|[^,]+)/g) || []
    for (const cell of cells) {
      const cleaned = cell.replace(/^"|"$/g, '').replace(/""/g, '"').trim()
      if (/^(https?:\/\/|www\.)/i.test(cleaned) || /^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(cleaned)) {
        urls.push(cleaned)
        break
      }
    }
  }
  return [...new Set(urls)].slice(0, 25)
}

export function parseBulkUrls(text: string): string[] {
  return [...new Set(
    text
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 2 && (/^https?:\/\//i.test(value) || /^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(value))),
  )].slice(0, 25)
}

export function secureHref(value: string | null | undefined): string {
  if (!value) return '#'
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '#'
  } catch {
    return '#'
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
