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
import { useSeason } from '../hooks/useSeason'
import { api } from '../api/client'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'
import { LiveBadge } from '../components/common/LiveBadge'
import { CircuitMap } from '../components/common/CircuitMap'
import { ReplayControls } from '../components/common/ReplayControls'
import { TelemetryChart } from '../components/session/TelemetryChart'
import { useLapTelemetry, type LapPreset } from '../hooks/useLapTelemetry'
import { WeatherStrip } from '../components/session/WeatherStrip'
import { TrackMapPanel } from '../components/session/TrackMapPanel'
import { TimingTower } from '../components/session/TimingTower'
import { StrategyChart } from '../components/session/StrategyChart'
import { SectorTable } from '../components/session/SectorTable'
import { PitWindow } from '../components/session/PitWindow'
import { GapChart } from '../components/session/GapChart'
import { RadioPlayer } from '../components/session/RadioPlayer'
import { RaceTable } from '../components/session/RaceTable'
import { QualifyingTable } from '../components/session/QualifyingTable'
import { NoSessionState } from '../components/session/NoSessionState'

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
  const raceNavUrl = (r: typeof activeRaces[0]) =>
    `/race/${r.round}?race_date=${r.race_date.slice(0, 10)}`

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
  const { data: timingData, isLoading: timingLoading, error: timingError, refetch: refetchTiming } = useLiveTiming(sessionKey, !skipTiming)
  const isTimingLoading = pendingLookup || (timingLoading && !skipTiming)

  // Race results (when we have a round number)
  const effectiveRound = roundParam ?? 0
  const { data: resultsData } = useRaceResults(effectiveRound, raceDateParam)

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
  const [importState, setImportState] = useState<{ status: string; progress?: string } | null>(null)
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
    replay.dataStart, replay.currentTime, replay.totalDuration, replay.radioEvents,
  )

  const [resultsTab, setResultsTab] = useState<'race' | 'qualifying'>('race')
  const didLiveSeekRef = useRef(false)

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

  // Lap comparison hooks must be before early returns (Rules of Hooks)
  const compareSessionKey = resultsTab === 'qualifying' ? qualifyingSessionKey : effectiveSessionKey
  const compTelemetryA = useLapTelemetry(compareSessionKey, compareDriverA, compareLapPreset)
  const compTelemetryB = useLapTelemetry(compareSessionKey, compareDriverB, compareLapPreset)

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
      <div className="max-w-[1280px] mx-auto px-5 py-6 space-y-5 animate-fade-in-up">
        <Link to="/" className="text-sm text-accent hover:underline inline-block">← Dashboard</Link>
        <div className="bg-bg-card border border-border rounded-xl p-8 sm:p-12 text-center">
          <div className="text-4xl mb-4">{isRateLimit ? '⏳' : '⚠️'}</div>
          <h2 className="font-display text-xl font-bold mb-2">
            {isRateLimit ? 'DATA SOURCE RATE LIMITED' : isSessionNotFound ? 'SESSION NOT AVAILABLE' : 'FAILED TO LOAD SESSION'}
          </h2>
          <p className="text-sm text-text-secondary max-w-md mx-auto mb-4">
            {isRateLimit
              ? 'OpenF1 is temporarily limiting requests. Please wait 30-60 seconds and try again.'
              : lookupError || timingError?.message || 'Could not find a session for this round.'}
          </p>
          {isSessionNotFound && roundParam ? (
            <Link
              to={`/race/${roundParam}?race_date=${raceDateParam ?? ''}`}
              className="text-xs text-accent hover:text-accent/80 font-medium"
            >
              VIEW RACE SESSION
            </Link>
          ) : (
            <button onClick={() => refetchTiming()} className="text-xs text-accent hover:text-accent/80 font-medium">RETRY</button>
          )}
        </div>
      </div>
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
  const hasQualifying = resultsData?.qualifying && resultsData.qualifying.length > 0
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

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-6 space-y-4 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <Link to={roundPath ? '/calendar' : '/'} className="text-sm text-accent hover:underline">
          ← {roundPath ? 'Calendar' : 'Dashboard'}
        </Link>
        {(prevRace || nextRace) && (
          <div className="flex items-center gap-1">
            {prevRace ? (
              <Link
                to={raceNavUrl(prevRace)}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono text-text-tertiary hover:text-text-primary bg-bg-card border border-border rounded-lg transition-colors"
              >
                ← {prevRace.name.replace(' Grand Prix', ' GP')}
              </Link>
            ) : <div />}
            {nextRace && (
              <Link
                to={raceNavUrl(nextRace)}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono text-text-tertiary hover:text-text-primary bg-bg-card border border-border rounded-lg transition-colors"
              >
                {nextRace.name.replace(' Grand Prix', ' GP')} →
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="relative overflow-hidden bg-bg-card border border-border rounded-xl p-4 sm:p-5">
        <CircuitMap circuitName={circuit} className="absolute right-[-20px] top-1/2 -translate-y-1/2 w-[240px] h-[180px] sm:w-[300px] sm:h-[220px] opacity-[0.12]" />
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-lg sm:text-xl font-bold">
                {sessionName?.toUpperCase() || 'SESSION'}
              </h1>
              {isLive && <LiveBadge />}
              {replayStarted && hasReplay && !isLive && (
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

      {/* Session switcher */}
      {roundParam && roundSessionsData && roundSessionsData.sessions.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          {roundSessionsData.sessions.map((s) => {
            const isActive = sessionKey ? s.session_key === sessionKey : s.session_name === sessionTypeParam
            return (
              <button
                key={s.session_key}
                onClick={() => {
                  setSearchParams(prev => {
                    const next = new URLSearchParams(prev)
                    next.set('session_type', s.session_name)
                    return next
                  })
                }}
                className={`px-2.5 py-1 rounded text-[10px] font-mono transition-colors ${
                  isActive
                    ? 'bg-accent text-white'
                    : 'bg-bg-elevated text-text-tertiary hover:text-text-primary hover:bg-bg-card border border-border'
                }`}
              >
                {s.session_name.toUpperCase()}
              </button>
            )
          })}
        </div>
      )}

      {/* Replay controls */}
      {replayStarted && hasReplay && (
        <ReplayControls
          isPlaying={replay.isPlaying} speed={replay.speed}
          currentTime={replay.currentTime} totalDuration={replay.totalDuration}
          onTogglePlay={replay.togglePlay} onSetSpeed={replay.setSpeed}
          onSeek={replay.seek} lapTimes={replay.lapTimes}
          radioEvents={replay.radioEvents} driverMeta={replay.driverMeta}
          onSelectRadio={(n, t) => { replay.seek(t); follow.followDriver(n) }}
          isLive={replay.isLive} liveOffset={replay.liveOffset}
          onSeekToLive={replay.seekToLive}
        />
      )}

      {/* Auto-play team radio as the playhead reaches each clip */}
      {replayStarted && hasReplay && replay.radioEvents.length > 0 && (
        <div className="flex justify-end">
          <RadioPlayer radioEvents={replay.radioEvents} driverMeta={replay.driverMeta} currentTime={replay.currentTime} />
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
          isRadioPlaying={hudEnabled ? follow.isRadioPlaying : undefined}
          radioMuted={hudEnabled ? follow.radioMuted : undefined}
          onToggleMute={hudEnabled ? () => follow.setRadioMuted(!follow.radioMuted) : undefined}
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

      {/* Race results + Lap Comparison */}
      {hasResults && (
        <>
          {hasQualifying && (
            <div className="flex gap-1 bg-bg-elevated rounded-lg p-1">
              <button
                onClick={() => setResultsTab('race')}
                className={`flex-1 text-xs font-medium py-2 px-4 rounded-md transition-colors ${
                  resultsTab === 'race' ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                RACE RESULT
              </button>
              <button
                onClick={() => setResultsTab('qualifying')}
                className={`flex-1 text-xs font-medium py-2 px-4 rounded-md transition-colors ${
                  resultsTab === 'qualifying' ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                QUALIFYING
              </button>
            </div>
          )}
        </>
      )}

      {/* Lap Comparison — between tab switcher and results table */}
      {hasResults && (
        <div className="bg-bg-card border border-border rounded-xl p-4 space-y-3">
          {/* Header: selected drivers + lap preset */}
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-xs tracking-[2px] text-text-secondary">LAP COMPARISON</h3>
            {compareDriverA && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: driverInfoByNumber.get(compareDriverA)?.team_color ?? '#fff' }} />
                <span className="text-[10px] font-mono" style={{ color: driverInfoByNumber.get(compareDriverA)?.team_color ?? '#fff' }}>
                  {driverInfoByNumber.get(compareDriverA)?.abbreviation}
                </span>
                <button onClick={() => setCompareDriverA(null)} className="text-text-tertiary hover:text-text-primary text-[9px] ml-0.5">✕</button>
              </div>
            )}
            {compareDriverA && compareDriverB && <span className="text-[10px] text-text-tertiary">vs</span>}
            {compareDriverB && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: driverInfoByNumber.get(compareDriverB)?.team_color ?? '#fff' }} />
                <span className="text-[10px] font-mono" style={{ color: driverInfoByNumber.get(compareDriverB)?.team_color ?? '#fff' }}>
                  {driverInfoByNumber.get(compareDriverB)?.abbreviation}
                </span>
                <button onClick={() => setCompareDriverB(null)} className="text-text-tertiary hover:text-text-primary text-[9px] ml-0.5">✕</button>
              </div>
            )}
            {!compareDriverA && !compareDriverB && (
              <span className="text-[10px] text-text-tertiary">Click a driver row to compare</span>
            )}
            {resultsTab === 'race' && (compareDriverA || compareDriverB) && (
              <div className="flex bg-bg-elevated rounded border border-border overflow-hidden ml-auto">
                {(['fastest', 'last', 'first'] as LapPreset[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setCompareLapPreset(p)}
                    className={`px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider transition-colors ${
                      compareLapPreset === p ? 'bg-accent/20 text-accent' : 'text-text-tertiary hover:text-text-secondary'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Chart */}
          {compareDriverA && compareDriverB && (
            <>
              {(compTelemetryA.isLoading || compTelemetryB.isLoading) && (
                <div className="flex items-center justify-center py-8">
                  <span className="text-[10px] text-text-tertiary font-mono animate-pulse">LOADING TELEMETRY...</span>
                </div>
              )}
              {compTelemetryA.error && compTelemetryB.error && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <span className="text-[10px] text-text-tertiary font-mono">Session data not available for lap comparison</span>
                  {compareSessionKey && (
                    importState?.status === 'running' || importState?.status === 'started' || importState?.status === 'already_running' ? (
                      <span className="text-[10px] text-accent font-mono animate-pulse">
                        IMPORTING... {importState.progress ?? ''}
                      </span>
                    ) : importState?.status === 'done' ? (
                      <span className="text-[10px] text-green-400 font-mono">Import complete — select drivers again to load</span>
                    ) : (
                      <button
                        onClick={async () => {
                          setImportState({ status: 'started', progress: 'queued' })
                          const resp = await fetch(`/api/sessions/${compareSessionKey}/import-telemetry`, { method: 'POST' })
                          const data = await resp.json()
                          setImportState(data)
                          const poll = setInterval(async () => {
                            const r = await fetch(`/api/sessions/${compareSessionKey}/import-status`)
                            const s = await r.json()
                            setImportState(s)
                            if (s.status === 'done' || s.status === 'error') {
                              clearInterval(poll)
                              if (s.status === 'done') {
                                compTelemetryA.refetch()
                                compTelemetryB.refetch()
                              }
                            }
                          }, 3000)
                        }}
                        className="text-[10px] text-accent hover:text-accent/80 font-mono font-medium"
                      >
                        IMPORT TELEMETRY ▶
                      </button>
                    )
                  )}
                </div>
              )}
              {!compTelemetryA.isLoading && !compTelemetryB.isLoading && (
                <TelemetryChart
                  driverA={compTelemetryA.data ? {
                    data: compTelemetryA.data,
                    color: driverInfoByNumber.get(compareDriverA)?.team_color ?? '#fff',
                    abbreviation: driverInfoByNumber.get(compareDriverA)?.abbreviation ?? '?',
                  } : null}
                  driverB={compTelemetryB.data ? {
                    data: compTelemetryB.data,
                    color: driverInfoByNumber.get(compareDriverB)?.team_color ?? '#fff',
                    abbreviation: driverInfoByNumber.get(compareDriverB)?.abbreviation ?? '?',
                  } : null}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* Results table — below lap comparison */}
      {hasResults && (
        <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-5">
          {resultsTab === 'race' ? (
            <RaceTable results={resultsData!.results} onSelectDriver={handleSelectDriver} selectedA={selectedAbbrA} selectedB={selectedAbbrB} />
          ) : (
            <QualifyingTable qualifying={resultsData!.qualifying} onSelectDriver={handleSelectDriver} selectedA={selectedAbbrA} selectedB={selectedAbbrB} />
          )}
        </div>
      )}

      {/* Warnings */}
      {timingData?.warnings && timingData.warnings.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-xs text-yellow-400">
          {timingData.warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}
    </div>
  )
}
