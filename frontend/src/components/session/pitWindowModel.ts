// Heuristic tire-life model for the pit-window tracker. These are nominal max
// stint lengths (laps) per compound — not circuit-specific, just enough to show
// who is approaching their window.
export const NOMINAL_STINT_LAPS: Record<string, number> = {
  SOFT: 20,
  MEDIUM: 30,
  HARD: 40,
  INTERMEDIATE: 25,
  WET: 25,
}

const DEFAULT_STINT_LAPS = 30

export interface PitWindowEstimate {
  maxLaps: number
  remaining: number
  pct: number // 0..1 of stint consumed
}

export function pitWindowEstimate(compound: string, tireAge: number): PitWindowEstimate {
  const maxLaps = NOMINAL_STINT_LAPS[(compound || '').toUpperCase()] ?? DEFAULT_STINT_LAPS
  const age = Math.max(0, tireAge)
  const remaining = Math.max(0, maxLaps - age)
  const pct = Math.min(1, age / maxLaps)
  return { maxLaps, remaining, pct }
}
