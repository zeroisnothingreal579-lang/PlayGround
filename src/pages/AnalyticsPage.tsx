import { useMemo, useState, type FormEvent } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Globe2,
  Loader2,
  MousePointerClick,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Waypoints,
} from 'lucide-react'
import { EmptyState, Field, Modal, ProgressBar, SectionHeader, StatCard } from '../components/ui'
import { api, exportUrl } from '../lib/api'
import { useApp } from '../lib/AppContext'
import { formatCurrency, formatDuration, formatNumber } from '../lib/utils'

const defaultStart = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
const defaultEnd = new Date().toISOString().slice(0, 10)

function ChartTooltipStyle() {
  return {
    contentStyle: {
      background: 'rgba(16,16,24,.96)',
      border: '1px solid rgba(255,255,255,.09)',
      borderRadius: 12,
      fontSize: 11,
      color: '#cbd5e1',
      boxShadow: '0 20px 50px -20px rgba(0,0,0,.85)',
    },
    labelStyle: { color: '#94a3b8', fontSize: 10, marginBottom: 4 },
    itemStyle: { color: '#e2e8f0', fontSize: 10 },
  }
}

function VerifiedMetricForm({ onClose }: { onClose: () => void }) {
  const { refresh, notify, notifyError } = useApp()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    source: '',
    clicks: '0',
    impressions: '0',
    earnings: '0',
    currency: 'USD',
    periodStart: defaultStart,
    periodEnd: defaultEnd,
    note: '',
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    try {
      await api.addVerifiedMetric({
        source: form.source,
        clicks: Number(form.clicks),
        impressions: Number(form.impressions),
        earnings: Number(form.earnings),
        currency: form.currency,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        note: form.note || undefined,
      })
      await refresh()
      notify('Verified platform metric recorded.', 'success')
      onClose()
    } catch (error) {
      notifyError(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Add verified metric" subtitle="Only enter data supplied by an authorized analytics or ad-network platform" width="max-w-2xl">
      <form onSubmit={submit} className="space-y-4 p-5 sm:p-6">
        <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.035] p-3">
          <p className="text-[10px] leading-relaxed text-amber-200/75">
            These figures are treated as externally verified. Do not estimate them from LinkPilot observations. The source name is shown wherever the metric appears.
          </p>
        </div>
        <Field label="Authorized source">
          <input required value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} className="input" placeholder="e.g. Acme Ads API · publisher account" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Verified clicks">
            <input required type="number" min="0" step="1" value={form.clicks} onChange={(event) => setForm({ ...form, clicks: event.target.value })} className="input" />
          </Field>
          <Field label="Verified impressions">
            <input required type="number" min="0" step="1" value={form.impressions} onChange={(event) => setForm({ ...form, impressions: event.target.value })} className="input" />
          </Field>
          <Field label="Earnings">
            <input required type="number" min="0" step="0.01" value={form.earnings} onChange={(event) => setForm({ ...form, earnings: event.target.value })} className="input" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Currency">
            <input required value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase().slice(0, 8) })} className="input" />
          </Field>
          <Field label="Period start">
            <input required type="date" value={form.periodStart} onChange={(event) => setForm({ ...form, periodStart: event.target.value })} className="input" />
          </Field>
          <Field label="Period end">
            <input required type="date" value={form.periodEnd} onChange={(event) => setForm({ ...form, periodEnd: event.target.value })} className="input" />
          </Field>
        </div>
        <Field label="Note (optional)">
          <textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={2} className="input resize-none" placeholder="Campaign, account reference or reconciliation note" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost text-[11px]">Cancel</button>
          <button type="submit" disabled={loading || !form.source} className="btn-primary text-[11px]">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Record verified metric
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function AnalyticsPage() {
  const { analytics, verifiedMetrics, runs, refresh, notify, notifyError, config } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const chartData = useMemo(() => analytics?.history.map((point) => ({
    ...point,
    label: new Date(`${point.date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  })) || [], [analytics])

  const latest = analytics?.history[analytics.history.length - 1]
  const previous = analytics?.history[analytics.history.length - 2]
  const delta = (latest?.navigations || 0) - (previous?.navigations || 0)

  const removeMetric = async (id: string) => {
    setDeleting(id)
    try {
      await api.deleteVerifiedMetric(id)
      await refresh()
      notify('Verified metric removed.', 'info')
    } catch (error) {
      notifyError(error)
    } finally {
      setDeleting(null)
    }
  }

  if (!analytics) return null

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Measurement & exports"
        title="Analytics"
        description="Measure LinkPilot probe outcomes, inspect destination health, and display verified platform metrics only when supplied by an authorized source."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <a href={exportUrl('runs')} className="btn-ghost text-[11px]"><FileSpreadsheet className="h-3.5 w-3.5" /> Sessions CSV</a>
            <a href={exportUrl('analyses')} className="btn-ghost text-[11px]"><Download className="h-3.5 w-3.5" /> Analyses CSV</a>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <StatCard
          label="Test navigations"
          value={formatNumber(analytics.probes)}
          sub={<span className={delta >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}>{delta >= 0 ? '+' : ''}{delta} today vs yesterday</span>}
          icon={<Activity className="h-4 w-4" />}
          tone="violet"
        />
        <StatCard label="Redirect success" value={`${analytics.redirectSuccessRate}%`} sub="Of inspected destinations" icon={<Waypoints className="h-4 w-4" />} tone="emerald" />
        <StatCard label="Loading errors" value={analytics.loadingErrors} sub="Session-level failures" icon={<AlertTriangle className="h-4 w-4" />} tone="amber" />
        <StatCard label="Blocked pages" value={analytics.blockedPages} sub="CAPTCHA, denial or restriction" icon={<ShieldCheck className="h-4 w-4" />} tone="sky" />
        <StatCard label="Average load" value={analytics.averageLoadMs ? formatDuration(analytics.averageLoadMs) : '—'} sub="Observed browser load time" icon={<Clock3 className="h-4 w-4" />} tone="violet" />
        <StatCard label="Destinations" value={analytics.uniqueDestinations} sub="Unique final domains" icon={<Globe2 className="h-4 w-4" />} tone="emerald" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <section className="panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Navigation activity · 14 days</h3>
              <p className="mt-0.5 text-[10px] text-slate-600">Probe sessions started per UTC day</p>
            </div>
            <div className="flex items-center gap-3 text-[9px]">
              <span className="flex items-center gap-1.5 text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" /> Navigations</span>
              <span className="flex items-center gap-1.5 text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Completed</span>
              <span className="flex items-center gap-1.5 text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Errors</span>
            </div>
          </div>
          <div className="mt-5 h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="navFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.34} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="completeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.045)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...ChartTooltipStyle()} />
                <Area type="monotone" dataKey="navigations" stroke="#a78bfa" strokeWidth={2} fill="url(#navFill)" />
                <Area type="monotone" dataKey="completed" stroke="#34d399" strokeWidth={1.5} fill="url(#completeFill)" />
                <Area type="monotone" dataKey="errors" stroke="#fb7185" strokeWidth={1.5} fill="transparent" strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.012] px-3 py-2">
            <Sparkles className="h-3 w-3 shrink-0 text-violet-300" />
            <p className="text-[9px] leading-relaxed text-slate-600">
              These counts are automation probes, not unique human visitors. LinkPilot does not infer traffic quality or audience size from browser sessions.
            </p>
          </div>
        </section>

        <section className="panel p-5 sm:p-6">
          <div>
            <h3 className="text-sm font-semibold text-white">Session outcomes</h3>
            <p className="mt-0.5 text-[10px] text-slate-600">Current stored probe status</p>
          </div>
          <div className="relative mt-2 h-[220px]">
            {analytics.statusBreakdown.length ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.statusBreakdown} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="84%" paddingAngle={3} stroke="none">
                      {analytics.statusBreakdown.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip {...ChartTooltipStyle()} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-2xl font-semibold text-white">{analytics.probes}</p>
                  <p className="text-[9px] uppercase tracking-wider text-slate-600">probes</p>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <CircleDollarSign className="mx-auto h-6 w-6 text-slate-700" />
                  <p className="mt-2 text-[10px] text-slate-600">No session outcomes yet</p>
                </div>
              </div>
            )}
          </div>
          <div className="mt-2 space-y-2">
            {analytics.statusBreakdown.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: entry.color }} />
                <span className="flex-1 text-[10px] text-slate-500">{entry.name}</span>
                <span className="num text-[10px] text-slate-400">{entry.value}</span>
              </div>
            ))}
            {!analytics.statusBreakdown.length && <p className="text-center text-[9px] text-slate-700">Launch sessions to populate this chart.</p>}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.55fr]">
        <section className="panel p-5 sm:p-6">
          <div>
            <h3 className="text-sm font-semibold text-white">Top destinations</h3>
            <p className="mt-0.5 text-[10px] text-slate-600">Final domains by probe volume</p>
          </div>
          {analytics.topDomains.length ? (
            <div className="mt-4 space-y-3">
              {analytics.topDomains.slice(0, 6).map((domain) => (
                <div key={domain.domain}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] font-medium text-slate-300">{domain.domain}</p>
                    <span className="shrink-0 text-[9px] text-slate-600">{domain.count} probes · {domain.successRate}%</span>
                  </div>
                  <ProgressBar className="mt-1.5" value={Math.min(100, (domain.count / Math.max(1, analytics.topDomains[0].count)) * 100)} tone="violet" />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact icon={<Globe2 className="h-5 w-5" />} title="No destinations" description="Final domains from completed inspections will rank here." />
          )}
          <div className="mt-5 flex items-center justify-between border-t border-white/[0.05] pt-4">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-600">Average observed ad slots</p>
              <p className="mt-1 text-lg font-semibold text-white">{(analytics.probes ? analytics.adObservations / analytics.probes : 0).toFixed(2)}</p>
            </div>
            <a href={exportUrl('analyses')} className="text-[9px] font-semibold text-violet-300 hover:text-violet-200">Export analyses</a>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Verified platform metrics</h3>
              <p className="mt-0.5 text-[10px] text-slate-600">Never derived from LinkPilot observations</p>
            </div>
            <button type="button" onClick={() => setShowForm(true)} className="btn-ghost !px-2.5 !py-1.5 text-[10px]">
              <Plus className="h-3 w-3" /> Add verified metric
            </button>
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/[0.05] border-b border-white/[0.05]">
            <div className="p-4">
              <p className="label">Verified clicks</p>
              <p className="mt-2 text-xl font-semibold text-white">{analytics.verifiedClicks === null ? '—' : formatNumber(analytics.verifiedClicks)}</p>
              <p className="mt-1 text-[9px] text-slate-600">{analytics.verifiedSource || 'No source connected'}</p>
            </div>
            <div className="p-4">
              <p className="label">Verified earnings</p>
              <p className="mt-2 text-xl font-semibold text-white">
                {formatCurrency(analytics.verifiedEarnings, analytics.verifiedCurrency)}
              </p>
              <p className="mt-1 text-[9px] text-slate-600">{analytics.verifiedCurrency === 'MIXED' ? 'Mixed currencies — no combined total' : analytics.verifiedCurrency || 'Not supplied'}</p>
            </div>
            <div className="p-4">
              <p className="label">Sources</p>
              <p className="mt-2 text-xl font-semibold text-white">{new Set(verifiedMetrics.map((metric) => metric.source)).size}</p>
              <p className="mt-1 text-[9px] text-slate-600">{verifiedMetrics.length} recorded periods</p>
            </div>
          </div>
          {verifiedMetrics.length ? (
            <div className="max-h-[320px] overflow-y-auto">
              {verifiedMetrics.map((metric) => (
                <div key={metric.id} className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-3 last:border-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-semibold text-slate-300">{metric.source}</p>
                    <p className="text-[9px] text-slate-600">
                      {metric.clicks} clicks · {metric.impressions} impressions · {metric.currency} {metric.earnings.toFixed(2)} · {metric.periodStart} → {metric.periodEnd}
                    </p>
                  </div>
                  <button type="button" onClick={() => void removeMetric(metric.id)} disabled={deleting === metric.id} className="rounded-lg p-1.5 text-slate-700 transition hover:bg-rose-500/10 hover:text-rose-300" title="Remove metric">
                    {deleting === metric.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              icon={<Database className="h-5 w-5" />}
              title="No verified metrics supplied"
              description="Add a verified metric manually, or POST validated data from an authorized analytics platform to the ingest endpoint."
            />
          )}
          <div className="border-t border-white/[0.05] bg-white/[0.01] px-5 py-3">
            <p className="text-[9px] leading-relaxed text-slate-600">
              Ingest API: <code className="text-violet-300/80">POST /api/integrations/verified-metrics</code> with <code className="text-violet-300/80">Authorization: Bearer $ANALYTICS_INGEST_TOKEN</code>. See Settings for configuration.
            </p>
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <a href={exportUrl('runs')} className="panel panel-hover flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/15 bg-violet-500/[0.06] text-violet-300"><FileSpreadsheet className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-200">Session report CSV</p>
            <p className="text-[9px] text-slate-600">One row per browser probe</p>
          </div>
          <ArrowDownToLine className="h-3.5 w-3.5 text-slate-600" />
        </a>
        <a href={exportUrl('analyses')} className="panel panel-hover flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-300"><Waypoints className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-200">URL analysis CSV</p>
            <p className="text-[9px] text-slate-600">Redirect and risk evidence</p>
          </div>
          <ArrowDownToLine className="h-3.5 w-3.5 text-slate-600" />
        </a>
        <a href={exportUrl('verified-metrics')} className="panel panel-hover flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/15 bg-sky-500/[0.06] text-sky-300"><MousePointerClick className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-200">Verified metrics CSV</p>
            <p className="text-[9px] text-slate-600">Externally supplied only</p>
          </div>
          <ArrowDownToLine className="h-3.5 w-3.5 text-slate-600" />
        </a>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-white/[0.05] bg-white/[0.012] px-4 py-3 text-[9px] text-slate-700">
        <Database className="h-3 w-3" />
        Persistence: {config?.database === 'postgresql' ? 'PostgreSQL' : 'durable local JSON store'} · {runs.length} runs · {analytics.probes} probes · Probe counts are not visitor analytics.
        <span className="ml-auto flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Authorized integrations only</span>
      </div>

      {showForm && <VerifiedMetricForm onClose={() => setShowForm(false)} />}
    </div>
  )
}
