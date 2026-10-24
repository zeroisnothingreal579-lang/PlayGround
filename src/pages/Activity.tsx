import { useMemo, useState } from "react";
import {
  Activity,
  Bot,
  CircleAlert,
  Globe2,
  Megaphone,
  MousePointerClick,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { SessionEvent, SessionEventType } from "../../shared/types";
import { useApp } from "../state/AppContext";
import { formatDateTime, prettyJson, timeAgo } from "../lib/format";
import { Badge, EmptyState, PageHeader, Panel, SearchInput, Segmented, cn } from "../components/ui";

const typeMeta: Record<SessionEventType, { icon: React.ReactNode; label: string; tone: string }> = {
  system: { icon: <Activity size={12} />, label: "System", tone: "border-white/10 bg-white/[0.04] text-mist-300" },
  navigation: { icon: <Globe2 size={12} />, label: "Navigation", tone: "border-sky-400/20 bg-sky-400/10 text-sky-200" },
  inspection: { icon: <Bot size={12} />, label: "Inspection", tone: "border-violet-400/20 bg-violet-400/10 text-violet-200" },
  action: { icon: <MousePointerClick size={12} />, label: "Action", tone: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" },
  ad: { icon: <Megaphone size={12} />, label: "Ad", tone: "border-amber-400/20 bg-amber-400/10 text-amber-200" },
  ai: { icon: <Sparkles size={12} />, label: "AI", tone: "border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200" },
  warning: { icon: <CircleAlert size={12} />, label: "Warning", tone: "border-amber-400/20 bg-amber-400/10 text-amber-200" },
  error: { icon: <CircleAlert size={12} />, label: "Error", tone: "border-rose-400/20 bg-rose-400/10 text-rose-200" },
  summary: { icon: <ShieldCheck size={12} />, label: "Summary", tone: "border-violet-400/20 bg-violet-400/10 text-violet-200" },
};

function EventRow({ event, sessionLabel, onOpenSession }: { event: SessionEvent; sessionLabel: string; onOpenSession: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const meta = typeMeta[event.type];
  return (
    <div className="group border-b border-white/[0.045] px-4 py-3 last:border-0 hover:bg-white/[0.015] sm:px-5">
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border", meta.tone)}>{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider", event.level === "error" ? "bg-rose-500/10 text-rose-300" : event.level === "warn" ? "bg-amber-500/10 text-amber-300" : "bg-white/[0.04] text-mist-500")}>
              {meta.label}
            </span>
            <button type="button" onClick={onOpenSession} className="mono text-[9px] text-violet-300/80 hover:text-violet-200">
              {sessionLabel}
            </button>
            <span className="text-[9px] text-mist-600">{formatDateTime(event.ts)}</span>
            <span className="text-[9px] text-mist-700">·</span>
            <span className="text-[9px] text-mist-600">{timeAgo(event.ts)}</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-mist-300">{event.message}</p>
          {event.data ? (
            <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1.5 text-[9px] text-mist-600 hover:text-mist-300">
              {expanded ? "Hide structured data" : "Show structured data"}
            </button>
          ) : null}
          {expanded && event.data ? (
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-white/[0.06] bg-black/35 p-3 text-[9px] leading-relaxed text-mist-400">
              {prettyJson(event.data)}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ActivityPage() {
  const { activity, sessions, live, openSession } = useApp();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | SessionEventType>("all");
  const [level, setLevel] = useState<"all" | "info" | "success" | "warn" | "error">("all");

  const sessionLabels = useMemo(() => new Map(sessions.map((session) => [session.id, session.label])), [sessions]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return activity.filter((event) => {
      if (type !== "all" && event.type !== type) return false;
      if (level !== "all" && event.level !== level) return false;
      if (!query) return true;
      return (
        event.message.toLowerCase().includes(query) ||
        event.type.includes(query) ||
        (sessionLabels.get(event.sessionId) ?? "").toLowerCase().includes(query)
      );
    });
  }, [activity, level, search, sessionLabels, type]);

  const counts = useMemo(() => {
    const result = { errors: 0, warnings: 0, ai: 0, ads: 0 };
    for (const event of activity) {
      if (event.level === "error") result.errors += 1;
      if (event.level === "warn") result.warnings += 1;
      if (event.type === "ai") result.ai += 1;
      if (event.type === "ad") result.ads += 1;
    }
    return result;
  }, [activity]);

  return (
    <div>
      <PageHeader
        eyebrow="Agent observability"
        title="Timestamped activity log"
        description="Every inspection, navigation, permitted interface action, ad detection, warning, and summary is recorded. Ads are never clicked and CAPTCHAs are never bypassed."
        actions={
          <>
            <Badge tone={live ? "emerald" : "amber"} dot>{live ? "Streaming" : "Polling"}</Badge>
            <Badge tone="neutral">{activity.length} events</Badge>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Recorded events", value: activity.length, tone: "text-mist-100" },
          { label: "AI decisions", value: counts.ai, tone: "text-violet-200" },
          { label: "Warnings", value: counts.warnings, tone: "text-amber-200" },
          { label: "Errors", value: counts.errors, tone: "text-rose-200" },
        ].map((item) => (
          <div key={item.label} className="panel px-3.5 py-3">
            <div className="text-[9px] uppercase tracking-wider text-mist-600">{item.label}</div>
            <div className={cn("mono mt-1.5 text-xl font-semibold", item.tone)}>{item.value}</div>
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search messages, session, or event type" className="w-full sm:w-80" />
        <select value={type} onChange={(event) => setType(event.target.value as typeof type)} className="input w-auto py-1.5 text-[11px]">
          <option value="all">All event types</option>
          {Object.entries(typeMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
        </select>
        <Segmented
          value={level}
          onChange={setLevel}
          options={[
            { value: "all", label: "All levels" },
            { value: "info", label: "Info" },
            { value: "success", label: "Success" },
            { value: "warn", label: "Warn" },
            { value: "error", label: "Error" },
          ]}
        />
        <span className="ml-auto text-[9px] text-mist-600">{filtered.length} shown</span>
      </div>

      <Panel className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<ScrollText size={18} />}
              title={activity.length === 0 ? "The activity log is empty" : "No events match this filter"}
              description={activity.length === 0 ? "Start a browser session to see the agent's timestamped decisions, navigations, and ad detections here." : "Adjust the event type, level, or search query."}
            />
          </div>
        ) : (
          filtered.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              sessionLabel={sessionLabels.get(event.sessionId) ?? event.sessionId.slice(-8)}
              onOpenSession={() => void openSession(event.sessionId)}
            />
          ))
        )}
      </Panel>
    </div>
  );
}
