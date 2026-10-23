import { Pause, Play, RefreshCw, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import type { Session, ViewerState } from '../types'
import ViewerCard from './ViewerCard'

interface PlayerGridProps {
  session: Session
  viewers: ViewerState[]
  playingCount: number
  allMuted: boolean
  onPlayAll: () => void
  onPauseAll: () => void
  onResumeAll: () => void
  onSyncAll: () => void
  onToggleMuteAll: () => void
  onToggleViewer: (id: number) => void
  onToggleViewerMute: (id: number) => void
  onSeekViewer: (id: number, seconds: number) => void
  onPlayerReady: (id: number, player: YT.Player) => void
  onPlayerState: (id: number, state: number) => void
  onPlayerError: (id: number, code: number, message?: string) => void
}

export default function PlayerGrid({
  session,
  viewers,
  playingCount,
  allMuted,
  onPlayAll,
  onPauseAll,
  onResumeAll,
  onSyncAll,
  onToggleMuteAll,
  onToggleViewer,
  onToggleViewerMute,
  onSeekViewer,
  onPlayerReady,
  onPlayerState,
  onPlayerError,
}: PlayerGridProps) {
  const compact = session.count > 10
  const columns =
    session.count <= 5
      ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
      : session.count <= 10
        ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
        : session.count <= 20
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
              Live player grid
            </span>
            <span className="rounded border border-white/[0.07] bg-white/[0.025] px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
              {String(session.count).padStart(2, '0')} NODES
            </span>
            <a
              href={`https://www.youtube.com/watch?v=${session.videoId}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[9px] uppercase tracking-[0.1em] text-slate-600 transition hover:text-slate-300"
            >
              Source ↗
            </a>
          </div>
          <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.025em] text-white sm:text-[21px]">
            Player windows
            <span className="ml-2 font-mono text-[11px] font-normal tracking-normal text-slate-500">
              {playingCount} in playback
            </span>
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Each iframe is an independent instance with its own state and controls.
          </p>
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-1 rounded-2xl border border-white/[0.07] bg-[#0a0c11]/85 p-1.5">
          <button
            type="button"
            onClick={onPlayAll}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white px-3 text-[10px] font-semibold text-[#08090c] transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <Play className="size-3 fill-current" /> Play all
          </button>
          <button
            type="button"
            onClick={onPauseAll}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[10px] font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <Pause className="size-3 fill-current" /> Pause
          </button>
          <button
            type="button"
            onClick={onResumeAll}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[10px] font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <RotateCcw className="size-3" /> Resume
          </button>
          <span className="mx-0.5 hidden h-4 w-px bg-white/[0.08] sm:block" />
          <button
            type="button"
            onClick={onToggleMuteAll}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[10px] font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            {allMuted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
            {allMuted ? 'Unmute all' : 'Mute all'}
          </button>
          <button
            type="button"
            onClick={onSyncAll}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[10px] font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <RefreshCw className="size-3" /> Re-sync
          </button>
          <div className="ml-1 hidden items-center gap-2 pr-1 lg:flex">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
            <span className="font-mono text-[9px] uppercase tracking-[0.11em] text-slate-500">
              API
            </span>
          </div>
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${columns}`}>
        {viewers.map((viewer) => (
          <ViewerCard
            key={viewer.id}
            viewer={viewer}
            meta={session.meta}
            compact={compact}
            onTogglePlay={onToggleViewer}
            onToggleMute={onToggleViewerMute}
            onSeek={onSeekViewer}
            onReady={onPlayerReady}
            onStateChange={onPlayerState}
            onError={onPlayerError}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-white/[0.045] bg-white/[0.015] px-3.5 py-3 text-[10px] leading-relaxed text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Tip: pause and adjust a single window, then use <span className="text-slate-300">Re-sync</span>{' '}
          to align every player to Viewer 01&apos;s timeline.
        </p>
        <p className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-600">
          Muted by default
        </p>
      </div>
    </section>
  )
}
