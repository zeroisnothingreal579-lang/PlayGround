const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn, execFileSync } = require('node:child_process')
const { WebSocket, WebSocketServer } = require('ws')
const { parseProxyUrl, startRelay } = require('./relay.cjs')

const PORT = Number(process.env.PORT || 3000)
const DIST = path.resolve(__dirname, '..', 'dist')
const VIEWPORT = { width: 1280, height: 720 }
const ACCESS_TOKEN = process.env.STACKVIEW_ACCESS_TOKEN || ''
const IPLOCATE_KEY = process.env.IPLOCATE_API_KEY || ''
const MAX_PANES = Number(process.env.STACKVIEW_MAX_PANES || 8)
const ALLOWED_HOSTS = String(process.env.STACKVIEW_ALLOWED_HOSTS || '')
  .split(',')
  .map(host => host.trim().toLowerCase())
  .filter(Boolean)
const PROXY_TEMPLATE = String(process.env.STACKVIEW_PROXY_TEMPLATE || '').trim()
const PROXY_LIST = []
const PROXY_SOURCES = [process.env.STACKVIEW_PROXY_LIST, process.env.STACKVIEW_PROXY_LIST_URL].filter(Boolean)

function hashId(value) {
  let hash = 0
  for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash
}

function expandProxy(template, paneId, sessionSeq) {
  return String(template || '')
    .replaceAll('{session}', `${paneId}-${sessionSeq || 0}`)
    .replaceAll('{region}', 'us')
    .replaceAll('{country}', 'us')
}

function proxyForPane(proxyHint, paneId, sessionSeq) {
  const hint = String(proxyHint || '').trim()
  if (hint) return expandProxy(hint, paneId, sessionSeq)
  if (PROXY_LIST.length) return PROXY_LIST[(hashId(paneId) + Number(sessionSeq || 0)) % PROXY_LIST.length]
  return expandProxy(PROXY_TEMPLATE, paneId, sessionSeq)
}

async function loadProxyList() {
  if (!PROXY_SOURCES.length) return
  for (const source of PROXY_SOURCES) {
    try {
      let text
      if (/^https?:\/\//i.test(source)) {
        const response = await fetch(source, { signal: AbortSignal.timeout(12000) })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        text = await response.text()
      } else if (fs.existsSync(source)) {
        text = fs.readFileSync(source, 'utf8')
      } else {
        text = source
      }
      const entries = String(text)
        .split(/[\s,]+/)
        .map(item => item.trim())
        .filter(item => /^(https?|socks5h?):\/\/[^\s]+$/.test(item))
      if (!entries.length) continue
      PROXY_LIST.length = 0
      PROXY_LIST.push(...[...new Set(entries)])
      console.log(`[stackview] loaded ${PROXY_LIST.length} proxies`)
      return
    } catch (error) {
      console.warn(`[stackview] proxy source failed: ${error.message}`)
    }
  }
}

function findChrome() {
  const candidates = [process.env.CHROME_BIN, 'chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'].filter(Boolean)
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' })
      return bin
    } catch {}
  }
  return null
}

const CHROME = findChrome()

function isPrivateHost(host) {
  const value = host.toLowerCase()
  if (value === 'localhost' || value.endsWith('.localhost') || value.endsWith('.local')) return true
  if (value === '::1' || value === '[::1]') return true
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80')) return true
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return false
  const [a, b] = [Number(match[1]), Number(match[2])]
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

function safeUrl(raw) {
  let url
  try {
    url = new URL(String(raw || '').trim())
  } catch {
    throw new Error('Enter a valid http(s) URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http(s) URLs are supported')
  const host = url.hostname.toLowerCase()
  if (isPrivateHost(host) && !ALLOWED_HOSTS.includes(host)) throw new Error('Private/loopback hosts are blocked')
  if (ALLOWED_HOSTS.length && !ALLOWED_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`))) {
    throw new Error(`${host} is not in STACKVIEW_ALLOWED_HOSTS`)
  }
  return url.href
}

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.id = 0
    this.pending = new Map()
    this.listeners = new Map()
    this.ws = null
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl, { maxPayload: 64 * 1024 * 1024 })
      this.ws = ws
      const timer = setTimeout(() => {
        ws.terminate()
        reject(new Error('CDP connection timed out'))
      }, 15000)

      ws.on('open', () => {
        clearTimeout(timer)
        resolve()
      })
      ws.on('message', raw => {
        let message
        try {
          message = JSON.parse(raw.toString())
        } catch {
          return
        }
        if (message.id && this.pending.has(message.id)) {
          const { resolve: done, reject: fail } = this.pending.get(message.id)
          this.pending.delete(message.id)
          if (message.error) fail(new Error(message.error.message || 'CDP error'))
          else done(message.result)
          return
        }
        if (message.method) {
          const handlers = this.listeners.get(message.method) || []
          handlers.forEach(handler => handler(message.params))
        }
      })
      ws.on('error', error => {
        clearTimeout(timer)
        reject(error)
      })
      ws.on('close', () => {
        for (const { reject: fail } of this.pending.values()) fail(new Error('CDP closed'))
        this.pending.clear()
      })
    })
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('CDP socket is not open'))
        return
      }
      const id = ++this.id
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP ${method} timed out`))
      }, 20000)
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value) },
        reject: error => { clearTimeout(timer); reject(error) }
      })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, handler) {
    const list = this.listeners.get(method) || []
    list.push(handler)
    this.listeners.set(method, list)
  }

  close() {
    try { this.ws?.close() } catch {}
  }
}

