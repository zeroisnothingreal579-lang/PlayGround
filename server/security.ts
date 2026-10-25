import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import dns from 'node:dns/promises'
import net from 'node:net'
import type { NextFunction, Request, Response as ExpressResponse } from 'express'
import { config } from './config.js'
import type { RedirectFlag, RedirectHop } from './types.js'

const SHORTENER_HOSTS = new Set([
  'bit.ly', 'bitly.com', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'rebrand.ly', 'cutt.ly', 'shorturl.at', 's.id', 'tiny.cc', 'rb.gy', 'lnkd.in', 't.ly',
  'shorte.st', 'adf.ly', 'shrinkme.io', 'clck.ru', 'v.gd', 'soo.gd', 'urlz.fr', 'linktr.ee',
  'linkvertise.com', 'linkvertise.net', 'ouo.io', 'ouo.press', 'exe.io', 'fc.lc', 'gplinks.co',
  'za.gl', 'za.uy', 'mboost.me', 'shrinke.me', 'droplink.co', 'yosh.gg', 'sub2unlock.com',
])

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'dclid',
  'fbclid', 'msclkid', 'ttclid', 'twclid', 'ref', 'referrer', 'affiliate', 'aff_id', 'clickid',
  'click_id', 'subid', 'sub_id', 'campaign', 'adgroup',
])

export interface SafeUrlResult {
  url: URL
  normalized: string
  host: string
  privateHost: boolean
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0]
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('::ffff:')) return isPrivateIpv4(normalized.slice(7))
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (/^fe[89ab]/.test(normalized)) return true
  if (normalized.startsWith('ff')) return true
  return false
}

export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address)
  if (family === 4) return isPrivateIpv4(address)
  if (family === 6) return isPrivateIpv6(address)
  return false
}

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (net.isIP(host)) return isPrivateAddress(host)
  return false
}

export function quickBlockedHost(hostname: string): boolean {
  if (config.allowPrivateUrls) return false
  return isPrivateHostname(hostname)
}

export async function assertSafeUrl(raw: string): Promise<SafeUrlResult> {
  let value = raw.trim()
  if (!value) throw new Error('URL is required.')
  if (value.length > 4096) throw new Error('URL exceeds the 4096 character limit.')
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) value = `https://${value}`

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Enter a valid absolute URL (for example https://example.com).')
  }

  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.')
  if (url.username || url.password) throw new Error('URLs containing embedded credentials are not allowed.')
  if (!url.hostname) throw new Error('URL hostname is missing.')
  if (url.hostname.length > 253) throw new Error('URL hostname is too long.')

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if (!config.allowPrivateUrls && !config.allowedPorts.includes(port)) {
    throw new Error(`Port ${port} is not permitted. Allowed ports: ${config.allowedPorts.join(', ')}.`)
  }

  const host = url.hostname.toLowerCase()
  const privateHost = isPrivateHostname(host)
  if (privateHost && !config.allowPrivateUrls) {
    throw new Error('Private, loopback and link-local destinations are blocked by the SSRF guard.')
  }

  if (!net.isIP(host) && !config.allowPrivateUrls) {
    let addresses: { address: string; family: number }[]
    try {
      addresses = await dns.lookup(host, { all: true, verbatim: true })
    } catch {
      throw new Error(`DNS resolution failed for ${host}.`)
    }
    if (!addresses.length) throw new Error(`No DNS records found for ${host}.`)
    if (addresses.some((entry) => isPrivateAddress(entry.address))) {
      throw new Error('The hostname resolves to a private or reserved address and was blocked.')
    }
  }

  url.hash = ''
  return { url, normalized: url.toString(), host, privateHost }
}

export function normalizeUrl(value: string): string {
  let candidate = value.trim()
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(candidate)) candidate = `https://${candidate}`
  try {
    const url = new URL(candidate)
    url.hash = ''
    return url.toString()
  } catch {
    return value.trim()
  }
}

function shortenerHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '')
  if (SHORTENER_HOSTS.has(host)) return true
  return [...SHORTENER_HOSTS].some((entry) => host.endsWith(`.${entry}`))
}

function hasTrackingParams(url: URL): string[] {
  return [...url.searchParams.keys()].filter((key) => TRACKING_PARAMS.has(key.toLowerCase()))
}

export interface RedirectResolution {
  redirects: RedirectHop[]
  finalUrl: string | null
  finalDomain: string | null
  statusCode: number | null
  status: 'success' | 'partial' | 'error'
  loopDetected: boolean
  insecure: boolean
  flags: RedirectFlag[]
  suspicion: 'low' | 'medium' | 'high'
  elapsedMs: number
  error: string | null
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])

