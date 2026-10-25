import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { config, browserExecutable } from './config.js'
import { analyzeWithAi } from './ai.js'
import { assertSafeUrl, quickBlockedHost } from './security.js'
import type { AdObservation, PageSignals } from './types.js'

const AD_NETWORKS: { name: string; pattern: RegExp }[] = [
  { name: 'Google Ads', pattern: /(^|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice\.google\.)/i },
  { name: 'Amazon Ads', pattern: /(^|\.)amazon-adsystem\.com$/i },
  { name: 'Criteo', pattern: /(^|\.)criteo\.(com|net)$/i },
  { name: 'Taboola', pattern: /(^|\.)taboola\.com$/i },
  { name: 'Outbrain', pattern: /(^|\.)outbrain\.com$/i },
  { name: 'Media.net', pattern: /(^|\.)media\.net$/i },
  { name: 'Adsterra', pattern: /(^|\.)adsterra\.com$/i },
  { name: 'PropellerAds', pattern: /(^|\.)(propellerads|propellerclick|onclickads)\./i },
  { name: 'PopAds', pattern: /(^|\.)popads\.net$/i },
  { name: 'Monetag', pattern: /(^|\.)(monetag|monetiz\.)\./i },
  { name: 'ExoClick', pattern: /(^|\.)exoclick\.com$/i },
  { name: 'JuicyAds', pattern: /(^|\.)juicyads\.com$/i },
  { name: 'Revcontent', pattern: /(^|\.)revcontent\.com$/i },
  { name: 'MGID', pattern: /(^|\.)mgid\.com$/i },
  { name: 'Ezoic', pattern: /(^|\.)ezoic\.net$/i },
  { name: 'AdThrive', pattern: /(^|\.)adthrive\.com$/i },
  { name: 'PubMatic', pattern: /(^|\.)pubmatic\.com$/i },
  { name: 'OpenX', pattern: /(^|\.)openx\.net$/i },
  { name: 'Rubicon', pattern: /(^|\.)rubiconproject\.com$/i },
  { name: 'Index Exchange', pattern: /(^|\.)indexexchange\.com$/i },
  { name: 'Sovrn', pattern: /(^|\.)sovrn\.com$/i },
  { name: 'ShareThrough', pattern: /(^|\.)sharethrough\.com$/i },
  { name: 'AdCash', pattern: /(^|\.)adcash\.com$/i },
  { name: 'HilltopAds', pattern: /(^|\.)hilltopads\.net$/i },
]

interface RawAdCandidate {
  selector: string
  text: string
  tag: string
  format: string
  confidence: 'low' | 'medium' | 'high'
  width: number
  height: number
  visible: boolean
  fixed: boolean
  networkHint: string | null
}

interface RawPageScan {
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
  adCandidates: RawAdCandidate[]
  iframeNetworks: string[]
}

export interface BrowserInspection {
  page: PageSignals
  aiSummary: string
  aiMode: 'llm' | 'heuristic'
}

export class BrowserManager {
  private browser: Browser | null = null
  private launching: Promise<Browser> | null = null

  get available(): boolean {
    return Boolean(browserExecutable) && config.automationEnabled
  }

  async getBrowser(): Promise<Browser> {
    if (!browserExecutable) throw new Error('No Chromium executable configured.')
    if (this.browser?.isConnected()) return this.browser
    if (this.launching) return this.launching
    this.launching = chromium
      .launch({
        executablePath: browserExecutable,
        headless: true,
        timeout: 45_000,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-background-networking',
          '--disable-component-update',
          '--mute-audio',
          '--disable-features=Translate,BackForwardCache',
        ],
      })
      .then((browser) => {
        this.browser = browser
        this.launching = null
        browser.on('disconnected', () => {
          this.browser = null
        })
        console.log('[browser] Chromium launched')
        return browser
      })
      .catch((error) => {
        this.launching = null
        throw error
      })
    return this.launching
  }

  async newContext(): Promise<BrowserContext> {
    const browser = await this.getBrowser()
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      screen: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
      colorScheme: 'dark',
      reducedMotion: 'no-preference',
      serviceWorkers: 'block',
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 LinkPilotProbe/1.0',
    })
    return context
  }

  async close(): Promise<void> {
    await this.browser?.close().catch(() => undefined)
    this.browser = null
  }
}

export const browserManager = new BrowserManager()

function networkFor(url: string): string | null {
  try {
    const host = new URL(url).hostname
    return AD_NETWORKS.find((entry) => entry.pattern.test(host))?.name || null
  } catch {
    return null
  }
}

