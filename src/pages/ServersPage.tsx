import {
  Activity,
  ArrowRight,
  Box,
  Cloud,
  Cpu,
  Database,
  Globe2,
  HardDrive,
  Info,
  Lock,
  MemoryStick,
  MonitorDot,
  Network,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  Wifi,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { api } from '../lib/api'
import type { ServersResponse } from '../lib/types'
import { cn, formatNumber } from '../lib/utils'
import { EmptyState, InfoNote, PageHeader, ProgressBar, SectionTitle, StatCard, StatusPill } from '../components/ui'

function GaugeRing({ value, label, tone = 'violet' }: { value: number; label: string; tone?: 'violet' | 'mint' | 'amber' | 'sky' }) {
  const color = { violet: '#9c75ff', mint: '#54e6b1', amber: '#f6c768', sky: '#6bc7ff' }[tone]
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full" style={{ background: `conic-gradient(${color} ${Math.min(100, value) * 3.6}deg, rgba(255,255,255,.055) 0deg)` }}>
        <div className="absolute inset-[5px] rounded-full bg-ink-850" />
        <div className="relative text-center">
          <p className="text-[16px] font-semibold text-white">{Math.round(value)}<span className="text-[9px] text-ink-400">%</span></p>
          <p className="text-[8px] uppercase tracking-[0.1em] text-ink-500">{label}</p>
        </div>
      </div>
    </div>
  )
}

