import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Grid2X2,
  LoaderCircle,
  Radio,
  Sparkles,
} from 'lucide-react'
import YoutubeGlyph from './YoutubeGlyph'
import type { FormEvent } from 'react'

const COUNT_OPTIONS = [5, 10, 20, 50, 100]
const DEFAULT_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'

interface SetupPanelProps {
  draftUrl: string
  onUrlChange: (value: string) => void
  draftCount: number
  onCountChange: (count: number) => void
  onLaunch: () => void
  inputError: string | null
  busy: boolean
  isRelaunch: boolean
  videoTitle: string
  onlineCount: number
  playerCount: number
}

export default function SetupPanel({
  draftUrl,
  onUrlChange,
  draftCount,
  onCountChange,
  onLaunch,
  inputError,
  busy,
  isRelaunch,
  videoTitle,
  onlineCount,
  playerCount,
}: SetupPanelProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onLaunch()
  }

  return (
    <section
      id="session-console"
      className="relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#0a0c11]/95 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.9)]"
    >
      <div className="pointer-events-none absolute -right-28 -top-40 size-[440px] rounded-full bg-red-500/[0.09] blur-[80px]" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-cyan-400/[0.035] blur-[90px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-400/40 to-transparent" />

      <div className="relative p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/20 bg-red-400/[0.075] px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-red-300">
                <Radio className="size-3" />
                Playback control room
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.055] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.13em] text-emerald-300/90">
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                {String(onlineCount).padStart(2, '0')} / {String(playerCount).padStart(2, '0')} nodes online
              </span>
            </div>

            <h1 className="mt-3 text-balance text-[26px] font-semibold leading-[1.06] tracking-[-0.04em] text-white sm:text-[30px] lg:text-[34px]">
              Every window. <span className="text-slate-500">One timeline.</span>
            </h1>
            <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-slate-400 sm:text-[13px]">
              Paste a YouTube link to spin up a live grid of independent player instances.
              Monitor readiness, mute state, buffer health, and drift from a single console.
            </p>
          </div>

          <div className="hidden shrink-0 items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 lg:flex">
            <div className="grid size-9 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
              <Sparkles className="size-4 text-amber-300" />
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">
                Current source
              </p>
              <p className="mt-0.5 max-w-[220px] truncate text-[11px] font-medium text-slate-300">
                {videoTitle}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="mt-4">
          <div className="flex flex-col gap-2.5 xl:flex-row">
            <div
              className={`flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border bg-[#07090d] px-3.5 transition focus-within:border-red-400/40 focus-within:ring-4 focus-within:ring-red-500/10 ${
                inputError ? 'border-red-400/50' : 'border-white/[0.08]'
              }`}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-red-500/10">
                <YoutubeGlyph className="size-4 text-red-400" />
              </span>
              <label htmlFor="youtube-url" className="sr-only">
                YouTube video URL
              </label>
              <input
                id="youtube-url"
                value={draftUrl}
                onChange={(event) => onUrlChange(event.target.value)}
                placeholder="Paste a YouTube video, Shorts, or live URL"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-600"
              />
              {draftUrl ? (
                <button
                  type="button"
                  onClick={() => onUrlChange('')}
                  className="rounded-md px-1.5 py-1 font-mono text-[9px] uppercase tracking-wider text-slate-600 transition hover:bg-white/[0.04] hover:text-slate-300"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <div className="flex min-h-12 items-center gap-1 rounded-2xl border border-white/[0.08] bg-[#07090d] p-1.5">
              <div className="flex items-center gap-1.5 pl-2 pr-1">
                <Grid2X2 className="size-3.5 text-slate-500" />
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
                  Windows
                </span>
              </div>
              {COUNT_OPTIONS.map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={draftCount === count}
                  onClick={() => onCountChange(count)}
                  className={`h-9 min-w-9 rounded-xl px-2 font-mono text-[11px] font-medium transition ${
                    draftCount === count
                      ? 'bg-white text-[#0a0c11] shadow-[0_4px_18px_rgba(255,255,255,0.12)]'
                      : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>

            <button
              type="submit"
              className="group inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#ff4747] px-5 text-[12px] font-semibold text-white shadow-[0_10px_34px_-12px_rgba(255,71,71,0.9)] transition hover:bg-[#ff5a5a] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-400/30 active:translate-y-px disabled:cursor-wait disabled:opacity-75 sm:px-6"
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              )}
              {busy ? 'Resolving feed' : isRelaunch ? 'Relaunch grid' : 'Launch grid'}
            </button>
          </div>
        </form>

        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {inputError ? (
            <p className="flex items-center gap-1.5 text-[11px] text-red-300">
              <AlertCircle className="size-3.5 shrink-0" /> {inputError}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Check className="size-3.5 text-emerald-400/80" />
              Supports watch links, youtu.be, Shorts, live, and embed URLs where embedding is
              permitted.
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onUrlChange(DEFAULT_URL)}
              className="text-[10px] font-medium text-slate-500 underline decoration-white/15 underline-offset-4 transition hover:text-slate-300"
            >
              Load demo source
            </button>
            <span className="hidden h-3 w-px bg-white/10 sm:block" />
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-600">
              100 player ceiling
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
