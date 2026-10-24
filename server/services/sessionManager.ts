import type {
  AdObservation,
  BatchRecord,
  CreateBatchResponse,
  LinkRecord,
  SessionEvent,
  SessionOptions,
  SessionRecord,
  SessionStatus,
} from "../../shared/types.js";
import { config } from "../config.js";
import { HttpError, clamp, newId, nowIso, sleep } from "../lib/util.js";
import { realtime } from "../realtime.js";
import type { Store } from "../store/types.js";
import { closeBrowser, runBrowserSession, type AdDraftWithTime, type RunnerHooks } from "./browserRunner.js";
import { resolveAiConfig } from "./settings.js";
import { WorkerRegistry } from "./workers.js";

interface RuntimeHandle {
  sessionId: string;
  paused: boolean;
  stopped: boolean;
  startedAt: number;
  stop: (() => void) | null;
}

interface RemoteControl {
  paused: boolean;
  stopped: boolean;
  claimed: boolean;
  startedAt: string | null;
}

const ACTIVE_STATUSES: SessionStatus[] = ["starting", "running", "paused"];

export class SessionManager {
  private localRuntime = new Map<string, RuntimeHandle>();
  private remoteControls = new Map<string, RemoteControl>();
  private previews = new Map<string, string>();
  private ticking: NodeJS.Timeout | null = null;
  private draining = false;
  readonly workers: WorkerRegistry;

  constructor(private readonly store: Store) {
    this.workers = new WorkerRegistry(store);
  }

  async init(): Promise<void> {
    await this.workers.init();
    await this.markOrphanedSessions();
    this.ticking = setInterval(() => {
      void this.tick();
    }, 5000);
    this.ticking.unref?.();
  }

  async close(wss?: { close: () => void }): Promise<void> {
    if (this.ticking) clearInterval(this.ticking);
    this.workers.stop();
    for (const runtime of this.localRuntime.values()) {
      runtime.stopped = true;
      runtime.stop?.();
    }
    await Promise.allSettled(
      Array.from(this.localRuntime.keys()).map((id) =>
        this.store.updateSession(id, { status: "stopped", endedAt: nowIso(), agentState: "done" }),
      ),
    );
    await this.shutdownBrowser();
    void wss;
  }

  private async markOrphanedSessions(): Promise<void> {
    const sessions = await this.store.listSessions({ status: ["starting", "running", "paused"], limit: 1000 });
    for (const session of sessions) {
      if (session.workerId !== config.worker.id) {
        const worker = await this.store.getWorker(session.workerId);
        if (!worker || Date.now() - Date.parse(worker.lastHeartbeat) > 60_000) {
          await this.store.updateSession(session.id, {
            status: "failed",
            error: "Worker heartbeat lost. Session was recovered as failed.",
            endedAt: nowIso(),
          });
          await this.appendEvent(session.id, "error", "error", "Worker heartbeat lost during a previous run; session recovered as failed.");
        }
        continue;
      }
      await this.store.updateSession(session.id, {
        status: "queued",
        agentState: "idle",
        progress: 0,
        currentUrl: null,
        startedAt: null,
        error: "Recovered after process restart. Start again to rerun.",
      });
    }
  }

  decorate(session: SessionRecord): SessionRecord {
    return { ...session, previewDataUrl: this.previews.get(session.id) ?? null };
  }

  getPreview(sessionId: string): string | null {
    return this.previews.get(sessionId) ?? null;
  }

  private async appendEvent(
    sessionId: string,
    type: SessionEvent["type"],
    level: SessionEvent["level"],
    message: string,
    data?: Record<string, unknown> | null,
  ): Promise<SessionEvent> {
    const event: SessionEvent = {
      id: newId("evt"),
      sessionId,
      ts: nowIso(),
      type,
      level,
      message,
      data: data ?? null,
    };
    await this.store.addEvent(event);
    realtime.emit({ type: "session.event", event });
    return event;
  }

