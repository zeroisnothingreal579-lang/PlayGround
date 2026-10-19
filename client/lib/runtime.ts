import { useQuery } from '@tanstack/react-query'
import type { RuntimeInfo } from '@shared/contracts'
import { get } from '../lib/api'

export function useRuntime() {
  return useQuery<RuntimeInfo>({
    queryKey: ['runtime'],
    queryFn: () => get<RuntimeInfo>('/system/runtime'),
    refetchInterval: 20_000,
    staleTime: 10_000,
  })
}
