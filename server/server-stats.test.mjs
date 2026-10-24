import assert from 'node:assert/strict'
import test from 'node:test'
import { serverStats } from './server-stats.mjs'

test('server telemetry reflects runtime availability and configured limits', () => {
  const result = serverStats({ sessions: [], settings: { maxConcurrentBrowsers: 3 } }, { engineAvailable: true })
  assert.equal(result.servers.length, 1)
  assert.equal(result.servers[0].playwrightInstalled, true)
  assert.equal(result.limits.maxConcurrentBrowsers, 3)
  assert.equal(result.servers[0].status, 'online')
})
