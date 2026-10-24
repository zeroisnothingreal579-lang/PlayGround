import os from "node:os";
import { runBrowserSession, type RunnerHooks } from "../server/services/browserRunner.js";
import type { LinkRecord, SessionRecord } from "../shared/types.js";

const SERVER_URL = (process.env.LINKPILOT_SERVER_URL || process.env.SERVER_URL || "http://localhost:3000").replace(/\/+$/, "");
const WORKER_TOKEN = process.env.WORKER_TOKEN || "";
const WORKER_ID = process.env.WORKER_ID || `remote-${os.hostname()}`;
const WORKER_NAME = process.env.WORKER_NAME || os.hostname();
const REGION = process.env.WORKER_REGION || "remote";
const MAX_SESSIONS = Number(process.env.WORKER_MAX_SESSIONS || 5);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 2);
const HEARTBEAT_MS = Number(process.env.WORKER_HEARTBEAT_MS || 15000);
const POLL_MS = 2500;

if (!WORKER_TOKEN) {
  console.error("WORKER_TOKEN is required.");
  process.exit(1);
}

let active = 0;
let stopping = false;
const running = new Set<Promise<void>>();

async function api(path: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${WORKER_TOKEN}`,
      "x-worker-id": WORKER_ID,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok && response.status !== 409) {
    const text = await response.text().catch(() => "");
    throw new Error(`${options.method || "GET"} ${path} -> HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return response;
}

function stats(): Record<string, number> {
  const cpus = os.cpus();
  const load = os.loadavg()[0] || 0;
  return {
    cpu: Number(Math.min(100, (load / Math.max(1, cpus.length)) * 100).toFixed(1)),
    memory: Number((((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1)),
    bandwidthMbps: 0,
    activeSessions: active,
  };
}

async function register(): Promise<void> {
  await api("/api/workers/register", {
    method: "POST",
    body: JSON.stringify({
      id: WORKER_ID,
      name: WORKER_NAME,
      region: REGION,
      maxSessions: MAX_SESSIONS,
      bandwidthMbps: Number(process.env.WORKER_BANDWIDTH_MBPS || 0),
      meta: {
        hostname: os.hostname(),
        platform: `${os.platform()} ${os.release()}`,
        cores: os.cpus().length,
        memoryTotalMb: Math.round(os.totalmem() / 1024 / 1024),
        concurrency: CONCURRENCY,
        kind: "docker-or-cloud",
      },
    }),
  });
  console.log(`[worker] registered ${WORKER_ID} (${REGION}) at ${SERVER_URL}`);
}

async function heartbeatLoop(): Promise<void> {
  while (!stopping) {
    try {
      await api(`/api/workers/${encodeURIComponent(WORKER_ID)}/heartbeat`, {
        method: "POST",
        body: JSON.stringify(stats()),
      });
    } catch (error) {
      console.error("[worker] heartbeat failed", error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, HEARTBEAT_MS));
  }
}

async function runJob(job: { session: SessionRecord; link: LinkRecord }): Promise<void> {
  const { session, link } = job;
  active += 1;
  const controls = { paused: false, stopped: false };
  let pollTimer: NodeJS.Timeout | null = null;
  let finished = false;

  const pollState = async (): Promise<void> => {
    if (finished) return;
    try {
      const response = await api(`/api/worker/sessions/${session.id}/state`);
      if (response.ok) {
        const state = (await response.json()) as { paused: boolean; stopped: boolean };
        controls.paused = state.paused;
        controls.stopped = state.stopped;
      }
    } catch {
      /* transient */
    }
    if (!finished) pollTimer = setTimeout(() => void pollState(), 1500);
  };
  void pollState();

  const hooks: RunnerHooks = {
    onUpdate: async (patch) => {
      await api(`/api/worker/sessions/${session.id}/update`, { method: "POST", body: JSON.stringify(patch) });
    },
    onEvent: async (event) => {
      await api(`/api/worker/sessions/${session.id}/events`, {
        method: "POST",
        body: JSON.stringify({ type: event.type, level: event.level, message: event.message, data: event.data }),
      });
    },
    onAd: async (ad) => {
      await api(`/api/worker/sessions/${session.id}/ads`, {
        method: "POST",
        body: JSON.stringify({
          format: ad.format,
          network: ad.network,
          selector: ad.selector,
          visibleMs: ad.visibleMs,
          detectedAt: ad.detectedAt,
          method: ad.method,
          size: ad.size,
          pageUrl: ad.pageUrl,
        }),
      });
    },
    onPreview: async (dataUrl) => {
      await api(`/api/worker/sessions/${session.id}/preview`, {
        method: "POST",
        body: JSON.stringify({ dataUrl }),
      }).catch(() => undefined);
    },
    registerStop: () => undefined,
    isPaused: () => controls.paused,
    isStopped: () => controls.stopped,
  };

  try {
    const result = await runBrowserSession({
      sessionId: session.id,
      targetUrl: link.originalUrl,
      options: session.options,
      ai: {
        enabled: Boolean(process.env.LLM_API_KEY),
        baseUrl: (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
        model: process.env.LLM_MODEL || "gpt-4o-mini",
        temperature: Number(process.env.LLM_TEMPERATURE || 0.2),
        maxActions: session.options.maxActions ?? Number(process.env.LLM_MAX_ACTIONS || 8),
        apiKey: process.env.LLM_API_KEY || "",
        keySource: process.env.LLM_API_KEY ? "env" : "none",
      },
      hooks,
      region: REGION,
    });
    if (result.stopped) {
      await hooks.onUpdate({ status: "stopped", endedAt: new Date().toISOString() });
    }
    console.log(`[worker] ${session.label} finished: ${result.summary}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] ${session.label} failed`, message);
    await Promise.resolve(hooks.onUpdate({ status: "failed", error: message, endedAt: new Date().toISOString() })).catch(() => undefined);
    await Promise.resolve(hooks.onEvent({ type: "error", level: "error", message: `Remote worker error: ${message}` })).catch(() => undefined);
  } finally {
    finished = true;
    controls.stopped = true;
    if (pollTimer) clearTimeout(pollTimer);
    active = Math.max(0, active - 1);
  }
}

async function claimLoop(): Promise<void> {
  while (!stopping) {
    if (active < CONCURRENCY) {
      try {
        const response = await api(`/api/worker/jobs?limit=${Math.max(1, CONCURRENCY - active)}`);
        const payload = (await response.json()) as { jobs?: Array<{ session: SessionRecord; link: LinkRecord }> };
        const jobs = payload.jobs ?? [];
        for (const job of jobs) {
          const promise = runJob(job).finally(() => running.delete(promise));
          running.add(promise);
        }
      } catch (error) {
        console.error("[worker] claim failed", error instanceof Error ? error.message : error);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function main(): Promise<void> {
  await register();
  void heartbeatLoop();
  void claimLoop();
  const shutdown = async (): Promise<void> => {
    stopping = true;
    console.log("[worker] shutting down, waiting for active sessions");
    await Promise.allSettled(Array.from(running));
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
