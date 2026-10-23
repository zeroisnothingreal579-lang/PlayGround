import { Activity, Clock3, Plus, Radio } from 'lucide-react'
import { formatDuration } from '../lib/format'

interface HeaderProps {
  elapsedSeconds: number
  onlineCount: number
  playerCount: number
  onNewSession: () => void
}

export default function Header({
  elapsedSeconds,
  onlineCount,
  playerCount,
  onNewSession,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#06070a]/82 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 grid-cols-2 grid-rows-2 gap-[3px] rounded-[11px] border border-white/10 bg-white/[0.03] p-[5px] shadow-[0_0_28px_rgba(255,65,65,0.12)]">
            <span className="rounded-[2px] bg-[#ff4141]" />
            <span className="rounded-[2px] bg-white/20" />
            <span className="rounded-[2px] bg-white/20" />
            <span className="flex items-center justify-center rounded-[2px] bg-white/90">
              <span className="ml-px size-0 border-y-[3px] border-l-[4.5px] border-y-transparent border-l-[#07090d]" />
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-white">
                ViewMatrix
              </p>
              <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[8px] font-semibold tracking-[0.16em] text-slate-400 sm:inline">
                BETA
              </span>
            </div>
            <p className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
              Multi-player QA console
            </p>
          </div>
        </div>

        <div className="mx-2 hidden h-7 w-px bg-white/[0.07] lg:block" />

        <div className="hidden items-center gap-2 lg:flex">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-50" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
            Embed QA session
          </span>
          <span className="rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1 font-mono text-[9px] text-slate-500">
            LOCAL
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 sm:flex">
            <Radio className="size-3.5 text-emerald-400" />
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
                Nodes
              </p>
              <p className="font-mono text-[11px] font-medium leading-none text-slate-200">
                {String(onlineCount).padStart(2, '0')}/{String(playerCount).padStart(2, '0')}
              </p>
            </div>
            <span className="h-6 w-px bg-white/[0.07]" />
            <Clock3 className="size-3.5 text-slate-500" />
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
                Session
              </p>
              <p className="font-mono text-[11px] font-medium leading-none tabular-nums text-slate-200">
                {formatDuration(elapsedSeconds)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onNewSession}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[11px] font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.075] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">New session</span>
          </button>

          <div className="hidden size-9 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.09] to-white/[0.02] text-[10px] font-semibold tracking-wide text-slate-300 md:flex">
            VM
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.04] px-4 py-2 sm:hidden">
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
          <Activity className="size-3 text-emerald-400" /> {onlineCount}/{playerCount} nodes online
        </span>
        <span className="font-mono text-[9px] tabular-nums text-slate-400">
          {formatDuration(elapsedSeconds)}
        </span>
      </div>
    </header>
  )
}
