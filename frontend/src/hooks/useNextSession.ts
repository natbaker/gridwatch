import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function useNextSession() {
  return useQuery({
    queryKey: ['next-session'],
    queryFn: api.getNextSession,
    staleTime: 0,
    refetchInterval: 60_000,
  })
}
