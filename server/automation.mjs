import { existsSync } from 'node:fs'
import { config } from './config.mjs'
import { analyzePageWithAi } from './ai.mjs'
import { inspectUrl } from './inspector.mjs'
import { clamp, id, nowIso, truncate } from './util.mjs'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class Semaphore {
  constructor(limit) {
    this.limit = limit
    this.active = 0
    this.queue = []
  }

  async acquire() {
    if (this.active < this.limit) {
      this.active += 1
      return
    }
    await new Promise((resolve) => this.queue.push(resolve))
    this.active += 1
  }

  release() {
    this.active = Math.max(0, this.active - 1)
    const next = this.queue.shift()
    if (next) next()
  }

  setLimit(limit) {
    this.limit = Math.max(1, limit)
    let slots = this.limit - this.active
    while (slots > 0 && this.queue.length) {
      const next = this.queue.shift()
      next()
      slots -= 1
    }
  }
}

const AD_SIGNATURES = [
  { key: 'Google AdSense', pattern: /googlesyndication|adsbygoogle|pagead/i },
  { key: 'Google Ad Manager', pattern: /doubleclick|googletag/i },
  { key: 'Amazon Ads', pattern: /amazon-adsystem/i },
  { key: 'Taboola', pattern: /taboola/i },
  { key: 'Outbrain', pattern: /outbrain/i },
  { key: 'Criteo', pattern: /criteo/i },
  { key: 'PropellerAds', pattern: /propellerads/i },
  { key: 'Adsterra', pattern: /adsterra/i },
  { key: 'PopAds', pattern: /popads/i },
  { key: 'Media.net', pattern: /media\.net/i },
  { key: 'MGID', pattern: /mgid/i },
  { key: 'Ezoic', pattern: /ezoic/i },
  { key: 'ExoClick', pattern: /exoclick/i },
]

export class SessionEngine {
  constructor({ store, broadcast, onAdEvent }) {
    this.store = store
    this.broadcast = broadcast
    this.onAdEvent = onAdEvent
    this.semaphore = new Semaphore(Number(store.get().settings?.maxConcurrentBrowsers) || config.maxConcurrentBrowsers)
    this.runtimes = new Map()
    this.previews = new Map()
    this.browser = null
    this.playwright = null
    this.available = null
    this.paused = new Set()
    this.stopped = new Set()
    this.jobRuns = new Map()
    this.worker = {
      id: config.workerId,
      region: config.workerRegion,
      maxSessions: config.workerMaxSessions,
      status: 'online',
    }
  }

  setConcurrency(limit) {
    this.semaphore.setLimit(limit)
  }

  async capability() {
    if (this.available !== null) return this.available
    try {
      const { chromium } = await import('playwright')
      const executable = config.playwrightBrowserPath || chromium.executablePath()
      this.playwright = chromium
      this.available = Boolean(executable && existsSync(executable))
      return this.available
    } catch {
      this.available = false
      return false
    }
  }

  async getBrowser() {
    if (this.browser?.isConnected()) return this.browser
    const available = await this.capability()
    if (!available) throw new Error('Playwright Chromium is not installed')
    this.browser = await this.playwright.launch({
      headless: true,
      executablePath: config.playwrightBrowserPath || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-sync'],
    })
    return this.browser
  }

  getSession(sessionId) {
    return this.store.get().sessions.find((session) => session.id === sessionId)
  }

  getJob(jobId) {
    return this.store.get().jobs.find((job) => job.id === jobId)
  }

  log(sessionId, message, type = 'action', level = 'info') {
    const entry = { id: id('log'), at: nowIso(), type, message: truncate(message, 280), level }
    this.store.mutate((state) => {
      const session = state.sessions.find((item) => item.id === sessionId)
      if (!session) return
      session.logs = [...(session.logs || []), entry].slice(-80)
      session.updatedAt = nowIso()
    })
    this.broadcast({ type: 'session:log', sessionId, entry })
    return entry
  }

