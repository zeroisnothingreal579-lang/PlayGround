import { createContext, useCallback, useContext, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Plan, UsageSummary, User } from '@shared/contracts'
import { ApiError, api, get, post } from './api'

export interface MeResponse {
  user: User
  plan: Plan
  usage: UsageSummary
}

interface AuthContextValue {
  user: User | null
  plan: Plan | null
  usage: UsageSummary | null
  loading: boolean
  login: (email: string, password: string) => Promise<MeResponse>
  register: (name: string, email: string, password: string) => Promise<MeResponse>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  setPlan: (plan: Plan) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const query = useQuery<MeResponse | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await get<MeResponse>('/auth/me')
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: 30_000,
    retry: false,
  })

  const login = useCallback(async (email: string, password: string) => {
    const result = await post<MeResponse>('/auth/login', { email, password })
    const me = await get<MeResponse>('/auth/me')
    queryClient.setQueryData(['me'], me)
    void queryClient.invalidateQueries()
    return result
  }, [queryClient])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await post<MeResponse>('/auth/register', { name, email, password })
    const me = await get<MeResponse>('/auth/me')
    queryClient.setQueryData(['me'], me)
    void queryClient.invalidateQueries()
    return result
  }, [queryClient])

  const logout = useCallback(async () => {
    await post('/auth/logout')
    queryClient.setQueryData(['me'], null)
    queryClient.clear()
  }, [queryClient])

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['me'] })
  }, [queryClient])

  const setPlan = useCallback((plan: Plan) => {
    queryClient.setQueryData<MeResponse | null>(['me'], (current) => (current ? { ...current, plan } : current))
    void queryClient.invalidateQueries({ queryKey: ['me'] })
  }, [queryClient])

  const value = useMemo<AuthContextValue>(() => ({
    user: query.data?.user || null,
    plan: query.data?.plan || null,
    usage: query.data?.usage || null,
    loading: query.isLoading,
    login,
    register,
    logout,
    refresh,
    setPlan,
  }), [query.data, query.isLoading, login, register, logout, refresh, setPlan])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

export function useApiQuery<T>(key: unknown[], path: string, options: { refetchInterval?: number | false; enabled?: boolean } = {}) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => api<T>(path),
    refetchInterval: options.refetchInterval,
    enabled: options.enabled,
  })
}
