import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function useCarLocations(sessionKey?: number, enabled = true) {
  return useQuery({
    queryKey: ['carLocations', sessionKey],
    queryFn: () => api.getCarLocations(sessionKey),
    enabled,
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.cars?.length) return 2000  // 2s when we have data
      return 10000  // 10s when no data
    },
  })
}
