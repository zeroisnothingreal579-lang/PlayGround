import assert from 'node:assert/strict'
import test from 'node:test'
import { adPolicy, assertSafeTarget, inspectUrl, isPrivateAddress } from './inspector.mjs'

test('private and special-use addresses are blocked', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.5', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateAddress(address), true, address)
  }
  assert.equal(isPrivateAddress('93.184.216.34'), false)
  assert.equal(isPrivateAddress('2606:4700:4700::1111'), false)
})

test('unsafe targets are rejected before fetching', async () => {
  await assert.rejects(() => assertSafeTarget('http://localhost/admin'), /blocked/)
  await assert.rejects(() => assertSafeTarget('http://127.0.0.1:3000'), /blocked|ports/)
  await assert.rejects(() => assertSafeTarget('http://example.com:8080'), /ports/)
  await assert.rejects(() => assertSafeTarget('ftp://example.com/file'), /HTTP/)
  await assert.rejects(() => assertSafeTarget('https://user:pass@example.com'), /credentials/)
})

test('invalid URLs return a safe inspection result without network access', async () => {
  const result = await inspectUrl('javascript:alert(1)')
  assert.equal(result.pageStatus, 'invalid')
  assert.equal(result.risk.level, 'high')
  assert.equal(result.ads.detected, false)
})

test('policy cannot represent ad engagement as allowed', () => {
  assert.equal(adPolicy.mode, 'analysis-only')
  assert.equal(adPolicy.prohibited.some((item) => /ad clicks/i.test(item)), true)
  assert.equal(adPolicy.allowed.some((item) => /authorized/i.test(item)), true)
})
