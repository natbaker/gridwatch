import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { LapTelemetryResponse } from '../types'

export type LapPreset = 'fastest' | 'last' | 'first'

export function useLapTelemetry(
  sessionKey: number | undefined,
  driverNumber: number | null,
  preset: LapPreset = 'fastest',
) {
  return useQuery<LapTelemetryResponse>({
    queryKey: ['lapTelemetry', sessionKey, driverNumber, preset],
    queryFn: () => api.getLapTelemetry(sessionKey!, driverNumber!, preset),
    enabled: !!sessionKey && !!driverNumber,
    staleTime: 5 * 60 * 1000, // 5 min — lap data doesn't change
    retry: 1,
  })
}
