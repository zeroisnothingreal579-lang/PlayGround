import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  AlertTriangle,
  LoaderCircle,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react'
import YoutubeGlyph from './YoutubeGlyph'
import type { PlayerPhase, ViewerState, VideoMeta } from '../types'
import { formatDuration } from '../lib/format'
import { loadYouTubeApi } from '../lib/youtube'

const ACCENTS = ['#ff6b6b', '#fbbf6b', '#5ee2a8', '#67e8f9', '#a78bfa', '#f472b6', '#93c5fd', '#facc15']

const PHASE_STYLES: Record<PlayerPhase, { label: string; dot: string; text: string; bg: string }> = {
  loading: {
    label: 'Connecting',
    dot: 'bg-cyan-300 animate-pulse',
    text: 'text-cyan-200',
    bg: 'border-cyan-300/15 bg-cyan-400/[0.075]',
  },
  ready: {
    label: 'Ready',
    dot: 'bg-sky-300',
    text: 'text-sky-200',
    bg: 'border-sky-300/15 bg-sky-400/[0.075]',
  },
  playing: {
    label: 'Playing',
    dot: 'bg-emerald-300',
    text: 'text-emerald-200',
    bg: 'border-emerald-300/20 bg-emerald-400/[0.09]',
  },
  paused: {
    label: 'Paused',
    dot: 'bg-amber-300',
    text: 'text-amber-200',
    bg: 'border-amber-300/20 bg-amber-400/[0.075]',
  },
  buffering: {
    label: 'Buffering',
    dot: 'bg-cyan-300 animate-pulse',
    text: 'text-cyan-200',
    bg: 'border-cyan-300/20 bg-cyan-400/[0.075]',
  },
  ended: {
    label: 'Finished',
    dot: 'bg-violet-300',
    text: 'text-violet-200',
    bg: 'border-violet-300/20 bg-violet-400/[0.075]',
  },
  error: {
    label: 'Unavailable',
    dot: 'bg-rose-400',
    text: 'text-rose-200',
    bg: 'border-rose-400/20 bg-rose-400/[0.075]',
  },
}

interface ViewerCardProps {
  viewer: ViewerState
  meta: VideoMeta
  compact: boolean
  onTogglePlay: (id: number) => void
  onToggleMute: (id: number) => void
  onSeek: (id: number, seconds: number) => void
  onReady: (id: number, player: YT.Player) => void
  onStateChange: (id: number, state: number) => void
  onError: (id: number, code: number, message?: string) => void
}

