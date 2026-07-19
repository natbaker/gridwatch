import { useState, useEffect, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLiveTiming } from '../hooks/useLiveTiming'
import { useLiveTimingStream } from '../hooks/useLiveTimingStream'
import { useNextSession } from '../hooks/useNextSession'
import { useRaceResults } from '../hooks/useRaceResults'
import { useSchedule } from '../hooks/useSchedule'
import { useReplay } from '../hooks/useReplay'
import { useDriverFollow } from '../hooks/useDriverFollow'
import { useRadio } from '../hooks/useRadio'
import { useReplayHotkeys } from '../hooks/useReplayHotkeys'
import { useSeason } from '../hooks/useSeason'
import { api } from '../api/client'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'
import { ErrorBoundary } from '../components/common/ErrorBoundary'
import { ReplayControls } from '../components/common/ReplayControls'
import { type LapPreset } from '../hooks/useLapTelemetry'
import { WeatherStrip } from '../components/session/WeatherStrip'
import { TrackMapPanel } from '../components/session/TrackMapPanel'
import { TimingTower } from '../components/session/TimingTower'
import { StrategyChart } from '../components/session/StrategyChart'
import { SectorTable } from '../components/session/SectorTable'
import { PitWindow } from '../components/session/PitWindow'
import { GapChart } from '../components/session/GapChart'
import { RadioPlayer } from '../components/session/RadioPlayer'
import { NoSessionState } from '../components/session/NoSessionState'
import { SessionHeader } from '../components/session/SessionHeader'
import { RaceNav } from '../components/session/RaceNav'
import { SessionSwitcher } from '../components/session/SessionSwitcher'
import { ResultsSection } from '../components/session/ResultsSection'
import { SessionErrorState } from '../components/session/SessionErrorState'
import { LapComparisonPanel } from '../components/session/LapComparisonPanel'

// ── Main Page ──────────────────────────────────────────────

