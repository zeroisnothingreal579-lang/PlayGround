import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Bot,
  ChevronRight,
  CirclePause,
  CirclePlay,
  CircleStop,
  Clock3,
  Globe2,
  ImageOff,
  Megaphone,
  RotateCcw,
} from 'lucide-react'
import { cn, domainOf, formatDuration, isActiveStatus, shortUrl } from '../lib/utils'
import type { BrowserSession } from '../types'
import { ProgressBar, StatusBadge } from './ui'

type SessionAction = 'start' | 'pause' | 'resume' | 'stop'

export function SessionCard({
  session,
  onOpen,
  onAction,
}: {
  session: BrowserSession
  onOpen: () => void
  onAction: (action: SessionAction) => void
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const active = isActiveStatus(session.status)
  const canPause = active || session.status === 'queued'
  const canResume = session.status === 'paused'
  const canStop = active || session.status === 'queued' || session.status === 'paused'
  const canRetry = session.status === 'error' || session.status === 'stopped'
  const canStart = session.status === 'queued' || session.status === 'paused'
  const host = session.finalDomain || domainOf(session.finalUrl || session.currentUrl)
  const imageSrc = session.screenshotUrl

  useEffect(() => {
    setImageFailed(false)
  }, [imageSrc])

  const act = (event: React.MouseEvent, action: SessionAction) => {
    event.stopPropagation()
    onAction(action)
  }

  return (
    <article
      className={cn(
        'group panel panel-hover overflow-hidden transition',
        active && 'border-violet-500/20 shadow-[0_0_35px_-20px_rgba(139,92,246,.65)]',
      )}
    >
      <button type="button" onClick={onOpen} className="relative block w-full text-left" aria-label={`Open session ${session.index} details`}>
        <div className="relative aspect-[16/10] overflow-hidden border-b border-white/[0.05] bg-gradient-to-br from-ink-800 via-ink-900 to-black">
          {imageSrc && !imageFailed ? (
            <img
              src={imageSrc}
              alt={`Preview of ${host}`}
              className="h-full w-full object-cover object-top opacity-90 transition duration-500 group-hover:scale-[1.015] group-hover:opacity-100"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="dot-grid relative flex h-full w-full items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-violet-950/10" />
              <div className="relative text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                  {active ? <Globe2 className="h-5 w-5 animate-pulse text-violet-300" /> : imageFailed ? <ImageOff className="h-5 w-5 text-slate-600" /> : <Globe2 className="h-5 w-5 text-slate-600" />}
                </div>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {active ? 'Rendering preview' : imageFailed ? 'Preview unavailable' : 'Awaiting page evidence'}
                </p>
                <p className="mt-1 max-w-[220px] truncate text-[10px] text-slate-700">{host}</p>
              </div>
              {active && <div className="absolute inset-x-0 top-0 h-16 animate-scan bg-gradient-to-b from-transparent via-violet-400/[0.08] to-transparent" />}
            </div>
          )}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/65 to-transparent p-3">
            <span className="rounded-lg border border-white/[0.08] bg-black/40 px-2 py-1 font-mono text-[9px] font-semibold text-slate-300 backdrop-blur">
              #{String(session.index).padStart(2, '0')}
            </span>
            <StatusBadge status={session.status} pulse={active} />
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent px-3 pb-2.5 pt-6">
            <p className="truncate font-mono text-[9px] text-slate-400">{shortUrl(session.currentUrl || session.inputUrl, 58)}</p>
          </div>
        </div>
      </button>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-slate-200">{host}</p>
            <p className="mt-0.5 truncate text-[9px] text-slate-600">{session.phaseMessage}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-[9px] text-slate-600">
            <Clock3 className="h-3 w-3" /> {formatDuration(session.elapsedMs)}
          </span>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[9px] text-slate-600">
            <span>{active ? `${session.progress}%` : session.status === 'complete' ? 'Inspection complete' : 'Progress'}</span>
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-0.5"><Megaphone className="h-2.5 w-2.5" /> {session.ads.length}</span>
              <span className="flex items-center gap-0.5"><Bot className="h-2.5 w-2.5" /> {session.aiMode === 'llm' ? 'LLM' : 'Rules'}</span>
            </span>
          </div>
          <ProgressBar
            value={session.progress}
            tone={session.status === 'error' ? 'rose' : session.status === 'blocked' ? 'amber' : session.status === 'complete' ? 'emerald' : 'violet'}
          />
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2.5">
          <div className="flex items-center gap-1">
            {canPause && (
              <button type="button" onClick={(event) => act(event, 'pause')} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 text-slate-500 transition hover:text-sky-300" title="Pause session">
                <CirclePause className="h-3.5 w-3.5" />
              </button>
            )}
            {(canResume || canStart) && (
              <button type="button" onClick={(event) => act(event, canResume ? 'resume' : 'start')} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 text-slate-500 transition hover:text-emerald-300" title={canResume ? 'Resume session' : 'Start session'}>
                <CirclePlay className="h-3.5 w-3.5" />
              </button>
            )}
            {canRetry && (
              <button type="button" onClick={(event) => act(event, 'start')} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 text-slate-500 transition hover:text-violet-300" title="Retry session">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            {canStop && (
              <button type="button" onClick={(event) => act(event, 'stop')} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 text-slate-500 transition hover:text-rose-300" title="Stop session">
                <CircleStop className="h-3.5 w-3.5" />
              </button>
            )}
            {session.status === 'blocked' && <AlertCircle className="h-3.5 w-3.5 text-amber-400/70" />}
          </div>
          <button type="button" onClick={onOpen} className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-slate-600 transition hover:text-violet-300">
            Details <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </article>
  )
}
