import { randomUUID } from 'node:crypto'
import { analyzeWithAi, heuristicSummary } from './ai.js'
import { config } from './config.js'
import { assertSafeUrl, normalizeUrl, resolveRedirectChain } from './security.js'
import { browserManager, fallbackSignals, inspectWithBrowser, type InspectPhase } from './browser.js'
import type { AdObservation, Analysis, PageSignals, RedirectFlag } from './types.js'

export interface AnalyzeOptions {
  deep?: boolean
  aiSummary?: boolean
  passiveScroll?: boolean
  screenshotId?: string
  signal?: AbortSignal
  onPhase?: (phase: InspectPhase | 'resolving', message: string) => void
}

export interface AnalyzeResult {
  analysis: Analysis
  aiMode: 'llm' | 'heuristic'
}

const BLOCKED_PATTERN = /(access denied|attention required|just a moment|forbidden|403|bot detection|automated traffic|website is suspended|domain is parked|temporarily unavailable|request blocked|verify you are human|checking your browser)/i
const CAPTCHA_PATTERN = /(recaptcha|hcaptcha|turnstile|captcha|verify you are human|checking your browser|challenge-platform)/i

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function stripHtml(value: string): string {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim()
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      const remaining = maxBytes - total
      const slice = value.byteLength > remaining ? value.slice(0, remaining) : value
      chunks.push(slice)
      total += slice.byteLength
    }
  } finally {
    void reader.cancel().catch(() => undefined)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged)
}

