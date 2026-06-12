import { describe, it, expect } from 'vitest'
import { formatLapTime, formatGap, windDir, pickStandingRows } from '../components/session/utils'

describe('formatLapTime', () => {
  it('returns dash for null', () => {
    expect(formatLapTime(null)).toBe('—')
  })

  it('formats sub-minute time as seconds only', () => {
    expect(formatLapTime(45.123)).toBe('45.123')
  })

  it('formats over-minute time with minutes prefix', () => {
    expect(formatLapTime(90.456)).toBe('1:30.456')
  })

  it('pads seconds with leading zero when < 10', () => {
    expect(formatLapTime(65.007)).toBe('1:05.007')
  })

  it('formats exactly 60s', () => {
    expect(formatLapTime(60.0)).toBe('1:00.000')
  })
})

describe('formatGap', () => {
  it('returns dash for null', () => {
    expect(formatGap(null)).toBe('—')
  })

  it('returns LEADER for gap=0', () => {
    expect(formatGap(0)).toBe('LEADER')
  })

  it('formats positive gap with + prefix', () => {
    expect(formatGap(3.456)).toBe('+3.456')
  })

  it('formats small gap to 3 decimal places', () => {
    expect(formatGap(0.1)).toBe('+0.100')
  })
})

describe('windDir', () => {
  it('returns empty string for null', () => {
    expect(windDir(null)).toBe('')
  })

  it('returns N for 0 degrees', () => {
    expect(windDir(0)).toBe('N')
  })

  it('returns E for 90 degrees', () => {
    expect(windDir(90)).toBe('E')
  })

  it('returns S for 180 degrees', () => {
    expect(windDir(180)).toBe('S')
  })

  it('returns W for 270 degrees', () => {
    expect(windDir(270)).toBe('W')
  })

  it('returns NE for 45 degrees', () => {
    expect(windDir(45)).toBe('NE')
  })

  it('returns N for 360 degrees (wraps)', () => {
    expect(windDir(360)).toBe('N')
  })
})

describe('pickStandingRows', () => {
  it('falls back to live drivers when replay standings is an empty array', () => {
    const liveDrivers = [{ driver_number: 1 }, { driver_number: 2 }]
    expect(pickStandingRows([], liveDrivers)).toBe(liveDrivers)
  })

  it('falls back to live drivers when replay standings is undefined', () => {
    const liveDrivers = [{ driver_number: 1 }]
    expect(pickStandingRows(undefined, liveDrivers)).toBe(liveDrivers)
  })

  it('uses replay standings when they have entries', () => {
    const replayStandings = [{ driver_number: 5 }]
    const liveDrivers = [{ driver_number: 1 }]
    expect(pickStandingRows(replayStandings, liveDrivers)).toBe(replayStandings)
  })
})
