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
//
// A retired (DNF) car's timing feed simply stops, freezing its last gap, so it
// would otherwise hold its on-track position forever. The final classification
// tells us *who* retired (info.dnf); the retirement *moment* is each driver's
// last timing event. Once the replay clock passes that, the car is "out": shown
// as DNF and sorted below every running car, later retirements ranked first.
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

  // Last sign of life per retired driver (their feed's final timestamp). Events
  // are sorted ascending, so the last write wins.
  const dnfSet = new Set(info.dnf ?? [])
  const lastSeen = new Map<number, number>()
  if (dnfSet.size > 0) {
    for (const e of info.interval_events ?? []) {
      if (dnfSet.has(e.n)) lastSeen.set(e.n, e.t)
    }
    for (const e of info.position_events ?? []) {
      if (dnfSet.has(e.n) && e.t > (lastSeen.get(e.n) ?? -Infinity)) lastSeen.set(e.n, e.t)
    }
  }

  const standings: ReplayStanding[] = Object.entries(info.drivers).map(([numStr, dInfo]) => {
    const num = Number(numStr)
    const iv = latestIv.get(num)
    const last = lastSeen.get(num)
    return {
      driver_number: num,
      abbreviation: dInfo.abbreviation,
      team_color: dInfo.team_color,
      position: 0,
      gap_to_leader: iv ? iv.g : null,
      interval: iv?.i ?? null,
      out: last !== undefined && currentTime > last,
    }
  })

  // Retired cars sort below everyone still running, later retirements first.
  const byRetirement = (a: ReplayStanding, b: ReplayStanding): number | null => {
    if (a.out !== b.out) return a.out ? 1 : -1
    if (a.out && b.out) {
      const at = lastSeen.get(a.driver_number) ?? 0
      const bt = lastSeen.get(b.driver_number) ?? 0
      if (at !== bt) return bt - at
      return a.driver_number - b.driver_number
    }
    return null
  }

  const running = standings.filter(s => !s.out)
  const grid = info.grid
  const hasGrid = !!grid && Object.keys(grid).length > 0
  const leaderHasCrossedLine = running.some(s => s.gap_to_leader === 0)

  if (hasGrid && !leaderHasCrossedLine) {
    // Opening lap: hold the starting grid until the leader first registers gap 0.
    standings.sort((a, b) => {
      const ret = byRetirement(a, b)
      if (ret !== null) return ret
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
  // Everyone else reports a gap to the leader, so if exactly one running driver
  // lacks a gap and nobody yet shows gap 0, that driver is the leader. This
  // deliberately does not fire once cars are lapped (multiple null gaps, leader
  // already at 0).
  const someHaveGap = running.some(s => s.gap_to_leader !== null)
  if (someHaveGap && !leaderHasCrossedLine) {
    const missing = running.filter(s => s.gap_to_leader === null)
    if (missing.length === 1) missing[0].gap_to_leader = 0
  }

  standings.sort((a, b) => {
    const ret = byRetirement(a, b)
    if (ret !== null) return ret
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
