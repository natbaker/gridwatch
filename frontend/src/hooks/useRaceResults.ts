import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useSeason } from './useSeason'

export function useRaceResults(round: number, raceDate?: string) {
  const { season } = useSeason()
  return useQuery({
    queryKey: ['raceResults', season, round, raceDate],
    queryFn: () => api.getRaceResults(round, season, raceDate),
    staleTime: 60 * 60 * 1000,
    enabled: round > 0,
  })
}
