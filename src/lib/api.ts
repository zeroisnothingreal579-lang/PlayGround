import type {
  AdsResponse,
  Analytics,
  BrowserSession,
  Health,
  Inspection,
  IntegrationsPayload,
  Job,
  Overview,
  Policy,
  ServersResponse,
  SettingsPayload,
} from './types'

const TOKEN_KEY = 'linkpilot.access-token'

export class ApiError extends Error {
  status: number
  authRequired: boolean
  constructor(message: string, status: number, authRequired = false) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.authRequired = authRequired
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(path, { ...init, headers })
  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    const message = typeof body === 'string' ? body : body?.error || `Request failed (${response.status})`
    throw new ApiError(message, response.status, Boolean(body?.authRequired || response.status === 401))
  }
  return body as T
}

export const api = {
  health: () => request<Health>('/api/health'),
  authStatus: () => request<{ authRequired: boolean; authenticated: boolean }>('/api/auth/status'),
  verifyToken: (token: string) => request<{ ok: boolean }>('/api/auth/verify', { method: 'POST', body: JSON.stringify({ token }) }),
  overview: (range = '7d') => request<Overview>(`/api/overview?range=${encodeURIComponent(range)}`),
  inspect: (urls: string[]) => request<{ inspections: Inspection[]; accepted: number }>('/api/inspect', { method: 'POST', body: JSON.stringify({ urls }) }),
  inspections: (limit = 100) => request<{ inspections: Inspection[] }>(`/api/inspections?limit=${limit}`),
  inspection: (id: string) => request<{ inspection: Inspection }>(`/api/inspections/${id}`),
  inspectWithAi: (id: string) => request<{ analysis: Inspection['ai'] }>(`/api/inspections/${id}/ai`, { method: 'POST' }),
  jobs: () => request<{ jobs: Job[] }>('/api/jobs'),
  job: (id: string) => request<{ job: Job; sessions: BrowserSession[] }>(`/api/jobs/${id}`),
  createJob: (payload: { url: string; count: number; engine: string }) =>
    request<{ job: Job; sessions: BrowserSession[] }>('/api/jobs', { method: 'POST', body: JSON.stringify(payload) }),
  jobAction: (id: string, action: 'start' | 'pause' | 'resume' | 'stop') =>
    request<{ job: Job }>(`/api/jobs/${id}/action`, { method: 'POST', body: JSON.stringify({ action }) }),
  sessions: (jobId?: string, limit = 200) =>
    request<{ sessions: BrowserSession[] }>(`/api/sessions?limit=${limit}${jobId ? `&jobId=${encodeURIComponent(jobId)}` : ''}`),
  session: (id: string) => request<{ session: BrowserSession }>(`/api/sessions/${id}`),
  sessionAction: (id: string, action: 'pause' | 'resume' | 'stop') =>
    request<{ session: BrowserSession }>(`/api/sessions/${id}/action`, { method: 'POST', body: JSON.stringify({ action }) }),
  analytics: (range = '7d') => request<Analytics>(`/api/analytics?range=${range}`),
  ads: () => request<AdsResponse>('/api/ads'),
  servers: () => request<ServersResponse>('/api/servers'),
  activity: (limit = 150) => request<{ events: Overview['activity'] }>(`/api/activity?limit=${limit}`),
  policy: () => request<Policy>('/api/policy'),
  settings: () => request<SettingsPayload>('/api/settings'),
  updateSettings: (patch: Record<string, unknown>) =>
    request<{ settings: SettingsPayload['settings']; note: string }>('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
  testAi: () => request<{ configured: boolean; ok: boolean; message: string }>('/api/settings/test-ai', { method: 'POST' }),
  testAnalytics: () => request<{ imported: number; received: number; syncedAt: string }>('/api/settings/test-analytics', { method: 'POST' }),
  integrations: () => request<IntegrationsPayload>('/api/integrations'),
  exportCsv: async (kind: 'sessions' | 'inspections') => {
    const headers = new Headers()
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    try {
      const response = await fetch(`/api/analytics/export.csv?kind=${kind}`, { headers })
      if (!response.ok) throw new ApiError(`Export failed (${response.status})`, response.status, response.status === 401)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `linkpilot-${kind}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Export failed')
    }
  },
}

export interface RealtimeMessage {
  type: string
  [key: string]: unknown
}

export function connectRealtime(onMessage: (message: RealtimeMessage) => void, onState: (state: 'connecting' | 'online' | 'offline') => void) {
  let socket: WebSocket | null = null
  let retry = 0
  let closed = false
  let retryTimer: number | undefined

  const connect = () => {
    if (closed) return
    onState('connecting')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = getToken()
    const url = `${protocol}//${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`
    try {
      socket = new WebSocket(url)
    } catch {
      onState('offline')
      return
    }
    socket.onopen = () => {
      retry = 0
      onState('online')
    }
    socket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data) as RealtimeMessage)
      } catch {
        // Ignore malformed frames.
      }
    }
    socket.onclose = () => {
      onState('offline')
      if (closed) return
      retry = Math.min(retry + 1, 6)
      retryTimer = window.setTimeout(connect, 900 * retry)
    }
    socket.onerror = () => socket?.close()
  }

  connect()
  return () => {
    closed = true
    if (retryTimer) window.clearTimeout(retryTimer)
    socket?.close()
  }
}
