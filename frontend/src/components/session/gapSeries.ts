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

export interface GapSeries {
  data: Array<Record<string, number | null>>
  keys: GapSeriesKey[]
}

// Bucket per-driver interval samples into a time series of gap-to-leader,
// carrying forward each driver's last known gap. Keyed by abbreviation so it
// can feed a recharts multi-line chart.
export function buildGapSeries(
  events: IntervalEvent[],
  drivers: Record<string, { abbreviation: string; team_color: string }>,
  bucketSeconds = 30,
): GapSeries {
  const keys: GapSeriesKey[] = Object.entries(drivers).map(([n, d]) => ({
    n: Number(n),
    abbreviation: d.abbreviation,
    color: d.team_color,
  }))

  const sorted = [...events].sort((a, b) => a.t - b.t)
  const data: Array<Record<string, number | null>> = []
  if (sorted.length === 0) return { data, keys }

  const last = new Map<number, number | null>()
  const maxT = sorted[sorted.length - 1].t
  let i = 0
  for (let b = 0; b <= maxT; b += bucketSeconds) {
    while (i < sorted.length && sorted[i].t <= b) {
      last.set(sorted[i].n, sorted[i].g)
      i++
    }
    const point: Record<string, number | null> = { t: b }
    for (const k of keys) {
      const g = last.get(k.n)
      point[k.abbreviation] = g === undefined ? null : g
    }
    data.push(point)
  }
  return { data, keys }
}
