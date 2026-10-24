import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bot,
  ChevronDown,
  Clock3,
  Globe2,
  Layers3,
  Link2,
  ListFilter,
  Loader2,
  MonitorDot,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Timer,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { api } from '../lib/api'
import type { BrowserSession, Job, SessionStatus } from '../lib/types'
import { cn, domainOf, elapsed, formatTime, truncateMiddle } from '../lib/utils'
import { EmptyState, InfoNote, Modal, PageHeader, ProgressBar, SectionTitle, Spinner, StatusPill } from '../components/ui'

const countOptions = [1, 5, 10, 20, 50, 100]
const statusFilters: { key: 'all' | SessionStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'loading', label: 'Loading' },
  { key: 'queued', label: 'Queued' },
  { key: 'paused', label: 'Paused' },
  { key: 'completed', label: 'Complete' },
  { key: 'error', label: 'Errors' },
]

function Preview({ session, large = false }: { session: BrowserSession; large?: boolean }) {
  const [failed, setFailed] = useState(false)
  const hasPreview = session.previewAvailable && !failed
  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-white/[0.06] bg-ink-950', large ? 'aspect-video' : 'aspect-[16/10]')}>
      {hasPreview ? (
        <img
          src={`/api/sessions/${session.id}/preview?t=${encodeURIComponent(session.previewAt || session.updatedAt || '')}`}
          alt={`Browser preview for session ${session.index}`}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_30%_15%,rgba(112,37,245,.2),transparent_55%),radial-gradient(circle_at_80%_90%,rgba(84,230,177,.07),transparent_50%)]">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="relative text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-ink-400">
              {session.status === 'loading' || session.status === 'launching' ? <Loader2 size={18} className="animate-spin text-sky" /> : <Globe2 size={18} />}
            </div>
            <p className="mt-2 text-[10px] font-medium text-ink-300">{session.finalDomain || domainOf(session.currentUrl) || 'Awaiting navigation'}</p>
            <p className="mt-0.5 text-[8.5px] uppercase tracking-[0.1em] text-ink-600">{session.previewAvailable ? 'Preview unavailable' : 'Analysis preview'}</p>
          </div>
          {session.status === 'loading' && <div className="absolute inset-x-0 top-0 h-14 animate-scan bg-gradient-to-b from-transparent via-violet-400/10 to-transparent" />}
        </div>
      )}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/55 to-transparent p-2.5">
        <span className="rounded-md border border-white/[0.1] bg-black/40 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-white/70 backdrop-blur">Session {String(session.index).padStart(2, '0')}</span>
        <StatusPill status={session.status} />
      </div>
      {['loading', 'launching', 'active'].includes(session.status) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-5">
          <ProgressBar value={session.progress} tone={session.status === 'active' ? 'mint' : 'violet'} />
        </div>
      )}
    </div>
  )
}

