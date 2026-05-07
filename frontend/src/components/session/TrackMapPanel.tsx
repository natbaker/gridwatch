import { useState, useEffect } from 'react'
import { useCarLocations } from '../../hooks/useCarLocations'
import { useDriverTelemetry } from '../../hooks/useDriverTelemetry'
import type { ReplayStanding, RaceControlEvent } from '../../hooks/useReplay'
import type { LiveTimingEntry, LivePitStop } from '../../types'
import type { CarLocation, TelemetrySample } from '../../types'
import { CircuitMap } from '../common/CircuitMap'
import { CockpitHUD } from '../common/CockpitHUD'
import { FlagBanner } from './FlagBanner'
import { MiniStandings } from './MiniStandings'
import type { MiniStandingRow } from './MiniStandings'

export interface TrackMapPanelProps {
  circuit: string
  sessionKey?: number
  drivers: LiveTimingEntry[]
  pitStops: LivePitStop[]
  replayCars?: CarLocation[]
  replayTrackPath?: string
  replayStandings?: ReplayStanding[]
  activeFlag?: RaceControlEvent | null
  flagSectors?: number[]
  miniSectors?: number[]
  sectorIndices?: number[]
  corners?: { number: number; x: number; y: number }[]
  replayTime?: number
  driversInPit?: { driver_number: number; entry_time: number; duration: number | null }[]
  followedDriver?: number | null
  onFollowDriver?: (driverNumber: number | null) => void
  followTelemetry?: TelemetrySample | null
  isRadioPlaying?: boolean
  radioMuted?: boolean
  onToggleMute?: () => void
  replayDataStart?: string
  replayDuration?: number
}

