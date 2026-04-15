import type {
  ScheduleResponse,
  NextSessionResponse,
  DriverStandingsResponse,
  ConstructorStandingsResponse,
  SessionResultResponse,
  RaceResultsResponse,
  LiveTimingResponse,
  CarLocationsResponse,
  ReplayInfo,
  ReplayPositionsResponse,
  TelemetryResponse,
  LapTelemetryResponse,
  SeasonProgressionResponse,
  DriverStatsResponse,
  PredictionsResponse,
  WeatherResponse,
  NewsResponse,
  VideosResponse,
} from '../types'

const BASE = '/api'

async function fetchJson<T>(path: string): Promise<T> {
  const resp = await fetch(`${BASE}${path}`)
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`)
  }
  return resp.json()
}

function seasonParam(season?: number): string {
  return season ? `?season=${season}` : ''
}

export const api = {
  getSchedule: (season?: number) => fetchJson<ScheduleResponse>(`/schedule${seasonParam(season)}`),
  getNextSession: () => fetchJson<NextSessionResponse>('/next-session'),
  getDriverStandings: (season?: number) => fetchJson<DriverStandingsResponse>(`/standings/drivers${seasonParam(season)}`),
  getConstructorStandings: (season?: number) => fetchJson<ConstructorStandingsResponse>(`/standings/constructors${seasonParam(season)}`),
  getLatestResults: (season?: number) => fetchJson<SessionResultResponse>(`/results/latest${seasonParam(season)}`),
  getRaceResults: (round: number, season?: number) => fetchJson<RaceResultsResponse>(`/results/race/${round}${seasonParam(season)}`),
  getSessionResult: (key: number) => fetchJson<SessionResultResponse>(`/results/session/${key}`),
  getWeather: (round: number) => fetchJson<WeatherResponse>(`/weather/${round}`),
  getLiveTiming: (sessionKey?: number) =>
    fetchJson<LiveTimingResponse>(sessionKey ? `/live-timing?session_key=${sessionKey}` : '/live-timing'),
  getSeasonProgression: (season?: number) => fetchJson<SeasonProgressionResponse>(`/analytics/progression${seasonParam(season)}`),
  getDriverStats: (code: string, season?: number) => fetchJson<DriverStatsResponse>(`/analytics/driver/${code}${seasonParam(season)}`),
  getPredictions: (season?: number) => fetchJson<PredictionsResponse>(`/analytics/predictions${seasonParam(season)}`),
  getNews: () => fetchJson<NewsResponse>('/news'),
  getVideos: () => fetchJson<VideosResponse>('/videos'),
  getCarLocations: (sessionKey?: number) =>
    fetchJson<CarLocationsResponse>(sessionKey ? `/live-timing/locations?session_key=${sessionKey}` : '/live-timing/locations'),
  getReplayInfo: (sessionKey: number) =>
    fetchJson<ReplayInfo>(`/live-timing/replay/info?session_key=${sessionKey}`),
  getReplayPositions: (sessionKey: number, from: string, seconds = 30) =>
    fetchJson<ReplayPositionsResponse>(`/live-timing/replay/positions?session_key=${sessionKey}&from=${encodeURIComponent(from)}&seconds=${seconds}`),
  getCarTelemetry: (sessionKey: number, driverNumber: number, from: string, seconds = 30) =>
    fetchJson<TelemetryResponse>(`/live-timing/replay/telemetry?session_key=${sessionKey}&driver_number=${driverNumber}&from=${encodeURIComponent(from)}&seconds=${seconds}`),
  getSessionKey: (year: number, round: number, sessionType = 'Race') =>
    fetchJson<{ session_key: number | null }>(`/live-timing/session-key?year=${year}&round=${round}&session_type=${sessionType}`),
  getLapTelemetry: (sessionKey: number, driverNumber: number, lap = 'fastest') =>
    fetchJson<LapTelemetryResponse>(`/sessions/${sessionKey}/lap-telemetry?driver_number=${driverNumber}&lap=${lap}`),
}
