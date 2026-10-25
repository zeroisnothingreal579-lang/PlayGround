import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api, ApiError, websocketUrl, type AuthStatus } from './api'
import { isTerminal } from './utils'
import type {
  Analytics,
  BrowserSession,
  ConfigStatus,
  Run,
  RunOptions,
  ServerMetric,
  Snapshot,
  VerifiedMetric,
} from '../types'

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: string
  kind: ToastKind
  message: string
}

interface AppContextValue {
  bootstrapping: boolean
  authenticated: boolean
  auth: AuthStatus | null
  snapshot: Snapshot | null
  runs: Run[]
  servers: ServerMetric[]
  analytics: Analytics | null
  config: ConfigStatus | null
  verifiedMetrics: VerifiedMetric[]
  connected: boolean
  selectedRunId: string | null
  selectedRun: Run | null
  toasts: Toast[]
  login: (password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  selectRun: (runId: string | null) => void
  launchRun: (url: string, count: number, options?: Partial<RunOptions>) => Promise<Run>
  runAction: (runId: string, action: 'start' | 'pause' | 'resume' | 'stop') => Promise<void>
  sessionAction: (runId: string, sessionId: string, action: 'start' | 'pause' | 'resume' | 'stop') => Promise<void>
  notify: (message: string, kind?: ToastKind) => void
  notifyError: (error: unknown) => void
  dismissToast: (id: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

function mergeRun(runs: Run[], incoming: Run): Run[] {
  const map = new Map(runs.map((run) => [run.id, run]))
  map.set(incoming.id, incoming)
  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [bootstrapping, setBootstrapping] = useState(true)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [servers, setServers] = useState<ServerMetric[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [config, setConfig] = useState<ConfigStatus | null>(null)
  const [verifiedMetrics, setVerifiedMetrics] = useState<VerifiedMetric[]>([])
  const [connected, setConnected] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(() => localStorage.getItem('linkpilot:run'))
  const [toasts, setToasts] = useState<Toast[]>([])
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<number | null>(null)
  const pollRef = useRef<number | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const selectedRef = useRef(selectedRunId)
  selectedRef.current = selectedRunId

  const notify = useCallback((message: string, kind: ToastKind = 'info') => {
    const toast = { id: makeId(), kind, message }
    setToasts((current) => [...current.slice(-3), toast])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id))
    }, 4400)
  }, [])

