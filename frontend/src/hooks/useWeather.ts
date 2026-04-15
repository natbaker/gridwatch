import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function useWeather(round: number | null) {
  return useQuery({
    queryKey: ['weather', round],
    queryFn: () => api.getWeather(round!),
    enabled: round !== null,
    staleTime: 2 * 60 * 60 * 1000,
  })
}
