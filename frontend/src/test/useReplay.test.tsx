import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useReplay } from '../hooks/useReplay'
import { api } from '../api/client'

vi.mock('../api/client', () => ({
  api: {
    getReplayInfo: vi.fn(),
    getReplayPositions: vi.fn().mockResolvedValue({ positions: [] }),
  },
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useReplay totalDuration', () => {
  it('extends past the last-lap cap to cover post-race radio clips', async () => {
    // Real-world case (Monaco GP 2026, session 11291-style): the session's
    // scheduled data_end (2h) undershoots the actual race, and team radio
    // keeps recording well after the last lap.
    vi.mocked(api.getReplayInfo).mockResolvedValue({
      data_start: '2026-05-24T20:00:00Z',
      data_end: '2026-05-24T22:00:00Z', // 7200s window
      is_live: false,
      lap_events: [{ t: 5809.8, lap: 68 }],
      radio_events: [
        { t: 5991.1, n: 12, url: 'a.mp3' },
        { t: 6299.3, n: 43, url: 'b.mp3' },
      ],
      drivers: {},
    } as never)

    const { result } = renderHook(() => useReplay(11291), { wrapper })

    await waitFor(() => expect(result.current.totalDuration).toBeGreaterThan(0))

    // Every radio clip must fall within the playable timeline.
    for (const r of result.current.radioEvents) {
      expect(r.t).toBeLessThanOrEqual(result.current.totalDuration)
    }
  })

  it('never truncates before the last lap, even if data_end undershoots it', async () => {
    vi.mocked(api.getReplayInfo).mockResolvedValue({
      data_start: '2026-06-07T13:00:00Z',
      data_end: '2026-06-07T15:00:00Z', // 7200s window, shorter than the race
      is_live: false,
      lap_events: [{ t: 8728.2, lap: 78 }],
      radio_events: [],
      drivers: {},
    } as never)

    const { result } = renderHook(() => useReplay(11299), { wrapper })

    await waitFor(() => expect(result.current.totalDuration).toBeGreaterThan(0))
    expect(result.current.totalDuration).toBeGreaterThanOrEqual(8728.2)
  })
})

describe('useReplay driversInPit', () => {
  it('treats the OpenF1 pit event timestamp as the exit moment, not entry', async () => {
    // Real pit records (verified against GPS position data): the "date" field
    // lands ~5s before the car's GPS shows it back on track, i.e. it marks the
    // pit-lane exit-line crossing. pit_duration is the full lane transit, so
    // real entry is date - duration, not date.
    vi.mocked(api.getReplayInfo).mockResolvedValue({
      data_start: '2026-07-05T15:00:00Z',
      data_end: '2026-07-05T16:00:00Z',
      is_live: false,
      lap_events: [{ t: 1010, lap: 1 }],
      radio_events: [],
      pit_events: [{ t: 1000, n: 55, d: 29.2, lap: 48 }],
      drivers: { '55': { abbreviation: 'SAI', team_color: '#fff' } },
    } as never)

    const { result } = renderHook(() => useReplay(11326), { wrapper })
    await waitFor(() => expect(result.current.totalDuration).toBeGreaterThan(0))

    // Mid-stop: entry (1000 - 29.2 = 970.8) < 985 < exit (1000)
    act(() => result.current.seek(985))
    expect(result.current.driversInPit.map(p => p.driver_number)).toContain(55)

    // At the recorded timestamp itself, the car has already left the pit lane.
    act(() => result.current.seek(1000))
    expect(result.current.driversInPit.map(p => p.driver_number)).not.toContain(55)

    // Before the real entry, the car hasn't pitted yet.
    act(() => result.current.seek(965))
    expect(result.current.driversInPit.map(p => p.driver_number)).not.toContain(55)
  })
})
