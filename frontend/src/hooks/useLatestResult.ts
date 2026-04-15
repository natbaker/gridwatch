import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useSeason } from './useSeason'

export function useLatestResult() {
  const { season } = useSeason()
  return useQuery({
    queryKey: ['results', 'latest', season],
    queryFn: () => api.getLatestResults(season),
    staleTime: 60 * 60 * 1000,
  })
}