function uniqueStrings(values: string[], limit = 8): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, 100)
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(cleaned)
    if (output.length >= limit) break
  }
  return output
}

async function scanPage(page: Page): Promise<RawPageScan> {
  return page.evaluate(() => {
    const adToken = /(^|[^a-z])(ad|ads|advert|advertisement|advertising|sponsor|sponsored|interstitial|promo|banner|skyscraper|leaderboard)([^a-z]|$)/i
    const adHost = /(doubleclick|googlesyndication|googleadservices|amazon-adsystem|criteo|taboola|outbrain|media\.net|adsterra|propellerads|onclickads|popads|monetag|exoclick|juicyads|revcontent|mgid|ezoic|adthrive|pubmatic|openx|rubiconproject|indexexchange|sovrn|sharethrough|adcash|hilltopads)/i
    const captchaPattern = /(recaptcha|hcaptcha|turnstile|captcha|verify you are human|checking your browser|challenge-platform)/i
    const blockedPattern = /(access denied|attention required|just a moment|forbidden|403|bot detection|automated traffic|website is suspended|domain is parked|temporarily unavailable|request blocked|unavailable|security check)/i
    const countdownPattern = /\b\d{1,3}\s*(s|sec|secs|second|seconds)\b|\b00:\d{2}\b|timer|countdown/i

    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 6000)
    const html = document.documentElement?.innerHTML || ''
    const title = document.title || null
    const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || null
    const headings = Array.from(document.querySelectorAll('h1,h2')).slice(0, 8).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean)

    const captcha =
      Boolean(document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], [class*="captcha" i], [id*="captcha" i]')) ||
      captchaPattern.test(text) ||
      captchaPattern.test(html)
    const blocked =
      (!title || /^\s*$/i.test(title)) && text.length < 20
        ? false
        : blockedPattern.test(title || '') ||
          blockedPattern.test(text.slice(0, 900)) ||
          Boolean(document.querySelector('iframe[src*="captcha-delivery"], iframe[src*="challenge"]'))
    let blockedReason: string | null = null
    if (captcha) blockedReason = 'Human verification / CAPTCHA detected'
    else if (blocked) blockedReason = 'Access-restriction or blocked-page signal detected'

    const controls = Array.from(document.querySelectorAll('button,a,[role="button"],input[type="button"],input[type="submit"]'))
    const skipControls: string[] = []
    const continueControls: string[] = []
    let countdowns = 0
    for (const element of controls) {
      const label = ((element.textContent || (element as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim())
      if (!label || label.length > 90) continue
      if (/skip|close|dismiss/i.test(label)) skipControls.push(label)
      if (/continue|proceed|get link|download|open link|next|claim/i.test(label)) continueControls.push(label)
    }
    if (countdownPattern.test(text)) {
      countdowns = Math.min(20, (text.match(new RegExp(countdownPattern.source, 'gi')) || []).length)
    }
    countdowns += Math.min(10, document.querySelectorAll('[class*="countdown" i],[id*="timer" i],[data-countdown]').length)

    const adCandidates: RawAdCandidate[] = []
    const iframeNetworks = new Set<string>()
    const seenSelectors = new Set<string>()

    const selectorFor = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`
      const parts: string[] = []
      let node: Element | null = element
      let depth = 0
      while (node && node !== document.body && depth < 4) {
        let part = node.tagName.toLowerCase()
        if (node.classList.length) part += '.' + Array.from(node.classList).slice(0, 2).map((c) => CSS.escape(c)).join('.')
        const parent: Element | null = node.parentElement
        if (parent) {
          const siblings: Element[] = Array.from(parent.children).filter((child: Element) => child.tagName === node!.tagName)
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`
        }
        parts.unshift(part)
        node = parent
        depth += 1
      }
      return parts.join(' > ') || element.tagName.toLowerCase()
    }

    const inspectCandidate = (element: Element, hint: string | null) => {
      if (adCandidates.length >= 60) return
      const selector = selectorFor(element)
      if (seenSelectors.has(selector)) return
      seenSelectors.add(selector)
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const visible =
        rect.width > 6 &&
        rect.height > 6 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || '1') > 0.05
      const fixed = style.position === 'fixed' || style.position === 'sticky'
      const textValue = (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140)
      const tag = element.tagName.toLowerCase()
      const src = element.getAttribute('src') || ''
      const network = hint || (src ? (adHost.test(src) ? 'Ad network iframe' : null) : null)
      let format = 'Display container'
      if (tag === 'iframe') format = 'Iframe placement'
      if (tag === 'video') format = 'Video ad'
      if (fixed && rect.width * rect.height > window.innerWidth * window.innerHeight * 0.18) format = 'Interstitial / overlay'
      else if (rect.width >= 640 && rect.height <= 300) format = 'Leaderboard banner'
      else if (rect.height >= 500 && rect.width <= 420) format = 'Skyscraper'
      else if (/sponsor/i.test(textValue)) format = 'Sponsored placement'
      else if (rect.width < 420 && rect.height > 120) format = 'Rectangle unit'
      const explicit = /(^|[-_ ])(ad|ads|advert|sponsor|interstitial|banner)([-_ ]|$)/i.test(`${element.id} ${element.className || ''}`)
      const confidence: 'low' | 'medium' | 'high' = network || (explicit && visible) ? 'high' : explicit || format !== 'Display container' ? 'medium' : 'low'
      adCandidates.push({
        selector,
        text: textValue,
        tag,
        format,
        confidence,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible,
        fixed,
        networkHint: network,
      })
    }

    const candidates = document.querySelectorAll('ins,iframe,video,aside,[data-ad],[data-ad-slot],[id*="ad" i],[class*="ad" i],[class*="sponsor" i],[class*="banner" i],[class*="interstitial" i]')
    for (const element of Array.from(candidates).slice(0, 500)) {
      const className = typeof element.className === 'string' ? element.className : ''
      const id = element.id || ''
      const marks = `${id} ${className}`
      if (element.tagName.toLowerCase() === 'iframe') {
        const src = element.getAttribute('src') || ''
        if (adHost.test(src)) {
          const host = (() => {
            try { return new URL(src).hostname } catch { return '' }
          })()
          if (host) iframeNetworks.add(host)
          inspectCandidate(element, 'Ad network iframe')
        }
        continue
      }
      if (!adToken.test(marks) && !element.hasAttribute('data-ad') && !element.hasAttribute('data-ad-slot')) continue
      inspectCandidate(element, null)
    }

    return {
      title,
      description,
      headings,
      textSnippet: text.slice(0, 1800),
      captcha,
      blocked,
      blockedReason,
      countdowns: Math.min(20, countdowns),
      skipControls: [...new Set(skipControls)].slice(0, 8),
      continueControls: [...new Set(continueControls)].slice(0, 8),
      adCandidates,
      iframeNetworks: [...iframeNetworks].slice(0, 8),
    }
  })
}

