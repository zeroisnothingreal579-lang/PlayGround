import 'dotenv/config'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import os from 'node:os'

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] || '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase())
}

const browserCandidates = [
  process.env.BROWSER_EXECUTABLE_PATH,
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean) as string[]

export const browserExecutable = browserCandidates.find((candidate) => {
  try {
    return existsSync(candidate)
  } catch {
    return false
  }
}) || null

export interface WorkerConfig {
  id: string
  name: string
  region: string
  url: string | null
  maxSessions: number
}

function parseWorkers(): WorkerConfig[] {
  const raw = process.env.WORKERS_JSON
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item.id === 'string')
      .slice(0, 24)
      .map((item) => ({
        id: String(item.id),
        name: String(item.name || item.id),
        region: String(item.region || 'unknown'),
        url: item.url ? String(item.url) : null,
        maxSessions: Math.max(1, Math.min(100, Number(item.maxSessions) || 10)),
      }))
  } catch {
    return []
  }
}

const maxSessionsPerRun = intEnv('MAX_SESSIONS_PER_RUN', 100, 1, 100)
const maxConcurrentSessions = intEnv('MAX_CONCURRENT_SESSIONS', 3, 1, 12)
const portValue = process.env.PORT || process.env.APP_PORT || '3000'

export const config = {
  appName: 'LinkPilot AI',
  version: '1.0.0',
  env: process.env.NODE_ENV || 'development',
  port: Number.isFinite(Number.parseInt(portValue, 10)) ? Math.min(65535, Math.max(1, Number.parseInt(portValue, 10))) : 3000,
  host: process.env.HOST || '0.0.0.0',
  dataDir: resolve(process.env.DATA_DIR || 'data'),
  databaseUrl: process.env.DATABASE_URL || null,
  dashboardPassword: process.env.DASHBOARD_PASSWORD || '',
  authSecret: process.env.AUTH_SECRET || process.env.DASHBOARD_PASSWORD || 'linkpilot-local-development-secret',
  encryptionKey: process.env.APP_ENCRYPTION_KEY || '',
  secureCookies: boolEnv('SECURE_COOKIES', (process.env.PUBLIC_BASE_URL || '').startsWith('https://')),
  automationEnabled: boolEnv('AUTOMATION_ENABLED', true) && Boolean(browserExecutable),
  browserExecutable,
  allowPrivateUrls: boolEnv('ALLOW_PRIVATE_URLS', false),
  allowedPorts: (process.env.ALLOWED_PORTS || '80,443')
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value)),
  requestTimeoutMs: intEnv('REQUEST_TIMEOUT_MS', 15000, 3000, 60000),
  navigationTimeoutMs: intEnv('NAVIGATION_TIMEOUT_MS', 30000, 5000, 90000),
  maxRedirects: intEnv('MAX_REDIRECTS', 12, 1, 30),
  maxSessionsPerRun,
  maxConcurrentSessions,
  rateLimitPerMinute: intEnv('RATE_LIMIT_PER_MINUTE', 90, 10, 2000),
  ai: {
    url: process.env.AI_API_URL || '',
    key: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    timeoutMs: intEnv('AI_TIMEOUT_MS', 25000, 5000, 60000),
  },
  region: process.env.WORKER_REGION || process.env.REGION || 'local-dev',
  serverName: process.env.WORKER_NAME || os.hostname(),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  workers: parseWorkers(),
  logLevel: process.env.LOG_LEVEL || 'info',
}

export const aiConfigured = Boolean(config.ai.url && config.ai.key && config.ai.model)

export function publicConfig() {
  return {
    appName: config.appName,
    version: config.version,
    environment: config.env,
    authEnabled: Boolean(config.dashboardPassword),
    automationEnabled: config.automationEnabled,
    browserAvailable: Boolean(browserExecutable),
    aiConfigured,
    aiModel: aiConfigured ? config.ai.model : null,
    aiMode: aiConfigured ? ('llm' as const) : ('heuristic' as const),
    database: config.databaseUrl ? ('postgresql' as const) : ('file' as const),
    maxSessionsPerRun: config.maxSessionsPerRun,
    maxConcurrentSessions: config.maxConcurrentSessions,
    rateLimitPerMinute: config.rateLimitPerMinute,
    encryptionConfigured: Boolean(config.encryptionKey),
    region: config.region,
    workers: config.workers.length + 1,
    notes: [
      !config.dashboardPassword ? 'DASHBOARD_PASSWORD is not set — dashboard access is open in this environment.' : '',
      !config.automationEnabled ? 'Browser probing is disabled because no Chromium executable was found or AUTOMATION_ENABLED=false.' : '',
      !aiConfigured ? 'AI_API_URL / AI_API_KEY are not configured — deterministic heuristic analysis is active.' : '',
      !config.databaseUrl ? 'DATABASE_URL is not configured — durable local JSON storage is active. Use PostgreSQL for production.' : '',
      !config.encryptionKey ? 'APP_ENCRYPTION_KEY is not configured — encrypted connector credential storage is unavailable.' : '',
    ].filter(Boolean),
  }
}
