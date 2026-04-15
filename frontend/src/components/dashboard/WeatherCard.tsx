import { useState } from 'react'
import { useWeather } from '../../hooks/useWeather'
import { useNextSession } from '../../hooks/useNextSession'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { ErrorState } from '../common/ErrorState'

const toF = (c: number) => Math.round(c * 9 / 5 + 32)

export function WeatherCard() {
  const { data: session } = useNextSession()
  const round = session?.race?.round ?? null
  const { data, isLoading, isError, refetch } = useWeather(round)
  const [unit, setUnit] = useState<'C' | 'F'>('C')

  if (isLoading) return <LoadingSkeleton className="h-60" />
  if (isError) return <ErrorState message="Weather unavailable" onRetry={refetch} />
  if (!data?.forecast?.length) return null

  const temp = (c: number) => unit === 'C' ? c : toF(c)
  const windLabel = unit === 'C' ? 'km/h' : 'mph'
  const wind = (kph: number) => unit === 'C' ? kph : Math.round(kph * 0.621)

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs text-text-secondary tracking-[2px]">WEATHER</h3>
        <div className="flex text-[10px] font-mono">
          <button
            onClick={() => setUnit('C')}
            className={`px-1.5 py-0.5 rounded-l border border-border ${unit === 'C' ? 'bg-accent/20 text-accent border-accent/30' : 'text-text-tertiary hover:text-text-secondary'}`}
          >°C</button>
          <button
            onClick={() => setUnit('F')}
            className={`px-1.5 py-0.5 rounded-r border border-l-0 border-border ${unit === 'F' ? 'bg-accent/20 text-accent border-accent/30' : 'text-text-tertiary hover:text-text-secondary'}`}
          >°F</button>
        </div>
      </div>
      <p className="text-xs text-text-tertiary mb-4">{data.location}</p>
      <div className="space-y-3">
        {data.forecast.map((day) => (
          <div key={day.date} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl w-8">{day.condition_icon}</span>
              <div>
                <span className="text-sm font-medium">{day.day_label}</span>
                <p className="text-xs text-text-tertiary">{day.condition}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-mono">
                <span className="text-text-primary">{temp(day.temp_high_c)}°</span>
                <span className="text-text-tertiary mx-1">/</span>
                <span className="text-text-tertiary">{temp(day.temp_low_c)}°</span>
              </div>
              <div className="text-[10px] text-text-tertiary">
                {day.precipitation_probability}% rain • {wind(day.wind_speed_kph)} {windLabel} {day.wind_direction}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
