export interface IntervalEvent {
  t: number
  n: number
  g: number | null
  i: number | null
}

export interface GapSeriesKey {
  n: number
  abbreviation: string
  color: string
}

export interface LapEvent {
  t: number
  lap: number
}

export interface GapSeries {
  data: Array<Record<string, number | null>>
  keys: GapSeriesKey[]
}

// Build a per-lap series of gap-to-leader. Lap events provide the time anchors;
// at each lap we snapshot every driver's latest known gap (carried forward).
// Keyed by abbreviation so it can feed a recharts multi-line chart, with `lap`
// as the x-axis.
export function buildGapSeries(
  events: IntervalEvent[],
  drivers: Record<string, { abbreviation: string; team_color: string }>,
  lapEvents: LapEvent[],
): GapSeries {
  const keys: GapSeriesKey[] = Object.entries(drivers).map(([n, d]) => ({
    n: Number(n),
    abbreviation: d.abbreviation,
    color: d.team_color,
  }))

  const data: Array<Record<string, number | null>> = []
  if (lapEvents.length === 0) return { data, keys }

  const sortedEvents = [...events].sort((a, b) => a.t - b.t)
  const sortedLaps = [...lapEvents].sort((a, b) => a.t - b.t)
  const last = new Map<number, number | null>()
  let i = 0
  for (const { t, lap } of sortedLaps) {
    while (i < sortedEvents.length && sortedEvents[i].t <= t) {
      last.set(sortedEvents[i].n, sortedEvents[i].g)
      i++
    }
    const point: Record<string, number | null> = { lap }
    for (const k of keys) {
      const g = last.get(k.n)
      point[k.abbreviation] = g === undefined ? null : g
    }
    data.push(point)
  }
  return { data, keys }
}
