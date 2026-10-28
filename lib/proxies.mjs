import { readFileSync } from 'node:fs'

const COUNTRY_CODES = {
  Argentina: 'AR', Bangladesh: 'BD', Belgium: 'BE', Brazil: 'BR', Cambodia: 'KH',
  Cameroon: 'CM', China: 'CN', Colombia: 'CO', 'Costa Rica': 'CR', Denmark: 'DK',
  Ecuador: 'EC', Egypt: 'EG', France: 'FR', Germany: 'DE', 'Hong Kong': 'HK',
  India: 'IN', Indonesia: 'ID', Iran: 'IR', Iraq: 'IQ', Japan: 'JP', Malaysia: 'MY',
  Mexico: 'MX', Netherlands: 'NL', Pakistan: 'PK', Palestine: 'PS', Panama: 'PA',
  Peru: 'PE', Philippines: 'PH', Poland: 'PL', Russia: 'RU', Rwanda: 'RW',
  Singapore: 'SG', 'South Africa': 'ZA', 'South Korea': 'KR', Sweden: 'SE',
  Switzerland: 'CH', Thailand: 'TH', 'Türkiye': 'TR', Ukraine: 'UA',
  'United Kingdom': 'GB', 'United States': 'US', Venezuela: 'VE', Vietnam: 'VN'
}

const FLAGS = {
  AR: '🇦🇷', BD: '🇧🇩', BE: '🇧🇪', BR: '🇧🇷', KH: '🇰🇭', CM: '🇨🇲', CN: '🇨🇳',
  CO: '🇨🇴', CR: '🇨🇷', DK: '🇩🇰', EC: '🇪🇨', EG: '🇪🇬', FR: '🇫🇷', DE: '🇩🇪',
  HK: '🇭🇰', IN: '🇮🇳', ID: '🇮🇩', IR: '🇮🇷', IQ: '🇮🇶', JP: '🇯🇵', MY: '🇲🇾',
  MX: '🇲🇽', NL: '🇳🇱', PK: '🇵🇰', PS: '🇵🇸', PA: '🇵🇦', PE: '🇵🇪', PH: '🇵🇭',
  PL: '🇵🇱', RU: '🇷🇺', RW: '🇷🇼', SG: '🇸🇬', ZA: '🇿🇦', KR: '🇰🇷', SE: '🇸🇪',
  CH: '🇨🇭', TH: '🇹🇭', TR: '🇹🇷', UA: '🇺🇦', GB: '🇬🇧', US: '🇺🇸', VE: '🇻🇪',
  VN: '🇻🇳'
}

export function countryCode(country) {
  return COUNTRY_CODES[country] || ''
}

export function flagFor(country) {
  return FLAGS[countryCode(country)] || '🌐'
}

export function flagFromCode(code) {
  const normalized = String(code || '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized)) return '🌐'
  return String.fromCodePoint(...[...normalized].map((ch) => 127397 + ch.charCodeAt(0)))
}

export function parseProxies(file) {
  const rows = readFileSync(file, 'utf8').split(/\r?\n/)
  const seen = new Set()
  const proxies = []
  for (const row of rows) {
    if (!row.trim()) continue
    const parts = row.split(',')
    if (parts.length < 5) continue
    const rawCountry = (parts[0] || '').trim()
    const country = !rawCountry || rawCountry === 'N/A' ? 'Unknown' : rawCountry
    const latencyMs = Math.max(0, Math.round(Number.parseFloat(parts[1]) || 0))
    const protocol = (parts[2] || '').trim().toLowerCase()
    const anonymity = (parts[3] || '').trim()
    const address = (parts[4] || '').trim()
    if (!['http', 'socks5', 'socks4'].includes(protocol)) continue
    const at = address.lastIndexOf(':')
    if (at < 1) continue
    const host = address.slice(0, at).trim()
    const port = Number.parseInt(address.slice(at + 1), 10)
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) continue
    const key = `${protocol}://${host}:${port}`
    if (seen.has(key)) continue
    seen.add(key)
    proxies.push({
      id: proxies.length + 1,
      key,
      country,
      code: countryCode(country),
      flag: flagFor(country),
      latencyMs,
      protocol,
      anonymity,
      host,
      port,
      supported: protocol === 'http' || protocol === 'socks5'
    })
  }
  return proxies
}

export function buildRotationOrder(proxies) {
  const byCountry = new Map()
  for (const proxy of proxies) {
    if (!proxy.supported) continue
    if (!byCountry.has(proxy.country)) byCountry.set(proxy.country, [])
    byCountry.get(proxy.country).push(proxy)
  }
  const groups = [...byCountry.values()]
  for (const group of groups) group.sort((a, b) => a.latencyMs - b.latencyMs)
  const ordered = []
  let added = true
  while (added) {
    added = false
    for (const group of groups) {
      const next = group.shift()
      if (next) {
        ordered.push(next)
        added = true
      }
    }
  }
  return ordered
}

export function poolSummary(proxies) {
  const supported = proxies.filter((p) => p.supported)
  return {
    total: proxies.length,
    usable: supported.length,
    http: supported.filter((p) => p.protocol === 'http').length,
    socks5: supported.filter((p) => p.protocol === 'socks5').length,
    skipped: proxies.length - supported.length,
    countries: new Set(supported.map((p) => p.country)).size
  }
}
