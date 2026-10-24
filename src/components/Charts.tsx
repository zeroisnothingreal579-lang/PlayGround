import type { AnalyticsPoint } from "../../shared/types";
import { formatNumber } from "../lib/format";

export function SessionsChart({ series }: { series: AnalyticsPoint[] }) {
  const width = 760;
  const height = 250;
  const padding = { left: 30, right: 14, top: 18, bottom: 30 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const max = Math.max(4, ...series.map((point) => Math.max(point.sessions, point.completed)));
  const stepX = series.length > 1 ? innerW / (series.length - 1) : innerW;
  const x = (index: number) => padding.left + index * stepX;
  const y = (value: number) => padding.top + innerH - (value / max) * innerH;
  const line = (key: "sessions" | "completed") =>
    series.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point[key]).toFixed(1)}`).join(" ");
  const area = `${line("sessions")} L ${x(series.length - 1).toFixed(1)} ${padding.top + innerH} L ${x(0).toFixed(1)} ${padding.top + innerH} Z`;
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Automation sessions over time">
        <defs>
          <linearGradient id="sessions-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = Math.round(max * ratio);
          return (
            <g key={ratio}>
              <line x1={padding.left} x2={width - padding.right} y1={y(value)} y2={y(value)} stroke="rgba(255,255,255,0.055)" strokeDasharray="3 5" />
              <text x={padding.left - 8} y={y(value) + 3} textAnchor="end" fill="#5c5c70" fontSize="8" fontFamily="var(--font-mono)">
                {value}
              </text>
            </g>
          );
        })}
        <path d={area} fill="url(#sessions-area)" />
        <path d={line("sessions")} fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={line("completed")} fill="none" stroke="#34d399" strokeWidth="1.6" strokeDasharray="4 3" strokeLinecap="round" />
        {series.map((point, index) =>
          index % labelEvery === 0 ? (
            <text key={point.date} x={x(index)} y={height - 8} textAnchor="middle" fill="#5c5c70" fontSize="8">
              {point.date.slice(5)}
            </text>
          ) : null,
        )}
        {series.map((point, index) => (
          <g key={`${point.date}-dot`}>
            <circle cx={x(index)} cy={y(point.sessions)} r="8" fill="transparent">
              <title>{`${point.date}: ${point.sessions} sessions, ${point.completed} completed, ${point.failed} failed`}</title>
            </circle>
            <circle cx={x(index)} cy={y(point.sessions)} r="2" fill="#c4b5fd" opacity={point.sessions ? 1 : 0} />
          </g>
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-5 text-[9px] text-mist-500">
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-violet-400" /> Automation sessions</span>
        <span className="flex items-center gap-1.5"><span className="h-px w-4 border-t border-dashed border-emerald-400" /> Completed</span>
      </div>
    </div>
  );
}

export function AdsBarChart({ series }: { series: AnalyticsPoint[] }) {
  const max = Math.max(1, ...series.map((point) => point.ads));
  return (
    <div className="flex h-28 items-end gap-1">
      {series.map((point) => {
        const height = Math.max(3, (point.ads / max) * 100);
        return (
          <div key={point.date} className="group relative flex-1">
            <div
              className="w-full rounded-sm bg-gradient-to-t from-violet-600/50 to-fuchsia-400/80 transition-colors group-hover:from-violet-500 group-hover:to-fuchsia-300"
              style={{ height: `${height}%`, minHeight: 3 }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-ink-800 px-2 py-1 text-[8px] text-mist-300 group-hover:block">
              {point.date.slice(5)} · {point.ads} ads
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DestinationBars({ destinations, emptyLabel }: { destinations: Array<{ domain: string; sessions: number }>; emptyLabel?: string }) {
  const max = Math.max(1, ...destinations.map((destination) => destination.sessions));
  if (destinations.length === 0) {
    return <p className="py-8 text-center text-[10px] text-mist-600">{emptyLabel ?? "No destinations measured yet."}</p>;
  }
  return (
    <div className="space-y-3">
      {destinations.map((destination, index) => (
        <div key={destination.domain}>
          <div className="mb-1 flex items-center justify-between gap-2 text-[10px]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="mono w-4 shrink-0 text-[8px] text-mist-600">{String(index + 1).padStart(2, "0")}</span>
              <span className="truncate text-mist-300">{destination.domain}</span>
            </span>
            <span className="mono shrink-0 text-mist-500">{formatNumber(destination.sessions)}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500/80 to-fuchsia-400/80"
              style={{ width: `${(destination.sessions / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatusDonut({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  centerValue: string;
  centerLabel: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let cursor = 0;
  const gradient = total
    ? segments
        .filter((segment) => segment.value > 0)
        .map((segment) => {
          const start = cursor;
          cursor += (segment.value / total) * 100;
          return `${segment.color} ${start}% ${cursor}%`;
        })
        .join(", ")
    : "rgba(255,255,255,0.06) 0% 100%";
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-24 w-24 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-[9px] flex flex-col items-center justify-center rounded-full bg-ink-850">
          <span className="mono text-lg font-semibold text-white">{centerValue}</span>
          <span className="text-[8px] uppercase tracking-wider text-mist-600">{centerLabel}</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2 text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: segment.color }} />
            <span className="text-mist-400">{segment.label}</span>
            <span className="mono ml-auto text-mist-500">{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
