import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CircleDot,
  Globe2,
  Link2,
  Megaphone,
  MonitorPlay,
  Pause,
  Play,
  Radar,
  ShieldCheck,
  Sparkles,
  Square,
  Waypoints,
  Zap,
} from "lucide-react";
import { useApp } from "../state/AppContext";
import { formatNumber, hostnameOf, statusMeta, timeAgo } from "../lib/format";
import { Badge, Panel, ProgressBar, SectionHeader, StatCard } from "../components/ui";
import { DestinationBars, StatusDonut as StatusDonutChart } from "../components/Charts";

export function Dashboard() {
  const { overview, sessions, links, activity, workers, bulkAction, submitUrls, navigate, live } = useApp();
  const [quickUrl, setQuickUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeSessions = useMemo(
    () => sessions.filter((session) => ["starting", "running", "paused", "queued"].includes(session.status)),
    [sessions],
  );
  const recentSessions = useMemo(() => {
    const priority = [...sessions].sort((a, b) => {
      const rank = (status: string) => (status === "running" ? 0 : status === "starting" ? 1 : status === "paused" ? 2 : status === "queued" ? 3 : 4);
      return rank(a.status) - rank(b.status) || b.createdAt.localeCompare(a.createdAt);
    });
    return priority.slice(0, 3);
  }, [sessions]);
  const recentEvents = activity.slice(0, 6);
  const destinations = useMemo(() => {
    const counts = new Map<string, number>();
    for (const link of links) {
      const domain = link.inspection?.finalDomain;
      if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([domain, count]) => ({ domain, sessions: count }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 4);
  }, [links]);

  const statusCounts = overview?.sessions ?? { completed: 0, failed: 0, stopped: 0, active: 0, queued: 0, total: 0 };

  const submit = async () => {
    if (!quickUrl.trim()) return;
    setSubmitting(true);
    await submitUrls(quickUrl);
    setQuickUrl("");
    setSubmitting(false);
  };

  return (
    <div className="space-y-5">
      <section className="panel relative overflow-hidden p-5 sm:p-7">
        <div className="absolute inset-0 grid-overlay opacity-60" />
        <div className="absolute -right-24 -top-32 h-72 w-72 rounded-full bg-violet-600/20 blur-[90px]" />
        <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-cyan-500/[0.07] blur-[80px]" />
        <div className="relative grid gap-7 xl:grid-cols-[1.25fr_0.75fr]">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone="violet" dot>
                Authorized QA workspace
              </Badge>
              <Badge tone={live ? "emerald" : "amber"} dot>
                {live ? "Realtime connected" : "Polling fallback"}
              </Badge>
            </div>
            <h1 className="max-w-2xl text-3xl font-semibold leading-[1.06] tracking-[-0.045em] text-white sm:text-[42px]">
              Open every redirect.
              <br />
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-200 to-cyan-200 bg-clip-text text-transparent">See the whole chain.</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist-400">
              Inspect shortener links, run isolated browser sessions, and let the agent map destinations and ad placements — without generating fake traffic or clicking ads.
            </p>

            <div className="mt-6 flex max-w-2xl flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Globe2 size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-500" />
                <input
                  value={quickUrl}
                  onChange={(event) => setQuickUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void submit();
                  }}
                  className="input h-11 pl-10 text-xs"
                  placeholder="Paste a shortener, tracking, or redirect URL…"
                  aria-label="URL to inspect"
                />
              </div>
              <button type="button" onClick={() => void submit()} disabled={submitting || !quickUrl.trim()} className="btn-primary h-11 px-5 text-xs">
                <Zap size={14} />
                {submitting ? "Inspecting…" : "Inspect link"}
              </button>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[10px] text-mist-600">
              <span>Works with bit.ly, tinyurl, tracking links, and ordinary URLs.</span>
              <button type="button" onClick={() => setQuickUrl("https://example.com")} className="text-violet-300/80 underline decoration-violet-400/30 underline-offset-2 hover:text-violet-200">
                Use example
              </button>
            </div>
          </div>

          <div className="relative hidden min-h-[230px] items-center justify-center xl:flex">
            <div className="absolute h-52 w-52 rounded-full border border-violet-400/10" />
            <div className="absolute h-36 w-36 rounded-full border border-violet-400/15" />
            <div className="absolute h-52 w-52 animate-[spin_30s_linear_infinite] rounded-full border border-dashed border-violet-400/15" />
            <div className="absolute left-1/2 top-1/2 flex h-[74px] w-[74px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border border-violet-400/30 bg-violet-500/10 shadow-[0_0_50px_-10px_rgba(139,92,246,0.7)]">
              <Radar size={22} className="text-violet-200" />
              <span className="mt-1 text-[8px] font-semibold uppercase tracking-widest text-violet-300">Agent</span>
            </div>
            {[
              { label: "Redirect", icon: <Waypoints size={12} />, className: "left-6 top-4", delay: "0s" },
              { label: "Preview", icon: <MonitorPlay size={12} />, className: "right-3 top-10", delay: "0.6s" },
              { label: "Ads", icon: <Megaphone size={12} />, className: "bottom-5 left-10", delay: "1.1s" },
              { label: "Policy", icon: <ShieldCheck size={12} />, className: "bottom-3 right-8", delay: "1.6s" },
            ].map((node) => (
              <div
                key={node.label}
                className={`absolute flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-ink-850/90 px-2.5 py-1.5 text-[9px] text-mist-300 shadow-xl backdrop-blur ${node.className}`}
                style={{ animation: `fade-up 600ms ${node.delay} both` }}
              >
                <span className="text-violet-300">{node.icon}</span>
                {node.label}
              </div>
            ))}
            <div className="absolute bottom-0 right-0 left-0 flex items-center justify-center gap-1.5 text-[9px] text-mist-600">
              <CircleDot size={10} className="text-emerald-400" />
              isolated contexts · no ad automation
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Links inspected" value={formatNumber(overview?.links.total ?? 0)} detail={`${overview?.links.ready ?? 0} ready · ${overview?.links.error ?? 0} failed`} icon={<Link2 size={14} />} />
        <StatCard label="Active sessions" value={formatNumber((overview?.sessions.active ?? 0) + (overview?.sessions.queued ?? 0))} detail={`${overview?.sessions.active ?? 0} live · ${overview?.sessions.queued ?? 0} queued`} icon={<MonitorPlay size={14} />} tone="sky" delay={40} />
        <StatCard label="Redirect success" value={`${formatNumber(overview?.redirects.successRate ?? 0)}%`} detail={`${overview?.redirects.blocked ?? 0} blocked · ${overview?.redirects.loops ?? 0} loops`} icon={<Waypoints size={14} />} tone="emerald" delay={80} />
        <StatCard label="Ad placements" value={formatNumber(overview?.ads.detected ?? 0)} detail="Detection only · never clicked" icon={<Megaphone size={14} />} tone="amber" delay={120} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
        <Panel className="p-4 sm:p-5">
          <SectionHeader
            title="Live session mesh"
            description="Independent browser contexts with periodic previews. Ads are detected, never clicked."
            action={
              <button type="button" className="btn-ghost btn-xs text-[10px]" onClick={() => navigate("sessions")}>
                All sessions <ArrowUpRight size={11} />
              </button>
            }
          />
          {recentSessions.length ? (
            <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
              {recentSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => navigate("sessions")}
                  className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-black/25 text-left transition-colors hover:border-violet-400/25"
                >
                  <div className="relative aspect-video overflow-hidden bg-[#09090e]">
                    {session.previewDataUrl ? (
                      <img src={session.previewDataUrl} alt="" className="h-full w-full object-cover object-top opacity-90 transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-mist-600">
                        <MonitorPlay size={18} />
                      </div>
                    )}
                    <div className="absolute left-2 top-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-medium ${statusMeta[session.status].className}`}>
                        <span className={`h-1 w-1 rounded-full ${statusMeta[session.status].dot}`} />
                        {statusMeta[session.status].label}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5 px-2.5 py-2">
                    <div className="flex items-center justify-between">
                      <span className="mono text-[9px] text-mist-300">{session.label}</span>
                      <span className="text-[8px] text-mist-600">{session.adsDetected} ads</span>
                    </div>
                    <div className="truncate text-[9px] text-mist-500">{hostnameOf(session.currentUrl || session.targetUrl)}</div>
                    <ProgressBar value={session.progress} className="h-1" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] py-10 text-center">
              <MonitorPlay size={20} className="text-mist-600" />
              <p className="mt-2 text-xs font-medium text-mist-300">No browser sessions yet</p>
              <p className="mt-1 max-w-xs text-[10px] leading-relaxed text-mist-600">Inspect a link, then launch 1 to 100 isolated sessions from the URL inspector.</p>
              <button type="button" className="btn-secondary btn-xs mt-4" onClick={() => navigate("links")}>
                <Link2 size={11} /> Open URL inspector
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.055] pt-3">
            <span className="mr-1 text-[9px] uppercase tracking-wider text-mist-600">Bulk controls</span>
            <button type="button" className="btn-secondary btn-xs text-[10px]" onClick={() => void bulkAction("start")}><Play size={10} /> Start all</button>
            <button type="button" className="btn-secondary btn-xs text-[10px]" onClick={() => void bulkAction("pause")}><Pause size={10} /> Pause</button>
            <button type="button" className="btn-secondary btn-xs text-[10px]" onClick={() => void bulkAction("resume")}><Play size={10} /> Resume</button>
            <button type="button" className="btn-danger btn-xs ml-auto text-[10px]" onClick={() => void bulkAction("stop")}><Square size={9} /> Stop all</button>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4 sm:p-5">
            <SectionHeader title="Session outcomes" description="Measured automation runs, not human traffic." />
            <div className="mt-4">
              <StatusDonutChart
                centerValue={String(statusCounts.total)}
                centerLabel="sessions"
                segments={[
                  { label: "Completed", value: statusCounts.completed, color: "#8b5cf6" },
                  { label: "Active", value: statusCounts.active, color: "#34d399" },
                  { label: "Failed", value: statusCounts.failed, color: "#fb7185" },
                  { label: "Queued", value: statusCounts.queued, color: "#fbbf24" },
                  { label: "Stopped", value: statusCounts.stopped, color: "#64748b" },
                ]}
              />
            </div>
            <div className="divider my-4" />
            <div className="flex items-center justify-between text-[10px]">
              <span className="flex items-center gap-1.5 text-mist-500"><ShieldCheck size={12} className="text-emerald-400" /> Verified impressions</span>
              <span className="mono text-mist-300">{formatNumber(overview?.ads.verifiedImpressions ?? 0)}</span>
            </div>
            <p className="mt-1.5 text-[9px] leading-relaxed text-mist-600">Only populated by an authorized analytics import. Detected placements are never counted as impressions.</p>
          </Panel>

          <Panel className="relative overflow-hidden p-4 sm:p-5">
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl" />
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                <ShieldCheck size={15} />
              </span>
              <div>
                <h3 className="text-xs font-semibold text-mist-100">Automation boundary enforced</h3>
                <p className="mt-1 text-[10px] leading-relaxed text-mist-500">No ad clicks, rewarded-link bypasses, CAPTCHA solving, or traffic fabrication. Every action is logged against policy v2026-10-1.</p>
                <button type="button" onClick={() => navigate("settings")} className="mt-2 flex items-center gap-1 text-[9px] font-medium text-violet-300 hover:text-violet-200">
                  Review policy <ArrowRight size={10} />
                </button>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
        <Panel className="min-w-0 p-4 sm:p-5">
          <SectionHeader title="Recent agent activity" description="Timestamped events from active and completed sessions." action={<button type="button" className="btn-ghost btn-xs text-[10px]" onClick={() => navigate("activity")}>Open log <ArrowRight size={10} /></button>} />
          <div className="mt-3 space-y-2.5">
            {recentEvents.length === 0 ? (
              <p className="py-8 text-center text-[10px] text-mist-600">No events yet. Start a browser session to populate the log.</p>
            ) : (
              recentEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-2.5">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${event.level === "error" ? "border-rose-400/20 bg-rose-400/10 text-rose-300" : event.level === "warn" ? "border-amber-400/20 bg-amber-400/10 text-amber-300" : "border-white/[0.07] bg-white/[0.03] text-mist-400"}`}>
                    {event.type === "ai" ? <Sparkles size={11} /> : event.type === "ad" ? <Megaphone size={11} /> : event.type === "navigation" ? <Globe2 size={11} /> : <Activity size={11} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] text-mist-300">{event.message}</p>
                    <p className="mt-0.5 text-[8px] text-mist-600">{timeAgo(event.ts)} · {event.type}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel className="min-w-0 p-4 sm:p-5">
          <SectionHeader title="Destination domains" description="Final destinations resolved by link inspection." action={<Badge tone="neutral">{overview?.destinations ?? 0} unique</Badge>} />
          <div className="mt-4">
            <DestinationBars destinations={destinations} emptyLabel="Inspect a link to map its final destination." />
          </div>
          {links.length > 0 ? (
            <button type="button" onClick={() => navigate("links")} className="mt-4 flex w-full items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[10px] text-mist-400 hover:border-violet-400/20 hover:text-mist-200">
              <span>View redirect chains</span>
              <ArrowRight size={11} />
            </button>
          ) : null}
        </Panel>

        <Panel className="flex min-w-0 flex-col justify-between p-4 sm:p-5">
          <div>
            <SectionHeader title="Worker fleet" description="Local and remote capacity." action={<Badge tone={overview?.workers.online ? "emerald" : "neutral"} dot>{overview?.workers.online ?? 0} online</Badge>} />
            <div className="mt-4 space-y-3">
              {workers.slice(0, 4).map((worker) => {
                const utilization = worker.maxSessions ? Math.min(100, (worker.activeSessions / worker.maxSessions) * 100) : 0;
                return (
                  <div key={worker.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${worker.status === "offline" ? "bg-mist-600" : worker.status === "busy" ? "bg-sky-400" : "bg-emerald-400"}`} />
                        <span className="truncate text-[10px] font-medium text-mist-200">{worker.name}</span>
                      </span>
                      <span className="mono shrink-0 text-[9px] text-mist-500">{worker.activeSessions}/{worker.maxSessions}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[8px] text-mist-600">
                      <span>{worker.region} · {worker.kind}</span>
                      <span>CPU {worker.cpu.toFixed(0)}% · MEM {worker.memory.toFixed(0)}%</span>
                    </div>
                    <ProgressBar value={utilization} tone={utilization > 80 ? "amber" : "emerald"} className="mt-1.5 h-1" />
                  </div>
                );
              })}
              {workers.length === 0 ? (
                <p className="py-6 text-center text-[10px] text-mist-600">Worker registry is initializing.</p>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={() => navigate("infrastructure")} className="btn-secondary btn-xs mt-4 w-full text-[10px]">
            <Bot size={11} /> Inspect infrastructure
          </button>
        </Panel>
      </div>
    </div>
  );
}
