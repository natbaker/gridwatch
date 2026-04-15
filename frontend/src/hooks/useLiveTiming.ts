import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function useLiveTiming(sessionKey?: number, enabled = true) {
  return useQuery({
    queryKey: ['liveTiming', sessionKey],
    queryFn: () => api.getLiveTiming(sessionKey),
    enabled,
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.session?.is_live) return 5000
      if (data?.drivers?.length) return 30000
      return 60000
    },
  })
}
