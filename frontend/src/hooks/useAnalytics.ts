import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useSeason } from './useSeason'

export function useSeasonProgression() {
  const { season } = useSeason()
  return useQuery({
    queryKey: ['analytics', 'progression', season],
    queryFn: () => api.getSeasonProgression(season),
    staleTime: 60 * 60 * 1000,
  })
}

export function useDriverStats(code: string) {
  const { season } = useSeason()
  return useQuery({
    queryKey: ['analytics', 'driver', code, season],
    queryFn: () => api.getDriverStats(code, season),
    staleTime: 60 * 60 * 1000,
    enabled: !!code,
  })
}

export function usePredictions() {
  const { season } = useSeason()
  return useQuery({
    queryKey: ['analytics', 'predictions', season],
    queryFn: () => api.getPredictions(season),
    staleTime: 60 * 60 * 1000,
  })
}
