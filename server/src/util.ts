import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto'
import { config } from './config.js'

export const nowIso = () => new Date().toISOString()

export const id = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`

export const token = (bytes = 32) => randomBytes(bytes).toString('base64url')

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split('$')
    if (scheme !== 'scrypt' || !salt || !hash) return false
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url')
}

export function signJwt(payload: Record<string, unknown>) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  const signature = createHmac('sha256', config.jwtSecret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

export function verifyJwt(value: string): Record<string, unknown> | null {
  try {
    const [header, body, signature] = value.split('.')
    if (!header || !body || !signature) return null
    const expected = createHmac('sha256', config.jwtSecret).update(`${header}.${body}`).digest('base64url')
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function sha256(value: string) {
  return createHmac('sha256', config.jwtSecret).update(value).digest('hex')
}

export function slugifyFilename(name: string) {
  return name.replace(/[^\w.\- ()]/g, '_').slice(0, 120) || 'file'
}

export function classifyFile(name: string, mime: string): 'apk' | 'image' | 'video' | 'document' | 'archive' | 'other' {
  const ext = name.toLowerCase().split('.').pop() || ''
  if (ext === 'apk') return 'apk'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'ppt', 'pptx', 'xls', 'xlsx', 'csv'].includes(ext)) return 'document'
  if (['zip', 'tar', 'gz', '7z'].includes(ext)) return 'archive'
  return 'other'
}

export function parseUserAgent(ua: string | undefined) {
  if (!ua) return 'Unknown device'
  if (/android/i.test(ua)) return 'Android device'
  if (/iphone|ipad/i.test(ua)) return 'iOS device'
  if (/windows/i.test(ua)) return 'Windows'
  if (/mac os/i.test(ua)) return 'macOS'
  if (/linux/i.test(ua)) return 'Linux'
  return ua.slice(0, 80)
}

export function currentPeriod() {
  const date = new Date()
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
