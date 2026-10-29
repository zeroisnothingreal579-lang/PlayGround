import http from 'node:http'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseProxies, buildRotationOrder, poolSummary, flagFromCode, countryCode } from './lib/proxies.mjs'
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
  exitRotating: false,
  rotationCount: 0,
  browserUrl: '',
  pageTitle: '',
  startedAt: Date.now(),
  frameAt: 0,
  auto: { enabled: false, seconds: 30, nextAt: 0 }
}

const verified = []
const dead = new Set()
const rotatingProxies = new Set()
let cursor = 0
let tested = 0
let currentProxy = null
let lastProxy = null
let rotating = false
let currentBatch = null
let lastRecoveryAt = 0
const history = []
const logs = []
const clients = new Set()
const frameClients = new Set()
let lastFrame = null
let lastFrameData = null
let lastLogAt = 0
let exitRefreshTimer = null

const browser = new RemoteBrowser({
  onFrame(frame) {
    lastFrame = frame
    lastFrameData = Buffer.from(frame.data, 'base64')
    state.frameAt = frame.at
    if (frameClients.size) {
      const packet = wsFrame(lastFrameData)
      for (const socket of frameClients) {
        if (socket.writableLength > 1_500_000) continue
        try {
          socket.write(packet)
        } catch {
          frameClients.delete(socket)
        }
      }
    }
    if (clients.size) {
      const payload = JSON.stringify(frame)
      for (const client of clients) {
        if (!client.frames || client.writableLength > 2_000_000) continue
        try {
          client.write(`event: frame\ndata: ${payload}\n\n`)
        } catch {}
      }
    }
  },
  onNav({ url, title }) {
    if (!url || url === 'about:blank') return
    if (url.startsWith('chrome-error://') || url.startsWith('about:neterror')) {
      if (currentProxy) dead.add(currentProxy.key)
      logLine('Page failed to load through this exit')
      setStatus('error', { message: 'This exit could not load the page', error: 'navigation failed' })
      if (!rotating && Date.now() - lastRecoveryAt > 12000) {
        lastRecoveryAt = Date.now()
        startRotation()
      }
      return
    }
    state.browserUrl = url
    if (title) state.pageTitle = title
    broadcast('nav', { url, title })
    if (state.status === 'live') schedulePageExit()
  },
  onTitle({ url, title }) {
    if (!url || url.startsWith('chrome-error://') || url.startsWith('about:neterror')) return
    state.browserUrl = url
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

function applyPageExit(observed, sourceUrl) {
  if (!observed?.ip || !currentProxy) return
  if (state.browserUrl !== sourceUrl) return
  const changed = observed.ip !== currentProxy.ip
  const country = observed.country || currentProxy.country
  let code = observed.code || currentProxy.code
  if (observed.country && observed.country !== currentProxy.country) {
    code = observed.code || countryCode(observed.country) || ''
  }
  currentProxy = {
    ...currentProxy,
    ip: observed.ip,
    country,
    code
  }
  currentProxy.flag = code ? flagFromCode(code) : '🌐'
  state.ip = observed.ip
  state.ipVerified = true
  if (changed) state.exitRotating = true
  const entry = history[0]
  if (entry && entry.host === currentProxy.host && entry.port === currentProxy.port) entry.exitIp = observed.ip
  logLine(`Page exit IP: ${observed.ip}${country ? ` · ${country}` : ''}${changed ? ' (rotated)' : ''}`)
  broadcast('status', publicState())
}

function schedulePageExit() {
  clearTimeout(exitRefreshTimer)
  const target = state.browserUrl
  exitRefreshTimer = setTimeout(async () => {
    if (rotating || state.status !== 'live' || !currentProxy) return
    if (state.browserUrl !== target) return
    const observed = await browser.readPageExit(3000)
    if (!observed?.ip) return
    if (browser.currentMode().url !== target) return
    applyPageExit(observed, target)
  }, 500)
  exitRefreshTimer.unref?.()
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
    rotating: Boolean(proxy.rotating),
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
    exitRotating: state.exitRotating,
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
      rotating: rotatingProxies.size,
      queued: Math.max(0, order.length - cursor)
    },
    history: history.slice(0, 8),
    auto: { enabled: state.auto.enabled, seconds: state.auto.seconds, nextAt: state.auto.nextAt },
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
  let index = verified.findIndex((proxy) => proxy.host !== lastProxy?.host && !rotatingProxies.has(proxy.key))
  if (index < 0) index = verified.findIndex((proxy) => proxy.host !== lastProxy?.host)
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
    while (attempt < 8) {
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
        const observed = info.url.includes('ip.me') ? await browser.readExitInfo(8000) : null
        const liveProxy = {
          ...proxy,
          ip: observed?.ip || proxy.ip,
          country: observed?.country || proxy.country,
          code: observed?.code || proxy.code,
          rotating: false
        }
        liveProxy.flag = liveProxy.code ? flagFromCode(liveProxy.code) : proxy.flag
        currentProxy = liveProxy
        lastProxy = proxy
        state.ip = liveProxy.ip
        state.ipVerified = Boolean(observed?.ip)
        state.exitRotating = false
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
        if (observed?.ip) {
          browser.probeExitIp(4500).then((probe) => {
            if (!probe || probe === observed.ip) return
            rotatingProxies.add(proxy.key)
            if (currentProxy?.host !== proxy.host || currentProxy?.port !== proxy.port) return
            currentProxy = { ...currentProxy, rotating: true }
            state.exitRotating = true
            const entry = history[0]
            if (entry?.host === proxy.host && entry?.port === proxy.port) entry.rotating = true
            logLine(`↻ ${proxy.country} gateway rotates egress IPs`)
            broadcast('status', publicState())
          }).catch(() => {})
        } else {
          schedulePageExit()
        }
        return { ok: true, proxy: publicProxy(liveProxy) }
      } catch (error) {
        dead.add(proxy.key)
        logLine(`✕ ${proxy.country} ${proxy.host}:${proxy.port} — ${short(error.message)}`)
        setStatus('retrying', { message: 'Exit failed, switching node…' })
        await sleep(150)
      }
    }
    setStatus('error', { message: 'Could not open a browser session', error: 'all attempts failed' })
    logLine('Could not open a browser session after 8 attempts')
    return { ok: false, reason: 'failed' }
  } finally {
    rotating = false
    broadcast('status', publicState())
  }
}

