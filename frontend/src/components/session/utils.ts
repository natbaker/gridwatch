// ── Shared utilities for session components ─────────────────

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
