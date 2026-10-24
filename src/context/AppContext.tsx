import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, ApiError, connectRealtime, getToken, setToken, type RealtimeMessage } from '../lib/api'
import type { Health, NavKey, Overview } from '../lib/types'

interface Toast {
  id: number
  message: string
  tone: 'success' | 'error' | 'info' | 'warn'
}

interface AppContextValue {
  page: NavKey
  navigate: (page: NavKey) => void
  health: Health | null
  overview: Overview | null
  loading: boolean
  bootError: string
  revision: number
  realtime: 'connecting' | 'online' | 'offline'
  authRequired: boolean
  globalSearch: string
  setGlobalSearch: (value: string) => void
  refresh: () => Promise<void>
  notify: (message: string, tone?: Toast['tone']) => void
  submitToken: (token: string) => Promise<boolean>
  markAuthRequired: () => void
  toasts: Toast[]
}

const AppContext = createContext<AppContextValue | null>(null)

const validPages: NavKey[] = ['overview', 'inspector', 'sessions', 'advertising', 'servers', 'analytics', 'activity', 'settings']

function pageFromHash(): NavKey {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return validPages.includes(hash as NavKey) ? (hash as NavKey) : 'overview'
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<NavKey>(pageFromHash)
  const [health, setHealth] = useState<Health | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [bootError, setBootError] = useState('')
  const [revision, setRevision] = useState(0)
  const [realtime, setRealtime] = useState<'connecting' | 'online' | 'offline'>('connecting')
  const [authRequired, setAuthRequired] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const refreshTimer = useRef<number | undefined>(undefined)
  const initialised = useRef(false)

  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    toastId.current += 1
    const toast = { id: toastId.current, message, tone }
    setToasts((current) => [...current.slice(-2), toast])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 4200)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const data = await api.overview()
      setOverview(data)
      setBootError('')
      setAuthRequired(false)
    } catch (error) {
      if (error instanceof ApiError && error.authRequired) setAuthRequired(true)
      else setBootError(error instanceof Error ? error.message : 'Unable to reach the LinkPilot API')
    }
  }, [])

  const boot = useCallback(async () => {
    setLoading(true)
    try {
      const status = await api.authStatus()
      if (status.authRequired && !getToken()) {
        setAuthRequired(true)
        setLoading(false)
        return
      }
      const nextHealth = await api.health()
      setHealth(nextHealth)
      await refresh()
    } catch (error) {
      setBootError(error instanceof Error ? error.message : 'Unable to reach the LinkPilot API')
    } finally {
      setLoading(false)
    }
  }, [refresh])

  useEffect(() => {
    if (initialised.current) return
    initialised.current = true
    void boot()
  }, [boot])

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHashChange)
    if (!window.location.hash) window.history.replaceState(null, '', '#overview')
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((next: NavKey) => {
    window.location.hash = `#${next}`
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (authRequired) return
    const disconnect = connectRealtime(
      (message: RealtimeMessage) => {
        setRevision((value) => value + 1)
        if (['session:update', 'job:update', 'stats:update', 'activity', 'ad:new'].includes(message.type)) {
          if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
          refreshTimer.current = window.setTimeout(() => void refresh(), 450)
        }
      },
      setRealtime,
    )
    return () => {
      disconnect()
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
    }
  }, [authRequired, refresh])

  const submitToken = useCallback(async (token: string) => {
    try {
      await api.verifyToken(token)
      setToken(token)
      setAuthRequired(false)
      setLoading(true)
      const nextHealth = await api.health()
      setHealth(nextHealth)
      await refresh()
      setLoading(false)
      return true
    } catch {
      return false
    }
  }, [refresh])

  const markAuthRequired = useCallback(() => setAuthRequired(true), [])

  const value = useMemo<AppContextValue>(
    () => ({
      page,
      navigate,
      health,
      overview,
      loading,
      bootError,
      revision,
      realtime,
      authRequired,
      globalSearch,
      setGlobalSearch,
      refresh,
      notify,
      submitToken,
      markAuthRequired,
      toasts,
    }),
    [page, navigate, health, overview, loading, bootError, revision, realtime, authRequired, globalSearch, refresh, notify, submitToken, markAuthRequired, toasts],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within AppProvider')
  return context
}
