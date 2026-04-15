import { Link } from 'react-router-dom'
import { useNextSession } from '../../hooks/useNextSession'
import { useCountdown } from '../../hooks/useCountdown'
import { CountdownTimer } from './CountdownTimer'
import { LiveBadge } from '../common/LiveBadge'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { CircuitMap } from '../common/CircuitMap'

export function HeroNextRace() {
  const { data, isLoading } = useNextSession()
  const countdown = useCountdown(data?.session?.start_utc ?? null)

  if (isLoading) {
    return <LoadingSkeleton className="h-64" />
  }

  if (!data?.race) return null

  const { race, session } = data
  const Wrapper = session?.is_live ? Link : 'div'
  const wrapperProps = session?.is_live ? { to: '/live' } : {}

  return (
    <Wrapper {...wrapperProps as any} className={`relative overflow-hidden bg-gradient-to-br from-bg-card to-[#1a1215] border border-border rounded-xl p-6 sm:p-8 shadow-[0_0_0_1px_rgba(200,16,46,0.08),0_0_40px_rgba(200,16,46,0.05)] block ${session?.is_live ? 'cursor-pointer hover:border-accent/30 transition-colors' : ''}`}>
      {/* Track SVG background */}
      <CircuitMap
        circuitName={race.circuit}
        className="absolute right-[-20px] top-1/2 -translate-y-1/2 w-[280px] h-[220px] sm:w-[340px] sm:h-[260px] opacity-[0.12]"
      />

      <div className="relative z-10 flex justify-between items-start">
        <div>
          <div className="text-xs text-text-secondary tracking-[2px] mb-2">
            ROUND {race.round} • {session?.is_live ? 'LIVE' : 'UPCOMING'}
          </div>
          <h2 className="font-display text-2xl sm:text-[28px] font-bold mb-1">
            {race.name.replace(' Grand Prix', ' GP').toUpperCase()}
          </h2>
          <p className="text-sm text-text-secondary">{race.circuit}</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-6xl sm:text-7xl leading-none drop-shadow-[0_0_12px_rgba(255,255,255,0.1)]">
            {race.flag_emoji}
          </span>
          <span className="text-[11px] text-text-tertiary tracking-wider">{race.city.toUpperCase()}</span>
        </div>
      </div>

      <div className="relative z-10 mt-6">
        <div className="text-xs text-text-secondary tracking-[2px] mb-3">
          {session?.is_live ? (
            <span className="flex items-center gap-2"><LiveBadge /> {session.name?.toUpperCase()}</span>
          ) : (
            <>NEXT SESSION: {session?.name?.toUpperCase()}</>
          )}
        </div>
        {!countdown.isExpired && !session?.is_live && (
          <CountdownTimer countdown={countdown} />
        )}
      </div>
    </Wrapper>
  )
}