export function SessionPage() {
  const { round: roundPath } = useParams<{ round: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { season } = useSeason()

  const directSessionKey = searchParams.get('session') ? Number(searchParams.get('session')) : undefined
  const roundParam = roundPath ? Number(roundPath) : searchParams.get('round') ? Number(searchParams.get('round')) : undefined
  const seasonParam = searchParams.get('season') ? Number(searchParams.get('season')) : season
  const raceDateParam = searchParams.get('race_date') ?? undefined
  const sessionTypeParam = searchParams.get('session_type') ?? 'Race'

  const { data: scheduleData } = useNextSession()
  const { data: fullSchedule } = useSchedule()

  // Derive prev/next non-cancelled races for navigation
  const activeRaces = (fullSchedule?.races ?? []).filter(r => !r.is_cancelled)
  const currentIdx = roundParam
    ? activeRaces.findIndex(r => r.round === roundParam)
    : -1
  const prevRace = currentIdx > 0 ? activeRaces[currentIdx - 1] : null
  const nextRace = currentIdx >= 0 && currentIdx < activeRaces.length - 1 ? activeRaces[currentIdx + 1] : null

  // Fetch all sessions for this weekend (for session switcher)
  const { data: roundSessionsData } = useQuery({
    queryKey: ['roundSessions', seasonParam, roundParam, raceDateParam],
    queryFn: () => api.getRoundSessions(seasonParam, roundParam!, raceDateParam),
    enabled: !!roundParam && !directSessionKey,
    staleTime: 3600 * 1000,
  })

  // Resolve round → session key if needed
  const { data: roundLookup, error: roundError } = useQuery({
    queryKey: ['sessionKeyLookup', seasonParam, roundParam, raceDateParam, sessionTypeParam],
    queryFn: () => api.getSessionKey(seasonParam, roundParam!, sessionTypeParam, raceDateParam),
    enabled: !!roundParam && !directSessionKey,
    retry: 1,
  })

  const needsRoundLookup = !!roundParam && !directSessionKey
  const resolvedKey = roundLookup?.session_key ? roundLookup.session_key : undefined
  const lookupFailed = needsRoundLookup && roundLookup && !resolvedKey
  const lookupError = (roundLookup as Record<string, unknown>)?.error as string | undefined
  const sessionKey = directSessionKey ?? resolvedKey

  // Live timing (skip while resolving round)
  const pendingLookup = needsRoundLookup && !roundLookup && !roundError
  const skipTiming = pendingLookup || (needsRoundLookup && !sessionKey)
  const { data: timingData, isLoading: timingLoading, isFetching: timingFetching, error: timingError, refetch: refetchTiming } = useLiveTiming(sessionKey, !skipTiming)
  const isTimingLoading = pendingLookup || (timingLoading && !skipTiming)

  // Race results (when we have a round number)
  const effectiveRound = roundParam ?? 0
  const { data: resultsData, isFetching: resultsFetching } = useRaceResults(effectiveRound, raceDateParam)

  // Qualifying session key (for lap comparison on qualifying tab)
  const { data: qualiKeyData } = useQuery({
    queryKey: ['sessionKeyLookup', seasonParam, roundParam, raceDateParam, 'Qualifying'],
    queryFn: () => api.getSessionKey(seasonParam!, roundParam!, 'Qualifying', raceDateParam),
    enabled: !!roundParam && !!seasonParam,
    retry: 1,
  })
  const qualifyingSessionKey = qualiKeyData?.session_key ?? undefined

  // Lap comparison state for results section (independent from HUD)
  const [compareDriverA, setCompareDriverA] = useState<number | null>(null)
  const [compareDriverB, setCompareDriverB] = useState<number | null>(null)
  const [compareLapPreset, setCompareLapPreset] = useState<LapPreset>('fastest')
  // Session key from timing data when no URL params (direct /live visit)
  // When navigating by round, sessionKey is the resolved key — don't fall back to stale
  // timingData which may still reference the previous session during a session switch.
  const effectiveSessionKey = (roundParam || directSessionKey)
    ? sessionKey
    : (sessionKey ?? timingData?.session?.session_key)
  const isLive = !!timingData?.session?.is_live
  // Push live timing frames via SSE into the shared query cache (polling backstop stays on).
  useLiveTimingStream(sessionKey, isLive && !skipTiming)
  const isHistorical = !!effectiveSessionKey && !!timingData?.session && !isLive
  const hudEnabled = isHistorical || searchParams.get('hud') === '1'

  // Replay — auto-start when navigating with params
  const [replayStarted, setReplayStarted] = useState(!!roundParam || !!directSessionKey)
  const replaySessionKey = replayStarted ? effectiveSessionKey : undefined
  const replay = useReplay(isHistorical ? replaySessionKey : (replayStarted && isLive ? effectiveSessionKey : undefined))
  const follow = useDriverFollow(
    replayStarted ? effectiveSessionKey : undefined,
    replay.dataStart, replay.currentTime, replay.totalDuration,
  )
  const radio = useRadio(replay.currentTime, follow.followedDriver, replay.radioEvents)

  const [resultsTab, setResultsTab] = useState<'race' | 'qualifying'>(
    searchParams.get('tab') === 'qualifying' ? 'qualifying' : 'race'
  )
  const didLiveSeekRef = useRef(false)

  // Keyboard shortcuts for replay playback (space/arrows/L)
  useReplayHotkeys(replay, replayStarted && replay.totalDuration > 0)

  // Dim + show a progress strip while a navigation (round/session change) settles,
  // instead of flashing stale data from the previous session.
  const viewKey = `${roundParam ?? ''}|${sessionTypeParam}|${directSessionKey ?? ''}`
  const prevViewKey = useRef(viewKey)
  const [transitioning, setTransitioning] = useState(false)
  useEffect(() => {
    if (prevViewKey.current !== viewKey) {
      prevViewKey.current = viewKey
      setTransitioning(true)
    }
  }, [viewKey])
  useEffect(() => {
    if (transitioning && !isTimingLoading && !timingFetching && !resultsFetching) {
      setTransitioning(false)
    }
  }, [transitioning, isTimingLoading, timingFetching, resultsFetching])

  // Auto-start replay when live so controls appear without the user needing to click REPLAY
  useEffect(() => {
    if (isLive && !replayStarted) {
      setReplayStarted(true)
    }
  }, [isLive, replayStarted])

  // When replay first becomes ready during a live session, jump to the live position
  useEffect(() => {
    if (isLive && replayStarted && replay.isReady && !didLiveSeekRef.current) {
      didLiveSeekRef.current = true
      replay.seekToLive()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, replayStarted, replay.isReady])

  // ── Loading ──
  if (isTimingLoading) {
    return (
      <div className="max-w-[1280px] mx-auto px-5 py-6">
        <LoadingSkeleton className="h-96" />
      </div>
    )
  }

  // ── Error states ──
  const isRateLimit = lookupError?.includes('429') || lookupError?.includes('Too Many Requests')
    || timingError?.message?.includes('429') || timingError?.message?.includes('Too Many Requests')

  const isSessionNotFound = lookupFailed && !roundError && !isRateLimit

  if (lookupFailed || roundError || isRateLimit) {
    return (
      <SessionErrorState
        variant={isRateLimit ? 'rate-limit' : isSessionNotFound ? 'not-found' : 'failed'}
        message={lookupError || timingError?.message}
        roundParam={roundParam}
        raceDateParam={raceDateParam}
        onRetry={() => refetchTiming()}
      />
    )
  }

  // ── No data — fall back to results-only if available ──
  const hasTimingData = !!timingData?.drivers?.length
  const hasResults = !!resultsData?.results?.length

  if (!hasTimingData && !hasResults) {
    const liveInfo = scheduleData?.session?.is_live && scheduleData?.race ? {
      name: scheduleData.race.name, circuit: scheduleData.race.circuit,
      country: scheduleData.race.country, flag_emoji: scheduleData.race.flag_emoji,
    } : null
    return <NoSessionState liveSession={liveInfo} />
  }

  // ── Derive display info ──
  const session = timingData?.session
  const showSectors = ['Practice', 'Qualifying'].includes(session?.session_type ?? '')
  const circuit = session?.circuit ?? resultsData?.circuit ?? replay.circuit ?? ''
  const sessionName = session?.session_name ?? replay.sessionName ?? resultsData?.race_name ?? sessionTypeParam ?? ''
  const country = session?.country ?? ''
  const hasReplay = replay.totalDuration > 0
  const canReplay = isHistorical || isLive || hasReplay
  const hasQualifying = !!(resultsData?.qualifying && resultsData.qualifying.length > 0)
  const raceDate = resultsData?.date ? new Date(resultsData.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  }) : ''

  // Cross-reference result entries with timing data to get driver_number
  const driverNumberMap = new Map<string, number>(
    (timingData?.drivers ?? []).map(d => [d.abbreviation, d.driver_number])
  )

  // Reverse map: number → { abbreviation, team_color } from active results tab
  const activeEntries = resultsTab === 'qualifying'
    ? (resultsData?.qualifying ?? []).map(q => ({ abbreviation: q.abbreviation, team_color: q.team_color }))
    : (resultsData?.results ?? []).map(r => ({ abbreviation: r.abbreviation, team_color: r.team_color }))
  const driverInfoByNumber = new Map<number, { abbreviation: string; team_color: string }>(
    activeEntries
      .map(d => [driverNumberMap.get(d.abbreviation), d] as const)
      .filter((e): e is [number, typeof e[1]] => !!e[0])
  )

  // Derived selected abbreviations for table highlighting
  const selectedAbbrA = compareDriverA ? driverInfoByNumber.get(compareDriverA)?.abbreviation ?? null : null
  const selectedAbbrB = compareDriverB ? driverInfoByNumber.get(compareDriverB)?.abbreviation ?? null : null

  // Click a driver row to toggle A/B selection
  const handleSelectDriver = (abbr: string) => {
    const num = driverNumberMap.get(abbr)
    if (!num) return
    if (num === compareDriverA) { setCompareDriverA(null) }
    else if (num === compareDriverB) { setCompareDriverB(null) }
    else if (compareDriverA === null) { setCompareDriverA(num) }
    else { setCompareDriverB(num) }
  }

  const compareSessionKey = resultsTab === 'qualifying' ? qualifyingSessionKey : effectiveSessionKey

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-6 space-y-4 animate-fade-in-up">
      {transitioning && (
        <div className="fixed top-0 left-0 right-0 h-0.5 bg-accent/30 overflow-hidden z-50">
          <div className="h-full w-1/3 bg-accent animate-[breathe_1.2s_ease-in-out_infinite]" />
        </div>
      )}

      <div className="flex items-center justify-between">
        <Link to={roundPath ? '/calendar' : '/'} className="text-sm text-accent hover:underline">
          ← {roundPath ? 'Calendar' : 'Dashboard'}
        </Link>
        <RaceNav prevRace={prevRace} nextRace={nextRace} />
      </div>

      <div className={transitioning ? 'opacity-50 pointer-events-none transition-opacity duration-200 space-y-4' : 'transition-opacity duration-200 space-y-4'}>
        <SessionHeader
          sessionName={sessionName}
          circuit={circuit}
          country={country}
          raceDate={raceDate}
          isLive={isLive}
          showReplayBadge={replayStarted && hasReplay && !isLive}
        />

        {roundParam && roundSessionsData && (
          <SessionSwitcher
            sessions={roundSessionsData.sessions}
            activeSessionKey={sessionKey}
            activeSessionType={sessionTypeParam}
            onSelect={(name) => setSearchParams(prev => {
              const next = new URLSearchParams(prev)
              next.set('session_type', name)
              return next
            })}
          />
        )}

        <ErrorBoundary message="This part of the session view failed to render.">
          {/* Replay controls */}
          {replayStarted && hasReplay && (
            <ReplayControls
              isPlaying={replay.isPlaying} speed={replay.speed}
              currentTime={replay.currentTime} totalDuration={replay.totalDuration}
              onTogglePlay={replay.togglePlay} onSetSpeed={replay.setSpeed}
              onSeek={replay.seek} lapTimes={replay.lapTimes}
              radioEvents={replay.radioEvents} driverMeta={replay.driverMeta}
              followedDriver={follow.followedDriver}
              onSelectRadio={(n, t) => {
                follow.selectDriver(n)
                radio.setRadioOn(true)
                replay.seek(t)
                const clip = replay.radioEvents.find(r => r.n === n && r.t === t)
                if (clip) radio.playClip(clip)
              }}
              isLive={replay.isLive} liveOffset={replay.liveOffset}
              onSeekToLive={replay.seekToLive}
            />
          )}

          {/* Team radio on/off — playback driven by useRadio (followed driver, or all) */}
          {replayStarted && hasReplay && replay.radioEvents.length > 0 && (
            <div className="flex justify-end">
              <RadioPlayer
                radioOn={radio.radioOn}
                onToggle={() => radio.setRadioOn(!radio.radioOn)}
                nowPlaying={radio.nowPlaying}
                driverMeta={replay.driverMeta}
                followedDriver={follow.followedDriver}
              />
            </div>
          )}

          {/* Start replay — hidden for live sessions (auto-started) */}
          {!replayStarted && canReplay && !isLive && (
            <div className="bg-bg-card border border-border rounded-xl px-4 py-4 flex items-center justify-center">
              <button onClick={() => setReplayStarted(true)} className="text-xs text-accent hover:text-accent/80 font-medium">
                REPLAY ▶
              </button>
            </div>
          )}

          {/* Weather */}
          {replayStarted && replay.weather && <WeatherStrip weather={replay.weather} />}

          {/* Track map panel */}
          {hasTimingData && circuit && (
            <TrackMapPanel
              circuit={circuit} sessionKey={session?.session_key}
              drivers={timingData!.drivers} pitStops={timingData!.pit_stops}
              replayCars={replayStarted && replay.cars.length > 0 ? replay.cars : undefined}
              replayTrackPath={replayStarted ? replay.trackPath : undefined}
              replayStandings={replayStarted ? replay.standings : undefined}
              activeFlag={replayStarted ? replay.activeFlag : undefined}
              flagSectors={replayStarted ? replay.activeFlagSectors : undefined}
              miniSectors={replayStarted ? replay.miniSectors : undefined}
              sectorIndices={replayStarted ? replay.sectorIndices : undefined}
              corners={replayStarted ? replay.corners : undefined}
              replayTime={replayStarted ? replay.currentTime : undefined}
              driversInPit={replayStarted ? replay.driversInPit : undefined}
              followedDriver={hudEnabled && replayStarted ? follow.followedDriver : undefined}
              onFollowDriver={hudEnabled && replayStarted ? follow.followDriver : undefined}
              followTelemetry={hudEnabled ? follow.telemetry : undefined}
              replayDataStart={replay.dataStart}
              replayDuration={replay.totalDuration}
              currentLap={replayStarted && replay.currentLap > 0 ? replay.currentLap : timingData?.total_laps ?? undefined}
              totalLaps={replay.totalLaps > 0 ? replay.totalLaps : undefined}
              fastestLap={timingData?.session_best_lap ?? undefined}
            />
          )}

          {/* Timing tower — only when no official results (practice/quali replays) */}
          {hasTimingData && !hasResults && (
            <div className="bg-bg-card border border-border rounded-xl p-3 sm:p-4">
              <TimingTower drivers={timingData!.drivers} />
            </div>
          )}

          {/* Tire strategy */}
          {hasTimingData && timingData!.strategy?.length > 0 && (
            <StrategyChart strategy={timingData!.strategy} totalLaps={timingData!.total_laps} />
          )}

          {/* Gap to leader by lap (replay/live with interval history) */}
          {replayStarted && replay.intervalEvents.length > 0 && replay.lapTimes.length > 0 && (
            <GapChart intervalEvents={replay.intervalEvents} drivers={replay.driverMeta} lapEvents={replay.lapTimes} />
          )}

          {/* Best sectors (practice/qualifying) + pit window (live races) */}
          {hasTimingData && (showSectors || isLive) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {showSectors && <SectorTable drivers={timingData!.drivers} bestSectors={timingData!.best_sectors} />}
              {isLive && <PitWindow drivers={timingData!.drivers} />}
            </div>
          )}

          {/* Lap comparison — only once a driver is selected (cue lives on the results table) */}
          {hasResults && (compareDriverA || compareDriverB) && (
            <LapComparisonPanel
              compareSessionKey={compareSessionKey}
              driverA={compareDriverA}
              driverB={compareDriverB}
              driverInfoByNumber={driverInfoByNumber}
              onClearA={() => setCompareDriverA(null)}
              onClearB={() => setCompareDriverB(null)}
              lapPreset={compareLapPreset}
              onSetPreset={setCompareLapPreset}
              showPresetToggle={resultsTab === 'race'}
            />
          )}

          {/* Race / qualifying results */}
          {hasResults && (
            <ResultsSection
              resultsTab={resultsTab}
              onTabChange={setResultsTab}
              hasQualifying={hasQualifying}
              results={resultsData!.results}
              qualifying={resultsData!.qualifying ?? []}
              onSelectDriver={handleSelectDriver}
              selectedA={selectedAbbrA}
              selectedB={selectedAbbrB}
            />
          )}

          {/* Warnings */}
          {timingData?.warnings && timingData.warnings.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-xs text-yellow-400">
              {timingData.warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          )}
        </ErrorBoundary>
      </div>
    </div>
  )
}
