import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  CircleAlert,
  ExternalLink,
  Globe2,
  Megaphone,
  MousePointerClick,
  Pause,
  Play,
  ScrollText,
  ShieldCheck,
  Square,
  Sparkles,
} from "lucide-react";
import type { SessionEvent, SessionEventType } from "../../shared/types";
import { useApp } from "../state/AppContext";
import { elapsedFor, formatDateTime, formatDuration, hostnameOf, prettyJson, statusMeta, truncate } from "../lib/format";
import { Badge, cn, Drawer, KeyValue, ProgressBar, SessionStatusBadge, Spinner } from "./ui";

const eventMeta: Record<SessionEventType, { icon: React.ReactNode; tone: string }> = {
  system: { icon: <Activity size={11} />, tone: "border-white/10 bg-white/[0.04] text-mist-300" },
  navigation: { icon: <Globe2 size={11} />, tone: "border-sky-400/20 bg-sky-400/10 text-sky-200" },
  inspection: { icon: <Bot size={11} />, tone: "border-violet-400/20 bg-violet-400/10 text-violet-200" },
  action: { icon: <MousePointerClick size={11} />, tone: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" },
  ad: { icon: <Megaphone size={11} />, tone: "border-amber-400/20 bg-amber-400/10 text-amber-200" },
  ai: { icon: <Sparkles size={11} />, tone: "border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200" },
  warning: { icon: <CircleAlert size={11} />, tone: "border-amber-400/20 bg-amber-400/10 text-amber-200" },
  error: { icon: <CircleAlert size={11} />, tone: "border-rose-400/20 bg-rose-400/10 text-rose-200" },
  summary: { icon: <ShieldCheck size={11} />, tone: "border-violet-400/20 bg-violet-400/10 text-violet-200" },
};

function LogRow({ event }: { event: SessionEvent }) {
  const [expanded, setExpanded] = useState(false);
  const meta = eventMeta[event.type];
  return (
    <div className="relative pl-7">
      <span className={cn("absolute left-0 top-1 flex h-5 w-5 items-center justify-center rounded-md border", meta.tone)}>{meta.icon}</span>
      <span className="absolute bottom-0 left-[9px] top-6 w-px bg-white/[0.055]" />
      <button type="button" className="w-full pb-4 text-left" onClick={() => setExpanded((value) => !value)}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] leading-relaxed text-mist-300">{event.message}</p>
          <time className="mono shrink-0 text-[9px] text-mist-600">{formatDateTime(event.ts).split(", ")[1] ?? formatDateTime(event.ts)}</time>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className={cn("rounded px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wider", event.level === "error" ? "bg-rose-500/10 text-rose-300" : event.level === "warn" ? "bg-amber-500/10 text-amber-300" : "bg-white/[0.04] text-mist-500")}>
            {event.type}
          </span>
          {event.data ? <span className="text-[8px] text-mist-600">{expanded ? "hide data" : "show data"}</span> : null}
        </div>
      </button>
      {expanded && event.data ? (
        <pre className="mb-4 max-h-52 overflow-auto rounded-lg border border-white/[0.06] bg-black/35 p-2.5 text-[9px] leading-relaxed text-mist-400">
          {prettyJson(event.data)}
        </pre>
      ) : null}
    </div>
  );
}

