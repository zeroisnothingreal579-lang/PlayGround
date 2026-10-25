import { useEffect, useMemo, useState } from 'react'
import {
  CirclePause,
  CirclePlay,
  CircleStop,
  Download,
  Link2,
  Loader2,
  MonitorPlay,
  Play,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { SessionCard } from '../components/SessionCard'
import { SessionDrawer } from '../components/SessionDrawer'
import { EmptyState, ProgressBar, SectionHeader } from '../components/ui'
import { useApp } from '../lib/AppContext'
import { exportUrl } from '../lib/api'
import {
  cn,
  formatDate,
  isActiveStatus,
  runProgress,
  shortUrl,
} from '../lib/utils'
import type { BrowserSession, RunStatus, ViewId } from '../types'

type SessionFilter = 'all' | 'active' | 'complete' | 'blocked' | 'error' | 'queued'

function runTone(status: RunStatus): string {
  switch (status) {
    case 'running': return 'border-violet-400/20 bg-violet-400/10 text-violet-300'
    case 'complete': return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
    case 'paused': return 'border-sky-400/20 bg-sky-400/10 text-sky-300'
    case 'error': return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
    case 'stopped': return 'border-slate-400/20 bg-slate-400/10 text-slate-400'
    default: return 'border-white/10 bg-white/5 text-slate-400'
  }
}

export function SessionsPage({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { runs, selectedRun, selectedRunId, selectRun, runAction, sessionAction, notifyError } = useApp()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<SessionFilter>('all')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    setSelectedSessionId(null)
    setSearch('')
    setFilter('all')
  }, [selectedRunId])

  const sessions = selectedRun?.sessions || []
  const counts = useMemo(() => {
    return {
      all: sessions.length,
      active: sessions.filter((session) => isActiveStatus(session.status)).length,
      complete: sessions.filter((session) => session.status === 'complete').length,
      blocked: sessions.filter((session) => session.status === 'blocked').length,
      error: sessions.filter((session) => session.status === 'error').length,
      queued: sessions.filter((session) => session.status === 'queued' || session.status === 'paused').length,
    }
  }, [sessions])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return sessions.filter((session) => {
      if (term && !`${session.index} ${session.status} ${session.inputUrl} ${session.currentUrl} ${session.finalDomain}`.toLowerCase().includes(term)) return false
      if (filter === 'active') return isActiveStatus(session.status)
      if (filter === 'queued') return session.status === 'queued' || session.status === 'paused'
      return filter === 'all' || session.status === filter
    })
  }, [sessions, search, filter])

  const selectedSession = selectedSessionId
    ? sessions.find((session) => session.id === selectedSessionId) || null
    : null

  const actRun = async (action: 'start' | 'pause' | 'resume' | 'stop') => {
    if (!selectedRun) return
    setBusy(action)
    try {
      await runAction(selectedRun.id, action)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy(null)
    }
  }

  const actSession = async (session: BrowserSession, action: 'start' | 'pause' | 'resume' | 'stop') => {
    if (!selectedRun) return
    setBusy(session.id)
    try {
      await sessionAction(selectedRun.id, session.id, action)
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy(null)
    }
  }

  const progress = selectedRun ? runProgress(selectedRun) : 0
  const activeCount = selectedRun?.sessions.filter((session) => isActiveStatus(session.status)).length || 0

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Isolated browser contexts"
        title="Session grid"
        description="Watch every probe live, inspect page evidence and control individual sessions. Each session uses a clean context and a timestamped log."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <a href={exportUrl('runs')} className="btn-ghost text-[11px]">
              <Download className="h-3.5 w-3.5" /> Export
            </a>
            <button type="button" onClick={() => onNavigate('inspector')} className="btn-primary text-[11px]">
              <Plus className="h-3.5 w-3.5" /> New probe
            </button>
          </div>
        }
      />

      {runs.length > 0 && (
        <div className="panel flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Active run</span>
            <select
              value={selectedRunId || ''}
              onChange={(event) => selectRun(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-white/[0.07] bg-ink-900 px-2.5 py-1.5 text-[11px] text-slate-300 outline-none sm:max-w-md"
            >
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {shortUrl(run.inputUrl, 55)} · {run.sessionCount} sessions · {run.status}
                </option>
              ))}
            </select>
          </div>
          {selectedRun && (
            <div className="flex items-center gap-2 text-[10px] text-slate-600">
              <span>{formatDate(selectedRun.createdAt)}</span>
              <span className={cn('chip', runTone(selectedRun.status))}>
                <span className={cn('h-1.5 w-1.5 rounded-full', selectedRun.status === 'running' ? 'animate-pulse bg-violet-400' : 'bg-current opacity-70')} />
                {selectedRun.status}
              </span>
            </div>
          )}
        </div>
      )}

      {!selectedRun ? (
        <section className="panel">
          <EmptyState
            icon={<MonitorPlay className="h-6 w-6" />}
            title="No browser sessions yet"
            description="Run a URL from the inspector or overview to launch isolated browser contexts. Live screenshots, activity logs and ad observations will appear here."
            action={
              <button type="button" onClick={() => onNavigate('inspector')} className="btn-primary text-[11px]">
                <Link2 className="h-3.5 w-3.5" /> Inspect a URL
              </button>
            }
          />
        </section>
      ) : (
        <>
          <section className="panel relative overflow-hidden p-4 sm:p-5">
            <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-violet-600/10 blur-3xl" />
            <div className="relative flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('chip', runTone(selectedRun.status))}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', selectedRun.status === 'running' ? 'animate-pulse bg-violet-400' : 'bg-current opacity-70')} />
                      {selectedRun.status}
                    </span>
                    <span className="chip border-white/[0.07] bg-white/[0.02] text-slate-500">{selectedRun.sessionCount} sessions</span>
                    <span className="chip border-white/[0.07] bg-white/[0.02] text-slate-500">{activeCount} active</span>
                    <span className="chip border-white/[0.07] bg-white/[0.02] text-slate-500">{selectedRun.adCount} ads observed</span>
                  </div>
                  <p className="mt-2 max-w-2xl truncate text-sm font-semibold text-slate-200">{selectedRun.inputUrl}</p>
                  <p className="mt-0.5 text-[10px] text-slate-600">
                    {selectedRun.sessionCount ? `${selectedRun.completedCount}/${selectedRun.sessionCount} finished` : 'Waiting'}
                    {' · '}{selectedRun.errorCount} errors · started {formatDate(selectedRun.startedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" disabled={busy !== null || selectedRun.status === 'running' || selectedRun.status === 'paused'} onClick={() => void actRun('start')} className="btn-ghost !px-2.5 !py-2 text-[10px]">
                    {busy === 'start' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Start all
                  </button>
                  <button type="button" disabled={busy !== null || selectedRun.status !== 'running'} onClick={() => void actRun('pause')} className="btn-ghost !px-2.5 !py-2 text-[10px]">
                    {busy === 'pause' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CirclePause className="h-3.5 w-3.5" />} Pause all
                  </button>
                  <button type="button" disabled={busy !== null || selectedRun.status !== 'paused'} onClick={() => void actRun('resume')} className="btn-ghost !px-2.5 !py-2 text-[10px]">
                    {busy === 'resume' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CirclePlay className="h-3.5 w-3.5" />} Resume all
                  </button>
                  <button type="button" disabled={busy !== null || selectedRun.status === 'stopped' || selectedRun.status === 'complete'} onClick={() => void actRun('stop')} className="btn-danger !px-2.5 !py-2 text-[10px]">
                    {busy === 'stop' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleStop className="h-3.5 w-3.5" />} Stop all
                  </button>
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[10px] text-slate-600">
                  <span className="flex items-center gap-2">
                    <MonitorPlay className="h-3 w-3" /> Grid completion
                    <span className="text-slate-700">·</span>
                    {counts.complete} complete · {counts.blocked} blocked · {counts.error} errors
                  </span>
                  <span>{progress}%</span>
                </div>
                <ProgressBar value={progress} />
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {([
                ['all', 'All'],
                ['active', 'Live'],
                ['complete', 'Complete'],
                ['blocked', 'Blocked'],
                ['error', 'Errors'],
                ['queued', 'Queued'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={cn(
                    'rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition',
                    filter === value
                      ? 'border-violet-500/25 bg-violet-500/10 text-violet-200'
                      : 'border-white/[0.06] bg-white/[0.015] text-slate-600 hover:text-slate-400',
                  )}
                >
                  {label}
                  <span className="ml-1.5 text-[9px] opacity-60">{counts[value]}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 sm:flex-none">
                <Search className="h-3 w-3 text-slate-600" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sessions" className="h-8 w-full bg-transparent text-[11px] text-slate-300 outline-none placeholder:text-slate-700 sm:w-44" />
              </div>
              <span className="flex items-center gap-1 text-[9px] text-slate-700">
                <SlidersHorizontal className="h-3 w-3" /> {filtered.length}/{sessions.length}
              </span>
            </div>
          </div>

          {filtered.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onOpen={() => setSelectedSessionId(session.id)}
                  onAction={(action) => void actSession(session, action)}
                />
              ))}
            </div>
          ) : (
            <section className="panel">
              <EmptyState
                icon={<Search className="h-5 w-5" />}
                title="No sessions match this filter"
                description="Adjust the search term or choose another status category."
                action={<button type="button" onClick={() => { setFilter('all'); setSearch('') }} className="btn-ghost text-[11px]"><RotateCcw className="h-3.5 w-3.5" /> Reset filters</button>}
              />
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.012] px-4 py-3">
            <p className="text-[10px] text-slate-600">
              Browser probes are not human visitors. Sessions never click ads, solve CAPTCHAs or interact with rewarded-link steps.
            </p>
            <a href={exportUrl('runs')} className="flex items-center gap-1 text-[10px] font-semibold text-violet-300 hover:text-violet-200">
              Download session CSV <Download className="h-3 w-3" />
            </a>
          </div>
        </>
      )}

      <SessionDrawer
        session={selectedSession}
        run={selectedRun}
        onClose={() => setSelectedSessionId(null)}
        onAction={(session, action) => void actSession(session, action)}
      />
    </div>
  )
}
