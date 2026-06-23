import { describe, it, expect } from 'vitest'
import { pitWindowEstimate, NOMINAL_STINT_LAPS } from '../components/session/pitWindow'
import { buildGapSeries } from '../components/session/gapSeries'
import { parseTimingEvent } from '../hooks/useLiveTimingStream'

describe('pitWindowEstimate', () => {
  it('estimates remaining laps from compound life', () => {
    const est = pitWindowEstimate('SOFT', 12)
    expect(est.maxLaps).toBe(NOMINAL_STINT_LAPS.SOFT)
    expect(est.remaining).toBe(NOMINAL_STINT_LAPS.SOFT - 12)
    expect(est.pct).toBeCloseTo(12 / NOMINAL_STINT_LAPS.SOFT)
  })

  it('clamps remaining at zero for over-aged tires', () => {
    const est = pitWindowEstimate('SOFT', 999)
    expect(est.remaining).toBe(0)
    expect(est.pct).toBe(1)
  })

  it('falls back to a default for unknown compounds', () => {
    const est = pitWindowEstimate('MYSTERY', 0)
    expect(est.maxLaps).toBe(30)
  })
})

describe('buildGapSeries', () => {
  const drivers = {
    '1': { abbreviation: 'VER', team_color: '#3671C6' },
    '44': { abbreviation: 'HAM', team_color: '#E80020' },
  }

  it('returns empty data when there are no lap events', () => {
    const events = [{ t: 0, n: 1, g: 0, i: 0 }]
    const { data, keys } = buildGapSeries(events, drivers, [])
    expect(data).toEqual([])
    expect(keys.map(k => k.abbreviation)).toEqual(['VER', 'HAM'])
  })

  it('snapshots latest gap per driver at each lap', () => {
    const events = [
      { t: 5, n: 1, g: 0, i: 0 },
      { t: 5, n: 44, g: 1.5, i: 1.5 },
      { t: 95, n: 44, g: 2.2, i: 0.7 },
    ]
    const lapEvents = [
      { t: 10, lap: 1 },
      { t: 100, lap: 2 },
    ]
    const { data } = buildGapSeries(events, drivers, lapEvents)
    expect(data[0]).toMatchObject({ lap: 1, VER: 0, HAM: 1.5 })
    expect(data[1]).toMatchObject({ lap: 2, VER: 0, HAM: 2.2 })
  })
})

describe('parseTimingEvent', () => {
  it('parses a valid JSON frame', () => {
    const parsed = parseTimingEvent('{"drivers":[],"session":null}')
    expect(parsed).not.toBeNull()
    expect(parsed?.drivers).toEqual([])
  })

  it('returns null for malformed data', () => {
    expect(parseTimingEvent('not json')).toBeNull()
  })
})
