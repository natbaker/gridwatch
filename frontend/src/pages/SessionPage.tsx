import { useState, useEffect, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLiveTiming } from '../hooks/useLiveTiming'
import { useNextSession } from '../hooks/useNextSession'
import { useRaceResults } from '../hooks/useRaceResults'
import { useCarLocations } from '../hooks/useCarLocations'
import { useReplay } from '../hooks/useReplay'
import type { ReplayStanding, RaceControlEvent, TrackWeather } from '../hooks/useReplay'
import { useDriverFollow } from '../hooks/useDriverFollow'
import { useSeason } from '../hooks/useSeason'
import { api } from '../api/client'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'
import { LiveBadge } from '../components/common/LiveBadge'
import { CircuitMap } from '../components/common/CircuitMap'
import { CockpitHUD } from '../components/common/CockpitHUD'
import { ReplayControls } from '../components/common/ReplayControls'
import type { LiveTimingEntry, LivePitStop, RaceResultEntry, QualifyingEntry } from '../types'
import { TelemetryChart } from '../components/session/TelemetryChart'
import { useLapTelemetry, type LapPreset } from '../hooks/useLapTelemetry'
import { useDriverTelemetry } from '../hooks/useDriverTelemetry'

// ── Utilities ──────────────────────────────────────────────

function formatLapTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins > 0) return `${mins}:${secs.toFixed(3).padStart(6, '0')}`
  return secs.toFixed(3)
}

function formatGap(gap: number | null): string {
  if (gap === null || gap === undefined) return '—'
  if (typeof gap === 'string') return gap as string
  if (gap === 0) return 'LEADER'
  return `+${gap.toFixed(3)}`
}

// ── Sub-components ─────────────────────────────────────────

function TireChip({ compound, color, age }: { compound: string; color: string; age: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center border border-white/20"
        style={{ backgroundColor: color, color: compound === 'HARD' ? '#333' : '#fff' }}
      >
        {compound.charAt(0) || '?'}
      </span>
      <span className="text-[10px] text-text-tertiary font-mono">{age}L</span>
    </div>
  )
}

const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
function windDir(deg: number | null): string {
  if (deg === null) return ''
  return WIND_DIRS[Math.round(deg / 45) % 8]
}

function WeatherStrip({ weather }: { weather: TrackWeather }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl px-4 py-2 flex items-center gap-4 sm:gap-6 text-[11px] font-mono text-text-secondary overflow-x-auto">
      {weather.rainfall > 0 && <span className="text-blue-400 font-semibold">🌧 RAIN</span>}
      {weather.air_temp != null && <span>AIR <span className="text-text-primary">{Math.round(weather.air_temp)}°C</span></span>}
      {weather.track_temp != null && <span>TRACK <span className="text-text-primary">{Math.round(weather.track_temp)}°C</span></span>}
      {weather.humidity != null && <span>HUM <span className="text-text-primary">{Math.round(weather.humidity)}%</span></span>}
      {weather.wind_speed != null && <span>WIND <span className="text-text-primary">{weather.wind_speed.toFixed(1)} km/h {windDir(weather.wind_direction)}</span></span>}
    </div>
  )
}

const FLAG_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  'YELLOW': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'YELLOW FLAG' },
  'DOUBLE YELLOW': { bg: 'bg-yellow-500/30', text: 'text-yellow-300', label: 'DOUBLE YELLOW' },
  'RED': { bg: 'bg-red-500/20', text: 'text-red-400', label: 'RED FLAG' },
  'SafetyCar': { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'SAFETY CAR' },
  'CHEQUERED': { bg: 'bg-white/10', text: 'text-white', label: 'CHEQUERED FLAG' },
}

function FlagBanner({ event }: { event: RaceControlEvent }) {
  const key = event.category === 'SafetyCar' ? 'SafetyCar' : (event.flag ?? '')
  const style = FLAG_STYLES[key]
  if (!style) return null
  return (
    <div className={`${style.bg} border border-current/20 rounded-lg px-3 py-1.5 flex items-center gap-2 ${style.text}`}>
      <span className="text-[10px] font-mono font-bold tracking-wider">{style.label}</span>
      <span className="text-[10px] opacity-80 truncate">{event.message}</span>
    </div>
  )
}

interface MiniStandingRow {
  driver_number: number
  abbreviation: string
  team_color: string
  position: number | null
  interval: number | null
}

