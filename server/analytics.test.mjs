import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAnalytics, inspectionsCsv, sessionsCsv } from './analytics.mjs'
import { escapeCsv } from './util.mjs'

const now = new Date().toISOString()
const state = {
  sessions: [
    { id: 's1', jobId: 'j1', status: 'completed', originalUrl: 'https://example.com', finalUrl: 'https://example.com', finalDomain: 'example.com', createdAt: now, ads: { detected: true } },
    { id: 's2', jobId: 'j1', status: 'error', originalUrl: 'https://example.org', finalUrl: '', finalDomain: 'example.org', createdAt: now, ads: { detected: false } },
  ],
  inspections: [
    { id: 'i1', originalUrl: 'https://example.com', finalUrl: 'https://example.com', finalDomain: 'example.com', pageStatus: 'ok', statusCode: 200, redirectCount: 2, risk: { level: 'low' }, ads: { networks: ['Google AdSense'] }, createdAt: now, inspectedAt: now },
  ],
  adEvents: [{ id: 'a1', detectedAt: now, networks: ['Google AdSense'] }],
  integrations: { verifiedEvents: [{ type: 'click', value: 2, at: now }, { type: 'impression', value: 100, at: now }], lastSyncAt: now },
}

test('analytics separates automation runs, ad detections, and verified metrics', () => {
  const analytics = buildAnalytics(state, '7d')
  assert.equal(analytics.totals.sessions, 2)
  assert.equal(analytics.totals.completed, 1)
  assert.equal(analytics.totals.adDetections, 1)
  assert.equal(analytics.totals.verifiedClicks, 2)
  assert.equal(analytics.totals.verifiedImpressions, 100)
  assert.equal(analytics.series.length, 7)
  assert.match(analytics.integrity.visitorMeaning, /not human visitors/)
})

test('CSV exports include stable headers and neutralise spreadsheet formulas', () => {
  assert.match(sessionsCsv(state), /^session_id,job_id,status/)
  assert.match(inspectionsCsv(state), /^inspection_id,original_url/)
  assert.equal(escapeCsv('=HYPERLINK("https://evil.test")'), '"\'=HYPERLINK(""https://evil.test"")"')
})
