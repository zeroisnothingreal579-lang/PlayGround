import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Box,
  CheckCircle2,
  Cpu,
  Database,
  Globe2,
  HardDrive,
  Layers3,
  LockKeyhole,
  MemoryStick,
  Network,
  Server,
  ShieldCheck,
  Signal,
  Waypoints,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react'
import { SectionHeader, StatCard } from '../components/ui'
import { useApp } from '../lib/AppContext'
import { cn, formatUptime, relativeTime } from '../lib/utils'
import type { ServerMetric, ViewId } from '../types'

function Gauge({ value, label, tone }: { value: number; label: string; tone: 'violet' | 'emerald' | 'amber' }) {
  const radius = 27
  const circumference = 2 * Math.PI * radius
  const color = tone === 'emerald' ? '#34d399' : tone === 'amber' ? '#fbbf24' : '#a78bfa'
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[68px] w-[68px]">
        <svg viewBox="0 0 68 68" className="h-full w-full -rotate-90">
          <circle cx="34" cy="34" r={radius} fill="none" stroke="rgba(255,255,255,.055)" strokeWidth="5" />
          <circle
            cx="34"
            cy="34"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - Math.min(100, Math.max(0, value)) / 100)}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[12px] font-semibold text-white">{Math.round(value)}%</span>
        </div>
      </div>
      <p className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-600">{label}</p>
    </div>
  )
}

