import { createServer } from 'node:http'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import express, { type NextFunction, type Request, type Response } from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import { aiConfigured, config, publicConfig } from './config.js'
import { analyzeUrl } from './analyzer.js'
import { buildAnalytics } from './analytics.js'
import { collectServers } from './metrics.js'
import { orchestrator, type OrchestratorEvent } from './orchestrator.js'
import {
  createSessionToken,
  clearSessionCookie,
  isAuthenticated,
  parseCookies,
  passwordMatches,
  rateLimit,
  requireAuth,
  sessionCookie,
} from './security.js'
import { store } from './store.js'
import type { ActivityEntry, Run, RunOptions, VerifiedMetric } from './types.js'

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob:",
      "connect-src 'self' ws: wss:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  )
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store')
  next()
})

app.use(express.json({ limit: '1.5mb' }))

function handleError(res: Response, error: unknown, status = 400): void {
  const message = error instanceof Error ? error.message : 'Unexpected request failure.'
  res.status(status).json({ error: message })
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next)
  }
}

function csvEscape(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function sendCsv(res: Response, name: string, headers: string[], rows: unknown[][]): void {
  const body = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
  res.send(`\uFEFF${body}`)
}

function activityFeed(runs: Run[]): ActivityEntry[] {
  const entries: ActivityEntry[] = []
  for (const run of runs) {
    for (const session of run.sessions) {
      for (const log of session.logs.slice(-5)) {
        entries.push({
          id: log.id,
          at: log.at,
          kind: log.action === 'safety' ? 'safety' : log.action === 'ad_scan' ? 'analysis' : 'session',
          message: log.message,
          runId: run.id,
          sessionId: session.id,
        })
      }
    }
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40)
}

function publicRun(run: Run): Run {
  return run
}

async function buildSnapshot() {
  const runs = orchestrator.listRuns(40).map(publicRun)
  const verifiedMetrics = await store.listVerifiedMetrics(80)
  const servers = await collectServers()
  return {
    runs,
    servers,
    analytics: buildAnalytics(runs, verifiedMetrics),
    config: publicConfig(),
    verifiedMetrics,
    logs: activityFeed(runs),
  }
}

function bearerMatches(req: Request, expected: string): boolean {
  const provided = Buffer.from(req.headers.authorization || '')
  const candidate = Buffer.from(`Bearer ${expected}`)
  return provided.length === candidate.length && timingSafeEqual(provided, candidate)
}

function parseWorkerToken(req: Request): boolean {
  const expected = process.env.WORKER_HEALTH_TOKEN || process.env.ANALYTICS_INGEST_TOKEN
  return Boolean(expected) && bearerMatches(req, expected as string)
}

function parseIngestToken(req: Request): boolean {
  const expected = process.env.ANALYTICS_INGEST_TOKEN || process.env.WORKER_HEALTH_TOKEN
  return Boolean(expected) && bearerMatches(req, expected as string)
}

app.get('/api/health', async (_req, res) => {
  res.json({
    status: 'ok',
    app: config.appName,
    version: config.version,
    uptime: Math.round(process.uptime()),
    automation: config.automationEnabled,
    ai: aiConfigured ? 'configured' : 'heuristic',
    database: config.databaseUrl ? 'postgresql' : 'file',
  })
})

app.get('/api/auth/status', (req, res) => {
  res.json({
    authEnabled: Boolean(config.dashboardPassword),
    authenticated: isAuthenticated(req),
    aiConfigured,
    environment: config.env,
  })
})

app.post('/api/auth/login', rateLimit(12), (req, res) => {
  if (!config.dashboardPassword) {
    res.json({ ok: true, authEnabled: false })
    return
  }
  if (!passwordMatches(req.body?.password)) {
    res.status(401).json({ error: 'Incorrect dashboard password.' })
    return
  }
  res.setHeader('Set-Cookie', sessionCookie(createSessionToken()))
  res.json({ ok: true, authEnabled: true })
})

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie())
  res.json({ ok: true })
})

app.get('/api/worker-health', async (req, res) => {
  if (!parseWorkerToken(req) && !isAuthenticated(req)) {
    res.status(401).json({ error: 'Worker health authentication required.' })
    return
  }
  const servers = await collectServers()
  res.json(servers[0])
})

