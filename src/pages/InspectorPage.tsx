import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ChevronRight,
  CircleSlash,
  ClipboardPaste,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  Globe2,
  Image,
  Link2,
  Loader2,
  Megaphone,
  Plus,
  ScanSearch,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Timer,
  Upload,
  Waypoints,
  XCircle,
  Zap,
} from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/AppContext'
import {
  cn,
  domainOf,
  formatDate,
  formatDuration,
  parseBulkUrls,
  parseCsvUrls,
  shortUrl,
  secureHref,
} from '../lib/utils'
import type { Analysis, RedirectFlag, ViewId } from '../types'
import { EmptyState, Modal, SectionHeader, StatusBadge, Toggle } from '../components/ui'

const flagTone: Record<RedirectFlag['severity'], string> = {
  high: 'border-rose-500/20 bg-rose-500/[0.07] text-rose-300',
  medium: 'border-amber-500/20 bg-amber-500/[0.07] text-amber-300',
  low: 'border-white/[0.08] bg-white/[0.025] text-slate-400',
}

function AnalysisRow({ analysis, onOpen }: { analysis: Analysis; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid w-full grid-cols-[1fr_auto] items-center gap-4 border-b border-white/[0.04] px-4 py-3.5 text-left transition last:border-0 hover:bg-white/[0.025] sm:grid-cols-[minmax(0,1fr)_150px_100px_90px_24px] sm:px-5"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', analysis.status === 'success' ? 'bg-emerald-400' : analysis.status === 'partial' ? 'bg-amber-400' : 'bg-rose-400')} />
          <p className="truncate text-xs font-semibold text-slate-200">{shortUrl(analysis.inputUrl, 70)}</p>
        </div>
        <p className="mt-1 truncate pl-3.5 text-[10px] text-slate-600">
          → {analysis.finalDomain || 'unresolved'}
          {analysis.redirectCount > 0 && <span className="text-slate-700"> · {analysis.redirectCount} redirect{analysis.redirectCount === 1 ? '' : 's'}</span>}
        </p>
      </div>
      <div className="hidden sm:block">
        <StatusBadge status={analysis.status === 'success' ? 'complete' : analysis.status === 'partial' ? 'blocked' : 'error'} />
      </div>
      <div className="hidden text-right sm:block">
        <p className={cn('text-[10px] font-semibold uppercase tracking-wider', analysis.suspicion === 'high' ? 'text-rose-300' : analysis.suspicion === 'medium' ? 'text-amber-300' : 'text-slate-500')}>
          {analysis.suspicion} risk
        </p>
        <p className="mt-0.5 text-[9px] text-slate-700">{formatDuration(analysis.elapsedMs)}</p>
      </div>
      <div className="hidden text-right text-[9px] text-slate-600 sm:block">{formatDate(analysis.createdAt)}</div>
      <ChevronRight className="h-3.5 w-3.5 text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
    </button>
  )
}

function ChainHop({ index, total, hop }: { index: number; total: number; hop: Analysis['redirects'][number] }) {
  return (
    <div className="relative flex gap-3 pb-5 last:pb-0">
      {index < total - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-16px)] w-px bg-gradient-to-b from-violet-500/35 to-white/[0.05]" />}
      <span className={cn(
        'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-mono text-[9px] font-bold',
        hop.statusCode && hop.statusCode >= 400
          ? 'border-rose-500/20 bg-rose-500/10 text-rose-300'
          : hop.statusCode && hop.statusCode >= 300
            ? 'border-violet-500/20 bg-violet-500/10 text-violet-300'
            : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
      )}>
        {hop.statusCode || '—'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold text-slate-200">{index === 0 ? 'Original URL' : index === total - 1 ? 'Final destination' : `Redirect ${index}`}</p>
          <span className="text-[9px] text-slate-700">{hop.elapsedMs} ms</span>
        </div>
        <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-slate-500">{hop.url}</p>
        {hop.location && hop.location !== hop.url && (
          <p className="mt-1 flex items-start gap-1 break-all text-[9px] text-violet-300/70">
            <ArrowDownRight className="mt-0.5 h-3 w-3 shrink-0" /> {hop.location}
          </p>
        )}
        {hop.note && <p className="mt-1 text-[10px] text-rose-300/80">{hop.note}</p>}
      </div>
    </div>
  )
}

