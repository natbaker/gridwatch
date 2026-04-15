import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useSeason } from './useSeason'

export function useSchedule() {
  const { season } = useSeason()
  return useQuery({
    queryKey: ['schedule', season],
    queryFn: () => api.getSchedule(season),
    staleTime: 60 * 60 * 1000,
  })
}
