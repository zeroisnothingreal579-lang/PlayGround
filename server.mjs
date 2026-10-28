import http from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseProxies, buildRotationOrder, poolSummary, flagFromCode } from './lib/proxies.mjs'
import { checkProxy } from './lib/proxy-check.mjs'
import { RemoteBrowser, START_URL } from './lib/browser.mjs'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)))
const PUBLIC_DIR = join(ROOT, 'public')
const PORT = Number(process.env.PORT || 3000)
const CHECK_TIMEOUT = 6500
const MAX_VERIFIED = 8

const proxies = parseProxies(join(ROOT, 'data', 'proxies.csv'))
const order = buildRotationOrder(proxies)
const summary = poolSummary(proxies)

const state = {
  status: 'booting',
  message: 'Starting engine…',
  error: null,
  ip: null,
  ipVerified: false,
  rotationCount: 0,
  browserUrl: '',
  pageTitle: '',
  startedAt: Date.now(),
  frameAt: 0
}

const verified = []
const dead = new Set()
let cursor = 0
let tested = 0
let currentProxy = null
let lastProxy = null
let rotating = false
let currentBatch = null
const history = []
const logs = []
const clients = new Set()
const recentFrames = []
let lastFrame = null
let lastLogAt = 0

const browser = new RemoteBrowser({
  onFrame(frame) {
    lastFrame = frame
    state.frameAt = frame.at
    const payload = JSON.stringify(frame)
    for (const client of clients) {
      try {
        client.write(`event: frame\ndata: ${payload}\n\n`)
      } catch {}
    }
  },
  onNav({ url, title }) {
    if (!url || url === 'about:blank') return
    state.browserUrl = url
    if (title) state.pageTitle = title
    broadcast('nav', { url, title })
  },
  onTitle({ url, title }) {
    if (url) state.browserUrl = url
    if (title) {
      state.pageTitle = title
      broadcast('nav', { url, title })
    }
  },
  onLog(line) {
    logLine(line)
  }
})

function logLine(line) {
  const entry = { at: Date.now(), line: String(line).slice(0, 240) }
  logs.push(entry)
  if (logs.length > 40) logs.shift()
  const now = Date.now()
  if (now - lastLogAt > 120) {
    lastLogAt = now
    broadcast('log', entry)
  }
}

function publicProxy(proxy) {
  if (!proxy) return null
  return {
    country: proxy.country,
    code: proxy.code,
    flag: proxy.flag,
    protocol: proxy.protocol,
    host: proxy.host,
    port: proxy.port,
    latencyMs: proxy.latencyMs,
    checkMs: proxy.checkMs ?? null,
    exitIp: proxy.ip || null,
    anonymity: proxy.anonymity
  }
}

function publicState() {
  return {
    status: state.status,
    message: state.message,
    error: state.error,
    ip: state.ip,
    ipVerified: state.ipVerified,
    rotationCount: state.rotationCount,
    browserUrl: state.browserUrl,
    pageTitle: state.pageTitle,
    frameAt: state.frameAt,
    startedAt: state.startedAt,
    proxy: publicProxy(currentProxy),
    pool: {
      ...summary,
      verified: verified.length,
      tested,
      dead: dead.size,
      queued: Math.max(0, order.length - cursor)
    },
    history: history.slice(0, 8),
    logs: logs.slice(-6).map((entry) => entry.line)
  }
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of clients) {
    try {
      client.write(payload)
    } catch {}
  }
}