app.post('/api/integrations/verified-metrics', asyncRoute(async (req, res) => {
  if (!parseIngestToken(req)) {
    res.status(401).json({ error: 'A valid analytics ingest token is required.' })
    return
  }
  const metric = validateVerifiedMetric(req.body)
  await store.addVerifiedMetric(metric)
  broadcast({ type: 'integration.metrics' })
  res.status(201).json(metric)
}))

app.use('/api', requireAuth)
app.use('/api', rateLimit(config.rateLimitPerMinute))

app.get('/api/snapshot', asyncRoute(async (_req, res) => {
  res.json(await buildSnapshot())
}))

app.get('/api/config', (_req, res) => {
  res.json(publicConfig())
})

app.get('/api/servers', asyncRoute(async (_req, res) => {
  res.json(await collectServers())
}))

app.post('/api/analyze', rateLimit(24), asyncRoute(async (req, res) => {
  const input = typeof req.body?.url === 'string' ? req.body.url : ''
  if (!input) throw new Error('A URL is required.')
  const deep = req.body?.deep !== false
  const aiSummary = req.body?.aiSummary !== false
  const result = await analyzeUrl(input, {
    deep,
    aiSummary,
    passiveScroll: Boolean(req.body?.passiveScroll),
    screenshotId: req.body?.deep ? `analysis_${randomUUID()}` : undefined,
  })
  await store.saveAnalysis(result.analysis)
  broadcast({ type: 'analysis.created', analysisId: result.analysis.id })
  res.status(201).json(result.analysis)
}))

app.post('/api/analyze/bulk', rateLimit(12), asyncRoute(async (req, res) => {
  const raw: unknown[] = Array.isArray(req.body?.urls) ? req.body.urls as unknown[] : []
  const urls: string[] = [...new Set(raw.filter((url): url is string => typeof url === 'string' && Boolean(url.trim())))]
    .slice(0, 25)
  if (!urls.length) throw new Error('Provide between 1 and 25 URLs.')
  const deep = req.body?.deep === true
  const results: { url: string; analysis?: unknown; error?: string }[] = []
  const queue: string[] = [...urls]
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const url = queue.shift()
      if (!url) break
      try {
        const result = await analyzeUrl(url, { deep, aiSummary: false, passiveScroll: false })
        await store.saveAnalysis(result.analysis)
        results.push({ url, analysis: result.analysis })
      } catch (error) {
        results.push({ url, error: error instanceof Error ? error.message : 'Analysis failed.' })
      }
    }
  })
  await Promise.all(workers)
  broadcast({ type: 'analysis.created' })
  res.status(201).json({ results: results.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url)) })
}))

app.get('/api/analyses', asyncRoute(async (req, res) => {
  const limit = Math.min(150, Number.parseInt(String(req.query.limit || '50'), 10) || 50)
  res.json(await store.listAnalyses(limit))
}))

app.get('/api/analyses/:id', asyncRoute(async (req, res) => {
  const analysis = await store.getAnalysis(req.params.id)
  if (!analysis) {
    res.status(404).json({ error: 'Analysis not found.' })
    return
  }
  res.json(analysis)
}))

app.get('/api/runs', (req, res) => {
  const limit = Math.min(100, Number.parseInt(String(req.query.limit || '40'), 10) || 40)
  res.json(orchestrator.listRuns(limit))
})

app.get('/api/runs/:id', (req, res) => {
  const run = orchestrator.getRun(req.params.id)
  if (!run) {
    res.status(404).json({ error: 'Run not found.' })
    return
  }
  res.json(run)
})

app.post('/api/runs', rateLimit(18), asyncRoute(async (req, res) => {
  const input = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
  if (!input) throw new Error('A URL is required.')
  const sessionCount = Math.max(1, Math.min(config.maxSessionsPerRun, Number.parseInt(String(req.body?.sessionCount || '5'), 10) || 5))
  const options: Partial<RunOptions> = {
    deepInspect: req.body?.options?.deepInspect !== false,
    aiSummary: req.body?.options?.aiSummary !== false,
    passiveScroll: req.body?.options?.passiveScroll !== false,
  }
  const base = await analyzeUrl(input, { deep: false, aiSummary: false })
  await store.saveAnalysis(base.analysis)
  if (base.analysis.status === 'error') throw new Error(base.analysis.error || 'URL could not be resolved.')
  const run = await orchestrator.createRun(input, sessionCount, options, base.analysis)
  res.status(201).json(run)
}))

app.post('/api/runs/:id/start', asyncRoute(async (req, res) => {
  res.json(await orchestrator.startRun(req.params.id))
}))