function toAds(candidates: RawAdCandidate[], observedAtMs: number, existing: AdObservation[] = []): AdObservation[] {
  const prior = new Map(existing.map((ad) => [ad.selector, ad]))
  return candidates.map((candidate, index) => {
    const previous = prior.get(candidate.selector)
    const firstSeenMs = previous?.firstSeenMs ?? observedAtMs
    return {
      id: previous?.id || `ad_${observedAtMs.toString(36)}_${index}`,
      format: candidate.format,
      network: candidate.networkHint,
      selector: candidate.selector,
      text: candidate.text || null,
      visible: candidate.visible,
      firstSeenMs,
      lastSeenMs: observedAtMs,
      durationMs: Math.max(0, observedAtMs - firstSeenMs),
      confidence: candidate.confidence,
      verified: false as const,
    }
  })
}

export type InspectPhase = 'opening' | 'inspecting' | 'analyzing'

export interface InspectOptions {
  screenshotFile?: string
  passiveScroll?: boolean
  aiSummary?: boolean
  signal?: AbortSignal
  onPhase?: (phase: InspectPhase, message: string) => void
}

export async function inspectWithBrowser(url: string, options: InspectOptions = {}): Promise<BrowserInspection> {
  if (!browserManager.available) throw new Error('Browser automation is unavailable.')
  const context = await browserManager.newContext()
  const page = await context.newPage()
  const started = Date.now()
  const networkHints = new Set<string>()
  let statusCode: number | null = null
  const abort = () => {
    void context.close().catch(() => undefined)
  }
  if (options.signal?.aborted) {
    await context.close().catch(() => undefined)
    throw new Error('Session stopped by operator.')
  }
  options.signal?.addEventListener('abort', abort, { once: true })

  context.on('page', (popup) => {
    if (popup !== page) void popup.close().catch(() => undefined)
  })
  page.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined))

  await page.route('**/*', async (route) => {
    const request = route.request()
    let requestUrl: URL
    try {
      requestUrl = new URL(request.url())
    } catch {
      await route.abort('blockedbyclient')
      return
    }
    if (!['http:', 'https:'].includes(requestUrl.protocol)) {
      await route.abort('blockedbyclient')
      return
    }
    if (quickBlockedHost(requestUrl.hostname)) {
      await route.abort('blockedbyclient')
      return
    }
    if (request.isNavigationRequest()) {
      try {
        await assertSafeUrl(requestUrl.toString())
      } catch {
        await route.abort('blockedbyclient')
        return
      }
    }
    const network = networkFor(requestUrl.toString())
    if (network) networkHints.add(network)
    await route.continue()
  })

  try {
    options.onPhase?.('opening', 'Opening destination in isolated browser context')
    let response
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs })
      statusCode = response?.status() ?? null
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Navigation failed.'
      if (!page.url() || page.url() === 'about:blank') throw new Error(detail)
    }

    options.onPhase?.('inspecting', 'Scanning page controls, ads and redirect outcome')
    await page.waitForTimeout(1200)
    await page.waitForLoadState('networkidle', { timeout: 3500 }).catch(() => undefined)
    const firstScan = await scanPage(page)
    const firstObservedAt = Date.now() - started
    let ads = toAds(firstScan.adCandidates, firstObservedAt)

    if (options.passiveScroll) {
      await page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.8))).catch(() => undefined)
      await page.waitForTimeout(900)
      const secondScan = await scanPage(page)
      const secondObservedAt = Date.now() - started
      ads = toAds(secondScan.adCandidates, secondObservedAt, ads)
      if (options.screenshotFile) {
        const { join: joinPath } = await import('node:path')
        await page.screenshot({
          path: joinPath(config.dataDir, 'screenshots', options.screenshotFile),
          type: 'jpeg',
          quality: 72,
          animations: 'disabled',
          timeout: 15_000,
        }).catch((error) => console.warn('[browser] screenshot failed:', error instanceof Error ? error.message : error))
      }
    } else if (options.screenshotFile) {
      const { join: joinPath } = await import('node:path')
      await page.screenshot({
        path: joinPath(config.dataDir, 'screenshots', options.screenshotFile),
        type: 'jpeg',
        quality: 72,
        animations: 'disabled',
        timeout: 15_000,
      }).catch((error) => console.warn('[browser] screenshot failed:', error instanceof Error ? error.message : error))
    }

    const finalUrl = page.url()
    const loadMs = Date.now() - started
    const networks = [...new Set([...networkHints, ...firstScan.iframeNetworks])].slice(0, 12)
    const adNetworks = ads.map((ad) => ad.network).filter(Boolean) as string[]
    const pageSignals: PageSignals = {
      title: firstScan.title,
      description: firstScan.description,
      headings: uniqueStrings(firstScan.headings, 8),
      textSnippet: firstScan.textSnippet,
      captcha: firstScan.captcha,
      blocked: firstScan.blocked,
      blockedReason: firstScan.blockedReason,
      countdowns: firstScan.countdowns,
      skipControls: uniqueStrings(firstScan.skipControls, 8),
      continueControls: uniqueStrings(firstScan.continueControls, 8),
      adObservations: ads,
      adNetworks: [...new Set([...networks, ...adNetworks])],
      finalUrl,
      loadMs,
      statusCode,
      screenshotUrl: options.screenshotFile ? `/screenshots/${encodeURIComponent(options.screenshotFile)}?v=${Date.now()}` : null,
      screenshotUpdatedAt: options.screenshotFile ? new Date().toISOString() : null,
      inspectedWith: 'browser',
    }

    options.onPhase?.('analyzing', options.aiSummary ? 'Asking the configured AI agent for a session summary' : 'Building deterministic page summary')
    const ai = await analyzeWithAi(pageSignals, ads, Boolean(options.aiSummary))
    return { page: pageSignals, aiSummary: ai.summary, aiMode: ai.source }
  } finally {
    options.signal?.removeEventListener('abort', abort)
    await context.close().catch(() => undefined)
  }
}

export function fallbackSignals(): PageSignals {
  return {
    title: null,
    description: null,
    headings: [],
    textSnippet: '',
    captcha: false,
    blocked: false,
    blockedReason: null,
    countdowns: 0,
    skipControls: [],
    continueControls: [],
    adObservations: [],
    adNetworks: [],
    finalUrl: null,
    loadMs: 0,
    statusCode: null,
    screenshotUrl: null,
    screenshotUpdatedAt: null,
    inspectedWith: 'none',
  }
}


