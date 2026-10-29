import path from 'node:path'
import { createRequire } from 'node:module'

const VIEWPORT = { width: 1280, height: 800 }
export const START_URL = 'https://ip.me/'

const IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/
const IP_CHECK_HOSTS = new Set([
  'ip.me',
  'showmyip.com',
  'whatismyipaddress.com',
  'ipinfo.io',
  'icanhazip.com',
  'ifconfig.me',
  'api.ipify.org',
  'ipify.org',
  'myip.com',
  'whatismyip.com',
  'ipchicken.com',
  'iplocation.net',
  'ipwho.is',
  'ipapi.co',
  'ip-api.com'
])

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

export function isIpCheckUrl(url) {
  const host = hostOf(url)
  if (!host) return false
  return IP_CHECK_HOSTS.has(host) || host.endsWith('.ip.me')
}

export async function loadPlaywright() {
  const home = process.env.HOME || ''
  const candidates = [
    path.join(home, '.local/share/omgithub-playwright/package.json'),
    path.join(process.cwd(), 'package.json')
  ]
  for (const base of candidates) {
    if (!base) continue
    try {
      const require = createRequire(base)
      return require('playwright')
    } catch {}
  }
  try {
    return await import('playwright')
  } catch {}
  throw new Error('Playwright is not available')
}


export class RemoteBrowser {
  constructor({ onFrame, onNav, onLog, onTitle }) {
    this.onFrame = onFrame || (() => {})
    this.onNav = onNav || (() => {})
    this.onLog = onLog || (() => {})
    this.onTitle = onTitle || (() => {})
    this.browser = null
    this.context = null
    this.page = null
    this.cdp = null
    this.startedAt = 0
    this.lastFrame = null
    this.frameCount = 0
    this.lastFrameAt = 0
    this._lastSent = 0
    this._closed = false
  }

