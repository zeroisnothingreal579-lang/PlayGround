import { Activity, Clock3, Users, Waves } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatDuration } from '../lib/format'

interface MetricCardsProps {
  playerCount: number
  onlineCount: number
  playingCount: number
  syncScore: number
  drift: number
  elapsedSeconds: number
  mutedCount: number
  bufferingCount: number
  totalWatchTime: number
}

interface MetricProps {
  label: string
  value: string
  suffix?: string
  detail: string
  icon: LucideIcon
  accent: string
  bar: number
  pulse?: boolean
}

function Metric({
  label,
  value,
  suffix,
  detail,
  icon: Icon,
  accent,
  bar,
  pulse = false,
}: MetricProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0d12]/90 p-3.5 transition duration-300 hover:border-white/[0.12] hover:bg-[#0d1016] sm:p-4">
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full opacity-[0.07] blur-2xl transition-opacity group-hover:opacity-[0.12]"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <div className="mt-1.5 flex items-end gap-1.5">
            <span className="font-mono text-[23px] font-medium leading-none tracking-[-0.04em] tabular-nums text-white">
              {value}
            </span>
            {suffix ? (
              <span className="mb-0.5 font-mono text-[10px] text-slate-500">{suffix}</span>
            ) : null}
          </div>
        </div>
        <span className="relative grid size-8 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035]">
          <Icon className="size-3.5" style={{ color: accent }} />
          {pulse ? (
            <span
              className="absolute right-1 top-1 size-1.5 rounded-full"
              style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}` }}
            />
          ) : null}
        </span>
      </div>
      <p className="mt-1.5 truncate text-[10px] text-slate-500">{detail}</p>
      <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-white/[0.055]">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${Math.max(2, Math.min(100, bar))}%`,
            backgroundColor: accent,
            boxShadow: `0 0 10px ${accent}55`,
          }}
        />
      </div>
    </div>
  )
}

export default function MetricCards({
  playerCount,
  onlineCount,
  playingCount,
  syncScore,
  drift,
  elapsedSeconds,
  mutedCount,
  bufferingCount,
  totalWatchTime,
}: MetricCardsProps) {
  const onlinePercent = playerCount ? (onlineCount / playerCount) * 100 : 0
  const playingPercent = playerCount ? (playingCount / playerCount) * 100 : 0
  const watchPercent = playerCount ? Math.min(100, (totalWatchTime / Math.max(1, elapsedSeconds * playerCount)) * 100) : 0

  return (
    <section className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric
        label="Grid status"
        value={String(onlineCount).padStart(2, '0')}
        suffix={`/ ${String(playerCount).padStart(2, '0')}`}
        detail={onlineCount === playerCount ? 'All player nodes online' : 'Connecting to player nodes'}
        icon={Users}
        accent="#67e8f9"
        bar={onlinePercent}
        pulse={onlineCount === playerCount}
      />
      <Metric
        label="Playback"
        value={String(playingCount).padStart(2, '0')}
        suffix="playing"
        detail={
          bufferingCount > 0
            ? `${bufferingCount} buffering · ${mutedCount} muted`
            : `${mutedCount} of ${playerCount} windows muted`
        }
        icon={Waves}
        accent="#5ee2a8"
        bar={playingPercent}
        pulse={playingCount > 0}
      />
      <Metric
        label="Sync integrity"
        value={onlineCount === 0 ? '—' : `${syncScore}%`}
        detail={onlineCount === 0 ? 'Awaiting player handshake' : `±${drift.toFixed(2)}s timing drift`}
        icon={Activity}
        accent="#fbbf6b"
        bar={onlineCount === 0 ? 0 : syncScore}
      />
      <Metric
        label="Session uptime"
        value={formatDuration(elapsedSeconds)}
        detail={`${formatDuration(totalWatchTime)} cumulative watch time`}
        icon={Clock3}
        accent="#ff6b6b"
        bar={Math.max(3, watchPercent)}
        pulse
      />
    </section>
  )
}
