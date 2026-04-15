import { useDriverStandings, useConstructorStandings } from '../../hooks/useStandings'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { ErrorState } from '../common/ErrorState'
import type { DriverStanding, ConstructorStanding } from '../../types'

interface StandingsSnapshotProps {
  type: 'drivers' | 'constructors'
}

export function StandingsSnapshot({ type }: StandingsSnapshotProps) {
  const driversQuery = useDriverStandings()
  const constructorsQuery = useConstructorStandings()
  const { data, isLoading, isError, refetch } = type === 'drivers' ? driversQuery : constructorsQuery

  if (isLoading) return <LoadingSkeleton className="h-60" />
  if (isError) return <ErrorState message="Failed to load standings" onRetry={refetch} />
  if (!data?.standings?.length) return null

  const title = type === 'drivers' ? 'DRIVER STANDINGS' : 'CONSTRUCTOR STANDINGS'
  const top5 = data.standings.slice(0, 5)

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs text-text-secondary tracking-[2px]">{title}</h3>
        <span className="text-[10px] text-text-tertiary">After Round {data.round}</span>
      </div>
      <div className="space-y-2">
        {top5.map((entry) => {
          const isDriver = type === 'drivers'
          const driverEntry = entry as DriverStanding
          const constructorEntry = entry as ConstructorStanding
          const displayName = isDriver ? driverEntry.abbreviation : constructorEntry.constructor
          const color = entry.team_color

          return (
            <div key={entry.position} className="flex items-center gap-3 py-1.5">
              <div className="w-1 h-8 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-sm font-mono text-text-tertiary w-6">{entry.position}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{displayName}</span>
                {isDriver && (
                  <p className="text-[11px] text-text-tertiary truncate">{driverEntry.team}</p>
                )}
              </div>
              <span className="text-sm font-mono font-medium">{entry.points}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
