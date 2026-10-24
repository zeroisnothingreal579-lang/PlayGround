import {
  Activity,
  ExternalLink,
  ImageOff,
  Megaphone,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Square,
} from "lucide-react";
import type { SessionRecord } from "../../shared/types";
import { elapsedFor, formatDuration, hostnameOf, statusMeta, truncate } from "../lib/format";
import { useApp } from "../state/AppContext";
import { cn, ProgressBar, SessionStatusBadge } from "./ui";

export function SessionCard({ session, now }: { session: SessionRecord; now: number }) {
  const { sessionAction, openSession } = useApp();
  const running = session.status === "running" || session.status === "starting";
  const active = running || session.status === "paused" || session.status === "queued";
  void now;
  const elapsed = elapsedFor(session.startedAt, session.elapsedMs, running);
  const canRestart = ["completed", "failed", "stopped"].includes(session.status);

  return (
    <article
      className="session-card group panel panel-hover cursor-pointer overflow-hidden"
      onClick={() => void openSession(session.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") void openSession(session.id);
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open session ${session.label}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="mono text-[11px] font-semibold text-mist-200">{session.label}</span>
          <SessionStatusBadge status={session.status} />
        </div>
        <span className="flex items-center gap-1 text-[9px] text-mist-600">
          <span className={cn("h-1.5 w-1.5 rounded-full", session.workerId.startsWith("remote") ? "bg-sky-400" : "bg-violet-400")} />
          {truncate(session.workerName, 20)}
        </span>
      </div>

      <div className="relative aspect-[16/10] overflow-hidden bg-[#0a0a10]">
        {session.previewDataUrl ? (
          <img
            src={session.previewDataUrl}
            alt={`Live preview of ${session.label}`}
            className="session-preview h-full w-full object-cover object-top transition-transform duration-700"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-mist-600">
            {session.status === "queued" ? <Play size={18} /> : session.status === "failed" ? <ImageOff size={18} /> : <Activity size={18} className="animate-pulse" />}
            <span className="text-[10px]">
              {session.status === "queued" ? "Waiting for a worker slot" : session.status === "failed" ? "No preview captured" : "Waiting for first frame"}
            </span>
            <div className="absolute inset-0 overflow-hidden opacity-40">
              <div className="scan-line h-16 w-full" />
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent px-3 pb-2 pt-8">
          <div className="flex items-center gap-1.5 text-[9px] text-mist-300">
            <span className="h-1 w-1 rounded-full bg-emerald-400" />
            <span className="truncate">{hostnameOf(session.currentUrl || session.targetUrl)}</span>
            {session.currentUrl ? (
              <a
                href={session.currentUrl}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(event) => event.stopPropagation()}
                className="ml-auto text-mist-500 hover:text-white"
                aria-label="Open current URL"
              >
                <ExternalLink size={10} />
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-2.5 px-3.5 py-3">
        <div className="min-h-[30px]">
          <div className="truncate text-[11px] font-medium text-mist-200">{session.title || "No page title yet"}</div>
          <div className="mt-0.5 truncate text-[9px] text-mist-600">{truncate(session.currentUrl || session.targetUrl, 56)}</div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[9px] text-mist-600">
            <span>{session.agentState === "idle" ? "Idle" : session.agentState}</span>
            <span className="mono">{Math.round(session.progress)}%</span>
          </div>
          <ProgressBar
            value={session.progress}
            tone={session.status === "failed" ? "amber" : session.status === "completed" ? "violet" : "sky"}
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-1.5">
            <div className="text-[8px] uppercase tracking-wider text-mist-600">Elapsed</div>
            <div className="mono mt-0.5 text-[10px] text-mist-200">{formatDuration(Math.max(0, elapsed))}</div>
          </div>
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-1.5">
            <div className="text-[8px] uppercase tracking-wider text-mist-600">Actions</div>
            <div className="mono mt-0.5 text-[10px] text-mist-200">{session.actionsCount}</div>
          </div>
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-1.5">
            <div className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-mist-600">
              Ads <Megaphone size={7} />
            </div>
            <div className="mono mt-0.5 text-[10px] text-mist-200">{session.adsDetected}</div>
          </div>
        </div>

        <div className="flex items-center gap-1 border-t border-white/[0.05] pt-2.5">
          {session.status === "paused" ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void sessionAction(session.id, "resume");
              }}
              className="btn-secondary btn-xs flex-1 text-[10px]"
            >
              <Play size={11} /> Resume
            </button>
          ) : canRestart ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void sessionAction(session.id, "start");
              }}
              className="btn-secondary btn-xs flex-1 text-[10px]"
            >
              <RotateCcw size={11} /> Restart
            </button>
          ) : running || session.status === "queued" ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void sessionAction(session.id, "pause");
              }}
              className="btn-secondary btn-xs flex-1 text-[10px]"
            >
              <Pause size={11} /> Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void sessionAction(session.id, "start");
              }}
              className="btn-secondary btn-xs flex-1 text-[10px]"
            >
              <Play size={11} /> Start
            </button>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void openSession(session.id);
            }}
            className="btn-ghost btn-xs text-[10px]"
          >
            <ScrollText size={11} /> Logs
          </button>
          <button
            type="button"
            disabled={!active}
            onClick={(event) => {
              event.stopPropagation();
              void sessionAction(session.id, "stop");
            }}
            className="btn-ghost btn-xs text-[10px] text-rose-300/80 hover:text-rose-200 disabled:opacity-30"
            aria-label="Stop session"
          >
            <Square size={10} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function MiniSession({ session }: { session: SessionRecord }) {
  const meta = statusMeta[session.status];
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot, session.status === "running" && "animate-pulse")} />
      <span className="mono text-[10px] text-mist-300">{session.label}</span>
      <span className="min-w-0 flex-1 truncate text-[9px] text-mist-600">{hostnameOf(session.currentUrl || session.targetUrl)}</span>
      <span className="mono text-[9px] text-mist-500">{Math.round(session.progress)}%</span>
    </div>
  );
}