function waitForDevtools(proc) {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(() => reject(new Error('Chromium did not start in time')), 25000)
    proc.stderr.on('data', chunk => {
      buffer += chunk.toString()
      const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
    proc.once('exit', code => {
      clearTimeout(timer)
      reject(new Error(`Chromium exited early (code ${code})`))
    })
  })
}

async function pageTarget(baseUrl, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`${baseUrl}/json/list`)).json()
      const page = list.find(target => target.type === 'page' && target.webSocketDebuggerUrl)
      if (page) return page
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Chromium page target not available')
}

function proxyArguments(rawProxy) {
  const parsed = parseProxyUrl(rawProxy)
  if (!parsed) return Promise.resolve({ args: [], relay: null })
  if (parsed.username || parsed.password) {
    return startRelay(parsed).then(relay => ({
      args: [`--proxy-server=http://127.0.0.1:${relay.port}`],
      relay
    }))
  }
  const scheme = parsed.protocol === 'socks5h' ? 'socks5' : parsed.protocol
  return Promise.resolve({ args: [`--proxy-server=${scheme}://${parsed.host}:${parsed.port}`], relay: null })
}

const VK = {
  Enter: 13, Backspace: 8, Tab: 9, Escape: 27, Delete: 46,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Home: 36, End: 35, PageUp: 33, PageDown: 34, ' ': 32
}

class Pane {
  constructor(paneId, socket, options) {
    this.id = paneId
    this.socket = socket
    this.url = options.url
    this.proxy = options.proxy || ''
    this.proc = null
    this.cdp = null
    this.relay = null
    this.profile = null
    this.baseUrl = ''
    this.stopped = false
    this.lastFrame = 0
    this.frameKey = Number(options.frameKey) || 0
  }

