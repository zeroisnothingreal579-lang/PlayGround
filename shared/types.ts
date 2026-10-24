export type LinkStatus = "pending" | "inspecting" | "ready" | "error";
export type RiskLevel = "low" | "medium" | "high";

export interface RedirectHop {
  index: number;
  url: string;
  status: number;
  location?: string;
  durationMs: number;
}

export interface LinkInspection {
  finalUrl: string | null;
  finalDomain: string | null;
  httpStatus: number | null;
  title: string | null;
  description: string | null;
  contentType: string | null;
  chain: RedirectHop[];
  durationMs: number;
  risk: RiskLevel;
  flags: string[];
  adNetworks: string[];
  captcha: boolean;
  loop: boolean;
  blocked: boolean;
  suspicious: boolean;
  pageBytes: number;
  error?: string;
  payoutNotes: string[];
}

export interface LinkRecord {
  id: string;
  originalUrl: string;
  normalizedUrl: string;
  status: LinkStatus;
  source: string;
  createdAt: string;
  updatedAt: string;
  inspection: LinkInspection | null;
}

export type SessionStatus =
  | "queued"
  | "starting"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "stopped";

export type AgentState = "idle" | "inspecting" | "acting" | "waiting" | "done";

export interface SessionOptions {
  viewport?: { width: number; height: number };
  proxy?: string | null;
  locale?: string;
  timezone?: string;
  maxActions?: number;
  aiEnabled?: boolean;
}

export interface SessionRecord {
  id: string;
  batchId: string;
  linkId: string;
  index: number;
  label: string;
  status: SessionStatus;
  agentState: AgentState;
  targetUrl: string;
  currentUrl: string | null;
  finalUrl: string | null;
  title: string | null;
  progress: number;
  workerId: string;
  workerName: string;
  elapsedMs: number;
  actionsCount: number;
  adsDetected: number;
  summary: string | null;
  error: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  options: SessionOptions;
  previewDataUrl?: string | null;
}

export type SessionEventType =
  | "system"
  | "navigation"
  | "inspection"
  | "action"
  | "ad"
  | "ai"
  | "warning"
  | "error"
  | "summary";

export type EventLevel = "info" | "success" | "warn" | "error";

export interface SessionEvent {
  id: string;
  sessionId: string;
  ts: string;
  type: SessionEventType;
  level: EventLevel;
  message: string;
  data?: Record<string, unknown> | null;
}

export interface AdObservation {
  id: string;
  sessionId: string;
  linkId: string;
  format: string;
  network: string | null;
  selector: string;
  visibleMs: number;
  detectedAt: string;
  method: "heuristic" | "ai";
  verified: false;
  size: string | null;
  pageUrl: string | null;
}

export type WorkerKind = "local" | "remote";
export type WorkerStatus = "online" | "busy" | "offline";

export interface WorkerRecord {
  id: string;
  name: string;
  region: string;
  kind: WorkerKind;
  status: WorkerStatus;
  cpu: number;
  memory: number;
  bandwidthMbps: number;
  activeSessions: number;
  maxSessions: number;
  lastHeartbeat: string;
  meta: Record<string, unknown>;
}

export interface BatchRecord {
  id: string;
  linkId: string;
  requested: number;
  options: SessionOptions;
  createdAt: string;
}

export interface VerifiedMetric {
  id: string;
  source: string;
  metric: "visits" | "clicks" | "impressions" | "earnings" | "other";
  value: number;
  periodStart: string;
  periodEnd: string;
  importedAt: string;
  note: string | null;
  raw: Record<string, unknown> | null;
}

export interface AiSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxActions: number;
  hasApiKey: boolean;
  keySource: "env" | "stored" | "none";
}

export interface AppSettings {
  ai: AiSettings;
  safety: {
    blockPrivateTargets: boolean;
    maxSessionsPerBatch: number;
    maxActiveSessions: number;
    allowAdClicks: false;
    allowArtificialTraffic: false;
  };
  integrations: {
    analyticsConfigured: boolean;
    verifiedImportEnabled: boolean;
    database: "postgres" | "file";
  };
  deployment: {
    demoMode: boolean;
    authRequired: boolean;
    region: string;
    version: string;
    chromiumAvailable: boolean;
  };
}

export interface Overview {
  links: { total: number; ready: number; error: number; inspecting: number };
  sessions: {
    total: number;
    active: number;
    queued: number;
    completed: number;
    failed: number;
    stopped: number;
  };
  ads: { detected: number; verifiedImpressions: number };
  workers: { online: number; total: number };
  redirects: { successRate: number; blocked: number; loops: number };
  destinations: number;
  lastUpdated: string;
}

export interface AnalyticsPoint {
  date: string;
  sessions: number;
  completed: number;
  failed: number;
  ads: number;
}

export interface AnalyticsDestination {
  domain: string;
  sessions: number;
  completed: number;
}

export interface AnalyticsSummary {
  series: AnalyticsPoint[];
  destinations: AnalyticsDestination[];
  sessionCount: number;
  completed: number;
  failed: number;
  successRate: number;
  adsDetected: number;
  verified: VerifiedMetric[];
  verifiedTotals: Record<string, number>;
  rangeDays: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

export interface ApiErrorShape {
  error: string;
  code?: string;
  details?: unknown;
}

export interface PolicyDocument {
  version: string;
  updatedAt: string;
  allowed: string[];
  blocked: string[];
  statements: string[];
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  mode: "password" | "demo";
}

export interface SessionWithMeta extends SessionRecord {
  link?: LinkRecord | null;
}

export interface CreateBatchResponse {
  batch: BatchRecord;
  sessions: SessionRecord[];
}

export interface InspectResponse {
  link: LinkRecord;
}

export const SESSION_COUNTS = [1, 5, 10, 20, 50, 100] as const;
export type SessionCount = (typeof SESSION_COUNTS)[number];
