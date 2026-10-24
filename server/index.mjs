import express from 'express'
import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { WebSocketServer } from 'ws'
import { config } from './config.mjs'
import { store } from './db.mjs'
import { inspectUrl, adPolicy, assertSafeTarget } from './inspector.mjs'
import { SessionEngine } from './automation.mjs'
import { analyzePageWithAi, checkAiConnection } from './ai.mjs'
import { buildAnalytics, inspectionsCsv, sessionsCsv } from './analytics.mjs'
import { serverStats } from './server-stats.mjs'
import { ingestVerifiedEvents, refreshAnalyticsIntegration, verifyWebhookSignature } from './integrations.mjs'
import { boundedInt, id, isLikelyUrl, nowIso, stripSecrets, truncate } from './util.mjs'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
const server = createServer(app)
const wsServer = new WebSocketServer({ noServer: true })
const clients = new Set()

function broadcast(message) {
  const payload = JSON.stringify(message)
  for (const client of clients) {
    if (client.readyState === 1) client.send(payload)
  }
}

function recordEvent(type, title, detail, level = 'info', meta = {}) {
  const event = { id: id('evt'), at: nowIso(), type, title: truncate(title, 160), detail: truncate(detail, 400), level, meta }
  store.mutate((state) => {
    state.events.unshift(event)
    state.events = state.events.slice(0, 500)
  })
  broadcast({ type: 'activity', event })
  return event
}

const engine = new SessionEngine({
  store,
  broadcast,
  onAdEvent: (sessionId) => {
    const session = store.get().sessions.find((item) => item.id === sessionId)
    if (session) recordEvent('ad', 'Advertising elements detected', `${session.finalDomain || 'Page'} · reporting only, not a verified impression.`, 'warn', { sessionId })
    broadcast({ type: 'stats:update' })
  },
})

const buckets = new Map()
function rateLimit({ windowMs, max, key = 'default' }) {
  return (req, res, next) => {
    const identity = `${req.ip}:${key}`
    const now = Date.now()
    let bucket = buckets.get(identity)
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(identity, bucket)
    }
    bucket.count += 1
    res.setHeader('X-RateLimit-Limit', max)
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - bucket.count))
    if (bucket.count > max) {
      res.status(429).json({ error: 'Rate limit exceeded. Please slow down.', retryAfter: Math.ceil((bucket.resetAt - now) / 1000) })
      return
    }
    next()
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets.entries()) if (bucket.resetAt < now) buckets.delete(key)
}, 60_000).unref()

function tokenMatches(provided) {
  if (!config.authToken) return true
  if (!provided) return false
  const expected = Buffer.from(config.authToken)
  const actual = Buffer.from(String(provided))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function requireAuth(req, res, next) {
  if (!config.authToken) return next()
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.token
  if (!tokenMatches(bearer)) return res.status(401).json({ error: 'Authentication required', authRequired: true })
  next()
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
  next()
})

app.post('/api/webhooks/verified', express.raw({ type: 'application/json', limit: '256kb' }), rateLimit({ windowMs: 60_000, max: 60, key: 'webhook' }), (req, res) => {
  const signature = req.headers['x-linkpilot-signature']
  if (!verifyWebhookSignature(req.body, signature)) {
    res.status(401).json({ error: 'Invalid or missing webhook signature' })
    return
  }
  let payload
  try {
    payload = JSON.parse(req.body.toString('utf8'))
  } catch {
    res.status(400).json({ error: 'Invalid JSON' })
    return
  }
  const result = ingestVerifiedEvents(store, payload.events || payload, 'signed webhook')
  recordEvent('integration', 'Verified analytics received', `${result.accepted} verified event(s) accepted from a signed webhook.`, 'success')
  broadcast({ type: 'stats:update' })
  res.json(result)
})

app.use(express.json({ limit: '2mb' }))

app.get('/api/health', async (req, res) => {
  const automation = await engine.capability()
  res.json({
    ok: true,
    name: 'LinkPilot AI',
    version: '1.0.0',
    time: nowIso(),
    authRequired: Boolean(config.authToken),
    capabilities: {
      database: store.mode,
      automation: automation ? 'playwright' : 'http-analysis',
      ai: config.ai.endpoint && config.ai.apiKey ? 'language-model' : 'heuristic',
      docker: config.dockerSocket,
      websockets: true,
      analytics: config.analytics.endpoint && config.analytics.apiKey ? 'authorized-integration' : 'not-connected',
    },
    policy: { mode: adPolicy.mode, clickAds: false, artificialTraffic: false },
  })
})