  updateSession(sessionId, patch) {
    let updated
    this.store.mutate((state) => {
      const session = state.sessions.find((item) => item.id === sessionId)
      if (!session) return
      Object.assign(session, patch, { updatedAt: nowIso() })
      updated = session
    })
    if (updated) this.broadcast({ type: 'session:update', session: updated })
    return updated
  }

  recordAdEvents(session, analysis) {
    if (!analysis?.detected) return
    const createdAt = nowIso()
    this.store.mutate((state) => {
      const formats = analysis.formats?.length ? analysis.formats : ['display']
      for (const format of formats) {
        state.adEvents.unshift({
          id: id('ad'),
          sessionId: session.id,
          jobId: session.jobId,
          url: session.currentUrl || session.originalUrl,
          domain: session.finalDomain || '',
          network: analysis.networks?.[0] || 'Unidentified',
          networks: analysis.networks || [],
          format,
          visibleMs: analysis.visibleMs || 0,
          detectedAt: createdAt,
          verified: false,
          note: 'Element detection only — not a verified paid impression.',
        })
      }
      state.adEvents = state.adEvents.slice(0, 1000)
    })
    this.onAdEvent?.(session.id)
  }

  async runJob(jobId) {
    if (this.jobRuns.has(jobId)) return this.jobRuns.get(jobId)
    const run = this.executeJob(jobId).finally(() => this.jobRuns.delete(jobId))
    this.jobRuns.set(jobId, run)
    return run
  }

  async executeJob(jobId) {
    const state = this.store.get()
    const job = state.jobs.find((item) => item.id === jobId)
    if (!job) return
    const engineAvailable = await this.capability()
    const engine = job.engine === 'http-analysis' || !engineAvailable ? 'http-analysis' : 'playwright'
    this.store.mutate((current) => {
      const target = current.jobs.find((item) => item.id === jobId)
      if (!target) return
      target.status = 'running'
      target.engine = engine
      target.startedAt ||= nowIso()
      target.updatedAt = nowIso()
    })
    this.broadcast({ type: 'job:update', job: this.getJob(jobId) })

    const sessions = this.store.get().sessions.filter((session) => session.jobId === jobId)
    const tasks = sessions.map((session, index) => (async () => {
      await wait(index * 180)
      if (this.stopped.has(jobId)) return
      await this.runSession(session.id)
    })())
    await Promise.allSettled(tasks)

    const remaining = this.store.get().sessions.filter((session) => session.jobId === jobId)
    const allDone = remaining.every((session) => ['completed', 'stopped', 'error'].includes(session.status))
    this.store.mutate((current) => {
      const target = current.jobs.find((item) => item.id === jobId)
      if (!target) return
      if (this.stopped.has(jobId)) target.status = 'stopped'
      else if (allDone) target.status = 'completed'
      target.completedAt = ['completed', 'stopped'].includes(target.status) ? nowIso() : null
      target.updatedAt = nowIso()
      target.summary = this.summarizeJob(jobId)
    })
    this.broadcast({ type: 'job:update', job: this.getJob(jobId) })
    this.broadcast({ type: 'stats:update' })
  }

  summarizeJob(jobId) {
    const sessions = this.store.get().sessions.filter((session) => session.jobId === jobId)
    const completed = sessions.filter((session) => session.status === 'completed').length
    const errors = sessions.filter((session) => session.status === 'error').length
    const adSessions = sessions.filter((session) => session.ads?.detected).length
    return `${completed}/${sessions.length} sessions completed${errors ? `, ${errors} errors` : ''}. Advertising detected in ${adSessions} session${adSessions === 1 ? '' : 's'}. No ads were clicked.`
  }

  async waitForResume(sessionId, jobId) {
    while (this.paused.has(sessionId) || this.paused.has(jobId)) {
      if (this.stopped.has(sessionId) || this.stopped.has(jobId)) return false
      await wait(300)
    }
    return !(this.stopped.has(sessionId) || this.stopped.has(jobId))
  }