function AnalysisDetail({ analysis, onClose, onNavigate }: { analysis: Analysis | null; onClose: () => void; onNavigate: (view: ViewId) => void }) {
  const { launchRun, notifyError } = useApp()
  const [launching, setLaunching] = useState(false)
  if (!analysis) return null
  const page = analysis.page

  const launch = async () => {
    setLaunching(true)
    try {
      await launchRun(analysis.inputUrl, 5)
      onClose()
      onNavigate('sessions')
    } catch (error) {
      notifyError(error)
    } finally {
      setLaunching(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={analysis.finalDomain || domainOf(analysis.inputUrl)}
      subtitle={`${analysis.inspectedWith} inspection · ${formatDuration(analysis.elapsedMs)} · ${analysis.redirectCount} redirect${analysis.redirectCount === 1 ? '' : 's'}`}
      width="max-w-5xl"
    >
      <div className="space-y-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={analysis.status === 'success' ? 'complete' : analysis.status === 'partial' ? 'blocked' : 'error'} />
          <span className={cn('chip', analysis.suspicion === 'high' ? 'border-rose-500/20 bg-rose-500/[0.07] text-rose-300' : analysis.suspicion === 'medium' ? 'border-amber-500/20 bg-amber-500/[0.07] text-amber-300' : 'border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-300')}>
            <ShieldAlert className="h-3 w-3" /> {analysis.suspicion} suspicion
          </span>
          <span className="chip border-white/[0.07] bg-white/[0.02] text-slate-400">
            <ScanSearch className="h-3 w-3" /> {analysis.inspectedWith}
          </span>
          {analysis.loopDetected && <span className="chip border-rose-500/20 bg-rose-500/10 text-rose-300"><CircleSlash className="h-3 w-3" /> Loop detected</span>}
          {analysis.insecure && <span className="chip border-amber-500/20 bg-amber-500/10 text-amber-300"><AlertTriangle className="h-3 w-3" /> HTTP hop</span>}
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
          <p className="label mb-2">Request path</p>
          <div className="space-y-2">
            <div className="flex gap-2">
              <span className="w-14 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-slate-600">Original</span>
              <p className="break-all font-mono text-[10px] text-slate-300">{analysis.inputUrl}</p>
            </div>
            <div className="flex gap-2">
              <span className="w-14 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-slate-600">Final</span>
              <p className="break-all font-mono text-[10px] text-violet-300">{analysis.finalUrl || 'Unresolved'}</p>
            </div>
          </div>
        </div>

        {analysis.flags.length > 0 && (
          <div>
            <p className="label mb-2.5">Signals & flags</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {analysis.flags.map((flag) => (
                <div key={`${flag.code}-${flag.detail}`} className={cn('rounded-xl border p-3', flagTone[flag.severity])}>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                    {flag.severity === 'high' ? <XCircle className="h-3.5 w-3.5" /> : flag.severity === 'medium' ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    {flag.label}
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">{flag.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="label mb-3">Redirect chain</p>
            <div className="rounded-2xl border border-white/[0.06] bg-black/15 p-4">
              {analysis.redirects.length ? analysis.redirects.map((hop, index) => (
                <ChainHop key={`${hop.url}-${index}`} index={index} total={analysis.redirects.length} hop={hop} />
              )) : (
                <p className="text-[11px] text-slate-500">No redirect hops were recorded.</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="label mb-3">Page evidence</p>
              {page?.screenshotUrl ? (
                <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/30">
                  <img src={page.screenshotUrl} alt={`Screenshot of ${analysis.finalDomain || 'destination'}`} className="aspect-video w-full object-cover object-top" loading="lazy" />
                </div>
              ) : (
                <div className="dot-grid flex aspect-video items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.015]">
                  <div className="text-center">
                    <Image className="mx-auto h-5 w-5 text-slate-700" />
                    <p className="mt-2 text-[10px] text-slate-600">{page ? 'Static inspection — no screenshot' : 'No page evidence captured'}</p>
                  </div>
                </div>
              )}
            </div>
            {page && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5">
                <p className="truncate text-xs font-semibold text-slate-200">{page.title || 'Untitled page'}</p>
                {page.description && <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{page.description}</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-[9px]">
                  <span className="chip border-white/[0.06] bg-black/20 text-slate-500"><Timer className="h-3 w-3" /> {formatDuration(page.loadMs)} load</span>
                  <span className="chip border-white/[0.06] bg-black/20 text-slate-500"><Megaphone className="h-3 w-3" /> {page.adObservations.length} observed ads</span>
                  {page.countdowns > 0 && <span className="chip border-amber-500/15 bg-amber-500/[0.06] text-amber-300"><Timer className="h-3 w-3" /> {page.countdowns} countdowns</span>}
                  {page.captcha && <span className="chip border-amber-500/15 bg-amber-500/[0.06] text-amber-300"><ShieldAlert className="h-3 w-3" /> CAPTCHA</span>}
                </div>
              </div>
            )}
            {analysis.aiSummary && (
              <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.045] p-3.5">
                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-violet-300">
                  <Sparkles className="h-3 w-3" /> AI session summary
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{analysis.aiSummary}</p>
              </div>
            )}
          </div>
        </div>

        {page && (page.skipControls.length > 0 || page.continueControls.length > 0 || page.countdowns > 0) && (
          <div>
            <p className="label mb-2.5">Interface controls · detected, never auto-clicked</p>
            <div className="flex flex-wrap gap-2">
              {page.skipControls.map((control) => <span key={`skip-${control}`} className="chip border-white/[0.07] bg-white/[0.02] text-slate-400">Skip: {control}</span>)}
              {page.continueControls.map((control) => <span key={`continue-${control}`} className="chip border-white/[0.07] bg-white/[0.02] text-slate-400">Continue: {control}</span>)}
            </div>
          </div>
        )}

        {page?.adObservations.length ? (
          <div>
            <p className="label mb-2.5">Observed advertising containers · not verified impressions</p>
            <div className="space-y-2">
              {page.adObservations.slice(0, 12).map((ad) => (
                <div key={ad.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
                  <Megaphone className="h-3.5 w-3.5 shrink-0 text-fuchsia-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-semibold text-slate-300">{ad.format}{ad.network ? ` · ${ad.network}` : ''}</p>
                    <p className="truncate font-mono text-[9px] text-slate-600">{ad.selector}</p>
                  </div>
                  <span className="chip border-white/[0.06] bg-black/20 text-slate-500">{ad.confidence}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] leading-relaxed text-slate-600">
            Launching probes only performs passive inspection. It does not click ads or generate artificial engagement.
          </p>
          <div className="flex gap-2">
            {analysis.finalUrl && (
              <a href={secureHref(analysis.finalUrl)} target="_blank" rel="noreferrer" className="btn-ghost !px-3 !py-2 text-[11px]">
                Open manually <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <button type="button" onClick={launch} disabled={launching} className="btn-primary !px-3 !py-2 text-[11px]">
              {launching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Launch 5 probes
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function InspectorPage({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { notify, notifyError, config } = useApp()
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [input, setInput] = useState('')
  const [bulk, setBulk] = useState('')
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Analysis | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'success' | 'risk' | 'error'>('all')
  const [deep, setDeep] = useState(true)
  const [aiSummary, setAiSummary] = useState(true)
  const [passiveScroll, setPassiveScroll] = useState(true)
  const [csvName, setCsvName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void api.listAnalyses(80)
      .then(setAnalyses)
      .catch((err) => {
        if ((err as { status?: number }).status !== 401) notifyError(err)
      })
  }, [notifyError])

  const bulkUrls = useMemo(() => parseBulkUrls(bulk), [bulk])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return analyses.filter((analysis) => {
      if (term && !`${analysis.inputUrl} ${analysis.finalUrl} ${analysis.finalDomain}`.toLowerCase().includes(term)) return false
      if (filter === 'success') return analysis.status === 'success'
      if (filter === 'risk') return analysis.suspicion !== 'low'
      if (filter === 'error') return analysis.status === 'error'
      return true
    })
  }, [analyses, search, filter])

  const analyzeSingle = async () => {
    if (!input.trim()) {
      setError('Enter a URL to inspect.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const analysis = await api.analyze(input.trim(), { deep, aiSummary, passiveScroll })
      setAnalyses((current) => [analysis, ...current.filter((item) => item.id !== analysis.id)])
      setSelected(analysis)
      notify('URL inspection complete.', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inspection failed.')
      notifyError(err)
    } finally {
      setLoading(false)
    }
  }

  const analyzeBulk = async () => {
    if (!bulkUrls.length) {
      setError('Add at least one valid URL.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await api.analyzeBulk(bulkUrls, { deep })
      const completed = response.results
        .map((result) => result.analysis)
        .filter((analysis): analysis is Analysis => Boolean(analysis))
      const failed = response.results.filter((result) => result.error)
      setAnalyses((current) => [...completed, ...current.filter((item) => !completed.some((next) => next.id === item.id))])
      if (completed[0]) setSelected(completed[0])
      notify(`${completed.length} URL${completed.length === 1 ? '' : 's'} inspected${failed.length ? `, ${failed.length} failed` : ''}.`, completed.length ? 'success' : 'error')
      if (failed.length) setError(failed.map((item) => `${item.url}: ${item.error}`).join(' · '))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk inspection failed.')
      notifyError(err)
    } finally {
      setLoading(false)
    }
  }

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 2_000_000) {
      setError('CSV must be 2 MB or smaller.')
      return
    }
    try {
      const text = await file.text()
      const urls = parseCsvUrls(text)
      if (!urls.length) {
        setError('No URLs were found in this CSV. Include a column containing absolute URLs.')
        return
      }
      setBulk(urls.join('\n'))
      setCsvName(`${file.name} · ${urls.length} URLs`)
      setMode('bulk')
      setError(null)
      notify(`Imported ${urls.length} URLs from ${file.name}.`, 'success')
    } catch (err) {
      notifyError(err)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Destination forensics"
        title="URL Inspector"
        description="Follow every redirect hop, evaluate destination risk and capture page evidence. Deep inspection uses Playwright with SSRF guards when a browser worker is available."
        action={
          <button type="button" onClick={() => onNavigate('settings')} className="btn-ghost text-[11px]">
            <ShieldCheck className="h-3.5 w-3.5" /> Inspection policy
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <section className="panel p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl border border-white/[0.06] bg-black/20 p-1">
              <button type="button" onClick={() => setMode('single')} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-semibold transition', mode === 'single' ? 'bg-white/[0.08] text-white' : 'text-slate-500 hover:text-slate-300')}>
                Single URL
              </button>
              <button type="button" onClick={() => setMode('bulk')} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-semibold transition', mode === 'bulk' ? 'bg-white/[0.08] text-white' : 'text-slate-500 hover:text-slate-300')}>
                Bulk / CSV
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept=".csv,text/csv,.txt" onChange={onFile} className="hidden" />
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost !px-2.5 !py-1.5 text-[10px]">
                <Upload className="h-3.5 w-3.5" /> Import CSV
              </button>
            </div>
          </div>

          {mode === 'single' ? (
            <div className="mt-4">
              <label className="label mb-2 block" htmlFor="inspect-url">URL or short link</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-ink-900/80 px-3 focus-within:border-violet-500/50 focus-within:ring-4 focus-within:ring-violet-500/10">
                  <Link2 className="h-4 w-4 text-slate-600" />
                  <input
                    id="inspect-url"
                    value={input}
                    onChange={(event) => {
                      setInput(event.target.value)
                      setError(null)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void analyzeSingle()
                    }}
                    placeholder="https://bit.ly/example or any tracking link"
                    className="h-11 w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
                    spellCheck={false}
                  />
                </div>
                <button type="button" onClick={analyzeSingle} disabled={loading} className="btn-primary h-11 shrink-0 !px-4">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                  {loading ? 'Inspecting' : 'Inspect URL'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="label" htmlFor="bulk-urls">URLs · one per line or comma separated</label>
                <span className="text-[10px] text-slate-600">{bulkUrls.length}/25 detected</span>
              </div>
              <textarea
                id="bulk-urls"
                value={bulk}
                onChange={(event) => {
                  setBulk(event.target.value)
                  setCsvName(null)
                  setError(null)
                }}
                rows={5}
                placeholder={'https://short.link/one\nhttps://short.link/two\nhttps://example.com/tracked?utm_source=test'}
                className="input min-h-[130px] resize-y font-mono text-[11px] leading-relaxed"
                spellCheck={false}
              />
              {csvName && <p className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-300"><FileSpreadsheet className="h-3 w-3" /> {csvName}</p>}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText()
                      const urls = parseCsvUrls(text) || parseBulkUrls(text)
                      if (urls.length) setBulk(urls.join('\n'))
                      else notify('Clipboard did not contain a valid URL.', 'info')
                    } catch {
                      notify('Clipboard access was denied by the browser.', 'error')
                    }
                  }}
                  className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"
                >
                  <ClipboardPaste className="h-3 w-3" /> Paste from clipboard
                </button>
                <button type="button" onClick={analyzeBulk} disabled={loading || !bulkUrls.length} className="btn-primary !px-4 !py-2 text-[11px]">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Inspect {bulkUrls.length || ''} URL{bulkUrls.length === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          )}

          {error && <p className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-rose-300">{error}</p>}

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Toggle checked={deep} onChange={setDeep} label="Deep inspect" description={config?.automationEnabled ? 'Playwright page evidence' : 'Static fallback active'} />
            <Toggle checked={aiSummary} onChange={setAiSummary} label="AI summary" description={config?.aiMode === 'llm' ? config.aiModel || 'Configured model' : 'Deterministic fallback'} />
            <Toggle checked={passiveScroll} onChange={setPassiveScroll} label="Passive scroll" description="Reveal below-fold elements" />
          </div>
        </section>

        <section className="panel relative overflow-hidden p-5 sm:p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="relative">
            <p className="label text-violet-300/80">Inspection pipeline</p>
            <h3 className="mt-2 text-lg font-semibold text-white">Evidence, not assumptions.</h3>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              LinkPilot resolves ordinary HTTP redirects first, then opens the final destination in an isolated context to observe page signals.
            </p>
            <div className="mt-5 space-y-3">
              {[
                { icon: ShieldCheck, label: 'SSRF + port guard', detail: 'Private addresses and non-standard ports blocked' },
                { icon: Waypoints, label: 'Manual redirect trace', detail: 'Up to 12 hops, loop and limit detection' },
                { icon: ScanSearch, label: 'Page signal scan', detail: 'Ads, controls, timers, CAPTCHA and blocked states' },
                { icon: Sparkles, label: 'Configured AI summary', detail: 'Untrusted content isolated from system instructions' },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-violet-300">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold text-slate-300">{item.label}</p>
                      <p className="text-[10px] leading-relaxed text-slate-600">{item.detail}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-5 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.035] p-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300/80">Boundary</p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                CAPTCHAs are reported, never solved. Advertisements are observed, never clicked. No interaction is counted as a click or impression.
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-white/[0.05] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Inspection history</h3>
            <p className="mt-0.5 text-[10px] text-slate-600">{analyses.length} stored analyses · click any row for full evidence</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-black/20 px-2.5">
              <Search className="h-3 w-3 text-slate-600" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search URLs" className="h-8 w-32 bg-transparent text-[11px] text-slate-300 outline-none placeholder:text-slate-700 sm:w-40" />
            </div>
            <div className="flex rounded-lg border border-white/[0.06] bg-black/20 p-0.5">
              {(['all', 'success', 'risk', 'error'] as const).map((value) => (
                <button key={value} type="button" onClick={() => setFilter(value)} className={cn('rounded-md px-2 py-1 text-[9px] font-semibold uppercase tracking-wider transition', filter === value ? 'bg-white/[0.08] text-white' : 'text-slate-600 hover:text-slate-400')}>
                  {value}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void api.listAnalyses(80).then(setAnalyses)} className="btn-ghost h-8 !px-2 !py-0" title="Refresh history">
              <Filter className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {filtered.length ? (
          <div>{filtered.map((analysis) => <AnalysisRow key={analysis.id} analysis={analysis} onOpen={() => setSelected(analysis)} />)}</div>
        ) : (
          <EmptyState
            icon={<Globe2 className="h-5 w-5" />}
            title={analyses.length ? 'No analyses match this filter' : 'No URL analyses yet'}
            description={analyses.length ? 'Adjust the search or status filter.' : 'Inspect a single URL, paste a list, or import a CSV to build your destination evidence log.'}
            action={!analyses.length ? (
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost text-[11px]">
                <Download className="h-3.5 w-3.5" /> Import CSV
              </button>
            ) : undefined}
          />
        )}
      </section>

      <AnalysisDetail analysis={selected} onClose={() => setSelected(null)} onNavigate={onNavigate} />
    </div>
  )
}
