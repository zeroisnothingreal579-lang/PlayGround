import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  Clock3,
  FileUp,
  Globe2,
  Info,
  Link2,
  Lock,
  Radar,
  ScanLine,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Timer,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { api } from '../lib/api'
import type { Inspection } from '../lib/types'
import { cn, domainOf, parseCsvUrls, timeAgo, truncateMiddle } from '../lib/utils'
import { EmptyState, InfoNote, PageHeader, Segmented, Spinner, StatusPill } from '../components/ui'

function riskIcon(level: string) {
  if (level === 'high') return <ShieldAlert size={14} />
  if (level === 'medium') return <AlertTriangle size={14} />
  return <ShieldCheck size={14} />
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'ok') return <CheckCircle2 size={13} className="text-mint" />
  if (status === 'captcha') return <Lock size={13} className="text-amber" />
  if (status === 'blocked') return <CircleSlash size={13} className="text-coral" />
  if (status === 'loop') return <TriangleAlert size={13} className="text-amber" />
  return <XCircle size={13} className="text-coral" />
}

function ChainView({ inspection }: { inspection: Inspection }) {
  const hops = inspection.redirects || []
  return (
    <div className="relative mt-3 space-y-0">
      {hops.map((hop, index) => (
        <div key={`${hop.url}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
          {index < hops.length - 1 && <span className="absolute left-[13px] top-6 h-[calc(100%-12px)] w-px bg-gradient-to-b from-violet-500/40 to-white/[0.06]" />}
          <div className={cn('relative z-10 mt-0.5 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-lg border text-[9px] font-semibold', index === hops.length - 1 ? 'border-violet-500/30 bg-violet-500/15 text-violet-200' : 'border-white/[0.08] bg-ink-900 text-ink-400')}>
            {index === 0 ? <Link2 size={12} /> : index === hops.length - 1 ? <Globe2 size={12} /> : <ArrowRight size={11} />}
          </div>
          <div className="min-w-0 flex-1 rounded-lg border border-white/[0.045] bg-ink-950/35 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="mono min-w-0 break-all text-[10.5px] leading-relaxed text-ink-200">{hop.url}</p>
              <span className={cn('shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px]', hop.statusCode >= 400 ? 'border-coral/20 bg-coral/5 text-coral' : hop.statusCode >= 300 ? 'border-amber/20 bg-amber/5 text-amber' : 'border-white/[0.07] bg-white/[0.03] text-ink-400')}>
                {hop.statusCode || '—'}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] text-ink-500">
              <span>{index === 0 ? 'Original' : index === hops.length - 1 ? 'Final response' : 'Redirect'}</span>
              {hop.location && <span className="mono truncate">→ {truncateMiddle(hop.location, 50)}</span>}
              {hop.note && <span className="text-amber">{hop.note}</span>}
            </div>
          </div>
        </div>
      ))}
      {!hops.length && <p className="text-[11px] text-ink-500">No redirect chain was captured.</p>}
    </div>
  )
}

function ResultDetail({ inspection, onAi, aiBusy }: { inspection: Inspection; onAi: () => void; aiBusy: boolean }) {
  const { notify } = useApp()
  const adNetworks = inspection.ads?.networks || []
  return (
    <div className="space-y-4">
      <div className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusPill status={inspection.pageStatus} />
              <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium', inspection.risk.level === 'high' ? 'text-coral' : inspection.risk.level === 'medium' ? 'text-amber' : 'text-mint')}>
                {riskIcon(inspection.risk.level)} {inspection.risk.level} risk
              </span>
            </div>
            <h2 className="mt-2 break-all text-[16px] font-semibold tracking-[-0.02em] text-white">{inspection.finalDomain || domainOf(inspection.originalUrl) || 'Unresolved destination'}</h2>
            <p className="mt-1 text-[10.5px] text-ink-500">Inspected {timeAgo(inspection.createdAt || inspection.inspectedAt)} · {inspection.durationMs} ms · HTTP {inspection.statusCode || '—'}</p>
          </div>
          <button className="btn-secondary shrink-0 px-3 py-1.5 text-[11px]" onClick={() => void navigator.clipboard?.writeText(inspection.finalUrl || inspection.originalUrl).then(() => notify('Destination copied', 'success')).catch(() => notify('Copy failed', 'error'))}>
            <Link2 size={12} />
            Copy URL
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-white/[0.055] bg-white/[0.018] p-2.5">
            <p className="text-[9px] uppercase tracking-[0.1em] text-ink-500">Redirects</p>
            <p className="mt-1 text-[15px] font-semibold text-ink-100">{inspection.redirectCount}</p>
          </div>
          <div className="rounded-lg border border-white/[0.055] bg-white/[0.018] p-2.5">
            <p className="text-[9px] uppercase tracking-[0.1em] text-ink-500">Load time</p>
            <p className="mt-1 text-[15px] font-semibold text-ink-100">{inspection.durationMs}<span className="ml-0.5 text-[9px] text-ink-500">ms</span></p>
          </div>
          <div className="rounded-lg border border-white/[0.055] bg-white/[0.018] p-2.5">
            <p className="text-[9px] uppercase tracking-[0.1em] text-ink-500">Ad elements</p>
            <p className="mt-1 text-[15px] font-semibold text-ink-100">{inspection.ads?.elementCount ?? 0}</p>
          </div>
          <div className="rounded-lg border border-white/[0.055] bg-white/[0.018] p-2.5">
            <p className="text-[9px] uppercase tracking-[0.1em] text-ink-500">Ad networks</p>
            <p className="mt-1 text-[15px] font-semibold text-ink-100">{adNetworks.length}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.055] bg-ink-950/40 p-3">
          <p className="label">Final destination</p>
          <div className="mt-1.5 flex items-start gap-2">
            <Globe2 size={13} className="mt-0.5 shrink-0 text-violet-300" />
            <p className="mono min-w-0 break-all text-[10.5px] leading-relaxed text-ink-200">{inspection.finalUrl || inspection.error || 'Not resolved'}</p>
          </div>
          {inspection.finalUrl && inspection.finalUrl !== inspection.originalUrl && (
            <div className="mt-2 border-t border-white/[0.045] pt-2">
              <p className="text-[9px] uppercase tracking-[0.1em] text-ink-500">Original URL</p>
              <p className="mono mt-1 break-all text-[9.5px] leading-relaxed text-ink-500">{inspection.originalUrl}</p>
            </div>
          )}
        </div>

        {inspection.error && (
          <div className="mt-3 flex gap-2 rounded-lg border border-coral/15 bg-coral/[0.05] p-3 text-[11px] text-coral">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {inspection.error}
          </div>
        )}

        {inspection.risk.reasons?.length > 0 && (
          <div className="mt-4">
            <p className="label">Risk & integrity notes</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {inspection.risk.reasons.map((reason) => (
                <span key={reason} className="chip border-amber/15 bg-amber/[0.045] text-[10px] text-amber/90"><Info size={10} />{reason}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-white">Redirect chain</h3>
            <p className="mt-0.5 text-[10.5px] text-ink-500">Every hop observed via manual redirect handling.</p>
          </div>
          <Radar size={15} className="text-ink-500" />
        </div>
        <ChainView inspection={inspection} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="panel p-4">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-amber" />
            <h3 className="text-[12.5px] font-semibold text-white">Advertising signals</h3>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.055] bg-white/[0.02] px-3 py-2.5">
            <span className="text-[11px] text-ink-300">Detected</span>
            <StatusPill status={inspection.ads?.detected ? 'warn' : 'ok'} label={inspection.ads?.detected ? 'ad elements' : 'none'} />
          </div>
          <p className="mt-2 text-[9.5px] leading-relaxed text-ink-500">{inspection.ads?.note || 'No advertising detection notes.'}</p>
          {adNetworks.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {adNetworks.map((network) => <span key={network} className="chip text-[9.5px]">{network}</span>)}
            </div>
          ) : (
            <p className="mt-3 text-[10px] text-ink-500">No recognizable ad networks in the HTML response.</p>
          )}
        </div>

        <div className="panel p-4">
          <div className="flex items-center gap-2">
            <Timer size={14} className="text-sky" />
            <h3 className="text-[12.5px] font-semibold text-white">Interface controls</h3>
          </div>
          <div className="mt-3 space-y-1.5">
            {['countdown', 'skip', 'continue', 'reward'].map((control) => (
              <div key={control} className="flex items-center justify-between rounded-lg border border-white/[0.045] bg-white/[0.015] px-3 py-2">
                <span className="text-[10.5px] capitalize text-ink-300">{control}</span>
                <span className={cn('text-[10px] font-medium', (inspection.controls as Record<string, boolean>)?.[control] ? 'text-amber' : 'text-ink-600')}>
                  {(inspection.controls as Record<string, boolean>)?.[control] ? 'identified' : 'not found'}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[9px] leading-relaxed text-ink-500">Controls are reported only. Automated activation and countdown bypasses are disabled.</p>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] p-4">
          <div>
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-violet-300" />
              <h3 className="text-[13px] font-semibold text-white">AI page analysis</h3>
              {inspection.ai && <span className="chip text-[9px]">{inspection.ai.source === 'language-model' ? 'model API' : 'heuristic'}</span>}
            </div>
            <p className="mt-0.5 text-[10.5px] text-ink-500">Conservative summary grounded in captured evidence.</p>
          </div>
          <button className="btn-secondary px-3 py-1.5 text-[10.5px]" onClick={onAi} disabled={aiBusy}>
            {aiBusy ? <Spinner size={12} /> : <Sparkles size={12} />}
            {inspection.ai ? 'Re-analyse' : 'Analyse'}
          </button>
        </div>
        <div className="p-4">
          {inspection.ai ? (
            <>
              <p className="text-[11.5px] leading-relaxed text-ink-300">{inspection.ai.summary}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Page type', inspection.ai.pageType || '—'],
                  ['Confidence', `${Math.round(inspection.ai.confidence * 100)}%`],
                  ['CAPTCHA', inspection.ai.captcha ? 'detected' : 'none'],
                  ['Blocked', inspection.ai.blocked ? 'yes' : 'no'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-white/[0.045] bg-white/[0.015] p-2.5">
                    <p className="text-[9px] uppercase tracking-[0.09em] text-ink-500">{label}</p>
                    <p className="mt-1 text-[10.5px] capitalize text-ink-200">{value}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[11px] leading-relaxed text-ink-500">No AI summary yet. Run analysis to describe the page, advertising signals, and redirect outcome.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function InspectorPage() {
  const { overview, revision, notify, navigate } = useApp()
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [input, setInput] = useState('')
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [query, setQuery] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.inspections(100)
      .then((data) => {
        setInspections((current) => {
          const map = new Map([...data.inspections, ...current].map((item) => [item.id, item]))
          return [...map.values()].sort((a, b) => new Date(b.createdAt || b.inspectedAt).getTime() - new Date(a.createdAt || a.inspectedAt).getTime())
        })
        setSelectedId((current) => current || data.inspections[0]?.id || null)
      })
      .catch(() => {})
  }, [revision])

  useEffect(() => {
    if (!inspections.length && overview?.recentInspections?.length) {
      setInspections(overview.recentInspections)
      setSelectedId(overview.recentInspections[0].id)
    }
  }, [overview, inspections.length])

  const selected = inspections.find((item) => item.id === selectedId) || inspections[0] || null
  const filtered = useMemo(() => {
    const lower = query.toLowerCase().trim()
    if (!lower) return inspections
    return inspections.filter((item) => `${item.originalUrl} ${item.finalUrl} ${item.pageStatus} ${item.risk.level}`.toLowerCase().includes(lower))
  }, [inspections, query])

  const inspect = async () => {
    const urls = mode === 'single' ? [input.trim()] : parseCsvUrls(input)
    if (!urls.length || urls.some((url) => !/^https?:\/\//i.test(url))) {
      notify('Enter one or more valid HTTP or HTTPS URLs.', 'warn')
      return
    }
    setBusy(true)
    try {
      const result = await api.inspect(urls)
      const next = result.inspections.map((item) => ({ ...item, createdAt: item.inspectedAt }))
      setInspections((current) => [...next, ...current.filter((item) => !next.some((entry) => entry.id === item.id))])
      setSelectedId(next[0]?.id || null)
      notify(`${result.accepted} link${result.accepted === 1 ? '' : 's'} inspected.`, 'success')
      setInput('')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Inspection failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const runAi = async () => {
    if (!selected) return
    setAiBusy(true)
    try {
      const result = await api.inspectWithAi(selected.id)
      setInspections((current) => current.map((item) => item.id === selected.id ? { ...item, ai: result.analysis } : item))
      notify('AI analysis complete.', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'AI analysis failed', 'error')
    } finally {
      setAiBusy(false)
    }
  }

  const importCsv = async (file?: File) => {
    if (!file) return
    const text = await file.text()
    const urls = parseCsvUrls(text)
    if (!urls.length) {
      notify('No URLs found in that file.', 'warn')
      return
    }
    setMode('bulk')
    setInput(urls.join('\n'))
    notify(`${urls.length} URLs loaded from ${file.name}.`, 'info')
  }

  return (
    <>
      <PageHeader
        eyebrow="Link intelligence"
        title="URL Inspector"
        description="Validate links, walk redirect chains, identify final destinations, and surface advertising or challenge signals before launching sessions."
        actions={
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            <FileUp size={14} /> Import CSV
          </button>
        }
      />

      <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(event) => void importCsv(event.target.files?.[0])} />

      <div className="panel mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Segmented
              options={[{ value: 'single', label: 'Single URL' }, { value: 'bulk', label: 'Bulk / CSV' }]}
              value={mode}
              onChange={(value) => setMode(value)}
            />
            {mode === 'bulk' && <span className="chip text-[9.5px]">one URL per line or CSV column</span>}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-ink-500">
            <ShieldCheck size={12} className="text-mint" />
            SSRF protection active
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {mode === 'single' ? (
            <div className="relative flex-1">
              <Link2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void inspect()}
                className="input-lg mono pl-10 text-[12.5px]"
                placeholder="https://bit.ly/example or any redirect URL"
              />
            </div>
          ) : (
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={4}
              className="input mono min-h-[98px] flex-1 resize-y text-[11.5px] leading-relaxed"
              placeholder={'https://short.link/one\nhttps://short.link/two\n\nOr paste CSV rows containing URLs.'}
            />
          )}
          <button className="btn-primary h-[46px] shrink-0 px-5 sm:h-auto" onClick={() => void inspect()} disabled={busy}>
            {busy ? <Spinner /> : <ScanLine size={15} />}
            {busy ? 'Inspecting…' : 'Inspect'}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-ink-500">
          <span className="flex items-center gap-1"><Clock3 size={10} />9s per-hop timeout</span>
          <span className="flex items-center gap-1"><ArrowDown size={10} />max 10 redirects</span>
          <span className="flex items-center gap-1"><ShieldCheck size={10} />private networks blocked</span>
          <span className="flex items-center gap-1"><Sparkles size={10} />no ad interaction</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(300px,0.75fr)_minmax(0,1.55fr)]">
        <div className="panel flex max-h-[calc(100vh-180px)] min-h-[400px] flex-col overflow-hidden">
          <div className="border-b border-white/[0.06] p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold text-white">Inspection history</p>
              <span className="chip text-[9px]">{inspections.length}</span>
            </div>
            <div className="relative mt-2.5">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter inspected links…" className="input py-2 pl-8 text-[11px]" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length ? filtered.map((inspection) => (
              <button
                key={inspection.id}
                onClick={() => setSelectedId(inspection.id)}
                className={cn('flex w-full items-start gap-2.5 border-b border-white/[0.04] px-3.5 py-3 text-left transition-colors last:border-0', selected?.id === inspection.id ? 'bg-violet-500/[0.065]' : 'hover:bg-white/[0.02]')}
              >
                <div className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', inspection.pageStatus === 'ok' ? 'bg-mint' : inspection.pageStatus === 'captcha' ? 'bg-amber' : 'bg-coral')} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-medium text-ink-200">{inspection.finalDomain || domainOf(inspection.originalUrl)}</p>
                    <span className="shrink-0 text-[9px] text-ink-600">{timeAgo(inspection.createdAt || inspection.inspectedAt)}</span>
                  </div>
                  <p className="mono mt-1 truncate text-[9px] text-ink-500">{truncateMiddle(inspection.originalUrl, 46)}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <StatusIcon status={inspection.pageStatus} />
                    <span className="text-[9px] capitalize text-ink-400">{inspection.pageStatus}</span>
                    <span className="text-[9px] text-ink-600">·</span>
                    <span className="text-[9px] text-ink-500">{inspection.redirectCount} redirects</span>
                    {inspection.ads?.detected && <span className="ml-auto rounded bg-amber/10 px-1 py-0.5 text-[8px] text-amber">ads</span>}
                  </div>
                </div>
                <ChevronRight size={12} className={cn('mt-1 shrink-0', selected?.id === inspection.id ? 'text-violet-300' : 'text-ink-600')} />
              </button>
            )) : (
              <EmptyState compact icon={<ScanLine size={19} />} title={query ? 'No matching inspections' : 'No inspections yet'} description={query ? 'Try a different domain or status.' : 'Submit a URL above to capture its redirect chain and page signals.'} />
            )}
          </div>
        </div>

        <div className="min-w-0">
          {selected ? (
            <ResultDetail inspection={selected} onAi={() => void runAi()} aiBusy={aiBusy} />
          ) : (
            <div className="panel flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/[0.07]">
                <Radar size={26} className="text-violet-300" />
                <span className="absolute inset-0 animate-pulse-ring rounded-2xl" />
              </div>
              <h3 className="mt-5 text-[15px] font-semibold text-white">Ready to inspect</h3>
              <p className="mt-2 max-w-sm text-[11.5px] leading-relaxed text-ink-400">Paste a shortened, tracking, or redirect URL. LinkPilot follows the chain safely and reports status, destination, risk, and advertising signals.</p>
              <div className="mt-5 flex gap-2">
                <button className="btn-secondary text-[11px]" onClick={() => navigate('sessions')}>Open sessions</button>
                <button className="btn-primary text-[11px]" onClick={() => setInput('https://example.com')}><Link2 size={12} /> Try example</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <InfoNote tone="amber" icon={<TriangleAlert size={15} />}>
          Advertising is detected and described, never engaged. LinkPilot does not click ads, skip rewarded-link countdowns, or produce visits that could be counted as human traffic.
        </InfoNote>
      </div>
    </>
  )
}
