import { useEffect, useMemo, useState } from "react";
import { Activity, Layers, MonitorPlay, Pause, Play, Plus, Square, Wifi, WifiOff } from "lucide-react";
import type { SessionStatus } from "../../shared/types";
import { useApp } from "../state/AppContext";
import { SessionCard } from "../components/SessionCard";
import { Badge, EmptyState, PageHeader, SearchInput, Segmented, cn } from "../components/ui";

type FilterStatus = "all" | SessionStatus;

const filterOptions: Array<{ value: FilterStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

const rank: Record<SessionStatus, number> = {
  running: 0,
  starting: 1,
  paused: 2,
  queued: 3,
  failed: 4,
  completed: 5,
  stopped: 6,
};

export function Sessions() {
  const { sessions, overview, live, bulkAction, navigate, loading } = useApp();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<FilterStatus>("all");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);

  const activeCount = sessions.filter((session) => ["running", "starting"].includes(session.status)).length;
  useEffect(() => {
    if (activeCount === 0) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeCount]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: sessions.length };
    for (const session of sessions) result[session.status] = (result[session.status] ?? 0) + 1;
    return result;
  }, [sessions]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return sessions
      .filter((session) => {
        if (status !== "all" && session.status !== status) return false;
        if (!query) return true;
        return (
          session.label.toLowerCase().includes(query) ||
          (session.title ?? "").toLowerCase().includes(query) ||
          session.targetUrl.toLowerCase().includes(query) ||
          (session.currentUrl ?? "").toLowerCase().includes(query) ||
          session.workerName.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt.localeCompare(a.createdAt));
  }, [search, sessions, status]);

  const action = async (name: "start" | "pause" | "resume" | "stop") => {
    setBusy(name);
    await bulkAction(name);
    setBusy(null);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Multi-window orchestration"
        title="Browser session fleet"
        description="Every card is an isolated browser context with its own live preview, agent activity, and elapsed clock. Ads are observed, never clicked."
        actions={
          <>
            <Badge tone={live ? "emerald" : "amber"} dot>{live ? "Live stream" : "Polling"}</Badge>
            <Badge tone="neutral">{sessions.length} sessions</Badge>
            <button type="button" onClick={() => navigate("links")} className="btn-primary h-9 px-3 text-xs">
              <Plus size={13} /> New batch
            </button>
          </>
        }
      />

      <div className="panel mb-4 flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search session, page, URL, or worker" className="w-full sm:w-80" />
            <Segmented
              value={status}
              onChange={setStatus}
              options={filterOptions.map((option) => ({
                value: option.value,
                label: option.value === "all" ? `All ${counts.all ?? 0}` : `${option.label} ${counts[option.value] ?? 0}`,
              }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" disabled={busy !== null} onClick={() => void action("start")} className="btn-secondary btn-xs text-[10px]">
              <Play size={10} /> Start all
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void action("pause")} className="btn-secondary btn-xs text-[10px]">
              <Pause size={10} /> Pause all
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void action("resume")} className="btn-secondary btn-xs text-[10px]">
              <Play size={10} /> Resume all
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void action("stop")} className="btn-danger btn-xs text-[10px]">
              <Square size={9} /> Stop all
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] pt-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] text-mist-600">
            <span className="flex items-center gap-1.5"><span className="live-dot" /> {activeCount} running</span>
            <span className="flex items-center gap-1.5"><Activity size={10} /> {overview?.sessions.queued ?? 0} queued</span>
            <span className="flex items-center gap-1.5"><Layers size={10} /> {overview?.sessions.completed ?? 0} completed</span>
            <span className="flex items-center gap-1.5">{live ? <Wifi size={10} className="text-emerald-400" /> : <WifiOff size={10} className="text-amber-400" />} {live ? "WebSocket connected" : "Automatic polling"}</span>
          </div>
          <span className="text-[9px] text-mist-600">Showing {filtered.length} of {sessions.length}</span>
        </div>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="panel overflow-hidden p-3">
              <div className="skeleton h-4 w-24" />
              <div className="skeleton mt-3 aspect-[16/10] w-full" />
              <div className="skeleton mt-3 h-3 w-3/4" />
              <div className="skeleton mt-2 h-2 w-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel p-4">
          <EmptyState
            icon={<MonitorPlay size={20} />}
            title={sessions.length === 0 ? "No browser sessions yet" : "No sessions match this filter"}
            description={
              sessions.length === 0
                ? "Inspect a URL, then launch between 1 and 100 isolated sessions. LinkPilot queues work to stay within your concurrency quota."
                : "Try a different status or clear the search."
            }
            action={
              <button type="button" className="btn-primary btn-xs" onClick={() => navigate("links")}>
                <Plus size={11} /> Open URL inspector
              </button>
            }
          />
        </div>
      ) : (
        <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4")}>
          {filtered.map((session) => (
            <SessionCard key={session.id} session={session} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
