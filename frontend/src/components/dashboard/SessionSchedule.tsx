import { Link } from 'react-router-dom'
import { useNextSession } from '../../hooks/useNextSession'
import { formatSessionTime } from '../../utils/time'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { ErrorState } from '../common/ErrorState'

export function SessionSchedule() {
  const { data, isLoading, isError, refetch } = useNextSession()

  if (isLoading) return <LoadingSkeleton className="h-60" />
  if (isError) return <ErrorState message="Failed to load sessions" onRetry={refetch} />
  if (!data?.weekend_sessions?.length) return null

  const sessions = data.weekend_sessions
  const firstDate = new Date(sessions[0].start_utc)
  const lastDate = new Date(sessions[sessions.length - 1].start_utc)
  const month = firstDate.toLocaleDateString('en-US', { month: 'short' })
  const dateRange = firstDate.getMonth() === lastDate.getMonth()
    ? `${month.toUpperCase()} ${firstDate.getUTCDate()}–${lastDate.getUTCDate()}`
    : `${month.toUpperCase()} ${firstDate.getUTCDate()}–${lastDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()} ${lastDate.getUTCDate()}`

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <h3 className="text-xs text-text-secondary tracking-[2px] mb-4">WEEKEND SCHEDULE • {dateRange}</h3>
      <div className="space-y-2">
        {data.weekend_sessions.map((s) => {
          const hasReplay = !!s.session_key
          const isLive = s.status === 'live'
          const clickable = hasReplay || isLive
          const to = isLive ? '/live' : `/live?session=${s.session_key}`

          const inner = (
            <div
              key={s.short_name}
              className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${
                hasReplay || isLive ? 'hover:bg-bg-elevated/50 cursor-pointer' : 'opacity-70'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${
                  s.status === 'completed' ? 'bg-green-500' :
                  s.status === 'live' ? 'bg-yellow-400 animate-breathe' :
                  'bg-text-tertiary'
                }`} />
                <span className="font-mono text-xs text-text-tertiary w-14">{s.short_name}</span>
                <span className="text-sm">{s.name}</span>
              </div>
              {isLive ? (
                <span className="text-[10px] text-green-400 font-mono font-bold tracking-wider">LIVE</span>
              ) : hasReplay ? (
                <span className="text-[10px] text-accent font-mono tracking-wider">REPLAY</span>
              ) : (
                <span className="text-xs text-text-secondary font-mono">
                  {formatSessionTime(s.start_utc)}
                </span>
              )}
            </div>
          )

          return clickable ? <Link key={s.short_name} to={to}>{inner}</Link> : inner
        })}
      </div>
    </div>
  )
}
