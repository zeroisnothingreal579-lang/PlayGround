import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { config } from './config.mjs'
import { hostOf, isLikelyUrl, truncate } from './util.mjs'

const SHORTENERS = new Set([
  'bit.ly', 'bitly.com', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'rb.gy', 'cutt.ly', 'shorturl.at', 'rebrand.ly', 'tiny.cc', 'lnkd.in', 's.id',
  'v.gd', 'soo.gd', 'clck.ru', 'shorte.st', 'adf.ly', 'bc.vc', 'ouo.io', 'linkvertise.com',
])

const AD_NETWORKS = [
  { key: 'Google AdSense', test: /(?:pagead2\.googlesyndication\.com|adsbygoogle|google_ad_client)/i },
  { key: 'Google Ad Manager', test: /(?:securepubads\.g\.doubleclick\.net|googletag|doubleclick\.net)/i },
  { key: 'Amazon Ads', test: /(?:amazon-adsystem\.com|aax-eu|assoc-amazon)/i },
  { key: 'Taboola', test: /(?:taboola\.com|taboola-widget|trc_related_container)/i },
  { key: 'Outbrain', test: /(?:outbrain\.com|outbrain-widget|ob-widget)/i },
  { key: 'Criteo', test: /(?:criteo\.com|criteo\.net|cto_)/i },
  { key: 'PropellerAds', test: /(?:propellerads\.com|propeller\.click|onclickalgo)/i },
  { key: 'Adsterra', test: /(?:adsterra\.com|adsterratools|highperformanceformat)/i },
  { key: 'PopAds', test: /(?:popads\.net|popads\.com)/i },
  { key: 'Media.net', test: /(?:media\.net|mediacommerce)/i },
  { key: 'MGID', test: /(?:mgid\.com|mgid\.net)/i },
  { key: 'Ezoic', test: /(?:ezoic\.net|ezoic\.com)/i },
  { key: 'Monumetric', test: /(?:monumetric\.com|monetizemore)/i },
  { key: 'ExoClick', test: /(?:exoclick\.com|exosrv\.com)/i },
]

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid', 'twclid',
  'ref', 'ref_src', 'source', 'affiliate', 'aff_id', 'affid', 'clickid', 'click_id',
])

const PRIVATE_BLOCKS = [
  { test: (h) => h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local'), reason: 'local hostname' },
  { test: (h) => h === 'metadata.google.internal', reason: 'cloud metadata host' },
]

function parseIPv4(address) {
  return address.split('.').map((part) => Number.parseInt(part, 10))
}

export function isPrivateAddress(address) {
  const version = isIP(address)
  if (version === 4) {
    const [a, b] = parseIPv4(address)
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }
  if (version === 6) {
    const normalized = address.toLowerCase()
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateAddress(mapped[1])
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80')
    )
  }
  return true
}

export async function assertSafeTarget(rawUrl) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported')
  if (parsed.username || parsed.password) throw new Error('URLs containing embedded credentials are not allowed')
  if (parsed.port && !['80', '443', ''].includes(parsed.port)) throw new Error('Non-standard destination ports are blocked')
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!config.allowPrivateTargets) {
    if (PRIVATE_BLOCKS.some((rule) => rule.test(hostname))) throw new Error('Local and metadata destinations are blocked')
    if (isIP(hostname) && isPrivateAddress(hostname)) throw new Error('Private network destinations are blocked')
    if (!isIP(hostname)) {
      const records = await lookup(hostname, { all: true, verbatim: true })
      if (!records.length) throw new Error('Destination host could not be resolved')
      if (records.some((record) => isPrivateAddress(record.address))) {
        throw new Error('Destination resolves to a private network address')
      }
    }
  }
  return parsed
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match) return ''
  return truncate(match[1].replace(/\s+/g, ' ').trim(), 180)
}

function extractMeta(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return truncate(match[1], 300)
  }
  return ''
}

