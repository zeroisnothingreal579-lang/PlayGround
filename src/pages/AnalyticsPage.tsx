import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Download,
  FileDown,
  Globe2,
  Link2,
  MonitorDot,
  MousePointerClick,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../context/AppContext'
import { api } from '../lib/api'
import type { Analytics } from '../lib/types'
import { cn, formatCurrency, formatNumber, timeAgo } from '../lib/utils'
import { EmptyState, InfoNote, PageHeader, ProgressBar, SectionTitle, Segmented, StatCard, StatusPill } from '../components/ui'

type Range = '24h' | '7d' | '30d' | '90d'
type Tab = 'sessions' | 'inspections'

export default function AnalyticsPage() {
  const { revision, notify, navigate } = useApp()
  const [range, setRange] = useState<Range>('7d')
  const [data, setData] = useState<Analytics | null>(null)
  const [tab, setTab] = useState<Tab>('sessions')

  useEffect(() => {
    api.analytics(range).then(setData).catch((error) => notify(error instanceof Error ? error.message : 'Could not load analytics', 'error'))
  }, [range, revision, notify])

  const totals = data?.totals
  const chartData = data?.series || []
  const hasChart = chartData.some((point) => point.sessions || point.inspections || point.ads)

  return (
    <>
      <PageHeader
        eyebrow="Measurement"
        title="Analytics"
        description="Track actual inspections, session outcomes, loading errors, and destination domains. Verified clicks and earnings appear only when an authorized source supplies them."
        actions={
          <>
            <button className="btn-secondary" onClick={() => api.exportCsv('sessions')}><FileDown size={13} />Sessions CSV</button>
            <button className="btn-secondary" onClick={() => api.exportCsv('inspections')}><Download size={13} />Inspections CSV</button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: '24h', label: '24 hours' },
            { value: '7d', label: '7 days' },
            { value: '30d', label: '30 days' },
            { value: '90d', label: '90 days' },
          ]}
          value={range}
          onChange={(value) => setRange(value)}
        />
        <div className="flex items-center gap-2 text-[10px] text-ink-500">
          <span className="h-1.5 w-1.5 rounded-full bg-mint" />
          Generated {data ? timeAgo(data.generatedAt) : '—'}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard label="Sessions" value={formatNumber(totals?.sessions || 0)} icon={<MonitorDot size={18} />} accent="violet" sub={<>{formatNumber(totals?.completed || 0)} completed · {formatNumber(totals?.running || 0)} active</>} />
        <StatCard label="Redirect success" value={`${totals?.redirectSuccessRate || 0}%`} icon={<Link2 size={18} />} accent="mint" sub={<>{formatNumber(totals?.inspections || 0)} inspections · {formatNumber(totals?.redirectCount || 0)} hops</>} />
        <StatCard label="Loading errors" value={formatNumber(totals?.errors || 0)} icon={<AlertTriangle size={18} />} accent={totals?.errors ? 'coral' : 'sky'} sub={<>{totals?.sessions ? Math.round(((totals.errors || 0) / totals.sessions) * 100) : 0}% of sessions</>} />
        <StatCard label="Destinations" value={formatNumber(data?.domains.length || 0)} icon={<Globe2 size={18} />} accent="amber" sub={<>unique final domains</>} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <div className="panel p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionTitle title="Historical activity" description="Sessions and inspections over time." />
            <div className="flex items-center gap-3 text-[10px] text-ink-400">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" />Sessions</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sky" />Inspections</span>
            </div>
          </div>
          <div className="relative mt-4 h-[260px]">
            {!hasChart && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div className="rounded-xl border border-white/[0.06] bg-ink-900/80 px-4 py-3 text-center backdrop-blur">
                  <p className="text-[11.5px] font-medium text-ink-200">No measurements in this range</p>
                  <p className="mt-1 text-[10.5px] text-ink-500">Run an inspection or launch sessions to begin.</p>
                </div>
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="analyticsSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8147ff" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#8147ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="analyticsInspections" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6bc7ff" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#6bc7ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,.045)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#5d5d78', fontSize: 9.5 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#5d5d78', fontSize: 9.5 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#12121c', border: '1px solid rgba(255,255,255,.09)', borderRadius: 12, fontSize: 11, color: '#e6e6f0' }} labelStyle={{ color: '#8b8ba6', marginBottom: 4 }} />
                <Area type="monotone" dataKey="sessions" stroke="#9c75ff" strokeWidth={2} fill="url(#analyticsSessions)" dot={false} />
                <Area type="monotone" dataKey="inspections" stroke="#6bc7ff" strokeWidth={1.5} fill="url(#analyticsInspections)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-4 sm:p-5">
          <SectionTitle title="Verified metrics" description="Never inferred or fabricated." />
          <div className="mt-4 rounded-xl border border-mint/20 bg-mint/[0.03] p-3.5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-mint" />
              <span className="text-[10.5px] font-medium text-ink-200">{data?.integrity.verifiedSource || 'Not connected'}</span>
            </div>
            <p className="mt-2 text-[9.5px] leading-relaxed text-ink-500">Verified clicks, impressions, and earnings are shown only when a publisher or analytics API supplies them.</p>
          </div>
          <div className="mt-3 space-y-2">
            {[
              { label: 'Verified clicks', value: formatNumber(totals?.verifiedClicks || 0), icon: MousePointerClick },
              { label: 'Verified impressions', value: formatNumber(totals?.verifiedImpressions || 0), icon: BarChart3 },
              { label: 'Verified earnings', value: formatCurrency(totals?.verifiedEarnings || 0), icon: TrendingUp },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                  <Icon size={12} className="text-mint" />
                  <span className="flex-1 text-[10px] text-ink-400">{item.label}</span>
                  <span className="font-mono text-[11px] font-medium text-ink-100">{item.value}</span>
                </div>
              )
            })}
          </div>
          <button className="btn-secondary mt-3 w-full py-2 text-[10.5px]" onClick={() => navigate('settings')}>Connect analytics <ArrowRight size={11} /></button>
          <div className="mt-3 flex items-start gap-2">
            <ShieldCheck size={11} className="mt-0.5 shrink-0 text-ink-500" />
            <p className="text-[8.5px] leading-relaxed text-ink-600">Sessions are automation runs, not human visitors. Ad detections are not impressions.</p>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="panel p-4 sm:p-5">
          <SectionTitle title="Destination domains" description="Final domains resolved from inspected links." />
          {data?.domains.length ? (
            <div className="mt-4 h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.domains.slice(0, 6)} layout="vertical" margin={{ left: 4, right: 12, top: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,.04)" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#5d5d78', fontSize: 9 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="domain" axisLine={false} tickLine={false} width={120} tick={{ fill: '#8b8ba6', fontSize: 9 }} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,.025)' }} contentStyle={{ background: '#12121c', border: '1px solid rgba(255,255,255,.09)', borderRadius: 12, fontSize: 11, color: '#e6e6f0' }} />
                  <Bar dataKey="count" fill="#8147ff" radius={[0, 5, 5, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {['No destination data yet', 'Inspected links will be grouped by final domain', 'Nothing is fabricated to fill this chart'].map((text, index) => (
                <div key={text}>
                  <div className="mb-1.5 flex items-center justify-between text-[10px]"><span className="text-ink-400">{text}</span><span className="font-mono text-ink-600">{index === 0 ? '—' : 0}</span></div>
                  <ProgressBar value={index === 0 ? 0 : 0} tone="violet" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel p-4 sm:p-5">
          <SectionTitle title="Page status distribution" description="Inspection outcomes, not visitor signals." />
          <div className="mt-4 space-y-3">
            {['ok', 'captcha', 'blocked', 'error', 'timeout', 'loop'].map((status) => {
              const count = data?.pageStatuses[status] || 0
              const total = data?.totals.inspections || 0
              const percent = total ? (count / total) * 100 : 0
              return (
                <div key={status}>
                  <div className="mb-1.5 flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1.5 capitalize text-ink-300">
                      <span className={cn('h-1.5 w-1.5 rounded-full', status === 'ok' ? 'bg-mint' : status === 'captcha' || status === 'loop' ? 'bg-amber' : 'bg-coral')} />
                      {status}
                    </span>
                    <span className="font-mono text-ink-500">{count} · {Math.round(percent)}%</span>
                  </div>
                  <ProgressBar value={percent} tone={status === 'ok' ? 'mint' : status === 'captcha' || status === 'loop' ? 'amber' : 'coral'} />
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-white/[0.045] bg-white/[0.015] p-2.5">
            <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-ink-500" />
            <p className="text-[8.5px] leading-relaxed text-ink-500">A successful page load is not a successful conversion, click, or impression.</p>
          </div>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-4">
          <SectionTitle title="Session reports" description="Actual runs recorded in this workspace." />
          <div className="flex items-center gap-2">
            <Segmented options={[{ value: 'sessions', label: 'Sessions' }, { value: 'inspections', label: 'Inspections' }]} value={tab} onChange={(value) => setTab(value)} size="sm" />
            <button className="icon-btn h-7 w-7" onClick={() => api.exportCsv(tab)} aria-label="Export CSV"><Download size={12} /></button>
          </div>
        </div>
        {tab === 'sessions' ? (
          data?.recentSessions.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-white/[0.05] text-[9px] uppercase tracking-[0.1em] text-ink-500">
                    <th className="px-4 py-2.5 font-medium">Session</th>
                    <th className="px-4 py-2.5 font-medium">Destination</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Ads</th>
                    <th className="px-4 py-2.5 font-medium">Worker</th>
                    <th className="px-4 py-2.5 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSessions.map((session) => (
                    <tr key={session.id} className="table-row">
                      <td className="px-4 py-2.5 font-mono text-[9.5px] text-ink-400">#{String(session.index).padStart(2, '0')} · {session.id.slice(-6)}</td>
                      <td className="max-w-[220px] truncate px-4 py-2.5 text-[10.5px] text-ink-200">{session.finalDomain || '—'}</td>
                      <td className="px-4 py-2.5"><StatusPill status={session.status} /></td>
                      <td className="px-4 py-2.5 text-[10px] text-ink-400">{session.ads?.detected ? <span className="text-amber">detected</span> : 'none'}</td>
                      <td className="px-4 py-2.5 text-[9.5px] text-ink-500">{session.region || '—'}</td>
                      <td className="px-4 py-2.5 text-[9.5px] text-ink-500">{timeAgo(session.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState compact icon={<MonitorDot size={19} />} title="No session reports" description="Session outcomes appear after you launch browser sessions." action={<button className="btn-secondary text-[11px]" onClick={() => navigate('sessions')}>Launch sessions</button>} />
          )
        ) : data?.recentInspections.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-white/[0.05] text-[9px] uppercase tracking-[0.1em] text-ink-500">
                  <th className="px-4 py-2.5 font-medium">Original</th>
                  <th className="px-4 py-2.5 font-medium">Final domain</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Hops</th>
                  <th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="px-4 py-2.5 font-medium">Inspected</th>
                </tr>
              </thead>
              <tbody>
                {data.recentInspections.map((inspection) => (
                  <tr key={inspection.id} className="table-row">
                    <td className="max-w-[240px] truncate px-4 py-2.5 font-mono text-[9px] text-ink-400">{inspection.originalUrl}</td>
                    <td className="px-4 py-2.5 text-[10.5px] text-ink-200">{inspection.finalDomain || '—'}</td>
                    <td className="px-4 py-2.5"><StatusPill status={inspection.pageStatus} /></td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-ink-400">{inspection.redirectCount}</td>
                    <td className="px-4 py-2.5"><span className={cn('text-[9.5px] capitalize', inspection.risk.level === 'high' ? 'text-coral' : inspection.risk.level === 'medium' ? 'text-amber' : 'text-mint')}>{inspection.risk.level}</span></td>
                    <td className="px-4 py-2.5 text-[9.5px] text-ink-500">{timeAgo(inspection.createdAt || inspection.inspectedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact icon={<Link2 size={19} />} title="No inspection reports" description="Inspect a link to add a report." action={<button className="btn-secondary text-[11px]" onClick={() => navigate('inspector')}>Open inspector</button>} />
        )}
      </div>

      <div className="mt-4">
        <InfoNote tone="violet" icon={<ArrowUpRight size={15} />}>
          <strong className="text-violet-200">Data integrity:</strong> {data?.integrity.visitorMeaning || 'Browser sessions are not visitors.'} {data?.integrity.adEventMeaning || 'Ad detections are not verified impressions.'}
        </InfoNote>
      </div>
    </>
  )
}
