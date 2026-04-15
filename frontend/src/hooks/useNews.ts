import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function useNews() {
  return useQuery({
    queryKey: ['news'],
    queryFn: api.getNews,
    staleTime: 0,
    refetchInterval: 15 * 60 * 1000,
  })
}
