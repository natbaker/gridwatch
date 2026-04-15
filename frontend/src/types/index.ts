export interface Race {
  round: number
  name: string
  country: string
  city: string
  circuit: string
  flag_emoji: string
  date_start: string
  date_end: string
  race_date: string
  is_sprint_weekend: boolean
  is_completed: boolean
  is_cancelled: boolean
  latitude: number
  longitude: number
  timezone: string
  sessions: { name: string; start_utc: string }[]
  result: PodiumResult | null
}

export interface PodiumResult {
  p1: RaceResultEntry | null
  p2: RaceResultEntry | null
  p3: RaceResultEntry | null
}

export interface RaceResultEntry {
  driver: string
  team: string
  abbreviation: string
  time: string | null
  gap: string | null
}

export interface ScheduleResponse {
  season: number
  total_races: number
  races: Race[]
  warnings: string[]
}

export interface NextSessionRace {
  round: number
  name: string
  country: string
  city: string
  circuit: string
  flag_emoji: string
  timezone: string
  is_sprint_weekend: boolean
}

export interface SessionInfo {
  name: string
  short_name: string
  start_utc: string
  end_utc: string | null
  is_live: boolean
}

export interface WeekendSession {
  name: string
  short_name: string
  start_utc: string
  end_utc: string | null
  status: 'upcoming' | 'live' | 'completed'
  session_key?: number
}

export interface NextSessionResponse {
  race: NextSessionRace
  session: SessionInfo
  weekend_sessions: WeekendSession[]
  warnings: string[]
}

export interface DriverStanding {
  position: number
  driver: string
  abbreviation: string
  team: string
  team_color: string
  points: number
  wins: number
}

export interface DriverStandingsResponse {
  season: number
  round: number
  standings: DriverStanding[]
  warnings: string[]
}

export interface ConstructorStanding {
  position: number
  constructor: string
  team_color: string
  points: number
  wins: number
}

export interface ConstructorStandingsResponse {
  season: number
  round: number
  standings: ConstructorStanding[]
  warnings: string[]
}

export interface SessionResultEntry {
  position: number
  driver: string
  abbreviation: string
  team: string
  team_color: string
  time: string | null
  gap: string | null
  eliminated_in: string | null
}

export interface QualifyingSegments {
  q3_cutoff: number
  q2_cutoff: number
}

export interface SessionResultResponse {
  session_key: number | null
  session_name: string
  short_name: string
  race_name: string
  round?: number
  results: SessionResultEntry[]
  qualifying_segments: QualifyingSegments | null
  warnings: string[]
}

export interface RaceResultEntry {
  position: number
  driver: string
  abbreviation: string
  team: string
  team_color: string
  time: string | null
  gap: string | null
  status: string | null
  grid: number | null
  laps: string | null
  fastest_lap_time: string | null
  fastest_lap_rank: string | null
  positions_gained: number | null
}

export interface QualifyingEntry {
  position: number
  driver: string
  abbreviation: string
  team: string
  team_color: string
  q1: string | null
  q2: string | null
  q3: string | null
}

export interface RaceResultsResponse {
  race_name: string
  round: number
  circuit: string
  date: string
  results: RaceResultEntry[]
  qualifying: QualifyingEntry[]
  warnings: string[]
}

export interface DayForecast {
  date: string
  day_label: string
  temp_high_c: number
  temp_low_c: number
  precipitation_probability: number
  condition: string
  condition_icon: string
  wind_speed_kph: number
  wind_direction: string
}

export interface WeatherResponse {
  round: number
  location: string
  forecast: DayForecast[]
  warnings: string[]
}

export interface Article {
  title: string
  source: string
  url: string
  published_utc: string | null
  summary: string | null
}

export interface NewsResponse {
  articles: Article[]
  last_updated_utc: string
  warnings: string[]
}

export interface LiveTimingEntry {
  position: number
  driver_number: number
  abbreviation: string
  full_name: string
  team: string
  team_color: string
  gap_to_leader: number | null
  interval: number | null
  last_lap: number | null
  best_lap: number | null
  is_personal_best: boolean
  is_session_best: boolean
  lap_number: number | null
  sector_1: number | null
  sector_2: number | null
  sector_3: number | null
  tire_compound: string
  tire_compound_short: string
  tire_compound_color: string
  tire_age: number
  pit_count: number
}

export interface LivePitStop {
  driver_number: number
  abbreviation: string
  team_color: string
  lap_number: number | null
  pit_duration: number | null
  date: string | null
}

export interface LiveSessionInfo {
  session_key: number
  session_name: string
  session_type: string
  circuit: string
  country: string
  date_start: string
  date_end: string | null
  is_live: boolean
}

