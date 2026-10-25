import { useMemo, useState, type FormEvent } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Globe2,
  Layers3,
  Link2,
  Loader2,
  Megaphone,
  Radar,
  Server,
  ShieldCheck,
  Sparkles,
  Waypoints,
  Zap,
} from 'lucide-react'
import { useApp } from '../lib/AppContext'
import {
  cn,
  deriveActivity,
  formatCurrency,
  formatNumber,
  relativeTime,
  runProgress,
  shortUrl,
} from '../lib/utils'
import type { Run, RunStatus, ViewId } from '../types'
import { EmptyState, ProgressBar, SectionHeader, StatCard } from '../components/ui'

const SESSION_COUNTS = [1, 5, 10, 20, 50, 100]

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

function RunRow({ run, onOpen }: { run: Run; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 border-b border-white/[0.04] px-4 py-3.5 text-left transition last:border-0 hover:bg-white/[0.025] sm:px-5"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.02] text-violet-300">
        <Layers3 className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-xs font-semibold text-slate-200">{shortUrl(run.inputUrl, 60)}</p>
          <span className={cn('chip hidden shrink-0 sm:inline-flex', runTone(run.status))}>
            <span className={cn('h-1.5 w-1.5 rounded-full', run.status === 'running' ? 'animate-pulse bg-violet-400' : 'bg-current opacity-70')} />
            {run.status}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-2 text-[10px] text-slate-600">
          <span>{run.sessionCount} sessions</span>
          <span className="h-0.5 w-0.5 rounded-full bg-slate-700" />
          <span>{run.adCount} ads observed</span>
          <span className="h-0.5 w-0.5 rounded-full bg-slate-700" />
          <span>{relativeTime(run.createdAt)}</span>
        </p>
      </div>
      <div className="hidden w-24 shrink-0 sm:block">
        <ProgressBar value={runProgress(run)} />
        <p className="mt-1 text-right text-[9px] text-slate-600">{run.completedCount}/{run.sessionCount}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
    </button>
  )
}

