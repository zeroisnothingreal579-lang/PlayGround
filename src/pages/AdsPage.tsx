import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Eye,
  HandCoins,
  Layers3,
  Megaphone,
  MousePointerClick,
  Search,
  ShieldCheck,
  Target,
  Timer,
  XCircle,
} from 'lucide-react'
import { SessionDrawer } from '../components/SessionDrawer'
import { EmptyState, SectionHeader, StatCard } from '../components/ui'
import { useApp } from '../lib/AppContext'
import { cn, formatDuration, shortUrl } from '../lib/utils'
import type { AdObservation, BrowserSession, Run } from '../types'

interface AdRow {
  run: Run
  session: BrowserSession
  ad: AdObservation
}

const formatIcons: Record<string, typeof Megaphone> = {
  'Interstitial / overlay': Layers3,
  'Leaderboard banner': Megaphone,
  'Sponsored placement': HandCoins,
  'Iframe placement': Layers3,
}

export function AdsPage() {
  const { runs, sessionAction, notifyError } = useApp()
  const [search, setSearch] = useState('')
  const [network, setNetwork] = useState('all')
  const [selected, setSelected] = useState<{ runId: string; sessionId: string } | null>(null)

  const rows = useMemo<AdRow[]>(() => runs.flatMap((run) => run.sessions.flatMap((session) => session.ads.map((ad) => ({ run, session, ad })))), [runs])
  const networks = useMemo(() => [...new Set(rows.map((row) => row.ad.network).filter(Boolean))] as string[], [rows])
  const formats = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of rows) map.set(row.ad.format, (map.get(row.ad.format) || 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (network !== 'all' && row.ad.network !== network) return false
      if (!term) return true
      return `${row.ad.format} ${row.ad.network} ${row.ad.selector} ${row.run.inputUrl} ${row.session.finalDomain}`.toLowerCase().includes(term)
    })
  }, [rows, search, network])

  const visible = rows.filter((row) => row.ad.visible).length
  const highConfidence = rows.filter((row) => row.ad.confidence === 'high').length
  const averageDuration = (() => {
    const values = rows.map((row) => row.ad.durationMs).filter((value): value is number => typeof value === 'number')
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0
  })()
  const selectedRun = selected ? runs.find((run) => run.id === selected.runId) || null : null
  const selectedSession = selectedRun?.sessions.find((session) => session.id === selected?.sessionId) || null

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Advertising evidence"
        title="Observe placements. Never fake performance."
        description="LinkPilot identifies advertising containers, supported network hints and visibility windows. Observations are clearly separated from verified impressions, clicks and earnings."
        action={
          <span className="chip border-amber-500/15 bg-amber-500/[0.06] text-amber-300">
            <ShieldCheck className="h-3 w-3" /> Observation only
          </span>
        }
      />

      <section className="awwwards-border relative overflow-hidden rounded-2xl bg-ink-850/80 p-5">
        <div className="pointer-events-none absolute -right-10 -top-20 h-56 w-56 rounded-full bg-fuchsia-600/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/[0.08] text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">Observed ad ≠ verified impression</h3>
            <p className="mt-1.5 max-w-3xl text-[11px] leading-relaxed text-slate-500">
              An advertising container rendered in a probe context does not prove that a platform counted an impression, a valid click or a payout. LinkPilot only displays clicks and earnings when an authorized analytics source supplies them.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:w-[260px]">
            <div className="rounded-xl border border-amber-500/12 bg-amber-500/[0.035] px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-amber-300/70">Detected here</p>
              <p className="mt-1 text-[10px] text-slate-500">Containers & network hints</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Platform verified</p>
              <p className="mt-1 text-[10px] text-slate-600">Authorized source only</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Containers observed" value={rows.length} sub="Across all browser probes" icon={<Megaphone className="h-4 w-4" />} tone="violet" />
        <StatCard label="Visible in viewport" value={visible} sub="Geometry + computed style checks" icon={<Eye className="h-4 w-4" />} tone="emerald" />
        <StatCard label="Network hints" value={networks.length} sub={networks.slice(0, 2).join(' · ') || 'No supported networks identified'} icon={<Target className="h-4 w-4" />} tone="amber" />
        <StatCard label="Observation window" value={averageDuration ? formatDuration(averageDuration) : '—'} sub={`${highConfidence} high-confidence findings`} icon={<Timer className="h-4 w-4" />} tone="sky" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <section className="panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-white/[0.05] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h3 className="text-sm font-semibold text-white">Ad observations</h3>
              <p className="mt-0.5 text-[10px] text-slate-600">Click a row to open its session evidence</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-black/20 px-2.5">
                <Search className="h-3 w-3 text-slate-600" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ads" className="h-8 w-28 bg-transparent text-[11px] text-slate-300 outline-none placeholder:text-slate-700 sm:w-36" />
              </div>
              <select value={network} onChange={(event) => setNetwork(event.target.value)} className="h-8 rounded-lg border border-white/[0.06] bg-ink-900 px-2 text-[10px] text-slate-400 outline-none">
                <option value="all">All networks</option>
                {networks.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </div>
          {filtered.length ? (
            <div className="divide-y divide-white/[0.04]">
              {filtered.slice(0, 120).map(({ run, session, ad }) => {
                const Icon = formatIcons[ad.format] || Megaphone
                return (
                  <button
                    key={`${session.id}-${ad.id}`}
                    type="button"
                    onClick={() => setSelected({ runId: run.id, sessionId: session.id })}
                    className="group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.025] sm:px-5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-fuchsia-500/15 bg-fuchsia-500/[0.06] text-fuchsia-300">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-semibold text-slate-200">{ad.format}</p>
                        {ad.network && <span className="chip border-fuchsia-500/12 bg-fuchsia-500/[0.05] text-fuchsia-300">{ad.network}</span>}
                        <span className={cn('chip', ad.confidence === 'high' ? 'border-emerald-500/12 bg-emerald-500/[0.05] text-emerald-300' : 'border-white/[0.06] bg-white/[0.015] text-slate-500')}>{ad.confidence}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[9px] text-slate-600">#{String(session.index).padStart(2, '0')} · {session.finalDomain || 'pending'} · {shortUrl(run.inputUrl, 48)}</p>
                    </div>
                    <div className="hidden w-20 text-right sm:block">
                      <p className="text-[9px] text-slate-500">{ad.visible ? 'Visible' : 'Not visible'}</p>
                      <p className="text-[9px] text-slate-700">{ad.durationMs === null ? 'snapshot' : formatDuration(ad.durationMs)}</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-700 transition group-hover:text-slate-400" />
                  </button>
                )
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Megaphone className="h-5 w-5" />}
              title={rows.length ? 'No observations match this filter' : 'No advertising observed yet'}
              description={rows.length ? 'Try another network or search term.' : 'Run a few browser probes. Detected ad containers, formats and visibility windows will appear here — explicitly unverified.'}
            />
          )}
        </section>

        <div className="space-y-4">
          <section className="panel p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/15 bg-violet-500/[0.07] text-violet-300">
                <CircleDollarSign className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-xs font-semibold text-white">Link monetization, explained</h3>
                <p className="text-[10px] text-slate-600">What typically determines a payout</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { title: 'Advertiser demand', text: 'Networks sell space to advertisers and bid on available placements. Payouts depend on the network, geography and traffic quality.' },
                { title: 'Valid engagement', text: 'Payments are usually tied to advertiser-validated conversions, not simply loading a page. Invalid or automated engagement is commonly reversed.' },
                { title: 'Platform review', text: 'Gateway platforms often review traffic patterns. Duplicate windows, unusual device pools and forced interactions can violate terms.' },
                { title: 'Settlement delay', text: 'Reported metrics may change after fraud review. LinkPilot never infers earnings from observations.' },
              ].map((item) => (
                <div key={item.title} className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400/70" />
                  <div>
                    <p className="text-[10px] font-semibold text-slate-300">{item.title}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel border-rose-500/10 p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-500/15 bg-rose-500/[0.07] text-rose-300">
                <Ban className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-xs font-semibold text-white">Hard automation boundaries</h3>
                <p className="text-[10px] text-slate-600">Not implemented by design</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {[
                'Automatic ad clicking or engagement farming',
                'CAPTCHA solving or bot-check bypass',
                'Rewarded-link step skipping or reward manipulation',
                'Artificial traffic generation or visitor spoofing',
                'Treating separate windows or IPs as real people',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-500">
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-400/70" /> {item}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <section className="panel p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/15 bg-sky-500/[0.07] text-sky-300">
            <MousePointerClick className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <h3 className="text-xs font-semibold text-white">Verified metrics are separate by design</h3>
            <p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-slate-500">
              Authorized ad-network or analytics APIs can push validated clicks, impressions and earnings into LinkPilot's verified metrics endpoint. Until that happens, revenue remains empty — never synthesized from probe activity.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[9px]">
            {formats.slice(0, 4).map(([format, count]) => (
              <span key={format} className="chip border-white/[0.06] bg-white/[0.015] text-slate-500">{format} · {count}</span>
            ))}
          </div>
        </div>
      </section>

      <SessionDrawer
        session={selectedSession}
        run={selectedRun}
        onClose={() => setSelected(null)}
        onAction={(session, action) => {
          if (!selectedRun) return
          void sessionAction(selectedRun.id, session.id, action).catch(notifyError)
        }}
      />
    </div>
  )
}
