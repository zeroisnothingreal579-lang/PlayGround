import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AdObservation,
  BatchRecord,
  LinkRecord,
  SessionEvent,
  SessionRecord,
  VerifiedMetric,
  WorkerRecord,
} from "../../shared/types.js";
import type {
  AdFilter,
  SessionFilter,
  Store,
  StoredSettings,
} from "./types.js";

interface DatabaseShape {
  links: LinkRecord[];
  sessions: SessionRecord[];
  events: SessionEvent[];
  ads: AdObservation[];
  workers: WorkerRecord[];
  verified: VerifiedMetric[];
  batches: BatchRecord[];
  settings: StoredSettings;
}

function emptyDatabase(): DatabaseShape {
  return {
    links: [],
    sessions: [],
    events: [],
    ads: [],
    workers: [],
    verified: [],
    batches: [],
    settings: {},
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class FileStore implements Store {
  kind = "file" as const;
  private data: DatabaseShape = emptyDatabase();
  private readonly filePath: string;
  private writeTimer: NodeJS.Timeout | null = null;
  private pending = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 });
    if (!existsSync(this.filePath)) {
      this.flush();
      return;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<DatabaseShape>;
      this.data = { ...emptyDatabase(), ...parsed } as DatabaseShape;
      for (const key of Object.keys(emptyDatabase()) as Array<keyof DatabaseShape>) {
        if (key === "settings") continue;
        if (!Array.isArray(this.data[key])) {
          (this.data as unknown as Record<string, unknown>)[key] = [];
        }
      }
      this.data.settings = parsed.settings ?? {};
    } catch (error) {
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        renameSync(this.filePath, backup);
      } catch {
        /* noop */
      }
      console.error(`[store] Failed to read ${this.filePath}; starting fresh. Backup: ${backup}`, error);
      this.data = emptyDatabase();
    }
  }

  async close(): Promise<void> {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.flush();
  }

  private schedulePersist(): void {
    this.pending = true;
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      if (this.pending) this.flush();
    }, 80);
    this.writeTimer.unref?.();
  }

  private flush(): void {
    this.pending = false;
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
    renameSync(tmp, this.filePath);
  }

  async listLinks(limit = 500): Promise<LinkRecord[]> {
    return clone(
      [...this.data.links]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit),
    );
  }

  async getLink(id: string): Promise<LinkRecord | null> {
    const found = this.data.links.find((link) => link.id === id);
    return found ? clone(found) : null;
  }

  async createLink(link: LinkRecord): Promise<LinkRecord> {
    this.data.links.push(clone(link));
    this.schedulePersist();
    return clone(link);
  }

  async updateLink(id: string, patch: Partial<LinkRecord>): Promise<LinkRecord | null> {
    const index = this.data.links.findIndex((link) => link.id === id);
    if (index === -1) return null;
    const updated = { ...this.data.links[index], ...clone(patch), id };
    this.data.links[index] = updated;
    this.schedulePersist();
    return clone(updated);
  }

  async deleteLink(id: string): Promise<boolean> {
    const before = this.data.links.length;
    this.data.links = this.data.links.filter((link) => link.id !== id);
    if (this.data.links.length === before) return false;
    this.data.sessions = this.data.sessions.filter((session) => session.linkId !== id);
    this.schedulePersist();
    return true;
  }

  async listSessions(filter: SessionFilter = {}): Promise<SessionRecord[]> {
    let sessions = [...this.data.sessions];
    if (filter.linkId) sessions = sessions.filter((session) => session.linkId === filter.linkId);
    if (filter.batchId) sessions = sessions.filter((session) => session.batchId === filter.batchId);
    if (filter.status?.length) sessions = sessions.filter((session) => filter.status!.includes(session.status));
    sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.index - a.index);
    return clone(sessions.slice(0, filter.limit ?? 1000));
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const found = this.data.sessions.find((session) => session.id === id);
    return found ? clone(found) : null;
  }

  async createSessions(sessions: SessionRecord[]): Promise<void> {
    this.data.sessions.push(...clone(sessions));
    this.schedulePersist();
  }

  async updateSession(id: string, patch: Partial<SessionRecord>): Promise<SessionRecord | null> {
    const index = this.data.sessions.findIndex((session) => session.id === id);
    if (index === -1) return null;
    const updated = { ...this.data.sessions[index], ...clone(patch), id };
    this.data.sessions[index] = updated;
    this.schedulePersist();
    return clone(updated);
  }

  async listEvents(sessionId: string, limit = 300): Promise<SessionEvent[]> {
    return clone(
      this.data.events
        .filter((event) => event.sessionId === sessionId)
        .sort((a, b) => b.ts.localeCompare(a.ts))
        .slice(0, limit),
    );
  }

  async listRecentEvents(limit = 200): Promise<SessionEvent[]> {
    return clone([...this.data.events].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit));
  }

  async addEvent(event: SessionEvent): Promise<void> {
    this.data.events.push(clone(event));
    this.trimEvents();
    this.schedulePersist();
  }

  async addEvents(events: SessionEvent[]): Promise<void> {
    this.data.events.push(...clone(events));
    this.trimEvents();
    this.schedulePersist();
  }

  private trimEvents(): void {
    if (this.data.events.length > 24000) {
      this.data.events = this.data.events.slice(-20000);
    }
  }

  async listAds(filter: AdFilter = {}): Promise<AdObservation[]> {
    let ads = [...this.data.ads];
    if (filter.sessionId) ads = ads.filter((ad) => ad.sessionId === filter.sessionId);
    if (filter.linkId) ads = ads.filter((ad) => ad.linkId === filter.linkId);
    ads.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
    return clone(ads.slice(0, filter.limit ?? 500));
  }

  async addAds(ads: AdObservation[]): Promise<void> {
    this.data.ads.push(...clone(ads));
    this.schedulePersist();
  }

  async listWorkers(): Promise<WorkerRecord[]> {
    return clone([...this.data.workers].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async getWorker(id: string): Promise<WorkerRecord | null> {
    const found = this.data.workers.find((worker) => worker.id === id);
    return found ? clone(found) : null;
  }

  async upsertWorker(worker: WorkerRecord): Promise<void> {
    const index = this.data.workers.findIndex((item) => item.id === worker.id);
    if (index === -1) this.data.workers.push(clone(worker));
    else this.data.workers[index] = clone(worker);
    this.schedulePersist();
  }

  async createBatch(batch: BatchRecord): Promise<void> {
    this.data.batches.push(clone(batch));
    this.schedulePersist();
  }

  async getBatch(id: string): Promise<BatchRecord | null> {
    const found = this.data.batches.find((batch) => batch.id === id);
    return found ? clone(found) : null;
  }

  async listBatches(limit = 100): Promise<BatchRecord[]> {
    return clone(
      [...this.data.batches].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit),
    );
  }

  async listVerified(limit = 500): Promise<VerifiedMetric[]> {
    return clone(
      [...this.data.verified].sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, limit),
    );
  }

  async addVerified(metric: VerifiedMetric): Promise<void> {
    this.data.verified.push(clone(metric));
    this.schedulePersist();
  }

  async getRawSettings(): Promise<StoredSettings> {
    return clone(this.data.settings);
  }

  async saveRawSettings(settings: StoredSettings): Promise<StoredSettings> {
    this.data.settings = clone(settings);
    this.schedulePersist();
    return clone(this.data.settings);
  }
}
