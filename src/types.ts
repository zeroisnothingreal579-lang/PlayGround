export type ViewId = 'overview' | 'inspector' | 'sessions' | 'ads' | 'servers' | 'analytics' | 'settings'

export type SessionStatus =
  | 'queued'
  | 'resolving'
  | 'opening'
  | 'inspecting'
  | 'analyzing'
  | 'complete'
  | 'paused'
  | 'stopped'
  | 'error'
  | 'blocked'

export type RunStatus = 'queued' | 'running' | 'paused' | 'complete' | 'stopped' | 'error'

export interface RedirectHop {
  url: string
  statusCode: number | null
  location: string | null
  elapsedMs: number
  note?: string
}

export interface RedirectFlag {
  code: 'loop' | 'suspicious' | 'insecure' | 'tracker' | 'captcha' | 'blocked' | 'error' | 'shortener'
  label: string
  detail: string
  severity: 'low' | 'medium' | 'high'
}

export interface AdObservation {
  id: string
  format: string
  network: string | null
  selector: string
  text: string | null
  visible: boolean
  firstSeenMs: number
  lastSeenMs: number | null
  durationMs: number | null
  confidence: 'low' | 'medium' | 'high'
  verified: false
}

export interface PageSignals {
  title: string | null
  description: string | null
  headings: string[]
  textSnippet: string
  captcha: boolean
  blocked: boolean
  blockedReason: string | null
  countdowns: number
  skipControls: string[]
  continueControls: string[]
  adObservations: AdObservation[]
  adNetworks: string[]
  finalUrl: string | null
  loadMs: number
  statusCode: number | null
  screenshotUrl: string | null
  screenshotUpdatedAt: string | null
  inspectedWith: 'browser' | 'fetch' | 'none'
}

export interface Analysis {
  id: string
  inputUrl: string
  normalizedUrl: string
  finalUrl: string | null
  finalDomain: string | null
  status: 'pending' | 'success' | 'partial' | 'error'
  statusCode: number | null
  redirects: RedirectHop[]
  redirectCount: number
  loopDetected: boolean
  insecure: boolean
  suspicion: 'low' | 'medium' | 'high'
  flags: RedirectFlag[]
  page: PageSignals | null
  createdAt: string
  elapsedMs: number
  error: string | null
  inspectedWith: 'browser' | 'fetch' | 'none'
  aiSummary: string | null
}

export interface SessionLog {
  id: string
  at: string
  level: 'info' | 'success' | 'warn' | 'error'
  message: string
  action?: string
}

export interface BrowserSession {
  id: string
  runId: string
  index: number
  inputUrl: string
  status: SessionStatus
  progress: number
  phaseMessage: string
  currentUrl: string | null
  finalUrl: string | null
  finalDomain: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  elapsedMs: number
  analysis: Analysis | null
  page: PageSignals | null
  ads: AdObservation[]
  logs: SessionLog[]
  summary: string | null
  error: string | null
  serverId: string
  serverRegion: string
  viewport: string
  aiMode: 'llm' | 'heuristic'
  screenshotUrl: string | null
  screenshotUpdatedAt: string | null
}

export interface RunOptions {
  deepInspect: boolean
  aiSummary: boolean
  passiveScroll: boolean
}

export interface Run {
  id: string
  inputUrl: string
  sessionCount: number
  status: RunStatus
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  analysis: Analysis | null
  options: RunOptions
  sessions: BrowserSession[]
  completedCount: number
  errorCount: number
  adCount: number
}

export interface ServerMetric {
  id: string
  name: string
  region: string
  kind: 'local' | 'worker'
  status: 'online' | 'degraded' | 'offline'
  cpuPercent: number
  memoryPercent: number
  memoryUsedMb: number
  memoryTotalMb: number
  bandwidthInKbps: number
  bandwidthOutKbps: number
  uptimeSeconds: number
  activeSessions: number
  maxSessions: number
  latencyMs: number
  connection: string
}

export interface HistoryPoint {
  date: string
  navigations: number
  completed: number
  errors: number
  ads: number
}

export interface DomainStat {
  domain: string
  count: number
  successRate: number
}

export interface Analytics {
  probes: number
  redirectSuccessRate: number
  loadingErrors: number
  adObservations: number
  blockedPages: number
  averageLoadMs: number
  uniqueDestinations: number
  verifiedClicks: number | null
  verifiedEarnings: number | null
  verifiedCurrency: string | null
  verifiedSource: string | null
  history: HistoryPoint[]
  topDomains: DomainStat[]
  statusBreakdown: { name: string; value: number; color: string }[]
}

export interface VerifiedMetric {
  id: string
  source: string
  clicks: number
  impressions: number
  earnings: number
  currency: string
  periodStart: string
  periodEnd: string
  note: string | null
  createdAt: string
}

export interface ConfigStatus {
  appName: string
  version: string
  environment: string
  authEnabled: boolean
  automationEnabled: boolean
  browserAvailable: boolean
  aiConfigured: boolean
  aiModel: string | null
  aiMode: 'llm' | 'heuristic'
  database: 'postgresql' | 'file'
  maxSessionsPerRun: number
  maxConcurrentSessions: number
  rateLimitPerMinute: number
  encryptionConfigured: boolean
  region: string
  workers: number
  notes: string[]
}

export interface Snapshot {
  runs: Run[]
  servers: ServerMetric[]
  analytics: Analytics
  config: ConfigStatus
  verifiedMetrics: VerifiedMetric[]
  logs: ActivityEntry[]
}

export interface ActivityEntry {
  id: string
  at: string
  kind: 'analysis' | 'run' | 'session' | 'system' | 'safety'
  message: string
  runId?: string
  sessionId?: string
}

export interface ApiErrorBody {
  error: string
  detail?: string
}
