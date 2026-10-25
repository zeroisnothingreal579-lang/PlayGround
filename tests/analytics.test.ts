import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAnalytics } from '../server/analytics.ts'
import type { Run, VerifiedMetric } from '../server/types.ts'

function metric(overrides: Partial<VerifiedMetric>): VerifiedMetric {
  return {
    id: crypto.randomUUID(),
    source: 'Fixture platform',
    clicks: 4,
    impressions: 100,
    earnings: 1.5,
    currency: 'USD',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-07',
    note: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function run(): Run {
  const now = new Date().toISOString()
  const session = {
    id: 'session-1',
    runId: 'run-1',
    index: 1,
    inputUrl: 'https://example.com',
    status: 'complete',
    progress: 100,
    phaseMessage: 'Complete',
    currentUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    finalDomain: 'example.com',
    createdAt: now,
    startedAt: now,
    completedAt: now,
    elapsedMs: 1200,
    analysis: { status: 'success', finalDomain: 'example.com' },
    page: { loadMs: 900 },
    ads: [{ id: 'ad-1' }, { id: 'ad-2' }],
    logs: [],
    summary: null,
    error: null,
    serverId: 'local',
    serverRegion: 'local-dev',
    viewport: '1440x900',
    aiMode: 'heuristic',
    screenshotUrl: null,
    screenshotUpdatedAt: null,
  }
  return {
    id: 'run-1',
    inputUrl: 'https://example.com',
    sessionCount: 1,
    status: 'complete',
    createdAt: now,
    startedAt: now,
    completedAt: now,
    analysis: null,
    options: { deepInspect: true, aiSummary: true, passiveScroll: true },
    sessions: [session],
    completedCount: 1,
    errorCount: 0,
    adCount: 2,
  } as unknown as Run
}

test('aggregates probe outcomes without treating ads as verified metrics', () => {
  const analytics = buildAnalytics([run()], [metric({}), metric({ earnings: 2.25, clicks: 6 })])
  assert.equal(analytics.probes, 1)
  assert.equal(analytics.redirectSuccessRate, 100)
  assert.equal(analytics.adObservations, 2)
  assert.equal(analytics.verifiedClicks, 10)
  assert.equal(analytics.verifiedEarnings, 3.75)
  assert.equal(analytics.verifiedCurrency, 'USD')
  assert.equal(analytics.history.length, 14)
  assert.equal(analytics.statusBreakdown[0].name, 'Complete')
})

test('refuses to combine earnings across currencies', () => {
  const analytics = buildAnalytics([], [metric({ currency: 'USD' }), metric({ currency: 'EUR' })])
  assert.equal(analytics.verifiedCurrency, 'MIXED')
  assert.equal(analytics.verifiedEarnings, null)
  assert.equal(analytics.verifiedClicks, 8)
})
