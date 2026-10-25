import type {
  Analysis,
  Analytics,
  BrowserSession,
  ConfigStatus,
  Run,
  Snapshot,
  VerifiedMetric,
} from '../types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('linkpilot:unauthorized'))
  }
  if (!response.ok) {
    let message = `Request failed with HTTP ${response.status}.`
    try {
      const body = await response.json() as { error?: string; detail?: string }
      message = body.error || message
    } catch {
      // Preserve the HTTP fallback.
    }
    throw new ApiError(message, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export interface AuthStatus {
  authEnabled: boolean
  authenticated: boolean
  aiConfigured: boolean
  environment: string
}

export interface RunAction {
  id: string
  sessionCount: number
  url: string
  sessionId?: string
}

export const api = {
  authStatus: () => request<AuthStatus>('/api/auth/status'),
  login: (password: string) =>
    request<{ ok: boolean; authEnabled: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  snapshot: () => request<Snapshot>('/api/snapshot'),
  config: () => request<ConfigStatus>('/api/config'),
  analyze: (url: string, options?: { deep?: boolean; aiSummary?: boolean; passiveScroll?: boolean }) =>
    request<Analysis>('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ url, ...options }),
    }),
  analyzeBulk: (urls: string[], options?: { deep?: boolean }) =>
    request<{ results: { url: string; analysis?: Analysis; error?: string }[] }>('/api/analyze/bulk', {
      method: 'POST',
      body: JSON.stringify({ urls, ...options }),
    }),
  listAnalyses: (limit = 60) => request<Analysis[]>(`/api/analyses?limit=${limit}`),
  createRun: (url: string, sessionCount: number, options?: { deepInspect?: boolean; aiSummary?: boolean; passiveScroll?: boolean }) =>
    request<Run>('/api/runs', {
      method: 'POST',
      body: JSON.stringify({ url, sessionCount, options }),
    }),
  listRuns: () => request<Run[]>('/api/runs'),
  getRun: (id: string) => request<Run>(`/api/runs/${id}`),
  runAction: (runId: string, action: 'start' | 'pause' | 'resume' | 'stop') =>
    request<Run>(`/api/runs/${runId}/${action}`, { method: 'POST' }),
  sessionAction: (runId: string, sessionId: string, action: 'start' | 'pause' | 'resume' | 'stop') =>
    request<BrowserSession>(`/api/runs/${runId}/sessions/${sessionId}/${action}`, { method: 'POST' }),
  analytics: () => request<Analytics>('/api/analytics'),
  verifiedMetrics: () => request<VerifiedMetric[]>('/api/verified-metrics'),
  addVerifiedMetric: (payload: {
    source: string
    clicks: number
    impressions: number
    earnings: number
    currency: string
    periodStart: string
    periodEnd: string
    note?: string
  }) =>
    request<VerifiedMetric>('/api/verified-metrics', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteVerifiedMetric: (id: string) =>
    request<{ ok: boolean }>(`/api/verified-metrics/${id}`, { method: 'DELETE' }),
}

export function websocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

export function exportUrl(kind: 'runs' | 'analyses' | 'verified-metrics'): string {
  return `/api/export/${kind}`
}
