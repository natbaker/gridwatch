import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useSeason } from './useSeason'

export function useQualifyingResults(round: number, raceDate?: string) {
  const { season } = useSeason()
  return useQuery({
    queryKey: ['qualifyingResults', season, round, raceDate],
    queryFn: () => api.getQualifyingResults(round, season, raceDate),
    staleTime: 60 * 60 * 1000,
    enabled: round > 0,
  })
}
