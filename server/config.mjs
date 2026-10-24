import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const integer = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const bool = (value, fallback = false) => {
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

export const config = {
  port: integer(process.env.PORT || process.env.APP_PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || '',
  dataDir: resolve(process.env.DATA_DIR || '.data'),
  distDir: resolve(process.env.DIST_DIR || 'dist'),
  authToken: process.env.LINKPILOT_AUTH_TOKEN || '',
  allowPrivateTargets: bool(process.env.ALLOW_PRIVATE_TARGETS),
  maxSessions: integer(process.env.MAX_SESSIONS, 100),
  maxConcurrentBrowsers: integer(process.env.MAX_CONCURRENT_BROWSERS, 6),
  sessionTimeoutMs: integer(process.env.SESSION_TIMEOUT_MS, 45_000),
  maxRedirects: integer(process.env.MAX_REDIRECTS, 10),
  fetchTimeoutMs: integer(process.env.FETCH_TIMEOUT_MS, 9_000),
  previewIntervalMs: integer(process.env.PREVIEW_INTERVAL_MS, 6_000),
  workerRegion: process.env.WORKER_REGION || 'local-dev',
  workerId: process.env.WORKER_ID || 'worker-primary',
  workerMaxSessions: integer(process.env.WORKER_MAX_SESSIONS, 12),
  workerProxyServer: process.env.WORKER_PROXY_SERVER || '',
  workerProxyUsername: process.env.WORKER_PROXY_USERNAME || '',
  workerProxyPassword: process.env.WORKER_PROXY_PASSWORD || '',
  ai: {
    endpoint: process.env.AI_BASE_URL || process.env.AI_API_URL || '',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
  },
  analytics: {
    provider: process.env.ANALYTICS_PROVIDER || '',
    endpoint: process.env.ANALYTICS_API_URL || '',
    apiKey: process.env.ANALYTICS_API_KEY || '',
    webhookSecret: process.env.ANALYTICS_WEBHOOK_SECRET || '',
  },
  dockerSocket: existsSync('/var/run/docker.sock'),
  playwrightBrowserPath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '',
}