function detectAdSignals(html) {
  const networks = AD_NETWORKS.filter((network) => network.test.test(html)).map((network) => network.key)
  const lower = html.toLowerCase()
  const adElementCount = (lower.match(/(?:class|id)=["'][^"']*(?:\bad(?:s|vert)?[-_]?(?:slot|unit|banner|container|wrapper)?|sponsor(?:ed)?)[^"']*["']/g) || []).length
  const iframeSources = [...html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map((match) => match[1].toLowerCase())
  const adIframes = iframeSources.filter((src) =>
    /(?:doubleclick|googlesyndication|adsterra|propellerads|popads|taboola|outbrain|criteo|amazon-adsystem)/.test(src),
  ).length
  const formats = new Set()
  if (/<video[^>]+(?:ad|preroll)|ima-ad-container|vjs-ad/i.test(html)) formats.add('video')
  if (/interstitial|modal-overlay|ad-overlay|popunder/i.test(html)) formats.add('interstitial')
  if (/native-ad|sponsored-content|taboola-widget|outbrain-widget/i.test(html)) formats.add('native')
  if (adElementCount || adIframes) formats.add('display')
  if (!formats.size && networks.length) formats.add('display')
  const detected = adElementCount > 0 || adIframes > 0 || networks.length > 0
  return {
    detected,
    verified: false,
    note: 'Detection only. LinkPilot does not click ads and cannot verify paid impressions.',
    networks: [...new Set(networks)],
    formats: [...formats],
    elementCount: adElementCount,
    iframeCount: adIframes,
  }
}

function detectControls(html) {
  const lower = html.toLowerCase()
  return {
    countdown: /(?:countdown|timer|seconds?|please wait|\b\d{1,2}\s*s\b)/i.test(lower),
    skip: /(?:skip\s*(?:ad|this ad)|close\s*ad)/i.test(lower),
    continue: /(?:continue|proceed|get link|download now|unlock)/i.test(lower),
    reward: /(?:reward(?:ed)?|earn|payout|complete (?:an )?offer|offerwall)/i.test(lower),
  }
}

function detectPageStatus(statusCode, html) {
  const lower = html.toLowerCase()
  const challengeText = /(?:verify (?:that )?you are human|checking your browser|complete (?:the )?(?:security )?check|captcha challenge|enter (?:the )?captcha|attention required)/i.test(lower)
  const challengeMarkup = /(?:class|id)=["'][^"']*(?:g-recaptcha|h-captcha|captcha|cf-turnstile)[^"']*["']/i.test(lower)
  if (challengeText || (challengeMarkup && [403, 429, 451, 503].includes(statusCode))) return 'captcha'
  if (statusCode === 403 || statusCode === 429 || statusCode === 451) return 'blocked'
  if (/(?:access denied|request blocked|bot detection|unusual traffic)/i.test(lower)) return 'blocked'
  if (statusCode >= 400) return 'error'
  return 'ok'
}

function analyzeRisk({ parsed, chain, pageStatus, ads, signals }) {
  const reasons = []
  let score = 0
  if (parsed.protocol === 'http:') {
    reasons.push('Final destination uses unencrypted HTTP')
    score += 2
  }
  if (chain.length > 4) {
    reasons.push('Long redirect chain')
    score += 1
  }
  if (SHORTENERS.has(hostOf(parsed.href))) {
    reasons.push('Destination is itself a URL shortener')
    score += 1
  }
  if (pageStatus === 'captcha' || pageStatus === 'blocked') {
    reasons.push(`Destination returned a ${pageStatus} challenge`)
    score += 3
  }
  if (ads.networks.length) {
    reasons.push(`Advertising networks detected: ${ads.networks.join(', ')}`)
    score += 1
  }
  if (signals.reward) {
    reasons.push('Rewarded-link language detected; reward flows are analysis-only')
    score += 1
  }
  const tracking = [...parsed.searchParams.keys()].filter((key) => TRACKING_PARAMS.has(key.toLowerCase()))
  if (tracking.length) reasons.push(`Tracking parameters present: ${tracking.join(', ')}`)
  return {
    level: score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low',
    score,
    reasons,
    trackingParameters: tracking,
  }
}

async function readLimitedBody(response, limit = 600_000) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (total < limit) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = value.subarray(0, limit - total)
      chunks.push(chunk)
      total += chunk.length
      if (total >= limit) break
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function inspectUrl(input, { signal } = {}) {
  const startedAt = Date.now()
  const originalUrl = String(input || '').trim()
  if (!originalUrl || !isLikelyUrl(originalUrl)) {
    return {
      id: null,
      originalUrl,
      finalUrl: '',
      finalDomain: '',
      pageStatus: 'invalid',
      statusCode: 0,
      redirects: [],
      durationMs: 0,
      risk: { level: 'high', score: 10, reasons: ['Enter a valid HTTP or HTTPS URL'] },
      ads: { detected: false, verified: false, networks: [], formats: [], note: '' },
      controls: {},
      signals: {},
      error: 'Invalid URL',
    }
  }

  const chain = []
  const visited = new Set()
  let current = originalUrl
  let finalResponse = null
  let html = ''
  let pageStatus = 'ok'
  let error = null

  try {
    for (let hop = 0; hop <= config.maxRedirects; hop += 1) {
      const parsed = await assertSafeTarget(current)
      const normalized = parsed.href
      if (visited.has(normalized)) {
        pageStatus = 'loop'
        chain.push({ url: normalized, statusCode: 0, note: 'Redirect loop detected' })
        break
      }
      visited.add(normalized)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), config.fetchTimeoutMs)
      const onAbort = () => controller.abort()
      signal?.addEventListener('abort', onAbort, { once: true })
      let response
      try {
        response = await fetch(normalized, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': 'LinkPilotAI/1.0 (authorized link inspection; +https://linkpilot.local/bot)',
            Accept: 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5',
            'Accept-Language': 'en-US,en;q=0.7',
          },
        })
      } finally {
        clearTimeout(timeout)
        signal?.removeEventListener('abort', onAbort)
      }

      const location = response.headers.get('location')
      const contentType = response.headers.get('content-type') || ''
      chain.push({
        url: normalized,
        statusCode: response.status,
        statusText: response.statusText,
        location: location || undefined,
        contentType: contentType || undefined,
      })

      if (response.status >= 300 && response.status < 400) {
        if (!location) {
          error = 'Redirect response is missing a Location header'
          pageStatus = 'error'
          break
        }
        current = new URL(location, normalized).href
        continue
      }

      finalResponse = response
      if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        html = await readLimitedBody(response)
      } else {
        await response.body?.cancel().catch(() => {})
      }
      break
    }

    if (!finalResponse && !['loop', 'error'].includes(pageStatus)) {
      pageStatus = 'error'
      error = `Exceeded ${config.maxRedirects} redirects`
    }
  } catch (caught) {
    error = caught.name === 'AbortError' ? 'Inspection timed out' : caught.message
    pageStatus = caught.name === 'AbortError' ? 'timeout' : 'error'
  }

  const finalUrl = chain.length ? chain[chain.length - 1].url : originalUrl
  const finalDomain = hostOf(finalUrl)
  if (finalResponse) pageStatus = detectPageStatus(finalResponse.status, html)
  const ads = html ? detectAdSignals(html) : { detected: false, verified: false, networks: [], formats: [], note: 'No HTML body to analyse.', elementCount: 0, iframeCount: 0 }
  const controls = html ? detectControls(html) : { countdown: false, skip: false, continue: false, reward: false }
  let risk = { level: 'low', score: 0, reasons: [], trackingParameters: [] }
  try {
    risk = analyzeRisk({ parsed: new URL(finalUrl), chain, pageStatus, ads, signals: controls })
  } catch {
    // Keep safe defaults when the final URL is not parseable.
  }

  if (error) {
    risk.reasons = [...new Set([...risk.reasons, error])]
    risk.level = risk.level === 'low' ? 'medium' : risk.level
  }

  const title = extractTitle(html)
  const description = extractMeta(html, 'description') || extractMeta(html, 'og:description')
  const contentText = html
    ? html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1200)
    : ''

  return {
    originalUrl,
    finalUrl,
    finalDomain,
    pageStatus,
    statusCode: finalResponse?.status || chain[chain.length - 1]?.statusCode || 0,
    redirects: chain,
    redirectCount: Math.max(0, chain.length - 1),
    durationMs: Date.now() - startedAt,
    risk,
    ads,
    controls,
    title,
    description,
    contentPreview: contentText,
    contentType: finalResponse?.headers.get('content-type') || '',
    shortenerDetected: chain.some((entry) => SHORTENERS.has(hostOf(entry.url))),
    error,
    inspectedAt: new Date().toISOString(),
  }
}

export const adPolicy = {
  mode: 'analysis-only',
  summary: 'LinkPilot inspects and reports advertising. It never clicks ads, starts sponsored video, bypasses countdowns, or generates artificial traffic.',
  prohibited: [
    'Automated ad clicks or engagement',
    'Rewarded-link manipulation or payout farming',
    'Bypassing required advertising steps',
    'Artificial visitors, clicks, impressions, or revenue',
    'IP rotation intended to simulate distinct people',
  ],
  allowed: [
    'Authorized redirect-chain inspection',
    'Detect ad formats, networks, and visibility durations',
    'Scroll and read page content without interacting with ads',
    'Identify skip, continue, countdown, and reward controls for reporting',
    'Test owned or explicitly authorized advertising placements',
  ],
  monetization: [
    'Publishers are typically paid only for qualifying impressions or clicks verified by the ad network, never by a browser window opening alone.',
    'Rewarded-link sites usually require a real user action under their own terms; automating those steps can violate platform policy and may be unlawful.',
    'Detection of an ad element is not a verified impression. LinkPilot keeps those states separate.',
    'Earnings and verified clicks are displayed only when supplied by an authorized analytics or publisher integration.',
  ],
}
