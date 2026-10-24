import { useState } from "react";
import {
  Boxes,
  Check,
  Cloud,
  Cpu,
  Copy,
  Globe2,
  HardDrive,
  Info,
  LockKeyhole,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useApp } from "../state/AppContext";
import { formatNumber, timeAgo } from "../lib/format";
import { Badge, PageHeader, Panel, ProgressBar, SectionHeader, StatCard, cn } from "../components/ui";

const workerCommand = `# Remote worker (Docker or cloud VM)
export LINKPILOT_SERVER_URL="https://your-linkpilot-host"
export WORKER_TOKEN="<WORKER_TOKEN from the server>"
export WORKER_ID="worker-eu-1"
export WORKER_NAME="eu-west-browser"
export WORKER_REGION="eu-west"
export WORKER_MAX_SESSIONS="8"
export WORKER_CONCURRENCY="3"
export CHROMIUM_PATH="/usr/bin/chromium"
npm run worker`;

const dockerSnippet = `# docker-compose.yml (worker service)
worker:
  image: mcr.microsoft.com/playwright:v1.64.1-noble
  command: npm run worker
  environment:
    LINKPILOT_SERVER_URL: http://app:3000
    WORKER_TOKEN: \${WORKER_TOKEN}
    WORKER_ID: worker-docker-1
    WORKER_REGION: eu-central
    WORKER_MAX_SESSIONS: "10"
    WORKER_CONCURRENCY: "4"
  depends_on: [app]`;