  private async broadcastSession(session: SessionRecord | null): Promise<void> {
    if (!session) return;
    realtime.emit({ type: "session.updated", session: this.decorate(session) });
    realtime.emit({ type: "overview.updated", at: nowIso() });
  }

  private validateOptions(options: SessionOptions): SessionOptions {
    const next: SessionOptions = {};
    if (options.viewport) {
      next.viewport = {
        width: Math.round(clamp(Number(options.viewport.width) || 1280, 360, 1920)),
        height: Math.round(clamp(Number(options.viewport.height) || 800, 480, 1080)),
      };
    }
    if (options.proxy) {
      let url: URL;
      try {
        url = new URL(options.proxy);
      } catch {
        throw new HttpError(400, "Proxy must be a valid URL", "invalid_proxy");
      }
      if (!["http:", "https:", "socks4:", "socks5:"].includes(url.protocol)) {
        throw new HttpError(400, "Proxy protocol must be http, https, socks4, or socks5", "invalid_proxy");
      }
      next.proxy = options.proxy;
    }
    if (options.locale) next.locale = String(options.locale).slice(0, 20);
    if (options.timezone) next.timezone = String(options.timezone).slice(0, 60);
    if (options.maxActions !== undefined) next.maxActions = Math.round(clamp(Number(options.maxActions) || 8, 1, 20));
    if (options.aiEnabled !== undefined) next.aiEnabled = Boolean(options.aiEnabled);
    return next;
  }

  private async assignWorkers(count: number): Promise<Array<{ id: string; name: string; kind: string }>> {
    const workers = (await this.workers.list()).filter((worker) => worker.status !== "offline");
    if (workers.length === 0) {
      const local = this.workers.localWorker();
      return Array.from({ length: count }, () => ({ id: local.id, name: local.name, kind: local.kind }));
    }
    const projected = new Map(workers.map((worker) => [worker.id, worker.activeSessions]));
    const assignments: Array<{ id: string; name: string; kind: string }> = [];
    for (let index = 0; index < count; index += 1) {
      const candidates = workers
        .filter((worker) => (projected.get(worker.id) ?? 0) < worker.maxSessions)
        .sort((a, b) => (projected.get(a.id)! / a.maxSessions) - (projected.get(b.id)! / b.maxSessions));
      const choice = candidates[0] ?? workers[index % workers.length];
      projected.set(choice.id, (projected.get(choice.id) ?? 0) + 1);
      assignments.push({ id: choice.id, name: choice.name, kind: choice.kind });
    }
    return assignments;
  }

  async createBatch(linkId: string, count: number, rawOptions: SessionOptions = {}): Promise<CreateBatchResponse> {
    if (!Number.isInteger(count) || count < 1 || count > config.maxSessionsPerBatch) {
      throw new HttpError(400, `Session count must be between 1 and ${config.maxSessionsPerBatch}`, "invalid_session_count");
    }
    const link = await this.store.getLink(linkId);
    if (!link) throw new HttpError(404, "Link not found", "link_not_found");
    if (link.status !== "ready") {
      throw new HttpError(409, "Link must complete inspection before launching sessions", "link_not_ready");
    }
    const options = this.validateOptions(rawOptions);
    const batchId = newId("bat");
    const createdAt = nowIso();
    const assignments = await this.assignWorkers(count);
    const sessions: SessionRecord[] = assignments.map((worker, index) => ({
      id: newId("ses"),
      batchId,
      linkId,
      index: index + 1,
      label: `W${String(index + 1).padStart(2, "0")}`,
      status: "queued",
      agentState: "idle",
      targetUrl: link.originalUrl,
      currentUrl: null,
      finalUrl: null,
      title: null,
      progress: 0,
      workerId: worker.id,
      workerName: worker.name,
      elapsedMs: 0,
      actionsCount: 0,
      adsDetected: 0,
      summary: null,
      error: null,
      startedAt: null,
      endedAt: null,
      createdAt,
      updatedAt: createdAt,
      options,
    }));
    const batch: BatchRecord = { id: batchId, linkId, requested: count, options, createdAt };
    await this.store.createBatch(batch);
    await this.store.createSessions(sessions);
    for (const session of sessions) realtime.emit({ type: "session.updated", session });
    realtime.emit({ type: "overview.updated", at: nowIso() });
    return { batch, sessions };
  }