let autoTimer = null

function scheduleAuto() {
  clearInterval(autoTimer)
  autoTimer = null
  if (!state.auto.enabled) {
    state.auto.nextAt = 0
    return
  }
  const delay = Math.max(10, state.auto.seconds) * 1000
  state.auto.nextAt = Date.now() + delay
  autoTimer = setInterval(() => {
    state.auto.nextAt = Date.now() + delay
    if (!rotating) startRotation()
    broadcast('status', publicState())
  }, delay)
}

function setAuto(enabled, seconds) {
  const nextSeconds = Number(seconds)
  if (Number.isFinite(nextSeconds)) state.auto.seconds = Math.max(10, Math.min(300, Math.round(nextSeconds)))
  state.auto.enabled = Boolean(enabled)
  scheduleAuto()
  logLine(state.auto.enabled ? `Auto-rotate on · every ${state.auto.seconds}s` : 'Auto-rotate off')
  broadcast('status', publicState())
}

function startRotation() {
  rotate().catch((error) => {
    rotating = false
    logLine(`Rotation error: ${short(error.message)}`)
    setStatus('error', { message: 'Rotation failed', error: short(error.message) })
  })
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

function wsFrame(buffer) {
  const length = buffer.length
  let header
  if (length < 126) {
    header = Buffer.alloc(2)
    header[1] = length
  } else if (length < 65536) {
    header = Buffer.alloc(4)
    header[1] = 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 127
    header.writeBigUInt64BE(BigInt(length), 2)
  }
  header[0] = 0x82
  return Buffer.concat([header, buffer])
}

function wsSendBinary(socket, buffer) {
  try {
    socket.write(wsFrame(buffer))
  } catch {
    frameClients.delete(socket)
  }
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
      res.frames = url.searchParams.get('frames') === '1'
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
      startRotation()
      sendJson(res, 202, { ok: true, accepted: true })
      return
    }
    if (url.pathname === '/api/auto' && req.method === 'POST') {
      const body = await readBody(req)
      setAuto(body.enabled, body.seconds)
      sendJson(res, 200, { ok: true, auto: { enabled: state.auto.enabled, seconds: state.auto.seconds, nextAt: state.auto.nextAt } })
      return
    }
    if (url.pathname === '/api/navigate' && req.method === 'POST') {
      const body = await readBody(req)
      let result
      try {
        result = await browser.navigate(body.url)
      } catch (error) {
        if (currentProxy) dead.add(currentProxy.key)
        setStatus('error', { message: 'This exit could not load the page', error: short(error.message) })
        sendJson(res, 502, { ok: false, error: 'navigation failed' })
        return
      }
      state.browserUrl = result.url
      if (result.title) state.pageTitle = result.title
      schedulePageExit()
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
      startRotation()
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

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

server.on('connection', (socket) => socket.setNoDelay(true))

server.on('upgrade', (req, socket) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  const key = req.headers['sec-websocket-key']
  if (pathname !== '/api/frames' || !key) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
    return
  }
  const accept = createHash('sha1').update(key + WS_GUID).digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  )
  socket.setNoDelay(true)
  frameClients.add(socket)
  const cleanup = () => frameClients.delete(socket)
  socket.on('close', cleanup)
  socket.on('error', cleanup)
  socket.on('end', cleanup)
  socket.on('data', (chunk) => {
    const opcode = chunk[0] & 0x0f
    if (opcode === 0x8) {
      try {
        socket.write(Buffer.from([0x88, 0x00]))
      } catch {}
      socket.end()
      cleanup()
    } else if (opcode === 0x9) {
      try {
        socket.write(Buffer.from([0x8a, 0x00]))
      } catch {}
    }
  })
  if (lastFrameData) wsSendBinary(socket, lastFrameData)
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
  startRotation()
})

function shutdown() {
  clearInterval(heartbeat)
  clearInterval(autoTimer)
  for (const client of clients) {
    try {
      client.end()
    } catch {}
  }
  for (const socket of frameClients) {
    try {
      socket.destroy()
    } catch {}
  }
  browser.close().finally(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

export { server }