async function fetchPageSignals(url: string, startedAt: number): Promise<PageSignals> {
  const safe = await assertSafeUrl(url)
  const response = await fetch(safe.normalized, {
    redirect: 'follow',
    headers: {
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      'user-agent': `LinkPilotAI/${config.version} (+static inspector)`,
    },
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  })
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('text') || contentType.includes('html') || !contentType
    ? await readLimited(response, 700_000)
    : ''
  const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || null
  const description = body.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || body.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1]
    || null
  const headings = [...body.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
    .slice(0, 8)
    .map((match) => stripHtml(match[1]).slice(0, 140))
    .filter(Boolean)
  const text = stripHtml(body).slice(0, 6000)
  const adMatches = [...body.matchAll(/<(ins|iframe)[^>]*(?:adsbygoogle|doubleclick|googlesyndication|adsterra|propellerads|monetag|exoclick)[^>]*>/gi)]
  const adNetworks = new Set<string>()
  for (const match of adMatches) {
    const fragment = match[0].toLowerCase()
    if (fragment.includes('googlesyndication') || fragment.includes('doubleclick')) adNetworks.add('Google Ads')
    if (fragment.includes('adsterra')) adNetworks.add('Adsterra')
    if (fragment.includes('propellerads')) adNetworks.add('PropellerAds')
    if (fragment.includes('monetag')) adNetworks.add('Monetag')
    if (fragment.includes('exoclick')) adNetworks.add('ExoClick')
  }
  const skipControls = [...body.matchAll(/<(?:button|a)[^>]*>([\s\S]{0,80}?)<\/(?:button|a)>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter((label) => /skip|close|dismiss/i.test(label))
    .slice(0, 8)
  const continueControls = [...body.matchAll(/<(?:button|a)[^>]*>([\s\S]{0,80}?)<\/(?:button|a)>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter((label) => /continue|proceed|get link|download|open link|claim|next/i.test(label))
    .slice(0, 8)
  const countdowns = Math.min(20, (text.match(/\b\d{1,3}\s*(s|sec|secs|seconds)\b|\b00:\d{2}\b/gi) || []).length)
  const captcha = CAPTCHA_PATTERN.test(body.slice(0, 120_000))
  const blocked = !captcha && BLOCKED_PATTERN.test(`${title || ''} ${text.slice(0, 900)}`)
  const ads: AdObservation[] = adMatches.slice(0, 20).map((match, index) => ({
    id: `fetch_ad_${index}`,
    format: match[1].toLowerCase() === 'ins' ? 'Display container' : 'Iframe placement',
    network: [...adNetworks][0] || null,
    selector: `${match[1].toLowerCase()}[${index}]`,
    text: match[0].slice(0, 120),
    visible: false,
    firstSeenMs: 0,
    lastSeenMs: null,
    durationMs: null,
    confidence: adNetworks.size ? 'medium' : 'low',
    verified: false,
  }))
  return {
    title: title ? stripHtml(title) : null,
    description: description ? stripHtml(description) : null,
    headings,
    textSnippet: text.slice(0, 1800),
    captcha,
    blocked,
    blockedReason: captcha ? 'Human verification / CAPTCHA detected' : blocked ? 'Access-restriction or blocked-page signal detected' : null,
    countdowns,
    skipControls,
    continueControls,
    adObservations: ads,
    adNetworks: [...adNetworks],
    finalUrl: response.url,
    loadMs: Date.now() - startedAt,
    statusCode: response.status,
    screenshotUrl: null,
    screenshotUpdatedAt: null,
    inspectedWith: 'fetch',
  }
}

export async function analyzeUrl(input: string, options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const started = Date.now()
  const normalized = normalizeUrl(input)
  const id = randomUUID()
  options.onPhase?.('resolving', 'Validating URL and following the redirect chain')
  const resolution = await resolveRedirectChain(normalized)
  const flags: RedirectFlag[] = [...resolution.flags]
  let page: PageSignals | null = null
  let aiSummary: string | null = null
  let aiMode: 'llm' | 'heuristic' = config.ai.url && config.ai.key ? 'llm' : 'heuristic'
  let inspectedWith: Analysis['inspectedWith'] = 'none'
  let inspectionError: string | null = null

  if (options.deep && resolution.finalUrl) {
    const screenshotId = options.screenshotId ? `${options.screenshotId}.jpg` : null
    if (browserManager.available) {
      try {
        const result = await inspectWithBrowser(resolution.finalUrl, {
          screenshotFile: screenshotId || undefined,
          passiveScroll: options.passiveScroll,
          aiSummary: options.aiSummary,
          signal: options.signal,
          onPhase: options.onPhase,
        })
        page = result.page
        aiSummary = result.aiSummary
        aiMode = result.aiMode
        inspectedWith = 'browser'
      } catch (error) {
        inspectionError = error instanceof Error ? error.message : 'Browser inspection failed.'
        console.warn('[analyzer] Browser inspection failed:', inspectionError)
      }
    }
    if (!page) {
      try {
        options.onPhase?.('inspecting', 'Browser unavailable — running static page inspection')
        page = await fetchPageSignals(resolution.finalUrl, started)
        inspectedWith = 'fetch'
        if (options.aiSummary) {
          const summary = await analyzeWithAi(page, page.adObservations, true)
          aiSummary = summary.summary
          aiMode = summary.source
        }
      } catch (error) {
        inspectionError = inspectionError || (error instanceof Error ? error.message : 'Static inspection failed.')
      }
    }
  }

  if (page?.captcha) {
    flags.push({
      code: 'captcha',
      label: 'CAPTCHA challenge',
      detail: 'Human verification was detected. The probe did not attempt to solve or bypass it.',
      severity: 'medium',
    })
  }
  if (page?.blocked) {
    flags.push({
      code: 'blocked',
      label: 'Page restricted',
      detail: page.blockedReason || 'The destination appears blocked or unavailable.',
      severity: 'medium',
    })
  }
  if (inspectionError) {
    flags.push({
      code: 'error',
      label: 'Inspection fallback',
      detail: inspectionError,
      severity: 'low',
    })
  }
  if (page && page.adObservations.length) {
    flags.push({
      code: 'suspicious',
      label: 'Advertising observed',
      detail: `${page.adObservations.length} advertising container(s) observed. This is not a verified impression.`,
      severity: 'low',
    })
  }

  const dedupedFlags = flags.filter((flag, index, items) => items.findIndex((item) => item.code === flag.code && item.detail === flag.detail) === index)
  const high = dedupedFlags.some((flag) => flag.severity === 'high')
  const medium = dedupedFlags.some((flag) => flag.severity === 'medium')
  const suspicion = high ? 'high' : medium ? 'medium' : 'low'
  const status: Analysis['status'] = resolution.error && !page
    ? 'error'
    : page?.blocked || page?.captcha || resolution.error || (resolution.statusCode || 0) >= 400
      ? 'partial'
      : 'success'

  if (!aiSummary && page) {
    aiSummary = heuristicSummary(page, page.adObservations).summary
  }
  if (page) {
    page.adObservations = page.adObservations.map((ad) => ({ ...ad, verified: false }))
  }

  const analysis: Analysis = {
    id,
    inputUrl: input.trim(),
    normalizedUrl: normalized,
    finalUrl: page?.finalUrl || resolution.finalUrl,
    finalDomain: (() => {
      try {
        return new URL(page?.finalUrl || resolution.finalUrl || normalized).hostname.toLowerCase()
      } catch {
        return resolution.finalDomain
      }
    })(),
    status,
    statusCode: page?.statusCode ?? resolution.statusCode,
    redirects: resolution.redirects,
    redirectCount: Math.max(0, resolution.redirects.length - 1),
    loopDetected: resolution.loopDetected,
    insecure: resolution.insecure,
    suspicion,
    flags: dedupedFlags,
    page,
    createdAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    error: resolution.error || inspectionError,
    inspectedWith,
    aiSummary,
  }

  return { analysis, aiMode }
}

export { fallbackSignals }
