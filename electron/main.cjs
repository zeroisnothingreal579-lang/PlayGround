const { app, BrowserWindow, ipcMain, session, net } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const DEV_URL = process.env.VITE_DEV_SERVER_URL
const GUEST_PRELOAD = pathToFileURL(path.join(__dirname, 'guest-preload.cjs')).toString()
const IS_SMOKE = process.argv.includes('--smoke')
const IPLOCATE_KEY = process.env.IPLOCATE_API_KEY || ''
const PROXY_LIST_URL = process.env.STACKVIEW_PROXY_LIST_URL || ''

process.env.STACKVIEW_GUEST_PRELOAD = GUEST_PRELOAD

const credentials = new Map()
const allowedHosts = String(process.env.STACKVIEW_ALLOWED_HOSTS || '')
  .split(',')
  .map(host => host.trim().toLowerCase())
  .filter(Boolean)

function isAllowed(rawUrl) {
  if (!allowedHosts.length) return true
  try {
    const url = new URL(rawUrl)
    if (url.protocol === 'file:' || url.protocol === 'about:') return true
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return allowedHosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`))
  } catch {
    return false
  }
}

function normalizeProxyList(body) {
  let entries = []
  const text = String(body || '').trim()

  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const data = JSON.parse(text)
      const rows = Array.isArray(data)
        ? data
        : data.proxies || data.proxylist || data.results || data.data || []
      entries = rows.map(row => {
        if (typeof row === 'string') return row
        if (!row) return null
        const host = row.ip || row.host || row.server
        const port = row.port
        if (!host || !port) return null
        return `${row.protocol || row.scheme || 'http'}://${host}:${port}`
      })
    } catch {
      entries = text.split(/[\n,]+/)
    }
  } else {
    entries = text.split(/[\n,]+/)
  }

  const seen = new Set()
  const pool = []
  for (const entry of entries) {
    if (!entry || typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
    try {
      const url = new URL(withScheme)
      if (!url.hostname || !url.port) continue
      const normalized = `${url.protocol}//${url.hostname}:${url.port}`
      if (seen.has(normalized)) continue
      seen.add(normalized)
      pool.push(normalized)
    } catch {}
  }
  return pool
}

function fetchProxyPool(url) {
  return new Promise(resolve => {
    let settled = false
    const finish = list => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(list)
    }
    const timer = setTimeout(() => {
      try { request.abort() } catch {}
      finish([])
    }, 15000)

    let request
    try {
      request = net.request(url)
    } catch {
      finish([])
      return
    }

    let body = ''
    request.on('response', response => {
      response.on('data', chunk => { body += chunk })
      response.on('end', () => finish(normalizeProxyList(body)))
    })
    request.on('error', () => finish([]))
    request.end()
  })
}

function parseProxy(template, { sessionId, region, country = 'us' }) {
  const raw = String(template || '').trim()
  if (!raw) return null

  const expanded = raw
    .replaceAll('{session}', encodeURIComponent(sessionId || ''))
    .replaceAll('{region}', encodeURIComponent(region || ''))
    .replaceAll('{country}', encodeURIComponent(country))

  let url
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(expanded) ? expanded : `http://${expanded}`)
  } catch {
    return { error: 'Invalid proxy template. Use e.g. http://user:pass@host:port' }
  }

  if (!/^(http|https|socks4|socks5):$/.test(url.protocol)) {
    return { error: `Unsupported proxy scheme ${url.protocol}` }
  }

  const username = decodeURIComponent(url.username || '')
  const password = decodeURIComponent(url.password || '')
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  const rules = `${url.protocol}//${url.hostname}:${port}`

  return {
    rules,
    username,
    password,
    label: `${url.hostname}:${port}`
  }
}

async function applyProxy(partition, template, options) {
  const ses = session.fromPartition(partition)
  const parsed = parseProxy(template, options)

  if (parsed?.error) return { ok: false, error: parsed.error }
  if (!parsed) {
    credentials.delete(ses)
    await ses.setProxy({ mode: 'direct' })
    try { await ses.closeAllConnections() } catch {}
    return { ok: true, mode: 'direct' }
  }

  credentials.set(ses, { username: parsed.username, password: parsed.password })
  await ses.setProxy({ proxyRules: parsed.rules, proxyBypassRules: '<-loopback>' })
  try { await ses.closeAllConnections() } catch {}
  return { ok: true, mode: 'proxy', endpoint: parsed.label }
}

async function verifyThrough(partition) {
  const ses = session.fromPartition(partition)
  const started = Date.now()

  return new Promise(resolve => {
    let settled = false
    let timer = null
    const finish = payload => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(payload)
    }

    const lookupUrl = IPLOCATE_KEY
      ? `https://iplocate.io/api/lookup?apikey=${encodeURIComponent(IPLOCATE_KEY)}`
      : 'https://ipinfo.io/json'

    const request = net.request({
      url: lookupUrl,
      session: ses,
      useSessionCookies: false
    })

    let body = ''
    request.on('response', response => {
      response.on('data', chunk => { body += chunk })
      response.on('end', () => {
        try {
          const data = JSON.parse(body)
          if (data.error) {
            finish({ ok: false, error: String(data.error) })
            return
          }
          finish({
            ok: true,
            ms: Date.now() - started,
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
          })
        } catch {
          finish({ ok: false, error: 'Could not parse IP lookup response' })
        }
      })
    })
    request.on('error', error => finish({ ok: false, error: error.message }))
    timer = setTimeout(() => {
      try { request.abort() } catch {}
      finish({ ok: false, error: 'Verification timed out' })
    }, 15000)
    request.end()
  })
}

