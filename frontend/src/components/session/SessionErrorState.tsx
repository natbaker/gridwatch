import { Link } from 'react-router-dom'

interface SessionErrorStateProps {
  variant: 'rate-limit' | 'not-found' | 'failed'
  message?: string
  roundParam?: number
  raceDateParam?: string
  onRetry: () => void
}

export function SessionErrorState({ variant, message, roundParam, raceDateParam, onRetry }: SessionErrorStateProps) {
  const isRateLimit = variant === 'rate-limit'
  const isNotFound = variant === 'not-found'
  return (
    <div className="max-w-[1280px] mx-auto px-5 py-6 space-y-5 animate-fade-in-up">
      <Link to="/" className="text-sm text-accent hover:underline inline-block">← Dashboard</Link>
      <div className="bg-bg-card border border-border rounded-xl p-8 sm:p-12 text-center">
        <div className="text-4xl mb-4">{isRateLimit ? '⏳' : '⚠️'}</div>
        <h2 className="font-display text-xl font-bold mb-2">
          {isRateLimit ? 'DATA SOURCE RATE LIMITED' : isNotFound ? 'SESSION NOT AVAILABLE' : 'FAILED TO LOAD SESSION'}
        </h2>
        <p className="text-sm text-text-secondary max-w-md mx-auto mb-4">
          {isRateLimit
            ? 'OpenF1 is temporarily limiting requests. Please wait 30-60 seconds and try again.'
            : message || 'Could not find a session for this round.'}
        </p>
        {isNotFound && roundParam ? (
          <Link
            to={`/race/${roundParam}?race_date=${raceDateParam ?? ''}`}
            className="text-xs text-accent hover:text-accent/80 font-medium"
          >
            VIEW RACE SESSION
          </Link>
        ) : (
          <button onClick={onRetry} className="text-xs text-accent hover:text-accent/80 font-medium">RETRY</button>
        )}
      </div>
    </div>
  )
}
