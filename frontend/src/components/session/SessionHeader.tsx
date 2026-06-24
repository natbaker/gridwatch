import { CircuitMap } from '../common/CircuitMap'
import { LiveBadge } from '../common/LiveBadge'

interface SessionHeaderProps {
  sessionName: string
  circuit: string
  country: string
  raceDate: string
  isLive: boolean
  showReplayBadge: boolean
}

export function SessionHeader({ sessionName, circuit, country, raceDate, isLive, showReplayBadge }: SessionHeaderProps) {
  return (
    <div className="relative overflow-hidden bg-bg-card border border-border rounded-xl p-4 sm:p-5">
      <CircuitMap circuitName={circuit} className="absolute right-[-20px] top-1/2 -translate-y-1/2 w-[240px] h-[180px] sm:w-[300px] sm:h-[220px] opacity-[0.12]" />
      <div className="relative z-10 flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-lg sm:text-xl font-bold">
              {sessionName?.toUpperCase() || 'SESSION'}
            </h1>
            {isLive && <LiveBadge />}
            {showReplayBadge && (
              <span className="text-[10px] font-mono bg-bg-elevated text-text-tertiary px-2 py-0.5 rounded">REPLAY</span>
            )}
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            {circuit}{country ? ` — ${country}` : ''}
          </p>
          {raceDate && <p className="text-[10px] text-text-tertiary mt-0.5">{raceDate}</p>}
        </div>
      </div>
    </div>
  )
}