  const notifyError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) return
    notify(error instanceof Error ? error.message : 'Unexpected request failure.', 'error')
  }, [notify])

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const applySnapshot = useCallback((data: Snapshot) => {
    setSnapshot(data)
    setRuns(data.runs)
    setServers(data.servers)
    setAnalytics(data.analytics)
    setConfig(data.config)
    setVerifiedMetrics(data.verifiedMetrics)
    const desired = selectedRef.current
    const valid = desired && data.runs.some((run) => run.id === desired)
    if (!valid) {
      const preferred = data.runs.find((run) => run.status === 'running' || run.status === 'paused') || data.runs[0]
      if (preferred) {
        setSelectedRunId(preferred.id)
        localStorage.setItem('linkpilot:run', preferred.id)
      }
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [data, analyticsData, verified] = await Promise.all([
        api.snapshot(),
        api.analytics(),
        api.verifiedMetrics(),
      ])
      setSnapshot(data)
      setRuns(data.runs)
      setServers(data.servers)
      setConfig(data.config)
      setAnalytics(analyticsData)
      setVerifiedMetrics(verified)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      notifyError(error)
    }
  }, [notifyError])

  const scheduleDerivedRefresh = useCallback(() => {
    if (refreshTimerRef.current) return
    refreshTimerRef.current = window.setTimeout(async () => {
      refreshTimerRef.current = null
      try {
        const [analyticsData, verified] = await Promise.all([api.analytics(), api.verifiedMetrics()])
        setAnalytics(analyticsData)
        setVerifiedMetrics(verified)
      } catch {
        // The live socket will retry; derived analytics are non-critical.
      }
    }, 1200)
  }, [])

  const connectSocket = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) return
    const socket = new WebSocket(websocketUrl())
    socketRef.current = socket
    socket.onopen = () => {
      setConnected(true)
      if (reconnectRef.current) {
        window.clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
    }
    socket.onclose = () => {
      setConnected(false)
      if (socketRef.current === socket) socketRef.current = null
      reconnectRef.current = window.setTimeout(() => connectSocket(), 3000)
    }
    socket.onerror = () => {
      setConnected(false)
    }
    socket.onmessage = (event) => {
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(event.data as string) as Record<string, unknown>
      } catch {
        return
      }
      if (payload.type === 'connected') {
        setConnected(true)
        return
      }
      if ((payload.type === 'run.created' || payload.type === 'run.updated' || payload.type === 'session.updated') && payload.run) {
        const run = payload.run as Run
        setRuns((current) => mergeRun(current, run))
        if (run.status === 'complete' || run.status === 'stopped' || run.status === 'error' || run.status === 'paused') {
          scheduleDerivedRefresh()
        }
        const selected = selectedRef.current
        if (!selected) {
          setSelectedRunId(run.id)
          localStorage.setItem('linkpilot:run', run.id)
        }
        if (run.sessions.some((session) => isTerminal(session.status)) || run.status !== 'running') {
          scheduleDerivedRefresh()
        }
        return
      }
      if (payload.type === 'run.tick' && Array.isArray(payload.ticks)) {
        const runId = String(payload.runId || '')
        const ticks = payload.ticks as { id: string; elapsedMs: number; progress: number }[]
        setRuns((current) => current.map((run) => {
          if (run.id !== runId) return run
          const tickMap = new Map(ticks.map((tick) => [tick.id, tick]))
          return {
            ...run,
            sessions: run.sessions.map((session) => {
              const tick = tickMap.get(session.id)
              return tick ? { ...session, elapsedMs: tick.elapsedMs, progress: tick.progress } : session
            }),
          }
        }))
        return
      }
      if (payload.type === 'server.metrics' && Array.isArray(payload.servers)) {
        setServers(payload.servers as ServerMetric[])
        return
      }
      if (payload.type === 'integration.metrics' || payload.type === 'analysis.created') {
        scheduleDerivedRefresh()
        return
      }
    }
  }, [scheduleDerivedRefresh])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const status = await api.authStatus()
        if (cancelled) return
        setAuth(status)
        if (!status.authEnabled || status.authenticated) {
          const data = await api.snapshot()
          if (!cancelled) applySnapshot(data)
        }
      } catch (error) {
        if (!cancelled) notifyError(error)
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    })()
    const unauthorized = () => {
      setAuth((current) => current ? { ...current, authenticated: false } : current)
      setSnapshot(null)
    }
    window.addEventListener('linkpilot:unauthorized', unauthorized)
    return () => {
      cancelled = true
      window.removeEventListener('linkpilot:unauthorized', unauthorized)
    }
  }, [applySnapshot, notifyError])

  const authenticated = Boolean(auth && (!auth.authEnabled || auth.authenticated))

  useEffect(() => {
    if (!authenticated) {
      socketRef.current?.close()
      socketRef.current = null
      setConnected(false)
      return
    }
    connectSocket()
    const poll = window.setInterval(() => {
      if (socketRef.current?.readyState !== WebSocket.OPEN) {
        void refresh()
      }
    }, 12_000)
    pollRef.current = poll
    return () => {
      window.clearInterval(poll)
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [authenticated, connectSocket, refresh])

  const login = useCallback(async (password: string) => {
    await api.login(password)
    const status = await api.authStatus()
    setAuth(status)
    const data = await api.snapshot()
    applySnapshot(data)
    notify('Signed in to the control center.', 'success')
  }, [applySnapshot, notify])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setAuth((current) => current ? { ...current, authenticated: false } : current)
      setSnapshot(null)
      setRuns([])
      setSelectedRunId(null)
      localStorage.removeItem('linkpilot:run')
    }
  }, [])

  const selectRun = useCallback((runId: string | null) => {
    setSelectedRunId(runId)
    if (runId) localStorage.setItem('linkpilot:run', runId)
    else localStorage.removeItem('linkpilot:run')
  }, [])

  const launchRun = useCallback(async (url: string, count: number, options?: Partial<RunOptions>) => {
    const run = await api.createRun(url, count, options)
    setRuns((current) => mergeRun(current, run))
    selectRun(run.id)
    notify(`Probe run started with ${run.sessionCount} session${run.sessionCount === 1 ? '' : 's'}.`, 'success')
    return run
  }, [notify, selectRun])

  const runAction = useCallback(async (runId: string, action: 'start' | 'pause' | 'resume' | 'stop') => {
    const run = await api.runAction(runId, action)
    setRuns((current) => mergeRun(current, run))
    notify(`Run ${action} command accepted.`, action === 'stop' ? 'info' : 'success')
  }, [notify])

  const sessionAction = useCallback(async (runId: string, sessionId: string, action: 'start' | 'pause' | 'resume' | 'stop') => {
    await api.sessionAction(runId, sessionId, action)
    notify(`Session ${action} command accepted.`, action === 'stop' ? 'info' : 'success')
  }, [notify])

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) || null,
    [runs, selectedRunId],
  )

  const value: AppContextValue = {
    bootstrapping,
    authenticated,
    auth,
    snapshot,
    runs,
    servers,
    analytics,
    config,
    verifiedMetrics,
    connected,
    selectedRunId,
    selectedRun,
    toasts,
    login,
    logout,
    refresh,
    selectRun,
    launchRun,
    runAction,
    sessionAction,
    notify,
    notifyError,
    dismissToast,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppProvider')
  return value
}

export type { BrowserSession }