export interface LiveTimingResponse {
  session: LiveSessionInfo | null
  drivers: LiveTimingEntry[]
  pit_stops: LivePitStop[]
  session_best_lap: number | null
  total_laps: number
  warnings: string[]
}

export interface CarLocation {
  driver_number: number
  abbreviation: string
  team_color: string
  x: number
  y: number
}

export interface CarLocationsResponse {
  cars: CarLocation[]
  warnings: string[]
  track_path?: string
  sector_indices?: number[]
  corners?: { number: number; x: number; y: number }[]
}

export interface ReplayInfo {
  session_key: number
  session_name: string
  circuit: string
  data_start: string
  data_end: string
  track_path: string
  mini_sectors: number[]
  drivers: Record<string, { abbreviation: string; team_color: string }>
  position_events: { t: number; n: number; p: number }[]
  interval_events: { t: number; n: number; g: number | null; i: number | null }[]
  race_control: { t: number; category: string; flag: string | null; message: string; sector?: number }[]
  lap_events: { t: number; lap: number }[]
  pit_events: { t: number; n: number; d: number | null; lap: number | null }[]
  weather_events: { t: number; air_temp: number | null; track_temp: number | null; humidity: number | null; wind_speed: number | null; wind_direction: number | null; rainfall: number }[]
  sector_indices: number[]
  corners: { number: number; x: number; y: number }[]
  radio_events: { t: number; n: number; url: string }[]
}

export interface TelemetrySample {
  t: number
  spd: number
  thr: number
  brk: number
  rpm: number
  gear: number
  drs: number
}

export interface TelemetryResponse {
  samples: TelemetrySample[]
}

export interface LapTelemetryChannels {
  distance_pct: number[]
  speed: number[]
  throttle: number[]
  brake: number[]
}

export interface LapTelemetryResponse {
  driver_number: number
  lap_number: number
  lap_time: string | null
  lap_preset: string
  channels: LapTelemetryChannels
}

export interface ReplayPosition {
  t: number
  n: number
  x: number
  y: number
}

export interface ReplayPositionsResponse {
  positions: ReplayPosition[]
}

export interface DriverProgression {
  round: number
  points: number
  position: number
  grid: number | null
  positions_gained: number | null
  dnf: boolean
}

export interface DriverSeries {
  code: string
  name: string
  team: string
  team_color: string
  total_points: number
  progression: DriverProgression[]
}

export interface ConstructorSeries {
  name: string
  team_color: string
  total_points: number
  progression: { round: number; points: number }[]
}

export interface SeasonProgressionResponse {
  season: number
  rounds: { round: number; name: string }[]
  drivers: DriverSeries[]
  constructors: ConstructorSeries[]
  warnings: string[]
}

export interface DriverStatsResponse {
  driver: {
    code: string
    name: string
    team: string
    team_color: string
    total_points: number
    races: number
    wins: number
    podiums: number
    top_10: number
    dnfs: number
    best_finish: number | null
    avg_finish: number | null
    avg_grid: number | null
    avg_positions_gained: number | null
    teammate: {
      code: string
      name: string
      total_points: number
      h2h: string
    } | null
    progression: DriverProgression[]
  } | null
  warnings: string[]
}

export interface PredictionsResponse {
  season: number
  total_rounds: number
  championship_probabilities: {
    code: string
    name: string
    team: string
    team_color: string
    current_points: number
    win_probability: number
    podium_probability: number
    avg_projected_points: number
    p10_points?: number
    p90_points?: number
  }[]
  form_guide: {
    code: string
    name: string
    team: string
    team_color: string
    season_avg_points: number
    recent_avg_points: number
    points_trend: number
    season_avg_finish: number
    recent_avg_finish: number
    finish_trend: number
    trending: string
  }[]
  teammate_battles: {
    team: string
    team_color: string
    driver_1: { code: string; name: string; points: number; race_wins: number; quali_wins: number }
    driver_2: { code: string; name: string; points: number; race_wins: number; quali_wins: number }
    total_races: number
    dominance: number
  }[]
  insights: {
    type: string
    title: string
    data: Record<string, unknown>[]
  }[]
  projections: {
    code: string
    name: string
    team_color: string
    current_points: number
    projected_points: number
    races_remaining: number
  }[]
  dnf_rates: {
    code: string
    name: string
    team_color: string
    dnfs: number
    races: number
    dnf_rate: number
  }[]
  warnings: string[]
}

export interface Video {
  title: string
  url: string
  video_id: string
  thumbnail: string
  published_utc: string | null
  channel: string
}

export interface VideosResponse {
  videos: Video[]
  warnings: string[]
}

export interface Countdown {
  days: number
  hours: number
  minutes: number
  seconds: number
  isExpired: boolean
}
