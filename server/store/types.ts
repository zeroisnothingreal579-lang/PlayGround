import type {
  AdObservation,
  BatchRecord,
  LinkRecord,
  SessionEvent,
  SessionOptions,
  SessionRecord,
  SessionStatus,
  VerifiedMetric,
  WorkerRecord,
} from "../../shared/types.js";

export interface StoredAiSettings {
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxActions?: number;
  apiKeyEncrypted?: string | null;
}

export interface StoredSettings {
  ai?: StoredAiSettings;
}

export interface SessionFilter {
  linkId?: string;
  batchId?: string;
  status?: SessionStatus[];
  limit?: number;
}

export interface AdFilter {
  sessionId?: string;
  linkId?: string;
  limit?: number;
}

export interface Store {
  kind: "postgres" | "file";
  init(): Promise<void>;
  close(): Promise<void>;

  listLinks(limit?: number): Promise<LinkRecord[]>;
  getLink(id: string): Promise<LinkRecord | null>;
  createLink(link: LinkRecord): Promise<LinkRecord>;
  updateLink(id: string, patch: Partial<LinkRecord>): Promise<LinkRecord | null>;
  deleteLink(id: string): Promise<boolean>;

  listSessions(filter?: SessionFilter): Promise<SessionRecord[]>;
  getSession(id: string): Promise<SessionRecord | null>;
  createSessions(sessions: SessionRecord[]): Promise<void>;
  updateSession(id: string, patch: Partial<SessionRecord>): Promise<SessionRecord | null>;

  listEvents(sessionId: string, limit?: number): Promise<SessionEvent[]>;
  listRecentEvents(limit?: number): Promise<SessionEvent[]>;
  addEvent(event: SessionEvent): Promise<void>;
  addEvents(events: SessionEvent[]): Promise<void>;

  listAds(filter?: AdFilter): Promise<AdObservation[]>;
  addAds(ads: AdObservation[]): Promise<void>;

  listWorkers(): Promise<WorkerRecord[]>;
  getWorker(id: string): Promise<WorkerRecord | null>;
  upsertWorker(worker: WorkerRecord): Promise<void>;

  createBatch(batch: BatchRecord): Promise<void>;
  getBatch(id: string): Promise<BatchRecord | null>;
  listBatches(limit?: number): Promise<BatchRecord[]>;

  listVerified(limit?: number): Promise<VerifiedMetric[]>;
  addVerified(metric: VerifiedMetric): Promise<void>;

  getRawSettings(): Promise<StoredSettings>;
  saveRawSettings(settings: StoredSettings): Promise<StoredSettings>;
}

export interface SessionCreateOptions extends SessionOptions {}