  send(payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify(payload))
  }

  state(state, message) {
    this.send({ type: 'state', paneId: this.id, state, message, viewport: VIEWPORT })
  }

  async start() {
    const target = safeUrl(this.url)
    this.state('starting')
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stackview-'))
    const proxy = await proxyArguments(this.proxy)
    this.relay = proxy.relay

    const args = [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-features=Translate,MediaRouter',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      `--user-data-dir=${this.profile}`,
      '--remote-debugging-port=0',
      ...proxy.args,
      'about:blank'
    ]

    this.proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    this.proc.on('exit', () => {
      if (!this.stopped) this.state('error', 'Browser process exited')
    })

    const browserWs = await waitForDevtools(this.proc)
    const wsUrl = new URL(browserWs)
    this.baseUrl = `http://${wsUrl.hostname}:${wsUrl.port}`
    const page = await pageTarget(this.baseUrl)

    this.cdp = new CDP(page.webSocketDebuggerUrl)
    await this.cdp.connect()

    this.cdp.on('Page.screencastFrame', params => {
      this.cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {})
      if (Date.now() - this.lastFrame < 40) return
      this.lastFrame = Date.now()
      if (this.socket?.bufferedAmount > 4_000_000) return
      this.send({
        type: 'frame',
        paneId: this.id,
        data: params.data,
        width: params.metadata?.deviceWidth || VIEWPORT.width,
        height: params.metadata?.deviceHeight || VIEWPORT.height
      })
    })

    this.cdp.on('Page.frameNavigated', params => {
      if (params.frame?.parentId) return
      const url = params.frame?.url
      if (url && /^https?:/i.test(url)) {
        this.url = url
        this.send({ type: 'nav', paneId: this.id, url })
      }
    })

    this.cdp.on('Page.navigatedWithinDocument', params => {
      const url = params.url
      if (url && /^https?:/i.test(url)) {
        this.url = url
        this.send({ type: 'nav', paneId: this.id, url })
      }
    })

    this.cdp.on('Page.loadEventFired', () => this.state('live'))

    this.cdp.on('Page.javascriptDialogOpening', () => {
      this.cdp.send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {})
    })

    this.cdp.on('Inspector.targetCrashed', () => this.state('error', 'Page crashed'))

    await this.cdp.send('Page.enable')
    await this.cdp.send('Runtime.enable')
    await this.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: 1,
      mobile: false
    })
    await this.cdp.send('Page.navigate', { url: target })
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 55,
      maxWidth: VIEWPORT.width,
      maxHeight: VIEWPORT.height,
      everyNthFrame: 1
    })
  }

  async navigate(rawUrl) {
    const url = safeUrl(rawUrl)
    this.url = url
    if (!this.cdp) return
    await this.cdp.send('Page.navigate', { url })
  }

  async reload() {
    if (!this.cdp) return
    await this.cdp.send('Page.reload', { ignoreCache: true })
  }

  async input(event) {
    if (!this.cdp || !event) return
    const x = Math.max(0, Math.min(VIEWPORT.width, Number(event.x) || 0))
    const y = Math.max(0, Math.min(VIEWPORT.height, Number(event.y) || 0))

    if (event.kind === 'mouse') {
      const type = event.action === 'down' ? 'mousePressed' : event.action === 'up' ? 'mouseReleased' : 'mouseMoved'
      await this.cdp.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: event.action === 'move' ? 'none' : 'left',
        buttons: event.action === 'down' ? 1 : 0,
        clickCount: event.action === 'move' ? 0 : 1
      })
      return
    }

    if (event.kind === 'wheel') {
      await this.cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x,
        y,
        deltaX: Number(event.deltaX) || 0,
        deltaY: Number(event.deltaY) || 0
      })
      return
    }

    if (event.kind === 'key') {
      const isDown = event.action === 'down'
      const printable = isDown && typeof event.text === 'string' && event.text.length === 1
      await this.cdp.send('Input.dispatchKeyEvent', {
        type: isDown ? 'keyDown' : 'keyUp',
        key: event.key || '',
        code: event.code || '',
        modifiers: Number(event.modifiers) || 0,
        text: printable ? event.text : undefined,
        unmodifiedText: printable ? event.text : undefined,
        windowsVirtualKeyCode: VK[event.key] || 0,
        nativeVirtualKeyCode: VK[event.key] || 0
      })
    }
  }

  async verify() {
    if (!CHROME) throw new Error('Chromium is not available on this server')
    if (!this.baseUrl) throw new Error('Pane is not running')

    const create = await fetch(`${this.baseUrl}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/blank.html`)}`, { method: 'PUT' })
    const target = await create.json()
    if (!target?.webSocketDebuggerUrl) throw new Error('Could not open lookup tab')

    const cdp = new CDP(target.webSocketDebuggerUrl)
    try {
      await cdp.connect()
      await cdp.send('Runtime.enable')
      const lookupUrl = IPLOCATE_KEY
        ? `https://iplocate.io/api/lookup?apikey=${encodeURIComponent(IPLOCATE_KEY)}`
        : 'https://ipinfo.io/json'
      const expression = `Promise.race([
        fetch(${JSON.stringify(lookupUrl)}, { cache: 'no-store' }).then(r => r.json()),
        new Promise((_, reject) => setTimeout(() => reject(new Error('lookup timed out')), 15000))
      ])`
      const evaluation = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      })
      if (evaluation.exceptionDetails) {
        throw new Error(evaluation.exceptionDetails.text || 'Lookup failed')
      }
      const data = evaluation.result?.value || {}
      if (data.error) throw new Error(String(data.error))
      return {
        ok: true,
        ms: 0,
        ip: data.ip,
        city: data.city || '',
        region: data.region || data.subdivision || '',
        country: data.country_code || data.country || '',
        org: data.org || data.asn?.name || '',
        isProxy: Boolean(data.privacy?.is_proxy),
        isVpn: Boolean(data.privacy?.is_vpn),
        isHosting: Boolean(data.privacy?.is_hosting),
        isAbuser: Boolean(data.privacy?.is_abuser),
        provider: IPLOCATE_KEY ? 'iplocate' : 'ipinfo'
      }
    } finally {
      cdp.close()
      fetch(`${this.baseUrl}/json/close/${target.id}`).catch(() => {})
    }
  }

  async stop() {
    if (this.stopped) return
    this.stopped = true
    try { await this.cdp?.send('Page.stopScreencast') } catch {}
    this.cdp?.close()
    try { this.proc?.kill('SIGKILL') } catch {}
    try { await this.relay?.close() } catch {}
    if (this.profile) {
      try { fs.rmSync(this.profile, { recursive: true, force: true }) } catch {}
    }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
}