function SessionCard({ session, onOpen, onAction }: { session: BrowserSession; onOpen: () => void; onAction: (action: 'pause' | 'resume' | 'stop') => void }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!session.startedAt || session.endedAt) return
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [session.startedAt, session.endedAt])

  const active = ['launching', 'loading', 'active'].includes(session.status)
  return (
    <div className="panel group flex flex-col p-2.5 transition-all duration-300 hover:border-violet-500/20">
      <button className="text-left" onClick={onOpen}>
        <Preview session={session} />
      </button>
      <div className="flex flex-1 flex-col px-1 pb-1 pt-3">
        <div className="flex items-start justify-between gap-2">
          <button className="min-w-0 text-left" onClick={onOpen}>
            <p className="truncate text-[11.5px] font-semibold text-ink-100">{session.finalDomain || domainOf(session.currentUrl) || 'Resolving destination'}</p>
            <p className="mono mt-0.5 truncate text-[9px] text-ink-500">{truncateMiddle(session.currentUrl, 48)}</p>
          </button>
          <button className="icon-btn h-7 w-7 shrink-0" onClick={onOpen} aria-label="Open session details"><MoreHorizontal size={13} /></button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {session.ads?.detected ? (
            <span className="chip border-amber/15 bg-amber/[0.045] px-1.5 py-0.5 text-[8.5px] text-amber"><Sparkles size={9} />{session.ads.networks?.[0] || 'ads detected'}</span>
          ) : (
            <span className="chip px-1.5 py-0.5 text-[8.5px] text-ink-400"><ShieldCheck size={9} />no ads detected</span>
          )}
          {session.controls?.countdown && <span className="chip px-1.5 py-0.5 text-[8.5px] text-sky"><Timer size={9} />countdown</span>}
          {session.pageStatus === 'captcha' && <span className="chip border-amber/15 bg-amber/[0.045] px-1.5 py-0.5 text-[8.5px] text-amber">CAPTCHA</span>}
        </div>

        {session.ai?.summary && <p className="mt-2.5 line-clamp-2 text-[9.5px] leading-relaxed text-ink-400">{session.ai.summary}</p>}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <div className="flex items-center gap-2 text-[9px] text-ink-500">
            <span className="flex items-center gap-1"><Clock3 size={9} />{elapsed(session.startedAt, session.endedAt)}</span>
            <span>·</span>
            <span>{session.region || 'pending'}</span>
          </div>
          <div className="flex items-center gap-1">
            {active && (
              <button className="icon-btn h-7 w-7" onClick={() => onAction('pause')} aria-label="Pause session"><Pause size={11} /></button>
            )}
            {session.status === 'paused' && (
              <button className="icon-btn h-7 w-7" onClick={() => onAction('resume')} aria-label="Resume session"><Play size={11} /></button>
            )}
            {!['completed', 'stopped', 'error'].includes(session.status) && (
              <button className="icon-btn h-7 w-7 hover:border-coral/20 hover:text-coral" onClick={() => onAction('stop')} aria-label="Stop session"><Square size={10} fill="currentColor" /></button>
            )}
            <button className="icon-btn h-7 w-7" onClick={onOpen} aria-label="Inspect session"><ArrowRight size={11} /></button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SessionDetail({ session, open, onClose, onAction }: { session: BrowserSession | null; open: boolean; onClose: () => void; onAction: (action: 'pause' | 'resume' | 'stop') => void }) {
  const { notify } = useApp()
  const [detail, setDetail] = useState<BrowserSession | null>(null)
  const [tab, setTab] = useState<'overview' | 'chain' | 'activity'>('overview')

  useEffect(() => {
    if (!session) return
    setDetail((current) => current && current.id === session.id
      ? { ...session, logs: current.logs, inspection: current.inspection, logCount: current.logCount }
      : session)
  }, [session])

  useEffect(() => {
    if (!session) return
    setTab('overview')
    api.session(session.id).then((result) => setDetail(result.session)).catch(() => {})
  }, [session?.id])

  if (!open || !detail) return null
  const inspection = detail.inspection
  const logs = detail.logs || []

  return (
    <Modal open={open} onClose={onClose} title={`Session ${String(detail.index).padStart(2, '0')} · ${detail.finalDomain || domainOf(detail.currentUrl) || 'Destination'}`} description={`Worker ${detail.workerId || 'pending'} · ${detail.region || 'region pending'} · ${detail.jobId.slice(-8)}`} wide>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusPill status={detail.status} />
        <div className="flex gap-1.5">
          {['launching', 'loading', 'active'].includes(detail.status) && <button className="btn-secondary px-3 py-1.5 text-[11px]" onClick={() => onAction('pause')}><Pause size={11} />Pause</button>}
          {detail.status === 'paused' && <button className="btn-secondary px-3 py-1.5 text-[11px]" onClick={() => onAction('resume')}><Play size={11} />Resume</button>}
          {!['completed', 'stopped', 'error'].includes(detail.status) && <button className="btn-danger px-3 py-1.5 text-[11px]" onClick={() => onAction('stop')}><Square size={10} />Stop</button>}
        </div>
      </div>

      <div className="mt-4">
        <Preview session={detail} large />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Elapsed', value: elapsed(detail.startedAt, detail.endedAt) },
          { label: 'Progress', value: `${detail.progress}%` },
          { label: 'Ad elements', value: String(detail.ads?.elementCount ?? 0) },
          { label: 'Log events', value: String(detail.logCount ?? logs.length) },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-white/[0.05] bg-white/[0.018] p-2.5">
            <p className="text-[9px] uppercase tracking-[0.1em] text-ink-500">{item.label}</p>
            <p className="mt-1 text-[13px] font-medium text-ink-100">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-1 rounded-xl border border-white/[0.06] bg-ink-950/50 p-1">
        {(['overview', 'chain', 'activity'] as const).map((option) => (
          <button key={option} onClick={() => setTab(option)} className={cn('flex-1 rounded-lg px-3 py-1.5 text-[11px] font-medium capitalize transition-colors', tab === option ? 'bg-white/[0.08] text-white' : 'text-ink-400 hover:text-ink-200')}>
            {option}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'overview' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/[0.055] bg-ink-950/40 p-3.5">
              <p className="label">Current URL</p>
              <p className="mono mt-1.5 break-all text-[10.5px] leading-relaxed text-ink-200">{detail.currentUrl || detail.originalUrl}</p>
              {detail.finalUrl && detail.finalUrl !== detail.currentUrl && <p className="mono mt-2 break-all border-t border-white/[0.04] pt-2 text-[9.5px] text-ink-500">Final: {detail.finalUrl}</p>}
            </div>
            <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.045] p-3.5">
              <div className="flex items-center gap-2"><Bot size={13} className="text-violet-300" /><p className="text-[11.5px] font-semibold text-ink-100">AI session summary</p>{detail.ai && <span className="chip text-[8.5px]">{detail.ai.source}</span>}</div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-300">{detail.ai?.summary || 'Analysis has not completed yet. The agent reports only observable page evidence.'}</p>
              {detail.ai && <p className="mt-2 text-[9px] text-ink-500">Confidence {Math.round(detail.ai.confidence * 100)}% · {detail.ai.pageType}</p>}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.055] bg-white/[0.018] p-3.5">
                <div className="flex items-center gap-2"><Sparkles size={12} className="text-amber" /><p className="text-[11px] font-medium text-ink-200">Advertising detection</p></div>
                <p className="mt-2 text-[10px] leading-relaxed text-ink-400">{detail.ads?.detected ? `${detail.ads.networks?.join(', ') || 'Unidentified network'} · ${detail.ads.formats?.join(', ')}` : 'No advertising elements detected.'}</p>
                <p className="mt-1.5 text-[8.5px] uppercase tracking-[0.08em] text-ink-600">Not a verified impression</p>
              </div>
              <div className="rounded-xl border border-white/[0.055] bg-white/[0.018] p-3.5">
                <div className="flex items-center gap-2"><Timer size={12} className="text-sky" /><p className="text-[11px] font-medium text-ink-200">Permitted controls</p></div>
                <p className="mt-2 text-[10px] leading-relaxed text-ink-400">Scroll and page reading only. {detail.controls?.countdown ? 'A countdown was identified but not bypassed.' : 'No countdown identified.'}</p>
                <p className="mt-1.5 text-[8.5px] uppercase tracking-[0.08em] text-ink-600">Clicks disabled by policy</p>
              </div>
            </div>
          </div>
        )}

        {tab === 'chain' && (
          <div className="space-y-2">
            {inspection?.redirects?.length ? inspection.redirects.map((hop, index) => (
              <div key={`${hop.url}-${index}`} className="flex gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] p-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.07] bg-ink-900 font-mono text-[9px] text-ink-400">{index + 1}</div>
                <div className="min-w-0 flex-1">
                  <p className="mono break-all text-[9.5px] leading-relaxed text-ink-300">{hop.url}</p>
                  <div className="mt-1 flex items-center gap-2 text-[8.5px] text-ink-500"><span>HTTP {hop.statusCode}</span>{hop.location && <span className="mono truncate">→ {truncateMiddle(hop.location, 50)}</span>}</div>
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
                <p className="text-[11px] text-ink-400">No HTTP redirect chain is available for this session. Browser sessions report the observed page URL directly.</p>
                <p className="mono mt-2 break-all text-[10px] text-ink-200">{detail.currentUrl}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'activity' && (
          <div className="max-h-[340px] space-y-0 overflow-y-auto pr-1">
            {logs.length ? [...logs].reverse().map((log, index) => (
              <div key={log.id} className="relative flex gap-3 pb-3 last:pb-0">
                {index < logs.length - 1 && <span className="absolute left-[11px] top-6 h-full w-px bg-white/[0.055]" />}
                <div className={cn('relative z-10 mt-1 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-md border bg-ink-900', log.level === 'error' ? 'border-coral/20 text-coral' : log.level === 'warn' ? 'border-amber/20 text-amber' : 'border-white/[0.06] text-ink-400')}>
                  {log.type === 'ai' ? <Bot size={10} /> : log.type === 'ad' ? <Sparkles size={10} /> : log.type === 'navigate' ? <Globe2 size={10} /> : <Activity size={10} />}
                </div>
                <div className="min-w-0 flex-1 rounded-lg border border-white/[0.04] bg-white/[0.012] px-2.5 py-2">
                  <p className="text-[10px] leading-relaxed text-ink-300">{log.message}</p>
                  <p className="mt-0.5 font-mono text-[8.5px] text-ink-600">{formatTime(log.at)} · {log.type}</p>
                </div>
              </div>
            )) : <p className="text-[11px] text-ink-500">No activity entries.</p>}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-mint/10 bg-mint/[0.035] p-3">
        <p className="text-[9.5px] leading-relaxed text-ink-400">No ad clicks, rewarded-control activation, or artificial traffic. Session snapshots are retained; browser profiles are discarded.</p>
        <button className="btn-secondary shrink-0 px-2.5 py-1.5 text-[10px]" onClick={() => void navigator.clipboard?.writeText(detail.id).then(() => notify('Session ID copied', 'success'))}>Copy ID</button>
      </div>
    </Modal>
  )
}

export default function SessionsPage() {
  const { revision, notify, refresh, globalSearch, setGlobalSearch, overview } = useApp()
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [sessions, setSessions] = useState<BrowserSession[]>([])
  const [url, setUrl] = useState('')
  const [count, setCount] = useState(5)
  const [engine, setEngine] = useState<'auto' | 'playwright' | 'http-analysis'>('auto')
  const [launching, setLaunching] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | SessionStatus>('all')
  const [detail, setDetail] = useState<BrowserSession | null>(null)
  const [busyAction, setBusyAction] = useState('')
  const [showLaunch, setShowLaunch] = useState(true)

  useEffect(() => {
    if (globalSearch) {
      setQuery(globalSearch)
      setGlobalSearch('')
    }
  }, [globalSearch, setGlobalSearch])

  const loadJobs = useCallback(async () => {
    try {
      const result = await api.jobs()
      setJobs(result.jobs)
      setSelectedJobId((current) => {
        if (current && result.jobs.some((job) => job.id === current)) return current
        const active = result.jobs.find((job) => ['running', 'paused', 'queued'].includes(job.status))
        return active?.id || result.jobs[0]?.id || ''
      })
    } catch {
      // The global API status banner covers connectivity failures.
    }
  }, [])

  const loadSessions = useCallback(async (jobId: string) => {
    if (!jobId) {
      setSessions([])
      return
    }
    try {
      const result = await api.sessions(jobId, 200)
      setSessions(result.sessions)
      setDetail((current) => current ? result.sessions.find((item) => item.id === current.id) || current : null)
    } catch {
      // Keep the current grid on transient failures.
    }
  }, [])

  useEffect(() => { void loadJobs() }, [loadJobs, revision])
  useEffect(() => { void loadSessions(selectedJobId) }, [selectedJobId, loadSessions, revision])

  const selectedJob = jobs.find((job) => job.id === selectedJobId)
  const filtered = useMemo(() => {
    const lower = query.toLowerCase().trim()
    return sessions.filter((session) => {
      const matchesQuery = !lower || `${session.currentUrl} ${session.finalUrl} ${session.finalDomain} ${session.status} ${session.ai?.summary || ''}`.toLowerCase().includes(lower)
      const matchesFilter = filter === 'all' || session.status === filter || (filter === 'error' && session.status === 'error')
      return matchesQuery && matchesFilter
    })
  }, [sessions, query, filter])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: sessions.length }
    for (const session of sessions) counts[session.status] = (counts[session.status] || 0) + 1
    return counts
  }, [sessions])

  const launch = async () => {
    if (!/^https?:\/\//i.test(url.trim())) {
      notify('Paste a valid HTTP or HTTPS URL first.', 'warn')
      return
    }
    setLaunching(true)
    try {
      const result = await api.createJob({ url: url.trim(), count, engine })
      setJobs((current) => [result.job, ...current])
      setSelectedJobId(result.job.id)
      setSessions(result.sessions)
      setUrl('')
      notify(`${count} isolated session${count === 1 ? '' : 's'} queued.`, 'success')
      await refresh()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not launch sessions', 'error')
    } finally {
      setLaunching(false)
    }
  }

  const jobAction = async (action: 'start' | 'pause' | 'resume' | 'stop') => {
    if (!selectedJob) return
    setBusyAction(action)
    try {
      await api.jobAction(selectedJob.id, action)
      notify(`Job ${action === 'stop' ? 'stopped' : `${action}d`}.`, action === 'stop' ? 'warn' : 'success')
      await loadJobs()
      await loadSessions(selectedJob.id)
      await refresh()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Action failed', 'error')
    } finally {
      setBusyAction('')
    }
  }

  const sessionAction = async (session: BrowserSession, action: 'pause' | 'resume' | 'stop') => {
    try {
      await api.sessionAction(session.id, action)
      notify(`Session ${action === 'stop' ? 'stopped' : `${action}d`}.`, action === 'stop' ? 'warn' : 'success')
      await loadSessions(session.jobId)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Action failed', 'error')
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Browser orchestration"
        title="Multi-window sessions"
        description="Run independent browser contexts or analysis workers, monitor live progress, and control every session from one grid."
        actions={
          <>
            <button className="btn-secondary" onClick={() => void loadJobs()}><RefreshCw size={13} />Refresh</button>
            <button className="btn-primary" onClick={() => setShowLaunch((value) => !value)}><Play size={12} fill="currentColor" />{showLaunch ? 'Hide launcher' : 'New session'}</button>
          </>
        }
      />

      {showLaunch && (
        <div className="panel mb-4 animate-fade-up p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
            <div className="flex-1">
              <SectionTitle title="Session launcher" description="Every session receives an isolated cookie jar, storage, cache, and worker assignment." />
              <div className="relative mt-3">
                <Link2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void launch()}
                  className="input-lg mono pl-10 text-[12.5px]"
                  placeholder="https://short.link/campaign-destination"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <p className="label mb-2">Sessions</p>
                <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-ink-950/55 p-1">
                  {countOptions.map((option) => (
                    <button key={option} onClick={() => setCount(option)} className={cn('rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all', count === option ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/25' : 'text-ink-400 hover:bg-white/[0.04]')}>
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="label mb-2">Engine</p>
                <div className="relative">
                  <select value={engine} onChange={(event) => setEngine(event.target.value as typeof engine)} className="input h-[38px] appearance-none py-1.5 pr-8 text-[11px]">
                    <option value="auto">Auto detect</option>
                    <option value="playwright">Playwright</option>
                    <option value="http-analysis">HTTP analysis</option>
                  </select>
                  <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500" />
                </div>
              </div>
              <button className="btn-primary h-[38px] px-4" onClick={() => void launch()} disabled={launching}>
                {launching ? <Spinner /> : <Play size={12} fill="currentColor" />}
                Launch {count}
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[9.5px] text-ink-500">
            <span className="flex items-center gap-1.5"><ShieldCheck size={10} className="text-mint" />No ad clicking</span>
            <span className="flex items-center gap-1.5"><Layers3 size={10} />Independent profiles</span>
            <span className="flex items-center gap-1.5"><MonitorDot size={10} />Concurrency cap {overview?.servers.limits.maxConcurrentBrowsers || 6}</span>
            <span className="flex items-center gap-1.5"><Bot size={10} />AI reports page evidence</span>
          </div>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="panel mb-4 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
              {jobs.slice(0, 8).map((job) => (
                <button key={job.id} onClick={() => setSelectedJobId(job.id)} className={cn('flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-all', selectedJobId === job.id ? 'border-violet-500/25 bg-violet-500/[0.08]' : 'border-white/[0.055] bg-white/[0.015] hover:bg-white/[0.035]')}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', job.status === 'running' ? 'bg-violet-400' : job.status === 'completed' ? 'bg-mint' : job.status === 'stopped' ? 'bg-ink-500' : job.status === 'paused' ? 'bg-amber' : 'bg-ink-400')} />
                  <span className="max-w-[150px] truncate text-[10.5px] text-ink-200">{domainOf(job.url) || job.id.slice(-6)}</span>
                  <span className="text-[9px] text-ink-600">{job.count}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button className="btn-secondary px-2.5 py-1.5 text-[10.5px]" onClick={() => void jobAction('start')} disabled={!!busyAction || !selectedJob}><Play size={10} />Start all</button>
              <button className="btn-secondary px-2.5 py-1.5 text-[10.5px]" onClick={() => void jobAction('pause')} disabled={!!busyAction || !selectedJob}><Pause size={10} />Pause all</button>
              <button className="btn-secondary px-2.5 py-1.5 text-[10.5px]" onClick={() => void jobAction('resume')} disabled={!!busyAction || !selectedJob}><RefreshCw size={10} />Resume all</button>
              <button className="btn-danger px-2.5 py-1.5 text-[10.5px]" onClick={() => void jobAction('stop')} disabled={!!busyAction || !selectedJob}><Square size={9} fill="currentColor" />Stop all</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {statusFilters.map((option) => (
            <button key={option.key} onClick={() => setFilter(option.key)} className={cn('rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors', filter === option.key ? 'border-violet-500/25 bg-violet-500/[0.09] text-violet-200' : 'border-white/[0.055] bg-white/[0.015] text-ink-400 hover:text-ink-200')}>
              {option.label}
              <span className="ml-1 text-[8.5px] text-ink-600">{statusCounts[option.key] || 0}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="input py-1.5 pl-8 text-[11px]" placeholder="Search sessions, domains, summaries…" />
          {query && <button className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-200" onClick={() => setQuery('')}><X size={11} /></button>}
        </div>
      </div>

      {sessions.length ? (
        filtered.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((session) => (
              <SessionCard key={session.id} session={session} onOpen={() => setDetail(session)} onAction={(action) => void sessionAction(session, action)} />
            ))}
          </div>
        ) : (
          <div className="panel">
            <EmptyState icon={<ListFilter size={20} />} title="No sessions match" description="Clear the search or choose another status filter." action={<button className="btn-secondary text-[11px]" onClick={() => { setQuery(''); setFilter('all') }}>Clear filters</button>} />
          </div>
        )
      ) : (
        <div className="panel">
          <EmptyState
            icon={<MonitorDot size={21} />}
            title="No sessions yet"
            description="Launch 1 to 100 independent sessions against a link. Each session gets a live status, redirect report, and AI summary."
            action={<button className="btn-primary text-[11px]" onClick={() => setShowLaunch(true)}><Play size={11} fill="currentColor" />Launch sessions</button>}
          />
        </div>
      )}

      <div className="mt-4">
        <InfoNote tone="amber" icon={<AlertCircle size={15} />}>
          <strong className="text-amber">Sessions are not visitors.</strong> LinkPilot opens browser contexts for authorized inspection. It does not generate artificial traffic, click ads, or activate rewarded-link controls. Analytics display verified clicks only when an authorized source supplies them.
        </InfoNote>
      </div>

      <SessionDetail
        session={detail}
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        onAction={(action) => {
          if (!detail) return
          void sessionAction(detail, action)
        }}
      />
    </>
  )
}