export function Infrastructure() {
  const { workers, settings, health, refreshWorkers, notify } = useApp();
  const [copied, setCopied] = useState<string | null>(null);

  const online = workers.filter((worker) => worker.status !== "offline");
  const totalCapacity = online.reduce((sum, worker) => sum + worker.maxSessions, 0);
  const activeSessions = workers.reduce((sum, worker) => sum + worker.activeSessions, 0);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      notify("Copied to clipboard", "success");
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      notify("Clipboard is unavailable in this browser", "warn");
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Worker fleet and network isolation"
        description="Distribute isolated browser sessions across the local runtime and registered remote workers. Capacity, heartbeat, and resource metrics are measured from the actual processes."
        actions={
          <>
            <Badge tone={online.length ? "emerald" : "amber"} dot>{online.length} online</Badge>
            <button type="button" onClick={() => void refreshWorkers()} className="btn-secondary h-9 px-3 text-xs">
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Online workers" value={formatNumber(online.length)} detail={`${workers.length} registered`} icon={<Server size={14} />} tone="emerald" />
        <StatCard label="Session capacity" value={formatNumber(totalCapacity)} detail={`${activeSessions} active across fleet`} icon={<Boxes size={14} />} tone="sky" delay={40} />
        <StatCard label="Concurrency limit" value={formatNumber(settings?.safety.maxActiveSessions ?? 0)} detail="Active sessions across all workers" icon={<Cpu size={14} />} tone="violet" delay={80} />
        <StatCard label="Database" value={settings?.integrations.database === "postgres" ? "Postgres" : "Local"} detail={settings?.integrations.database === "postgres" ? "Production store connected" : "Development JSON fallback"} icon={<HardDrive size={14} />} tone="amber" delay={120} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-3">
          {workers.length === 0 ? (
            <Panel className="p-4">
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Server size={20} className="text-mist-600" />
                <p className="mt-2 text-xs font-medium text-mist-300">Worker registry is initializing</p>
                <p className="mt-1 text-[10px] text-mist-600">The local worker registers automatically at startup.</p>
              </div>
            </Panel>
          ) : (
            workers.map((worker) => {
              const offline = worker.status === "offline";
              return (
                <Panel key={worker.id} className={cn("p-4 sm:p-5", offline && "opacity-70")}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", worker.kind === "remote" ? "border-sky-400/20 bg-sky-400/10 text-sky-300" : "border-violet-400/20 bg-violet-400/10 text-violet-300")}>
                        {worker.kind === "remote" ? <Cloud size={17} /> : <Server size={17} />}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xs font-semibold text-mist-100">{worker.name}</h3>
                          <Badge tone={offline ? "neutral" : worker.status === "busy" ? "sky" : "emerald"} dot>{worker.status}</Badge>
                          <Badge tone={worker.kind === "remote" ? "sky" : "violet"}>{worker.kind}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-mist-600">
                          <span className="flex items-center gap-1"><Globe2 size={9} /> {worker.region}</span>
                          <span className="flex items-center gap-1">{offline ? <WifiOff size={9} /> : <Wifi size={9} />} heartbeat {timeAgo(worker.lastHeartbeat)}</span>
                          <span className="mono">{worker.id}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="mono text-lg font-semibold text-white">{worker.activeSessions}<span className="text-xs text-mist-600">/{worker.maxSessions}</span></div>
                      <div className="text-[8px] uppercase tracking-wider text-mist-600">sessions</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[9px]">
                        <span className="flex items-center gap-1 text-mist-500"><Cpu size={9} /> CPU</span>
                        <span className="mono text-mist-400">{worker.cpu.toFixed(0)}%</span>
                      </div>
                      <ProgressBar value={worker.cpu} tone={worker.cpu > 80 ? "amber" : "violet"} className="h-1" />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[9px]">
                        <span className="flex items-center gap-1 text-mist-500"><HardDrive size={9} /> Memory</span>
                        <span className="mono text-mist-400">{worker.memory.toFixed(0)}%</span>
                      </div>
                      <ProgressBar value={worker.memory} tone={worker.memory > 85 ? "amber" : "sky"} className="h-1" />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[9px]">
                        <span className="flex items-center gap-1 text-mist-500"><Network size={9} /> Bandwidth</span>
                        <span className="mono text-mist-400">{worker.bandwidthMbps.toFixed(1)} Mbps</span>
                      </div>
                      <ProgressBar value={Math.min(100, worker.bandwidthMbps)} tone="emerald" className="h-1" />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/[0.05] pt-2.5 text-[9px] text-mist-600">
                    <span>{String(worker.meta.platform ?? "unknown platform")}</span>
                    <span>{String(worker.meta.cores ?? "—")} CPU cores</span>
                    <span>{String(worker.meta.memoryTotalMb ?? "—")} MB RAM</span>
                    {worker.kind === "local" ? <span className="flex items-center gap-1 text-emerald-400/70"><LockKeyhole size={9} /> isolated browser contexts</span> : null}
                  </div>
                </Panel>
              );
            })
          )}
        </div>

        <div className="space-y-4">
          <Panel className="p-4 sm:p-5">
            <SectionHeader title="Isolation model" description="How sessions are kept separate." />
            <div className="mt-3 space-y-2.5">
              {[
                ["Fresh context per session", "Cookies, storage, cache, and service workers are isolated per session."],
                ["No identity rotation", "Sessions are automated QA workers, not simulated humans. IPs and windows are never reported as visitors."],
                ["SSRF protection", settings?.safety.blockPrivateTargets ? "Private, local, and metadata addresses are blocked during inspection." : "Private targets are currently allowed for development."],
                ["TLS verification", "Certificate errors are not ignored by browser sessions."],
                ["Ad safety guard", "Click controls inside ad containers are rejected at both planning and execution time."],
              ].map(([title, description]) => (
                <div key={title} className="flex gap-2">
                  <ShieldCheck size={11} className="mt-0.5 shrink-0 text-emerald-400/80" />
                  <p className="text-[10px] leading-relaxed text-mist-500"><span className="font-medium text-mist-300">{title}.</span> {description}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <SectionHeader title="Runtime status" description="Detected from the server environment." />
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
                <span className="text-[10px] text-mist-400">Chromium runtime</span>
                <Badge tone={health?.browser.configured ? "emerald" : "amber"} dot>{health?.browser.configured ? "available" : "not found"}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
                <span className="text-[10px] text-mist-400">Remote registration</span>
                <Badge tone={health?.features.workerRegistration ? "emerald" : "neutral"} dot>{health?.features.workerRegistration ? "enabled" : "disabled"}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
                <span className="text-[10px] text-mist-400">Verified import API</span>
                <Badge tone={health?.features.verifiedAnalyticsImport ? "emerald" : "neutral"} dot>{health?.features.verifiedAnalyticsImport ? "configured" : "not configured"}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
                <span className="text-[10px] text-mist-400">AI provider</span>
                <Badge tone={health?.features.aiProvider ? "emerald" : "neutral"} dot>{health?.features.aiProvider ? "configured" : "heuristic fallback"}</Badge>
              </div>
            </div>
            {!health?.browser.configured ? (
              <div className="mt-3 flex gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.045] p-2.5 text-[9px] leading-relaxed text-amber-200/80">
                <Info size={11} className="mt-0.5 shrink-0" />
                Browser sessions will fail until Chromium is installed. Set CHROMIUM_PATH or install the Playwright browser in the worker image.
              </div>
            ) : null}
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 sm:px-5">
            <SectionHeader title="Register a remote worker" description="Run this agent on a Docker container or cloud VM." />
            <button type="button" onClick={() => void copy(workerCommand, "worker")} className="btn-secondary btn-xs text-[10px]">
              {copied === "worker" ? <Check size={10} /> : <Copy size={10} />} Copy
            </button>
          </div>
          <pre className="max-h-72 overflow-auto bg-black/30 p-4 text-[9px] leading-relaxed text-mist-400">{workerCommand}</pre>
          <div className="flex items-center gap-1.5 border-t border-white/[0.05] px-4 py-2 text-[9px] text-mist-600">
            <Terminal size={10} /> Requires WORKER_TOKEN on the server. The shared token is never returned by the API.
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 sm:px-5">
            <SectionHeader title="Docker worker service" description="Scale browser workers independently from the API." />
            <button type="button" onClick={() => void copy(dockerSnippet, "docker")} className="btn-secondary btn-xs text-[10px]">
              {copied === "docker" ? <Check size={10} /> : <Copy size={10} />} Copy
            </button>
          </div>
          <pre className="max-h-72 overflow-auto bg-black/30 p-4 text-[9px] leading-relaxed text-mist-400">{dockerSnippet}</pre>
          <div className="flex items-center gap-1.5 border-t border-white/[0.05] px-4 py-2 text-[9px] text-mist-600">
            <Cloud size={10} /> Worker sessions use fresh browser contexts and report measured ad observations only.
          </div>
        </Panel>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[10px] leading-relaxed text-mist-500">
        <Info size={13} className="mt-0.5 shrink-0 text-sky-300" />
        <p>
          Regional proxies and multiple IP addresses exist for compatibility testing only. They do not make automated sessions genuine human visitors, and session counts must never be reported to shortener, advertising, or analytics platforms as traffic or revenue.
        </p>
      </div>
    </div>
  );
}
