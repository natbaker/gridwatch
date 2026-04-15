from pydantic import BaseModel


# --- Health ---

class SourceStatus(BaseModel):
    jolpica: str = "unknown"
    openf1: str = "unknown"
    openmeteo: str = "unknown"
    rss: str = "unknown"


class HealthResponse(BaseModel):
    status: str
    version: str
    sources: SourceStatus


# --- Schedule ---

class RaceResult(BaseModel):
    driver: str
    team: str
    abbreviation: str
    time: str | None = None
    gap: str | None = None


class PodiumResult(BaseModel):
    p1: RaceResult | None = None
    p2: RaceResult | None = None
    p3: RaceResult | None = None


class Race(BaseModel):
    round: int
    name: str
    country: str
    city: str
    circuit: str
    flag_emoji: str
    date_start: str
    date_end: str
    race_date: str
    is_sprint_weekend: bool
    is_completed: bool
    is_cancelled: bool
    latitude: float
    longitude: float
    timezone: str
    result: PodiumResult | None = None


class ScheduleResponse(BaseModel):
    season: int
    total_races: int
    races: list[Race]
    warnings: list[str] = []


# --- Next Session ---

class NextSessionRace(BaseModel):
    round: int
    name: str
    country: str
    city: str
    circuit: str
    flag_emoji: str
    timezone: str
    is_sprint_weekend: bool


class SessionInfo(BaseModel):
    name: str
    short_name: str
    start_utc: str
    end_utc: str | None = None
    is_live: bool = False


class WeekendSession(BaseModel):
    name: str
    short_name: str
    start_utc: str
    end_utc: str | None = None
    status: str  # "upcoming" | "live" | "completed"


class NextSessionResponse(BaseModel):
    race: NextSessionRace
    session: SessionInfo
    weekend_sessions: list[WeekendSession]
    warnings: list[str] = []


# --- Standings ---

class DriverStanding(BaseModel):
    position: int
    driver: str
    abbreviation: str
    team: str
    team_color: str
    points: float
    wins: int


class DriverStandingsResponse(BaseModel):
    season: int
    round: int
    standings: list[DriverStanding]
    warnings: list[str] = []


class ConstructorStanding(BaseModel):
    position: int
    constructor: str
    team_color: str
    points: float
    wins: int


class ConstructorStandingsResponse(BaseModel):
    season: int
    round: int
    standings: list[ConstructorStanding]
    warnings: list[str] = []


# --- Results ---

class SessionResultEntry(BaseModel):
    position: int
    driver: str
    abbreviation: str
    team: str
    team_color: str
    time: str | None = None
    gap: str | None = None
    eliminated_in: str | None = None  # "Q1" | "Q2" | None


class QualifyingSegments(BaseModel):
    q3_cutoff: int = 10
    q2_cutoff: int = 15


class SessionResultResponse(BaseModel):
    session_key: int | None = None
    session_name: str
    short_name: str
    race_name: str
    results: list[SessionResultEntry]
    qualifying_segments: QualifyingSegments | None = None
    warnings: list[str] = []


# --- Weather ---

class DayForecast(BaseModel):
    date: str
    day_label: str
    temp_high_c: int
    temp_low_c: int
    precipitation_probability: int
    condition: str
    condition_icon: str
    wind_speed_kph: int
    wind_direction: str


class WeatherResponse(BaseModel):
    round: int
    location: str
    forecast: list[DayForecast]
    warnings: list[str] = []


# --- News ---

class Article(BaseModel):
    title: str
    source: str
    url: str
    published_utc: str | None = None
    summary: str | None = None


class NewsResponse(BaseModel):
    articles: list[Article]
    last_updated_utc: str
    warnings: list[str] = []


# --- Lap Telemetry ---

class TelemetryChannels(BaseModel):
    distance_pct: list[float]
    speed: list[int]
    throttle: list[int]
    brake: list[int]


class LapTelemetryResponse(BaseModel):
    driver_number: int
    lap_number: int
    lap_time: str | None
    lap_preset: str
    channels: TelemetryChannels
