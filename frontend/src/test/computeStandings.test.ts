import { describe, it, expect } from 'vitest'
import { computeStandings } from '../components/session/utils'
import type { ReplayInfo } from '../types'

function makeInfo(partial: Partial<ReplayInfo>): ReplayInfo {
  return {
    session_key: 0, session_name: '', circuit: '', is_live: false, data_start: '', data_end: '',
    track_path: '', mini_sectors: [], drivers: {}, position_events: [],
    interval_events: [], race_control: [], lap_events: [], pit_events: [],
    weather_events: [], sector_indices: [], corners: [], radio_events: [],
    ...partial,
  }
}

describe('computeStandings', () => {
  it('orders by gap-to-leader, with lapped cars at the bottom — never as phantom leaders', () => {
    // End-of-race scenario: HAM (#44) leads (gap 0). BOR (#5) is a lap down —
    // OpenF1 reports gap_to_leader "+1 LAP" which arrives as null. The old
    // `g ?? 0` coercion made BOR a co-leader; here a null gap sinks to the bottom.
    const info = makeInfo({
      drivers: {
        '5': { abbreviation: 'BOR', team_color: '52E252' },
        '44': { abbreviation: 'HAM', team_color: '27F4D2' },
        '16': { abbreviation: 'LEC', team_color: 'E8002D' },
      },
      interval_events: [
        { t: 100, n: 44, g: 0, i: 0 },
        { t: 100, n: 16, g: 6.25, i: 6.25 },
        { t: 100, n: 5, g: null, i: 2.9 }, // lapped: "+1 LAP" -> null
      ],
    })

    const standings = computeStandings(info, 200)

    expect(standings.map(s => s.driver_number)).toEqual([44, 16, 5])
    expect(standings[0].driver_number).toBe(44)
    expect(standings[0].position).toBe(1)
    const bor = standings.find(s => s.driver_number === 5)!
    expect(bor.position).toBe(3) // bottom, but still a displayed rank
    expect(bor.gap_to_leader).toBeNull()
  })

  it('keeps leaders ranked even when they are absent from the sparse position feed', () => {
    // The position feed only emits on a position *change*. Here the leaders
    // (RUS/HAM) hold station and never appear in it, while midfield cars that
    // shuffle do. They must still be ordered by gap, not dumped to the bottom.
    const info = makeInfo({
      drivers: {
        '63': { abbreviation: 'RUS', team_color: '27F4D2' },
        '44': { abbreviation: 'HAM', team_color: '27F4D2' },
        '4': { abbreviation: 'NOR', team_color: 'FF8000' },
        '81': { abbreviation: 'PIA', team_color: 'FF8000' },
        '1': { abbreviation: 'VER', team_color: '3671C6' },
      },
      // Only the two midfield cars that swapped places report positions
      position_events: [
        { t: 220, n: 1, p: 5 },
        { t: 220, n: 81, p: 4 },
      ],
      interval_events: [
        { t: 220, n: 63, g: 0, i: 0 },
        { t: 220, n: 44, g: 1.5, i: 1.5 },
        { t: 220, n: 4, g: 3.0, i: 1.5 },
        { t: 220, n: 81, g: 8.0, i: 5.0 },
        { t: 220, n: 1, g: 9.0, i: 1.0 },
      ],
    })

    const standings = computeStandings(info, 300)
    expect(standings.map(s => s.driver_number)).toEqual([63, 44, 4, 81, 1])
    expect(standings[0].abbreviation).toBe('RUS')
    expect(standings[0].position).toBe(1)
  })

  it('holds the starting grid order during the opening lap, before any gap-0 exists', () => {
    // Lap 1: gaps arrive one driver at a time. RUS leads from pole but has no
    // gap yet; without grid order he would thrash from the bottom up to P1. With
    // the grid, the order is stable from lights-out.
    const info = makeInfo({
      drivers: {
        '63': { abbreviation: 'RUS', team_color: '27F4D2' },
        '44': { abbreviation: 'HAM', team_color: '27F4D2' },
        '1': { abbreviation: 'VER', team_color: '3671C6' },
      },
      grid: { '63': 1, '44': 2, '1': 3 },
      interval_events: [
        // Only the chasers have been timed so far; RUS (leader) has no gap yet
        { t: 220, n: 44, g: 0.8, i: 0.8 },
        { t: 222, n: 1, g: 2.0, i: 1.2 },
      ],
    })

    const standings = computeStandings(info, 225)
    expect(standings.map(s => s.driver_number)).toEqual([63, 44, 1])
    expect(standings[0].abbreviation).toBe('RUS')
    expect(standings[0].position).toBe(1)
  })

  it('switches from grid order to gap order once the leader registers gap 0', () => {
    const info = makeInfo({
      drivers: {
        '63': { abbreviation: 'RUS', team_color: '27F4D2' },
        '44': { abbreviation: 'HAM', team_color: '27F4D2' },
        '1': { abbreviation: 'VER', team_color: '3671C6' },
      },
      grid: { '63': 1, '44': 2, '1': 3 },
      interval_events: [
        // VER has jumped HAM on track; leader RUS has now crossed the line (gap 0)
        { t: 300, n: 63, g: 0, i: 0 },
        { t: 300, n: 1, g: 1.5, i: 1.5 },
        { t: 300, n: 44, g: 3.0, i: 1.5 },
      ],
    })

    const standings = computeStandings(info, 350)
    // Gap order now, not grid order: VER (1.5) ahead of HAM (3.0)
    expect(standings.map(s => s.driver_number)).toEqual([63, 1, 44])
  })

  it('infers the leader on the opening lap when only they lack a gap', () => {
    // Lap 1: RUS leads but has no gap-to-leader record yet (feed omits it until
    // they next cross the line). Everyone else reports a gap to RUS. RUS must be
    // P1, not sunk to the bottom as a no-gap car.
    const info = makeInfo({
      drivers: {
        '63': { abbreviation: 'RUS', team_color: '27F4D2' },
        '44': { abbreviation: 'HAM', team_color: '27F4D2' },
        '12': { abbreviation: 'ANT', team_color: '27F4D2' },
      },
      interval_events: [
        { t: 220, n: 44, g: 0.8, i: 0.8 },
        { t: 220, n: 12, g: 2.1, i: 1.3 },
        // RUS (#63) has no record yet
      ],
    })

    const standings = computeStandings(info, 230)
    expect(standings[0].driver_number).toBe(63)
    expect(standings[0].position).toBe(1)
    expect(standings.map(s => s.driver_number)).toEqual([63, 44, 12])
  })

  it('does not infer a leader once cars are lapped (multiple null gaps)', () => {
    // End of race: leader already shows gap 0 and two cars are lapped (null).
    // The lapped cars must stay at the bottom, not get promoted as a "leader".
    const info = makeInfo({
      drivers: {
        '1': { abbreviation: 'VER', team_color: '3671C6' },
        '44': { abbreviation: 'HAM', team_color: '27F4D2' },
        '5': { abbreviation: 'BOR', team_color: '52E252' },
        '20': { abbreviation: 'MAG', team_color: 'B6BABD' },
      },
      interval_events: [
        { t: 100, n: 1, g: 0, i: 0 },
        { t: 100, n: 44, g: 5.0, i: 5.0 },
        { t: 100, n: 5, g: null, i: 2.0 },
        { t: 100, n: 20, g: null, i: 3.0 },
      ],
    })

    const standings = computeStandings(info, 200)
    expect(standings.map(s => s.driver_number)).toEqual([1, 44, 5, 20])
    expect(standings[0].driver_number).toBe(1)
  })

  it('uses only interval events at or before the current time', () => {
    const info = makeInfo({
      drivers: {
        '1': { abbreviation: 'VER', team_color: '3671C6' },
        '44': { abbreviation: 'HAM', team_color: '27F4D2' },
      },
      interval_events: [
        { t: 10, n: 1, g: 0, i: 0 },
        { t: 10, n: 44, g: 1.2, i: 1.2 },
        { t: 500, n: 44, g: 0, i: 0 }, // HAM takes the lead later — ignored at t=200
        { t: 500, n: 1, g: 1.2, i: 1.2 },
      ],
    })

    const standings = computeStandings(info, 200)
    expect(standings.map(s => s.driver_number)).toEqual([1, 44])
  })

  it('every row gets a sequential position, including no-gap cars at the start', () => {
    const info = makeInfo({
      drivers: {
        '1': { abbreviation: 'VER', team_color: '3671C6' },
        '44': { abbreviation: 'HAM', team_color: '27F4D2' },
        '16': { abbreviation: 'LEC', team_color: 'E8002D' },
      },
      interval_events: [
        { t: 10, n: 44, g: 2.5, i: 2.5 },
        { t: 10, n: 1, g: 0, i: 0 },
        { t: 10, n: 16, g: 1.0, i: 1.0 },
      ],
    })

    const standings = computeStandings(info, 200)
    expect(standings.map(s => s.driver_number)).toEqual([1, 16, 44])
    expect(standings.map(s => s.position)).toEqual([1, 2, 3])
  })

  it('marks a DNF driver as out once their feed stops, sinking them past running cars', () => {
    // SAI (#55) is running 3rd (gap 1.0, ahead of HAM) but retires at t=100 —
    // his interval feed stops. Without DNF handling his stale 1.0 gap keeps him
    // ahead of HAM forever. He must drop to the bottom and show as out instead.
    const info = makeInfo({
      drivers: {
        '1': { abbreviation: 'VER', team_color: '3671C6' },
        '44': { abbreviation: 'HAM', team_color: '27F4D2' },
        '55': { abbreviation: 'SAI', team_color: 'E8002D' },
      },
      dnf: [55],
      interval_events: [
        { t: 50, n: 1, g: 0, i: 0 },
        { t: 50, n: 44, g: 2.0, i: 2.0 },
        { t: 50, n: 55, g: 1.0, i: 1.0 },
        { t: 100, n: 1, g: 0, i: 0 },
        { t: 100, n: 44, g: 2.0, i: 2.0 },
        { t: 100, n: 55, g: 1.0, i: 1.0 }, // SAI's last sign of life
        { t: 200, n: 1, g: 0, i: 0 },
        { t: 200, n: 44, g: 2.0, i: 2.0 },
      ],
    })

    // Before retirement: SAI still has future events, ranked by his real gap
    const before = computeStandings(info, 60)
    expect(before.map(s => s.driver_number)).toEqual([1, 55, 44])
    expect(before.find(s => s.driver_number === 55)!.out).toBe(false)

    // After retirement: no more SAI events, so he is out and sinks to the bottom
    const after = computeStandings(info, 150)
    expect(after.map(s => s.driver_number)).toEqual([1, 44, 55])
    const sai = after.find(s => s.driver_number === 55)!
    expect(sai.out).toBe(true)
    expect(sai.position).toBe(3)
  })

  it('orders multiple retired drivers by who retired later', () => {
    // Two retirements: GAS (#10) stops at t=80, OCO (#31) soldiers on to t=160.
    // The later retirement is classified ahead of the earlier one.
    const info = makeInfo({
      drivers: {
        '1': { abbreviation: 'VER', team_color: '3671C6' },
        '10': { abbreviation: 'GAS', team_color: '0093CC' },
        '31': { abbreviation: 'OCO', team_color: '0093CC' },
      },
      dnf: [10, 31],
      interval_events: [
        { t: 80, n: 1, g: 0, i: 0 },
        { t: 80, n: 10, g: 5.0, i: 5.0 }, // GAS's last event
        { t: 160, n: 1, g: 0, i: 0 },
        { t: 160, n: 31, g: 9.0, i: 4.0 }, // OCO's last event
        { t: 300, n: 1, g: 0, i: 0 },
      ],
    })

    const standings = computeStandings(info, 350)
    expect(standings.map(s => s.driver_number)).toEqual([1, 31, 10])
    expect(standings.find(s => s.driver_number === 10)!.out).toBe(true)
    expect(standings.find(s => s.driver_number === 31)!.out).toBe(true)
  })

  it('breaks ties among no-gap cars using the position feed, then car number', () => {
    const info = makeInfo({
      drivers: {
        '5': { abbreviation: 'BOR', team_color: '52E252' },
        '1': { abbreviation: 'VER', team_color: '3671C6' },
        '20': { abbreviation: 'MAG', team_color: 'B6BABD' },
      },
      // Two lapped cars: BOR has a position-feed entry (P18), MAG has none
      position_events: [{ t: 10, n: 5, p: 18 }],
      interval_events: [
        { t: 10, n: 1, g: 0, i: 0 },
        { t: 10, n: 5, g: null, i: 2.9 },
        { t: 10, n: 20, g: null, i: 1.0 },
      ],
    })

    const standings = computeStandings(info, 200)
    // Leader first; then lapped BOR (has position) before lapped MAG (no position)
    expect(standings.map(s => s.driver_number)).toEqual([1, 5, 20])
  })
})