  private activeCount(): number {
    return this.localRuntime.size + this.remoteControls.size;
  }

  private async activeFromStore(): Promise<number> {
    const sessions = await this.store.listSessions({ status: ACTIVE_STATUSES, limit: 1000 });
    return sessions.length;
  }

  async startSession(sessionId: string): Promise<SessionRecord> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new HttpError(404, "Session not found", "session_not_found");
    if (ACTIVE_STATUSES.includes(session.status)) return this.decorate(session);
    if (this.localRuntime.has(sessionId) || this.remoteControls.has(sessionId)) return this.decorate(session);

    const link = await this.store.getLink(session.linkId);
    if (!link) throw new HttpError(404, "Link for this session no longer exists", "link_not_found");
    if (link.status !== "ready") throw new HttpError(409, "Link inspection is not complete", "link_not_ready");
    this.previews.delete(sessionId);

    const active = await this.activeFromStore();
    if (active >= config.maxActiveSessions) {
      await this.store.updateSession(sessionId, { status: "queued", error: null });
      await this.appendEvent(
        sessionId,
        "system",
        "warn",
        `Queued: active session quota (${config.maxActiveSessions}) reached. The session will start automatically when a slot frees up.`,
      );
      this.scheduleDrain();
      return this.decorate((await this.store.getSession(sessionId))!);
    }

    const worker = await this.workerForSession(session);
    if (worker.kind === "remote" && config.allowDockerWorkers) {
      const updated = await this.store.updateSession(sessionId, {
        status: "starting",
        agentState: "idle",
        workerId: worker.id,
        workerName: worker.name,
        startedAt: nowIso(),
        endedAt: null,
        error: null,
        elapsedMs: 0,
        progress: 1,
      });
      this.remoteControls.set(sessionId, { paused: false, stopped: false, startedAt: nowIso() });
      await this.appendEvent(sessionId, "system", "info", `Dispatched to remote worker ${worker.name} (${worker.region}). Awaiting claim.`);
      await this.broadcastSession(updated);
      return this.decorate(updated!);
    }

    if (this.localRuntime.size >= config.maxConcurrentSessions) {
      await this.store.updateSession(sessionId, { status: "queued", error: null });
      this.scheduleDrain();
      return this.decorate((await this.store.getSession(sessionId))!);
    }