function sendFile(res, file) {
  const ext = path.extname(file).toLowerCase()
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable'
  })
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer((req, res) => {
  if (req.url === '/live/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ ok: Boolean(CHROME), browser: CHROME || null, panes: panes.size, proxies: PROXY_LIST.length, template: Boolean(PROXY_TEMPLATE) }))
    return
  }

  if (req.url === '/blank.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end('<!doctype html><meta charset="utf-8"><title>lookup</title><body></body>')
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname)
  } catch {
    pathname = '/'
  }
  if (pathname === '/') pathname = '/index.html'

  const file = path.resolve(DIST, `.${pathname}`)
  if (!file.startsWith(DIST)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    sendFile(res, file)
    return
  }

  if (!path.extname(file)) {
    const fallback = path.join(DIST, 'index.html')
    if (fs.existsSync(fallback)) {
      sendFile(res, fallback)
      return
    }
  }

  res.writeHead(404)
  res.end('Not found')
})

const panes = new Map()
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 })

server.on('upgrade', (req, socket, head) => {
  let pathname
  try {
    pathname = new URL(req.url, 'http://local').pathname
  } catch {
    socket.destroy()
    return
  }
  if (pathname !== '/live') {
    socket.destroy()
    return
  }
  if (ACCESS_TOKEN) {
    const token = new URL(req.url, 'http://local').searchParams.get('token')
    if (token !== ACCESS_TOKEN) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
})

wss.on('connection', ws => {
  const owned = new Map()

  ws.send(JSON.stringify({ type: 'hello', viewport: VIEWPORT, browser: Boolean(CHROME) }))

  ws.on('message', async raw => {
    let message
    try {
      message = JSON.parse(raw.toString())
    } catch {
      return
    }
    const paneId = message.paneId

    try {
      if (message.type === 'start') {
        if (!paneId) return
        if (!CHROME) throw new Error('Chromium is not installed on the server')
        if (owned.size >= MAX_PANES && !owned.has(paneId)) throw new Error('Too many panes')

        const proxy = proxyForPane(message.proxy, paneId, message.sessionSeq)
        const url = safeUrl(message.url)
        const frameKey = Number(message.frameKey) || 0
        const existing = owned.get(paneId)

        if (existing && existing.proxy === proxy) {
          if (existing.url !== url) {
            await existing.navigate(url)
          } else if (existing.frameKey !== frameKey) {
            existing.frameKey = frameKey
            await existing.reload()
          }
          return
        }

        if (existing) {
          await existing.stop()
          owned.delete(paneId)
          panes.delete(paneId)
        }

        const pane = new Pane(paneId, ws, { url, proxy, frameKey })
        owned.set(paneId, pane)
        panes.set(paneId, pane)
        await pane.start()
        return
      }

      if (message.type === 'navigate') {
        const pane = owned.get(paneId)
        if (pane) await pane.navigate(message.url)
        return
      }

      if (message.type === 'input') {
        const targets = Array.isArray(message.targets) ? message.targets : [paneId]
        for (const id of targets) {
          const pane = owned.get(id) || panes.get(id)
          if (pane) pane.input(message.event).catch(() => {})
        }
        return
      }

      if (message.type === 'verify') {
        const pane = owned.get(paneId)
        if (!pane) throw new Error('Pane is not running')
        const result = await pane.verify()
        ws.send(JSON.stringify({ type: 'verify', paneId, requestId: message.requestId, ...result }))
        return
      }

      if (message.type === 'stop') {
        const pane = owned.get(paneId)
        if (pane) {
          await pane.stop()
          owned.delete(paneId)
          panes.delete(paneId)
        }
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'state',
        paneId,
        state: 'error',
        message: error.message,
        viewport: VIEWPORT
      }))
      if (message.type === 'verify') {
        ws.send(JSON.stringify({ type: 'verify', paneId, requestId: message.requestId, ok: false, error: error.message }))
      }
    }
  })

  ws.on('close', () => {
    for (const pane of owned.values()) {
      pane.stop().catch(() => {})
      panes.delete(pane.id)
    }
    owned.clear()
  })
})

async function main() {
  await loadProxyList()
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[stackview] listening on 0.0.0.0:${PORT}`)
    console.log(`[stackview] chromium: ${CHROME || 'NOT FOUND'}`)
    console.log(`[stackview] allowlist: ${ALLOWED_HOSTS.length ? ALLOWED_HOSTS.join(', ') : 'all public hosts'}`)
    console.log(`[stackview] proxies: ${PROXY_LIST.length}${PROXY_TEMPLATE ? ' + template' : ''}`)
  })
}

function shutdown() {
  for (const pane of panes.values()) pane.stop().catch(() => {})
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

main().catch(error => {
  console.error(`[stackview] failed to start: ${error.message}`)
  process.exit(1)
})