export async function resolveRedirectChain(input: string): Promise<RedirectResolution> {
  const started = Date.now()
  const redirects: RedirectHop[] = []
  const flags: RedirectFlag[] = []
  const seen = new Set<string>()
  let current = normalizeUrl(input)
  let loopDetected = false
  let insecure = false
  let finalUrl: string | null = null
  let statusCode: number | null = null
  let error: string | null = null

  for (let depth = 0; depth <= config.maxRedirects; depth++) {
    const hopStarted = Date.now()
    let safe
    try {
      safe = await assertSafeUrl(current)
    } catch (err) {
      error = err instanceof Error ? err.message : 'URL validation failed.'
      redirects.push({
        url: current,
        statusCode: null,
        location: null,
        elapsedMs: Date.now() - hopStarted,
        note: error,
      })
      flags.push({ code: 'blocked', label: 'Blocked destination', detail: error, severity: 'high' })
      break
    }

    current = safe.normalized
    if (seen.has(current)) {
      loopDetected = true
      flags.push({
        code: 'loop',
        label: 'Redirect loop',
        detail: `The chain returned to ${safe.host}.`,
        severity: 'high',
      })
      redirects.push({
        url: current,
        statusCode: null,
        location: null,
        elapsedMs: Date.now() - hopStarted,
        note: 'Loop detected — duplicate URL in redirect chain.',
      })
      break
    }
    seen.add(current)
    if (safe.url.protocol === 'http:') insecure = true

    let response: Response
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          accept: 'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5',
          'user-agent': `LinkPilotAI/${config.version} (+redirect inspector)`,
        },
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      })
      statusCode = response.status
      void response.body?.cancel().catch(() => undefined)
    } catch (err) {
      const detail = err instanceof Error
        ? err.name === 'TimeoutError'
          ? `Request timed out after ${config.requestTimeoutMs}ms.`
          : err.message
        : 'Network request failed.'
      error = detail
      redirects.push({ url: current, statusCode: null, location: null, elapsedMs: Date.now() - hopStarted, note: detail })
      flags.push({ code: 'error', label: 'Navigation error', detail, severity: 'medium' })
      break
    }

    const location = response.headers.get('location')
    redirects.push({
      url: current,
      statusCode: response.status,
      location: location ? new URL(location, current).toString() : null,
      elapsedMs: Date.now() - hopStarted,
    })

    if (response.status === 403 || response.status === 429) {
      flags.push({
        code: 'blocked',
        label: response.status === 403 ? 'Access denied' : 'Rate limited',
        detail: `The destination responded with HTTP ${response.status}.`,
        severity: 'medium',
      })
      break
    }

    if (REDIRECT_STATUS.has(response.status) && location) {
      if (depth === config.maxRedirects) {
        error = `Redirect limit of ${config.maxRedirects} exceeded.`
        flags.push({ code: 'loop', label: 'Redirect limit reached', detail: error, severity: 'high' })
        break
      }
      try {
        current = new URL(location, current).toString()
      } catch {
        error = 'The server returned an invalid redirect location.'
        flags.push({ code: 'error', label: 'Invalid redirect', detail: error, severity: 'high' })
        break
      }
      continue
    }

    finalUrl = current
    if (response.status >= 400) {
      flags.push({
        code: 'error',
        label: `HTTP ${response.status}`,
        detail: `Final destination returned HTTP ${response.status}.`,
        severity: response.status >= 500 ? 'medium' : 'low',
      })
    }
    break
  }

  if (!finalUrl && !error && redirects.length) {
    finalUrl = redirects[redirects.length - 1]?.location || redirects[redirects.length - 1]?.url || null
    if (!finalUrl) error = 'The redirect chain did not resolve to a destination.'
  }

  if (loopDetected) error ||= 'Redirect loop detected.'
  if (redirects.length > config.maxRedirects) error ||= 'Too many redirects.'

  const startUrl = new URL(normalizeUrl(input))
  if (shortenerHost(startUrl.hostname)) {
    flags.push({
      code: 'shortener',
      label: 'URL shortener',
      detail: `${startUrl.hostname} is a known link-shortening or gateway service.`,
      severity: 'low',
    })
  }
  const tracking = new Set<string>()
  for (const hop of redirects) {
    try {
      const parsed = new URL(hop.url)
      hasTrackingParams(parsed).forEach((key) => tracking.add(key))
      if (parsed.protocol === 'http:') insecure = true
    } catch {
      // Ignore malformed intermediate hop.
    }
  }
  if (tracking.size) {
    flags.push({
      code: 'tracker',
      label: 'Tracking parameters',
      detail: `Observed parameters: ${[...tracking].slice(0, 8).join(', ')}.`,
      severity: 'low',
    })
  }
  if (insecure) {
    flags.push({
      code: 'insecure',
      label: 'Plain HTTP hop',
      detail: 'At least one hop uses unencrypted HTTP.',
      severity: 'medium',
    })
  }
  for (const hop of redirects) {
    try {
      const host = new URL(hop.url).hostname
      if (host.startsWith('xn--') || host.includes('.xn--')) {
        flags.push({
          code: 'suspicious',
          label: 'Punycode hostname',
          detail: `${host} uses an internationalized hostname. Verify it visually before proceeding.`,
          severity: 'medium',
        })
        break
      }
    } catch {
      // Ignore.
    }
  }

  let finalDomain: string | null = null
  try {
    finalDomain = finalUrl ? new URL(finalUrl).hostname.toLowerCase() : null
  } catch {
    finalDomain = null
  }

  const high = flags.some((flag) => flag.severity === 'high')
  const medium = flags.some((flag) => flag.severity === 'medium')
  const suspicion = high ? 'high' : medium ? 'medium' : 'low'
  const status: RedirectResolution['status'] = error ? (finalUrl ? 'partial' : 'error') : 'success'

  return {
    redirects,
    finalUrl,
    finalDomain,
    statusCode,
    status,
    loopDetected,
    insecure,
    flags: dedupeFlags(flags),
    suspicion,
    elapsedMs: Date.now() - started,
    error,
  }
}