app.get('/api/auth/status', (req, res) => {
  res.json({ authRequired: Boolean(config.authToken), authenticated: !config.authToken || tokenMatches(req.headers.authorization?.replace(/^Bearer\s+/i, '')) })
})

app.post('/api/auth/verify', rateLimit({ windowMs: 60_000, max: 20, key: 'auth' }), (req, res) => {
  if (!config.authToken) return res.json({ ok: true })
  if (!tokenMatches(req.body?.token)) return res.status(401).json({ error: 'Invalid access token' })
  res.json({ ok: true })
})

app.use('/api', requireAuth, rateLimit({ windowMs: 60_000, max: 240, key: 'api' }))

app.get('/api/policy', (req, res) => res.json(adPolicy))

app.get('/api/overview', (req, res) => {
  const state = store.get()
  const analytics = buildAnalytics(state, req.query.range || '7d')
  const serverInfo = serverStats(state, { engineAvailable: Boolean(engine.available) })
  const jobs = state.jobs
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6)
    .map((job) => ({ ...job, sessionCount: state.sessions.filter((session) => session.jobId === job.id).length }))
  res.json({
    analytics,
    servers: serverInfo,
    jobs,
    activeSessions: state.sessions.filter((session) => ['queued', 'launching', 'loading', 'active', 'paused'].includes(session.status)).slice(0, 8),
    recentInspections: state.inspections.slice(0, 5),
    recentAds: state.adEvents.slice(0, 5),
    activity: state.events.slice(0, 8),
    health: {
      database: store.mode,
      automation: engine.available === null ? 'detecting' : engine.available ? 'playwright' : 'http-analysis',
      ai: config.ai.endpoint && config.ai.apiKey ? 'language-model' : 'heuristic',
      analytics: state.integrations.verifiedEvents.length ? 'connected' : 'not-connected',
    },
  })
})