app.post('/api/runs/:id/pause', asyncRoute(async (req, res) => {
  res.json(await orchestrator.pauseRun(req.params.id))
}))

app.post('/api/runs/:id/resume', asyncRoute(async (req, res) => {
  res.json(await orchestrator.resumeRun(req.params.id))
}))

app.post('/api/runs/:id/stop', asyncRoute(async (req, res) => {
  res.json(await orchestrator.stopRun(req.params.id))
}))

app.post('/api/runs/:id/sessions/:sessionId/start', asyncRoute(async (req, res) => {
  res.json(await orchestrator.startSession(req.params.id, req.params.sessionId))
}))

app.post('/api/runs/:id/sessions/:sessionId/pause', asyncRoute(async (req, res) => {
  res.json(await orchestrator.pauseSession(req.params.id, req.params.sessionId))
}))

app.post('/api/runs/:id/sessions/:sessionId/resume', asyncRoute(async (req, res) => {
  res.json(await orchestrator.resumeSession(req.params.id, req.params.sessionId))
}))

app.post('/api/runs/:id/sessions/:sessionId/stop', asyncRoute(async (req, res) => {
  res.json(await orchestrator.stopSession(req.params.id, req.params.sessionId))
}))

app.get('/api/analytics', asyncRoute(async (_req, res) => {
  const runs = orchestrator.listRuns(40)
  const verified = await store.listVerifiedMetrics(120)
  res.json(buildAnalytics(runs, verified))
}))

app.get('/api/verified-metrics', asyncRoute(async (_req, res) => {
  res.json(await store.listVerifiedMetrics(120))
}))

app.post('/api/verified-metrics', rateLimit(30), asyncRoute(async (req, res) => {
  const metric = validateVerifiedMetric(req.body)
  await store.addVerifiedMetric(metric)
  broadcast({ type: 'integration.metrics' })
  res.status(201).json(metric)
}))

app.delete('/api/verified-metrics/:id', asyncRoute(async (req, res) => {
  await store.removeVerifiedMetric(req.params.id)
  broadcast({ type: 'integration.metrics' })
  res.json({ ok: true })
}))

app.get('/api/export/:kind', asyncRoute(async (req, res) => {
  if (req.params.kind === 'runs') {
    const runs = orchestrator.listRuns(100)
    const rows = runs.flatMap((run) => run.sessions.map((session) => [
      run.id,
      session.id,
      session.index,
      run.inputUrl,
      session.status,
      session.finalDomain || '',
      session.finalUrl || '',
      session.analysis?.status || '',
      session.analysis?.redirectCount ?? '',
      session.ads.length,
      session.page?.loadMs ?? '',
      session.startedAt || '',
      session.completedAt || '',
      session.summary || '',
      session.error || '',
    ]))
    sendCsv(res, 'linkpilot-sessions.csv', [
      'run_id', 'session_id', 'session_index', 'input_url', 'status', 'final_domain', 'final_url',
      'redirect_status', 'redirect_count', 'observed_ads', 'load_ms', 'started_at', 'completed_at', 'summary', 'error',
    ], rows)
    return
  }
  if (req.params.kind === 'analyses') {
    const analyses = await store.listAnalyses(150)
    const rows = analyses.map((analysis) => [
      analysis.id,
      analysis.inputUrl,
      analysis.normalizedUrl,
      analysis.finalUrl || '',
      analysis.finalDomain || '',
      analysis.status,
      analysis.statusCode ?? '',
      analysis.redirectCount,
      analysis.suspicion,
      analysis.loopDetected,
      analysis.insecure,
      analysis.flags.map((flag) => flag.code).join('|'),
      analysis.createdAt,
    ])
    sendCsv(res, 'linkpilot-url-analyses.csv', [
      'id', 'input_url', 'normalized_url', 'final_url', 'final_domain', 'status', 'http_status',
      'redirect_count', 'suspicion', 'loop_detected', 'insecure', 'flags', 'created_at',
    ], rows)
    return
  }
  if (req.params.kind === 'verified-metrics') {
    const metrics = await store.listVerifiedMetrics(240)
    const rows = metrics.map((metric) => [
      metric.id, metric.source, metric.clicks, metric.impressions, metric.earnings, metric.currency,
      metric.periodStart, metric.periodEnd, metric.note || '', metric.createdAt,
    ])
    sendCsv(res, 'linkpilot-verified-metrics.csv', [
      'id', 'source', 'clicks', 'impressions', 'earnings', 'currency', 'period_start', 'period_end', 'note', 'created_at',
    ], rows)
    return
  }
  res.status(404).json({ error: 'Unknown export type.' })
}))