function setStatus(status, extra = {}) {
  state.status = status
  if (extra.message !== undefined) state.message = extra.message
  if (extra.error !== undefined) state.error = extra.error
  if (extra.proxy !== undefined) currentProxy = extra.proxy
  broadcast('status', publicState())
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function addVerified(proxy) {
  if (verified.some((item) => item.key === proxy.key)) return
  verified.push(proxy)
  verified.sort((a, b) => (a.checkMs || 0) - (b.checkMs || 0))
  while (verified.length > MAX_VERIFIED * 2) verified.pop()
  broadcast('status', publicState())
}

function takeBatch(size) {
  const batch = []
  while (batch.length < size && cursor < order.length) {
    const proxy = order[cursor++]
    if (dead.has(proxy.key)) continue
    batch.push(proxy)
  }
  return batch
}

function startBatch(size = 14) {
  if (currentBatch) return currentBatch
  const batch = takeBatch(size)
  if (!batch.length) return null
  logLine(`Probing ${batch.length} exit nodes…`)
  currentBatch = Promise.allSettled(
    batch.map(async (proxy) => {
      tested += 1
      const result = await checkProxy(proxy, CHECK_TIMEOUT)
      if (result.ok) {
        addVerified({ ...proxy, ip: result.ip, checkMs: result.ms })
      } else {
        dead.add(proxy.key)
      }
      return result
    })
  ).finally(() => {
    currentBatch = null
    broadcast('status', publicState())
    if (verified.length < 3 && cursor < order.length) startBatch(10)
  })
  return currentBatch
}

function extractVerified() {
  if (!verified.length) return null
  const index = verified.findIndex((proxy) => proxy.host !== lastProxy?.host)
  return verified.splice(index >= 0 ? index : 0, 1)[0]
}

async function acquireProxy() {
  for (let round = 0; round < 5; round += 1) {
    const ready = extractVerified()
    if (ready) return ready
    if (cursor < order.length && !currentBatch) startBatch(14)
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      const got = extractVerified()
      if (got) return got
      if (!currentBatch && cursor >= order.length) break
      await sleep(100)
    }
    if (!currentBatch && cursor >= order.length && !verified.length) break
  }
  return extractVerified()
}

function pushHistory(proxy) {
  history.unshift({
    country: proxy.country,
    flag: proxy.flag,
    code: proxy.code,
    protocol: proxy.protocol,
    host: proxy.host,
    port: proxy.port,
    exitIp: proxy.ip,
    checkMs: proxy.checkMs ?? proxy.latencyMs,
    at: Date.now()
  })
  if (history.length > 12) history.pop()
}

async function rotate() {
  if (rotating) return { ok: false, reason: 'busy' }
  rotating = true
  let attempt = 0
  try {
    while (attempt < 6) {
      attempt += 1
      setStatus('verifying', { message: 'Testing exit nodes…', error: null })
      const proxy = await acquireProxy()
      if (!proxy) {
        setStatus('error', { message: 'No reachable exit nodes left', error: 'proxy pool exhausted' })
        logLine('No reachable exit nodes left')
        return { ok: false, reason: 'exhausted' }
      }
      setStatus('connecting', {
        message: `Tunnelling through ${proxy.country}…`,
        proxy
      })
      logLine(`Connecting via ${proxy.flag} ${proxy.country} · ${proxy.host}:${proxy.port}`)
      try {
        const info = await browser.open(proxy, START_URL)
        const observed = info.url.includes('ip.me') ? await browser.readExitInfo() : null
        const liveProxy = {
          ...proxy,
          ip: observed?.ip || proxy.ip,
          country: observed?.country || proxy.country,
          code: observed?.code || proxy.code
        }
        liveProxy.flag = liveProxy.code ? flagFromCode(liveProxy.code) : proxy.flag
        currentProxy = liveProxy
        lastProxy = proxy
        state.ip = liveProxy.ip
        state.ipVerified = Boolean(observed?.ip)
        state.browserUrl = info.url
        state.pageTitle = info.title
        state.rotationCount += 1
        state.error = null
        state.status = 'live'
        state.message = 'Connection live'
        pushHistory(liveProxy)
        logLine(`Live exit ${liveProxy.ip} · ${liveProxy.country} · ${liveProxy.protocol}`)
        broadcast('status', publicState())
        if (verified.length < 3 && cursor < order.length) startBatch(10)
        return { ok: true, proxy: publicProxy(liveProxy) }
      } catch (error) {
        dead.add(proxy.key)
        logLine(`✕ ${proxy.country} ${proxy.host}:${proxy.port} — ${short(error.message)}`)
        setStatus('retrying', { message: 'Exit failed, switching node…' })
        await sleep(150)
      }
    }
    setStatus('error', { message: 'Could not open a browser session', error: 'all attempts failed' })
    logLine('Could not open a browser session after 6 attempts')
    return { ok: false, reason: 'failed' }
  } finally {
    rotating = false
    broadcast('status', publicState())
  }
}

