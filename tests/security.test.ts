import assert from 'node:assert/strict'
import test from 'node:test'

process.env.APP_ENCRYPTION_KEY = 'test-only-encryption-material'
process.env.DASHBOARD_PASSWORD = 'test-dashboard-password'
process.env.AUTH_SECRET = 'test-signing-secret'

const {
  assertSafeUrl,
  createSessionToken,
  decryptSecret,
  detectUrlFlags,
  encryptSecret,
  isPrivateAddress,
  isPrivateHostname,
  normalizeUrl,
  parseCookies,
  sessionCookie,
  verifySessionToken,
} = await import('../server/security.ts')

test('detects private and reserved IP address ranges', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.5.4', '192.168.1.1', '169.254.1.1', '0.0.0.0', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateAddress(address), true, address)
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) {
    assert.equal(isPrivateAddress(address), false, address)
  }
})

test('detects private hostnames and rejects credential URL bypasses', async () => {
  for (const hostname of ['localhost', 'api.localhost', 'printer.local', 'metadata.internal', '127.0.0.1']) {
    assert.equal(isPrivateHostname(hostname), true, hostname)
  }
  assert.equal(isPrivateHostname('example.com'), false)

  await assert.rejects(() => assertSafeUrl('http://127.0.0.1/admin'), /SSRF guard/)
  await assert.rejects(() => assertSafeUrl('http://localhost:8080/'), /Port 8080 is not permitted/)
  await assert.rejects(() => assertSafeUrl('ftp://example.com/file'), /Only HTTP and HTTPS/)
  await assert.rejects(() => assertSafeUrl('https://user:secret@example.com/'), /embedded credentials/)
})

test('accepts public direct-IP URLs and strips fragments', async () => {
  const result = await assertSafeUrl('https://8.8.8.8/dns-query?name=example.com#fragment')
  assert.equal(result.host, '8.8.8.8')
  assert.equal(result.normalized, 'https://8.8.8.8/dns-query?name=example.com')
  assert.equal(normalizeUrl('example.com/a#b'), 'https://example.com/a')
})

test('detects shortener and tracking URL flags', () => {
  const flags = detectUrlFlags('https://bit.ly/demo?utm_source=test&fbclid=abc')
  assert.deepEqual(flags.map((flag) => flag.code).sort(), ['shortener', 'tracker'])
})

test('signs, validates and rejects tampered session tokens', () => {
  const token = createSessionToken()
  assert.equal(verifySessionToken(token), true)
  assert.equal(verifySessionToken(`${token}x`), false)
  assert.equal(verifySessionToken(''), false)
  assert.match(sessionCookie(token), /HttpOnly/)
  assert.match(sessionCookie(token), /SameSite=Strict/)
})

test('parses cookies and decrypts authenticated secrets', () => {
  assert.deepEqual(parseCookies('a=1; lp_session=abc%2Edef; malformed'), { a: '1', lp_session: 'abc.def' })
  const encrypted = encryptSecret('connector-token-value')
  assert.notEqual(encrypted, 'connector-token-value')
  assert.equal(decryptSecret(encrypted), 'connector-token-value')
  assert.throws(() => decryptSecret(`${encrypted}broken`), /Invalid encrypted payload|Unsupported state|auth/)
})