    const runtime: RuntimeHandle = {
      sessionId,
      paused: false,
      stopped: false,
      startedAt: Date.now(),
      stop: null,
    };
    this.localRuntime.set(sessionId, runtime);
    this.workers.setLocalActive(this.localRuntime.size);
    void this.runLocal(sessionId, link, runtime, worker.name);
    const queued = await this.store.getSession(sessionId);
    return this.decorate(queued!);
  }

  private async workerForSession(session: SessionRecord): Promise<{ id: string; name: string; kind: string; region: string }> {
    const existing = await this.store.getWorker(session.workerId);
    if (existing && existing.status !== "offline") {
      return { id: existing.id, name: existing.name, kind: existing.kind, region: existing.region };
    }
    const chosen = await this.workers.chooseWorker();
    return { id: chosen.id, name: chosen.name, kind: chosen.kind, region: chosen.region };
  }

  private async runLocal(
    sessionId: string,
    link: LinkRecord,
    runtime: RuntimeHandle,
    workerName: string,
  ): Promise<void> {
    const session = await this.store.getSession(sessionId);
    if (!session) {
      this.localRuntime.delete(sessionId);
      return;
    }
    const startedAt = nowIso();
    const startedMs = Date.now();
    await this.store.updateSession(sessionId, {
      status: "starting",
      agentState: "inspecting",
      startedAt,
      endedAt: null,
      error: null,
      progress: 2,
      currentUrl: link.originalUrl,
      workerName,
      elapsedMs: 0,
      actionsCount: 0,
      adsDetected: 0,
      summary: null,
    });
    await this.broadcastSession(await this.store.getSession(sessionId));
    await this.appendEvent(sessionId, "system", "info", `Session started on ${workerName}`, {
      target: link.originalUrl,
      isolatedContext: true,
      policyVersion: "2026-10-1",
    });

    const ai = await resolveAiConfig(this.store);
    const hooks: RunnerHooks = {
      onUpdate: async (patch) => {
        if (runtime.stopped && patch.status !== "stopped") return;
        const nextPatch: Record<string, unknown> = { ...patch };
        if (runtime.paused && patch.status === "running") nextPatch.status = "paused";
        const updated = await this.store.updateSession(sessionId, nextPatch as Partial<SessionRecord>);
        await this.broadcastSession(updated);
      },
      onEvent: async (event) => {
        await this.appendEvent(sessionId, event.type, event.level, event.message, event.data);
      },
      onAd: async (ad: AdDraftWithTime) => {
        const observation: AdObservation = {
          id: newId("ad"),
          sessionId,
          linkId: link.id,
          format: ad.format,
          network: ad.network,
          selector: ad.selector,
          visibleMs: Math.round(ad.visibleMs),
          detectedAt: ad.detectedAt,
          method: ad.method,
          verified: false,
          size: ad.size,
          pageUrl: ad.pageUrl,
        };
        await this.store.addAds([observation]);
        realtime.emit({ type: "ads.updated", ad: observation });
      },
      onPreview: (dataUrl) => {
        this.previews.set(sessionId, dataUrl);
        realtime.emit({ type: "session.preview", sessionId, dataUrl, at: nowIso() });
      },
      registerStop: (stop) => {
        runtime.stop = stop;
      },
      isPaused: () => runtime.paused,
      isStopped: () => runtime.stopped,
    };

    try {
      const result = await runBrowserSession({
        sessionId,
        targetUrl: link.originalUrl,
        options: session.options,
        ai,
        hooks,
        region: config.worker.region,
      });
      if (runtime.stopped || result.stopped) {
        await this.store.updateSession(sessionId, {
          status: "stopped",
          agentState: "done",
          elapsedMs: Date.now() - startedMs,
          endedAt: nowIso(),
          progress: clamp(session.progress, 0, 99),
        });
        await this.appendEvent(sessionId, "system", "warn", "Session stopped by operator");
      } else {
        await this.store.updateSession(sessionId, {
          status: "completed",
          agentState: "done",
          elapsedMs: result.elapsedMs,
          endedAt: nowIso(),
          progress: 100,
        });
      }
      realtime.emit({ type: "analytics.updated", at: nowIso() });
    } catch (error) {
      if (!runtime.stopped) {
        const message = error instanceof Error ? error.message : String(error);
        const latest = await this.store.getSession(sessionId);
        if (latest?.status !== "completed") {
          await this.store.updateSession(sessionId, {
            status: "failed",
            agentState: "done",
            error: message.slice(0, 1000),
            elapsedMs: Date.now() - startedMs,
            endedAt: nowIso(),
          });
          await this.appendEvent(sessionId, "error", "error", `Session failed: ${message.slice(0, 500)}`);
          realtime.emit({ type: "analytics.updated", at: nowIso() });
        }
      }
    } finally {
      this.localRuntime.delete(sessionId);
      this.workers.setLocalActive(this.localRuntime.size);
      await this.workers.refreshLocal(true).catch(() => undefined);
      await this.broadcastSession(await this.store.getSession(sessionId));
      this.scheduleDrain();
    }
  }

  private scheduleDrain(): void {
    if (this.draining) return;
    this.draining = true;
    setTimeout(() => {
      void this.drainQueue().finally(() => {
        this.draining = false;
      });
    }, 250).unref?.();
  }

  private async drainQueue(): Promise<void> {
    const active = await this.activeFromStore();
    let slots = Math.min(config.maxConcurrentSessions - this.localRuntime.size, config.maxActiveSessions - active);
    if (slots <= 0) return;
    const queued = await this.store.listSessions({ status: ["queued"], limit: 500 });
    for (const session of queued.reverse()) {
      if (slots <= 0) break;
      if (this.localRuntime.has(session.id)) continue;
      const worker = await this.workerForSession(session);
      if (worker.kind === "remote" && config.allowDockerWorkers) continue;
      slots -= 1;
      await this.startSession(session.id).catch((error) => {
        void this.appendEvent(session.id, "error", "error", `Could not start queued session: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  }

  async startMany(sessionIds?: string[]): Promise<{ started: number }> {
    let sessions: SessionRecord[];
    if (sessionIds?.length) {
      sessions = (await Promise.all(sessionIds.map((id) => this.store.getSession(id)))).filter(Boolean) as SessionRecord[];
    } else {
      sessions = await this.store.listSessions({ status: ["queued", "failed", "stopped"], limit: 500 });
    }
    let started = 0;
    for (const session of sessions) {
      await this.startSession(session.id).catch(() => undefined);
      started += 1;
    }
    return { started };
  }

  async pauseSession(sessionId: string): Promise<SessionRecord> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new HttpError(404, "Session not found", "session_not_found");
    if (session.workerId !== config.worker.id && !this.localRuntime.has(sessionId)) {
      const control = this.remoteControls.get(sessionId);
      if (control) control.paused = true;
    }
    const runtime = this.localRuntime.get(sessionId);
    if (runtime) runtime.paused = true;
    const updated = await this.store.updateSession(sessionId, { status: "paused", agentState: "waiting", error: null });
    await this.appendEvent(sessionId, "system", "info", "Session paused by operator");
    await this.broadcastSession(updated);
    return this.decorate(updated!);
  }

  async resumeSession(sessionId: string): Promise<SessionRecord> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new HttpError(404, "Session not found", "session_not_found");
    const runtime = this.localRuntime.get(sessionId);
    if (runtime) runtime.paused = false;
    const control = this.remoteControls.get(sessionId);
    if (control) control.paused = false;
    if (session.status === "queued" || session.status === "stopped" || session.status === "failed") {
      return this.startSession(sessionId);
    }
    const updated = await this.store.updateSession(sessionId, { status: "running", agentState: "inspecting" });
    await this.appendEvent(sessionId, "system", "info", "Session resumed by operator");
    await this.broadcastSession(updated);
    return this.decorate(updated!);
  }

  async stopSession(sessionId: string): Promise<SessionRecord> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new HttpError(404, "Session not found", "session_not_found");
    const runtime = this.localRuntime.get(sessionId);
    const control = this.remoteControls.get(sessionId);
    if (control) control.stopped = true;
    if (runtime) {
      runtime.stopped = true;
      runtime.stop?.();
    }
    if (!runtime && ACTIVE_STATUSES.includes(session.status) && session.workerId !== config.worker.id) {
      this.remoteControls.set(sessionId, { paused: false, stopped: true, startedAt: session.startedAt });
    }
    const elapsed = session.startedAt ? Date.now() - Date.parse(session.startedAt) : session.elapsedMs;
    const updated = await this.store.updateSession(sessionId, {
      status: "stopped",
      agentState: "done",
      endedAt: nowIso(),
      elapsedMs: Math.max(0, elapsed),
    });
    await this.appendEvent(sessionId, "system", "warn", "Stop requested by operator");
    await this.broadcastSession(updated);
    return this.decorate(updated!);
  }

  async pauseMany(ids?: string[]): Promise<{ affected: number }> {
    const sessions = await this.resolveSessions(ids, ["running"]);
    let affected = 0;
    for (const session of sessions) {
      await this.pauseSession(session.id).catch(() => undefined);
      affected += 1;
    }
    return { affected };
  }

  async resumeMany(ids?: string[]): Promise<{ affected: number }> {
    const sessions = await this.resolveSessions(ids, ["paused"]);
    let affected = 0;
    for (const session of sessions) {
      await this.resumeSession(session.id).catch(() => undefined);
      affected += 1;
    }
    return { affected };
  }

  async stopMany(ids?: string[]): Promise<{ affected: number }> {
    const sessions = await this.resolveSessions(ids, ["starting", "running", "paused", "queued"]);
    let affected = 0;
    for (const session of sessions) {
      await this.stopSession(session.id).catch(() => undefined);
      affected += 1;
    }
    return { affected };
  }

  private async resolveSessions(ids: string[] | undefined, statuses: SessionStatus[]): Promise<SessionRecord[]> {
    if (ids?.length) {
      const sessions = await Promise.all(ids.map((id) => this.store.getSession(id)));
      return sessions.filter((session): session is SessionRecord => Boolean(session));
    }
    return this.store.listSessions({ status: statuses, limit: 500 });
  }

  async claimRemoteJobs(workerId: string, limit = 3): Promise<Array<{ session: SessionRecord; link: LinkRecord }>> {
    const worker = await this.store.getWorker(workerId);
    if (!worker || worker.kind !== "remote") throw new HttpError(403, "Worker is not registered as a remote worker", "invalid_worker");
    const queued = (await this.store.listSessions({ limit: 500 })).filter(
      (session) => session.workerId === workerId && (session.status === "queued" || (session.status === "starting" && this.remoteControls.get(session.id)?.startedAt && Date.now() - Date.parse(this.remoteControls.get(session.id)!.startedAt!) > 45_000)),
    );
    const jobs: Array<{ session: SessionRecord; link: LinkRecord }> = [];
    for (const session of queued.slice(0, Math.max(1, Math.min(10, limit)))) {
      const link = await this.store.getLink(session.linkId);
      if (!link) continue;
      const existing = this.remoteControls.get(session.id);
      if (existing?.stopped) continue;
      this.remoteControls.set(session.id, { paused: existing?.paused ?? false, stopped: false, startedAt: nowIso() });
      const updated = await this.store.updateSession(session.id, {
        status: "starting",
        agentState: "idle",
        startedAt: session.startedAt ?? nowIso(),
        endedAt: null,
        error: null,
        progress: 1,
      });
      await this.appendEvent(session.id, "system", "info", `Remote worker ${workerId} claimed the session`);
      await this.broadcastSession(updated);
      jobs.push({ session: this.decorate(updated!), link });
    }
    return jobs;
  }

  getRemoteControls(sessionId: string): { paused: boolean; stopped: boolean } {
    const control = this.remoteControls.get(sessionId);
    return { paused: control?.paused ?? false, stopped: control?.stopped ?? false };
  }

  async applyRemoteUpdate(
    workerId: string,
    sessionId: string,
    patch: Partial<SessionRecord>,
  ): Promise<SessionRecord> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new HttpError(404, "Session not found", "session_not_found");
    if (session.workerId !== workerId) throw new HttpError(403, "Session is assigned to another worker", "wrong_worker");
    const allowed: Array<keyof SessionRecord> = [
      "status",
      "agentState",
      "currentUrl",
      "finalUrl",
      "title",
      "progress",
      "elapsedMs",
      "actionsCount",
      "adsDetected",
      "summary",
      "error",
      "endedAt",
      "startedAt",
    ];
    const safePatch: Partial<SessionRecord> = {};
    for (const key of allowed) {
      if (patch[key] !== undefined) (safePatch as Record<string, unknown>)[key] = patch[key];
    }
    safePatch.updatedAt = nowIso();
    const updated = await this.store.updateSession(sessionId, safePatch);
    if (updated && ["completed", "failed", "stopped"].includes(updated.status)) {
      this.remoteControls.delete(sessionId);
      realtime.emit({ type: "analytics.updated", at: nowIso() });
    }
    await this.broadcastSession(updated);
    return this.decorate(updated!);
  }

  async addRemoteEvent(
    workerId: string,
    sessionId: string,
    event: { type: SessionEvent["type"]; level: SessionEvent["level"]; message: string; data?: Record<string, unknown> | null },
  ): Promise<void> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new HttpError(404, "Session not found", "session_not_found");
    if (session.workerId !== workerId) throw new HttpError(403, "Session is assigned to another worker", "wrong_worker");
    await this.appendEvent(sessionId, event.type, event.level, String(event.message).slice(0, 2000), event.data ?? null);
  }

  async addRemoteAd(workerId: string, sessionId: string, ad: Partial<AdObservation>): Promise<AdObservation> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new HttpError(404, "Session not found", "session_not_found");
    if (session.workerId !== workerId) throw new HttpError(403, "Session is assigned to another worker", "wrong_worker");
    const observation: AdObservation = {
      id: newId("ad"),
      sessionId,
      linkId: session.linkId,
      format: String(ad.format ?? "display").slice(0, 40),
      network: ad.network ? String(ad.network).slice(0, 60) : null,
      selector: String(ad.selector ?? "unknown").slice(0, 300),
      visibleMs: Math.max(0, Math.round(Number(ad.visibleMs) || 0)),
      detectedAt: ad.detectedAt && !Number.isNaN(Date.parse(ad.detectedAt)) ? new Date(ad.detectedAt).toISOString() : nowIso(),
      method: ad.method === "ai" ? "ai" : "heuristic",
      verified: false,
      size: ad.size ? String(ad.size).slice(0, 30) : null,
      pageUrl: ad.pageUrl ? String(ad.pageUrl).slice(0, 2000) : session.currentUrl,
    };
    await this.store.addAds([observation]);
    realtime.emit({ type: "ads.updated", ad: observation });
    realtime.emit({ type: "analytics.updated", at: nowIso() });
    return observation;
  }

  setRemotePreview(workerId: string, sessionId: string, dataUrl: string): void {
    const session = this.store.getSession(sessionId);
    void session.then((found) => {
      if (!found || found.workerId !== workerId) return;
      if (!dataUrl.startsWith("data:image/") || dataUrl.length > 2_000_000) return;
      this.previews.set(sessionId, dataUrl);
      realtime.emit({ type: "session.preview", sessionId, dataUrl, at: nowIso() });
    });
  }

  private async tick(): Promise<void> {
    const now = nowIso();
    for (const [sessionId, runtime] of this.localRuntime) {
      if (runtime.stopped) continue;
      const session = await this.store.getSession(sessionId);
      if (!session || !session.startedAt) continue;
      const elapsed = Date.now() - Date.parse(session.startedAt);
      if (elapsed - session.elapsedMs > 3000) {
        const updated = await this.store.updateSession(sessionId, { elapsedMs: elapsed });
        if (updated) realtime.emit({ type: "session.updated", session: this.decorate(updated) });
      }
    }
    const remoteActive = await this.store.listSessions({ status: ACTIVE_STATUSES, limit: 500 });
    for (const session of remoteActive) {
      if (this.localRuntime.has(session.id) || session.workerId === config.worker.id) continue;
      const worker = await this.store.getWorker(session.workerId);
      if (worker && Date.now() - Date.parse(worker.lastHeartbeat) <= 90_000) continue;
      const failed = await this.store.updateSession(session.id, {
        status: "failed",
        agentState: "done",
        error: "Remote worker heartbeat lost. Session stopped reporting and was marked failed.",
        endedAt: nowIso(),
      });
      this.remoteControls.delete(session.id);
      await this.appendEvent(session.id, "error", "error", "Remote worker heartbeat was lost; session marked failed.");
      if (failed) await this.broadcastSession(failed);
    }

    await this.workers.refreshLocal(true).catch(() => undefined);
    realtime.emit({ type: "overview.updated", at: now });
  }

  async shutdownBrowser(): Promise<void> {
    await closeBrowser();
  }
}