  async launch() {
    if (this.browser?.isConnected()) return
    const { chromium } = await loadPlaywright()
    this.onLog('Launching Chromium engine…')
    this.browser = await chromium.launch({
      headless: true,
      timeout: 30000,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--lang=en-US',
        '--disable-features=Translate,AcceptCHFrame',
        '--window-size=1280,800'
      ]
    })
    this.browser.on('disconnected', () => {
      this.browser = null
      this.context = null
      this.page = null
      this.cdp = null
    })
    this.onLog(`Chromium ${this.browser.version()} ready`)
  }

  async open(proxy, url = START_URL) {
    await this.launch()
    const server = `${proxy.protocol}://${proxy.host}:${proxy.port}`
    this.onLog(`Opening ${server} (${proxy.country})`)
    const context = await this.browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
      ignoreHTTPSErrors: true,
      proxy: { server, bypass: '<-loopback>' }
    })
    let page
    try {
      page = await context.newPage()
      page.setDefaultTimeout(20000)
      await page.goto(url, { waitUntil: 'commit', timeout: 12000 })
      if (isErrorUrl(page.url())) throw new Error('proxy returned an error page')
    } catch (error) {
      await context.close().catch(() => {})
      throw error
    }
    await this._activate(context, page)
    return { url: page.url(), title: await page.title().catch(() => '') }
  }

  async _activate(context, page) {
    const previousContext = this.context
    const previousCdp = this.cdp
    const cdp = await context.newCDPSession(page)
    this.context = context
    this.page = page
    this.cdp = cdp
    this.startedAt = Date.now()
    this._bumpFrameClock()
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) this.onNav({ url: frame.url(), title: null })
    })
    page.on('load', () => {
      page.title().then((title) => this.onTitle({ url: page.url(), title })).catch(() => {})
    })
    cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      this.frameCount += 1
      this.lastFrameAt = Date.now()
      const frame = {
        data,
        width: VIEWPORT.width,
        height: VIEWPORT.height,
        url: this.page?.url() || '',
        at: this.lastFrameAt
      }
      this.lastFrame = frame
      const now = Date.now()
      if (now - this._lastSent >= 22) {
        this._lastSent = now
        this.onFrame(frame)
      }
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
    })
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 56,
      maxWidth: VIEWPORT.width,
      maxHeight: VIEWPORT.height,
      everyNthFrame: 1
    })
    if (previousCdp) previousCdp.detach().catch(() => {})
    if (previousContext && previousContext !== context) previousContext.close().catch(() => {})
    this.onNav({ url: page.url(), title: null })
  }

  _bumpFrameClock() {
    this._lastSent = 0
  }

  async readExitInfo(timeout = 6000) {
    const page = this.page
    if (!page || this._closed) return null
    try {
      await page.waitForFunction(
        () => {
          const el = document.querySelector('#ip-lookup')
          return Boolean(el && /^(?:\d{1,3}\.){3}\d{1,3}$/.test((el.value || '').trim()))
        },
        { timeout }
      )
      return await page.evaluate(() => {
        const el = document.querySelector('#ip-lookup')
        const ip = (el?.value || '').trim()
        const text = document.body?.innerText || ''
        const country = text.match(/Country:\s*([^\n]+)/)
        const code = text.match(/Country Code:\s*([A-Z]{2})/)
        return {
          ip,
          country: country ? country[1].trim() : '',
          code: code ? code[1].trim() : ''
        }
      })
    } catch {
      return null
    }
  }

  async probeExitIp(timeout = 7000) {
    if (!this.context || this._closed) return null
    let probe
    try {
      probe = await this.context.newPage()
      await probe.goto(`http://api.ipify.org/?format=json&t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
        timeout
      })
      const text = await probe.evaluate(() => document.body?.innerText || '')
      const match = text.match(IP_RE)
      return match ? match[0] : null
    } catch {
      return null
    } finally {
      await probe?.close().catch(() => {})
    }
  }

  async readPageExit(timeout = 3500) {
    const page = this.page
    if (!page || this._closed) return null
    const url = page.url()
    if (!isIpCheckUrl(url)) return null
    if (hostOf(url).endsWith('ip.me')) return this.readExitInfo(timeout)
    try {
      await page.waitForFunction(
        () => /(?:\d{1,3}\.){3}\d{1,3}/.test(document.body?.innerText || ''),
        { timeout }
      )
    } catch {}
    try {
      const info = await page.evaluate(() => {
        const clean = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim()
        const ipOf = (value) => {
          const match = String(value || '').match(
            /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/
          )
          return match ? match[0] : ''
        }
        const usable = (ip) => ip && ip !== '127.0.0.1' && !ip.startsWith('10.') && !ip.startsWith('192.168.')
        let ip = ''
        const candidates = [
          document.querySelector('#ipv4'),
          document.querySelector('#ip'),
          document.querySelector('.ip-address'),
          document.querySelector('[data-ip]'),
          document.querySelector('h1'),
          document.querySelector('h2')
        ]
        for (const el of candidates) {
          const found = ipOf(el?.textContent)
          if (usable(found)) {
            ip = found
            break
          }
        }
        if (!ip) {
          const found = ipOf(document.body?.innerText || '')
          if (usable(found)) ip = found
        }
        let country = ''
        let code = ''
        for (const row of document.querySelectorAll('tr')) {
          const cells = row.querySelectorAll('td, th')
          if (cells.length < 2) continue
          const label = clean(cells[0]).toLowerCase()
          if (label === 'country') country = clean(cells[1])
          if (label === 'country code') code = clean(cells[1]).toUpperCase()
          if (label === 'your ipv4' && !ip) {
            const found = ipOf(clean(cells[1]))
            if (usable(found)) ip = found
          }
        }
        return { ip, country, code }
      })
      if (!info?.ip) return null
      return info
    } catch {
      return null
    }
  }

  async closeSession() {
    const context = this.context
    this.context = null
    this.page = null
    this.cdp = null
    this.lastFrame = null
    this.frameCount = 0
    await context?.close().catch(() => {})
  }

  currentMode() {
    return {
      url: this.page?.url() || '',
      frames: this.frameCount,
      live: Boolean(this.lastFrame && Date.now() - this.lastFrameAt < 3000)
    }
  }

  async navigate(input) {
    if (!this.page) throw new Error('browser not ready')
    const url = normalizeUrl(input)
    this.onLog(`Navigating to ${url}`)
    const response = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 })
    if (isErrorUrl(this.page.url())) throw new Error('navigation failed through this exit')
    const title = await this.page.title().catch(() => '')
    this.onNav({ url: this.page.url(), title })
    return { url: this.page.url(), status: response?.status() || 0, title }
  }

  async goBack() {
    if (!this.page) return
    await this.page.goBack({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
  }

  async goForward() {
    if (!this.page) return
    await this.page.goForward({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
  }

  async reload() {
    if (!this.page) return
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {})
  }

  async handleInput(event) {
    const page = this.page
    if (!page || !event) return
    const clamp = (value, max) => Math.max(0, Math.min(max - 1, Number(value) || 0))
    const x = clamp(event.x, VIEWPORT.width)
    const y = clamp(event.y, VIEWPORT.height)
    try {
      switch (event.action) {
        case 'move':
          await page.mouse.move(x, y)
          break
        case 'down':
          await page.mouse.move(x, y)
          await page.mouse.down({ button: event.button || 'left', clickCount: 1 })
          break
        case 'up':
          await page.mouse.move(x, y)
          await page.mouse.up({ button: event.button || 'left', clickCount: 1 })
          break
        case 'click':
          await page.mouse.click(x, y, { button: event.button || 'left', clickCount: event.clickCount || 1 })
          break
        case 'wheel':
          await page.mouse.move(x, y)
          await page.mouse.wheel(Number(event.deltaX) || 0, Number(event.deltaY) || 0)
          break
        case 'type':
          if (event.text) await page.keyboard.type(String(event.text).slice(0, 512))
          break
        case 'insertText':
          if (event.text) await page.keyboard.insertText(String(event.text).slice(0, 512))
          break
        case 'press':
          if (event.key) await page.keyboard.press(String(event.key).slice(0, 64))
          break
        case 'keydown':
          if (event.key) await page.keyboard.down(String(event.key).slice(0, 64))
          break
        case 'keyup':
          if (event.key) await page.keyboard.up(String(event.key).slice(0, 64))
          break
        default:
          break
      }
    } catch (error) {
      console.error(`input ${event.action} failed: ${error.message}`)
    }
  }

  async close() {
    this._closed = true
    await this.context?.close().catch(() => {})
    await this.browser?.close().catch(() => {})
  }
}

export function isErrorUrl(url) {
  const value = String(url || '')
  return value.startsWith('chrome-error://') || value.startsWith('about:neterror')
}

export function normalizeUrl(input) {
  const raw = String(input || '').trim()
  if (!raw) return START_URL
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(raw)) return `https://${raw}`
  if (/^localhost(:\d+)?(\/.*)?$/i.test(raw)) return `http://${raw}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(raw)}`
}
