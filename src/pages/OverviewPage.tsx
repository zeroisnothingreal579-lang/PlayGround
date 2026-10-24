import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Cpu,
  Database,
  Globe2,
  Link2,
  MemoryStick,
  MonitorDot,
  MousePointerClick,
  Play,
  Radio,
  ScanLine,
  Server,
  ShieldCheck,
  Sparkles,
  Wifi,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../lib/api'
import { cn, domainOf, formatNumber, timeAgo, truncateMiddle } from '../lib/utils'
import { useApp } from '../context/AppContext'
import { EmptyState, InfoNote, PageHeader, ProgressBar, SectionTitle, Spinner, StatCard, StatusPill } from '../components/ui'

const counts = [1, 5, 10, 20, 50, 100]

function QuickLaunch() {
  const { overview, navigate, notify, refresh } = useApp()
  const [url, setUrl] = useState('')
  const [count, setCount] = useState(5)
  const [busy, setBusy] = useState(false)

  const launch = async () => {
    if (!/^https?:\/\//i.test(url.trim())) {
      notify('Paste a valid HTTP or HTTPS URL first.', 'warn')
      return
    }
    setBusy(true)
    try {
      await api.createJob({ url: url.trim(), count, engine: 'auto' })
      notify(`${count} analysis session${count === 1 ? '' : 's'} queued.`, 'success')
      setUrl('')
      navigate('sessions')
      await refresh()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not start sessions', 'error')
    } finally {
      setBusy(false)
    }
  }

  const automation = overview?.health.automation === 'playwright'

  return (
    <div className="panel overflow-hidden">
      <div className="glow-orb -right-12 -top-24 h-64 w-64 bg-violet-600/20" />
      <div className="relative p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-md">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                <Zap size={13} />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">Quick launch</span>
              <span className={cn('ml-1 h-1.5 w-1.5 rounded-full', automation ? 'bg-mint' : 'bg-amber')} />
              <span className="text-[10px] text-ink-500">{automation ? 'Playwright ready' : 'HTTP analysis mode'}</span>
            </div>
            <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-white sm:text-[20px]">Launch isolated browser sessions</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">
              Paste a short link or redirect URL. LinkPilot resolves the chain, opens independent contexts, and reports the destination.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => navigate('inspector')}>
              <ScanLine size={14} />
              Inspect first
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Link2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void launch()}
              placeholder="https://short.link/your-destination"
              className="input-lg mono pl-10 pr-20 text-[13px]"
              aria-label="URL to open in sessions"
            />
            <span className="absolute right-3 top-1/2 hidden -translate-y-1/2 text-[9.5px] uppercase tracking-[0.1em] text-ink-600 sm:block">analysis only</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-1 flex-wrap items-center gap-1 rounded-xl border border-white/[0.06] bg-ink-950/55 p-1">
              {counts.map((option) => (
                <button
                  key={option}
                  onClick={() => setCount(option)}
                  className={cn(
                    'min-w-9 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all',
                    count === option ? 'bg-violet-500/20 text-violet-200 shadow-[inset_0_0_0_1px_rgba(129,71,255,.25)]' : 'text-ink-400 hover:bg-white/[0.04] hover:text-ink-200',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <button className="btn-primary h-[38px] w-full shrink-0 justify-center px-4 sm:w-auto" onClick={() => void launch()} disabled={busy}>
              {busy ? <Spinner /> : <Play size={13} fill="currentColor" />}
              Launch
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ActivityChart() {
  const { overview } = useApp()
  const series = overview?.analytics.series || []
  const hasData = series.some((point) => point.sessions > 0 || point.inspections > 0 || point.ads > 0)
  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle title="Operational activity" description="Sessions, inspections, and advertising detections across the selected window." />
        <div className="flex items-center gap-3 text-[10px] text-ink-400">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" />Sessions</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sky" />Inspections</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber" />Ads detected</span>
        </div>
      </div>
      <div className="relative mt-4 h-[210px] w-full sm:h-[240px]">
        {!hasData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="rounded-xl border border-white/[0.06] bg-ink-900/80 px-4 py-3 text-center backdrop-blur">
              <p className="text-[11.5px] font-medium text-ink-200">No operational data yet</p>
              <p className="mt-1 text-[10.5px] text-ink-500">Run an inspection or launch a session to populate this chart.</p>
            </div>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="sessionsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8147ff" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#8147ff" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="inspectionsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6bc7ff" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#6bc7ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,.045)" strokeDasharray="3 6" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#5d5d78', fontSize: 9.5 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#5d5d78', fontSize: 9.5 }} allowDecimals={false} />
            <Tooltip
              cursor={{ stroke: 'rgba(255,255,255,.1)' }}
              contentStyle={{ background: '#12121c', border: '1px solid rgba(255,255,255,.09)', borderRadius: 12, fontSize: 11, color: '#e6e6f0', boxShadow: '0 16px 50px -20px rgba(0,0,0,.8)' }}
              labelStyle={{ color: '#8b8ba6', marginBottom: 4 }}
            />
            <Area type="monotone" dataKey="sessions" stroke="#9c75ff" strokeWidth={2} fill="url(#sessionsFill)" dot={false} activeDot={{ r: 3, fill: '#9c75ff', strokeWidth: 0 }} />
            <Area type="monotone" dataKey="inspections" stroke="#6bc7ff" strokeWidth={1.5} fill="url(#inspectionsFill)" dot={false} />
            <Area type="monotone" dataKey="ads" stroke="#f6c768" strokeWidth={1.5} fill="transparent" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function WorkerHealth() {
  const { overview, navigate } = useApp()
  const worker = overview?.servers.servers[0]
  return (
    <div className="panel p-4 sm:p-5">
      <SectionTitle
        title="Worker health"
        description="Isolated execution environment"
        action={<button className="icon-btn h-7 w-7" onClick={() => navigate('servers')} aria-label="Open servers"><ArrowUpRight size={13} /></button>}
      />
      {worker ? (
        <>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.055] bg-white/[0.02] p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint/10 text-mint"><Server size={15} /></div>
              <div>
                <p className="text-[11.5px] font-medium text-ink-100">{worker.name}</p>
                <p className="text-[9.5px] uppercase tracking-[0.08em] text-ink-500">{worker.region}</p>
              </div>
            </div>
            <StatusPill status="online" />
          </div>
          <div className="mt-4 space-y-3.5">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[10.5px]"><span className="flex items-center gap-1.5 text-ink-400"><Cpu size={11} />CPU</span><span className="mono text-ink-200">{worker.cpuPercent}%</span></div>
              <ProgressBar value={worker.cpuPercent} tone={worker.cpuPercent > 75 ? 'coral' : 'violet'} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[10.5px]"><span className="flex items-center gap-1.5 text-ink-400"><MemoryStick size={11} />Memory</span><span className="mono text-ink-200">{worker.memoryUsedGb} / {worker.memoryTotalGb} GB</span></div>
              <ProgressBar value={worker.memoryPercent} tone={worker.memoryPercent > 80 ? 'coral' : 'violet'} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[10.5px]"><span className="flex items-center gap-1.5 text-ink-400"><MonitorDot size={11} />Sessions</span><span className="mono text-ink-200">{worker.activeSessions} active · {worker.queuedSessions} queued</span></div>
              <ProgressBar value={(worker.activeSessions / Math.max(1, worker.maxSessions)) * 100} tone="mint" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/[0.05] bg-white/[0.018] p-2.5">
              <p className="text-[9px] uppercase tracking-[0.1em] text-ink-500">Bandwidth</p>
              <p className="mt-1 text-[12px] font-medium text-ink-100">{formatNumber(worker.bandwidthKbps)} <span className="text-[9px] text-ink-500">Kbps</span></p>
            </div>
            <div className="rounded-lg border border-white/[0.05] bg-white/[0.018] p-2.5">
              <p className="text-[9px] uppercase tracking-[0.1em] text-ink-500">Concurrency</p>
              <p className="mt-1 text-[12px] font-medium text-ink-100">{overview?.servers.limits.maxConcurrentBrowsers} <span className="text-[9px] text-ink-500">contexts</span></p>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-8 text-center text-[11px] text-ink-500">Waiting for worker telemetry…</p>
      )}
    </div>
  )
}

function RecentSessions() {
  const { overview, navigate } = useApp()
  const sessions = overview?.activeSessions || []
  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle title="Live sessions" description="Recently created browser contexts and analysis workers." />
        <button className="btn-ghost px-2 py-1 text-[11px]" onClick={() => navigate('sessions')}>View all <ArrowRight size={12} /></button>
      </div>
      {sessions.length ? (
        <div className="mt-3 overflow-hidden">
          {sessions.slice(0, 5).map((session) => (
            <button key={session.id} onClick={() => navigate('sessions')} className="flex w-full items-center gap-3 border-b border-white/[0.045] py-3 text-left last:border-0 hover:bg-white/[0.015]">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.06] bg-ink-900">
                {session.previewAvailable ? <img src={`/api/sessions/${session.id}/preview`} alt="" className="h-full w-full object-cover" /> : <Globe2 size={15} className="text-ink-500" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] font-medium text-ink-200">{session.finalDomain || domainOf(session.currentUrl)}</p>
                <p className="mono mt-0.5 truncate text-[9.5px] text-ink-500">{truncateMiddle(session.currentUrl, 60)}</p>
              </div>
              <div className="hidden text-right sm:block">
                <StatusPill status={session.status} />
                <p className="mt-0.5 text-[9px] text-ink-600">{timeAgo(session.createdAt)}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState compact icon={<MonitorDot size={20} />} title="No sessions in flight" description="Launch a URL above to see live session cards, redirect results, and AI summaries." />
      )}
    </div>
  )
}

function ActivityFeed() {
  const { overview, navigate } = useApp()
  const events = overview?.activity || []
  const icons: Record<string, typeof Activity> = { inspection: ScanLine, session: MonitorDot, ad: Sparkles, control: Radio, integration: Database, system: Server }
  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle title="Activity stream" description="Timestamped, workspace-wide events." />
        <button className="btn-ghost px-2 py-1 text-[11px]" onClick={() => navigate('activity')}>Open log <ArrowRight size={12} /></button>
      </div>
      {events.length ? (
        <div className="relative mt-4 space-y-4 before:absolute before:bottom-1 before:left-[13px] before:top-2 before:w-px before:bg-white/[0.06]">
          {events.slice(0, 6).map((event) => {
            const Icon = icons[event.type] || Activity
            return (
              <div key={event.id} className="relative flex gap-3">
                <div className={cn('relative z-10 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-lg border bg-ink-900', event.level === 'error' ? 'border-coral/20 text-coral' : event.level === 'warn' ? 'border-amber/20 text-amber' : event.level === 'success' ? 'border-mint/20 text-mint' : 'border-white/[0.07] text-ink-400')}>
                  <Icon size={12} />
                </div>
                <div className="min-w-0 pt-0.5">
                  <p className="truncate text-[11px] font-medium text-ink-200">{event.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-ink-500">{event.detail}</p>
                  <p className="mt-1 text-[9px] text-ink-600">{timeAgo(event.at)}</p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-white/[0.07] px-4 py-8 text-center">
          <Activity size={18} className="mx-auto text-ink-600" />
          <p className="mt-2 text-[11px] text-ink-500">Events will appear as you inspect and launch links.</p>
        </div>
      )}
    </div>
  )
}

export default function OverviewPage() {
  const { overview, loading, navigate } = useApp()
  const totals = overview?.analytics.totals
  const verified = (totals?.verifiedClicks || 0) + (totals?.verifiedImpressions || 0)
  const capabilities = overview?.health
  return (
    <>
      <PageHeader
        eyebrow="Command center"
        title="Link operations, under control."
        description="Inspect redirect chains, orchestrate isolated browser sessions, and analyse advertising from one policy-safe workspace."
        actions={
          <>
            <button className="btn-secondary" onClick={() => navigate('analytics')}>
              <Activity size={14} />
              View analytics
            </button>
            <button className="btn-primary" onClick={() => navigate('sessions')}>
              <Play size={13} fill="currentColor" />
              New session
            </button>
          </>
        }
      />

      <div className="mb-4 animate-fade-up">
        <InfoNote tone="mint" icon={<ShieldCheck size={15} />}>
          <strong className="font-semibold text-mint">Analysis-only enforcement is on.</strong> LinkPilot never clicks advertising, bypasses rewarded-link steps, rotates IPs to simulate people, or reports browser sessions as human visitors.
        </InfoNote>
      </div>

      <div className="mb-4 animate-fade-up"><QuickLaunch /></div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard
          label="Active sessions"
          value={loading ? '—' : formatNumber(totals?.running || 0)}
          icon={<MonitorDot size={18} />}
          accent="violet"
          sub={<>of {overview?.servers.limits.maxSessions || 100} session capacity</>}
          badge={totals?.running ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" /> : undefined}
        />
        <StatCard
          label="Redirect success"
          value={loading ? '—' : `${totals?.redirectSuccessRate || 0}%`}
          icon={<Link2 size={18} />}
          accent="mint"
          sub={<>{formatNumber(totals?.inspections || 0)} inspected links</>}
        />
        <StatCard
          label="Ads detected"
          value={loading ? '—' : formatNumber(totals?.adDetections || 0)}
          icon={<Sparkles size={18} />}
          accent="amber"
          sub={<>detection only · not impressions</>}
        />
        <StatCard
          label="Verified clicks"
          value={loading ? '—' : formatNumber(verified)}
          icon={<MousePointerClick size={18} />}
          accent="sky"
          badge={<span className="chip px-1.5 py-0.5 text-[9px]">{verified ? 'verified' : 'no integration'}</span>}
          sub={<>reported by authorized sources</>}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <ActivityChart />
        <WorkerHealth />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
        <RecentSessions />
        <ActivityFeed />
      </div>

      <div className="panel p-4 sm:p-5">
        <SectionTitle title="Capability snapshot" description="Live service status for this workspace." />
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: 'Database', value: capabilities?.database || '...', icon: Database, tone: 'violet' },
            { label: 'Automation', value: capabilities?.automation === 'playwright' ? 'Playwright' : 'HTTP analysis', icon: MonitorDot, tone: 'mint' },
            { label: 'AI agent', value: capabilities?.ai === 'language-model' ? 'Model API' : 'Heuristics', icon: Sparkles, tone: 'amber' },
            { label: 'Analytics', value: capabilities?.analytics === 'connected' ? 'Connected' : 'Not connected', icon: Activity, tone: 'sky' },
            { label: 'WebSocket', value: 'Live', icon: Wifi, tone: 'mint' },
            { label: 'Policy', value: 'Locked safe', icon: ShieldCheck, tone: 'violet' },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="rounded-xl border border-white/[0.055] bg-white/[0.018] p-3">
                <Icon size={14} className={cn(item.tone === 'violet' ? 'text-violet-300' : item.tone === 'mint' ? 'text-mint' : item.tone === 'amber' ? 'text-amber' : 'text-sky')} />
                <p className="mt-2 text-[9px] uppercase tracking-[0.12em] text-ink-500">{item.label}</p>
                <p className="mt-0.5 text-[11px] font-medium text-ink-200">{item.value}</p>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
