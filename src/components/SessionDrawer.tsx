import { useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  Bot,
  Clock3,
  ExternalLink,
  Globe2,
  ImageOff,
  ListChecks,
  Megaphone,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Timer,
  Waypoints,
} from 'lucide-react'
import {
  cn,
  domainOf,
  formatDate,
  formatDuration,
  secureHref,
  shortUrl,
} from '../lib/utils'
import type { BrowserSession, Run } from '../types'
import { Modal, StatusBadge } from './ui'

type Tab = 'overview' | 'activity' | 'ads' | 'chain'

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
      <div className="flex items-center gap-1.5 text-slate-600">{icon}<span className="text-[9px] font-bold uppercase tracking-wider">{label}</span></div>
      <p className="mt-2 truncate text-xs font-semibold text-slate-200">{value}</p>
    </div>
  )
}

export function SessionDrawer({
  session,
  run,
  onClose,
  onAction,
}: {
  session: BrowserSession | null
  run: Run | null
  onClose: () => void
  onAction: (session: BrowserSession, action: 'start' | 'pause' | 'resume' | 'stop') => void
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [imageFailed, setImageFailed] = useState(false)
  if (!session || !run) return null
  const page = session.page
  const host = session.finalDomain || domainOf(session.finalUrl || session.currentUrl)
  const active = ['resolving', 'opening', 'inspecting', 'analyzing'].includes(session.status)

  return (
    <Modal
      open
      onClose={onClose}
      title={`Session #${String(session.index).padStart(2, '0')} · ${host}`}
      subtitle={`${run.inputUrl} · ${formatDuration(session.elapsedMs)} elapsed`}
      width="max-w-5xl"
    >
      <div className="border-b border-white/[0.06] px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={session.status} pulse={active} />
            <span className="chip border-white/[0.07] bg-white/[0.02] text-slate-400">
              <Bot className="h-3 w-3" /> {session.aiMode === 'llm' ? 'LLM analysis' : 'Heuristic analysis'}
            </span>
            <span className="chip border-white/[0.07] bg-white/[0.02] text-slate-400">
              <ShieldCheck className="h-3 w-3" /> Isolated context
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {(active || session.status === 'queued') && (
              <button type="button" onClick={() => onAction(session, 'pause')} className="btn-ghost !px-2.5 !py-1.5 text-[10px]">Pause</button>
            )}
            {session.status === 'paused' && (
              <button type="button" onClick={() => onAction(session, 'resume')} className="btn-primary !px-2.5 !py-1.5 text-[10px]">Resume</button>
            )}
            {(session.status === 'error' || session.status === 'stopped') && (
              <button type="button" onClick={() => onAction(session, 'start')} className="btn-primary !px-2.5 !py-1.5 text-[10px]">Retry</button>
            )}
            {(active || session.status === 'queued' || session.status === 'paused') && (
              <button type="button" onClick={() => onAction(session, 'stop')} className="btn-danger !px-2.5 !py-1.5 text-[10px]">Stop</button>
            )}
          </div>
        </div>
        <div className="mt-4 flex gap-1 overflow-x-auto">
          {([
            ['overview', 'Overview', Globe2],
            ['activity', `Activity (${session.logs.length})`, ListChecks],
            ['ads', `Ads (${session.ads.length})`, Megaphone],
            ['chain', `Chain (${session.analysis?.redirects.length || 0})`, Waypoints],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-[10px] font-semibold transition',
                tab === id ? 'border-violet-400 text-violet-200' : 'border-transparent text-slate-600 hover:text-slate-300',
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {tab === 'overview' && (
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
              <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-black/25">
                {session.screenshotUrl && !imageFailed ? (
                  <img src={session.screenshotUrl} alt={`Session ${session.index} preview`} className="aspect-[16/10] w-full object-cover object-top" onError={() => setImageFailed(true)} />
                ) : (
                  <div className="dot-grid flex aspect-[16/10] flex-col items-center justify-center">
                    {imageFailed ? <ImageOff className="h-5 w-5 text-slate-700" /> : <Globe2 className="h-5 w-5 text-slate-700" />}
                    <p className="mt-2 text-[10px] text-slate-600">{active ? 'Browser context is rendering' : 'No screenshot captured'}</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Elapsed" value={formatDuration(session.elapsedMs)} icon={<Clock3 className="h-3 w-3" />} />
                <Metric label="Load time" value={page ? formatDuration(page.loadMs) : '—'} icon={<Timer className="h-3 w-3" />} />
                <Metric label="Observed ads" value={`${session.ads.length}`} icon={<Megaphone className="h-3 w-3" />} />
                <Metric label="Redirects" value={`${session.analysis?.redirectCount ?? 0}`} icon={<Waypoints className="h-3 w-3" />} />
                <Metric label="Server" value={`${session.serverRegion}`} icon={<ShieldCheck className="h-3 w-3" />} />
                <Metric label="Viewport" value={session.viewport} icon={<Globe2 className="h-3 w-3" />} />
                <div className="col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                  <p className="label mb-1.5">Destination</p>
                  <p className="break-all font-mono text-[9px] leading-relaxed text-slate-400">{session.finalUrl || session.currentUrl || 'Pending'}</p>
                  {session.finalUrl && (
                    <a href={secureHref(session.finalUrl)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[9px] font-semibold text-violet-300 hover:text-violet-200">
                      Open manually <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {(session.summary || session.error) && (
              <div className={cn('rounded-2xl border p-4', session.error && session.status !== 'complete' ? 'border-amber-500/15 bg-amber-500/[0.04]' : 'border-violet-500/15 bg-violet-500/[0.04]')}>
                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-violet-300">
                  {session.error ? <AlertTriangle className="h-3 w-3 text-amber-300" /> : <Sparkles className="h-3 w-3" />}
                  {session.error ? 'Session notice' : 'AI session summary'}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{session.error || session.summary}</p>
              </div>
            )}

            {page && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                  <p className="label mb-2">Page evidence</p>
                  <p className="text-xs font-semibold text-slate-200">{page.title || 'Untitled page'}</p>
                  {page.description && <p className="mt-1.5 line-clamp-3 text-[10px] leading-relaxed text-slate-500">{page.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {page.captcha && <span className="chip border-amber-500/15 bg-amber-500/[0.06] text-amber-300"><ShieldAlert className="h-3 w-3" /> CAPTCHA</span>}
                    {page.blocked && <span className="chip border-rose-500/15 bg-rose-500/[0.06] text-rose-300"><AlertTriangle className="h-3 w-3" /> Blocked</span>}
                    {page.countdowns > 0 && <span className="chip border-white/[0.07] bg-black/20 text-slate-400"><Timer className="h-3 w-3" /> {page.countdowns} timers</span>}
                  </div>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                  <p className="label mb-2">Detected interface controls</p>
                  {page.skipControls.length || page.continueControls.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {page.skipControls.map((control) => <span key={control} className="chip border-white/[0.07] bg-black/20 text-slate-400">Skip: {control}</span>)}
                      {page.continueControls.map((control) => <span key={control} className="chip border-white/[0.07] bg-black/20 text-slate-400">Continue: {control}</span>)}
                    </div>
                  ) : <p className="text-[10px] text-slate-600">No skip or continue controls were confidently identified.</p>}
                  {page.adNetworks.length > 0 && (
                    <p className="mt-3 text-[9px] leading-relaxed text-slate-600">Network hints: {page.adNetworks.join(' · ')}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.025] p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/70" />
              <p className="text-[10px] leading-relaxed text-slate-500">
                This session performed passive inspection only. Detected controls are reported for operator review; LinkPilot did not click ads, solve CAPTCHAs, bypass reward steps, or generate traffic.
              </p>
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div className="relative">
            {session.logs.length === 0 && <p className="py-10 text-center text-xs text-slate-600">No activity recorded.</p>}
            {session.logs.map((log, index) => (
              <div key={log.id} className="relative flex gap-3 pb-4 last:pb-0">
                {index < session.logs.length - 1 && <span className="absolute left-[9px] top-5 h-full w-px bg-white/[0.055]" />}
                <span className={cn(
                  'relative z-10 mt-0.5 h-[19px] w-[19px] shrink-0 rounded-full border',
                  log.level === 'success' ? 'border-emerald-500/25 bg-emerald-500/10' : log.level === 'warn' ? 'border-amber-500/25 bg-amber-500/10' : log.level === 'error' ? 'border-rose-500/25 bg-rose-500/10' : 'border-violet-500/20 bg-violet-500/[0.07]',
                )}>
                  <span className={cn('absolute inset-1 rounded-full', log.level === 'success' ? 'bg-emerald-400' : log.level === 'warn' ? 'bg-amber-400' : log.level === 'error' ? 'bg-rose-400' : 'bg-violet-400')} />
                </span>
                <div className="min-w-0 flex-1 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                  <p className="text-[11px] leading-relaxed text-slate-400">{log.message}</p>
                  <p className="mt-1 font-mono text-[9px] text-slate-700">{formatDate(log.at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'ads' && (
          <div>
            <div className="mb-4 rounded-xl border border-amber-500/15 bg-amber-500/[0.035] p-3">
              <p className="text-[10px] leading-relaxed text-amber-200/80">
                Advertising observations describe rendered containers. They are not verified ad impressions, clicks or revenue unless supplied by an authorized analytics platform.
              </p>
            </div>
            {session.ads.length ? (
              <div className="space-y-2">
                {session.ads.map((ad) => (
                  <div key={ad.id} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Megaphone className="h-4 w-4 text-fuchsia-300" />
                        <p className="text-xs font-semibold text-slate-200">{ad.format}</p>
                        {ad.network && <span className="chip border-fuchsia-500/15 bg-fuchsia-500/[0.06] text-fuchsia-300">{ad.network}</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="chip border-white/[0.07] bg-black/20 text-slate-500">{ad.confidence} confidence</span>
                        <span className="chip border-amber-500/10 bg-amber-500/[0.04] text-amber-300/70">Unverified</span>
                      </div>
                    </div>
                    <p className="mt-2 break-all font-mono text-[9px] text-slate-600">{ad.selector}</p>
                    {ad.text && <p className="mt-1 line-clamp-2 text-[10px] text-slate-500">{ad.text}</p>}
                    <div className="mt-2 flex flex-wrap gap-3 text-[9px] text-slate-600">
                      <span>Visible: {ad.visible ? 'yes' : 'no'}</span>
                      <span>First seen: {formatDuration(ad.firstSeenMs)}</span>
                      <span>Observation window: {ad.durationMs === null ? 'snapshot' : formatDuration(ad.durationMs)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-14 text-center">
                <Megaphone className="h-6 w-6 text-slate-700" />
                <p className="mt-3 text-xs font-semibold text-slate-400">No advertising containers detected</p>
                <p className="mt-1 max-w-sm text-[10px] text-slate-600">The snapshot did not contain confidently identifiable ad slots. Absence of detection is not proof that no ads exist.</p>
              </div>
            )}
          </div>
        )}

        {tab === 'chain' && (
          <div>
            {session.analysis?.redirects.length ? (
              <div className="rounded-2xl border border-white/[0.06] bg-black/15 p-4">
                {session.analysis.redirects.map((hop, index) => (
                  <div key={`${hop.url}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
                    {index < (session.analysis?.redirects.length || 0) - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-16px)] w-px bg-white/[0.06]" />}
                    <span className={cn(
                      'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-mono text-[9px] font-bold',
                      hop.statusCode && hop.statusCode >= 400 ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : hop.statusCode && hop.statusCode >= 300 ? 'border-violet-500/20 bg-violet-500/10 text-violet-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
                    )}>
                      {hop.statusCode || '—'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-semibold text-slate-300">{index === 0 ? 'Original' : index === session.analysis!.redirects.length - 1 ? 'Final' : `Hop ${index}`}</p>
                        <span className="text-[9px] text-slate-700">{hop.elapsedMs} ms</span>
                      </div>
                      <p className="mt-1 break-all font-mono text-[9px] leading-relaxed text-slate-500">{hop.url}</p>
                      {hop.location && (
                        <p className="mt-1 flex items-start gap-1 break-all text-[9px] text-violet-300/60">
                          <ArrowDownRight className="mt-0.5 h-3 w-3 shrink-0" /> {hop.location}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-xs text-slate-600">No redirect chain recorded yet.</p>
            )}
            <p className="mt-3 truncate font-mono text-[9px] text-slate-700">Input: {shortUrl(run.inputUrl, 90)}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