function TinyLine({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div className="h-7 w-full rounded bg-white/[0.02]" />
  const width = 130
  const height = 28
  const max = Math.max(10, ...data)
  const points = data.map((value, index) => `${(index / (data.length - 1)) * width},${height - (value / max) * (height - 4) - 2}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" opacity=".75" />
    </svg>
  )
}

function ServerCard({ server, history }: { server: ServerMetric; history: number[] }) {
  const online = server.status === 'online' || server.status === 'degraded'
  return (
    <article className="panel panel-hover relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-violet-600/[0.07] blur-3xl" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-violet-300">
              {server.kind === 'local' ? <Server className="h-4 w-4" /> : <Box className="h-4 w-4" />}
            </span>
            <div>
              <p className="text-xs font-semibold text-white">{server.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[9px] text-slate-600">
                <Globe2 className="h-2.5 w-2.5" /> {server.region} · {server.kind === 'local' ? 'local worker' : 'remote worker'}
              </p>
            </div>
          </div>
          <span className={cn('chip', online ? 'border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-300' : 'border-rose-500/15 bg-rose-500/[0.06] text-rose-300')}>
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {server.status}
          </span>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2 rounded-xl border border-white/[0.05] bg-black/15 p-3">
          <Gauge value={server.cpuPercent} label="CPU" tone={server.cpuPercent > 80 ? 'amber' : 'violet'} />
          <Gauge value={server.memoryPercent} label="Memory" tone={server.memoryPercent > 85 ? 'amber' : 'emerald'} />
          <div className="flex-1 pl-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">CPU history</p>
            <TinyLine data={history} color="#a78bfa" />
            <p className="mt-1 text-[9px] text-slate-700">{server.activeSessions}/{server.maxSessions} slots active</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.012] px-2.5 py-2">
            <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-slate-700"><MemoryStick className="h-2.5 w-2.5" /> RAM</p>
            <p className="mt-1 text-[10px] font-semibold text-slate-300">{server.memoryUsedMb || 0} / {server.memoryTotalMb || 0} MB</p>
          </div>
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.012] px-2.5 py-2">
            <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-slate-700"><Signal className="h-2.5 w-2.5" /> Latency</p>
            <p className="mt-1 text-[10px] font-semibold text-slate-300">{server.latencyMs || 0} ms</p>
          </div>
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.012] px-2.5 py-2">
            <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-slate-700"><ArrowDownToLine className="h-2.5 w-2.5" /> Inbound</p>
            <p className="mt-1 text-[10px] font-semibold text-slate-300">{server.bandwidthInKbps.toFixed(1)} kbps</p>
          </div>
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.012] px-2.5 py-2">
            <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-slate-700"><ArrowUpFromLine className="h-2.5 w-2.5" /> Outbound</p>
            <p className="mt-1 text-[10px] font-semibold text-slate-300">{server.bandwidthOutKbps.toFixed(1)} kbps</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2.5 text-[9px] text-slate-600">
          <span className="flex items-center gap-1"><Activity className="h-3 w-3" /> Uptime {formatUptime(server.uptimeSeconds)}</span>
          <span className="truncate pl-3">{server.connection}</span>
        </div>
      </div>
    </article>
  )
}

export function ServersPage({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { servers, config, connected, runs } = useApp()
  const [histories, setHistories] = useState<Record<string, number[]>>({})

  useEffect(() => {
    setHistories((current) => {
      const next = { ...current }
      for (const server of servers) {
        next[server.id] = [...(current[server.id] || []), server.cpuPercent].slice(-28)
      }
      return next
    })
  }, [servers])

  const local = servers.find((server) => server.kind === 'local') || servers[0]
  const totalSlots = servers.reduce((sum, server) => sum + server.maxSessions, 0)
  const activeSlots = servers.reduce((sum, server) => sum + server.activeSessions, 0)
  const onlineCount = servers.filter((server) => server.status === 'online' || server.status === 'degraded').length
  const activeRuns = runs.filter((run) => run.status === 'running').length
  const runningSessions = runs.reduce((sum, run) => sum + run.sessions.filter((session) => ['resolving', 'opening', 'inspecting', 'analyzing'].includes(session.status)).length, 0)

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Runtime infrastructure"
        title="Workers & network"
        description="Monitor real CPU, memory, bandwidth and connection telemetry from configured browser workers. Session isolation and resource limits are enforced by the orchestrator."
        action={
          <span className={cn('chip', connected ? 'border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-300' : 'border-amber-500/15 bg-amber-500/[0.06] text-amber-300')}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? 'Live telemetry' : 'Polling telemetry'}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Online workers" value={`${onlineCount}/${servers.length || 1}`} sub={`${config?.workers || 1} configured worker${(config?.workers || 1) === 1 ? '' : 's'}`} icon={<Server className="h-4 w-4" />} tone="violet" />
        <StatCard label="Session slots" value={`${activeSlots}/${totalSlots || config?.maxConcurrentSessions || 0}`} sub={`${Math.max(0, (totalSlots || 0) - activeSlots)} available`} icon={<Layers3 className="h-4 w-4" />} tone="emerald" />
        <StatCard label="Active runs" value={activeRuns} sub={`${runningSessions} sessions in flight`} icon={<Activity className="h-4 w-4" />} tone="sky" />
        <StatCard label="Local CPU" value={`${local?.cpuPercent ?? 0}%`} sub={`${local?.memoryPercent ?? 0}% memory · ${local?.latencyMs ?? 0} ms loop`} icon={<Cpu className="h-4 w-4" />} tone={(local?.cpuPercent ?? 0) > 80 ? 'amber' : 'violet'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {servers.map((server) => (
          <ServerCard key={server.id} server={server} history={histories[server.id] || [server.cpuPercent]} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <section className="panel p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Dispatch & resource policy</h3>
              <p className="mt-0.5 text-[10px] text-slate-600">Browser contexts are capped by global worker concurrency</p>
            </div>
            <span className="chip border-violet-500/15 bg-violet-500/[0.06] text-violet-300"><Zap className="h-3 w-3" /> {config?.maxConcurrentSessions ?? 3} slots</span>
          </div>
          <div className="mt-5 space-y-3">
            {[
              { icon: Layers3, title: 'Queue and pool', text: `Runs queue all sessions and dispatch them to ${config?.maxConcurrentSessions ?? 3} concurrent slots. Queued sessions wait without consuming RAM.` },
              { icon: HardDrive, title: 'Isolated profiles', text: 'Every probe uses a fresh Playwright browser context with separate cookies, storage and cache. Contexts are discarded after evidence is captured.' },
              { icon: Network, title: 'Local runtime', text: 'This deployment executes on the local worker. Remote worker registrations are health-checked for visibility; horizontal job dispatch requires the optional worker service described in README.' },
              { icon: ShieldCheck, title: 'Network honesty', text: 'Separate windows are not treated as separate human visitors. No proxy rotation, IP spoofing or traffic-generation routing is implemented.' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.012] p-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-violet-300"><Icon className="h-3.5 w-3.5" /></span>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-300">{item.title}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">{item.text}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="panel p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Capability status</h3>
              <p className="mt-0.5 text-[10px] text-slate-600">External configuration requirements</p>
            </div>
            <button type="button" onClick={() => onNavigate('settings')} className="text-[10px] font-semibold text-violet-300 hover:text-violet-200">Configure</button>
          </div>
          <div className="mt-4 space-y-2.5">
            {[
              { label: 'Playwright browser isolation', ready: Boolean(config?.browserAvailable), detail: config?.browserAvailable ? 'Chromium executable found' : 'Set BROWSER_EXECUTABLE_PATH' },
              { label: 'Automation quotas', ready: Boolean(config?.automationEnabled), detail: `${config?.maxSessionsPerRun ?? 100} max sessions · ${config?.maxConcurrentSessions ?? 3} concurrent` },
              { label: 'PostgreSQL persistence', ready: config?.database === 'postgresql', detail: config?.database === 'postgresql' ? 'Connected database mode' : 'Local durable JSON store' },
              { label: 'LLM analysis', ready: Boolean(config?.aiConfigured), detail: config?.aiConfigured ? config.aiModel || 'Configured' : 'Heuristic fallback active' },
              { label: 'Dashboard auth', ready: Boolean(config?.authEnabled), detail: config?.authEnabled ? 'Password session enabled' : 'Open local environment' },
              { label: 'Credential encryption', ready: Boolean(config?.encryptionConfigured), detail: config?.encryptionConfigured ? 'AES-256-GCM key present' : 'Set APP_ENCRYPTION_KEY' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.012] px-3 py-2.5">
                {item.ready ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-slate-700" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-slate-300">{item.label}</p>
                  <p className="truncate text-[9px] text-slate-600">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-sky-500/10 bg-sky-500/[0.03] p-3">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300/70" />
            <p className="text-[9px] leading-relaxed text-slate-500">
              Never expose the dashboard directly to the internet without authentication, TLS, rate limits and a trusted reverse proxy.
            </p>
          </div>
        </section>
      </div>

      <div className="flex items-center gap-2 text-[9px] text-slate-700">
        <Database className="h-3 w-3" />
        Telemetry sampled {relativeTime(new Date().toISOString())} · event-loop latency via perf_hooks · bandwidth from /proc/net/dev when available.
        <Waypoints className="ml-auto h-3 w-3" /> {config?.region || 'local'} deployment
      </div>
    </div>
  )
}