export default function ViewerCard({
  viewer,
  meta,
  compact,
  onTogglePlay,
  onToggleMute,
  onSeek,
  onReady,
  onStateChange,
  onError,
}: ViewerCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbacksRef = useRef({ onReady, onStateChange, onError })
  callbacksRef.current = { onReady, onStateChange, onError }

  const fallbackThumbnail = `https://i.ytimg.com/vi/${meta.videoId}/hqdefault.jpg`
  const [thumbSrc, setThumbSrc] = useState(meta.thumbnail || fallbackThumbnail)
  const [thumbBroken, setThumbBroken] = useState(false)

  useEffect(() => {
    setThumbSrc(meta.thumbnail || fallbackThumbnail)
    setThumbBroken(false)
  }, [fallbackThumbnail, meta.thumbnail])

  useEffect(() => {
    let cancelled = false
    let player: YT.Player | undefined
    const container = containerRef.current
    if (!container) return

    void loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current) return
        const mount = document.createElement('div')
        container.replaceChildren(mount)
        player = new YT.Player(mount, {
          videoId: meta.videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            mute: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              const api = event.target
              try {
                api.mute()
                api.setVolume(65)
              } catch {
                // Commands are retried by the parent polling tick.
              }
              callbacksRef.current.onReady(viewer.id, api)
            },
            onStateChange: (event) => {
              callbacksRef.current.onStateChange(viewer.id, event.data)
            },
            onError: (event) => {
              callbacksRef.current.onError(viewer.id, event.data)
            },
          },
        })
      })
      .catch((error: Error) => {
        if (!cancelled) callbacksRef.current.onError(viewer.id, -1, error.message)
      })

    return () => {
      cancelled = true
      try {
        player?.destroy()
      } catch {
        // The iframe may already be detached by React.
      }
      try {
        container.replaceChildren()
      } catch {
        // Ignore cleanup after the card has left the document.
      }
    }
  }, [meta.videoId, viewer.id])

  const phase = PHASE_STYLES[viewer.phase]
  const accent = ACCENTS[(viewer.id - 1) % ACCENTS.length]
  const isPlaying = viewer.phase === 'playing'
  const isBuffering = viewer.phase === 'buffering' || viewer.phase === 'loading'
  const showPoster = !viewer.started && viewer.phase !== 'error'
  const showError = viewer.phase === 'error'
  const progress = viewer.duration > 0 ? Math.min(100, (viewer.currentTime / viewer.duration) * 100) : 0
  const sliderStyle = { '--progress': `${progress}%` } as CSSProperties

  return (
    <article className="group relative min-w-0 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0d12] shadow-[0_14px_40px_-26px_rgba(0,0,0,0.9)] transition duration-300 hover:border-white/[0.14] hover:shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9)]">
      <div className="relative aspect-video overflow-hidden bg-[#030405]">
        <div
          ref={containerRef}
          className="pointer-events-none absolute inset-0 overflow-hidden [&>div]:size-full [&>iframe]:size-full [&>iframe]:border-0"
        />

        {showPoster ? (
          <>
            {!thumbBroken ? (
              <img
                src={thumbSrc}
                alt=""
                className="absolute inset-0 size-full object-cover opacity-80 transition duration-700 group-hover:scale-[1.015] group-hover:opacity-90"
                onError={() => {
                  if (thumbSrc !== fallbackThumbnail) setThumbSrc(fallbackThumbnail)
                  else setThumbBroken(true)
                }}
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(255,65,65,0.18),transparent_45%),linear-gradient(135deg,#12151c,#050608)]">
                <YoutubeGlyph className="size-10 text-white/10" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#050608] via-[#050608]/20 to-[#050608]/45" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,transparent_20%,rgba(0,0,0,0.22)_100%)]" />
          </>
        ) : null}

        <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/50 px-1.5 py-1 font-mono text-[8px] font-medium uppercase tracking-[0.12em] text-white/75 backdrop-blur-md">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: accent }} />
            Viewer {String(viewer.id).padStart(2, '0')}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-1 font-mono text-[8px] font-medium uppercase tracking-[0.08em] backdrop-blur-md ${phase.bg} ${phase.text}`}
          >
            <span className={`size-1.5 rounded-full ${phase.dot}`} />
            {phase.label}
          </span>
        </div>

        {isBuffering && !showError ? (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <span className="grid size-11 place-items-center rounded-full border border-white/15 bg-black/50 backdrop-blur-md">
              <LoaderCircle className="size-4 animate-spin text-white/80" />
            </span>
          </div>
        ) : null}

        {showError ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-[#07090d]/70 px-5 text-center backdrop-blur-[2px]">
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-full border border-rose-400/20 bg-rose-400/10">
                <AlertTriangle className="size-4 text-rose-300" />
              </span>
              <p className="mt-2 text-[11px] font-medium text-white">Embed unavailable</p>
              <p className="mx-auto mt-0.5 max-w-[210px] text-[9px] leading-relaxed text-slate-400">
                {viewer.error || 'This source may restrict embedded playback.'}
              </p>
            </div>
          </div>
        ) : viewer.started && !isPlaying ? (
          <button
            type="button"
            onClick={() => onTogglePlay(viewer.id)}
            aria-label={`Play viewer ${viewer.id}`}
            className="absolute inset-0 z-10 grid place-items-center focus-visible:outline-none"
          >
            <span className="grid size-11 place-items-center rounded-full border border-white/20 bg-black/45 text-white shadow-2xl backdrop-blur-md transition hover:scale-105 hover:bg-black/65">
              <Play className="ml-0.5 size-4 fill-current" />
            </span>
          </button>
        ) : showPoster && !isBuffering ? (
          <button
            type="button"
            onClick={() => onTogglePlay(viewer.id)}
            aria-label={`Start viewer ${viewer.id}`}
            className="absolute inset-0 z-10 grid place-items-center focus-visible:outline-none"
          >
            <span className="grid size-12 place-items-center rounded-full border border-white/20 bg-black/45 text-white shadow-2xl backdrop-blur-md transition hover:scale-105 hover:bg-[#ff4747]">
              <Play className="ml-0.5 size-4 fill-current" />
            </span>
          </button>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2.5 pb-2.5 pt-8">
          <input
            type="range"
            min={0}
            max={viewer.duration || 0}
            step={0.1}
            value={Math.min(viewer.currentTime, viewer.duration || 0)}
            onChange={(event) => onSeek(viewer.id, Number(event.target.value))}
            aria-label={`Seek viewer ${viewer.id}`}
            disabled={!viewer.ready || viewer.duration <= 0 || showError}
            className="seek-slider"
            style={sliderStyle}
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onTogglePlay(viewer.id)}
              disabled={showError}
              aria-label={isPlaying ? `Pause viewer ${viewer.id}` : `Play viewer ${viewer.id}`}
              className="grid size-6 place-items-center rounded-md text-white/85 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              {isPlaying ? (
                <Pause className="size-3 fill-current" />
              ) : (
                <Play className="ml-0.5 size-3 fill-current" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onToggleMute(viewer.id)}
              disabled={showError}
              aria-label={viewer.muted ? `Unmute viewer ${viewer.id}` : `Mute viewer ${viewer.id}`}
              className="grid size-6 place-items-center rounded-md text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              {viewer.muted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
            </button>
            <span className="font-mono text-[8px] tabular-nums text-white/65">
              {formatDuration(viewer.currentTime)}
              <span className="text-white/25"> / </span>
              {formatDuration(viewer.duration)}
            </span>
            {!compact ? (
              <span className="ml-auto font-mono text-[7px] uppercase tracking-[0.14em] text-white/30">
                iframe
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-lg border font-mono text-[9px] font-semibold"
          style={{
            color: accent,
            borderColor: `${accent}2b`,
            backgroundColor: `${accent}10`,
          }}
        >
          {String(viewer.id).padStart(2, '0')}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-medium text-slate-200">
            Viewer {String(viewer.id).padStart(2, '0')}
          </p>
          <p className="truncate font-mono text-[8px] uppercase tracking-[0.08em] text-slate-600">
            {viewer.error ? viewer.error : `Node ${String(viewer.id).padStart(2, '0')} · local embed`}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className={`eq ${isPlaying ? 'eq-active' : ''}`} aria-hidden>
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="font-mono text-[8px] tabular-nums text-slate-500">
            {formatDuration(viewer.watchTime)}
          </span>
        </div>
      </div>
    </article>
  )
}