export function TrackMapPanel({ circuit, sessionKey, drivers, pitStops, replayCars, replayTrackPath, replayStandings, activeFlag, flagSectors, miniSectors, sectorIndices, corners, replayTime, driversInPit, followedDriver, onFollowDriver, followTelemetry, isRadioPlaying, radioMuted, onToggleMute, replayDataStart, replayDuration }: TrackMapPanelProps) {
  const { data } = useCarLocations(sessionKey, !replayCars)
  const cars = replayCars ?? data?.cars ?? []
  const trackPath = replayTrackPath || data?.track_path
  const effectiveSectorIndices = sectorIndices ?? data?.sector_indices
  const effectiveCorners = corners ?? data?.corners
  const now = replayTime ?? 0

  const standingRows: MiniStandingRow[] = replayStandings
    ? replayStandings.map(s => ({
        driver_number: s.driver_number, abbreviation: s.abbreviation,
        team_color: s.team_color, position: s.position, interval: s.interval,
      }))
    : drivers.map(d => ({
        driver_number: d.driver_number, abbreviation: d.abbreviation,
        team_color: d.team_color, position: d.position, interval: d.interval,
      }))

  const [compareDriver, setCompareDriver] = useState<number | null>(null)
  const isComparing = followedDriver != null && compareDriver != null

  const allDrivers = [...(replayStandings ?? []), ...drivers]
  const driverAInfo = followedDriver ? allDrivers.find(d => d.driver_number === followedDriver) : undefined
  const driverBInfo = compareDriver ? allDrivers.find(d => d.driver_number === compareDriver) : undefined

  // Live telemetry for comparison driver B at current replay time
  const compareTelemetry = useDriverTelemetry(
    sessionKey,
    isComparing ? compareDriver : null,
    replayDataStart ?? '',
    replayTime ?? 0,
    replayDuration ?? 0,
  )

  // Reset comparison when primary driver changes
  useEffect(() => {
    setCompareDriver(null)
  }, [followedDriver])

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 space-y-2">
      {activeFlag && <FlagBanner event={activeFlag} />}
      {/* Comparison hint */}
      {!followedDriver && (
        <p className="text-[9px] text-text-tertiary font-mono">Click a driver to follow</p>
      )}
      {followedDriver && !compareDriver && (
        <p className="text-[9px] text-text-tertiary font-mono">Click another driver to compare</p>
      )}

      {/* Single HUD when not comparing */}
      {followedDriver && !isComparing && (
        <CockpitHUD
          abbreviation={driverAInfo?.abbreviation ?? String(followedDriver)}
          teamColor={driverAInfo && 'team_color' in driverAInfo ? driverAInfo.team_color : '#fff'}
          telemetry={followTelemetry ?? null}
          isRadioPlaying={isRadioPlaying ?? false}
          radioMuted={radioMuted ?? false}
          onToggleMute={onToggleMute ?? (() => {})}
          onClose={() => onFollowDriver?.(followedDriver)}
        />
      )}

      {/* Split HUD when comparing */}
      {isComparing && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <CockpitHUD
            abbreviation={driverAInfo?.abbreviation ?? String(followedDriver!)}
            teamColor={driverAInfo && 'team_color' in driverAInfo ? driverAInfo.team_color : '#fff'}
            telemetry={followTelemetry ?? null}
            isRadioPlaying={isRadioPlaying ?? false}
            radioMuted={radioMuted ?? false}
            onToggleMute={onToggleMute ?? (() => {})}
            onClose={() => onFollowDriver?.(followedDriver!)}
            compact
          />
          <CockpitHUD
            abbreviation={driverBInfo?.abbreviation ?? String(compareDriver!)}
            teamColor={driverBInfo && 'team_color' in driverBInfo ? driverBInfo.team_color : '#fff'}
            telemetry={compareTelemetry}
            isRadioPlaying={false}
            radioMuted={true}
            onToggleMute={() => {}}
            onClose={() => setCompareDriver(null)}
            compact
          />
        </div>
      )}

      <div className="md:hidden">
        <CircuitMap circuitName={circuit} className="w-full" cars={cars} showLabels={cars.length <= 22}
          dynamicTrackPath={trackPath} flagSectors={flagSectors} miniSectors={miniSectors}
          sectorIndices={effectiveSectorIndices} corners={effectiveCorners} />
      </div>
      <div className="flex gap-4 items-start">
        <MiniStandings
          rows={standingRows}
          followedDriver={followedDriver}
          compareDriver={compareDriver}
          onClickDriver={(n) => {
            if (n === followedDriver) {
              onFollowDriver?.(n) // toggles off
            } else if (n === compareDriver) {
              setCompareDriver(null)
            } else if (followedDriver == null) {
              onFollowDriver?.(n) // set as driver A
            } else {
              setCompareDriver(n) // set as driver B
            }
          }}
        />
        <div className="flex-1 min-w-0 hidden md:block relative">
          <CircuitMap circuitName={circuit} className="w-full" cars={cars} showLabels={cars.length <= 22}
            dynamicTrackPath={trackPath} flagSectors={flagSectors} miniSectors={miniSectors}
            sectorIndices={effectiveSectorIndices} corners={effectiveCorners} followedDriver={followedDriver} />
        </div>
        <div className="w-56 flex-shrink-0">
          <h3 className="text-xs text-text-secondary tracking-[2px] mb-2">PIT STOPS</h3>
          {driversInPit && driversInPit.length > 0 && (
            <div className="space-y-1 mb-2">
              {driversInPit.map((pit) => {
                const driver = [...(replayStandings ?? []), ...drivers].find(d => d.driver_number === pit.driver_number)
                const elapsed = Math.max(0, now - pit.entry_time)
                const teamColor = driver && 'team_color' in driver ? driver.team_color : '#fff'
                return (
                  <div key={`pit-${pit.driver_number}`} className="flex items-center gap-2 text-[11px] py-[3px] px-1.5 rounded bg-yellow-500/10 border border-yellow-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                    <span className="font-mono font-semibold w-8" style={{ color: teamColor }}>
                      {driver?.abbreviation ?? pit.driver_number}
                    </span>
                    <span className="text-yellow-400 text-[10px]">IN PIT</span>
                    <span className="ml-auto font-mono text-yellow-400">{elapsed.toFixed(1)}s</span>
                  </div>
                )
              })}
            </div>
          )}
          {pitStops.length > 0 ? (
            <div className="space-y-1 overflow-y-auto">
              {pitStops.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] py-[3px] px-1.5 rounded hover:bg-bg-elevated/50">
                  <div className="w-0.5 h-3.5 rounded-full" style={{ backgroundColor: p.team_color }} />
                  <span className="font-mono font-semibold w-8">{p.abbreviation}</span>
                  <span className="text-text-tertiary">L{p.lap_number ?? '?'}</span>
                  <span className="ml-auto font-mono text-text-secondary">
                    {p.pit_duration != null ? `${p.pit_duration.toFixed(1)}s` : '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : (!driversInPit || driversInPit.length === 0) ? (
            <p className="text-[10px] text-text-tertiary">No pit stops yet</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