function MiniStandings({ rows, followedDriver, compareDriver, onClickDriver }: {
  rows: MiniStandingRow[]
  followedDriver?: number | null
  compareDriver?: number | null
  onClickDriver?: (n: number) => void
}) {
  return (
    <div className="w-48 flex-shrink-0 overflow-y-auto pr-1">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] text-text-tertiary tracking-wider">
            <th className="text-left py-1 px-1 w-6">P</th>
            <th className="text-left py-1 px-1">DRIVER</th>
            <th className="text-right py-1 px-1">INT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const isFollowed = followedDriver === d.driver_number
            const isCompare = compareDriver === d.driver_number
            return (
              <tr
                key={d.driver_number}
                className={`border-b border-border/20 ${onClickDriver ? 'cursor-pointer hover:bg-bg-elevated/50' : ''} ${isFollowed ? 'bg-accent/10' : isCompare ? 'bg-bg-elevated' : ''}`}
                onClick={() => onClickDriver?.(d.driver_number)}
              >
                <td className="py-[3px] px-1 font-mono font-bold text-text-secondary">{d.position || '—'}</td>
                <td className="py-[3px] px-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-0.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.team_color }} />
                    <span className="font-mono font-semibold">{d.abbreviation}</span>
                  </div>
                </td>
                <td className="py-[3px] px-1 text-right font-mono">
                  {isFollowed ? (
                    <span className="text-[8px] text-accent font-bold tracking-wider">A</span>
                  ) : isCompare ? (
                    <span className="text-[8px] text-text-secondary font-bold tracking-wider">B</span>
                  ) : (
                    <span className="text-text-tertiary">{d.position === 1 ? 'LDR' : formatGap(d.interval)}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

interface TrackMapPanelProps {
  circuit: string
  sessionKey?: number
  drivers: LiveTimingEntry[]
  pitStops: LivePitStop[]
  replayCars?: import('../types').CarLocation[]
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
  followTelemetry?: import('../types').TelemetrySample | null
  isRadioPlaying?: boolean
  radioMuted?: boolean
  onToggleMute?: () => void
  replayDataStart?: string
  replayDuration?: number
}

function TrackMapPanel({ circuit, sessionKey, drivers, pitStops, replayCars, replayTrackPath, replayStandings, activeFlag, flagSectors, miniSectors, sectorIndices, corners, replayTime, driversInPit, followedDriver, onFollowDriver, followTelemetry, isRadioPlaying, radioMuted, onToggleMute, replayDataStart, replayDuration }: TrackMapPanelProps) {
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

function TimingTower({ drivers }: { drivers: LiveTimingEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] text-text-tertiary tracking-wider border-b border-border">
            <th className="text-left py-2 px-2 w-10">P</th>
            <th className="text-left py-2 px-2">DRIVER</th>
            <th className="text-right py-2 px-2">GAP</th>
            <th className="text-right py-2 px-2 hidden sm:table-cell">INT</th>
            <th className="text-right py-2 px-2">LAST LAP</th>
            <th className="text-right py-2 px-2 hidden md:table-cell">BEST</th>
            <th className="text-center py-2 px-2 hidden sm:table-cell">S1</th>
            <th className="text-center py-2 px-2 hidden sm:table-cell">S2</th>
            <th className="text-center py-2 px-2 hidden sm:table-cell">S3</th>
            <th className="text-center py-2 px-2 hidden md:table-cell">TIRE</th>
            <th className="text-center py-2 px-2 hidden lg:table-cell">PIT</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.driver_number} className="border-b border-border/30 hover:bg-bg-elevated/50 transition-colors">
              <td className="py-2 px-2 font-mono font-bold text-text-secondary">{d.position || '—'}</td>
              <td className="py-2 px-2">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: d.team_color }} />
                  <div>
                    <span className="font-mono font-semibold text-xs">{d.abbreviation}</span>
                    <span className="text-text-tertiary text-[10px] ml-1.5 hidden sm:inline">{d.team}</span>
                  </div>
                </div>
              </td>
              <td className="py-2 px-2 text-right font-mono text-xs text-text-secondary">
                {d.position === 1 ? <span className="text-text-primary">LEADER</span> : formatGap(d.gap_to_leader)}
              </td>
              <td className="py-2 px-2 text-right font-mono text-xs text-text-secondary hidden sm:table-cell">
                {d.position === 1 ? '—' : formatGap(d.interval)}
              </td>
              <td className={`py-2 px-2 text-right font-mono text-xs ${
                d.is_session_best ? 'text-purple-400 font-semibold' :
                d.is_personal_best ? 'text-green-400' : 'text-text-secondary'
              }`}>
                {formatLapTime(d.last_lap)}
              </td>
              <td className="py-2 px-2 text-right font-mono text-xs text-text-tertiary hidden md:table-cell">
                {formatLapTime(d.best_lap)}
              </td>
              <td className="py-2 px-2 text-center font-mono text-[11px] text-text-tertiary hidden sm:table-cell">
                {d.sector_1 ? d.sector_1.toFixed(1) : '—'}
              </td>
              <td className="py-2 px-2 text-center font-mono text-[11px] text-text-tertiary hidden sm:table-cell">
                {d.sector_2 ? d.sector_2.toFixed(1) : '—'}
              </td>
              <td className="py-2 px-2 text-center font-mono text-[11px] text-text-tertiary hidden sm:table-cell">
                {d.sector_3 ? d.sector_3.toFixed(1) : '—'}
              </td>
              <td className="py-2 px-2 hidden md:table-cell">
                <div className="flex justify-center">
                  {d.tire_compound ? <TireChip compound={d.tire_compound} color={d.tire_compound_color} age={d.tire_age} /> : '—'}
                </div>
              </td>
              <td className="py-2 px-2 text-center font-mono text-xs text-text-tertiary hidden lg:table-cell">
                {d.pit_count || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Race Results Tables ────────────────────────────────────

const MEDAL = ['\u{1F947}', '\u{1F948}', '\u{1F949}']

function PositionChange({ gained }: { gained: number | null }) {
  if (gained === null || gained === 0) return <span className="text-text-tertiary">—</span>
  if (gained > 0) return <span className="text-green-400">▲{gained}</span>
  return <span className="text-red-400">▼{Math.abs(gained)}</span>
}

function RaceTable({ results, onSelectDriver, selectedA, selectedB }: {
  results: RaceResultEntry[]
  onSelectDriver?: (abbreviation: string) => void
  selectedA?: string | null
  selectedB?: string | null
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] text-text-tertiary tracking-wider border-b border-border">
            <th className="text-left py-2 px-2 w-10">POS</th>
            <th className="text-left py-2 px-2">DRIVER</th>
            <th className="text-left py-2 px-2 hidden sm:table-cell">TEAM</th>
            <th className="text-right py-2 px-2 hidden md:table-cell">GRID</th>
            <th className="text-center py-2 px-2 hidden md:table-cell">+/-</th>
            <th className="text-right py-2 px-2 hidden sm:table-cell">LAPS</th>
            <th className="text-right py-2 px-2">TIME / STATUS</th>
            <th className="text-right py-2 px-2 hidden lg:table-cell">FASTEST</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const isPodium = r.position <= 3
            const dnf = r.status && r.status !== 'Finished' && !r.status.startsWith('+')
            const isFastestLap = r.fastest_lap_rank === '1'
            const isSelA = r.abbreviation === selectedA
            const isSelB = r.abbreviation === selectedB
            return (
              <tr
                key={r.position}
                onClick={() => onSelectDriver?.(r.abbreviation)}
                className={`border-b border-border/50 transition-colors ${onSelectDriver ? 'cursor-pointer' : ''} ${isSelA || isSelB ? 'bg-bg-elevated' : 'hover:bg-bg-elevated/50'} ${dnf ? 'opacity-60' : ''}`}
              >
                <td className="py-2.5 px-2 font-mono">
                  {isPodium ? <span className="text-base">{MEDAL[r.position - 1]}</span> : <span className="text-text-secondary">{r.position}</span>}
                </td>
                <td className="py-2.5 px-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: r.team_color }} />
                    <div>
                      <span className="font-medium">{r.driver}</span>
                      <span className="text-text-tertiary text-xs ml-1.5 sm:hidden">{r.team}</span>
                    </div>
                    {isSelA && <span className="text-[8px] font-mono bg-accent/20 text-accent px-1 py-0.5 rounded ml-1">A</span>}
                    {isSelB && <span className="text-[8px] font-mono bg-white/10 text-white px-1 py-0.5 rounded ml-1">B</span>}
                  </div>
                </td>
                <td className="py-2.5 px-2 text-text-secondary text-xs hidden sm:table-cell">{r.team}</td>
                <td className="py-2.5 px-2 text-right font-mono text-text-secondary hidden md:table-cell">{r.grid || '—'}</td>
                <td className="py-2.5 px-2 text-center text-xs font-mono hidden md:table-cell"><PositionChange gained={r.positions_gained} /></td>
                <td className="py-2.5 px-2 text-right font-mono text-text-secondary hidden sm:table-cell">{r.laps || '—'}</td>
                <td className="py-2.5 px-2 text-right font-mono text-xs">
                  {dnf ? <span className="text-red-400">{r.status}</span>
                    : r.position === 1 ? <span className="text-text-primary">{r.time}</span>
                    : <span className="text-text-secondary">{r.gap || r.status}</span>}
                </td>
                <td className="py-2.5 px-2 text-right font-mono text-xs hidden lg:table-cell">
                  {r.fastest_lap_time ? (
                    <span className={isFastestLap ? 'text-purple-400' : 'text-text-tertiary'}>
                      {r.fastest_lap_time}{isFastestLap && ' ⚡'}
                    </span>
                  ) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function QualifyingTable({ qualifying, onSelectDriver, selectedA, selectedB }: {
  qualifying: QualifyingEntry[]
  onSelectDriver?: (abbreviation: string) => void
  selectedA?: string | null
  selectedB?: string | null
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] text-text-tertiary tracking-wider border-b border-border">
            <th className="text-left py-2 px-2 w-10">POS</th>
            <th className="text-left py-2 px-2">DRIVER</th>
            <th className="text-left py-2 px-2 hidden sm:table-cell">TEAM</th>
            <th className="text-right py-2 px-2">Q1</th>
            <th className="text-right py-2 px-2">Q2</th>
            <th className="text-right py-2 px-2">Q3</th>
          </tr>
        </thead>
        <tbody>
          {qualifying.map((q) => {
            const eliminated = !q.q3 ? (!q.q2 ? 'q1' : 'q2') : null
            const isSelA = q.abbreviation === selectedA
            const isSelB = q.abbreviation === selectedB
            return (
              <tr
                key={q.position}
                onClick={() => onSelectDriver?.(q.abbreviation)}
                className={`border-b border-border/50 transition-colors ${onSelectDriver ? 'cursor-pointer' : ''} ${isSelA || isSelB ? 'bg-bg-elevated' : 'hover:bg-bg-elevated/50'}`}
              >
                <td className="py-2.5 px-2 font-mono text-text-secondary">{q.position}</td>
                <td className="py-2.5 px-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: q.team_color }} />
                    <span className="font-medium">{q.driver}</span>
                    {isSelA && <span className="text-[8px] font-mono bg-accent/20 text-accent px-1 py-0.5 rounded ml-1">A</span>}
                    {isSelB && <span className="text-[8px] font-mono bg-white/10 text-white px-1 py-0.5 rounded ml-1">B</span>}
                  </div>
                </td>
                <td className="py-2.5 px-2 text-text-secondary text-xs hidden sm:table-cell">{q.team}</td>
                <td className={`py-2.5 px-2 text-right font-mono text-xs ${eliminated === 'q1' ? 'text-red-400' : 'text-text-secondary'}`}>{q.q1 || '—'}</td>
                <td className={`py-2.5 px-2 text-right font-mono text-xs ${eliminated === 'q2' ? 'text-red-400' : 'text-text-secondary'}`}>{q.q2 || '—'}</td>
                <td className="py-2.5 px-2 text-right font-mono text-xs text-text-primary">{q.q3 || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── No Session State ───────────────────────────────────────

function NoSessionState({ liveSession }: { liveSession?: { name: string; circuit: string; country: string; flag_emoji: string } | null }) {
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

// ── Main Page ──────────────────────────────────────────────

export function SessionPage() {
  const { round: roundPath } = useParams<{ round: string }>()
  const [searchParams] = useSearchParams()
  const { season } = useSeason()

  const directSessionKey = searchParams.get('session') ? Number(searchParams.get('session')) : undefined
  const roundParam = roundPath ? Number(roundPath) : searchParams.get('round') ? Number(searchParams.get('round')) : undefined
  const seasonParam = searchParams.get('season') ? Number(searchParams.get('season')) : season

  const { data: scheduleData } = useNextSession()

  // Resolve round → session key if needed
  const { data: roundLookup, error: roundError } = useQuery({
    queryKey: ['sessionKeyLookup', seasonParam, roundParam],
    queryFn: () => api.getSessionKey(seasonParam, roundParam!),
    enabled: !!roundParam && !directSessionKey,
    retry: 1,
  })

  const needsRoundLookup = !!roundParam && !directSessionKey
  const resolvedKey = roundLookup?.session_key ? roundLookup.session_key : undefined
  const lookupFailed = needsRoundLookup && roundLookup && !resolvedKey
  const lookupError = (roundLookup as Record<string, unknown>)?.error as string | undefined
  const sessionKey = directSessionKey ?? resolvedKey

  const { data: downloadedData } = useQuery({
    queryKey: ['sessionDownloaded', sessionKey],
    queryFn: () => api.getSessionDownloaded(sessionKey!),
    enabled: !!sessionKey,
    staleTime: 60 * 1000,
  })
  const hudEnabled = searchParams.get('hud') === '1' || downloadedData?.downloaded === true

  // Live timing (skip while resolving round)
  const pendingLookup = needsRoundLookup && !roundLookup && !roundError
  const skipTiming = pendingLookup || (needsRoundLookup && !sessionKey)
  const { data: timingData, isLoading: timingLoading, error: timingError, refetch: refetchTiming } = useLiveTiming(sessionKey, !skipTiming)
  const isTimingLoading = pendingLookup || (timingLoading && !skipTiming)

  // Race results (when we have a round number)
  const effectiveRound = roundParam ?? 0
  const { data: resultsData } = useRaceResults(effectiveRound)

  // Qualifying session key (for lap comparison on qualifying tab)
  const { data: qualiKeyData } = useQuery({
    queryKey: ['sessionKeyLookup', seasonParam, roundParam, 'Qualifying'],
    queryFn: () => api.getSessionKey(seasonParam!, roundParam!, 'Qualifying'),
    enabled: !!roundParam && !!seasonParam,
    retry: 1,
  })
  const qualifyingSessionKey = qualiKeyData?.session_key ?? undefined

  // Lap comparison state for results section (independent from HUD)
  const [compareDriverA, setCompareDriverA] = useState<number | null>(null)
  const [compareDriverB, setCompareDriverB] = useState<number | null>(null)
  const [compareLapPreset, setCompareLapPreset] = useState<LapPreset>('fastest')
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; message: string }>({ percent: 0, message: '' })
  const downloadPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => () => { if (downloadPollRef.current) clearInterval(downloadPollRef.current) }, [])

  const startSessionDownload = async (sessionKey: number) => {
    if (downloadStatus === 'loading') return
    setDownloadStatus('loading')
    setDownloadProgress({ percent: 0, message: 'Starting...' })
    try {
      const adminToken = localStorage.getItem('admin_token') ?? ''
      const adminHeaders = { Authorization: `Bearer ${adminToken}` }
      await fetch(`/api/admin/download?session_key=${sessionKey}`, { method: 'POST', headers: adminHeaders })
      downloadPollRef.current = setInterval(async () => {
        try {
          const resp = await fetch(`/api/admin/download-status?session_key=${sessionKey}`, { headers: adminHeaders })
          const data = await resp.json()
          if (data.status === 'done') {
            clearInterval(downloadPollRef.current!)
            downloadPollRef.current = null
            setDownloadStatus('idle')
            queryClient.invalidateQueries({ queryKey: ['lapTelemetry'] })
          } else if (data.status === 'error') {
            clearInterval(downloadPollRef.current!)
            downloadPollRef.current = null
            setDownloadStatus('error')
          } else {
            setDownloadProgress({ percent: data.percent ?? 0, message: data.message ?? '' })
          }
        } catch { /* ignore poll errors */ }
      }, 3000)
    } catch {
      setDownloadStatus('error')
    }
  }

  // Session key from timing data when no URL params (direct /live visit)
  const effectiveSessionKey = sessionKey ?? timingData?.session?.session_key
  const isLive = !!timingData?.session?.is_live
  const isHistorical = !!effectiveSessionKey && !!timingData?.session && !isLive

  // Replay — auto-start when navigating with params
  const [replayStarted, setReplayStarted] = useState(!!roundParam || !!directSessionKey)
  const replaySessionKey = replayStarted ? effectiveSessionKey : undefined
  const replay = useReplay(isHistorical ? replaySessionKey : (replayStarted && isLive ? effectiveSessionKey : undefined))
  const follow = useDriverFollow(
    replayStarted ? effectiveSessionKey : undefined,
    replay.dataStart, replay.currentTime, replay.totalDuration, replay.radioEvents,
  )

  const [resultsTab, setResultsTab] = useState<'race' | 'qualifying'>('race')

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

  if (lookupFailed || roundError || isRateLimit) {
    return (
      <div className="max-w-[1280px] mx-auto px-5 py-6 space-y-5 animate-fade-in-up">
        <Link to="/" className="text-sm text-accent hover:underline inline-block">← Dashboard</Link>
        <div className="bg-bg-card border border-border rounded-xl p-8 sm:p-12 text-center">
          <div className="text-4xl mb-4">{isRateLimit ? '⏳' : '⚠️'}</div>
          <h2 className="font-display text-xl font-bold mb-2">
            {isRateLimit ? 'DATA SOURCE RATE LIMITED' : 'FAILED TO LOAD SESSION'}
          </h2>
          <p className="text-sm text-text-secondary max-w-md mx-auto mb-4">
            {isRateLimit
              ? 'OpenF1 is temporarily limiting requests. Please wait 30-60 seconds and try again.'
              : lookupError || timingError?.message || 'Could not find a session for this round.'}
          </p>
          <button onClick={() => refetchTiming()} className="text-xs text-accent hover:text-accent/80 font-medium">RETRY</button>
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
  const circuit = session?.circuit ?? resultsData?.circuit ?? replay.circuit ?? ''
  const sessionName = session?.session_name ?? replay.sessionName ?? resultsData?.race_name ?? ''
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
      <Link to={roundPath ? '/calendar' : '/'} className="text-sm text-accent hover:underline inline-block">
        ← {roundPath ? 'Calendar' : 'Dashboard'}
      </Link>

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
              {replayStarted && hasReplay && (
                <span className="text-[10px] font-mono bg-bg-elevated text-text-tertiary px-2 py-0.5 rounded">REPLAY</span>
              )}
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              {circuit}{country ? ` — ${country}` : ''}
            </p>
            {raceDate && <p className="text-[10px] text-text-tertiary mt-0.5">{raceDate}</p>}
          </div>
          <div className="flex items-center gap-4 text-xs text-text-tertiary">
            {replayStarted && replay.currentLap > 0 ? (
              <span className="font-mono">LAP {replay.currentLap}{replay.totalLaps > 0 ? `/${replay.totalLaps}` : ''}</span>
            ) : timingData && timingData.total_laps > 0 ? (
              <span className="font-mono">LAP {timingData.total_laps}</span>
            ) : null}
            {timingData?.session_best_lap && (
              <span className="font-mono">
                FASTEST: <span className="text-purple-400">{formatLapTime(timingData.session_best_lap)}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Replay controls */}
      {replayStarted && hasReplay && (
        <ReplayControls
          isPlaying={replay.isPlaying} speed={replay.speed}
          currentTime={replay.currentTime} totalDuration={replay.totalDuration}
          onTogglePlay={replay.togglePlay} onSetSpeed={replay.setSpeed}
          onSeek={replay.seek} lapTimes={replay.lapTimes}
        />
      )}

      {/* Start replay button */}
      {!replayStarted && canReplay && (
        <div className="bg-bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-center">
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
        />
      )}

      {/* Timing tower — only when no official results (practice/quali replays) */}
      {hasTimingData && !hasResults && (
        <div className="bg-bg-card border border-border rounded-xl p-3 sm:p-4">
          <TimingTower drivers={timingData!.drivers} />
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
                  {compareSessionKey && downloadStatus === 'loading' ? (
                    <div className="w-64 flex flex-col gap-1.5">
                      <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full transition-all duration-500"
                          style={{ width: `${downloadProgress.percent}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-text-tertiary text-center">
                        {downloadProgress.message || 'DOWNLOADING...'} ({Math.round(downloadProgress.percent)}%)
                      </span>
                    </div>
                  ) : compareSessionKey ? (
                    <button
                      onClick={() => startSessionDownload(compareSessionKey)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded text-[10px] font-mono text-accent transition-colors"
                    >
                      {downloadStatus === 'error' ? 'DOWNLOAD FAILED — RETRY' : 'DOWNLOAD SESSION DATA'}
                    </button>
                  ) : null}
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
