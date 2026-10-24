import { randomUUID } from 'node:crypto'

export const nowIso = () => new Date().toISOString()
export const id = (prefix = '') => `${prefix}${prefix ? '_' : ''}${randomUUID().replaceAll('-', '').slice(0, 20)}`

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function truncate(value, length = 500) {
  if (typeof value !== 'string') return ''
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}

export function safeJson(value, fallback = null) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function hostOf(value) {
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function isLikelyUrl(value) {
  try {
    const parsed = new URL(String(value).trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function stripSecrets(settings = {}) {
  const copy = structuredClone(settings)
  for (const key of ['aiApiKey', 'analyticsApiKey', 'webhookSecret', 'apiToken']) {
    if (key in copy) copy[key] = copy[key] ? 'configured' : ''
  }
  return copy
}

export function boundedInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return clamp(parsed, min, max)
}

export function escapeCsv(value) {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`
  return text
}

export function toCsv(rows, columns) {
  const header = columns.map((column) => escapeCsv(column.label)).join(',')
  const body = rows.map((row) => columns.map((column) => escapeCsv(column.value(row))).join(','))
  return [header, ...body].join('\r\n')
}