  async runSession(sessionId) {
    const initial = this.getSession(sessionId)
    if (!initial) return
    if (this.stopped.has(initial.jobId) || this.stopped.has(sessionId)) {
      this.updateSession(sessionId, { status: 'stopped', endedAt: nowIso() })
      return
    }
    if (initial.status === 'completed') return
    const job = this.getJob(initial.jobId)
    const engine = job?.engine || 'http-analysis'
    this.updateSession(sessionId, {
      status: 'launching',
      progress: 5,
      startedAt: initial.startedAt || nowIso(),
      workerId: this.worker.id,
      region: this.worker.region,
    })
    this.log(sessionId, `Isolated ${engine === 'playwright' ? 'browser context' : 'HTTP analysis worker'} created.`, 'system')
    try {
      if (engine === 'playwright') await this.runPlaywrightSession(sessionId)
      else await this.runHttpSession(sessionId)
    } catch (error) {
      this.log(sessionId, `Session failed: ${error.message}`, 'error', 'error')
      this.updateSession(sessionId, {
        status: this.stopped.has(sessionId) ? 'stopped' : 'error',
        error: truncate(error.message, 300),
        endedAt: nowIso(),
        progress: 100,
      })
    } finally {
      await this.cleanupRuntime(sessionId)
    }
  }

  async runHttpSession(sessionId) {
    if (!(await this.waitForResume(sessionId, this.getSession(sessionId).jobId))) return
    const session = this.getSession(sessionId)
    this.updateSession(sessionId, { status: 'loading', progress: 18, currentUrl: session.originalUrl })
    this.log(sessionId, 'Resolving redirect chain with SSRF-safe HTTP inspector.', 'navigate')
    const result = await inspectUrl(session.originalUrl)
    if (!(await this.waitForResume(sessionId, session.jobId))) return
    this.log(sessionId, `Redirect chain resolved in ${result.durationMs} ms (${result.redirectCount} redirects).`, 'navigate')
    this.updateSession(sessionId, {
      status: 'active',
      progress: 62,
      currentUrl: result.finalUrl,
      finalUrl: result.finalUrl,
      finalDomain: result.finalDomain,
      title: result.title,
      statusCode: result.statusCode,
      pageStatus: result.pageStatus,
      inspection: result,
      ads: result.ads,
    })
    const ai = await analyzePageWithAi(result)
    this.updateSession(sessionId, { ai, progress: 88 })
    this.log(sessionId, ai.summary, 'ai')
    if (result.ads?.detected) {
      this.log(sessionId, `${result.ads.networks.join(', ') || 'Unidentified network'} ${result.ads.formats.join(', ')} ad elements detected; no interaction attempted.`, 'ad', 'warn')
      this.recordAdEvents(this.getSession(sessionId), { ...result.ads, visibleMs: result.durationMs })
    }
    if (result.controls?.countdown || result.controls?.skip) {
      this.log(sessionId, `Interface controls identified: ${[result.controls.countdown && 'countdown', result.controls.skip && 'skip', result.controls.continue && 'continue'].filter(Boolean).join(', ')}. Automated activation is disabled by policy.`, 'policy', 'warn')
    }
    this.updateSession(sessionId, {
      status: result.pageStatus === 'error' || result.pageStatus === 'timeout' ? 'error' : 'completed',
      progress: 100,
      endedAt: nowIso(),
      error: result.error || null,
    })
    this.log(sessionId, 'Analysis-only session complete. No advertising was engaged.', 'complete')
  }

