import type { Analytics, BrowserSession, DomainStat, HistoryPoint, Run, VerifiedMetric } from './types.js'

function dayKey(value: string): string {
  return value.slice(0, 10)
}

export function buildAnalytics(runs: Run[], verified: VerifiedMetric[]): Analytics {
  const sessions: BrowserSession[] = runs.flatMap((run) => run.sessions)
  const started = sessions.filter((session) => Boolean(session.startedAt))
  const analyzed = sessions.filter((session) => session.analysis)
  const successes = analyzed.filter((session) => session.analysis?.status === 'success').length
  const errors = sessions.filter((session) => session.status === 'error').length
  const blocked = sessions.filter((session) => session.status === 'blocked').length
  const ads = sessions.reduce((sum, session) => sum + session.ads.length, 0)
  const loadTimes = sessions.map((session) => session.page?.loadMs).filter((value): value is number => typeof value === 'number' && value > 0)
  const averageLoadMs = loadTimes.length ? Math.round(loadTimes.reduce((sum, value) => sum + value, 0) / loadTimes.length) : 0
  const domainCounts = new Map<string, { count: number; success: number }>()
  for (const session of sessions) {
    const domain = session.finalDomain || session.analysis?.finalDomain
    if (!domain) continue
    const entry = domainCounts.get(domain) || { count: 0, success: 0 }
    entry.count += 1
    if (session.analysis?.status === 'success') entry.success += 1
    domainCounts.set(domain, entry)
  }
  const topDomains: DomainStat[] = [...domainCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([domain, value]) => ({
      domain,
      count: value.count,
      successRate: value.count ? Math.round((value.success / value.count) * 100) : 0,
    }))

  const history: HistoryPoint[] = []
  const today = new Date()
  for (let offset = 13; offset >= 0; offset--) {
    const date = new Date(today)
    date.setUTCDate(today.getUTCDate() - offset)
    const key = date.toISOString().slice(0, 10)
    const daySessions = started.filter((session) => dayKey(session.completedAt || session.createdAt) === key)
    history.push({
      date: key,
      navigations: daySessions.length,
      completed: daySessions.filter((session) => session.status === 'complete' || session.status === 'blocked').length,
      errors: daySessions.filter((session) => session.status === 'error').length,
      ads: daySessions.reduce((sum, session) => sum + session.ads.length, 0),
    })
  }

  const statusMap = new Map<string, number>()
  for (const session of sessions) {
    const name = session.status === 'queued' ? 'Queued' : session.status.charAt(0).toUpperCase() + session.status.slice(1)
    statusMap.set(name, (statusMap.get(name) || 0) + 1)
  }
  const colorMap: Record<string, string> = {
    Complete: '#8b5cf6',
    Blocked: '#f59e0b',
    Error: '#f43f5e',
    Stopped: '#64748b',
    Paused: '#38bdf8',
    Queued: '#3f3f56',
    Resolving: '#a78bfa',
    Opening: '#a78bfa',
    Inspecting: '#a78bfa',
    Analyzing: '#a78bfa',
  }
  const statusBreakdown = [...statusMap.entries()].map(([name, value]) => ({
    name,
    value,
    color: colorMap[name] || '#64748b',
  }))

  const sources = [...new Set(verified.map((metric) => metric.source))]
  const currencies = [...new Set(verified.map((metric) => metric.currency))]
  const verifiedClicks = verified.length ? verified.reduce((sum, metric) => sum + metric.clicks, 0) : null
  const verifiedEarnings = verified.length && currencies.length <= 1 ? Math.round(verified.reduce((sum, metric) => sum + metric.earnings, 0) * 100) / 100 : null
  const verifiedCurrency = currencies.length === 1 ? currencies[0] : currencies.length > 1 ? 'MIXED' : null

  return {
    probes: started.length,
    redirectSuccessRate: analyzed.length ? Math.round((successes / analyzed.length) * 1000) / 10 : 0,
    loadingErrors: errors,
    adObservations: ads,
    blockedPages: blocked,
    averageLoadMs,
    uniqueDestinations: domainCounts.size,
    verifiedClicks,
    verifiedEarnings,
    verifiedCurrency,
    verifiedSource: sources.length ? sources.join(', ') : null,
    history,
    topDomains,
    statusBreakdown,
  }
}
