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
  currentLap?: number
  totalLaps?: number
  fastestLap?: number | null
}

export function TrackMapPanel({ circuit, sessionKey, drivers, replayCars, replayTrackPath, replayStandings, activeFlag, flagSectors, miniSectors, sectorIndices, corners, replayTime, driversInPit, followedDriver, onFollowDriver, followTelemetry, isRadioPlaying, radioMuted, onToggleMute, replayDataStart, replayDuration, currentLap, totalLaps, fastestLap }: TrackMapPanelProps) {
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
          driversInPit={driversInPit}
          now={now}
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
        <div className="w-40 flex-shrink-0 space-y-3">
          {(currentLap != null && currentLap > 0) && (
            <div>
              <p className="text-[9px] text-text-tertiary tracking-[2px] mb-0.5">LAP</p>
              <p className="font-mono text-sm font-bold text-text-primary">
                {currentLap}{totalLaps && totalLaps > 0 ? <span className="text-text-tertiary text-xs">/{totalLaps}</span> : null}
              </p>
            </div>
          )}
          {fastestLap != null && (
            <div>
              <p className="text-[9px] text-text-tertiary tracking-[2px] mb-0.5">FASTEST</p>
              <p className="font-mono text-sm font-bold text-purple-400">
                {(() => {
                  const m = Math.floor(fastestLap / 60)
                  const s = (fastestLap % 60).toFixed(3).padStart(6, '0')
                  return `${m}:${s}`
                })()}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
