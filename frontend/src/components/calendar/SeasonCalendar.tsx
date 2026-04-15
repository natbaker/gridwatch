import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSchedule } from '../../hooks/useSchedule'
import { useSeason } from '../../hooks/useSeason'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import type { Race } from '../../types'

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const month = s.toLocaleDateString('en-US', { month: 'short' })
  return `${month} ${s.getDate()}–${e.getDate()}`
}

function useCountdown(targetDate: string) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const target = new Date(targetDate)
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  return { days, hours, minutes, seconds, isExpired: false }
}

function CountdownDisplay({ raceDate }: { raceDate: string }) {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(raceDate)
  if (isExpired) return <span className="text-green-400 font-mono text-xs">RACE DAY</span>

  return (
    <div className="flex gap-3 justify-center">
      {[
        { value: days, label: 'DAYS' },
        { value: hours, label: 'HRS' },
        { value: minutes, label: 'MIN' },
        { value: seconds, label: 'SEC' },
      ].map(({ value, label }) => (
        <div key={label} className="text-center">
          <div className="font-mono text-lg font-bold text-accent tabular-nums">
            {String(value).padStart(2, '0')}
          </div>
          <div className="text-[9px] text-text-tertiary tracking-wider">{label}</div>
        </div>
      ))}
    </div>
  )
}

function ExpandedRaceCard({ race }: { race: Race }) {
  const sessions = race.sessions ?? []
  let currentDay = ''

  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-4">
      <CountdownDisplay raceDate={race.race_date} />

      <div className="space-y-1.5">
        <h4 className="text-[10px] text-text-tertiary tracking-[2px] mb-2">WEEKEND SCHEDULE</h4>
        {sessions.map((session, i) => {
          const dt = new Date(session.start_utc)
          const dayLabel = dt.toLocaleDateString('en-US', { weekday: 'long' })
          const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const timeStr = dt.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short',
          })
          const showDay = dayLabel !== currentDay
          currentDay = dayLabel
          const isRace = session.name === 'Race'

          return (
            <div key={i}>
              {showDay && (
                <div className="text-[10px] text-text-tertiary font-mono mt-2 mb-1">
                  {dayLabel} · {dateStr}
                </div>
              )}
              <div className={`flex items-center justify-between py-1 px-2 rounded ${
                isRace ? 'bg-accent/10' : 'hover:bg-bg-elevated/50'
              }`}>
                <span className={`text-xs ${isRace ? 'font-semibold text-accent' : 'text-text-secondary'}`}>
                  {session.name}
                </span>
                <span className={`text-[10px] font-mono ${isRace ? 'text-accent' : 'text-text-tertiary'}`}>
                  {timeStr}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="text-[10px] text-text-tertiary text-center">
        {race.circuit} · {race.timezone.replace('_', ' ')}
      </div>
    </div>
  )
}

export function SeasonCalendar() {
  const { data, isLoading } = useSchedule()
  const { season } = useSeason()
  const [expandedRound, setExpandedRound] = useState<number | null>(null)

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <LoadingSkeleton key={i} className="h-36" />
        ))}
      </div>
    )
  }

  if (!data?.races?.length) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.races.map((race) => {
        const borderColor = race.is_cancelled
          ? 'border-l-red-500/50'
          : race.is_completed
          ? 'border-l-green-500'
          : 'border-l-accent'

        const isFuture = !race.is_completed && !race.is_cancelled
        const isExpanded = expandedRound === race.round

        const card = (
          <div
            className={`bg-bg-card border border-border rounded-xl p-4 border-l-4 ${borderColor} ${
              race.is_cancelled ? 'opacity-50' : ''
            } ${race.is_completed ? 'hover:border-green-500/50 transition-colors' : ''} ${
              isFuture ? 'cursor-pointer hover:border-accent/50 transition-colors' : ''
            } ${isExpanded ? 'border-accent/30' : ''}`}
            onClick={isFuture ? () => setExpandedRound(isExpanded ? null : race.round) : undefined}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-[10px] text-text-tertiary font-mono">R{race.round}</span>
              <span className="text-2xl leading-none">{race.flag_emoji}</span>
            </div>
            <h3 className={`text-sm font-semibold mb-1 ${race.is_cancelled ? 'line-through' : ''}`}>
              {race.name}
            </h3>
            <p className="text-xs text-text-secondary mb-2">
              {race.city}, {race.country}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-tertiary font-mono">
                {formatDateRange(race.date_start, race.date_end)}
              </span>
              {race.is_sprint_weekend && (
                <span className="px-1.5 py-0.5 bg-accent/15 text-accent text-[10px] rounded font-medium">
                  SPRINT
                </span>
              )}
              {race.is_cancelled && (
                <span className="px-1.5 py-0.5 bg-red-500/15 text-red-400 text-[10px] rounded font-medium">
                  CANCELLED
                </span>
              )}
              {race.is_completed && (
                <span className="flex items-center gap-3 ml-auto">
                  <Link
                    to={`/live?round=${race.round}&season=${season}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] text-accent hover:text-accent/80 font-medium"
                  >
                    REPLAY ▶
                  </Link>
                  <span className="text-[10px] text-green-400">RESULTS →</span>
                </span>
              )}
              {isFuture && (
                <span className="text-[10px] text-accent ml-auto">
                  {isExpanded ? 'COLLAPSE ▲' : 'SCHEDULE ▼'}
                </span>
              )}
            </div>

            {isExpanded && <ExpandedRaceCard race={race} />}
          </div>
        )

        return race.is_completed ? (
          <Link key={race.round} to={`/race/${race.round}`}>{card}</Link>
        ) : (
          <div key={race.round}>{card}</div>
        )
      })}
    </div>
  )
}
