import { useEffect, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  Info,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import type { LinkStatus, RiskLevel, SessionStatus } from "../../shared/types";
import { riskMeta, statusMeta } from "../lib/format";
import { useApp } from "../state/AppContext";

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("panel", className)}>{children}</section>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="eyebrow mb-2">{eyebrow}</div>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white sm:text-[28px]">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-mist-400">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-mist-100">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-relaxed text-mist-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  dot,
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "violet" | "emerald" | "amber" | "rose" | "sky";
  dot?: boolean;
  className?: string;
}) {
  const tones = {
    neutral: "border-white/[0.08] bg-white/[0.035] text-mist-300",
    violet: "border-violet-400/20 bg-violet-400/10 text-violet-200",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    rose: "border-rose-400/20 bg-rose-400/10 text-rose-200",
    sky: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  };
  const dots = {
    neutral: "bg-mist-400",
    violet: "bg-violet-300",
    emerald: "bg-emerald-300",
    amber: "bg-amber-300",
    rose: "bg-rose-300",
    sky: "bg-sky-300",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide", tones[tone], className)}>
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", dots[tone])} /> : null}
      {children}
    </span>
  );
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const meta = statusMeta[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium", meta.className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot, status === "running" && "animate-pulse")} />
      {meta.label}
    </span>
  );
}

export function LinkStatusBadge({ status }: { status: LinkStatus }) {
  const map = {
    pending: { label: "Pending", tone: "neutral" as const, dot: false },
    inspecting: { label: "Inspecting", tone: "amber" as const, dot: true },
    ready: { label: "Inspected", tone: "emerald" as const, dot: true },
    error: { label: "Error", tone: "rose" as const, dot: true },
  };
  const meta = map[status];
  return (
    <Badge tone={meta.tone} dot={meta.dot}>
      {meta.label}
    </Badge>
  );
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize", riskMeta[risk])}>
      {risk} risk
    </span>
  );
}

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cn("animate-spin", className)} />;
}

export function ProgressBar({ value, tone = "violet", className }: { value: number; tone?: "violet" | "emerald" | "amber" | "sky"; className?: string }) {
  const tones = {
    violet: "from-violet-500 to-fuchsia-400",
    emerald: "from-emerald-500 to-teal-400",
    amber: "from-amber-400 to-orange-400",
    sky: "from-sky-500 to-cyan-400",
  };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]", className)}>
      <div
        className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-500", tones[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon,
  tone = "violet",
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon: ReactNode;
  tone?: "violet" | "emerald" | "amber" | "sky" | "rose";
  delay?: number;
}) {
  const tones = {
    violet: "bg-violet-500/10 text-violet-300 ring-violet-400/15",
    emerald: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/15",
    amber: "bg-amber-500/10 text-amber-300 ring-amber-400/15",
    sky: "bg-sky-500/10 text-sky-300 ring-sky-400/15",
    rose: "bg-rose-500/10 text-rose-300 ring-rose-400/15",
  };
  return (
    <div className="panel animate-fade-up p-4 sm:p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-mist-500">{label}</span>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg ring-1", tones[tone])}>{icon}</span>
      </div>
      <div className="mt-4 stat-number">{value}</div>
      {detail ? <div className="mt-2 text-[11px] leading-relaxed text-mist-500">{detail}</div> : null}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-500" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="input py-2 pl-9 pr-8 text-xs" />
      {value ? (
        <button type="button" onClick={() => onChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-mist-500 hover:text-mist-200" aria-label="Clear search">
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.015] text-center", compact ? "px-4 py-8" : "px-6 py-16")}>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-violet-300">{icon}</div>
      <h3 className="text-sm font-semibold text-mist-100">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-mist-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className={cn("panel relative z-10 max-h-[92vh] w-full overflow-hidden rounded-b-none rounded-t-2xl border-white/10 sm:rounded-2xl animate-fade-up", width)}>
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            {description ? <p className="mt-1 text-xs leading-relaxed text-mist-500">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-mist-500 hover:bg-white/[0.06] hover:text-mist-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[68vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-white/[0.06] px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[75]">
      <button type="button" aria-label="Close panel" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-ink-900/95 shadow-2xl animate-slide-in">
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">{title}</h2>
            {subtitle ? <div className="mt-1 text-xs text-mist-500">{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-mist-500 hover:bg-white/[0.06] hover:text-mist-100" aria-label="Close panel">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-white/[0.07] px-5 py-3">{footer}</div> : null}
      </aside>
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-xs font-medium text-mist-200">{label}</span>
        {description ? <span className="mt-1 block text-[11px] leading-relaxed text-mist-500">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors", checked ? "border-violet-400/40 bg-violet-500/80" : "border-white/10 bg-white/[0.07]")}
      >
        <span className={cn("absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-[3px]")} />
      </button>
    </label>
  );
}

export function ToastViewport() {
  const { toasts, dismissToast } = useApp();
  const icons = {
    info: <Info size={15} className="text-sky-300" />,
    success: <Check size={15} className="text-emerald-300" />,
    warn: <AlertTriangle size={15} className="text-amber-300" />,
    error: <AlertTriangle size={15} className="text-rose-300" />,
  };
  return (
    <div className="pointer-events-none fixed bottom-20 right-3 z-[90] flex w-[calc(100%-24px)] max-w-sm flex-col gap-2 sm:bottom-5 sm:right-5">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-white/10 bg-ink-800/95 px-3.5 py-3 shadow-2xl backdrop-blur-xl animate-toast-in">
          <span className="mt-0.5">{icons[toast.tone]}</span>
          <p className="flex-1 text-xs leading-relaxed text-mist-200">{toast.message}</p>
          <button type="button" onClick={() => dismissToast(toast.id)} className="rounded p-0.5 text-mist-500 hover:text-mist-200" aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-white/[0.07] bg-black/20 p-0.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md font-medium transition-colors",
            size === "sm" ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px]",
            value === option.value ? "bg-white/[0.09] text-white shadow-sm" : "text-mist-500 hover:text-mist-200",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-[11px] text-mist-500">{label}</span>
      <span className={cn("min-w-0 text-right text-[11px] text-mist-200", mono && "mono break-all")}>{children}</span>
    </div>
  );
}
