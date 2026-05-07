import { Link } from 'react-router-dom'

export function NoSessionState({ liveSession }: { liveSession?: { name: string; circuit: string; country: string; flag_emoji: string } | null }) {
  if (liveSession) {
    return (
      <div className="max-w-[1280px] mx-auto px-5 py-6 space-y-5 animate-fade-in-up">
        <Link to="/" className="text-sm text-accent hover:underline inline-block">← Dashboard</Link>
        <div className="bg-bg-card border border-border rounded-xl p-8 sm:p-12 text-center">
          <div className="text-5xl mb-4">{liveSession.flag_emoji}</div>
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400 font-mono tracking-wider">LIVE</span>
          </div>
          <h2 className="font-display text-xl font-bold mb-1">
            {liveSession.name.replace(' Grand Prix', ' GP').toUpperCase()}
          </h2>
          <p className="text-sm text-text-secondary mb-6">{liveSession.circuit} — {liveSession.country}</p>
          <p className="text-xs text-text-tertiary max-w-sm mx-auto">
            Live timing data is currently unavailable. The data source restricts access during live sessions.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1280px] mx-auto px-5 py-6 space-y-5 animate-fade-in-up">
      <Link to="/" className="text-sm text-accent hover:underline inline-block">← Dashboard</Link>
      <div className="bg-bg-card border border-border rounded-xl p-8 sm:p-12 text-center">
        <div className="text-5xl mb-4">🏎️</div>
        <h2 className="font-display text-xl font-bold mb-2">NO SESSION DATA</h2>
        <p className="text-sm text-text-secondary max-w-md mx-auto">
          Session data appears here during practice, qualifying, and race sessions.
        </p>
      </div>
    </div>
  )
}