export default function ServersPage() {
  const { revision } = useApp()
  const [data, setData] = useState<ServersResponse | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setRefreshing(true)
    try {
      const result = await api.servers()
      setData(result)
    } catch {
      // Connectivity is surfaced in the shell.
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
  }, [revision])

  useEffect(() => {
    const timer = window.setInterval(() => void load(), 8000)
    return () => window.clearInterval(timer)
  }, [])

  const servers = data?.servers || []
  const primary = servers[0]
  const totalActive = servers.reduce((sum, server) => sum + server.activeSessions, 0)
  const totalCapacity = servers.reduce((sum, server) => sum + server.maxSessions, 0)
  const averageCpu = servers.length ? Math.round(servers.reduce((sum, server) => sum + server.cpuPercent, 0) / servers.length) : 0

  return (
    <>
      <PageHeader
        eyebrow="Infrastructure"
        title="Servers & workers"
        description="Monitor isolated execution capacity, resource pressure, and the egress profile used for authorized regional compatibility testing."
        actions={
          <button className="btn-secondary" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard label="Workers online" value={servers.filter((server) => server.status === 'online').length} icon={<Server size={18} />} accent="mint" sub={<>of {servers.length} configured</>} />
        <StatCard label="Active contexts" value={totalActive} icon={<MonitorDot size={18} />} accent="violet" sub={<>capacity {totalCapacity}</>} />
        <StatCard label="Average CPU" value={`${averageCpu}%`} icon={<Cpu size={18} />} accent={averageCpu > 75 ? 'coral' : 'sky'} sub={<>across workers</>} />
        <StatCard label="Isolation" value="Per-context" icon={<ShieldCheck size={18} />} accent="mint" sub={<>cookies · cache · storage</>} />
      </div>

      {servers.length ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
          <div className="space-y-4">
            {servers.map((server) => (
              <div key={server.id} className="panel overflow-hidden">
                <div className="relative border-b border-white/[0.055] p-4 sm:p-5">
                  <div className="glow-orb -right-8 -top-16 h-40 w-40 bg-violet-600/10" />
                  <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.07] bg-gradient-to-br from-violet-500/15 to-transparent text-violet-300">
                        <Server size={19} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-semibold text-white">{server.name}</p>
                          <StatusPill status={server.status} />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[9.5px] text-ink-500">
                          <span className="flex items-center gap-1"><Globe2 size={9} />{server.region}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Box size={9} />{server.runtime}</span>
                          <span>·</span>
                          <span>{server.platform}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[9.5px]', server.dockerAvailable ? 'border-mint/15 bg-mint/[0.04] text-mint' : 'border-white/[0.06] bg-white/[0.02] text-ink-400')}>
                        <Box size={10} />{server.dockerAvailable ? 'Docker ready' : 'Docker unavailable'}
                      </span>
                      <span className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[9.5px]', server.playwrightInstalled ? 'border-violet-500/15 bg-violet-500/[0.04] text-violet-300' : 'border-amber/15 bg-amber/[0.04] text-amber')}>
                        <MonitorDot size={10} />{server.playwrightInstalled ? 'Playwright' : 'HTTP mode'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 p-4 sm:p-5 lg:grid-cols-4">
                  <div className="flex justify-center lg:border-r lg:border-white/[0.05]">
                    <GaugeRing value={server.cpuPercent} label="CPU" tone={server.cpuPercent > 75 ? 'amber' : 'violet'} />
                  </div>
                  <div className="flex justify-center lg:border-r lg:border-white/[0.05]">
                    <GaugeRing value={server.memoryPercent} label="Memory" tone={server.memoryPercent > 80 ? 'amber' : 'sky'} />
                  </div>
                  <div className="flex justify-center lg:border-r lg:border-white/[0.05]">
                    <GaugeRing value={(server.activeSessions / Math.max(1, server.maxSessions)) * 100} label="Sessions" tone="mint" />
                  </div>
                  <div className="flex flex-col justify-center gap-2">
                    <div className="flex items-center justify-between text-[9.5px]"><span className="flex items-center gap-1.5 text-ink-500"><MemoryStick size={10} />RAM</span><span className="font-mono text-ink-300">{server.memoryUsedGb} / {server.memoryTotalGb} GB</span></div>
                    <div className="flex items-center justify-between text-[9.5px]"><span className="flex items-center gap-1.5 text-ink-500"><Wifi size={10} />Bandwidth</span><span className="font-mono text-ink-300">{formatNumber(server.bandwidthKbps)} Kbps</span></div>
                    <div className="flex items-center justify-between text-[9.5px]"><span className="flex items-center gap-1.5 text-ink-500"><Activity size={10} />Load</span><span className="font-mono text-ink-300">{server.loadAverage[0]}</span></div>
                    <div className="flex items-center justify-between text-[9.5px]"><span className="flex items-center gap-1.5 text-ink-500"><Radio size={10} />Egress</span><span className="text-ink-300">{server.egressProfile || 'direct'}</span></div>
                  </div>
                </div>

                <div className="border-t border-white/[0.045] px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[9.5px] text-ink-500">
                    <span>{server.activeSessions} active · {server.queuedSessions} queued · max {server.maxSessions} concurrent</span>
                    <span className="font-mono">{server.nodeVersion} · uptime {Math.floor(server.uptimeSeconds / 3600)}h</span>
                  </div>
                  <div className="mt-2"><ProgressBar value={(server.activeSessions / Math.max(1, server.maxSessions)) * 100} tone="mint" /></div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="panel p-4 sm:p-5">
              <SectionTitle title="Scheduler" description="Resource-aware local assignment." />
              <div className="mt-4 space-y-2">
                {[
                  { label: 'Queue policy', value: 'Least-loaded online worker', icon: Network },
                  { label: 'Concurrency cap', value: `${data?.limits.maxConcurrentBrowsers} browser contexts`, icon: LayersIcon },
                  { label: 'Max sessions/job', value: `${data?.limits.maxSessions}`, icon: MonitorDot },
                  { label: 'CPU cores', value: `${data?.limits.cpuCount}`, icon: Cpu },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                      <Icon size={12} className="text-violet-300" />
                      <span className="flex-1 text-[10px] text-ink-400">{item.label}</span>
                      <span className="text-[10px] font-medium text-ink-200">{item.value}</span>
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-[9.5px] leading-relaxed text-ink-500">Workers are selected by available session slots. Sessions beyond the concurrency cap remain queued with isolated state.</p>
            </div>

            <div className="panel p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Network size={14} className="text-sky" />
                <h3 className="text-[12.5px] font-semibold text-white">Regional compatibility</h3>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-ink-400">A single authorized egress proxy may be configured for regional compatibility testing. It is not a traffic-rotation mechanism.</p>
              <div className="mt-3 rounded-xl border border-white/[0.055] bg-ink-950/45 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-[0.1em] text-ink-500">Active profile</span>
                  <span className={cn('text-[9px] font-medium', primary?.egressConfigured ? 'text-mint' : 'text-ink-400')}>{primary?.egressProfile || 'direct'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-[0.1em] text-ink-500">Worker region</span>
                  <span className="text-[9px] font-medium text-ink-200">{primary?.region || '—'}</span>
                </div>
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber/10 bg-amber/[0.025] p-2.5">
                <Lock size={11} className="mt-0.5 shrink-0 text-amber" />
                <p className="text-[9px] leading-relaxed text-ink-500">Credentials are environment-managed, encrypted at the platform layer, and never returned by the API.</p>
              </div>
            </div>

            <div className="panel p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-violet-300" />
                <h3 className="text-[12.5px] font-semibold text-white">Deployment reference</h3>
              </div>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/[0.06] bg-ink-950/70 p-3 font-mono text-[9px] leading-relaxed text-ink-400">
{`docker compose up --build
# env
DATABASE_URL=postgres://...
MAX_CONCURRENT_BROWSERS=6
WORKER_REGION=eu-west
WORKER_PROXY_SERVER=http://...`}
              </pre>
              <button className="btn-ghost mt-2 px-2 py-1 text-[10px]" onClick={() => window.open('/api/health', '_blank')}>View runtime health <ArrowRight size={10} /></button>
            </div>
          </div>
        </div>
      ) : (
        <div className="panel"><EmptyState icon={<Server size={20} />} title="Worker telemetry unavailable" description="The API is reachable but has not returned worker metrics yet." /></div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { icon: Database, title: 'Persistent storage', text: 'PostgreSQL stores inspections, jobs, sessions, and verified events. Local file storage is a development fallback.' },
          { icon: HardDrive, title: 'Profile isolation', text: 'Every Playwright context starts with a clean cookie jar, storage, cache, and no download permission.' },
          { icon: Cloud, title: 'Secure by default', text: 'SSRF protection, private-network blocking, rate limits, optional bearer auth, and encrypted credentials.' },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div key={item.title} className="panel p-4">
              <Icon size={15} className="text-violet-300" />
              <p className="mt-2.5 text-[11.5px] font-semibold text-ink-100">{item.title}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-ink-500">{item.text}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-4">
        <InfoNote tone="amber" icon={<Info size={15} />}>
          <strong className="text-amber">Windows and IPs are not people.</strong> {data?.isolation || 'Separate browser profiles never represent separate genuine visitors.'} Region selection is for compatibility testing only, not for manufacturing traffic.
        </InfoNote>
      </div>
    </>
  )
}

function LayersIcon({ size = 14 }: { size?: number }) {
  return <MonitorDot size={size} />
}