export function SessionDrawer() {
  const { detailSessionId, sessions, ads, sessionEvents, openSession, sessionAction } = useApp();
  const [tab, setTab] = useState<"activity" | "ads" | "details">("activity");
  const session = sessions.find((item) => item.id === detailSessionId) ?? null;
  const events = detailSessionId ? sessionEvents[detailSessionId] ?? [] : [];
  const sessionAds = useMemo(() => ads.filter((ad) => ad.sessionId === detailSessionId), [ads, detailSessionId]);

  useEffect(() => {
    setTab("activity");
  }, [detailSessionId]);

  if (!session) {
    return <Drawer open={false} onClose={() => void openSession(null)} title="Session" children={null} />;
  }
  const running = session.status === "running" || session.status === "starting";
  const elapsed = elapsedFor(session.startedAt, session.elapsedMs, running);
  const meta = statusMeta[session.status];

  return (
    <Drawer
      open={Boolean(detailSessionId)}
      onClose={() => void openSession(null)}
      title={`${session.label} · ${statusMeta[session.status].label}`}
      subtitle={
        <span className="flex items-center gap-2">
          <span>{session.workerName}</span>
          <span className="text-mist-700">/</span>
          <span className="mono">{formatDuration(elapsed)}</span>
          <span className="text-mist-700">/</span>
          <span>{session.actionsCount} actions</span>
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[9px] text-mist-600">
            <ShieldCheck size={11} className="text-emerald-400" />
            Ads detected, never clicked
          </div>
          <div className="flex items-center gap-2">
            {session.status === "paused" ? (
              <button type="button" className="btn-secondary btn-xs" onClick={() => void sessionAction(session.id, "resume")}>
                <Play size={11} /> Resume
              </button>
            ) : running ? (
              <button type="button" className="btn-secondary btn-xs" onClick={() => void sessionAction(session.id, "pause")}>
                <Pause size={11} /> Pause
              </button>
            ) : (
              <button type="button" className="btn-secondary btn-xs" onClick={() => void sessionAction(session.id, "start")}>
                <Play size={11} /> Start
              </button>
            )}
            <button type="button" className="btn-danger btn-xs" onClick={() => void sessionAction(session.id, "stop")}>
              <Square size={10} /> Stop
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/30">
          {session.previewDataUrl ? (
            <img src={session.previewDataUrl} alt="Current session preview" className="max-h-64 w-full object-cover object-top" />
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-mist-600">
              <ScrollText size={20} />
              <span className="text-[10px]">Preview appears when the browser session starts</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-3 py-2">
            <span className="min-w-0 truncate text-[10px] text-mist-400">{truncate(session.currentUrl || session.targetUrl, 72)}</span>
            {session.currentUrl ? (
              <a href={session.currentUrl} target="_blank" rel="noreferrer noopener" className="text-mist-500 hover:text-white" aria-label="Open page in a new tab">
                <ExternalLink size={12} />
              </a>
            ) : null}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="eyebrow">Progress</span>
            <span className="mono text-[10px] text-mist-400">{Math.round(session.progress)}%</span>
          </div>
          <ProgressBar value={session.progress} tone={session.status === "failed" ? "amber" : "violet"} />
          <div className="mt-2 flex items-center gap-2">
            <SessionStatusBadge status={session.status} />
            {session.agentState !== "idle" ? <Badge tone="neutral">{session.agentState}</Badge> : null}
            {running ? <span className="flex items-center gap-1 text-[9px] text-emerald-300"><Spinner size={9} /> live</span> : null}
            {session.error ? <span className="truncate text-[9px] text-rose-300">{session.error}</span> : null}
          </div>
        </div>

        {session.summary ? (
          <div className="rounded-xl border border-violet-400/15 bg-violet-500/[0.05] p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-violet-300">
              <Bot size={11} /> Agent summary
            </div>
            <p className="text-[11px] leading-relaxed text-mist-300">{session.summary}</p>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
            <div className="text-[8px] uppercase tracking-wider text-mist-600">Elapsed</div>
            <div className="mono mt-1 text-xs text-white">{formatDuration(elapsed)}</div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
            <div className="text-[8px] uppercase tracking-wider text-mist-600">Actions</div>
            <div className="mono mt-1 text-xs text-white">{session.actionsCount}</div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
            <div className="text-[8px] uppercase tracking-wider text-mist-600">Ads</div>
            <div className="mono mt-1 text-xs text-white">{session.adsDetected}</div>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-black/20 p-0.5">
          {(
            [
              ["activity", `Activity (${events.length})`],
              ["ads", `Ads (${sessionAds.length})`],
              ["details", "Details"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn("flex-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors", tab === key ? "bg-white/[0.08] text-white" : "text-mist-500 hover:text-mist-200")}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "activity" ? (
          <div>
            {events.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/[0.08] py-10 text-mist-600">
                <ScrollText size={18} />
                <span className="text-[10px]">No events recorded yet</span>
              </div>
            ) : (
              <div>{events.map((event) => <LogRow key={event.id} event={event} />)}</div>
            )}
          </div>
        ) : null}

        {tab === "ads" ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-amber-400/15 bg-amber-400/[0.045] px-3 py-2 text-[10px] leading-relaxed text-amber-200/80">
              Detections are observations, not verified impressions. The agent never clicks advertisements.
            </div>
            {sessionAds.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.08] py-8 text-center text-[10px] text-mist-600">No advertising placements detected in this session.</div>
            ) : (
              sessionAds.map((ad) => (
                <div key={ad.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone="amber">{ad.format}</Badge>
                      {ad.network ? <Badge tone="neutral">{ad.network}</Badge> : null}
                    </div>
                    <span className="mono text-[9px] text-mist-500">{ad.visibleMs}ms</span>
                  </div>
                  <div className="mt-2 break-all font-mono text-[9px] text-mist-500">{ad.selector}</div>
                  <div className="mt-1 flex items-center justify-between text-[9px] text-mist-600">
                    <span>{ad.size ?? "size unknown"} · {ad.method}</span>
                    <span className="flex items-center gap-1 text-mist-500">Verified impression: <span className="text-rose-300">no</span></span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "details" ? (
          <div className="divide-y divide-white/[0.05]">
            <KeyValue label="Target" mono>{session.targetUrl}</KeyValue>
            <KeyValue label="Current" mono>{session.currentUrl ?? "—"}</KeyValue>
            <KeyValue label="Final destination" mono>{session.finalUrl ?? "—"}</KeyValue>
            <KeyValue label="Hostname">{hostnameOf(session.finalUrl || session.currentUrl || session.targetUrl)}</KeyValue>
            <KeyValue label="Worker">{session.workerName} ({session.workerId})</KeyValue>
            <KeyValue label="Isolation">Fresh browser context per session</KeyValue>
            <KeyValue label="Started">{formatDateTime(session.startedAt)}</KeyValue>
            <KeyValue label="Ended">{formatDateTime(session.endedAt)}</KeyValue>
            <KeyValue label="Viewport">{session.options.viewport ? `${session.options.viewport.width}×${session.options.viewport.height}` : "1280×800"}</KeyValue>
            <KeyValue label="Proxy">{session.options.proxy ? "Configured for regional QA" : "None"}</KeyValue>
            <KeyValue label="AI actions limit">{session.options.maxActions ?? 8}</KeyValue>
            <KeyValue label="Policy">Ads never clicked; CAPTCHA never bypassed</KeyValue>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