function dedupeFlags(flags: RedirectFlag[]): RedirectFlag[] {
  const seen = new Set<string>()
  return flags.filter((flag) => {
    const key = `${flag.code}:${flag.detail}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function detectUrlFlags(url: string): RedirectFlag[] {
  const flags: RedirectFlag[] = []
  try {
    const parsed = new URL(url)
    if (shortenerHost(parsed.hostname)) {
      flags.push({
        code: 'shortener',
        label: 'URL shortener',
        detail: `${parsed.hostname} hides its destination until the redirect chain is followed.`,
        severity: 'low',
      })
    }
    const tracking = hasTrackingParams(parsed)
    if (tracking.length) {
      flags.push({
        code: 'tracker',
        label: 'Tracking parameters',
        detail: tracking.slice(0, 8).join(', '),
        severity: 'low',
      })
    }
  } catch {
    // Validation reports the parse error.
  }
  return flags
}

// ---------------------------------------------------------------------------
// Session authentication
// ---------------------------------------------------------------------------

const COOKIE_NAME = 'lp_session'

function sign(value: string): string {
  return createHmac('sha256', config.authSecret).update(value).digest('base64url')
}

export function createSessionToken(): string {
  const payload = Buffer.from(JSON.stringify({ iat: Date.now(), exp: Date.now() + 12 * 60 * 60 * 1000, v: 1 })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return false
  const expected = sign(payload)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return typeof data.exp === 'number' && data.exp > Date.now()
  } catch {
    return false
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const index = part.indexOf('=')
    if (index === -1) return acc
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    try {
      acc[key] = decodeURIComponent(value)
    } catch {
      acc[key] = value
    }
    return acc
  }, {})
}

export function isAuthenticated(req: Request): boolean {
  if (!config.dashboardPassword) return true
  const cookies = parseCookies(req.headers.cookie)
  return verifySessionToken(cookies[COOKIE_NAME])
}

export function sessionCookie(token: string): string {
  const maxAge = 12 * 60 * 60
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secureCookies ? '; Secure' : ''}`
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${config.secureCookies ? '; Secure' : ''}`
}

export function requireAuth(req: Request, res: ExpressResponse, next: NextFunction): void {
  if (isAuthenticated(req)) {
    next()
    return
  }
  res.status(401).json({ error: 'Authentication required.' })
}

export function passwordMatches(candidate: unknown): boolean {
  if (!config.dashboardPassword || typeof candidate !== 'string') return false
  const expected = createHash('sha256').update(config.dashboardPassword).digest()
  const actual = createHash('sha256').update(candidate).digest()
  return timingSafeEqual(expected, actual)
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export function rateLimit(limit: number, windowMs = 60_000) {
  return (req: Request, res: ExpressResponse, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || 'unknown'
    const now = Date.now()
    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }
    bucket.count += 1
    res.setHeader('X-RateLimit-Limit', String(limit))
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)))
    if (bucket.count > limit) {
      res.status(429).json({ error: 'Rate limit exceeded. Retry shortly.' })
      return
    }
    next()
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}, 60_000).unref()

// ---------------------------------------------------------------------------
// AES-256-GCM helper for connector credentials
// ---------------------------------------------------------------------------

function encryptionMaterial(): Buffer {
  if (!config.encryptionKey) throw new Error('APP_ENCRYPTION_KEY is not configured.')
  return createHash('sha256').update(config.encryptionKey).digest()
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionMaterial(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptSecret(payload: string): string {
  const [ivPart, tagPart, dataPart] = payload.split('.')
  if (!ivPart || !tagPart || !dataPart) throw new Error('Invalid encrypted payload.')
  const decipher = createDecipheriv('aes-256-gcm', encryptionMaterial(), Buffer.from(ivPart, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString('utf8')
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`
  } catch {
    return value.slice(0, 200)
  }
}
