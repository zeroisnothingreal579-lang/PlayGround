import type { SessionStatus } from "../../shared/types";

export function formatNumber(value: number | null | undefined, options: Intl.NumberFormatOptions = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, ...options }).format(value);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return "—";
  if (diff < 1500) return "just now";
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.round(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function hostnameOf(url: string | null | undefined): string {
  if (!url) return "—";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 48);
  }
}

export function truncate(value: string, length = 60): string {
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(0, length - 1))}…`;
}

export function elapsedFor(startedAt: string | null, elapsedMs: number, running: boolean): number {
  if (running && startedAt) {
    const diff = Date.now() - Date.parse(startedAt);
    if (Number.isFinite(diff)) return Math.max(elapsedMs, diff);
  }
  return elapsedMs;
}

export const statusMeta: Record<SessionStatus, { label: string; className: string; dot: string }> = {
  queued: { label: "Queued", className: "border-slate-500/20 bg-slate-500/10 text-slate-300", dot: "bg-slate-400" },
  starting: { label: "Starting", className: "border-amber-400/20 bg-amber-400/10 text-amber-200", dot: "bg-amber-300" },
  running: { label: "Running", className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200", dot: "bg-emerald-300" },
  paused: { label: "Paused", className: "border-sky-400/20 bg-sky-400/10 text-sky-200", dot: "bg-sky-300" },
  completed: { label: "Completed", className: "border-violet-400/20 bg-violet-400/10 text-violet-200", dot: "bg-violet-300" },
  failed: { label: "Failed", className: "border-rose-400/20 bg-rose-400/10 text-rose-200", dot: "bg-rose-300" },
  stopped: { label: "Stopped", className: "border-slate-500/20 bg-slate-500/10 text-slate-300", dot: "bg-slate-400" },
};

export const riskMeta = {
  low: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  medium: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  high: "border-rose-400/20 bg-rose-400/10 text-rose-200",
} as const;

export function percent(value: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