app.post('/api/inspect', rateLimit({ windowMs: 60_000, max: 30, key: 'inspect' }), asyncRoute(async (req, res) => {
  const rawUrls = Array.isArray(req.body?.urls) ? req.body.urls : req.body?.url ? [req.body.url] : []
  const urls = [...new Set(rawUrls.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 50)
  if (!urls.length) return res.status(400).json({ error: 'Provide at least one URL.' })
  if (urls.some((url) => !isLikelyUrl(url))) return res.status(400).json({ error: 'One or more URLs are invalid. Use HTTP or HTTPS.' })
  const results = []
  const queue = [...urls]
  const workers = Array.from({ length: Math.min(4, urls.length) }, async () => {
    while (queue.length) {
      const url = queue.shift()
      let result
      try {
        result = await inspectUrl(url)
      } catch (error) {
        result = { originalUrl: url, finalUrl: '', finalDomain: '', pageStatus: 'error', statusCode: 0, redirects: [], redirectCount: 0, durationMs: 0, risk: { level: 'high', score: 8, reasons: [error.message] }, ads: { detected: false, networks: [], formats: [], verified: false }, controls: {}, error: error.message, inspectedAt: nowIso() }
      }
      const inspection = { id: id('insp'), createdAt: nowIso(), ...result }
      store.mutate((state) => {
        state.inspections.unshift(inspection)
        state.inspections = state.inspections.slice(0, 300)
      })
      results.push(inspection)
      broadcast({ type: 'inspection:new', inspection })
      recordEvent('inspection', `Inspected ${truncate(result.finalDomain || url, 60)}`, `${result.pageStatus} · ${result.redirectCount || 0} redirects`, result.pageStatus === 'ok' ? 'success' : 'warn', { inspectionId: inspection.id })
    }
  })
  await Promise.all(workers)
  const ordered = urls.map((url) => results.find((result) => result.originalUrl === url)).filter(Boolean)
  res.json({ inspections: ordered, accepted: ordered.length })
}))

app.get('/api/inspections', (req, res) => {
  const limit = boundedInt(req.query.limit, 1, 300, 100)
  res.json({ inspections: store.get().inspections.slice(0, limit) })
})

app.get('/api/inspections/:id', (req, res) => {
  const inspection = store.get().inspections.find((item) => item.id === req.params.id)
  if (!inspection) return res.status(404).json({ error: 'Inspection not found' })
  res.json({ inspection })
})

app.post('/api/inspections/:id/ai', rateLimit({ windowMs: 60_000, max: 20, key: 'ai' }), asyncRoute(async (req, res) => {
  const inspection = store.get().inspections.find((item) => item.id === req.params.id)
  if (!inspection) return res.status(404).json({ error: 'Inspection not found' })
  const analysis = await analyzePageWithAi(inspection)
  store.mutate((state) => {
    const target = state.inspections.find((item) => item.id === req.params.id)
    if (target) target.ai = analysis
  })
  broadcast({ type: 'inspection:update', inspection })
  res.json({ analysis })
}))

app.get('/api/jobs', (req, res) => {
  const state = store.get()
  const jobs = state.jobs.map((job) => {
    const sessions = state.sessions.filter((session) => session.jobId === job.id)
    return {
      ...job,
      sessionCount: sessions.length,
      runningCount: sessions.filter((session) => ['launching', 'loading', 'active'].includes(session.status)).length,
      completedCount: sessions.filter((session) => session.status === 'completed').length,
    }
  })
  res.json({ jobs })
})

app.get('/api/jobs/:id', (req, res) => {
  const state = store.get()
  const job = state.jobs.find((item) => item.id === req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  const sessions = state.sessions.filter((session) => session.jobId === job.id)
  res.json({ job: { ...job, sessionCount: sessions.length }, sessions })
})

app.post('/api/jobs', rateLimit({ windowMs: 60_000, max: 15, key: 'jobs' }), asyncRoute(async (req, res) => {
  const url = String(req.body?.url || '').trim()
  if (!isLikelyUrl(url)) return res.status(400).json({ error: 'A valid HTTP or HTTPS URL is required.' })
  const count = boundedInt(req.body?.count, 1, config.maxSessions, 5)
  const requestedEngine = ['auto', 'playwright', 'http-analysis'].includes(req.body?.engine) ? req.body.engine : 'auto'
  try {
    await assertSafeTarget(url)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
  const automation = await engine.capability()
  const resolvedEngine = requestedEngine === 'http-analysis' || !automation ? 'http-analysis' : 'playwright'
  const jobId = id('job')
  const createdAt = nowIso()
  const job = {
    id: jobId,
    url,
    count,
    requestedEngine,
    engine: resolvedEngine,
    status: 'queued',
    createdAt,
    startedAt: null,
    completedAt: null,
    summary: '',
    classification: 'automation sessions — not human visitors',
  }
  const sessions = Array.from({ length: count }, (_, index) => ({
    id: id('ses'),
    jobId,
    index: index + 1,
    originalUrl: url,
    currentUrl: url,
    finalUrl: '',
    finalDomain: '',
    title: '',
    status: 'queued',
    pageStatus: 'queued',
    progress: 0,
    ads: { detected: false, networks: [], formats: [], verified: false, note: '' },
    controls: {},
    ai: null,
    inspection: null,
    error: null,
    workerId: null,
    region: null,
    startedAt: null,
    endedAt: null,
    createdAt,
    updatedAt: createdAt,
    logs: [{ id: id('log'), at: createdAt, type: 'system', level: 'info', message: 'Session queued in the isolated worker pool.' }],
    previewAt: null,
  }))
  store.mutate((state) => {
    state.jobs.unshift(job)
    state.jobs = state.jobs.slice(0, 100)
    state.sessions.unshift(...sessions)
    state.sessions = state.sessions.slice(0, 500)
  })
  recordEvent('session', `Launched ${count} session${count === 1 ? '' : 's'}`, `${truncate(url, 90)} · ${resolvedEngine}`, 'info', { jobId })
  broadcast({ type: 'job:update', job })
  broadcast({ type: 'stats:update' })
  engine.runJob(jobId).catch((error) => {
    console.error('[engine] job failed:', error)
    recordEvent('session', 'Job execution error', error.message, 'error', { jobId })
  })
  res.status(201).json({ job, sessions })
}))

app.post('/api/jobs/:id/action', asyncRoute(async (req, res) => {
  const action = req.body?.action
  const job = store.get().jobs.find((item) => item.id === req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  if (action === 'pause') await engine.pauseJob(job.id)
  else if (action === 'resume') await engine.resumeJob(job.id)
  else if (action === 'stop') await engine.stopJob(job.id)
  else if (action === 'start') {
    if (['queued', 'stopped', 'paused'].includes(job.status)) {
      engine.stopped.delete(job.id)
      engine.paused.delete(job.id)
      store.mutate((state) => {
        const target = state.jobs.find((item) => item.id === job.id)
        if (target) {
          target.status = 'queued'
          target.completedAt = null
          target.startedAt ||= nowIso()
        }
        for (const session of state.sessions.filter((item) => item.jobId === job.id)) {
          if (['stopped', 'error', 'paused', 'queued'].includes(session.status)) {
            engine.stopped.delete(session.id)
            engine.paused.delete(session.id)
            session.status = 'queued'
            session.progress = 0
            session.error = null
            session.startedAt = null
            session.endedAt = null
            session.updatedAt = nowIso()
          }
        }
      })
      engine.runJob(job.id)
    }
  } else return res.status(400).json({ error: 'Unknown action' })
  recordEvent('control', `Job ${action}`, `Job ${job.id.slice(-8)}`, action === 'stop' ? 'warn' : 'info', { jobId: job.id })
  res.json({ job: engine.getJob(job.id) })
}))

app.post('/api/jobs/:id/stop', asyncRoute(async (req, res) => {
  const job = store.get().jobs.find((item) => item.id === req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  await engine.stopJob(job.id)
  res.json({ job: engine.getJob(job.id) })
}))

app.get('/api/sessions', (req, res) => {
  const state = store.get()
  const jobId = req.query.jobId
  const limit = boundedInt(req.query.limit, 1, 500, 200)
  const sessions = state.sessions
    .filter((session) => !jobId || session.jobId === jobId)
    .slice(0, limit)
    .map(({ inspection, logs, ...session }) => ({ ...session, logCount: logs?.length || 0, previewAvailable: engine.hasPreview(session.id) }))
  res.json({ sessions })
})

app.get('/api/sessions/:id', (req, res) => {
  const session = store.get().sessions.find((item) => item.id === req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  res.json({ session: { ...session, previewAvailable: engine.hasPreview(session.id) } })
})

app.get('/api/sessions/:id/preview', (req, res) => {
  const preview = engine.getPreview(req.params.id)
  if (!preview) {
    res.status(204).end()
    return
  }
  res.setHeader('Content-Type', 'image/jpeg')
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.send(preview.buffer)
})

app.post('/api/sessions/:id/action', asyncRoute(async (req, res) => {
  const action = req.body?.action
  const session = engine.getSession(req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found' })
  if (action === 'pause') await engine.pauseSession(session.id)
  else if (action === 'resume') await engine.resumeSession(session.id)
  else if (action === 'stop') await engine.stopSession(session.id)
  else return res.status(400).json({ error: 'Unknown action' })
  res.json({ session: engine.getSession(session.id) })
}))

app.get('/api/analytics', (req, res) => {
  res.json(buildAnalytics(store.get(), req.query.range || '7d'))
})

app.get('/api/analytics/export.csv', (req, res) => {
  const kind = req.query.kind === 'inspections' ? 'inspections' : 'sessions'
  const state = store.get()
  const csv = kind === 'inspections' ? inspectionsCsv(state) : sessionsCsv(state)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="linkpilot-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`)
  res.send(csv)
})

app.get('/api/ads', (req, res) => {
  const state = store.get()
  res.json({
    events: state.adEvents.slice(0, 100),
    policy: adPolicy,
    summary: {
      detections: state.adEvents.length,
      verifiedImpressions: state.integrations.verifiedEvents.filter((event) => event.type === 'impression').length,
      verifiedNote: 'Verified metrics appear only when supplied by an authorized integration.',
    },
    networks: [...new Set(state.adEvents.flatMap((event) => event.networks || [event.network]))].filter(Boolean),
  })
})

app.get('/api/servers', (req, res) => res.json(serverStats(store.get(), { engineAvailable: Boolean(engine.available) })))

app.get('/api/activity', (req, res) => {
  const state = store.get()
  const limit = boundedInt(req.query.limit, 1, 500, 150)
  res.json({ events: state.events.slice(0, limit) })
})

app.get('/api/settings', (req, res) => {
  res.json({
    settings: stripSecrets(store.get().settings),
    environment: {
      database: store.mode,
      automationRequested: 'auto',
      aiConfigured: Boolean(config.ai.endpoint && config.ai.apiKey),
      aiEndpoint: config.ai.endpoint ? 'configured' : '',
      analyticsConfigured: Boolean(config.analytics.endpoint && config.analytics.apiKey),
      webhookConfigured: Boolean(config.analytics.webhookSecret),
      authRequired: Boolean(config.authToken),
    },
  })
})

app.patch('/api/settings', (req, res) => {
  const body = req.body || {}
  store.mutate((state) => {
    if (body.sessionDurationMs !== undefined) state.settings.sessionDurationMs = boundedInt(body.sessionDurationMs, 5_000, 60_000, state.settings.sessionDurationMs)
    if (body.maxConcurrentBrowsers !== undefined) state.settings.maxConcurrentBrowsers = boundedInt(body.maxConcurrentBrowsers, 1, 20, state.settings.maxConcurrentBrowsers)
    if (body.retentionDays !== undefined) state.settings.retentionDays = boundedInt(body.retentionDays, 1, 365, state.settings.retentionDays)
    state.settings.safeMode = true
    state.settings.policy = { clickAds: false, clickRewardedControls: false, bypassCountdowns: false, rotateIpsForTraffic: false, generateArtificialTraffic: false, analyzeOnly: true }
  })
  engine.setConcurrency(store.get().settings.maxConcurrentBrowsers)
  recordEvent('system', 'Settings updated', 'Policy protections were reasserted.', 'info')
  broadcast({ type: 'stats:update' })
  res.json({ settings: stripSecrets(store.get().settings), note: 'Safety policy cannot be disabled through the API.' })
})

app.post('/api/settings/test-ai', rateLimit({ windowMs: 60_000, max: 10, key: 'ai-test' }), asyncRoute(async (req, res) => {
  const result = await checkAiConnection()
  res.status(result.ok ? 200 : 400).json(result)
}))

app.post('/api/settings/test-analytics', rateLimit({ windowMs: 60_000, max: 10, key: 'analytics-test' }), asyncRoute(async (req, res) => {
  const result = await refreshAnalyticsIntegration(store)
  recordEvent('integration', 'Analytics synced', `${result.imported} verified events imported.`, 'success')
  broadcast({ type: 'stats:update' })
  res.json(result)
}))

app.get('/api/integrations', (req, res) => {
  const state = store.get()
  res.json({
    analytics: {
      provider: config.analytics.provider || '',
      configured: Boolean(config.analytics.endpoint && config.analytics.apiKey),
      webhookConfigured: Boolean(config.analytics.webhookSecret),
      lastSyncAt: state.integrations.lastSyncAt,
      lastError: state.integrations.syncError,
      verifiedEventCount: state.integrations.verifiedEvents.length,
    },
    ai: { configured: Boolean(config.ai.endpoint && config.ai.apiKey), model: config.ai.model, endpointConfigured: Boolean(config.ai.endpoint) },
    automation: { playwrightAvailable: Boolean(engine.available), concurrentLimit: store.get().settings?.maxConcurrentBrowsers || config.maxConcurrentBrowsers, maxSessions: config.maxSessions },
    database: store.mode,
  })
})

app.get('/api/health/details', (req, res) => {
  res.json({
    database: store.mode,
    playwright: engine.available,
    activeRuntimes: engine.runtimes?.size || 0,
    workers: 1,
    memory: process.memoryUsage(),
  })
})

const dist = resolve(config.distDir)
if (existsSync(join(dist, 'index.html'))) {
  app.use(express.static(dist, { maxAge: '1h', index: false }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(join(dist, 'index.html'))
  })
}

app.use((req, res) => res.status(404).json({ error: 'Not found' }))

app.use((error, req, res, next) => {
  console.error('[api]', error)
  if (res.headersSent) return next(error)
  const status = error.status || 500
  res.status(status).json({ error: status === 500 ? 'Internal server error' : error.message })
})

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://localhost')
  if (url.pathname !== '/ws') {
    socket.destroy()
    return
  }
  if (config.authToken) {
    const token = url.searchParams.get('token') || request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!tokenMatches(token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
  }
  wsServer.handleUpgrade(request, socket, head, (ws) => wsServer.emit('connection', ws, request))
})

wsServer.on('connection', (ws) => {
  clients.add(ws)
  ws.send(JSON.stringify({ type: 'connected', at: nowIso(), policy: adPolicy.mode }))
  ws.on('close', () => clients.delete(ws))
  ws.on('error', () => clients.delete(ws))
  const heartbeat = setInterval(() => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'heartbeat', at: nowIso() }))
  }, 25_000)
  heartbeat.unref?.()
  ws.on('close', () => clearInterval(heartbeat))
})

setInterval(async () => {
  const state = store.get()
  const active = state.sessions.filter((session) => ['queued', 'launching', 'loading', 'active'].includes(session.status)).length
  broadcast({ type: 'stats:update', active, at: nowIso() })
}, 12_000).unref()

async function main() {
  await store.init()
  await engine.capability()
  server.listen(config.port, config.host, () => {
    console.log(`[linkpilot] listening on http://${config.host}:${config.port}`)
    console.log(`[linkpilot] database=${store.mode} playwright=${engine.available ? 'ready' : 'fallback-http'} ai=${config.ai.endpoint ? 'configured' : 'heuristic'}`)
    console.log('[linkpilot] policy=analysis-only; ad engagement and artificial traffic are disabled')
  })
}

async function shutdown() {
  console.log('[linkpilot] shutting down')
  await engine.shutdown()
  await store.close()
  wsServer.close()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 4000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main().catch((error) => {
  console.error('[linkpilot] failed to start', error)
  process.exit(1)
})
