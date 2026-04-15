import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useSeason } from './useSeason'

export function useDriverStandings() {
  const { season } = useSeason()
  return useQuery({
    queryKey: ['standings', 'drivers', season],
    queryFn: () => api.getDriverStandings(season),
    staleTime: 30 * 60 * 1000,
  })
}

export function useConstructorStandings() {
  const { season } = useSeason()
  return useQuery({
    queryKey: ['standings', 'constructors', season],
    queryFn: () => api.getConstructorStandings(season),
    staleTime: 30 * 60 * 1000,
  })
}