  async runPlaywrightSession(sessionId) {
    if (!(await this.capability())) return this.runHttpSession(sessionId)
    await this.semaphore.acquire()
    let context
    try {
      if (!(await this.waitForResume(sessionId, this.getSession(sessionId).jobId))) return
      const session = this.getSession(sessionId)
      const browser = await this.getBrowser()
      context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
        acceptDownloads: false,
        serviceWorkers: 'block',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 LinkPilot/1.0',
        proxy: config.workerProxyServer ? {
          server: config.workerProxyServer,
          username: config.workerProxyUsername || undefined,
          password: config.workerProxyPassword || undefined,
        } : undefined,
      })
      const page = await context.newPage()
      this.runtimes.set(sessionId, { context, page })
      page.setDefaultTimeout(25_000)
      page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}))
      page.on('popup', (popup) => {
        this.log(sessionId, 'Blocked a popup window. LinkPilot does not activate advertising surfaces.', 'policy', 'warn')
        popup.close().catch(() => {})
      })
      page.on('requestfailed', (request) => {
        if (request.resourceType() === 'document') {
          this.log(sessionId, `Document request failed: ${truncate(request.failure()?.errorText || 'unknown', 120)}`, 'network', 'warn')
        }
      })

      this.updateSession(sessionId, { status: 'loading', progress: 12, currentUrl: session.originalUrl, pageStatus: 'loading' })
      this.log(sessionId, 'Navigating in an isolated, sandboxed browser context.', 'navigate')
      const response = await page.goto(session.originalUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 })
      if (!(await this.waitForResume(sessionId, session.jobId))) return
      const finalUrl = page.url()
      let finalDomain = ''
      try { finalDomain = new URL(finalUrl).hostname } catch {}
      const title = await page.title().catch(() => '')
      this.updateSession(sessionId, {
        status: 'active',
        progress: 35,
        currentUrl: finalUrl,
        finalUrl,
        finalDomain,
        title: truncate(title, 180),
        pageStatus: response && response.status() >= 400 ? 'error' : 'ok',
        statusCode: response?.status() || 0,
      })
      this.log(sessionId, `Page responded with HTTP ${response?.status() || 'unknown'}; current URL ${truncate(finalUrl, 150)}.`, 'navigate')
      await this.capturePreview(sessionId)

      const analysis = await this.inspectDom(page)
      if (analysis.ads.detected) {
        this.log(sessionId, `${analysis.ads.networks.join(', ') || 'Unidentified network'} ${analysis.ads.formats.join(', ')} elements detected. Reporting only; clicks disabled.`, 'ad', 'warn')
      }
      if (analysis.captcha) {
        this.log(sessionId, 'CAPTCHA or human-verification challenge detected. Automated interaction halted; retaining read-only evidence.', 'blocked', 'warn')
      }
      this.updateSession(sessionId, {
        progress: 52,
        ads: analysis.ads,
        controls: analysis.controls,
        pageStatus: analysis.captcha ? 'captcha' : analysis.blocked ? 'blocked' : this.getSession(sessionId)?.pageStatus || 'ok',
      })

      const configuredDuration = Number(this.store.get().settings?.sessionDurationMs) || config.sessionTimeoutMs
      const finishAt = Date.now() + Math.min(configuredDuration, 24_000)
      let lastPreview = 0
      let scrollPass = 0
      while (!analysis.captcha && Date.now() < finishAt) {
        if (!(await this.waitForResume(sessionId, session.jobId))) break
        if (this.stopped.has(sessionId)) break
        if (Date.now() - lastPreview > config.previewIntervalMs) {
          await this.capturePreview(sessionId)
          lastPreview = Date.now()
        }
        if (scrollPass < 2) {
          scrollPass += 1
          this.log(sessionId, `Reading pass ${scrollPass}: scrolling to inspect below-the-fold content.`, 'scroll')
          await page.evaluate((pass) => window.scrollBy({ top: Math.round(window.innerHeight * 0.75 * pass), behavior: 'smooth' }), scrollPass).catch(() => {})
          const refreshed = await this.inspectDom(page)
          this.updateSession(sessionId, {
            ads: refreshed.ads,
            controls: refreshed.controls,
            currentUrl: page.url(),
            progress: clamp(58 + scrollPass * 10, 0, 82),
          })
        }
        await wait(1200)
      }

      const finalAnalysis = await this.inspectDom(page).catch(() => analysis)
      const currentSession = this.getSession(sessionId)
      const ai = await analyzePageWithAi({
        finalUrl: page.url(),
        finalDomain,
        title: await page.title().catch(() => title),
        statusCode: response?.status() || 0,
        pageStatus: currentSession?.pageStatus || 'ok',
        ads: finalAnalysis.ads,
        controls: finalAnalysis.controls,
        redirectCount: 0,
        contentPreview: finalAnalysis.text,
      })
      this.updateSession(sessionId, {
        currentUrl: page.url(),
        ai,
        ads: finalAnalysis.ads,
        controls: finalAnalysis.controls,
        progress: 94,
        statusCode: response?.status() || 0,
      })
      if (finalAnalysis.ads.detected) this.recordAdEvents(this.getSession(sessionId), { ...finalAnalysis.ads, visibleMs: 10_000 })
      this.log(sessionId, ai.summary, 'ai')
      await this.capturePreview(sessionId)
      if (!this.stopped.has(sessionId)) {
        this.updateSession(sessionId, { status: 'completed', progress: 100, endedAt: nowIso() })
        this.log(sessionId, 'Session complete. Preview retained; browser profile discarded.', 'complete')
      }
    } finally {
      this.semaphore.release()
    }
  }

  async capturePreview(sessionId) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime?.page || runtime.page.isClosed()) return
    try {
      const buffer = await runtime.page.screenshot({ type: 'jpeg', quality: 62, timeout: 5_000 })
      this.previews.set(sessionId, { buffer, at: nowIso() })
      this.store.mutate((state) => {
        const session = state.sessions.find((item) => item.id === sessionId)
        if (session) session.previewAt = nowIso()
      })
      this.broadcast({ type: 'session:preview', sessionId, at: nowIso() })
    } catch {
      // Preview failures should never fail the session.
    }
  }

  async inspectDom(page) {
    const data = await page.evaluate((signatures) => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
      }
      const sources = [...document.querySelectorAll('iframe[src], script[src]')].map((node) => node.getAttribute('src') || '')
      const networkKeys = signatures.filter((signature) => sources.some((src) => new RegExp(signature.pattern, 'i').test(src))).map((item) => item.key)
      const adCandidates = [...document.querySelectorAll('[class*="ad-"],[class*="ads-"],[id*="ad-"],[class*="banner"],[class*="sponsor"],[data-ad],[data-ad-slot],ins.adsbygoogle')]
        .filter(visible)
        .slice(0, 40)
      if (networkKeys.length && !adCandidates.length) {
        const iframes = [...document.querySelectorAll('iframe')].filter(visible)
        adCandidates.push(...iframes.filter((frame) => /(?:ad|doubleclick|googlesyndication)/i.test(frame.src || '')))
      }
      const formats = new Set()
      const text = (document.body?.innerText || '').toLowerCase()
      if (/interstitial|ad-overlay|popunder|modal/.test(text) && adCandidates.length) formats.add('interstitial')
      if (document.querySelector('video')) {
        if (/\b(?:preroll|midroll|ad)\b/i.test(text)) formats.add('video')
      }
      if (/\b(?:sponsored|native ad|around the web|recommended for you)\b/.test(text)) formats.add('native')
      if (adCandidates.some((node) => visible(node))) formats.add('display')
      const captchaWidgets = [...document.querySelectorAll('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="turnstile"],.g-recaptcha,.h-captcha,[data-sitekey]')].some(visible)
      const challengeText = /verify (?:that )?you are human|checking your browser|complete (?:the )?(?:security )?check|captcha challenge|enter (?:the )?captcha|attention required/.test(text)
      const captcha = captchaWidgets || challengeText
      const blocked = /access denied|request blocked|unusual traffic|bot detection/.test(text)
      return {
        ads: {
          detected: adCandidates.length > 0 || networkKeys.length > 0,
          verified: false,
          note: 'DOM detection only. Not a verified impression and no ad was clicked.',
          networks: networkKeys,
          formats: [...formats],
          elementCount: adCandidates.length,
          iframeCount: document.querySelectorAll('iframe').length,
        },
        controls: {
          countdown: /\b(?:seconds?|s remaining|please wait)\b/.test(text),
          skip: /\bskip (?:ad|this ad)\b/.test(text),
          continue: /\b(?:continue|proceed|get link|download now)\b/.test(text),
          reward: /\breward(?:ed)?\b|\bofferwall\b|\bcomplete (?:an )?offer\b/.test(text),
        },
        captcha,
        blocked,
        title: document.title,
        text: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1600),
      }
    }, AD_SIGNATURES.map((item) => ({ key: item.key, pattern: item.pattern.source })))
    return data
  }

  async cleanupRuntime(sessionId) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime) return
    this.runtimes.delete(sessionId)
    await runtime.context?.close().catch(() => {})
  }

  async pauseJob(jobId) {
    this.paused.add(jobId)
    this.store.mutate((state) => {
      const job = state.jobs.find((item) => item.id === jobId)
      if (job) { job.status = 'paused'; job.updatedAt = nowIso() }
      for (const session of state.sessions.filter((item) => item.jobId === jobId)) {
        if (['queued', 'launching', 'loading', 'active'].includes(session.status)) {
          session.status = 'paused'
          session.updatedAt = nowIso()
        }
      }
    })
    this.broadcast({ type: 'job:update', job: this.getJob(jobId) })
    for (const session of this.store.get().sessions.filter((item) => item.jobId === jobId)) {
      this.broadcast({ type: 'session:update', session })
    }
  }

  async resumeJob(jobId) {
    this.paused.delete(jobId)
    this.store.mutate((state) => {
      const job = state.jobs.find((item) => item.id === jobId)
      if (job) { job.status = 'running'; job.updatedAt = nowIso() }
      for (const session of state.sessions.filter((item) => item.jobId === jobId)) {
        if (session.status === 'paused') {
          session.status = 'active'
          session.updatedAt = nowIso()
        }
      }
    })
    this.broadcast({ type: 'job:update', job: this.getJob(jobId) })
    for (const session of this.store.get().sessions.filter((item) => item.jobId === jobId)) {
      this.broadcast({ type: 'session:update', session })
    }
  }

  async stopJob(jobId) {
    this.stopped.add(jobId)
    this.paused.delete(jobId)
    const sessions = this.store.get().sessions.filter((item) => item.jobId === jobId)
    for (const session of sessions) {
      this.stopped.add(session.id)
      await this.cleanupRuntime(session.id)
    }
    this.store.mutate((state) => {
      const job = state.jobs.find((item) => item.id === jobId)
      if (job) { job.status = 'stopped'; job.completedAt = nowIso(); job.updatedAt = nowIso() }
      for (const session of state.sessions.filter((item) => item.jobId === jobId)) {
        if (!['completed', 'error'].includes(session.status)) {
          session.status = 'stopped'
          session.endedAt = nowIso()
          session.progress = 100
          session.updatedAt = nowIso()
        }
      }
    })
    this.broadcast({ type: 'job:update', job: this.getJob(jobId) })
    this.broadcast({ type: 'stats:update' })
  }

  async pauseSession(sessionId) {
    this.paused.add(sessionId)
    this.updateSession(sessionId, { status: 'paused' })
    this.log(sessionId, 'Session paused by operator.', 'control')
  }

  async resumeSession(sessionId) {
    this.paused.delete(sessionId)
    this.updateSession(sessionId, { status: 'active' })
    this.log(sessionId, 'Session resumed by operator.', 'control')
  }

  async stopSession(sessionId) {
    const session = this.getSession(sessionId)
    if (!session) return
    this.stopped.add(sessionId)
    await this.cleanupRuntime(sessionId)
    this.updateSession(sessionId, { status: 'stopped', endedAt: nowIso(), progress: 100 })
    this.log(sessionId, 'Session stopped and isolated browser profile discarded.', 'control')
    this.broadcast({ type: 'stats:update' })
  }

  hasPreview(sessionId) {
    return this.previews.has(sessionId)
  }

  getPreview(sessionId) {
    return this.previews.get(sessionId)
  }

  async shutdown() {
    for (const sessionId of this.runtimes.keys()) await this.cleanupRuntime(sessionId)
    await this.browser?.close().catch(() => {})
  }
}