app.on('login', (event, webContents, details, authInfo, callback) => {
  if (!authInfo.isProxy) return
  const stored = credentials.get(webContents.session)
  if (!stored) return
  event.preventDefault()
  callback(stored.username, stored.password)
})

function hardenGuest(contents) {
  contents.on('will-navigate', (event, url) => {
    if (!isAllowed(url)) {
      event.preventDefault()
      contents.send('sv:blocked', url)
    }
  })
  contents.setWindowOpenHandler(({ url }) => (isAllowed(url) ? { action: 'allow' } : { action: 'deny' }))
  contents.on('will-redirect', (event, url) => {
    if (!isAllowed(url)) event.preventDefault()
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    backgroundColor: '#070b14',
    title: 'StackView',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  })

  if (DEV_URL) win.loadURL(DEV_URL)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  return win
}

const loadedWebviews = []
const guestContents = []

app.whenReady().then(async () => {
  if (PROXY_LIST_URL && !process.env.STACKVIEW_PROXY_LIST) {
    const fetched = await fetchProxyPool(PROXY_LIST_URL)
    if (fetched.length) {
      process.env.STACKVIEW_PROXY_LIST = fetched.join('\n')
      console.log(`[proxy] loaded ${fetched.length} proxies from list URL`)
    } else {
      console.log('[proxy] list URL returned no usable proxies')
    }
  }

  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return
    hardenGuest(contents)
    if (IS_SMOKE) {
      guestContents.push(contents)
      contents.on('did-finish-load', () => loadedWebviews.push(contents.getURL()))
    }
  })

  ipcMain.handle('sv:proxy:set', (_event, payload = {}) => {
    return applyProxy(payload.partition, payload.proxyUrl || payload.template, {
      sessionId: payload.sessionId,
      region: payload.region,
      country: payload.country || 'us'
    })
  })

  ipcMain.handle('sv:proxy:clear', async (_event, partition) => {
    const ses = session.fromPartition(partition)
    credentials.delete(ses)
    await ses.setProxy({ mode: 'direct' })
    try { await ses.closeAllConnections() } catch {}
    return { ok: true }
  })

  ipcMain.handle('sv:proxy:verify', (_event, partition) => verifyThrough(partition))

  ipcMain.handle('sv:open-standalone', (_event, payload = {}) => {
    if (!payload.url || !isAllowed(payload.url)) return { ok: false, error: 'URL not allowed' }
    const child = new BrowserWindow({
      width: 1180,
      height: 820,
      backgroundColor: '#070b14',
      webPreferences: {
        partition: payload.partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    child.loadURL(payload.url)
    return { ok: true }
  })

  const mainWindow = createWindow()

  if (IS_SMOKE) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        let webviewCount = 0
        try {
          webviewCount = await mainWindow.webContents.executeJavaScript('document.querySelectorAll("webview").length')
        } catch {}
        const direct = await verifyThrough('persist:smoke-direct')
        const pane = await verifyThrough('persist:w1')
        const pane2 = await verifyThrough('persist:w2')
        const pane3 = await verifyThrough('persist:w3')
        let sync = null
        if (process.env.STACKVIEW_SMOKE_SYNC) {
          const guests = guestContents.filter(item => !item.isDestroyed() && /^https?:/i.test(item.getURL()))
          if (guests.length >= 2) {
            await guests[0].executeJavaScript(`(function(){const q=document.querySelector('input');if(q){q.value='mirrored';q.dispatchEvent(new Event('input',{bubbles:true}))}window.scrollTo(0,500)})()`).catch(() => {})
            await new Promise(resolve => setTimeout(resolve, 1200))
            const after = await Promise.all(guests.map(item => item.executeJavaScript(`({y:Math.round(window.scrollY),value:(document.querySelector('input')||{}).value||''})`).catch(() => null)))
            sync = { guests: guests.length, after }
          }
        }
        if (process.env.STACKVIEW_SMOKE_SHOT) {
          try {
            const image = await mainWindow.webContents.capturePage()
            require('node:fs').writeFileSync(process.env.STACKVIEW_SMOKE_SHOT, image.toPNG())
            console.log('SMOKE_SHOT', process.env.STACKVIEW_SMOKE_SHOT)
          } catch (error) {
            console.log('SMOKE_SHOT_ERROR', error.message)
          }
        }
        console.log('SMOKE_RESULT', JSON.stringify({
          webviewCount,
          loadedWebviews,
          directVerify: direct.ok ? { ip: direct.ip, country: direct.country, ms: direct.ms } : direct,
          paneVerify: pane.ok ? { ip: pane.ip, country: pane.country, ms: pane.ms } : pane,
          pane2Verify: pane2.ok ? { ip: pane2.ip, country: pane2.country, ms: pane2.ms } : pane2,
          pane3Verify: pane3.ok ? { ip: pane3.ip, country: pane3.country, ms: pane3.ms } : pane3,
          sync,
          allowedHosts
        }))
        app.exit(0)
      }, 7000)
    })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
