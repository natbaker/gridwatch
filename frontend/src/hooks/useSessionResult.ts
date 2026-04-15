import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function useSessionResult(sessionKey: number | null) {
  return useQuery({
    queryKey: ['results', 'session', sessionKey],
    queryFn: () => api.getSessionResult(sessionKey!),
    enabled: sessionKey !== null,
    staleTime: 60 * 60 * 1000,
  })
}