function short(message) {
  return String(message || '').split('\n')[0].slice(0, 160)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1_000_000) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}

function serveStatic(req, res, pathname) {
  let target = pathname === '/' ? '/index.html' : pathname
  const file = resolve(join(PUBLIC_DIR, target))
  if (file !== resolve(PUBLIC_DIR) && !file.startsWith(resolve(PUBLIC_DIR) + '/')) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  try {
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404)
      res.end('Not found')
      return
    }
    const mime = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.webmanifest': 'application/manifest+json'
    }
    const body = readFileSync(file)
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Content-Length': body.length
    })
    res.end(body)
  } catch {
    res.writeHead(500)
    res.end('Server error')
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  try {
    if (url.pathname === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      })
      res.write(': connected\n\n')
      res.write(`event: status\ndata: ${JSON.stringify(publicState())}\n\n`)
      if (lastFrame) res.write(`event: frame\ndata: ${JSON.stringify(lastFrame)}\n\n`)
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }
    if (url.pathname === '/api/status') {
      sendJson(res, 200, publicState())
      return
    }
    if (url.pathname === '/api/rotate' && req.method === 'POST') {
      if (rotating) {
        sendJson(res, 409, { ok: false, reason: 'busy' })
        return
      }
      rotate()
      sendJson(res, 202, { ok: true, accepted: true })
      return
    }
    if (url.pathname === '/api/navigate' && req.method === 'POST') {
      const body = await readBody(req)
      const result = await browser.navigate(body.url)
      state.browserUrl = result.url
      const observed = result.url.includes('ip.me') ? await browser.readExitInfo() : null
      if (observed?.ip && currentProxy) {
        currentProxy = {
          ...currentProxy,
          ip: observed.ip,
          country: observed.country || currentProxy.country,
          code: observed.code || currentProxy.code
        }
        currentProxy.flag = currentProxy.code ? flagFromCode(currentProxy.code) : currentProxy.flag
        state.ip = currentProxy.ip
        state.ipVerified = true
        const entry = history[0]
        if (entry && entry.host === currentProxy.host) entry.exitIp = currentProxy.ip
        logLine(`Page exit IP: ${currentProxy.ip} · ${currentProxy.country}`)
      }
      broadcast('status', publicState())
      sendJson(res, 200, { ok: true, ...result })
      return
    }
    if (url.pathname === '/api/back' && req.method === 'POST') {
      await browser.goBack()
      sendJson(res, 200, { ok: true })
      return
    }
    if (url.pathname === '/api/forward' && req.method === 'POST') {
      await browser.goForward()
      sendJson(res, 200, { ok: true })
      return
    }
    if (url.pathname === '/api/reload' && req.method === 'POST') {
      await browser.reload()
      sendJson(res, 200, { ok: true })
      return
    }
    if (url.pathname === '/api/input' && req.method === 'POST') {
      const body = await readBody(req)
      await browser.handleInput(body)
      res.writeHead(204)
      res.end()
      return
    }
    if (url.pathname === '/api/start' && req.method === 'POST') {
      rotate()
      sendJson(res, 202, { ok: true })
      return
    }
    if (url.pathname.startsWith('/api/')) {
      sendJson(res, 404, { ok: false, error: 'unknown endpoint' })
      return
    }
    serveStatic(req, res, url.pathname)
  } catch (error) {
    sendJson(res, 500, { ok: false, error: short(error.message) })
  }
})

const heartbeat = setInterval(() => {
  for (const client of clients) {
    try {
      client.write(': keepalive\n\n')
    } catch {}
  }
}, 15000)

server.listen(PORT, '0.0.0.0', () => {
  logLine(`Server listening on :${PORT}`)
  logLine(`Loaded ${summary.total} proxies · ${summary.usable} usable · ${summary.countries} countries`)
  rotate().catch((error) => {
    logLine(`Rotation failed: ${short(error.message)}`)
  })
})

function shutdown() {
  clearInterval(heartbeat)
  for (const client of clients) {
    try {
      client.end()
    } catch {}
  }
  browser.close().finally(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

export { server }
