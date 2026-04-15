import { HeroNextRace } from '../components/dashboard/HeroNextRace'
import { SessionSchedule } from '../components/dashboard/SessionSchedule'
import { WeatherCard } from '../components/dashboard/WeatherCard'
import { StandingsSnapshot } from '../components/dashboard/StandingsSnapshot'
import { LastRaceResult } from '../components/dashboard/LastRaceResult'
import { NewsFeed } from '../components/dashboard/NewsFeed'
import { VideoFeed } from '../components/dashboard/VideoFeed'
import { useSeason } from '../hooks/useSeason'

export function DashboardPage() {
  const { season, isCurrentSeason } = useSeason()

  return (
    <div className="max-w-[1280px] mx-auto px-5 py-6 space-y-5">
      {!isCurrentSeason && (
        <div className="animate-fade-in-up bg-bg-card border border-accent/20 rounded-xl p-4 text-center">
          <span className="text-xs text-text-secondary tracking-wider">VIEWING SEASON</span>
          <span className="font-display text-2xl font-bold ml-3 text-accent">{season}</span>
        </div>
      )}
      {isCurrentSeason && (
        <div className="animate-fade-in-up">
          <HeroNextRace />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {isCurrentSeason && (
          <>
            <div className="animate-fade-in-up" style={{ animationDelay: '50ms' }}>
              <SessionSchedule />
            </div>
            <div className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
              <WeatherCard />
            </div>
          </>
        )}
        <div className="animate-fade-in-up" style={{ animationDelay: '150ms' }}>
          <StandingsSnapshot type="drivers" />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <LastRaceResult />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: '250ms' }}>
          <StandingsSnapshot type="constructors" />
        </div>
        {isCurrentSeason && (
          <div className="animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <NewsFeed />
          </div>
        )}
      </div>
      {isCurrentSeason && (
        <div className="animate-fade-in-up" style={{ animationDelay: '350ms' }}>
          <VideoFeed />
        </div>
      )}
    </div>
  )
}
