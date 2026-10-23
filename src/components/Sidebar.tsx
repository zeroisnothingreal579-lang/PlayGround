import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Clock3,
  ExternalLink,
  ShieldCheck,
  Signal,
  VolumeX,
  Waves,
} from 'lucide-react'
import YoutubeGlyph from './YoutubeGlyph'
import type { ActivityEntry, Session } from '../types'
import { formatDuration, formatRelative } from '../lib/format'

interface SidebarProps {
  session: Session
  duration: number
  elapsedSeconds: number
  onlineCount: number
  playingCount: number
  mutedCount: number
  bufferingCount: number
  syncScore: number
  drift: number
  activity: ActivityEntry[]
  signalHistory: number[]
  now: number
}

const TONE_DOT: Record<ActivityEntry['tone'], string> = {
  neutral: 'bg-slate-500',
  success: 'bg-emerald-400',
  info: 'bg-cyan-400',
  warning: 'bg-amber-400',
}

export default function Sidebar({
  session,
  duration,
  elapsedSeconds,
  onlineCount,
  playingCount,
  mutedCount,
  bufferingCount,
  syncScore,
  drift,
  activity,
  signalHistory,
  now,
}: SidebarProps) {
  const [thumbSrc, setThumbSrc] = useState(session.meta.thumbnail)
  const [thumbBroken, setThumbBroken] = useState(false)

  useEffect(() => {
    setThumbSrc(session.meta.thumbnail)
    setThumbBroken(false)
  }, [session.meta.thumbnail])
  const peak = Math.max(1, ...signalHistory)
  const ringColor = onlineCount === 0 ? '#475569' : syncScore > 88 ? '#5ee2a8' : syncScore > 65 ? '#fbbf6b' : '#fb7185'

  return (
    <aside className="min-w-0 space-y-3 xl:sticky xl:top-[92px]">
      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0d12]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.15em] text-slate-400">
            <YoutubeGlyph className="size-3.5 text-red-400" /> Source feed
          </span>
          <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-500">
            {session.meta.kind}
          </span>
        </div>

        <div className="relative aspect-[16/9] overflow-hidden bg-[#040507]">
          {!thumbBroken ? (
            <img
              src={thumbSrc}
              alt=""
              className="size-full object-cover opacity-90"
              onError={() => {
                const fallback = `https://i.ytimg.com/vi/${session.videoId}/hqdefault.jpg`
                if (thumbSrc !== fallback) setThumbSrc(fallback)
                else setThumbBroken(true)
              }}
            />
          ) : (
            <div className="grid size-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(255,65,65,0.15),transparent_50%),linear-gradient(135deg,#12151c,#050608)]">
              <YoutubeGlyph className="size-9 text-white/10" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d12] via-transparent to-transparent" />
          <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[8px] tabular-nums text-white/80 backdrop-blur-sm">
            {duration > 0 ? formatDuration(duration) : '—:—'}
          </span>
          <span className="absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-[0.12em] text-white/60 backdrop-blur-sm">
            {String(session.count).padStart(2, '0')} instances
          </span>
        </div>

        <div className="p-3.5">
          <h3 className="line-clamp-2 text-[11px] font-medium leading-snug text-slate-100">
            {session.meta.title}
          </h3>
          <p className="mt-1.5 flex items-center gap-1.5 text-[9px] text-slate-500">
            <span className="size-1.5 rounded-full bg-red-400/80" />
            {session.meta.author}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-1.5">
              <p className="font-mono text-[7px] uppercase tracking-[0.12em] text-slate-600">
                Elapsed
              </p>
              <p className="mt-0.5 font-mono text-[10px] tabular-nums text-slate-300">
                {formatDuration(elapsedSeconds)}
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-1.5">
              <p className="font-mono text-[7px] uppercase tracking-[0.12em] text-slate-600">
                Endpoint
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-slate-300">EMBED / 01</p>
            </div>
          </div>

          <a
            href={`https://www.youtube.com/watch?v=${session.videoId}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[9px] text-slate-400 transition hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-slate-200"
          >
            Open source on YouTube
            <ExternalLink className="size-3" />
          </a>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.07] bg-[#0b0d12] p-3.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.15em] text-slate-400">
            <Activity className="size-3.5 text-amber-300" /> Sync health
          </span>
          <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.08em] text-slate-600">
            <Signal className="size-2.5" /> live
          </span>
        </div>

        <div className="mt-3.5 flex items-center gap-4">
          <div
            className="grid size-[88px] shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(${ringColor} ${onlineCount === 0 ? 0 : syncScore * 3.6}deg, rgba(255,255,255,0.055) 0)`,
              boxShadow: `0 0 32px -12px ${ringColor}66`,
            }}
          >
            <div className="grid size-[72px] place-items-center rounded-full border border-white/[0.06] bg-[#0b0d12]">
              <div className="text-center">
                <p className="font-mono text-[18px] font-medium leading-none tabular-nums text-white">
                  {onlineCount === 0 ? '—' : `${syncScore}%`}
                </p>
                <p className="mt-1 font-mono text-[7px] uppercase tracking-[0.12em] text-slate-600">
                  integrity
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[9px] text-slate-500">
                <Waves className="size-3 text-emerald-400/80" /> Playing
              </span>
              <span className="font-mono text-[9px] tabular-nums text-slate-300">
                {playingCount}/{onlineCount}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[9px] text-slate-500">
                <Clock3 className="size-3 text-cyan-400/70" /> Drift
              </span>
              <span className="font-mono text-[9px] tabular-nums text-slate-300">
                ±{drift.toFixed(2)}s
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[9px] text-slate-500">
                <VolumeX className="size-3 text-amber-300/70" /> Muted
              </span>
              <span className="font-mono text-[9px] tabular-nums text-slate-300">{mutedCount}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[9px] text-slate-500">
                <LoaderDot /> Buffering
              </span>
              <span className="font-mono text-[9px] tabular-nums text-slate-300">
                {bufferingCount}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.05] bg-[#080a0e] p-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[7px] uppercase tracking-[0.12em] text-slate-600">
              Playback signal · 28s
            </span>
            <span className="font-mono text-[7px] text-slate-600">
              {playingCount} active
            </span>
          </div>
          <div className="mt-2 flex h-8 items-end gap-[2px]">
            {signalHistory.map((value, index) => (
              <div
                key={`${index}-${value}`}
                className="min-h-[2px] flex-1 rounded-[1px] transition-all duration-500"
                style={{
                  height: `${Math.max(4, (value / peak) * 100)}%`,
                  backgroundColor: value > 0 ? `${ringColor}bb` : 'rgba(255,255,255,0.06)',
                  boxShadow: value > 0 ? `0 0 5px ${ringColor}33` : 'none',
                }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.07] bg-[#0b0d12]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.15em] text-slate-400">
            <Activity className="size-3.5 text-cyan-300" /> Live activity
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-slate-600">
            <span className="size-1.5 rounded-full bg-emerald-400/80" /> stream
          </span>
        </div>
        <div className="max-h-[286px] overflow-y-auto p-3.5 scrollbar-thin">
          <div className="relative space-y-3">
            {activity.map((entry, index) => (
              <div key={entry.id} className="relative flex gap-2.5">
                {index < activity.length - 1 ? (
                  <span className="absolute left-[3px] top-3 h-[calc(100%+0.15rem)] w-px bg-white/[0.05]" />
                ) : null}
                <span
                  className={`relative z-10 mt-1 size-[7px] shrink-0 rounded-full ring-4 ring-[#0b0d12] ${TONE_DOT[entry.tone]}`}
                />
                <div className="min-w-0 pb-0.5">
                  <p className="text-[9px] font-medium leading-snug text-slate-300">
                    {entry.message}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[8px] leading-relaxed text-slate-600">
                    {entry.detail}
                  </p>
                  <p className="mt-1 font-mono text-[7px] uppercase tracking-[0.08em] text-slate-700">
                    {formatRelative(entry.at, now)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.025] p-3.5">
        <div className="flex gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400/80" />
          <div>
            <p className="text-[10px] font-medium text-emerald-100/85">Transparent by design</p>
            <p className="mt-1 text-[9px] leading-relaxed text-emerald-100/35">
              ViewMatrix coordinates real embedded players only. There is no proxy rotation, fake
              traffic, view automation, or simulated audience behavior.
            </p>
            <a
              href="https://support.google.com/youtube/answer/143285"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em] text-emerald-300/60 transition hover:text-emerald-200"
            >
              Embedding rules <ArrowUpRight className="size-2.5" />
            </a>
          </div>
        </div>
      </section>
    </aside>
  )
}

function LoaderDot() {
  return (
    <span className="grid size-3 place-items-center">
      <span className="size-1.5 animate-pulse rounded-full bg-cyan-400/70" />
    </span>
  )
}