function validateVerifiedMetric(body: unknown): VerifiedMetric {
  const value = body as Record<string, unknown> | null
  if (!value || typeof value !== 'object') throw new Error('Metric payload is required.')
  const source = typeof value.source === 'string' ? value.source.trim().slice(0, 100) : ''
  if (!source) throw new Error('source is required.')
  const clicks = Number(value.clicks)
  const impressions = Number(value.impressions)
  const earnings = Number(value.earnings)
  if (![clicks, impressions, earnings].every((number) => Number.isFinite(number) && number >= 0)) {
    throw new Error('clicks, impressions and earnings must be non-negative numbers.')
  }
  const periodStart = typeof value.periodStart === 'string' ? value.periodStart.slice(0, 40) : ''
  const periodEnd = typeof value.periodEnd === 'string' ? value.periodEnd.slice(0, 40) : ''
  if (!periodStart || !periodEnd) throw new Error('periodStart and periodEnd are required.')
  return {
    id: randomUUID(),
    source,
    clicks: Math.floor(clicks),
    impressions: Math.floor(impressions),
    earnings: Math.round(earnings * 100) / 100,
    currency: typeof value.currency === 'string' ? value.currency.slice(0, 8).toUpperCase() : 'USD',
    periodStart,
    periodEnd,
    note: typeof value.note === 'string' ? value.note.slice(0, 500) : null,
    createdAt: new Date().toISOString(),
  }
}

app.use('/screenshots', requireAuth, express.static(`${config.dataDir}/screenshots`, {
  immutable: false,
  maxAge: 0,
  fallthrough: true,
}))

const dist = `${process.cwd()}/dist`
if (existsSync(dist)) {
  app.use(express.static(dist, {
    setHeaders: (res, path) => {
      if (path.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache')
      else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    },
  }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/screenshots/')) {
      next()
      return
    }
    res.sendFile(`${dist}/index.html`)
  })
}

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' })
})

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = (error as { status?: number }).status || 400
  if (status >= 500) console.error('[api]', error)
  if (res.headersSent) return
  handleError(res, error, status)
})

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------

const httpServer = createServer(app)
const wss = new WebSocketServer({ noServer: true })

function broadcast(payload: unknown): void {
  const message = JSON.stringify(payload)
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message)
  }
}

orchestrator.setEventHandler((event: OrchestratorEvent) => {
  broadcast(event)
})

httpServer.on('upgrade', (req, socket, head) => {
  let pathname = ''
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname
  } catch {
    socket.destroy()
    return
  }
  if (pathname !== '/ws') {
    socket.destroy()
    return
  }
  if (config.dashboardPassword) {
    const cookies = parseCookies(req.headers.cookie)
    if (!isAuthenticated({ headers: req.headers } as Request)) {
      if (cookies.lp_session) console.warn('[ws] rejected stale session')
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'connected', at: new Date().toISOString(), config: publicConfig() }))
  ws.on('error', () => undefined)
})

const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.ping()
  }
}, 25_000)
heartbeat.unref()

const metricsTimer = setInterval(async () => {
  if (!wss.clients.size) return
  try {
    broadcast({ type: 'server.metrics', servers: await collectServers() })
  } catch (error) {
    console.warn('[metrics] broadcast failed:', error)
  }
}, 5000)
metricsTimer.unref()

async function start(): Promise<void> {
  await store.init()
  await orchestrator.init()
  httpServer.listen(config.port, config.host, () => {
    console.log(`[linkpilot] ${config.appName} listening on http://${config.host}:${config.port}`)
    console.log(`[linkpilot] automation=${config.automationEnabled ? 'browser' : 'static'} ai=${aiConfigured ? config.ai.model : 'heuristic'} db=${store.mode}`)
    if (!config.dashboardPassword) console.warn('[linkpilot] DASHBOARD_PASSWORD unset — dashboard authentication is disabled.')
  })
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[linkpilot] ${signal} received, shutting down`)
  clearInterval(heartbeat)
  clearInterval(metricsTimer)
  wss.close()
  await orchestrator.shutdown()
  httpServer.close()
  await store.close()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('unhandledRejection', (reason) => console.error('[linkpilot] unhandled rejection:', reason))

void start().catch((error) => {
  console.error('[linkpilot] failed to start:', error)
  process.exit(1)
})
