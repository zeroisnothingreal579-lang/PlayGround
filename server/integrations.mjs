import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from './config.mjs'
import { id, nowIso, truncate } from './util.mjs'

function validEvent(event) {
  return (
    event &&
    ['click', 'impression', 'earning', 'visit'].includes(event.type) &&
    Number.isFinite(Number(event.value)) &&
    Number(event.value) >= 0
  )
}

function eventAt(value) {
  const date = value ? new Date(value) : new Date()
  return Number.isFinite(date.getTime()) ? date.toISOString() : nowIso()
}

function eventKey(event) {
  if (event.externalId) return `${event.source}:${event.externalId}:${event.type}`
  return `${event.source}:${event.type}:${event.at}:${event.value}`
}

export async function refreshAnalyticsIntegration(store) {
  if (!config.analytics.endpoint || !config.analytics.apiKey) {
    throw Object.assign(new Error('Analytics integration is not configured. Set ANALYTICS_API_URL and ANALYTICS_API_KEY.'), { status: 400 })
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(config.analytics.endpoint, {
      headers: {
        Authorization: `Bearer ${config.analytics.apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Analytics provider returned HTTP ${response.status}`)
    const payload = await response.json()
    const incoming = Array.isArray(payload) ? payload : Array.isArray(payload.events) ? payload.events : []
    const normalized = incoming.filter(validEvent).map((event) => ({
      id: id('verified'),
      externalId: truncate(String(event.id || ''), 100),
      type: event.type,
      value: Number(event.value),
      currency: event.currency ? truncate(String(event.currency), 8) : undefined,
      at: eventAt(event.at),
      source: truncate(String(event.source || config.analytics.provider || 'authorized integration'), 80),
      verified: true,
    }))
    let imported = 0
    store.mutate((state) => {
      const seen = new Set(state.integrations.verifiedEvents.map(eventKey))
      const unique = normalized.filter((event) => {
        const key = eventKey(event)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      imported = unique.length
      state.integrations.verifiedEvents = [...state.integrations.verifiedEvents, ...unique].slice(-2000)
      state.integrations.lastSyncAt = nowIso()
      state.integrations.syncError = null
      state.integrations.provider = config.analytics.provider || 'authorized integration'
    })
    return { imported, received: incoming.length, syncedAt: nowIso() }
  } catch (error) {
    store.mutate((state) => {
      state.integrations.lastSyncAt = nowIso()
      state.integrations.syncError = error.message
    })
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export function verifyWebhookSignature(rawBody, signature) {
  if (!config.analytics.webhookSecret) return false
  if (!signature || typeof signature !== 'string') return false
  const expected = createHmac('sha256', config.analytics.webhookSecret).update(rawBody).digest('hex')
  const provided = signature.replace(/^sha256=/, '')
  if (expected.length !== provided.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
}

export function ingestVerifiedEvents(store, events, source = 'signed webhook') {
  const accepted = []
  for (const event of Array.isArray(events) ? events : []) {
    if (!validEvent(event)) continue
    accepted.push({
      id: id('verified'),
      externalId: truncate(String(event.id || id('ext')), 100),
      type: event.type,
      value: Number(event.value),
      currency: event.currency ? truncate(String(event.currency), 8) : undefined,
      at: eventAt(event.at),
      source: truncate(String(event.source || source), 80),
      verified: true,
    })
  }
  let acceptedUnique = 0
  store.mutate((state) => {
    const seen = new Set(state.integrations.verifiedEvents.map(eventKey))
    const unique = accepted.filter((event) => {
      const key = eventKey(event)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    acceptedUnique = unique.length
    state.integrations.verifiedEvents = [...state.integrations.verifiedEvents, ...unique].slice(-2000)
    state.integrations.lastSyncAt = nowIso()
  })
  return { accepted: acceptedUnique, received: accepted.length, events: accepted }
}