export function OverviewPage({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { analytics, runs, servers, launchRun, notifyError, config, connected, selectRun } = useApp()
  const [url, setUrl] = useState('')
  const [count, setCount] = useState(5)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activity = useMemo(() => deriveActivity(runs), [runs])
  const running = runs.find((run) => run.status === 'running') || runs.find((run) => run.status === 'paused')
  const history = analytics?.history.map((point) => point.navigations) || []
  const local = servers[0]

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!url.trim()) {
      setError('Enter a URL to inspect.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await launchRun(url.trim(), count)
      setUrl('')
      onNavigate('sessions')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to launch this probe.')
      notifyError(err)
    } finally {
      setLoading(false)
    }
  }

  const openRun = (run: Run) => {
    selectRun(run.id)
    onNavigate('sessions')
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Multi-window orchestration"
        title="See the whole journey. From short link to final page."
        description="Inspect redirect chains, observe advertising placements and orchestrate isolated browser probes from one evidence-first control center."
        action={
          <div className="hidden items-center gap-2 sm:flex">
            <span className="chip border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-300">
              <ShieldCheck className="h-3 w-3" /> Passive only
            </span>
            <span className="chip border-white/[0.07] bg-white/[0.025] text-slate-400">
              <Radar className="h-3 w-3" /> {connected ? 'Live telemetry' : 'Polling'}
            </span>
          </div>
        }
      />

      <section className="awwwards-border relative overflow-hidden rounded-3xl bg-ink-850/80 p-5 shadow-glow sm:p-7 lg:p-8">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_72%)]" />
        <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-violet-600/20 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-fuchsia-600/[0.07] blur-[90px]" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip border-violet-400/20 bg-violet-400/[0.08] text-violet-200">
              <Sparkles className="h-3 w-3" /> AI page agent
            </span>
            <span className="chip border-white/[0.07] bg-white/[0.025] text-slate-400">
              <Waypoints className="h-3 w-3" /> Redirect intelligence
            </span>
            <span className="chip border-white/[0.07] bg-white/[0.025] text-slate-400">
              <Megaphone className="h-3 w-3" /> Ad observations
            </span>
          </div>
          <h2 className="mt-5 max-w-3xl text-[30px] font-semibold leading-[1.12] tracking-tight sm:text-[38px]">
            Paste one link.
            <span className="text-gradient"> Launch up to 100 isolated probes.</span>
          </h2>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-slate-500">
            Every session gets a clean browser context, timestamped activity log and a destination report.
            Probe traffic is never counted as a human visitor, click, impression or payout.
          </p>

          <form onSubmit={submit} className="mt-6">
            <div className="rounded-2xl border border-white/[0.08] bg-ink-900/85 p-2 shadow-2xl backdrop-blur-xl">
              <div className="flex flex-col gap-2 lg:flex-row">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-white/[0.02] px-3">
                  <Link2 className="h-4 w-4 shrink-0 text-slate-600" />
                  <input
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value)
                      setError(null)
                    }}
                    placeholder="https://short.link/example — paste any HTTP or HTTPS URL"
                    className="h-11 w-full min-w-0 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
                    aria-label="URL to inspect"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                  {url && (
                    <button type="button" onClick={() => setUrl('')} className="text-[10px] text-slate-600 hover:text-slate-300">
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl bg-white/[0.015] p-1.5 lg:overflow-visible">
                  {SESSION_COUNTS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCount(value)}
                      className={cn(
                        'h-8 min-w-9 rounded-lg px-2 text-[11px] font-semibold transition',
                        count === value ? 'bg-violet-500 text-white shadow-lg shadow-violet-950/40' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200',
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <button type="submit" disabled={loading} className="btn-primary h-11 shrink-0 !px-5">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {loading ? 'Resolving…' : 'Launch probes'}
                </button>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-[10px] text-slate-600">
                {config?.maxSessionsPerRun ?? 100} sessions max · {config?.maxConcurrentSessions ?? 3} concurrent browser slots · {config?.automationEnabled ? 'Playwright enabled' : 'static inspection mode'}
              </p>
              <button type="button" onClick={() => onNavigate('inspector')} className="flex items-center gap-1 text-[10px] font-semibold text-violet-300 transition hover:text-violet-200">
                Analyze without launching <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {error && <p className="mt-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-3 py-2 text-xs text-rose-300">{error}</p>}
          </form>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Test navigations"
          value={formatNumber(analytics?.probes ?? 0)}
          sub="Browser probes, not human visitors"
          icon={<Activity className="h-4 w-4" />}
          data={history}
          tone="violet"
          onClick={() => onNavigate('sessions')}
        />
        <StatCard
          label="Redirect success"
          value={analytics ? `${analytics.redirectSuccessRate}%` : '—'}
          sub={`${formatNumber(analytics?.blockedPages ?? 0)} blocked or verified challenges`}
          icon={<Waypoints className="h-4 w-4" />}
          tone="emerald"
          onClick={() => onNavigate('analytics')}
        />
        <StatCard
          label="Ads observed"
          value={formatNumber(analytics?.adObservations ?? 0)}
          sub="Placements observed — never verified impressions"
          icon={<Megaphone className="h-4 w-4" />}
          tone="amber"
          onClick={() => onNavigate('ads')}
        />
        <StatCard
          label="Verified earnings"
          value={formatCurrency(analytics?.verifiedEarnings, analytics?.verifiedCurrency)}
          
          sub={analytics?.verifiedSource ? `Supplied by ${analytics.verifiedSource}` : 'No authorized analytics source connected'}
          icon={<CircleDollarSign className="h-4 w-4" />}
          tone="sky"
          onClick={() => onNavigate('analytics')}
        />
      </div>

      {running && (
        <section className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-300">
              <Radar className="h-5 w-5" />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-violet-400/60" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300/80">
                {running.status === 'paused' ? 'Paused run' : 'Live run'}
              </p>
              <p className="mt-0.5 max-w-md truncate text-sm font-semibold text-white">{shortUrl(running.inputUrl, 80)}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-3 sm:justify-end">
            <div className="w-full max-w-[220px]">
              <div className="mb-1.5 flex justify-between text-[10px] text-slate-500">
                <span>{running.completedCount}/{running.sessionCount} complete</span>
                <span>{runProgress(running)}%</span>
              </div>
              <ProgressBar value={runProgress(running)} />
            </div>
            <button type="button" onClick={() => openRun(running)} className="btn-ghost shrink-0 !px-3 !py-2 text-[11px]">
              Open grid <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Recent runs</h3>
              <p className="mt-0.5 text-[10px] text-slate-600">Latest URL probe batches</p>
            </div>
            <button type="button" onClick={() => onNavigate('sessions')} className="text-[10px] font-semibold text-violet-300 hover:text-violet-200">
              View all
            </button>
          </div>
          {runs.length ? (
            <div>{runs.slice(0, 6).map((run) => <RunRow key={run.id} run={run} onOpen={() => openRun(run)} />)}</div>
          ) : (
            <EmptyState
              compact
              icon={<Link2 className="h-5 w-5" />}
              title="No probe runs yet"
              description="Paste a URL above to resolve its redirect chain and launch isolated browser sessions."
            />
          )}
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Activity stream</h3>
              <p className="mt-0.5 text-[10px] text-slate-600">Timestamped operator + agent events</p>
            </div>
            <span className={cn('h-2 w-2 rounded-full', connected ? 'animate-pulse bg-emerald-400' : 'bg-amber-400')} />
          </div>
          {activity.length ? (
            <div className="max-h-[376px] overflow-y-auto">
              {activity.slice(0, 12).map((entry) => (
                <div key={entry.id} className="flex gap-3 border-b border-white/[0.035] px-5 py-3 last:border-0">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02]">
                    {entry.kind === 'safety' ? <ShieldCheck className="h-3 w-3 text-emerald-300" /> : entry.kind === 'analysis' ? <BarChart3 className="h-3 w-3 text-fuchsia-300" /> : <Clock3 className="h-3 w-3 text-violet-300" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-400">{entry.message}</p>
                    <p className="mt-0.5 text-[9px] text-slate-700">{relativeTime(entry.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              icon={<Activity className="h-5 w-5" />}
              title="Activity will appear here"
              description="Redirect hops, ad scans, AI summaries and safety boundaries are logged with timestamps."
            />
          )}
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <button type="button" onClick={() => onNavigate('servers')} className="panel panel-hover group p-5 text-left">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/15 bg-sky-500/[0.07] text-sky-300">
                <Server className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-200">Worker health</p>
                <p className="text-[10px] text-slate-600">{local ? `${local.region} · ${local.connection}` : 'No worker telemetry'}</p>
              </div>
            </div>
            <span className="chip border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {local?.status || 'unknown'}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between text-[9px] text-slate-600"><span>CPU</span><span>{local?.cpuPercent ?? 0}%</span></div>
              <ProgressBar className="mt-1.5" value={local?.cpuPercent ?? 0} tone={(local?.cpuPercent ?? 0) > 80 ? 'rose' : 'violet'} />
            </div>
            <div>
              <div className="flex items-center justify-between text-[9px] text-slate-600"><span>Memory</span><span>{local?.memoryPercent ?? 0}%</span></div>
              <ProgressBar className="mt-1.5" value={local?.memoryPercent ?? 0} tone={(local?.memoryPercent ?? 0) > 85 ? 'amber' : 'emerald'} />
            </div>
          </div>
        </button>

        <button type="button" onClick={() => onNavigate('inspector')} className="panel panel-hover group p-5 text-left">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/15 bg-violet-500/[0.07] text-violet-300">
                <Globe2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-200">Destination intel</p>
                <p className="text-[10px] text-slate-600">Redirect chains, loops, CAPTCHA signals</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
          </div>
          <div className="mt-4 flex items-center gap-4 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400" /> {analytics?.uniqueDestinations ?? 0} destinations</span>
            <span className="flex items-center gap-1.5"><BarChart3 className="h-3 w-3 text-violet-400" /> {analytics?.averageLoadMs ? `${analytics.averageLoadMs}ms avg` : 'awaiting data'}</span>
          </div>
        </button>

        <div className="panel p-5 md:col-span-2 xl:col-span-1">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/15 bg-amber-500/[0.07] text-amber-300">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-200">Automation boundary</p>
                <p className="text-[10px] text-slate-600">What LinkPilot will not do</p>
              </div>
            </div>
            <span className="chip border-white/[0.07] bg-white/[0.02] text-slate-500">Enforced</span>
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            No automated ad clicks, CAPTCHA solving, rewarded-link bypass or artificial traffic. Advertising evidence is an observation, not a verified impression.
          </p>
          <button type="button" onClick={() => onNavigate('settings')} className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-violet-300 hover:text-violet-200">
            Review boundaries <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
