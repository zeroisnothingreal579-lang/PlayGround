export type PageStatus = 'ok' | 'captcha' | 'blocked' | 'error' | 'timeout' | 'loop' | 'invalid'
export type SessionStatus = 'queued' | 'launching' | 'loading' | 'active' | 'paused' | 'completed' | 'stopped' | 'error'
export type JobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'stopped' | 'failed'
export type RiskLevel = 'low' | 'medium' | 'high'

export interface RedirectHop {
  url: string
  statusCode: number
  statusText?: string
  location?: string
  contentType?: string
  note?: string
}

export interface AdSignals {
  detected: boolean
  verified: boolean
  note: string
  networks: string[]
  formats: string[]
  elementCount?: number
  iframeCount?: number
}

export interface Controls {
  countdown?: boolean
  skip?: boolean
  continue?: boolean
  reward?: boolean
}

export interface AiAnalysis {
  summary: string
  pageType: string
  adsDetected: boolean
  networks: string[]
  controls: Controls
  captcha: boolean
  blocked: boolean
  confidence: number
  source: 'heuristic' | 'language-model'
  error?: string
}

export interface Inspection {
  id: string
  originalUrl: string
  finalUrl: string
  finalDomain: string
  pageStatus: PageStatus
  statusCode: number
  redirects: RedirectHop[]
  redirectCount: number
  durationMs: number
  risk: { level: RiskLevel; score: number; reasons: string[]; trackingParameters?: string[] }
  ads: AdSignals
  controls: Controls
  title?: string
  description?: string
  contentPreview?: string
  contentType?: string
  shortenerDetected?: boolean
  error?: string | null
  inspectedAt: string
  createdAt?: string
  ai?: AiAnalysis
}

export interface SessionLog {
  id: string
  at: string
  type: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

export interface BrowserSession {
  id: string
  jobId: string
  index: number
  originalUrl: string
  currentUrl: string
  finalUrl: string
  finalDomain: string
  title: string
  status: SessionStatus
  pageStatus: string
  progress: number
  ads: AdSignals
  controls: Controls
  ai: AiAnalysis | null
  inspection?: Inspection | null
  error: string | null
  workerId: string | null
  region: string | null
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  updatedAt: string
  statusCode?: number
  logs?: SessionLog[]
  logCount?: number
  previewAt?: string | null
  previewAvailable?: boolean
}

export interface Job {
  id: string
  url: string
  count: number
  requestedEngine: string
  engine: 'playwright' | 'http-analysis'
  status: JobStatus
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  summary: string
  sessionCount?: number
  runningCount?: number
  completedCount?: number
}

export interface AdEvent {
  id: string
  sessionId: string
  jobId: string
  url: string
  domain: string
  network: string
  networks: string[]
  format: string
  visibleMs: number
  detectedAt: string
  verified: boolean
  note: string
}

export interface VerifiedEvent {
  id: string
  type: 'click' | 'impression' | 'earning' | 'visit'
  value: number
  currency?: string
  at: string
  source: string
  verified: boolean
}

export interface AnalyticsSeriesPoint {
  date: string
  label: string
  sessions: number
  inspections: number
  ads: number
}

export interface Analytics {
  range: string
  generatedAt: string
  totals: {
    sessions: number
    completed: number
    running: number
    errors: number
    successRate: number
    inspections: number
    redirectSuccessRate: number
    redirectCount: number
    adSessions: number
    adDetections: number
    verifiedClicks: number
    verifiedImpressions: number
    verifiedEarnings: number
    verifiedEventCount: number
  }
  series: AnalyticsSeriesPoint[]
  domains: { domain: string; count: number }[]
  pageStatuses: Record<string, number>
  recentSessions: BrowserSession[]
  recentInspections: Inspection[]
  integrity: {
    verifiedSource: string
    adEventMeaning: string
    visitorMeaning: string
    lastIntegrationSync: string | null
  }
}

export interface ServerInfo {
  id: string
  name: string
  region: string
  status: string
  runtime: string
  activeSessions: number
  queuedSessions: number
  maxSessions: number
  cpuPercent: number
  memoryPercent: number
  memoryUsedGb: number
  memoryTotalGb: number
  bandwidthKbps: number
  uptimeSeconds: number
  loadAverage: number[]
  platform: string
  nodeVersion: string
  dockerAvailable: boolean
  playwrightInstalled: boolean
  egressProfile?: string
  egressConfigured?: boolean
}

export interface ServersResponse {
  servers: ServerInfo[]
  limits: { maxSessions: number; maxConcurrentBrowsers: number; cpuCount: number }
  isolation: string
}

export interface ActivityEvent {
  id: string
  at: string
  type: string
  title: string
  detail: string
  level: 'info' | 'warn' | 'error' | 'success'
  meta?: Record<string, unknown>
}

export interface Overview {
  analytics: Analytics
  servers: ServersResponse
  jobs: Job[]
  activeSessions: BrowserSession[]
  recentInspections: Inspection[]
  recentAds: AdEvent[]
  activity: ActivityEvent[]
  health: { database: string; automation: string; ai: string; analytics: string }
}

export interface Health {
  ok: boolean
  name: string
  version: string
  time: string
  authRequired: boolean
  capabilities: Record<string, string | boolean>
  policy: { mode: string; clickAds: boolean; artificialTraffic: boolean }
}

export interface Policy {
  mode: string
  summary: string
  prohibited: string[]
  allowed: string[]
  monetization: string[]
}

export interface SettingsPayload {
  settings: {
    aiModel: string
    aiEndpointConfigured: boolean
    aiApiKeyConfigured: boolean
    analyticsProvider: string
    analyticsConfigured: boolean
    webhookConfigured: boolean
    automationMode: string
    sessionDurationMs: number
    maxConcurrentBrowsers: number
    retentionDays: number
    safeMode: boolean
    policy: Record<string, boolean>
  }
  environment: {
    database: string
    automationRequested: string
    aiConfigured: boolean
    aiEndpoint: string
    analyticsConfigured: boolean
    webhookConfigured: boolean
    authRequired: boolean
  }
}

export interface IntegrationsPayload {
  analytics: {
    provider: string
    configured: boolean
    webhookConfigured: boolean
    lastSyncAt: string | null
    lastError: string | null
    verifiedEventCount: number
  }
  ai: { configured: boolean; model: string; endpointConfigured: boolean }
  automation: { playwrightAvailable: boolean; concurrentLimit: number; maxSessions: number }
  database: string
}

export interface AdsResponse {
  events: AdEvent[]
  policy: Policy
  summary: { detections: number; verifiedImpressions: number; verifiedNote: string }
  networks: string[]
}

export type NavKey = 'overview' | 'inspector' | 'sessions' | 'advertising' | 'servers' | 'analytics' | 'activity' | 'settings'
