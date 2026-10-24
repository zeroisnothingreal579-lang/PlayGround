import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { config } from './config.mjs'
import { ingestVerifiedEvents, verifyWebhookSignature } from './integrations.mjs'

test('webhook signatures require a configured secret and an exact HMAC match', () => {
  const previous = config.analytics.webhookSecret
  config.analytics.webhookSecret = 'test-webhook-secret'
  try {
    const body = Buffer.from(JSON.stringify({ events: [] }))
    const signature = `sha256=${createHmac('sha256', 'test-webhook-secret').update(body).digest('hex')}`
    assert.equal(verifyWebhookSignature(body, signature), true)
    assert.equal(verifyWebhookSignature(body, `${signature}0`), false)
    assert.equal(verifyWebhookSignature(Buffer.from('tampered'), signature), false)
    assert.equal(verifyWebhookSignature(body, undefined), false)
  } finally {
    config.analytics.webhookSecret = previous
  }
  assert.equal(verifyWebhookSignature(Buffer.from('{}'), 'sha256=00'), false)
})

test('verified events are validated and deduplicated', () => {
  const state = { integrations: { verifiedEvents: [], lastSyncAt: null } }
  const store = { mutate: (fn) => fn(state), get: () => state }
  const events = [
    { id: 'ext-1', type: 'click', value: 1, at: '2026-01-01T00:00:00.000Z', source: 'publisher' },
    { id: 'ext-1', type: 'click', value: 1, at: '2026-01-01T00:00:00.000Z', source: 'publisher' },
    { id: 'bad', type: 'unknown', value: 1 },
  ]
  assert.equal(ingestVerifiedEvents(store, events).accepted, 1)
  assert.equal(ingestVerifiedEvents(store, events).accepted, 0)
  assert.equal(state.integrations.verifiedEvents.length, 1)
})
