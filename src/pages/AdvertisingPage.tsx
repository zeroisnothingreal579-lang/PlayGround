import {
  ArrowRight,
  Ban,
  BadgeDollarSign,
  BarChart3,
  Check,
  Clock3,
  Eye,
  ExternalLink,
  Gauge,
  Info,
  Lock,
  MousePointerClick,
  Network,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { api } from '../lib/api'
import type { AdsResponse } from '../lib/types'
import { cn, formatNumber, timeAgo, truncateMiddle } from '../lib/utils'
import { EmptyState, InfoNote, PageHeader, SectionTitle, StatCard, StatusPill } from '../components/ui'

export default function AdvertisingPage() {
  const { revision, navigate, overview } = useApp()
  const [data, setData] = useState<AdsResponse | null>(null)

  useEffect(() => {
    api.ads().then(setData).catch(() => {})
  }, [revision])

  const networkCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const event of data?.events || []) {
      for (const network of event.networks?.length ? event.networks : [event.network]) {
        if (!network) continue
        counts.set(network, (counts.get(network) || 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [data])

  const formatCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const event of data?.events || []) counts.set(event.format, (counts.get(event.format) || 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [data])

  const verified = data?.summary.verifiedImpressions || 0
  const totalDetections = data?.summary.detections || 0

  return (
    <>
      <PageHeader
        eyebrow="Ad intelligence"
        title="Advertising analysis"
        description="Understand what advertising is present, which networks are identifiable, and how visibility differs from a verified impression."
        actions={
          <button className="btn-secondary" onClick={() => navigate('settings')}>
            <Gauge size={14} /> Integration settings
          </button>
        }
      />

      <div className="mb-4">
        <div className="panel relative overflow-hidden border-mint/15 bg-mint/[0.035] p-4 sm:p-5">
          <div className="glow-orb -right-10 -top-20 h-56 w-56 bg-mint/10" />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-mint/20 bg-mint/10 text-mint">
                <ShieldCheck size={19} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white">Analysis-only advertising policy</p>
                <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-ink-400">{data?.policy.summary || 'LinkPilot inspects and reports advertising without engaging it.'}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusPill status="active" label="Enforced" />
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard label="Ad detections" value={formatNumber(totalDetections)} icon={<Sparkles size={18} />} accent="amber" sub={<>DOM and response signals</>} />
        <StatCard label="Sessions with ads" value={formatNumber(overview?.analytics.totals.adSessions || 0)} icon={<ScanLine size={18} />} accent="violet" sub={<>of {formatNumber(overview?.analytics.totals.sessions || 0)} sessions</>} />
        <StatCard label="Networks identified" value={formatNumber(networkCounts.length)} icon={<Network size={18} />} accent="sky" sub={<>when reliably detectable</>} />
        <StatCard label="Verified impressions" value={formatNumber(verified)} icon={<Eye size={18} />} accent="mint" badge={<span className="chip px-1.5 py-0.5 text-[9px]">{verified ? 'authorized' : 'not supplied'}</span>} sub={<>only from integrations</>} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        <div className="space-y-4">
          <div className="panel p-4 sm:p-5">
            <SectionTitle title="Detection vs. verification" description="Two different states that must never be conflated." />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-amber/15 bg-amber/[0.04] p-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={15} className="text-amber" />
                  <p className="text-[12px] font-semibold text-ink-100">Detected element</p>
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-ink-400">An ad container, iframe, script signature, or sponsored block was observed in the page. This is evidence of a placement, not proof that an advertiser paid for an impression.</p>
                <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-amber/80">not billable · not verified</p>
              </div>
              <div className="rounded-xl border border-mint/15 bg-mint/[0.04] p-4">
                <div className="flex items-center gap-2">
                  <BadgeDollarSign size={15} className="text-mint" />
                  <p className="text-[12px] font-semibold text-ink-100">Verified event</p>
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-ink-400">A click, impression, visit, or earning was supplied by an authorized analytics or publisher API. LinkPilot displays it as-is and never invents values.</p>
                <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-mint/80">authorized source required</p>
              </div>
            </div>
          </div>

          <div className="panel p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <SectionTitle title="Recent advertising detections" description="Formats, networks, and measured visibility." />
              <span className="chip text-[9px]">{data?.events.length || 0} records</span>
            </div>
            {data?.events.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[9px] uppercase tracking-[0.1em] text-ink-500">
                      <th className="pb-2 font-medium">Destination</th>
                      <th className="pb-2 font-medium">Network</th>
                      <th className="pb-2 font-medium">Format</th>
                      <th className="pb-2 font-medium">Visible</th>
                      <th className="pb-2 font-medium">State</th>
                      <th className="pb-2 font-medium">Detected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.slice(0, 12).map((event) => (
                      <tr key={event.id} className="table-row">
                        <td className="max-w-[200px] py-2.5 pr-3">
                          <p className="truncate text-[10.5px] font-medium text-ink-200">{event.domain || 'unknown domain'}</p>
                          <p className="mono mt-0.5 truncate text-[8.5px] text-ink-600">{truncateMiddle(event.url, 38)}</p>
                        </td>
                        <td className="py-2.5 pr-3"><span className="chip px-1.5 py-0.5 text-[9px]">{event.network || 'Unidentified'}</span></td>
                        <td className="py-2.5 pr-3 text-[10px] capitalize text-ink-300">{event.format}</td>
                        <td className="py-2.5 pr-3 font-mono text-[10px] text-ink-300">{(event.visibleMs / 1000).toFixed(1)}s</td>
                        <td className="py-2.5 pr-3"><span className="text-[9px] uppercase tracking-[0.08em] text-amber">detected</span></td>
                        <td className="py-2.5 text-[9px] text-ink-500">{timeAgo(event.detectedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState compact icon={<Sparkles size={19} />} title="No ad detections yet" description="Inspect a page or launch sessions. Advertising detections will appear here without being clicked or counted as impressions." action={<button className="btn-secondary text-[11px]" onClick={() => navigate('inspector')}>Inspect a link</button>} />
            )}
          </div>

          <div className="panel p-4 sm:p-5">
            <SectionTitle title="Monetization rules, explained" description="Why opening windows does not create payouts." />
            <div className="mt-4 space-y-2.5">
              {(data?.policy.monetization || []).map((rule, index) => (
                <div key={rule} className="flex gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 font-mono text-[10px] text-violet-300">{String(index + 1).padStart(2, '0')}</span>
                  <p className="text-[10.5px] leading-relaxed text-ink-400">{rule}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-4 sm:p-5">
            <SectionTitle title="Network distribution" description="Only reliably identifiable networks are named." />
            {networkCounts.length ? (
              <div className="mt-4 space-y-3">
                {networkCounts.slice(0, 7).map(([network, count], index) => {
                  const max = networkCounts[0][1]
                  return (
                    <div key={network}>
                      <div className="mb-1.5 flex items-center justify-between text-[10px]">
                        <span className="text-ink-300">{network}</span>
                        <span className="font-mono text-ink-500">{count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                        <div className={cn('h-full rounded-full', index === 0 ? 'bg-amber' : index === 1 ? 'bg-violet-400' : 'bg-sky/70')} style={{ width: `${Math.max(6, (count / max) * 100)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-6 flex flex-col items-center py-6 text-center">
                <Network size={21} className="text-ink-600" />
                <p className="mt-2 text-[10.5px] text-ink-500">Network names appear after detections.</p>
              </div>
            )}
            {formatCounts.length > 0 && (
              <div className="mt-5 border-t border-white/[0.05] pt-4">
                <p className="label">Formats</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {formatCounts.map(([format, count]) => <span key={format} className="chip text-[9.5px] capitalize">{format} · {count}</span>)}
                </div>
              </div>
            )}
          </div>

          <div className="panel p-4 sm:p-5">
            <SectionTitle title="Automation boundaries" description="Hard-coded, not configurable." />
            <div className="mt-4 space-y-1.5">
              {(data?.policy.prohibited || []).map((item) => (
                <div key={item} className="flex items-start gap-2 rounded-lg border border-coral/10 bg-coral/[0.025] px-2.5 py-2">
                  <Ban size={11} className="mt-0.5 shrink-0 text-coral" />
                  <span className="text-[9.5px] leading-relaxed text-ink-400">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1.5">
              {(data?.policy.allowed || []).map((item) => (
                <div key={item} className="flex items-start gap-2 rounded-lg border border-mint/10 bg-mint/[0.02] px-2.5 py-2">
                  <Check size={11} className="mt-0.5 shrink-0 text-mint" />
                  <span className="text-[9.5px] leading-relaxed text-ink-400">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <BarChart3 size={14} className="text-sky" />
              <h3 className="text-[12.5px] font-semibold text-white">Authorized integrations</h3>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.018] px-3 py-2.5">
                <div>
                  <p className="text-[10.5px] text-ink-200">Publisher analytics</p>
                  <p className="mt-0.5 text-[8.5px] uppercase tracking-[0.08em] text-ink-600">{data?.summary.verifiedImpressions ? 'verified data present' : 'not connected'}</p>
                </div>
                <StatusPill status={data?.summary.verifiedImpressions ? 'ok' : 'queued'} label={data?.summary.verifiedImpressions ? 'connected' : 'offline'} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.018] px-3 py-2.5">
                <div>
                  <p className="text-[10.5px] text-ink-200">Signed webhook</p>
                  <p className="mt-0.5 text-[8.5px] uppercase tracking-[0.08em] text-ink-600">HMAC-SHA256 verification</p>
                </div>
                <Lock size={12} className="text-ink-500" />
              </div>
            </div>
            <button className="btn-secondary mt-3 w-full py-2 text-[10.5px]" onClick={() => navigate('settings')}>
              Configure integration <ArrowRight size={11} />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { icon: MousePointerClick, title: 'No automated ad clicks', text: 'No mouse, touch, or script events target advertising.' },
          { icon: Clock3, title: 'No countdown bypass', text: 'Timers and skip controls are reported, never manipulated.' },
          { icon: ExternalLink, title: 'No fake traffic', text: 'IPs and windows are never presented as distinct human visitors.' },
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
        <InfoNote tone="violet" icon={<Info size={15} />}>
          <strong className="text-violet-200">Authorized testing only.</strong> Use this workspace on properties you own or have written permission to test. Ad-network terms and anti-fraud rules still apply. Detection output is evidence, not a revenue guarantee.
        </InfoNote>
      </div>
    </>
  )
}
