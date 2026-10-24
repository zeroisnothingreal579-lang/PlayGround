import { toCsv } from './util.mjs'

const DAY = 86_400_000

export function rangeDays(range) {
  if (range === '24h') return 1
  if (range === '30d') return 30
  if (range === '90d') return 90
  return 7
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10)
}

function within(value, from) {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) && time >= from
}

export function buildAnalytics(state, range = '7d') {
  const days = rangeDays(range)
  const from = Date.now() - days * DAY
  const sessions = state.sessions.filter((session) => within(session.createdAt, from))
  const inspections = state.inspections.filter((inspection) => within(inspection.createdAt || inspection.inspectedAt, from))
  const ads = state.adEvents.filter((event) => within(event.detectedAt, from))
  const verified = (state.integrations?.verifiedEvents || []).filter((event) => within(event.at, from))
  const completed = sessions.filter((session) => session.status === 'completed')
  const errors = sessions.filter((session) => session.status === 'error')
  const running = sessions.filter((session) => ['queued', 'launching', 'loading', 'active', 'paused'].includes(session.status))
  const redirectSuccess = inspections.filter((inspection) => ['ok', 'captcha', 'blocked'].includes(inspection.pageStatus) && !inspection.error)
  const domains = new Map()
  for (const inspection of inspections) {
    if (!inspection.finalDomain) continue
    domains.set(inspection.finalDomain, (domains.get(inspection.finalDomain) || 0) + 1)
  }
  for (const session of sessions) {
    if (!session.finalDomain) continue
    domains.set(session.finalDomain, (domains.get(session.finalDomain) || 0) + 1)
  }
  const buckets = []
  const today = new Date()
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getTime() - offset * DAY)
    const key = dayKey(date)
    buckets.push({
      date: key,
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      sessions: sessions.filter((session) => dayKey(session.createdAt) === key).length,
      inspections: inspections.filter((inspection) => dayKey(inspection.createdAt || inspection.inspectedAt) === key).length,
      ads: ads.filter((event) => dayKey(event.detectedAt) === key).length,
    })
  }
  const verifiedClicks = verified.filter((event) => event.type === 'click').reduce((sum, event) => sum + (Number(event.value) || 0), 0)
  const verifiedImpressions = verified.filter((event) => event.type === 'impression').reduce((sum, event) => sum + (Number(event.value) || 0), 0)
  const verifiedEarnings = verified.filter((event) => event.type === 'earning').reduce((sum, event) => sum + (Number(event.value) || 0), 0)
  return {
    range,
    generatedAt: new Date().toISOString(),
    totals: {
      sessions: sessions.length,
      completed: completed.length,
      running: running.length,
      errors: errors.length,
      successRate: sessions.length ? Math.round((completed.length / sessions.length) * 100) : 0,
      inspections: inspections.length,
      redirectSuccessRate: inspections.length ? Math.round((redirectSuccess.length / inspections.length) * 100) : 0,
      redirectCount: inspections.reduce((sum, inspection) => sum + (inspection.redirectCount || 0), 0),
      adSessions: sessions.filter((session) => session.ads?.detected).length,
      adDetections: ads.length,
      verifiedClicks,
      verifiedImpressions,
      verifiedEarnings,
      verifiedEventCount: verified.length,
    },
    series: buckets,
    domains: [...domains.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    pageStatuses: inspections.reduce((acc, inspection) => {
      acc[inspection.pageStatus] = (acc[inspection.pageStatus] || 0) + 1
      return acc
    }, {}),
    recentSessions: [...sessions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8),
    recentInspections: [...inspections].sort((a, b) => new Date(b.createdAt || b.inspectedAt) - new Date(a.createdAt || a.inspectedAt)).slice(0, 8),
    integrity: {
      verifiedSource: state.integrations?.verifiedEvents?.length ? 'authorized integration' : 'not connected',
      adEventMeaning: 'Advertising elements detected in a page. These are not verified impressions.',
      visitorMeaning: 'Browser sessions are automation runs, not human visitors.',
      lastIntegrationSync: state.integrations?.lastSyncAt || null,
    },
  }
}

export function sessionsCsv(state) {
  return toCsv(
    [...state.sessions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [
      { label: 'session_id', value: (row) => row.id },
      { label: 'job_id', value: (row) => row.jobId },
      { label: 'status', value: (row) => row.status },
      { label: 'original_url', value: (row) => row.originalUrl },
      { label: 'final_url', value: (row) => row.finalUrl },
      { label: 'destination_domain', value: (row) => row.finalDomain },
      { label: 'ads_detected', value: (row) => Boolean(row.ads?.detected) },
      { label: 'ad_networks', value: (row) => row.ads?.networks?.join(' | ') || '' },
      { label: 'worker', value: (row) => row.workerId },
      { label: 'region', value: (row) => row.region },
      { label: 'created_at', value: (row) => row.createdAt },
      { label: 'ended_at', value: (row) => row.endedAt },
    ],
  )
}

export function inspectionsCsv(state) {
  return toCsv(
    [...state.inspections].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [
      { label: 'inspection_id', value: (row) => row.id },
      { label: 'original_url', value: (row) => row.originalUrl },
      { label: 'final_url', value: (row) => row.finalUrl },
      { label: 'final_domain', value: (row) => row.finalDomain },
      { label: 'page_status', value: (row) => row.pageStatus },
      { label: 'http_status', value: (row) => row.statusCode },
      { label: 'redirect_count', value: (row) => row.redirectCount },
      { label: 'risk', value: (row) => row.risk?.level },
      { label: 'ad_networks', value: (row) => row.ads?.networks?.join(' | ') || '' },
      { label: 'inspected_at', value: (row) => row.inspectedAt },
    ],
  )
}
