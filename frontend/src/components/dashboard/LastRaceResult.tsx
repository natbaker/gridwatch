import { Link } from 'react-router-dom'
import { useLatestResult } from '../../hooks/useLatestResult'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { ErrorState } from '../common/ErrorState'

const MEDAL = ['\u{1F947}', '\u{1F948}', '\u{1F949}']
const PODIUM_BG = [
  'bg-gradient-to-r from-yellow-500/10 to-transparent',
  'bg-gradient-to-r from-gray-400/10 to-transparent',
  'bg-gradient-to-r from-amber-700/10 to-transparent',
]

export function LastRaceResult() {
  const { data, isLoading, isError, refetch } = useLatestResult()

  if (isLoading) return <LoadingSkeleton className="h-60" />
  if (isError) return <ErrorState message="Failed to load last race result" onRetry={refetch} />
  if (!data?.results?.length) return null

  const podium = data.results.slice(0, 3)

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs text-text-secondary tracking-[2px]">LAST RACE</h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-text-tertiary">{data.race_name}</span>
          {data.round ? (
            <Link to={`/race/${data.round}`} className="text-[10px] text-accent hover:underline">
              FULL RESULTS →
            </Link>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        {podium.map((entry, i) => (
          <div
            key={entry.position}
            className={`flex items-center gap-3 py-2 px-3 rounded-lg ${PODIUM_BG[i]}`}
          >
            <span className="text-lg">{MEDAL[i]}</span>
            <div
              className="w-1 h-8 rounded-full"
              style={{ backgroundColor: entry.team_color }}
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{entry.driver}</span>
              <p className="text-[11px] text-text-tertiary truncate">{entry.team}</p>
            </div>
            <span className="text-xs font-mono text-text-secondary">
              {entry.time || entry.gap || ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
