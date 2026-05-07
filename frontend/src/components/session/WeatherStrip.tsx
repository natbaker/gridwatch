import type { TrackWeather } from '../../hooks/useReplay'
import { windDir } from './utils'

export function WeatherStrip({ weather }: { weather: TrackWeather }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl px-4 py-2 flex items-center gap-4 sm:gap-6 text-[11px] font-mono text-text-secondary overflow-x-auto">
      {weather.rainfall > 0 && <span className="text-blue-400 font-semibold">🌧 RAIN</span>}
      {weather.air_temp != null && <span>AIR <span className="text-text-primary">{Math.round(weather.air_temp)}°C</span></span>}
      {weather.track_temp != null && <span>TRACK <span className="text-text-primary">{Math.round(weather.track_temp)}°C</span></span>}
      {weather.humidity != null && <span>HUM <span className="text-text-primary">{Math.round(weather.humidity)}%</span></span>}
      {weather.wind_speed != null && <span>WIND <span className="text-text-primary">{weather.wind_speed.toFixed(1)} km/h {windDir(weather.wind_direction)}</span></span>}
    </div>
  )
}
