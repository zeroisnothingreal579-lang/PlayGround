import { readFileSync } from "node:fs";
import os from "node:os";
import type { WorkerRecord } from "../../shared/types.js";
import { config } from "../config.js";
import { clamp, nowIso } from "../lib/util.js";
import { realtime } from "../realtime.js";
import type { Store } from "../store/types.js";

class NetworkMeter {
  private previous: { bytes: number; at: number } | null = null;

  constructor(private readonly path = "/proc/net/dev") {}

  sampleMbps(): number {
    try {
      const content = readFileSync(this.path, "utf8");
      let bytes = 0;
      for (const line of content.split("\n").slice(2)) {
        const [name, rest] = line.split(":");
        if (!rest || name.trim() === "lo") continue;
        const fields = rest.trim().split(/\s+/).map(Number);
        bytes += (fields[0] || 0) + (fields[8] || 0);
      }
      const now = Date.now();
      if (!this.previous) {
        this.previous = { bytes, at: now };
        return 0;
      }
      const deltaBytes = Math.max(0, bytes - this.previous.bytes);
      const seconds = Math.max(0.001, (now - this.previous.at) / 1000);
      this.previous = { bytes, at: now };
      return Number(((deltaBytes * 8) / seconds / 1_000_000).toFixed(2));
    } catch {
      return 0;
    }
  }
}

export interface RemoteWorkerRegistration {
  id?: string;
  name: string;
  region: string;
  maxSessions?: number;
  bandwidthMbps?: number;
  meta?: Record<string, unknown>;
}

export class WorkerRegistry {
  private meter = new NetworkMeter();
  private localActive = 0;
  private timer: NodeJS.Timeout | null = null;
  private remotePending = new Map<string, number>();

  constructor(private readonly store: Store) {}

  async init(): Promise<void> {
    await this.refreshLocal(true);
    this.timer = setInterval(() => {
      void this.refreshLocal();
      void this.reapRemote();
    }, 10_000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setLocalActive(count: number): void {
    this.localActive = count;
  }

  localWorker(): WorkerRecord {
    const cpus = os.cpus();
    const load = os.loadavg()[0] || 0;
    const total = os.totalmem();
    const used = total - os.freemem();
    const cpu = clamp((load / Math.max(1, cpus.length)) * 100, 0, 100);
    const memory = clamp((used / total) * 100, 0, 100);
    const busy = this.localActive > 0;
    return {
      id: config.worker.id,
      name: config.worker.name,
      region: config.worker.region,
      kind: "local",
      status: busy ? "busy" : "online",
      cpu: Number(cpu.toFixed(1)),
      memory: Number(memory.toFixed(1)),
      bandwidthMbps: this.meter.sampleMbps(),
      activeSessions: this.localActive,
      maxSessions: Math.min(config.worker.maxSessions, config.maxActiveSessions),
      lastHeartbeat: nowIso(),
      meta: {
        cores: cpus.length,
        memoryTotalMb: Math.round(total / 1024 / 1024),
        platform: `${os.platform()} ${os.release()}`,
        concurrencyLimit: config.maxConcurrentSessions,
        bandwidthCapacityMbps: config.worker.bandwidthMbps,
        browser: config.browser.executablePath || "not found",
      },
    };
  }

  async refreshLocal(broadcast = false): Promise<WorkerRecord> {
    const worker = this.localWorker();
    await this.store.upsertWorker(worker);
    if (broadcast) realtime.emit({ type: "worker.updated", worker });
    return worker;
  }

  async list(): Promise<WorkerRecord[]> {
    await this.refreshLocal(false);
    const workers = await this.store.listWorkers();
    return workers.map((worker) => {
      if (worker.kind === "remote" && Date.now() - Date.parse(worker.lastHeartbeat) > 45_000) {
        return { ...worker, status: "offline" as const, activeSessions: 0 };
      }
      return worker;
    });
  }

  async registerRemote(registration: RemoteWorkerRegistration): Promise<WorkerRecord> {
    const id = registration.id || `remote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const existing = await this.store.getWorker(id);
    const worker: WorkerRecord = {
      id,
      name: registration.name.slice(0, 80),
      region: registration.region.slice(0, 40),
      kind: "remote",
      status: "online",
      cpu: existing?.cpu ?? 0,
      memory: existing?.memory ?? 0,
      bandwidthMbps: registration.bandwidthMbps ?? existing?.bandwidthMbps ?? 0,
      activeSessions: existing?.activeSessions ?? 0,
      maxSessions: Math.max(1, Math.min(100, registration.maxSessions ?? existing?.maxSessions ?? 5)),
      lastHeartbeat: nowIso(),
      meta: { ...(existing?.meta ?? {}), ...(registration.meta ?? {}), token: undefined },
    };
    await this.store.upsertWorker(worker);
    realtime.emit({ type: "worker.updated", worker });
    return worker;
  }

  async heartbeatRemote(
    id: string,
    stats: { cpu?: number; memory?: number; bandwidthMbps?: number; activeSessions?: number },
  ): Promise<WorkerRecord | null> {
    const worker = await this.store.getWorker(id);
    if (!worker || worker.kind !== "remote") return null;
    const updated: WorkerRecord = {
      ...worker,
      cpu: clamp(stats.cpu ?? worker.cpu, 0, 100),
      memory: clamp(stats.memory ?? worker.memory, 0, 100),
      bandwidthMbps: Math.max(0, stats.bandwidthMbps ?? worker.bandwidthMbps),
      activeSessions: Math.max(0, Math.min(worker.maxSessions, stats.activeSessions ?? worker.activeSessions)),
      status: stats.activeSessions && stats.activeSessions > 0 ? "busy" : "online",
      lastHeartbeat: nowIso(),
    };
    await this.store.upsertWorker(updated);
    realtime.emit({ type: "worker.updated", worker: updated });
    return updated;
  }

  async chooseWorker(): Promise<WorkerRecord> {
    const workers = await this.list();
    const candidates = workers.filter((worker) => worker.status !== "offline" && worker.activeSessions < worker.maxSessions);
    if (candidates.length === 0) {
      return this.localWorker();
    }
    candidates.sort((a, b) => {
      const ratioA = a.activeSessions / Math.max(1, a.maxSessions);
      const ratioB = b.activeSessions / Math.max(1, b.maxSessions);
      if (Math.abs(ratioA - ratioB) > 0.15) return ratioA - ratioB;
      return a.cpu - b.cpu;
    });
    return candidates[0];
  }

  private async reapRemote(): Promise<void> {
    const workers = await this.store.listWorkers();
    for (const worker of workers) {
      if (worker.kind !== "remote") continue;
      if (Date.now() - Date.parse(worker.lastHeartbeat) > 60_000 && worker.status !== "offline") {
        const offline: WorkerRecord = { ...worker, status: "offline", activeSessions: 0 };
        await this.store.upsertWorker(offline);
        realtime.emit({ type: "worker.updated", worker: offline });
      }
    }
  }
}
