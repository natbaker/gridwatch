import type { ReplayInfo, ReplayStanding } from '../../types'

// ── Shared utilities for session components ─────────────────

// Build current standings ordered by gap-to-leader, which is the complete and
// continuous race order in the timing feed. The position feed cannot be used as
// the primary order: it only emits when a driver's position *changes*, so any
// leader who holds station is absent from it and would sort to the bottom.
//
// During the opening lap nobody has a gap yet (the leader's gap-0 record only
// appears once they next cross the line), and gaps arrive one driver at a time,
// which would thrash the order. While no real gap-0 exists we therefore hold the
// starting-grid order. Once the leader registers gap 0 we switch to gap order
// for the rest of the race.
//
// Cars with no numeric gap-to-leader — lapped cars (OpenF1 reports "+1 LAP",
// which arrives as null) or cars not yet timed — sort to the bottom, ordered by
// the sparse position feed when available and then by car number. Display
// position is the final sorted rank so every row shows a number.
export function computeStandings(info: ReplayInfo, currentTime: number): ReplayStanding[] {
  const latestIv = new Map<number, { g: number | null; i: number | null }>()
  for (const e of info.interval_events ?? []) {
    if (e.t > currentTime) break
    latestIv.set(e.n, { g: e.g, i: e.i })
  }

  const latestPos = new Map<number, number>()
  for (const e of info.position_events ?? []) {
    if (e.t > currentTime) break
    latestPos.set(e.n, e.p)
  }

  const standings: ReplayStanding[] = Object.entries(info.drivers).map(([numStr, dInfo]) => {
    const num = Number(numStr)
    const iv = latestIv.get(num)
    return {
      driver_number: num,
      abbreviation: dInfo.abbreviation,
      team_color: dInfo.team_color,
      position: 0,
      gap_to_leader: iv ? iv.g : null,
      interval: iv?.i ?? null,
    }
  })

  const grid = info.grid
  const hasGrid = !!grid && Object.keys(grid).length > 0
  const leaderHasCrossedLine = standings.some(s => s.gap_to_leader === 0)

  if (hasGrid && !leaderHasCrossedLine) {
    // Opening lap: hold the starting grid until the leader first registers gap 0.
    standings.sort((a, b) => {
      const ag = grid![String(a.driver_number)] ?? Infinity
      const bg = grid![String(b.driver_number)] ?? Infinity
      if (ag !== bg) return ag - bg
      return a.driver_number - b.driver_number
    })
    standings.forEach((s, i) => { s.position = i + 1 })
    return standings
  }

  // The leader doesn't report a gap-to-leader on the opening lap (their gap to
  // themselves is 0, but the feed omits it until they next cross the line).
  // Everyone else reports a gap to the leader, so if exactly one driver lacks a
  // gap and nobody yet shows gap 0, that driver is the leader. This deliberately
  // does not fire once cars are lapped (multiple null gaps, leader already at 0).
  const someHaveGap = standings.some(s => s.gap_to_leader !== null)
  if (someHaveGap && !leaderHasCrossedLine) {
    const missing = standings.filter(s => s.gap_to_leader === null)
    if (missing.length === 1) missing[0].gap_to_leader = 0
  }

  standings.sort((a, b) => {
    const ag = a.gap_to_leader
    const bg = b.gap_to_leader
    if (ag !== null && bg !== null) return ag - bg
    if (ag !== null) return -1
    if (bg !== null) return 1
    const ap = latestPos.get(a.driver_number) ?? Infinity
    const bp = latestPos.get(b.driver_number) ?? Infinity
    if (ap !== bp) return ap - bp
    return a.driver_number - b.driver_number
  })

  standings.forEach((s, i) => {
    s.position = i + 1
  })
  return standings
}

export function formatLapTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins > 0) return `${mins}:${secs.toFixed(3).padStart(6, '0')}`
  return secs.toFixed(3)
}

export function formatGap(gap: number | null): string {
  if (gap === null || gap === undefined) return '—'
  if (gap === 0) return 'LEADER'
  return `+${gap.toFixed(3)}`
}

export const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export function windDir(deg: number | null): string {
  if (deg === null) return ''
  return WIND_DIRS[Math.round(deg / 45) % 8]
}

export const FLAG_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  'YELLOW': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'YELLOW FLAG' },
  'DOUBLE YELLOW': { bg: 'bg-yellow-500/30', text: 'text-yellow-300', label: 'DOUBLE YELLOW' },
  'RED': { bg: 'bg-red-500/20', text: 'text-red-400', label: 'RED FLAG' },
  'SafetyCar': { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'SAFETY CAR' },
  'CHEQUERED': { bg: 'bg-white/10', text: 'text-white', label: 'CHEQUERED FLAG' },
}

export const MEDAL = ['\u{1F947}', '\u{1F948}', '\u{1F949}']

// Replay standings start as [] until replay info has loaded (e.g. no GPS data
// yet at the start of a live session), so an empty array must still fall back
// to live timing drivers.
export function pickStandingRows<T>(replayStandings: T[] | undefined, liveDrivers: T[]): T[] {
  return replayStandings && replayStandings.length > 0 ? replayStandings : liveDrivers
}
